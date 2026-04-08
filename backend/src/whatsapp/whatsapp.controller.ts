import {
  Body,
  Controller,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { WhatsappService } from './whatsapp.service';
import * as crypto from 'crypto';

@Controller('api/whatsapp/webhook')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(private readonly whatsappService: WhatsappService) {}

  @Post()
  handleIncoming(@Req() req: Request, @Body() body: Record<string, any>) {
    // Optional basic webhook validation
    const secret = process.env.WASENDER_WEBHOOK_SECRET;
    if (secret) {
      const signature = req.headers['x-hub-signature-256'] as string;
      // if missing or not matching, handle error
      if (signature) {
        const raw = JSON.stringify(body);
        const expected = crypto
          .createHmac('sha256', secret)
          .update(raw)
          .digest('hex');
        if (
          !crypto.timingSafeEqual(
            Buffer.from(signature, 'utf8'),
            Buffer.from(`sha256=${expected}`, 'utf8'),
          )
        ) {
          throw new UnauthorizedException('Invalid signature');
        }
      }
    }

    try {
      this.logger.debug(
        'Received WA Webhook:',
        JSON.stringify(body).substring(0, 500),
      );
      // Parse payload - this is adapted for a generic 'wasenderapi' format
      // Typical format might be { event: "message", data: { text: "...", from: "123", group_id: "xyz" } }
      // Or Evolution API { data: { message: { conversation: "text" }, key: { remoteJid: "123@g.us", fromMe: false } } }

      let messageText = '';
      let sender = '';
      let groupId: string | undefined;
      let fromMe = false;

      // Extract based on most common wrapper structures. (We'll assume direct root fields or `data` wrapper)
      const data = (body.data as Record<string, any>) || body;

      // Determine what text is received
      messageText =
        (data.text as string) ||
        (data.message as string) ||
        (data.body as string) ||
        (data.message?.conversation as string) ||
        '';
      if (typeof messageText !== 'string') {
        const extendedText = data.message?.extendedTextMessage?.text as string;
        messageText = extendedText || '';
      }

      // Determine routing logic
      sender =
        (data.from as string) ||
        (data.sender as string) ||
        (data.key?.remoteJid as string) ||
        '';
      groupId = (data.group_id as string) || undefined;

      if (sender && sender.includes('@g.us')) {
        groupId = sender;
      }

      const fromMeVal = data.fromMe || data.key?.fromMe;
      fromMe = !!fromMeVal;

      // Anti-reflex
      if (fromMe) {
        return { ok: true, status: 'ignored' };
      }

      // Fire and forget so we don't hold the webhook connection open too long which causes retries
      if (messageText && sender) {
        this.whatsappService
          .handleIncomingMessage(sender, messageText, groupId)
          .catch((e: Error) => {
            this.logger.error('Error running WA background job', e);
          });
      }

      return { ok: true, received: true };
    } catch (e) {
      this.logger.error('Error handling WA webhook', e);
      return { ok: false };
    }
  }
}
