import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type IrctcCookieRecord = {
  cookie: string;
  updatedAt: string;
  source?: string;
};

const SINGLETON_ID = 'singleton';
/** How long a read is cached in-process before re-reading the shared row. */
const CACHE_TTL_MS = 15_000;

/**
 * Shared store for the IRCTC cookie bundle, backed by a single Postgres row
 * (`irctc_session`) so every process reads the same manually managed cookie.
 * IrctcService reads it for each protected request and falls back to the
 * IRCTC_COOKIES environment variable when the row is empty. Reads are cached
 * in-process for CACHE_TTL_MS to keep the DB off the hot path.
 */
@Injectable()
export class IrctcCookieStoreService {
  private readonly logger = new Logger(IrctcCookieStoreService.name);
  private cached: IrctcCookieRecord | null = null;
  private cachedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  /** Current cookie string: from the shared row if present, else the env var. */
  async getCookie(): Promise<string> {
    const rec = await this.getRecord();
    const fromDb = rec?.cookie?.trim();
    if (fromDb) return fromDb;
    return process.env.IRCTC_COOKIES?.trim() ?? '';
  }

  /** Full record (for status/diagnostics), or null when the row is empty. */
  async getRecord(): Promise<IrctcCookieRecord | null> {
    if (this.cached && Date.now() - this.cachedAt < CACHE_TTL_MS) {
      return this.cached;
    }
    try {
      const row = await this.prisma.irctcSession.findUnique({
        where: { id: SINGLETON_ID },
      });
      this.cached =
        row && row.cookie
          ? {
              cookie: row.cookie,
              updatedAt: (row.cookieUpdatedAt ?? row.createdAt).toISOString(),
              source: row.source ?? undefined,
            }
          : null;
      this.cachedAt = Date.now();
      return this.cached;
    } catch (e) {
      this.logger.warn(
        `[irctc-cookies] read failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return this.cached; // serve last-known on a transient DB blip
    }
  }

  /** Human-readable description of where the cookie lives (for status views). */
  location(): string {
    return 'postgres:irctc_session';
  }

  /** Persist a manually supplied cookie bundle. */
  async setCookie(cookie: string, meta?: { source?: string }): Promise<void> {
    const trimmed = cookie.trim();
    const now = new Date();
    await this.prisma.irctcSession.upsert({
      where: { id: SINGLETON_ID },
      update: { cookie: trimmed, source: meta?.source, cookieUpdatedAt: now },
      create: {
        id: SINGLETON_ID,
        cookie: trimmed,
        source: meta?.source,
        cookieUpdatedAt: now,
      },
    });
    this.cached = {
      cookie: trimmed,
      updatedAt: now.toISOString(),
      source: meta?.source,
    };
    this.cachedAt = Date.now();
    this.logger.log(
      `[irctc-cookies] wrote ${trimmed.length} chars source=${meta?.source ?? 'n/a'} -> irctc_session`,
    );
  }
}
