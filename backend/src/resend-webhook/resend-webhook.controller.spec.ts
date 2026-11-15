import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { RawBodyRequest } from '@nestjs/common';
import { Webhook } from 'svix';
import { ResendWebhookController } from './resend-webhook.controller';
import { ResendWebhookService } from './resend-webhook.service';

describe('ResendWebhookController', () => {
  let controller: ResendWebhookController;
  const originalSecret = process.env.RESEND_WEBHOOK_SECRET;
  const secret = `whsec_${Buffer.from('test-secret').toString('base64')}`;
  const bounceRefunds = { handleBounce: jest.fn() };

  /** Sign a payload the way Resend (svix) does and build the request. */
  function signedRequest(
    payload: unknown,
    secretKey = secret,
  ): {
    req: RawBodyRequest<Request>;
    raw: string;
  } {
    const raw = JSON.stringify(payload);
    const id = 'msg_1';
    const signature = new Webhook(secretKey).sign(id, new Date(), raw);
    return {
      raw,
      req: {
        headers: {
          'svix-id': id,
          'svix-timestamp': String(Math.floor(Date.now() / 1000)),
          'svix-signature': signature,
        },
        rawBody: Buffer.from(raw),
      } as unknown as RawBodyRequest<Request>,
    };
  }

  const bounceEvent = {
    type: 'email.bounced',
    created_at: new Date().toISOString(),
    data: {
      created_at: new Date().toISOString(),
      email_id: '01a1d55a-e77f-7247-8759-93303ba428fc',
      from: 'LastBerth Notifications <notification@lastberth.com>',
      to: ['clement85chettiar@gmail.con'],
      subject: '🔔 Chart Alert Confirmed: Ltt Karaikal Exp (11017)',
      bounce: {
        message: 'general bounce',
        subType: 'General',
        type: 'Transient',
      },
    },
  };

  beforeEach(async () => {
    process.env.RESEND_WEBHOOK_SECRET = secret;
    bounceRefunds.handleBounce.mockResolvedValue({
      outcome: 'refunded',
      journeys: ['journey-1'],
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ResendWebhookController],
      providers: [{ provide: ResendWebhookService, useValue: bounceRefunds }],
    }).compile();

    controller = module.get<ResendWebhookController>(ResendWebhookController);
  });

  afterEach(() => {
    process.env.RESEND_WEBHOOK_SECRET = originalSecret;
    jest.clearAllMocks();
  });

  it('throws UnauthorizedException when the secret is not configured', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const { req } = signedRequest(bounceEvent);

    await expect(controller.handleEvent(req)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException on a bad signature', async () => {
    const { raw, req } = signedRequest(bounceEvent);
    req.rawBody = Buffer.from(`${raw} `); // tampered body

    await expect(controller.handleEvent(req)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(bounceRefunds.handleBounce).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when the signature header is missing', async () => {
    const { req } = signedRequest(bounceEvent);
    delete (req.headers as Record<string, string>)['svix-signature'];

    await expect(controller.handleEvent(req)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('accepts a valid signature and routes bounced events to the refund flow', async () => {
    const { req } = signedRequest(bounceEvent);

    await expect(controller.handleEvent(req)).resolves.toEqual({
      received: true,
      outcome: 'refunded',
    });
    expect(bounceRefunds.handleBounce).toHaveBeenCalledTimes(1);
    expect(bounceRefunds.handleBounce).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'email.bounced',
        data: expect.objectContaining({
          to: ['clement85chettiar@gmail.con'],
        }),
      }),
    );
  });

  it('acknowledges non-bounce events without processing them', async () => {
    const { req } = signedRequest({ ...bounceEvent, type: 'email.delivered' });

    await expect(controller.handleEvent(req)).resolves.toEqual({
      received: true,
    });
    expect(bounceRefunds.handleBounce).not.toHaveBeenCalled();
  });
});
