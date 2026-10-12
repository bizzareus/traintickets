import { createHash, randomUUID } from 'crypto';
import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import type {
  SearchUsageDebitStatus,
  SearchUsageOutcome,
  SearchUsageSource,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isPrismaUniqueViolation } from '../common/prisma-errors';
import { Auth0Service } from './auth0.service';
import { hashIp, ipDisplay, resolveClientIp } from './ip.util';
import {
  FREE_SEARCHES_PER_IP,
  SEARCH_CREDITS_EXHAUSTED_CODE,
  SETTLE_BATCH_LIMIT,
} from './search-credits.constants';

export type SearchIdentity = {
  userId: string | null;
  ip: string;
  ipHash: string;
};

export type CreditBalance = SearchIdentity & {
  freeUsed: number;
  freeRemaining: number;
  paidBalance: number;
};

export type Admission = CreditBalance & {
  requestId: string;
  source: SearchUsageSource;
  replayed: boolean;
};

export type AdmitSearchInput = {
  req: Request;
  requestId?: string;
  trainNumber: string;
  from: string;
  to: string;
  date: string;
  classes?: string[];
  quota?: string;
};

const fingerprintOf = (parts: {
  trainNumber: string;
  from: string;
  to: string;
  date: string;
  classes: string[];
  quota: string;
}): string =>
  createHash('sha256')
    .update(
      [
        parts.trainNumber.toUpperCase(),
        parts.from.toUpperCase(),
        parts.to.toUpperCase(),
        parts.date,
        [...parts.classes]
          .map((c) => c.toUpperCase())
          .sort()
          .join(','),
        parts.quota.toUpperCase(),
      ].join('|'),
    )
    .digest('hex');

/** E.164-ish normalization; bare 10-digit Indian numbers assume +91. */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().replace(/[\s-]/g, '');
  if (/^\+\d{10,15}$/.test(v)) return v;
  if (/^\d{10}$/.test(v)) return `+91${v}`;
  if (/^91\d{10}$/.test(v)) return `+${v}`;
  return null;
}

/**
 * Credit admission + durable usage ledger. The request path only validates
 * the balance and persists a PENDING log; balance mutation happens in
 * settlePendingLogs (async worker + best-effort immediate settle).
 */
@Injectable()
export class SearchCreditsService {
  private readonly logger = new Logger(SearchCreditsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth0: Auth0Service,
  ) {}

  extractBearer(req: Request): string | null {
    const header = req.headers.authorization;
    if (typeof header !== 'string') return null;
    const [scheme, token] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : null;
  }

  /**
   * Resolve (and lazily provision) the DB user for a verified Auth0 token.
   * Null = anonymous visitor. Never merges into an unrelated account: lookup
   * is by auth0Sub first, then by verified phone only when that row has no
   * other owner.
   */
  async resolveUser(req: Request): Promise<{ userId: string } | null> {
    const token = this.extractBearer(req);
    if (!token) return null;
    const identity = await this.auth0.verifyAccessToken(token);
    if (!identity) return null;
    const bySub = await this.prisma.user.findUnique({
      where: { auth0Sub: identity.sub },
      select: { id: true, phone: true },
    });
    if (bySub) {
      // Lazy profile fill: passwordless-SMS access tokens don't carry the
      // phone claim, so fetch /userinfo once and cache it on the row.
      if (!bySub.phone) void this.fillProfile(token, bySub.id);
      return { userId: bySub.id };
    }
    // First sight: verify via /userinfo (Auth0 validates the token) so the
    // phone/email come from the provider, never from client input.
    const profile = await this.auth0.fetchUserProfile(token);
    if (!profile || profile.sub !== identity.sub) return null;
    const phone = normalizePhone(profile.phoneNumber);
    if (phone) {
      const candidates = await this.prisma.user.findMany({
        where: { phone, auth0Sub: null },
        select: { id: true, passwordHash: true },
        take: 2,
      });
      const unclaimed = candidates.filter((c) => c.passwordHash == null);
      if (unclaimed.length === 1) {
        await this.prisma.user.update({
          where: { id: unclaimed[0].id },
          data: {
            auth0Sub: identity.sub,
            phoneVerifiedAt: new Date(),
            email: profile.email ?? undefined,
          },
        });
        return { userId: unclaimed[0].id };
      }
    }
    const created = await this.prisma.user.create({
      data: {
        name: phone ?? 'Wallet User',
        email: profile.email ?? null,
        phone,
        phoneVerifiedAt: phone ? new Date() : null,
        auth0Sub: identity.sub,
        passwordHash: null,
      },
      select: { id: true },
    });
    return { userId: created.id };
  }

