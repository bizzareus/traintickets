import { Controller, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { Webhook } from 'svix';
import type { EmailBouncedEvent } from 'resend';
import { ResendWebhookService } from './resend-webhook.service';

@Controller('api/webhooks/resend')
@SkipThrottle({ global: true })
export class ResendWebhookController {
  constructor(private readonly bounceRefunds: ResendWebhookService) {}

  /**
   * Resend webhook endpoint (svix-signed; add this URL in the Resend
   * dashboard). Verifies the signature over the raw body — this requires
   * `rawBody: true` in main.ts — acknowledges non-bounce events, and routes
   * `email.bounced` to the chart-alert auto-refund flow. Retryable failures
   * propagate so Resend retries the delivery.
   */
  @Post()
  async handleEvent(
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: true; outcome?: string }> {
    const event = this.verifySignature(
      req.rawBody ?? Buffer.alloc(0),
      req.headers,
    );
    if (event?.type !== 'email.bounced') return { received: true };

    const result = await this.bounceRefunds.handleBounce(event);
    return { received: true, outcome: result.outcome };
  }

  /** svix `Webhook.verify` parses the payload, so it doubles as JSON decoding. */
  private verifySignature(
    rawBody: Buffer,
    headers: Request['headers'],
  ): EmailBouncedEvent | null {
    const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
    if (!secret) {
      throw new UnauthorizedException(
        'Resend webhook secret is not configured',
      );
    }
    try {
      return new Webhook(secret).verify(
        rawBody,
        headers as unknown as Record<string, string>,
      ) as EmailBouncedEvent;
    } catch {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }
}
