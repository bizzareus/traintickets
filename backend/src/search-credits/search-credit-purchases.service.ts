import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { isURL } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import {
  createMuzoboxClient,
  muzoboxAuthHeaders,
  type MuzoboxPaymentLink,
  type MuzoboxPaymentStatus,
} from '../common/muzobox-client';
import { SearchCreditsService, normalizePhone } from './search-credits.service';
import { hashIp, resolveClientIp } from './ip.util';
import {
  CREDIT_PACK_CURRENCY,
  CREDIT_PACK_PRICE_INR,
  CREDIT_PACK_QUANTITY,
} from './search-credits.constants';

const newPurchaseRef = (): string =>
  `SC-${Date.now().toString(36).toUpperCase()}${randomUUID().slice(0, 4).toUpperCase()}`;

/**
 * ₹100 / 100-credit pack checkout via the shared Muzobox proxy.
 * Browser callbacks/redirects are verification hints only; credits are
 * granted after server-to-server verification, atomically, exactly once.
 */
@Injectable()
export class SearchCreditPurchasesService {
  private readonly logger = new Logger(SearchCreditPurchasesService.name);
  private readonly muzobox: ReturnType<typeof createMuzoboxClient>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly credits: SearchCreditsService,
  ) {
    this.muzobox = createMuzoboxClient(config);
  }

  private async requireUserId(req: Request): Promise<string> {
    const user = await this.credits.resolveUser(req);
    if (!user) throw new UnauthorizedException('Sign in is required');
    return user.userId;
  }

  async createPurchase(
    req: Request,
    input: { contactEmail?: string; contactMobile?: string },
  ) {
    const userId = await this.requireUserId(req);
    const email = input.contactEmail?.trim() || null;
    const mobile = normalizePhone(input.contactMobile) || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Enter a valid email address');
    }
    // Idempotent checkout: reuse a recent pending link instead of minting
    // another one after an ambiguous client failure.
    const recent = await this.prisma.searchCreditPurchase.findFirst({
      where: {
        userId,
        status: 'PENDING',
        createdAt: { gte: new Date(Date.now() - 15 * 60_000) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent?.payUrl) {
      return this.toResponse(recent.payUrl, recent.purchaseRef);
    }

    const purchaseRef = newPurchaseRef();
    const purchase = await this.prisma.searchCreditPurchase.create({
      data: {
        purchaseRef,
        userId,
        originIpHash: hashIp(resolveClientIp(req)),
        amount: CREDIT_PACK_PRICE_INR,
        creditQuantity: CREDIT_PACK_QUANTITY,
        currency: CREDIT_PACK_CURRENCY,
        status: 'PENDING',
        contactEmail: email,
        contactMobile: mobile,
      },
    });

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { phone: true, email: true, name: true },
      });
      const apiUrl = this.config
        .get<string>('API_URL')
        ?.trim()
        .replace(/\/$/, '');
      const { data } = await this.muzobox.post<MuzoboxPaymentLink>(
        'proxy-payments/create-link',
        {
          amount: CREDIT_PACK_PRICE_INR,
          referenceId: purchaseRef,
          redirectUri: `search-credits/payment-complete?ref=${encodeURIComponent(purchaseRef)}`,
          callbackUrl: isURL(apiUrl ?? '', { require_protocol: true })
            ? `${apiUrl}/api/search-credits/muzobox-callback`
            : undefined,
          description: `LastBerth ${CREDIT_PACK_QUANTITY} search credits (introductory pack)`,
          customerName: user?.name?.trim() || 'LastBerth User',
          customerEmail: email ?? user?.email ?? undefined,
          customerMobile: mobile ?? user?.phone ?? undefined,
        },
        { headers: muzoboxAuthHeaders(this.config) },
      );
      if (
        !data?.id ||
        !data.payUrl ||
        data.amount !== CREDIT_PACK_PRICE_INR ||
        data.referenceId !== purchaseRef
      ) {
        throw new Error('Muzobox returned an invalid payment link');
      }
      const payUrl = new URL(data.payUrl, 'https://muzobox.com');
      if (!['https:', 'http:'].includes(payUrl.protocol)) {
        throw new Error('Muzobox returned an invalid payment URL');
      }
      await this.prisma.searchCreditPurchase.update({
        where: { id: purchase.id },
        data: {
          muzoboxPaymentId: data.id,
          payUrl: payUrl.href,
          razorpayOrderId: data.razorpayOrderId ?? null,
        },
      });
      return this.toResponse(payUrl.href, purchaseRef);
    } catch (error) {
      await this.prisma.searchCreditPurchase.update({
        where: { id: purchase.id },
        data: { status: 'FAILED' },
      });
      this.logger.error(
        `Muzobox checkout failed for ${purchaseRef}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException(
        'Payment system is currently unavailable. Please try again later.',
      );
    }
  }

  async getStatus(purchaseRef: string, req?: Request) {
    const purchase = await this.findPurchase(purchaseRef);
    if (req) await this.assertOwner(purchase.userId, req);
    if (purchase.status === 'PENDING' && purchase.muzoboxPaymentId) {
      return this.reverify(purchase);
    }
    return this.toStatus(purchase);
  }

  async verify(purchaseRef: string, req: Request) {
    const purchase = await this.findPurchase(purchaseRef);
    await this.assertOwner(purchase.userId, req);
    if (purchase.status === 'PENDING' && purchase.muzoboxPaymentId) {
      return this.reverify(purchase);
    }
    return this.toStatus(purchase);
  }

  /** Provider callbacks are hints: re-read the stored payment server-side. */
  async handleMuzoboxCallback(paymentId: string, purchaseRef: string) {
    const purchase = await this.findPurchase(purchaseRef);
    if (purchase.muzoboxPaymentId !== paymentId) {
      throw new BadRequestException('Payment does not match this purchase');
    }
    if (purchase.status !== 'PENDING') return { received: true };
    await this.reverify(purchase);
    return { received: true };
  }

  private async findPurchase(purchaseRef: string) {
    const purchase = await this.prisma.searchCreditPurchase.findUnique({
      where: { purchaseRef },
    });
    if (!purchase) throw new NotFoundException('Purchase not found');
    return purchase;
  }

  private async assertOwner(ownerUserId: string, req: Request) {
    const caller = await this.credits.resolveUser(req);
    if (!caller || caller.userId !== ownerUserId) {
      throw new UnauthorizedException(
        'This purchase belongs to another account',
      );
    }
  }

  private async reverify(
    purchase: Awaited<ReturnType<typeof this.findPurchase>>,
  ) {
    let remote: MuzoboxPaymentStatus;
    try {
      const response = await this.muzobox.get<MuzoboxPaymentStatus>(
        `proxy-payments/${encodeURIComponent(purchase.muzoboxPaymentId!)}/status`,
        { headers: muzoboxAuthHeaders(this.config) },
      );
      remote = response.data;
    } catch (error) {
      this.logger.warn(
        `Muzobox status check failed for ${purchase.purchaseRef}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return this.toStatus(purchase);
    }
    if (
      remote?.referenceId !== purchase.purchaseRef ||
      remote.amount !== CREDIT_PACK_PRICE_INR ||
      (purchase.razorpayOrderId &&
        remote.razorpayOrderId !== purchase.razorpayOrderId)
    ) {
      this.logger.warn(
        `Muzobox payment does not match purchase ${purchase.purchaseRef}`,
      );
      return this.toStatus(purchase);
    }
    if (remote.status === 'paid' && remote.razorpayPaymentId) {
      return this.grantCredits(purchase.id, remote.razorpayPaymentId);
    }
    if (remote.status === 'failed') {
      await this.prisma.searchCreditPurchase.updateMany({
        where: { id: purchase.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      return this.toStatus(await this.findPurchase(purchase.purchaseRef));
    }
    return this.toStatus(purchase);
  }

  /**
   * Atomically mark PAID and credit the wallet. Conditional update + unique
   * purchase row make duplicate callbacks/polling grant exactly once.
   */
  private async grantCredits(purchaseId: string, razorpayPaymentId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const purchase = await tx.searchCreditPurchase.findUnique({
        where: { id: purchaseId },
      });
      if (!purchase) throw new NotFoundException('Purchase not found');
      if (purchase.status === 'PAID')
        return { already: true as const, purchase };
      const claimed = await tx.searchCreditPurchase.updateMany({
        where: { id: purchaseId, status: 'PENDING' },
        data: {
          status: 'PAID',
          razorpayPaymentId,
          paidAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        return {
          already: true as const,
          purchase: await tx.searchCreditPurchase.findUniqueOrThrow({
            where: { id: purchaseId },
          }),
        };
      }
      await tx.searchCreditWallet.upsert({
        where: { userId: purchase.userId },
        create: {
          userId: purchase.userId,
          totalPurchased: purchase.creditQuantity,
          balance: purchase.creditQuantity,
        },
        update: {
          totalPurchased: { increment: purchase.creditQuantity },
          balance: { increment: purchase.creditQuantity },
        },
      });
      return {
        already: false as const,
        purchase: await tx.searchCreditPurchase.findUniqueOrThrow({
          where: { id: purchaseId },
        }),
      };
    });
    return this.toStatus(result.purchase);
  }

  private toResponse(payUrl: string, purchaseRef: string) {
    return {
      purchaseRef,
      payUrl,
      amount: CREDIT_PACK_PRICE_INR,
      credits: CREDIT_PACK_QUANTITY,
      currency: CREDIT_PACK_CURRENCY,
    };
  }

  private async toStatus(
    purchase: Awaited<ReturnType<typeof this.findPurchase>>,
  ) {
    const wallet = await this.prisma.searchCreditWallet.findUnique({
      where: { userId: purchase.userId },
      select: { balance: true, totalPurchased: true },
    });
    return {
      purchaseRef: purchase.purchaseRef,
      status: purchase.status,
      amount: purchase.amount,
      credits: purchase.creditQuantity,
      paidAt: purchase.paidAt?.toISOString() ?? null,
      balance: wallet?.balance ?? 0,
      totalPurchased: wallet?.totalPurchased ?? 0,
    };
  }
}