  private async fillProfile(token: string, userId: string): Promise<void> {
    try {
      const identity = await this.auth0.verifyAccessToken(token);
      if (!identity) return;
      const profile = await this.auth0.fetchUserProfile(token);
      if (!profile || profile.sub !== identity.sub) return;
      const phone = normalizePhone(profile.phoneNumber);
      if (!phone) return;
      await this.prisma.user.updateMany({
        where: { id: userId, phone: null },
        data: { phone, phoneVerifiedAt: new Date() },
      });
    } catch {
      // Best-effort enrichment; the wallet works without it.
    }
  }

  async identityFor(req: Request): Promise<SearchIdentity> {
    const ip = resolveClientIp(req);
    const user = await this.resolveUser(req);
    return { userId: user?.userId ?? null, ip, ipHash: hashIp(ip) };
  }

  async getBalance(req: Request): Promise<CreditBalance> {
    const identity = await this.identityFor(req);
    return this.balanceFor(identity);
  }

  private async balanceFor(identity: SearchIdentity): Promise<CreditBalance> {
    const [quota, wallet] = await Promise.all([
      this.prisma.searchIpQuota.findUnique({
        where: { ipHash: identity.ipHash },
        select: { freeUsed: true },
      }),
      identity.userId
        ? this.prisma.searchCreditWallet.findUnique({
            where: { userId: identity.userId },
            select: { balance: true },
          })
        : null,
    ]);
    const freeUsed = quota?.freeUsed ?? 0;
    return {
      ...identity,
      freeUsed,
      freeRemaining: Math.max(0, FREE_SEARCHES_PER_IP - freeUsed),
      paidBalance: wallet?.balance ?? 0,
    };
  }

  /**
   * Validate credits and durably log the admitted search. Throws 402 when
   * exhausted. Idempotent on requestId: transport retries replay the same
   * admission; a reused id with different search params is rejected (409).
   */
  async admitSearch(input: AdmitSearchInput): Promise<Admission> {
    const trainNumber = input.trainNumber.trim().toUpperCase();
    const from = input.from.trim().toUpperCase();
    const to = input.to.trim().toUpperCase();
    const date = input.date.trim();
    const classes = (input.classes ?? [])
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    const quota = (input.quota?.trim() || 'GN').toUpperCase();
    const requestId = input.requestId?.trim() || randomUUID();
    const fingerprint = fingerprintOf({
      trainNumber,
      from,
      to,
      date,
      classes,
      quota,
    });

    const balance = await this.getBalance(input.req);
    const replayed = await this.replayIfExists(requestId, fingerprint, balance);
    if (replayed) return replayed;

    const source: SearchUsageSource =
      balance.userId && balance.paidBalance > 0 ? 'PAID' : 'FREE';
    if (source === 'FREE' && balance.freeUsed >= FREE_SEARCHES_PER_IP) {
      throw new HttpException(
        {
          statusCode: 402,
          code: SEARCH_CREDITS_EXHAUSTED_CODE,
          message: `You've used your ${FREE_SEARCHES_PER_IP} free searches. Get 100 search credits for ₹100 — credits never expire.`,
          freeRemaining: 0,
          paidBalance: balance.paidBalance,
        },
        402,
      );
    }

    try {
      await this.prisma.searchUsageLog.create({
        data: {
          requestId,
          fingerprint,
          userId: balance.userId,
          ipHash: balance.ipHash,
          trainNumber,
          fromStation: from,
          toStation: to,
          journeyDate: date || null,
          classes,
          quota,
          source,
          outcome: 'PENDING',
          debitStatus: 'PENDING_DEBIT',
        },
      });
    } catch (err) {
      if (!isPrismaUniqueViolation(err)) throw err;
      const raced = await this.replayIfExists(requestId, fingerprint, balance);
      if (raced) return raced;
      throw err;
    }
    await this.prisma.searchIpQuota.upsert({
      where: { ipHash: balance.ipHash },
      create: {
        ipHash: balance.ipHash,
        ipDisplay: ipDisplay(balance.ip),
        freeUsed: 0,
      },
      update: {},
    });
    return { ...balance, requestId, source, replayed: false };
  }

