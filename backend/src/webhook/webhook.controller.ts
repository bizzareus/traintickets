import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const WEBHOOK_SECRET = process.env.BROWSER_USE_WEBHOOK_SECRET;

function validateSignature(payload: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET || !signature) return false;
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'utf8'),
    Buffer.from(expected, 'utf8'),
  );
}

@Controller('api/browser/webhook')
export class WebhookController {
  constructor(private prisma: PrismaService) {}

  @Post()
  async handle(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const raw = JSON.stringify(body);
    const signature =
      (req.headers['x-webhook-signature'] as string) ??
      (req.headers['x-signature'] as string) ??
      null;
    if (WEBHOOK_SECRET && !validateSignature(raw, signature)) {
      throw new UnauthorizedException('Invalid signature');
    }

    const status = body.status as string;
    const jobId =
      (body.job_id as string) ?? (body as { job_id?: string }).job_id;
    if (!jobId) return { error: 'job_id required' };

    const availabilityCheck = await this.prisma.availabilityCheck.findUnique({
      where: { jobId },
    });
    if (availabilityCheck && availabilityCheck.status === 'running') {
      const successStatuses = ['seat_available', 'success', 'completed'];
      const isSuccess = successStatuses.includes(String(status));
      await this.prisma.availabilityCheck.update({
        where: { id: availabilityCheck.id },
        data: {
          status: isSuccess ? 'success' : 'failed',
          resultPayload: body as object,
          completedAt: new Date(),
        },
      });
    }

    return { ok: true };
  }
}
