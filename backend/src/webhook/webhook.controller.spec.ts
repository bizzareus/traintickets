import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import * as crypto from 'crypto';
import { WebhookController } from './webhook.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('WebhookController', () => {
  let controller: WebhookController;
  const originalSecret = process.env.BROWSER_USE_WEBHOOK_SECRET;

  const mockPrismaService = {
    availabilityCheck: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    process.env.BROWSER_USE_WEBHOOK_SECRET = 'test-webhook-secret';

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [{ provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    controller = module.get<WebhookController>(WebhookController);
  });

  afterEach(() => {
    process.env.BROWSER_USE_WEBHOOK_SECRET = originalSecret;
    jest.clearAllMocks();
  });

  it('throws UnauthorizedException when signature length is mismatched/invalid', async () => {
    const req = {
      headers: { 'x-webhook-signature': 'invalid-short-sig' },
    } as unknown as Request;
    const body = { status: 'success', job_id: 'job-1' };

    await expect(controller.handle(req, body)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('accepts valid HMAC signature', async () => {
    const body = { status: 'success', job_id: 'job-1' };
    const raw = JSON.stringify(body);
    const validSignature = crypto
      .createHmac('sha256', 'test-webhook-secret')
      .update(raw)
      .digest('hex');

    const req = {
      headers: { 'x-webhook-signature': validSignature },
    } as unknown as Request;

    mockPrismaService.availabilityCheck.findUnique.mockResolvedValue(null);

    const result = await controller.handle(req, body);
    expect(result).toEqual({ ok: true });
  });
});