  /** Mark a search finished. SUCCESS settles async; FAILED is never charged. */
  async completeSearch(
    requestId: string,
    outcome: SearchUsageOutcome,
    error?: string,
  ): Promise<void> {
    if (outcome !== 'SUCCESS' && outcome !== 'FAILED') return;
    try {
      await this.prisma.searchUsageLog.updateMany({
        where: { requestId, outcome: 'PENDING' },
        data: {
          outcome,
          error: error?.slice(0, 500) ?? null,
          completedAt: new Date(),
          ...(outcome === 'FAILED'
            ? { debitStatus: 'SKIPPED' as SearchUsageDebitStatus }
            : {}),
        },
      });
    } catch (err) {
      this.logger.warn(
        `completeSearch failed for ${requestId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    if (outcome === 'SUCCESS') void this.settleOne(requestId);
  }

  /** Settle one log; safe to call repeatedly (conditional transitions only). */
  async settleOne(requestId: string): Promise<void> {
    await this.settleWhere({ requestId });
  }

  /** Worker tick: settle oldest unsettled SUCCESS logs. Crash-recoverable. */
  async settlePendingLogs(limit = SETTLE_BATCH_LIMIT): Promise<{
    settled: number;
    skipped: number;
    overLimit: number;
  }> {
    const rows = await this.prisma.searchUsageLog.findMany({
      where: { outcome: 'SUCCESS', debitStatus: 'PENDING_DEBIT' },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Math.max(limit, 1), SETTLE_BATCH_LIMIT),
      select: { requestId: true },
    });
    let settled = 0;
    let skipped = 0;
    let overLimit = 0;
    for (const row of rows) {
      const outcome = await this.settleWhere({ requestId: row.requestId });
      if (outcome === 'SETTLED') settled += 1;
      else if (outcome === 'OVER_LIMIT_UNCHARGED') overLimit += 1;
      else skipped += 1;
    }
    return { settled, skipped, overLimit };
  }

  private async replayIfExists(
    requestId: string,
    fingerprint: string,
    balance: CreditBalance,
  ): Promise<Admission | null> {
    const existing = await this.prisma.searchUsageLog.findUnique({
      where: { requestId },
    });
    if (!existing) return null;
    if (existing.fingerprint !== fingerprint) {
      throw new ConflictException(
        'This search request ID was already used for a different search',
      );
    }
    return {
      ...balance,
      requestId,
      source: existing.source,
      replayed: true,
    };
  }

  private async settleWhere(where: {
    requestId: string;
  }): Promise<'SETTLED' | 'SKIPPED' | 'OVER_LIMIT_UNCHARGED' | 'NOT_FOUND'> {
    const log = await this.prisma.searchUsageLog.findUnique({ where });
    if (
      !log ||
      log.outcome !== 'SUCCESS' ||
      log.debitStatus !== 'PENDING_DEBIT'
    ) {
      return log ? 'SKIPPED' : 'NOT_FOUND';
    }
    if (log.source === 'FREE') {
      const updated = await this.prisma.searchUsageLog.updateMany({
        where: { requestId: log.requestId, debitStatus: 'PENDING_DEBIT' },
        data: { debitStatus: 'SETTLED' },
      });
      if (updated.count === 0) return 'SKIPPED';
      await this.prisma.searchIpQuota.upsert({
        where: { ipHash: log.ipHash },
        create: { ipHash: log.ipHash, freeUsed: 1 },
        update: { freeUsed: { increment: 1 } },
      });
      return 'SETTLED';
    }
    if (!log.userId) {
      await this.prisma.searchUsageLog.updateMany({
        where: { requestId: log.requestId, debitStatus: 'PENDING_DEBIT' },
        data: { debitStatus: 'SKIPPED', error: 'Paid source without user' },
      });
      return 'SKIPPED';
    }
    // Atomic guard: decrement only when balance remains, so concurrent
    // settlers can never drive the wallet negative.
    const decremented = await this.prisma.searchCreditWallet.updateMany({
      where: { userId: log.userId, balance: { gt: 0 } },
      data: { balance: { decrement: 1 } },
    });
    if (decremented.count === 1) {
      await this.prisma.searchUsageLog.updateMany({
        where: { requestId: log.requestId, debitStatus: 'PENDING_DEBIT' },
        data: { debitStatus: 'SETTLED' },
      });
      return 'SETTLED';
    }
    await this.prisma.searchUsageLog.updateMany({
      where: { requestId: log.requestId, debitStatus: 'PENDING_DEBIT' },
      data: { debitStatus: 'OVER_LIMIT_UNCHARGED' },
    });
    return 'OVER_LIMIT_UNCHARGED';
  }
}
