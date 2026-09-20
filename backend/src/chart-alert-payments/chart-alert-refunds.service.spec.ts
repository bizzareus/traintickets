import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ChartAlertRefundsService } from './chart-alert-refunds.service';
import { RazorpayClient } from './razorpay.client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Safety net against unnecessary refunds: every path that must NOT move
 * money asserts `razorpay.createRefund` was never called (no Razorpay call
 * = no money moved). Only the happy path and the recorded-failure path may
 * reach the Razorpay client.
 */
describe('ChartAlertRefundsService', () => {
  let service: ChartAlertRefundsService;
  let prisma: Record<string, any>;
  let configGet: jest.Mock;
  let razorpay: Record<string, any>;

  const paidRecord = {
    id: 'pay_123',
    journeyRequestId: 'jid_123',
    status: 'PAID',
    amount: 25,
    refundStatus: 'NONE',
    refundAmount: null,
    razorpayRefundId: null,
    razorpayPaymentId: 'pay_rzp_123',
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
      return undefined;
    });
    razorpay = {
      isConfigured: true,
      createRefund: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChartAlertRefundsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: configGet } },
        { provide: RazorpayClient, useValue: razorpay },
      ],
    }).compile();

    service = module.get(ChartAlertRefundsService);

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
      expect(razorpay.createRefund).not.toHaveBeenCalled();
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
      expect(razorpay.createRefund).not.toHaveBeenCalled();
    });

    it('skips when no PAID payment exists for the journey', async () => {
      prisma.chartAlertPayment.findFirst.mockResolvedValue(null);

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'chart_no_full_journey',
      );

      expect(result).toEqual({ attempted: false, outcome: 'skipped' });
      expect(razorpay.createRefund).not.toHaveBeenCalled();
    });

    it('does not double-refund an already SUCCEEDED payment', async () => {
      prisma.chartAlertPayment.findFirst.mockResolvedValue({
        ...paidRecord,
        refundStatus: 'SUCCEEDED',
        refundAmount: 25,
        razorpayRefundId: 'rfnd_123',
      });

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'chart_no_full_journey',
      );

      expect(result).toEqual({
        attempted: true,
        outcome: 'succeeded',
        amount: 25,
        refundId: 'rfnd_123',
      });
      expect(prisma.chartAlertPayment.updateMany).not.toHaveBeenCalled();
      expect(razorpay.createRefund).not.toHaveBeenCalled();
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
        amount: 25,
      });
      expect(prisma.chartAlertPayment.updateMany).not.toHaveBeenCalled();
      expect(razorpay.createRefund).not.toHaveBeenCalled();
    });

    it('skips when the payment has no captured Razorpay payment id', async () => {
      prisma.chartAlertPayment.findFirst.mockResolvedValue({
        ...paidRecord,
        razorpayPaymentId: null,
      });

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'chart_no_full_journey',
      );

      expect(result).toEqual({ attempted: false, outcome: 'skipped' });
      expect(razorpay.createRefund).not.toHaveBeenCalled();
    });

    it('skips when Razorpay is not configured', async () => {
      razorpay.isConfigured = false;

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'chart_no_full_journey',
      );

      expect(result).toEqual({ attempted: false, outcome: 'skipped' });
      expect(razorpay.createRefund).not.toHaveBeenCalled();
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
      expect(razorpay.createRefund).not.toHaveBeenCalled();
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
      expect(razorpay.createRefund).not.toHaveBeenCalled();
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
      expect(razorpay.createRefund).not.toHaveBeenCalled();
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
      expect(razorpay.createRefund).not.toHaveBeenCalled();
    });
  });

  describe('single-flight claim prevents duplicate refunds', () => {
    it('returns the reread SUCCEEDED state when the claim is lost', async () => {
      prisma.chartAlertPayment.updateMany.mockResolvedValue({ count: 0 });
      prisma.chartAlertPayment.findUnique.mockResolvedValue({
        ...paidRecord,
        refundStatus: 'SUCCEEDED',
        refundAmount: 25,
        razorpayRefundId: 'rfnd_winner',
      });

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'chart_no_full_journey',
      );

      expect(result).toEqual({
        attempted: true,
        outcome: 'succeeded',
        amount: 25,
        refundId: 'rfnd_winner',
      });
      expect(razorpay.createRefund).not.toHaveBeenCalled();
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
        amount: 25,
      });
      expect(razorpay.createRefund).not.toHaveBeenCalled();
    });
  });

  describe('genuine no-ticket cases still refund', () => {
    it('claims, calls Razorpay once, and records SUCCEEDED', async () => {
      prisma.chartAlertPayment.updateMany.mockResolvedValue({ count: 1 });
      razorpay.createRefund.mockResolvedValue({ id: 'rfnd_123' });
      prisma.chartAlertPayment.update.mockResolvedValue({});

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'chart_no_full_journey_12639_2026-10-01',
      );

      expect(result).toEqual({
        attempted: true,
        outcome: 'succeeded',
        amount: 25,
        refundId: 'rfnd_123',
      });
      expect(prisma.chartAlertPayment.updateMany).toHaveBeenCalledTimes(1);
      expect(razorpay.createRefund).toHaveBeenCalledTimes(1);
      expect(razorpay.createRefund).toHaveBeenCalledWith({
        paymentId: 'pay_rzp_123',
        amountPaise: 2500,
        notes: expect.objectContaining({ chart_alert_ref: 'pay_123' }),
      });
      expect(prisma.chartAlertPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay_123' },
          data: expect.objectContaining({ refundStatus: 'SUCCEEDED' }),
        }),
      );
    });

    it('records FAILED (no retry loop, no second charge) when Razorpay errors', async () => {
      prisma.chartAlertPayment.updateMany.mockResolvedValue({ count: 1 });
      razorpay.createRefund.mockRejectedValueOnce(new Error('rzp down'));
      prisma.chartAlertPayment.update.mockResolvedValue({});

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'chart_no_full_journey_12639_2026-10-01',
      );

      expect(result).toEqual({
        attempted: true,
        outcome: 'failed',
        amount: 25,
      });
      expect(razorpay.createRefund).toHaveBeenCalledTimes(1);
      expect(prisma.chartAlertPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ refundStatus: 'FAILED' }),
        }),
      );
    });
  });

  describe('muzobox-routed payments refund via the proxy API', () => {
    const proxyRecord = { ...paidRecord, muzoboxPaymentId: 'mb_123' };
    let post: jest.Mock;

    beforeEach(() => {
      prisma.chartAlertPayment.findFirst.mockResolvedValue(proxyRecord);
      prisma.chartAlertPayment.updateMany.mockResolvedValue({ count: 1 });
      prisma.chartAlertPayment.update.mockResolvedValue({});
      post = jest.fn();
      (service as any).muzoboxClient.post = post;
    });

    it('calls the proxy refund API and records SUCCEEDED from its response', async () => {
      post.mockResolvedValue({
        data: {
          status: 'refunded',
          amount: 25,
          referenceId: 'pay_123',
          razorpayPaymentId: 'pay_rzp_mb',
          razorpayRefundId: 'rfnd_mb_1',
          refundedAt: '2026-09-20T10:00:00.000Z',
        },
      });

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'admin_manual_refund',
      );

      expect(result).toEqual({
        attempted: true,
        outcome: 'succeeded',
        amount: 25,
        refundId: 'rfnd_mb_1',
      });
      expect(post).toHaveBeenCalledWith(
        'proxy-payments/mb_123/refund',
        {
          amount: 25,
          reason: 'admin_manual_refund',
          referenceId: 'pay_123',
        },
        { headers: undefined },
      );
      expect(razorpay.createRefund).not.toHaveBeenCalled();
      expect(prisma.chartAlertPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay_123' },
          data: expect.objectContaining({
            refundStatus: 'SUCCEEDED',
            razorpayRefundId: 'rfnd_mb_1',
            razorpayPaymentId: 'pay_rzp_mb',
            refundAmount: 25,
          }),
        }),
      );
    });

    it('treats already_refunded as success and backfills the refund id', async () => {
      post.mockResolvedValue({
        data: {
          status: 'already_refunded',
          amount: 25,
          razorpayRefundId: 'rfnd_old',
          refundedAt: '2026-09-19T10:00:00.000Z',
        },
      });

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'admin_manual_refund',
      );

      expect(result).toEqual({
        attempted: true,
        outcome: 'succeeded',
        amount: 25,
        refundId: 'rfnd_old',
      });
      expect(razorpay.createRefund).not.toHaveBeenCalled();
      expect(prisma.chartAlertPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            refundStatus: 'SUCCEEDED',
            razorpayRefundId: 'rfnd_old',
          }),
        }),
      );
    });

    it('uses the proxy path even without a local Razorpay payment or config', async () => {
      razorpay.isConfigured = false;
      prisma.chartAlertPayment.findFirst.mockResolvedValue({
        ...proxyRecord,
        razorpayPaymentId: null,
      });
      post.mockResolvedValue({
        data: { status: 'refunded', amount: 25, razorpayRefundId: 'rfnd_mb_2' },
      });

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'admin_manual_refund',
      );

      expect(result).toEqual({
        attempted: true,
        outcome: 'succeeded',
        amount: 25,
        refundId: 'rfnd_mb_2',
      });
      expect(post).toHaveBeenCalledTimes(1);
      expect(razorpay.createRefund).not.toHaveBeenCalled();
    });

    it('records FAILED with the proxy message when the proxy API errors', async () => {
      post.mockRejectedValue({
        isAxiosError: true,
        message: 'Request failed with status code 400',
        response: {
          status: 400,
          data: { message: 'Only PAID payments can be refunded' },
        },
      });

      const result = await service.initiateRefundForJourney(
        'jid_123',
        'admin_manual_refund',
      );

      expect(result).toEqual({
        attempted: true,
        outcome: 'failed',
        amount: 25,
      });
      expect(razorpay.createRefund).not.toHaveBeenCalled();
      expect(prisma.chartAlertPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            refundStatus: 'FAILED',
            refundError: expect.stringContaining(
              'Only PAID payments can be refunded',
            ),
          }),
        }),
      );
    });
  });
});
