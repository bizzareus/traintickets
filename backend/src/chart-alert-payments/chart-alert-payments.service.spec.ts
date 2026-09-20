import { Test, TestingModule } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ChartAlertPaymentsService,
  chartAlertPriceForClass,
} from './chart-alert-payments.service';
import { RazorpayClient } from './razorpay.client';
import { PrismaService } from '../prisma/prisma.service';
import { JourneyTaskService } from '../availability/journey-task.service';
import { NotificationService } from '../notification/notification.service';

describe('ChartAlertPaymentsService', () => {
  let service: ChartAlertPaymentsService;
  let prisma: Record<string, any>;
  let journeyTask: Record<string, any>;
  let razorpay: Record<string, jest.Mock>;
  let notificationService: Record<string, jest.Mock>;

  const baseInput = {
    trainNumber: '12639',
    fromStationCode: 'MAS',
    toStationCode: 'SBC',
    journeyDate: '2026-10-01',
    classCode: '3A',
    email: 'a@example.com',
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
    };
    journeyTask = {
      queueJourneyMonitoring: jest.fn(),
      queueChartPreparedMonitoring: jest.fn(),
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
      ],
    }).compile();

    service = module.get(ChartAlertPaymentsService);
  });

  describe('createPaymentLink', () => {
    it('creates a Razorpay order + QR and returns own-checkout data', async () => {
      prisma.chartAlertPayment.create.mockResolvedValue({ id: 'ref-1' });
      razorpay.createOrder.mockResolvedValue({ id: 'order-1', amount: 2500 });
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

      expect(razorpay.createOrder).toHaveBeenCalledWith({
        amountPaise: 2500,
        receipt: 'ref-1',
        notes: { chart_alert_ref: 'ref-1' },
      });
      expect(razorpay.createUpiQr).toHaveBeenCalledWith(
        expect.objectContaining({
          amountPaise: 2500,
          notes: { chart_alert_ref: 'ref-1' },
        }),
      );
      expect(out).toEqual({
        ref: 'ref-1',
        amount: 25,
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
      razorpay.createOrder.mockResolvedValue({ id: 'order-2', amount: 2500 });
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
    });

    it('uses Muzobox proxy when direct Razorpay is not configured', async () => {
      razorpay.isConfigured = false;
      prisma.chartAlertPayment.create.mockResolvedValue({ id: 'ref-mb-1' });
      prisma.chartAlertPayment.update.mockResolvedValue({});
      (service as any).muzoboxClient.post = jest.fn().mockResolvedValue({
        data: {
          id: 'mb_123',
          amount: 25,
          payUrl: 'https://muzobox.com/pay/mb_123',
          razorpayOrderId: 'order_mb_123',
        },
      });

      const out = await service.createPaymentLink({ ...baseInput });

      expect((service as any).muzoboxClient.post).toHaveBeenCalledWith(
        'proxy-payments/create-link',
        expect.objectContaining({
          amount: 25,
          referenceId: 'ref-mb-1',
        }),
        expect.any(Object),
      );
      expect(out.ref).toBe('ref-mb-1');
      expect(out.payUrl).toBe('https://muzobox.com/pay/mb_123');
      expect(out.qrImageUrl).toContain('https://api.qrserver.com');
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

    it('acks but ignores webhooks with a bad signature', async () => {
      const raw = JSON.stringify(authorizedEvent);

      const out = await service.handleCallback(Buffer.from(raw), 'bad-sig');

      expect(out).toEqual({ received: true });
      expect(prisma.chartAlertPayment.findUnique).not.toHaveBeenCalled();
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
    it.each(['1A', '2A', '3A', ' 3a ', '2a'])(
      'charges the premium tier (₹25) for %s',
      (classCode) => {
        expect(chartAlertPriceForClass(classCode)).toBe(25);
      },
    );

    it.each(['ANY', 'SL', '3E', '2S', 'CC', 'EC', 'FC', '', undefined, null])(
      'charges the standard tier (₹10) for %s',
      (classCode) => {
        expect(chartAlertPriceForClass(classCode as string | undefined)).toBe(
          10,
        );
      },
    );

    it('stores the class-based amount on the payment record', async () => {
      prisma.chartAlertPayment.create.mockResolvedValue({ id: 'ref-price' });
      razorpay.createOrder.mockResolvedValue({ id: 'order-p', amount: 1000 });
      razorpay.createUpiQr.mockResolvedValue({
        id: 'qr-p',
        imageUrl: 'https://rzp.test/qr-p.png',
      });
      razorpay.resolveQrIntents.mockResolvedValue({
        intent: null,
        apps: null,
      });
      prisma.chartAlertPayment.update.mockResolvedValue({});

      const out = await service.createPaymentLink({
        ...baseInput,
        classCode: 'SL',
      });

      expect(out.amount).toBe(10);
      expect(razorpay.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({ amountPaise: 1000 }),
      );
      expect(prisma.chartAlertPayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 10 }),
        }),
      );
    });
  });
});
