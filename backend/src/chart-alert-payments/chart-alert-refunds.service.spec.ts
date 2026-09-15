import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ChartAlertRefundsService } from './chart-alert-refunds.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Safety net against unnecessary refunds: every path that must NOT move
 * money asserts `client.post` was never called (no Muzobox call = no
 * Razorpay refund). Only the happy path and the recorded-failure path may
 * reach the HTTP client.
 */
describe('ChartAlertRefundsService', () => {
  let service: ChartAlertRefundsService;
  let prisma: Record<string, any>;
  let configGet: jest.Mock;
  let client: { post: jest.Mock; get: jest.Mock };

  const paidRecord = {
    id: 'pay_123',
    journeyRequestId: 'jid_123',
    status: 'PAID',
    amount: 5,
    refundStatus: 'NONE',
    refundAmount: null,
    razorpayRefundId: null,
    muzoboxPaymentId: 'mzb_123',
    journeyPayload: {
      trainNumber: '12639',
      fromStationCode: 'MAS',
      toStationCode: 'SBC',
      journeyDate: '2026-10-01',
      classCode: '3A',
    },
  };

  beforeEach(async () => {
    prisma = {
      chartAlertPayment: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      journeyMonitoringRequest: {
        findUnique: jest.fn(),
      },
    };
    configGet = jest.fn((key: string) => {
      if (key === 'MUZOBOX_PROXY_API_KEY') return 'test-key';
      if (key === 'MUZOBOX_API_URL') return 'https://muzobox.test/api';
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChartAlertRefundsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    service = module.get(ChartAlertRefundsService);
    client = { post: jest.fn(), get: jest.fn() };
    (service as any).client = client;

    prisma.chartAlertPayment.findFirst.mockResolvedValue(paidRecord);
    prisma.journeyMonitoringRequest.findUnique.mockResolvedValue({
      toStationCode: 'SBC',
    });
  });

  describe('never moves money without a reason', () => {
    it('skips blank journey request ids without touching the DB or API', async () => {
      for (const jid of ['', '   ']) {
        const result = await service.initiateRefundForJourney(
          jid,
          'chart_no_full_journey',
        );
        expect(result).toEqual({ attempted: false, outcome: 'skipped' });
      }
      expect(prisma.chartAlertPayment.findFirst).not.toHaveBeenCalled();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('skips everything when ENABLE_AUTO_REFUND=false', async () => {
      configGet.mockImplementation((key: string) => {
        if (key === 'ENABLE_AUTO_REFUND') return 'false';
        return undefined;
      });

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'chart_no_full_journey',
      );

      expect(result).toEqual({ attempted: false, outcome: 'skipped' });
      expect(prisma.chartAlertPayment.findFirst).not.toHaveBeenCalled();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('skips when no PAID payment exists for the journey', async () => {
      prisma.chartAlertPayment.findFirst.mockResolvedValue(null);

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'chart_no_full_journey',
      );

      expect(result).toEqual({ attempted: false, outcome: 'skipped' });
      expect(client.post).not.toHaveBeenCalled();
    });

    it('does not double-refund an already SUCCEEDED payment', async () => {
      prisma.chartAlertPayment.findFirst.mockResolvedValue({
        ...paidRecord,
        refundStatus: 'SUCCEEDED',
        refundAmount: 5,
        razorpayRefundId: 'rfnd_123',
      });

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'chart_no_full_journey',
      );

      expect(result).toEqual({
        attempted: true,
        outcome: 'succeeded',
        amount: 5,
        refundId: 'rfnd_123',
      });
      expect(prisma.chartAlertPayment.updateMany).not.toHaveBeenCalled();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('does not re-attempt while a refund is already INITIATED', async () => {
      prisma.chartAlertPayment.findFirst.mockResolvedValue({
        ...paidRecord,
        refundStatus: 'INITIATED',
      });

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'chart_no_full_journey',
      );

      expect(result).toEqual({
        attempted: true,
        outcome: 'pending',
        amount: 5,
      });
      expect(prisma.chartAlertPayment.updateMany).not.toHaveBeenCalled();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('skips when the payment has no Muzobox payment id', async () => {
      prisma.chartAlertPayment.findFirst.mockResolvedValue({
        ...paidRecord,
        muzoboxPaymentId: null,
      });

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'chart_no_full_journey',
      );

      expect(result).toEqual({ attempted: false, outcome: 'skipped' });
      expect(client.post).not.toHaveBeenCalled();
    });

    it('skips when the proxy API key is missing', async () => {
      configGet.mockImplementation(() => undefined);

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'chart_no_full_journey',
      );

      expect(result).toEqual({ attempted: false, outcome: 'skipped' });
      expect(client.post).not.toHaveBeenCalled();
    });
  });

  describe('no-destination (chart-prepared-only) alerts are never refunded', () => {
    it('skips when the journey request has an empty destination', async () => {
      prisma.journeyMonitoringRequest.findUnique.mockResolvedValue({
        toStationCode: '',
      });

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'chart_no_full_journey_12639_2026-10-01',
      );

      expect(result).toEqual({ attempted: false, outcome: 'skipped' });
      expect(prisma.chartAlertPayment.updateMany).not.toHaveBeenCalled();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('skips when the journey request destination is whitespace-only', async () => {
      prisma.journeyMonitoringRequest.findUnique.mockResolvedValue({
        toStationCode: '   ',
      });

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'chart_no_full_journey_12639_2026-10-01',
      );

      expect(result).toEqual({ attempted: false, outcome: 'skipped' });
      expect(client.post).not.toHaveBeenCalled();
    });

    it('falls back to the paid journey payload when the request row is missing', async () => {
      prisma.chartAlertPayment.findFirst.mockResolvedValue({
        ...paidRecord,
        journeyPayload: { ...paidRecord.journeyPayload, toStationCode: '' },
      });
      prisma.journeyMonitoringRequest.findUnique.mockResolvedValue(null);

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'chart_no_full_journey_12639_2026-10-01',
      );

      expect(result).toEqual({ attempted: false, outcome: 'skipped' });
      expect(client.post).not.toHaveBeenCalled();
    });

    it('skips when neither the request row nor a payload destination exists', async () => {
      prisma.chartAlertPayment.findFirst.mockResolvedValue({
        ...paidRecord,
        journeyPayload: null,
      });
      prisma.journeyMonitoringRequest.findUnique.mockResolvedValue(null);

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'chart_no_full_journey_12639_2026-10-01',
      );

      expect(result).toEqual({ attempted: false, outcome: 'skipped' });
      expect(client.post).not.toHaveBeenCalled();
    });
  });

  describe('single-flight claim prevents duplicate refunds', () => {
    it('returns the reread SUCCEEDED state when the claim is lost', async () => {
      prisma.chartAlertPayment.updateMany.mockResolvedValue({ count: 0 });
      prisma.chartAlertPayment.findUnique.mockResolvedValue({
        ...paidRecord,
        refundStatus: 'SUCCEEDED',
        refundAmount: 5,
        razorpayRefundId: 'rfnd_winner',
      });

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'chart_no_full_journey',
      );

      expect(result).toEqual({
        attempted: true,
        outcome: 'succeeded',
        amount: 5,
        refundId: 'rfnd_winner',
      });
      expect(client.post).not.toHaveBeenCalled();
    });

    it('returns pending when the claim is lost and no refund succeeded', async () => {
      prisma.chartAlertPayment.updateMany.mockResolvedValue({ count: 0 });
      prisma.chartAlertPayment.findUnique.mockResolvedValue({
        ...paidRecord,
        refundStatus: 'INITIATED',
      });

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'chart_no_full_journey',
      );

      expect(result).toEqual({
        attempted: true,
        outcome: 'pending',
        amount: 5,
      });
      expect(client.post).not.toHaveBeenCalled();
    });
  });

  describe('genuine no-ticket cases still refund', () => {
    it('claims, calls Muzobox once, and records SUCCEEDED', async () => {
      prisma.chartAlertPayment.updateMany.mockResolvedValue({ count: 1 });
      client.post.mockResolvedValue({
        data: { status: 'success', razorpay_refund_id: 'rfnd_123' },
      });
      prisma.chartAlertPayment.update.mockResolvedValue({});

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'chart_no_full_journey_12639_2026-10-01',
      );

      expect(result).toEqual({
        attempted: true,
        outcome: 'succeeded',
        amount: 5,
        refundId: 'rfnd_123',
      });
      expect(prisma.chartAlertPayment.updateMany).toHaveBeenCalledTimes(1);
      expect(client.post).toHaveBeenCalledTimes(1);
      expect(client.post.mock.calls[0][0]).toBe(
        'proxy-payments/mzb_123/refund',
      );
      expect(prisma.chartAlertPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay_123' },
          data: expect.objectContaining({ refundStatus: 'SUCCEEDED' }),
        }),
      );
    });

    it('records FAILED (no retry loop, no second charge) when Muzobox errors', async () => {
      prisma.chartAlertPayment.updateMany.mockResolvedValue({ count: 1 });
      client.post.mockRejectedValueOnce(new Error('proxy down'));
      prisma.chartAlertPayment.update.mockResolvedValue({});

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'chart_no_full_journey_12639_2026-10-01',
      );

      expect(result).toEqual({
        attempted: true,
        outcome: 'failed',
        amount: 5,
      });
      expect(client.post).toHaveBeenCalledTimes(1);
      expect(prisma.chartAlertPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ refundStatus: 'FAILED' }),
        }),
      );
    });
  });
});
