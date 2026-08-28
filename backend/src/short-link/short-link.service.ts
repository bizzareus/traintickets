import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

export type AlertShortLinkPayload = {
  type: 'chart_alert';
  trainNumber: string;
  trainName?: string;
  fromStationCode: string;
  toStationCode: string;
  journeyDate: string;
  classCode?: string;
  email?: string;
  mobile?: string;
};

export type SearchShortLinkPayload = {
  type: 'search_redirect';
  from: string;
  to: string;
  date: string;
  trainNo?: string;
  channel?: 'whatsapp' | 'email';
  recipient?: string;
  [key: string]: unknown;
};

export type ShortLinkClickMeta = {
  userAgent?: string;
  ipAddress?: string;
  referer?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class ShortLinkService {
  private readonly logger = new Logger(ShortLinkService.name);

  constructor(private readonly prisma: PrismaService) {}

  private generateCode(): string {
    return crypto.randomBytes(4).toString('hex').slice(0, 7);
  }

  /**
   * Creates a tracked short URL pointing to an arbitrary destination URL.
   */
  async createShortLink(params: {
    url: string;
    payload?: Record<string, unknown>;
    expiresAt?: Date;
  }): Promise<string> {
    const { url, payload, expiresAt } = params;
    let code = this.generateCode();
    for (let i = 0; i < 5; i++) {
      const existing = await this.prisma.shortLink.findUnique({
        where: { code },
      });
      if (!existing) break;
      code = this.generateCode();
    }

    const baseUrl = process.env.FRONTEND_URL || 'https://lastberth.com';

    await this.prisma.shortLink.create({
      data: {
        code,
        url,
        payload: (payload ?? {}) as object,
        expiresAt,
      },
    });

    return `${baseUrl}/s/${code}`;
  }

  /**
   * Creates a tracked short link for LastBerth train search pages.
   */
  async createSearchShortLink(params: {
    from: string;
    to: string;
    date: string;
    trainNo?: string;
    channel?: 'whatsapp' | 'email';
    recipient?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const baseUrl = process.env.FRONTEND_URL || 'https://lastberth.com';
    const query = new URLSearchParams({
      from: params.from.trim().toUpperCase(),
      to: params.to.trim().toUpperCase(),
      date: params.date.trim(),
    });
    if (params.trainNo?.trim()) {
      query.set('trainNo', params.trainNo.trim());
    }

    const redirectUrl = `${baseUrl}/search?${query.toString()}`;
    const payload: SearchShortLinkPayload = {
      type: 'search_redirect',
      from: params.from,
      to: params.to,
      date: params.date,
      trainNo: params.trainNo,
      channel: params.channel,
      recipient: params.recipient,
      ...params.metadata,
    };

    return this.createShortLink({ url: redirectUrl, payload });
  }

  async createAlertShortLink(
    payload: Omit<AlertShortLinkPayload, 'type'>,
  ): Promise<string> {
    const fullPayload: AlertShortLinkPayload = {
      type: 'chart_alert',
      ...payload,
    };

    const baseUrl = process.env.FRONTEND_URL || 'https://lastberth.com';
    const query = new URLSearchParams({
      trainNo: payload.trainNumber,
      from: payload.fromStationCode,
      to: payload.toStationCode,
      date: payload.journeyDate,
    });
    if (payload.trainName) query.set('trainName', payload.trainName);
    if (payload.classCode) query.set('class', payload.classCode);
    if (payload.email) query.set('email', payload.email);
    if (payload.mobile) query.set('mobile', payload.mobile);

    const redirectUrl = `${baseUrl}/alerts/subscribe?${query.toString()}`;
    return this.createShortLink({ url: redirectUrl, payload: fullPayload });
  }

  async getShortLink(code: string) {
    const link = await this.prisma.shortLink.findUnique({
      where: { code },
    });
    if (!link) {
      throw new NotFoundException('Short link not found');
    }
    return link;
  }

  /**
   * Resolves a short link and records the click event in the database.
   */
  async recordClick(code: string, meta?: ShortLinkClickMeta) {
    const link = await this.prisma.shortLink.findUnique({
      where: { code },
    });
    if (!link) {
      throw new NotFoundException('Short link not found');
    }

    const now = new Date();
    const cleanIp = meta?.ipAddress
      ? String(meta.ipAddress).split(',')[0].trim()
      : undefined;

    try {
      const [updatedLink] = await this.prisma.$transaction([
        this.prisma.shortLink.update({
          where: { id: link.id },
          data: {
            clickCount: { increment: 1 },
            lastClickedAt: now,
          },
        }),
        this.prisma.shortLinkClick.create({
          data: {
            shortLinkId: link.id,
            clickedAt: now,
            userAgent: meta?.userAgent?.slice(0, 500),
            ipAddress: cleanIp?.slice(0, 100),
            referer: meta?.referer?.slice(0, 500),
            metadata: (meta?.metadata ?? {}) as object,
          },
        }),
      ]);

      return updatedLink;
    } catch (err) {
      this.logger.warn(
        `Failed to record click for short link ${code}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return link;
    }
  }
}
