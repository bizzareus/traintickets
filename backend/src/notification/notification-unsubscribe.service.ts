import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface UnsubscribeListEntry {
  id: string;
  recipient: string;
  channel: string;
  reason: string | null;
  createdAt: Date;
}

@Injectable()
export class NotificationUnsubscribeService {
  private readonly logger = new Logger(NotificationUnsubscribeService.name);

  private normalize(recipient: string): string {
    return recipient.trim().toLowerCase();
  }

  constructor(private readonly prisma: PrismaService) {}

  async isUnsubscribed(recipient: string): Promise<boolean> {
    const row = await this.prisma.notificationUnsubscribe.findUnique({
      where: { recipient: this.normalize(recipient) },
      select: { channel: true },
    });
    return !!row;
  }

  async unsubscribe(recipient: string, reason?: string): Promise<void> {
    const normalized = this.normalize(recipient);
    await this.prisma.notificationUnsubscribe.upsert({
      where: { recipient: normalized },
      create: { recipient: normalized, reason },
      update: { reason, channel: 'all' },
    });
    this.logger.log(`[unsubscribe] ${normalized} unsubscribed`);
  }

  async resubscribe(recipient: string): Promise<void> {
    const normalized = this.normalize(recipient);
    const deleted = await this.prisma.notificationUnsubscribe.deleteMany({
      where: { recipient: normalized },
    });
    if (deleted.count > 0) {
      this.logger.log(`[resubscribe] ${normalized} re-subscribed`);
    }
  }

  /** Admin: list all unsubscribed recipients, newest first. */
  async list(): Promise<UnsubscribeListEntry[]> {
    return this.prisma.notificationUnsubscribe.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        recipient: true,
        channel: true,
        reason: true,
        createdAt: true,
      },
    });
  }

  /** Admin: remove a single unsubscribe row by its id. */
  async removeById(id: string): Promise<{ removed: boolean }> {
    const deleted = await this.prisma.notificationUnsubscribe.deleteMany({
      where: { id },
    });
    if (deleted.count > 0) {
      this.logger.log(`[admin] unsubscribe row ${id} removed`);
    }
    return { removed: deleted.count > 0 };
  }
}
