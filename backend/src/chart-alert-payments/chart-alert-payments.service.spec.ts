import { Test, TestingModule } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CHART_ALERT_PRICES_FLAG_KEY,
  ChartAlertPaymentsService,
  chartAlertPriceForClass,
  parseChartAlertPriceOverrides,
} from './chart-alert-payments.service';
import { RazorpayClient } from './razorpay.client';
import { PrismaService } from '../prisma/prisma.service';
import { JourneyTaskService } from '../availability/journey-task.service';
import { NotificationService } from '../notification/notification.service';
import { PostHogAnalyticsService } from '../common/posthog-analytics.service';
import * as sentryReport from '../common/sentry-report';

describe('ChartAlertPaymentsService', () => {
  let service: ChartAlertPaymentsService;
  let prisma: Record<string, any>;
  let journeyTask: Record<string, any>;
  let razorpay: Record<
    | 'createOrder'
    | 'createUpiQr'
    | 'resolveQrIntents'
    | 'orderPayments'
    | 'fetchPayment'
    | 'createRefund',
    jest.Mock
  > & { isConfigured: boolean; webhookSecret: string };
  let notificationService: Record<string, jest.Mock>;
  let posthog: Record<string, jest.Mock>;

  const baseInput = {
    trainNumber: '12639',
    fromStationCode: 'MAS',
    toStationCode: 'SBC',
    journeyDate: '2026-10-01',
    classCode: '3A',
    email: 'a@example.com',
    trainStartDate: '2026-10-01',
    chartTimeLocal: '19:08',
    chartOneDayOffset: 0,
    chartTwoTimeLocal: '05:35',
    chartTwoDayOffset: 1,
  };

  const appsFor = (ref: string) => ({
    upiIntent: `upi://pay?pa=merchant@upi&am=25&cu=INR&tn=${ref}&tr=${ref}`,
    gpayIntent: `tez://upi/pay?pa=merchant@upi&am=25&cu=INR&tn=${ref}&tr=${ref}`,
    phonepeIntent: `phonepe://pay?pa=merchant@upi&am=25&cu=INR&tn=${ref}&tr=${ref}`,
  });

  beforeEach(async () => {
    prisma = {
      chartAlertPayment: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
      },
      chartTimeAvailabilityTask: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    journeyTask = {
      queueJourneyMonitoring: jest.fn(),
      queueChartPreparedMonitoring: jest.fn(),
      validateJourneyForMonitoring: jest
        .fn()
        .mockResolvedValue({ valid: true }),
    };
    razorpay = {
      isConfigured: true,
      webhookSecret: 'whsec-test',
      createOrder: jest.fn(),
      createUpiQr: jest.fn(),
      resolveQrIntents: jest.fn(),
      orderPayments: jest.fn(),
      fetchPayment: jest.fn(),
      createRefund: jest.fn(),
    };
    notificationService = {
      sendChartAlertConfirmation: jest
        .fn()
        .mockResolvedValue({ emailSent: true, whatsappSent: true }),
    };
    posthog = {
      getFeatureFlagPayload: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChartAlertPaymentsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((k: string) => {
              if (k === 'MUZOBOX_API_URL')
                return 'https://ai-jukebox-backend-production.up.railway.app/api';
              return null;
            }),
          },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: JourneyTaskService, useValue: journeyTask },
        { provide: RazorpayClient, useValue: razorpay },
        { provide: NotificationService, useValue: notificationService },
        { provide: PostHogAnalyticsService, useValue: posthog },
      ],
    }).compile();

    service = module.get(ChartAlertPaymentsService);
  });

  describe('createPaymentLink', () => {
    it('rejects impossible dates before charging, including no-destination alerts', async () => {
      await expect(
        service.createPaymentLink({
          ...baseInput,
          toStationCode: '',
          journeyDate: '2026-02-30',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.chartAlertPayment.create).not.toHaveBeenCalled();
    });

    it.each([
      { chartTimeLocal: undefined },
      { chartTwoTimeLocal: '25:00' },
      { chartTwoDayOffset: 0 },
    ])(
      'rejects an invalid schedule before creating a payment or charging: %j',
      async (invalid) => {
        await expect(
          service.createPaymentLink({ ...baseInput, ...invalid }),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.chartAlertPayment.create).not.toHaveBeenCalled();
        expect(razorpay.createOrder).not.toHaveBeenCalled();
      },
    );

    it('creates a Razorpay order + QR and returns own-checkout data', async () => {
      prisma.chartAlertPayment.create.mockResolvedValue({ id: 'ref-1' });
      razorpay.createOrder.mockResolvedValue({ id: 'order-1', amount: 10000 });
      razorpay.createUpiQr.mockResolvedValue({
        id: 'qr-1',
        imageUrl: 'https://rzp.test/qr-1.png',
      });
      razorpay.resolveQrIntents.mockResolvedValue({
        intent: appsFor('ref-1').upiIntent,
        apps: appsFor('ref-1'),
      });
      prisma.chartAlertPayment.update.mockResolvedValue({});

      const out = await service.createPaymentLink({ ...baseInput });

      expect(prisma.chartAlertPayment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          journeyPayload: expect.objectContaining(baseInput),
        }),
      });

      expect(razorpay.createOrder).toHaveBeenCalledWith({
        amountPaise: 10000,
        receipt: 'ref-1',
        notes: { chart_alert_ref: 'ref-1' },
      });
      expect(razorpay.createUpiQr).toHaveBeenCalledWith(
        expect.objectContaining({
          amountPaise: 10000,
          notes: { chart_alert_ref: 'ref-1' },
        }),
      );
      expect(out).toEqual({
        ref: 'ref-1',
        amount: 100,
        orderId: 'order-1',
        qrImageUrl: 'https://rzp.test/qr-1.png',
        ...appsFor('ref-1'),
      });
      expect(prisma.chartAlertPayment.update).toHaveBeenCalledWith({
        where: { id: 'ref-1' },
        data: { razorpayOrderId: 'order-1' },
      });
    });

    it('degrades to QR-image-only when intent decode fails', async () => {
      prisma.chartAlertPayment.create.mockResolvedValue({ id: 'ref-2' });
      razorpay.createOrder.mockResolvedValue({ id: 'order-2', amount: 10000 });
      razorpay.createUpiQr.mockResolvedValue({
        id: 'qr-2',
        imageUrl: 'https://rzp.test/qr-2.png',
      });
      razorpay.resolveQrIntents.mockResolvedValue({
        intent: null,
        apps: null,
      });
      prisma.chartAlertPayment.update.mockResolvedValue({});

      const out = await service.createPaymentLink({ ...baseInput });

      expect(out.qrImageUrl).toBe('https://rzp.test/qr-2.png');
      expect(out.upiIntent).toBeUndefined();
    });

    it('throws 503 without leaving a usable link when payment systems fail', async () => {
      const sentrySpy = jest.spyOn(sentryReport, 'captureSentryException');
      prisma.chartAlertPayment.create.mockResolvedValue({ id: 'ref-3' });
      razorpay.createOrder.mockRejectedValue(new Error('razorpay down'));
      (service as any).muzoboxClient.post = jest
        .fn()
        .mockRejectedValue(new Error('muzobox down'));

      await expect(service.createPaymentLink({ ...baseInput })).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(prisma.chartAlertPayment.update).toHaveBeenCalledWith({
        where: { id: 'ref-3' },
        data: { status: 'FAILED' },
      });
      expect(sentrySpy).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: {
            area: 'chart-alert-payments',
            service: 'muzobox',
          },
        }),
      );
      sentrySpy.mockRestore();
    });

    it('uses Muzobox proxy when direct Razorpay is not configured', async () => {
      razorpay.isConfigured = false;
      prisma.chartAlertPayment.create.mockResolvedValue({ id: 'ref-mb-1' });
      prisma.chartAlertPayment.update.mockResolvedValue({});
      (service as any).muzoboxClient.post = jest.fn().mockResolvedValue({
        data: {
          id: 'mb_123',
          amount: 100,
          payUrl: 'https://muzobox.com/pay/mb_123',
          razorpayOrderId: 'order_mb_123',
        },
      });

      const out = await service.createPaymentLink({ ...baseInput });

      expect((service as any).muzoboxClient.post).toHaveBeenCalledWith(
        'proxy-payments/create-link',
        expect.objectContaining({
          amount: 100,
          referenceId: 'ref-mb-1',
        }),
        expect.any(Object),
      );
      expect(out.ref).toBe('ref-mb-1');
      expect(out.payUrl).toBe('https://muzobox.com/pay/mb_123');
      expect(out.qrImageUrl).toContain('https://api.qrserver.com');
    });

    it('throws BadRequestException when journey validation fails', async () => {
      journeyTask.validateJourneyForMonitoring.mockResolvedValueOnce({
        valid: false,
        errors: [
          {
            code: 'TRAIN_DOES_NOT_RUN_ON_DATE',
            message: 'This train does not start its journey on 2026-09-20',
          },
        ],
      });

      await expect(service.createPaymentLink({ ...baseInput })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getStatus / confirmIfPaid', () => {
    const pendingRecord = (overrides: Record<string, any> = {}) => ({
      id: 'ref-1',
      status: 'PENDING',
      amount: 25,
      razorpayOrderId: 'order-1',
      razorpayPaymentId: null,
      journeyRequestId: null,
      journeyPayload: { ...baseInput },
      paidAt: null,
      ...overrides,
    });

    it('queues exactly once when an order payment is captured', async () => {
      prisma.chartAlertPayment.findUnique
        .mockResolvedValueOnce(pendingRecord())
        .mockResolvedValueOnce({
          ...pendingRecord(),
          status: 'PAID',
          journeyRequestId: 'jid-1',
        });
      razorpay.orderPayments.mockResolvedValue([
        { id: 'pay-1', status: 'captured', amount: 2500 },
      ]);
      prisma.chartAlertPayment.updateMany.mockResolvedValue({ count: 1 });
      prisma.chartAlertPayment.update.mockResolvedValue({});
      journeyTask.queueJourneyMonitoring.mockResolvedValue(true);

      const out = await service.getStatus('ref-1');

      expect(razorpay.orderPayments).toHaveBeenCalledWith('order-1');
      expect(journeyTask.queueJourneyMonitoring).toHaveBeenCalledTimes(1);
      expect(journeyTask.queueJourneyMonitoring).toHaveBeenCalledWith(
        baseInput,
        expect.any(String),
      );
      expect(
        notificationService.sendChartAlertConfirmation,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'a@example.com',
          trainNumber: '12639',
          amount: 25,
          paymentRef: 'ref-1',
        }),
      );
      expect(out.status).toBe('paid');
      expect(out.journeyCreated).toBe(true);
    });

    it('sends both email and whatsapp when both contact details are provided', async () => {
      prisma.chartAlertPayment.findUnique
        .mockResolvedValueOnce(
          pendingRecord({
            contactEmail: 'user@example.com',
            contactMobile: '9876543210',
            journeyPayload: {
              ...baseInput,
              email: 'user@example.com',
              mobile: '9876543210',
            },
          }),
        )
        .mockResolvedValueOnce({
          ...pendingRecord({
            contactEmail: 'user@example.com',
            contactMobile: '9876543210',
            journeyPayload: {
              ...baseInput,
              email: 'user@example.com',
              mobile: '9876543210',
            },
          }),
          status: 'PAID',
          journeyRequestId: 'jid-both',
        });
      razorpay.orderPayments.mockResolvedValue([
        { id: 'pay-both', status: 'captured', amount: 2500 },
      ]);
      prisma.chartAlertPayment.updateMany.mockResolvedValue({ count: 1 });
      prisma.chartAlertPayment.update.mockResolvedValue({});
      journeyTask.queueJourneyMonitoring.mockResolvedValue(true);

      const out = await service.getStatus('ref-1');

      expect(out.status).toBe('paid');
      expect(
        notificationService.sendChartAlertConfirmation,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user@example.com',
          mobile: '9876543210',
          trainNumber: '12639',
        }),
      );
    });

    it('does not send confirmation if confirmationSentAt is already recorded', async () => {
      prisma.chartAlertPayment.findUnique
        .mockResolvedValueOnce(
          pendingRecord({
            confirmationSentAt: new Date(),
          }),
        )
        .mockResolvedValueOnce({
          ...pendingRecord({
            confirmationSentAt: new Date(),
          }),
          status: 'PAID',
          journeyRequestId: 'jid-already-sent',
        });
      razorpay.orderPayments.mockResolvedValue([
        { id: 'pay-2', status: 'captured', amount: 2500 },
      ]);
      prisma.chartAlertPayment.updateMany.mockResolvedValue({ count: 1 });
      prisma.chartAlertPayment.update.mockResolvedValue({});
      journeyTask.queueJourneyMonitoring.mockResolvedValue(true);

      await service.getStatus('ref-1');

      expect(
        notificationService.sendChartAlertConfirmation,
      ).not.toHaveBeenCalled();
    });

    it('does not queue twice when the claim is lost (concurrent status+callback)', async () => {
      prisma.chartAlertPayment.findUnique.mockResolvedValue(
        pendingRecord({ status: 'PAID', journeyRequestId: 'jid-winner' }),
      );

      const out = await service.getStatus('ref-1');

      expect(razorpay.orderPayments).not.toHaveBeenCalled();
      expect(journeyTask.queueJourneyMonitoring).not.toHaveBeenCalled();
      expect(out.journeyCreated).toBe(true);
    });

    it('releases the claim when queueing fails so the next check retries', async () => {
      prisma.chartAlertPayment.findUnique
        .mockResolvedValueOnce(pendingRecord())
        .mockResolvedValueOnce({
          ...pendingRecord(),
          status: 'PAID',
          journeyRequestId: null,
        });
      razorpay.orderPayments.mockResolvedValue([
        { id: 'pay-1', status: 'captured', amount: 2500 },
      ]);
      prisma.chartAlertPayment.updateMany.mockResolvedValue({ count: 1 });
      prisma.chartAlertPayment.update.mockResolvedValue({});
      journeyTask.queueJourneyMonitoring.mockResolvedValue(false);

      const out = await service.getStatus('ref-1');

      expect(prisma.chartAlertPayment.update).toHaveBeenCalledWith({
        where: { id: 'ref-1' },
        data: { journeyRequestId: null },
      });
      expect(out.status).toBe('paid');
      expect(out.journeyCreated).toBe(false);
    });

    it('leaves records pending when no order payment matches', async () => {
      prisma.chartAlertPayment.findUnique.mockResolvedValue(pendingRecord());
      razorpay.orderPayments.mockResolvedValue([
        { id: 'pay-9', status: 'failed', amount: 2500 },
      ]);

      const out = await service.getStatus('ref-1');

      expect(out.status).toBe('pending');
      expect(journeyTask.queueJourneyMonitoring).not.toHaveBeenCalled();
    });

    it('leaves legacy rows without a Razorpay order untouched', async () => {
      prisma.chartAlertPayment.findUnique.mockResolvedValue(
        pendingRecord({ razorpayOrderId: null }),
      );

      const out = await service.getStatus('ref-1');

      expect(razorpay.orderPayments).not.toHaveBeenCalled();
      expect(out.status).toBe('pending');
    });
  });

  describe('handleCallback', () => {
    const sign = (body: string) =>
      createHmac('sha256', 'whsec-test').update(body).digest('hex');

    const authorizedEvent = {
      event: 'payment.authorized',
      payload: {
        payment: {
          entity: {
            id: 'pay-1',
            status: 'captured',
            amount: 2500,
            notes: { chart_alert_ref: 'ref-1' },
          },
        },
      },
    };

    it('confirms on a valid payment.authorized webhook', async () => {
      const raw = JSON.stringify(authorizedEvent);
      prisma.chartAlertPayment.findUnique.mockResolvedValue({
        id: 'ref-1',
        status: 'PENDING',
        amount: 25,
        razorpayOrderId: 'order-1',
        razorpayPaymentId: null,
        journeyRequestId: null,
        journeyPayload: { ...baseInput },
        paidAt: null,
      });
      razorpay.orderPayments.mockResolvedValue([
        { id: 'pay-1', status: 'captured', amount: 2500 },
      ]);
      prisma.chartAlertPayment.updateMany.mockResolvedValue({ count: 1 });
      prisma.chartAlertPayment.update.mockResolvedValue({});
      journeyTask.queueJourneyMonitoring.mockResolvedValue(true);

      const out = await service.handleCallback(Buffer.from(raw), sign(raw));

      expect(out).toEqual({ received: true });
      expect(journeyTask.queueJourneyMonitoring).toHaveBeenCalledTimes(1);
    });

    it('rejects webhooks with a bad signature', async () => {
      const raw = JSON.stringify(authorizedEvent);

      await expect(
        service.handleCallback(Buffer.from(raw), 'bad-sig'),
      ).rejects.toThrow('Invalid webhook signature');
      expect(prisma.chartAlertPayment.findUnique).not.toHaveBeenCalled();
    });

    it('propagates transient persistence failures so Razorpay retries', async () => {
      const raw = JSON.stringify(authorizedEvent);
      prisma.chartAlertPayment.findUnique.mockResolvedValue({
        id: 'ref-1',
        status: 'PENDING',
        amount: 25,
        razorpayOrderId: 'order-1',
        razorpayPaymentId: null,
        journeyRequestId: null,
        journeyPayload: { ...baseInput },
        paidAt: null,
      });
      prisma.chartAlertPayment.update.mockRejectedValue(
        new Error('database unavailable'),
      );

      await expect(
        service.handleCallback(Buffer.from(raw), sign(raw)),
      ).rejects.toThrow('database unavailable');
    });

    it('acks unknown refs without crashing', async () => {
      const raw = JSON.stringify(authorizedEvent);
      prisma.chartAlertPayment.findUnique.mockResolvedValue(null);

      const out = await service.handleCallback(Buffer.from(raw), sign(raw));

      expect(out).toEqual({ received: true });
      expect(journeyTask.queueJourneyMonitoring).not.toHaveBeenCalled();
    });
  });

  describe('chartAlertPriceForClass', () => {
    it.each([
      'ANY',
      '1A',
      '2A',
      '3A',
      ' 3a ',
      'SL',
      '3E',
      '2S',
      'CC',
      'EC',
      'FC',
      '',
      undefined,
      null,
    ])('charges the default ₹100 for %s', (classCode) => {
      expect(chartAlertPriceForClass(classCode as string | undefined)).toBe(
        100,
      );
    });

    it('prices specific classes via overrides with ANY as catch-all', () => {
      const overrides = parseChartAlertPriceOverrides({
        ANY: 100,
        '3A': 50,
      });
      expect(chartAlertPriceForClass('3A', overrides)).toBe(50);
      expect(chartAlertPriceForClass('SL', overrides)).toBe(100);
      expect(chartAlertPriceForClass(undefined, overrides)).toBe(100);
    });

    it('matches override keys case/space-insensitively', () => {
      const overrides = parseChartAlertPriceOverrides({ ' sl ': 30 });
      expect(chartAlertPriceForClass('sl', overrides)).toBe(30);
      expect(chartAlertPriceForClass('SL', overrides)).toBe(30);
    });
  });

  describe('parseChartAlertPriceOverrides', () => {
    it('accepts numbers and numeric strings, rejecting bad payloads', () => {
      expect(parseChartAlertPriceOverrides({ '3A': 50, SL: '10.5' })).toEqual({
        '3A': 50,
        SL: 10.5,
      });
      expect(parseChartAlertPriceOverrides({ '3A': 0 })).toBeNull();
      expect(parseChartAlertPriceOverrides({ '3A': -5 })).toBeNull();
      expect(parseChartAlertPriceOverrides({ '3A': 'fifty' })).toBeNull();
      expect(parseChartAlertPriceOverrides({})).toBeNull();
      expect(parseChartAlertPriceOverrides([50])).toBeNull();
      expect(parseChartAlertPriceOverrides('not json')).toBeNull();
      expect(parseChartAlertPriceOverrides('{"3A": 50}')).toEqual({ '3A': 50 });
      expect(parseChartAlertPriceOverrides(null)).toBeNull();
      expect(parseChartAlertPriceOverrides(undefined)).toBeNull();
    });
  });

  describe('PostHog price overrides in createPaymentLink', () => {
    it('charges the flag payload price for the requested class', async () => {
      posthog.getFeatureFlagPayload.mockResolvedValue({ '3A': 75 });
      prisma.chartAlertPayment.create.mockResolvedValue({ id: 'ref-flag' });
      razorpay.createOrder.mockResolvedValue({ id: 'order-f', amount: 7500 });
      razorpay.createUpiQr.mockResolvedValue({
        id: 'qr-f',
        imageUrl: 'https://rzp.test/qr-f.png',
      });
      razorpay.resolveQrIntents.mockResolvedValue({ intent: null, apps: null });
      prisma.chartAlertPayment.update.mockResolvedValue({});

      const out = await service.createPaymentLink({ ...baseInput });

      expect(posthog.getFeatureFlagPayload).toHaveBeenCalledWith(
        CHART_ALERT_PRICES_FLAG_KEY,
      );
      expect(out.amount).toBe(75);
      expect(razorpay.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({ amountPaise: 7500 }),
      );
    });

    it('falls back to the default when the flag is off or malformed', async () => {
      prisma.chartAlertPayment.create.mockResolvedValue({ id: 'ref-plain' });
      razorpay.createOrder.mockResolvedValue({ id: 'order-x', amount: 10000 });
      razorpay.createUpiQr.mockResolvedValue({
        id: 'qr-x',
        imageUrl: 'https://rzp.test/qr-x.png',
      });
      razorpay.resolveQrIntents.mockResolvedValue({ intent: null, apps: null });
      prisma.chartAlertPayment.update.mockResolvedValue({});

      const out = await service.createPaymentLink({ ...baseInput });
      expect(out.amount).toBe(100);

      posthog.getFeatureFlagPayload.mockResolvedValue({ '3A': 'free' });
      const out2 = await service.createPaymentLink({ ...baseInput });
      expect(out2.amount).toBe(100);
    });
  });
});
