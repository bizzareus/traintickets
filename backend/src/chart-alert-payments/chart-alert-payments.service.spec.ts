import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  ChartAlertPaymentsService,
  chartAlertPriceForClass,
} from './chart-alert-payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { JourneyTaskService } from '../availability/journey-task.service';

describe('ChartAlertPaymentsService', () => {
  let service: ChartAlertPaymentsService;
  let prisma: Record<string, any>;
  let journeyTask: Record<string, any>;
  let client: { post: jest.Mock; get: jest.Mock };

  const baseInput = {
    trainNumber: '12639',
    fromStationCode: 'MAS',
    toStationCode: 'SBC',
    journeyDate: '2026-10-01',
    classCode: '3A',
    email: 'a@example.com',
  };

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
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'MUZOBOX_PROXY_API_KEY') return 'test-key';
        if (key === 'MUZOBOX_API_URL') return 'https://muzobox.test/api';
        if (key === 'PUBLIC_API_URL') return 'https://api.test';
        if (key === 'FRONTEND_URL') return 'https://app.test';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChartAlertPaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: JourneyTaskService, useValue: journeyTask },
      ],
    }).compile();

    service = module.get(ChartAlertPaymentsService);
    client = { post: jest.fn(), get: jest.fn() };
    (service as any).client = client;
  });

  describe('createPaymentLink', () => {
    it('sends an absolute redirectUri, callbackUrl and auth headers', async () => {
      prisma.chartAlertPayment.create.mockResolvedValue({
        id: 'ref-1',
        amount: 25,
      });
      client.post.mockResolvedValue({
        data: { id: 'mz-1', payUrl: 'https://pay.test/mz-1' },
      });
      prisma.chartAlertPayment.update.mockResolvedValue({});

      const out = await service.createPaymentLink({ ...baseInput });

      expect(out).toEqual({
        ref: 'ref-1',
        payUrl: 'https://pay.test/mz-1',
        amount: 25,
      });
      expect(prisma.chartAlertPayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 25 }),
        }),
      );
      const [, body, opts] = client.post.mock.calls[0];
      expect(body.redirectUri).toBe(
        'https://app.test/chart-alert/payment-complete?ref=ref-1',
      );
      expect(body.callbackUrl).toBe(
        'https://api.test/api/chart-alert-payments/callback',
      );
      expect(opts.headers).toEqual({ 'x-api-key': 'test-key' });
    });

    it('accepts snake_case proxy fields', async () => {
      prisma.chartAlertPayment.create.mockResolvedValue({
        id: 'ref-2',
        amount: 25,
      });
      client.post.mockResolvedValue({
        data: { payment_id: 'mz-2', pay_url: 'https://pay.test/mz-2' },
      });
      prisma.chartAlertPayment.update.mockResolvedValue({});

      const out = await service.createPaymentLink({ ...baseInput });

      expect(out.payUrl).toBe('https://pay.test/mz-2');
      expect(prisma.chartAlertPayment.update).toHaveBeenCalledWith({
        where: { id: 'ref-2' },
        data: { muzoboxPaymentId: 'mz-2', payUrl: 'https://pay.test/mz-2' },
      });
    });

    it('throws 503 without leaving a usable link when the proxy is down', async () => {
      prisma.chartAlertPayment.create.mockResolvedValue({
        id: 'ref-3',
        amount: 25,
      });
      client.post.mockRejectedValue(new Error('proxy down'));

      await expect(service.createPaymentLink({ ...baseInput })).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(prisma.chartAlertPayment.update).toHaveBeenCalledWith({
        where: { id: 'ref-3' },
        data: { status: 'FAILED' },
      });
    });
  });

  describe('getStatus / confirmIfPaid', () => {
    const pendingRecord = (overrides: Record<string, any> = {}) => ({
      id: 'ref-1',
      status: 'PENDING',
      amount: 25,
      muzoboxPaymentId: 'mz-1',
      journeyRequestId: null,
      journeyPayload: { ...baseInput },
      paidAt: null,
      ...overrides,
    });

    it('sends auth headers on the status check and queues exactly once', async () => {
      prisma.chartAlertPayment.findUnique
        .mockResolvedValueOnce(pendingRecord())
        .mockResolvedValueOnce({
          ...pendingRecord(),
          status: 'PAID',
          journeyRequestId: 'jid-1',
        });
      client.get.mockResolvedValue({
        data: { status: 'paid', amount: 25 },
      });
      prisma.chartAlertPayment.updateMany.mockResolvedValue({ count: 1 });
      prisma.chartAlertPayment.update.mockResolvedValue({});
      journeyTask.queueJourneyMonitoring.mockResolvedValue(true);

      const out = await service.getStatus('ref-1');

      expect(client.get.mock.calls[0][1]).toEqual({
        headers: { 'x-api-key': 'test-key' },
      });
      expect(journeyTask.queueJourneyMonitoring).toHaveBeenCalledTimes(1);
      expect(out.status).toBe('paid');
      expect(out.journeyCreated).toBe(true);
    });

    it('does not queue twice when the claim is lost (concurrent status+callback)', async () => {
      prisma.chartAlertPayment.findUnique.mockResolvedValue(
        pendingRecord({ status: 'PAID', journeyRequestId: 'jid-winner' }),
      );
      client.get.mockResolvedValue({
        data: { status: 'PAID', amount: 25 },
      });
      prisma.chartAlertPayment.updateMany.mockResolvedValue({ count: 0 });

      const out = await service.getStatus('ref-1');

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
      client.get.mockResolvedValue({
        data: { status: 'success', amount: 2500 },
      });
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

    it('marks FAILED when the proxy reports failure', async () => {
      prisma.chartAlertPayment.findUnique.mockResolvedValue(pendingRecord());
      client.get.mockResolvedValue({ data: { status: 'failed' } });
      prisma.chartAlertPayment.update.mockResolvedValue({
        ...pendingRecord(),
        status: 'FAILED',
      });

      const out = await service.getStatus('ref-1');

      expect(out.status).toBe('failed');
      expect(journeyTask.queueJourneyMonitoring).not.toHaveBeenCalled();
    });

    it('leaves pending records untouched while the proxy is pending', async () => {
      prisma.chartAlertPayment.findUnique.mockResolvedValue(pendingRecord());
      client.get.mockResolvedValue({ data: { status: 'created' } });

      const out = await service.getStatus('ref-1');

      expect(out.status).toBe('pending');
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
      prisma.chartAlertPayment.create.mockResolvedValue({
        id: 'ref-price',
        amount: 10,
      });
      client.post.mockResolvedValue({
        data: { id: 'mz-price', payUrl: 'https://pay.test/mz-price' },
      });
      prisma.chartAlertPayment.update.mockResolvedValue({});

      const out = await service.createPaymentLink({
        ...baseInput,
        classCode: 'SL',
      });

      expect(out.amount).toBe(10);
      expect(prisma.chartAlertPayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 10 }),
        }),
      );
    });
  });
});
