import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { verifyHmacSha256 } from '../common/webhook-signature';

@Controller('api/browser/webhook')
export class WebhookController {
  constructor(private prisma: PrismaService) {}

  @Post()
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: Record<string, unknown>,
  ) {
    const signature =
      (req.headers['x-webhook-signature'] as string) ??
      (req.headers['x-signature'] as string) ??
      undefined;
    const webhookSecret = process.env.BROWSER_USE_WEBHOOK_SECRET;
    if (!verifyHmacSha256(req.rawBody, signature, webhookSecret)) {
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
