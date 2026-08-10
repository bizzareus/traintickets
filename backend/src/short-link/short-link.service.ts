import { Injectable, NotFoundException } from '@nestjs/common';
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

@Injectable()
export class ShortLinkService {
  constructor(private readonly prisma: PrismaService) {}

  private generateCode(): string {
    return crypto.randomBytes(4).toString('hex').slice(0, 7);
  }

  async createAlertShortLink(
    payload: Omit<AlertShortLinkPayload, 'type'>,
  ): Promise<string> {
    const fullPayload: AlertShortLinkPayload = {
      type: 'chart_alert',
      ...payload,
    };

    let code = this.generateCode();
    for (let i = 0; i < 5; i++) {
      const existing = await this.prisma.shortLink.findUnique({
        where: { code },
      });
      if (!existing) break;
      code = this.generateCode();
    }

    const baseUrl = process.env.FRONTEND_URL || 'https://lastberth.com';
    const redirectUrl = `${baseUrl}/alerts/subscribe?trainNo=${encodeURIComponent(payload.trainNumber)}${payload.trainName ? `&trainName=${encodeURIComponent(payload.trainName)}` : ''}&from=${encodeURIComponent(payload.fromStationCode)}&to=${encodeURIComponent(payload.toStationCode)}&date=${encodeURIComponent(payload.journeyDate)}${payload.classCode ? `&class=${encodeURIComponent(payload.classCode)}` : ''}${payload.email ? `&email=${encodeURIComponent(payload.email)}` : ''}${payload.mobile ? `&mobile=${encodeURIComponent(payload.mobile)}` : ''}`;

    await this.prisma.shortLink.create({
      data: {
        code,
        url: redirectUrl,
        payload: fullPayload as object,
      },
    });

    return `${baseUrl}/s/${code}`;
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
}
