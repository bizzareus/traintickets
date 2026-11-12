import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RefundRequestService } from './refund-request.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { RazorpayClient } from '../chart-alert-payments/razorpay.client';

describe('RefundRequestService', () => {
  let service: RefundRequestService;
  let prisma: Record<string, any>;
  let notifications: Record<string, any>;
  let configService: Record<string, any>;
  let mockMuzoboxClient: { post: jest.Mock; get: jest.Mock };

  beforeEach(async () => {
    prisma = {
      refundRequest: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      chartAlertPayment: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      trainList: {
        findFirst: jest.fn(),
      },
    };
    notifications = {
      sendRefundRequestAdminEmail: jest.fn(),
      sendManualRefundProcessedEmail: jest.fn().mockResolvedValue(true),
    };
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'MUZOBOX_PROXY_API_KEY') return 'test-key';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundRequestService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationService, useValue: notifications },
        { provide: ConfigService, useValue: configService },
        {
          provide: RazorpayClient,
          useValue: { isConfigured: false, createRefund: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(RefundRequestService);
    mockMuzoboxClient = {
      post: jest.fn(),
      get: jest.fn(),
    };
    (service as any).muzoboxClient = mockMuzoboxClient;
  });

  const validInput = {
    email: 'Passenger@Example.com',
    trainNumber: '12951',
    journeyDate: '2026-10-01',
    txnId: 'pay_abc123',
  };

  describe('getQuote', () => {
    it('returns quoted amount from matched payment and flags autoRefundEligible', async () => {
      prisma.chartAlertPayment.findUnique.mockResolvedValue({
        id: 'cuid_quote_1',
        amount: 25,
        status: 'PAID',
        muzoboxPaymentId: 'mb_123',
      });

      const quote = await service.getQuote({
        email: 'passenger@example.com',
        trainNumber: '12951',
        journeyDate: '2026-10-01',
        txnId: 'cuid_quote_1',
      });

      expect(quote).toEqual({
        ok: true,
        found: true,
        amount: 25,
        currency: 'INR',
        autoRefundEligible: true,
        trainNumber: '12951',
        journeyDate: '2026-10-01',
      });
    });

    it('returns default standard amount when payment is not yet found', async () => {
      prisma.chartAlertPayment.findUnique.mockResolvedValue(null);
      prisma.chartAlertPayment.findFirst.mockResolvedValue(null);
      prisma.chartAlertPayment.findMany.mockResolvedValue([]);

      const quote = await service.getQuote({
        email: 'unknown@example.com',
        trainNumber: '12951',
        journeyDate: '2026-10-01',
      });

      expect(quote).toEqual({
        ok: true,
        found: false,
        amount: 10,
        currency: 'INR',
        autoRefundEligible: true,
        trainNumber: '12951',
        journeyDate: '2026-10-01',
      });
    });
  });

  describe('create', () => {
    it('auto-initiates refund via Muzobox and emails customer when amount <= 25', async () => {
      prisma.refundRequest.findFirst.mockResolvedValue(null);
      prisma.refundRequest.create.mockResolvedValue({
        id: 'rr-auto-1',
        email: 'passenger@example.com',
        trainNumber: '12951',
        journeyDate: new Date('2026-10-01'),
        txnId: 'cmwd_auto_ref',
        createdAt: new Date(),
      });
      prisma.chartAlertPayment.findUnique.mockResolvedValue({
        id: 'cmwd_auto_ref',
        amount: 10,
        status: 'PAID',
        muzoboxPaymentId: 'mb_auto_1',
        razorpayPaymentId: 'pay_auto_1',
        refundStatus: 'NONE',
        journeyPayload: {
          trainNumber: '12951',
          journeyDate: '2026-10-01',
        },
      });
      mockMuzoboxClient.post.mockResolvedValue({
        data: {
          status: 'refunded',
          amount: 10,
          razorpayRefundId: 'rfnd_auto_muzobox_1',
        },
      });
      prisma.chartAlertPayment.update.mockResolvedValue({});
      prisma.refundRequest.update.mockResolvedValue({});

      const out = await service.create({
        email: 'passenger@example.com',
        trainNumber: '12951',
        journeyDate: '2026-10-01',
        txnId: 'cmwd_auto_ref',
      });

      expect(out).toEqual({
        id: 'rr-auto-1',
        duplicate: false,
        autoRefunded: true,
        amount: 10,
        refundId: 'rfnd_auto_muzobox_1',
      });

      // Muzobox refund called
      expect(mockMuzoboxClient.post).toHaveBeenCalledWith(
        'proxy-payments/mb_auto_1/refund',
        expect.objectContaining({ amount: 10, referenceId: 'cmwd_auto_ref' }),
        expect.anything(),
      );

      // Customer notified
      expect(notifications.sendManualRefundProcessedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'passenger@example.com',
          amount: 10,
          refundId: 'rfnd_auto_muzobox_1',
        }),
      );
    });

    it('stores trimmed lowercase email + padded train number and emails admin when amount > 25', async () => {
      prisma.refundRequest.findFirst.mockResolvedValue(null);
      prisma.refundRequest.create.mockResolvedValue({
        id: 'rr-1',
        email: 'passenger@example.com',
        trainNumber: '12951',
        journeyDate: new Date('2026-10-01'),
        txnId: 'pay_abc123',
        createdAt: new Date(),
      });
      prisma.chartAlertPayment.findUnique.mockResolvedValue({
        id: 'pay_abc123',
        amount: 50,
        status: 'PAID',
      });
      notifications.sendRefundRequestAdminEmail.mockResolvedValue(true);

      const out = await service.create(validInput);

      expect(out).toEqual({
        id: 'rr-1',
        duplicate: false,
        autoRefunded: false,
        amount: 50,
      });
      expect(prisma.refundRequest.create).toHaveBeenCalledWith({
        data: {
          email: 'passenger@example.com',
          trainNumber: '12951',
          journeyDate: new Date('2026-10-01'),
          txnId: 'pay_abc123',
        },
      });
      await Promise.resolve();
      expect(notifications.sendRefundRequestAdminEmail).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'rr-1', duplicate: false }),
      );
    });

    it('returns the existing id without creating when a pending duplicate exists', async () => {
      prisma.refundRequest.findFirst.mockResolvedValue({
        id: 'rr-old',
        email: 'passenger@example.com',
        trainNumber: '12951',
        journeyDate: new Date('2026-10-01'),
        txnId: null,
        createdAt: new Date(),
      });
      notifications.sendRefundRequestAdminEmail.mockResolvedValue(true);

      const out = await service.create({ ...validInput, txnId: undefined });

      expect(out).toEqual({ id: 'rr-old', duplicate: true });
      expect(prisma.refundRequest.create).not.toHaveBeenCalled();
    });

    it('rejects invalid email, train number, and journey date', async () => {
      await expect(
        service.create({ ...validInput, email: 'not-an-email' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create({ ...validInput, trainNumber: 'abc' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create({ ...validInput, journeyDate: '01-10-2026' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.refundRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('setStatus', () => {
    it('rejects invalid status', async () => {
      await expect(service.setStatus('rr-1', 'PENDING')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException if refund request does not exist', async () => {
      prisma.refundRequest.findUnique.mockResolvedValue(null);
      await expect(
        service.setStatus('rr-nonexistent', 'REJECTED'),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates status to REJECTED without processing refund', async () => {
      prisma.refundRequest.findUnique.mockResolvedValue({
        id: 'rr-1',
        email: 'user@test.com',
        status: 'PENDING',
      });
      prisma.refundRequest.update.mockResolvedValue({});

      const res = await service.setStatus('rr-1', 'REJECTED');

      expect(res).toEqual({ ok: true, status: 'REJECTED' });
      expect(prisma.refundRequest.update).toHaveBeenCalledWith({
        where: { id: 'rr-1' },
        data: { status: 'REJECTED' },
      });
      expect(mockMuzoboxClient.post).not.toHaveBeenCalled();
      expect(
        notifications.sendManualRefundProcessedEmail,
      ).not.toHaveBeenCalled();
    });

    it('resolves refund: finds payment from txnId (cuid), retrieves razorpayPaymentId from Muzobox status, initiates refund and sends email', async () => {
      const refundEntry = {
        id: 'rr-100',
        email: 'nayakrajatkumar318@gmail.com',
        trainNumber: '18048',
        journeyDate: new Date('2026-11-12'),
        txnId: 'cmwd7vein002e0test',
        status: 'PENDING',
      };
      prisma.refundRequest.findUnique.mockResolvedValue(refundEntry);

      const paidPayment = {
        id: 'cmwd7vein002e0test',
        amount: 5,
        status: 'PAID',
        muzoboxPaymentId: 'mb_pay_888',
        razorpayPaymentId: null, // to be looked up via Muzobox status API
        refundStatus: 'NONE',
        journeyPayload: {
          trainNumber: '18048',
          trainName: 'Amaravati Express',
          fromStationCode: 'VSKP',
          toStationCode: 'HWH',
          journeyDate: '2026-11-12',
          classCode: '3A',
        },
      };
      prisma.chartAlertPayment.findUnique.mockResolvedValue(paidPayment);

      // Muzobox status returns Razorpay payment ID
      mockMuzoboxClient.get.mockResolvedValue({
        data: {
          status: 'paid',
          razorpayPaymentId: 'pay_rzp_found_123',
        },
      });

      // Muzobox refund returns Razorpay refund ID
      mockMuzoboxClient.post.mockResolvedValue({
        data: {
          status: 'refunded',
          amount: 5,
          razorpayRefundId: 'rfnd_rzp_999',
          razorpayPaymentId: 'pay_rzp_found_123',
        },
      });

      prisma.chartAlertPayment.update.mockResolvedValue({});
      prisma.refundRequest.update.mockResolvedValue({});

      const result = await service.setStatus('rr-100', 'RESOLVED');

      expect(result.ok).toBe(true);
      expect(result.status).toBe('RESOLVED');
      expect(result.refund).toEqual({
        refundId: 'rfnd_rzp_999',
        razorpayPaymentId: 'pay_rzp_found_123',
        amount: 5,
        emailSent: true,
      });

      // Muzobox status checked for razorpayPaymentId
      expect(mockMuzoboxClient.get).toHaveBeenCalledWith(
        'proxy-payments/mb_pay_888/status',
        expect.anything(),
      );

      // Muzobox refund invoked
      expect(mockMuzoboxClient.post).toHaveBeenCalledWith(
        'proxy-payments/mb_pay_888/refund',
        expect.objectContaining({
          amount: 5,
          referenceId: 'cmwd7vein002e0test',
        }),
        expect.anything(),
      );

      // ChartAlertPayment updated with refund details
      expect(prisma.chartAlertPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cmwd7vein002e0test' },
          data: expect.objectContaining({
            refundStatus: 'SUCCEEDED',
            razorpayRefundId: 'rfnd_rzp_999',
          }),
        }),
      );

      // RefundRequest updated with RESOLVED + refundId
      expect(prisma.refundRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rr-100' },
          data: expect.objectContaining({
            status: 'RESOLVED',
            refundId: 'rfnd_rzp_999',
            razorpayPaymentId: 'pay_rzp_found_123',
            refundAmount: 5,
          }),
        }),
      );

      // Customer notified with refund ID and alert details
      expect(notifications.sendManualRefundProcessedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'nayakrajatkumar318@gmail.com',
          amount: 5,
          refundId: 'rfnd_rzp_999',
          paymentId: 'pay_rzp_found_123',
          trainNumber: '18048',
          trainName: 'Amaravati Express',
          journeyDate: '2026-11-12',
          fromStationCode: 'VSKP',
          toStationCode: 'HWH',
          classCode: '3A',
        }),
      );
    });

    it('resolves refund when txnId is directly a Razorpay payment ID (pay_...)', async () => {
      const refundEntry = {
        id: 'rr-101',
        email: 'passenger@example.com',
        trainNumber: '12951',
        journeyDate: new Date('2026-12-01'),
        txnId: 'pay_direct_456',
        status: 'PENDING',
      };
      prisma.refundRequest.findUnique.mockResolvedValue(refundEntry);
      prisma.chartAlertPayment.findUnique.mockResolvedValue(null);
      prisma.chartAlertPayment.findFirst.mockResolvedValue({
        id: 'payment_cuid_101',
        amount: 5,
        status: 'PAID',
        razorpayPaymentId: 'pay_direct_456',
        muzoboxPaymentId: null,
        refundStatus: 'NONE',
        journeyPayload: { trainNumber: '12951', journeyDate: '2026-12-01' },
      });

      mockMuzoboxClient.post.mockResolvedValue({
        data: {
          status: 'refunded',
          amount: 5,
          razorpayRefundId: 'rfnd_direct_456',
        },
      });
      prisma.chartAlertPayment.update.mockResolvedValue({});
      prisma.refundRequest.update.mockResolvedValue({});

      const result = await service.setStatus('rr-101', 'RESOLVED');

      expect(result.ok).toBe(true);
      expect(result.refund?.refundId).toBe('rfnd_direct_456');
      expect(result.refund?.razorpayPaymentId).toBe('pay_direct_456');
      expect(mockMuzoboxClient.post).toHaveBeenCalledWith(
        'proxy-payments/pay_direct_456/refund',
        expect.anything(),
        expect.anything(),
      );
    });

    it('resolves refund via email + train fallback when txnId is empty', async () => {
      const refundEntry = {
        id: 'rr-102',
        email: 'user@test.com',
        trainNumber: '12951',
        journeyDate: new Date('2026-12-05'),
        txnId: null,
        status: 'PENDING',
      };
      prisma.refundRequest.findUnique.mockResolvedValue(refundEntry);
      prisma.chartAlertPayment.findMany.mockResolvedValue([
        {
          id: 'pay_matched_fallback',
          amount: 5,
          status: 'PAID',
          muzoboxPaymentId: 'mb_fallback_1',
          razorpayPaymentId: 'pay_from_fallback',
          refundStatus: 'NONE',
          journeyPayload: { trainNumber: '12951', journeyDate: '2026-12-05' },
        },
      ]);

      mockMuzoboxClient.post.mockResolvedValue({
        data: {
          status: 'refunded',
          razorpayRefundId: 'rfnd_fallback_1',
        },
      });
      prisma.chartAlertPayment.update.mockResolvedValue({});
      prisma.refundRequest.update.mockResolvedValue({});

      const result = await service.setStatus('rr-102', 'RESOLVED');

      expect(result.ok).toBe(true);
      expect(result.refund?.refundId).toBe('rfnd_fallback_1');
      expect(result.refund?.razorpayPaymentId).toBe('pay_from_fallback');
    });

    it('handles already_refunded status from Muzobox gracefully', async () => {
      const refundEntry = {
        id: 'rr-103',
        email: 'user@test.com',
        trainNumber: '12951',
        journeyDate: new Date('2026-12-05'),
        txnId: 'pay_already_ref',
        status: 'PENDING',
      };
      prisma.refundRequest.findUnique.mockResolvedValue(refundEntry);
      prisma.chartAlertPayment.findUnique.mockResolvedValue(null);
      prisma.chartAlertPayment.findFirst.mockResolvedValue({
        id: 'pay_cuid_103',
        amount: 5,
        status: 'PAID',
        muzoboxPaymentId: 'mb_already_ref',
        razorpayPaymentId: 'pay_already_ref',
        refundStatus: 'NONE',
        journeyPayload: { trainNumber: '12951', journeyDate: '2026-12-05' },
      });

      mockMuzoboxClient.post.mockResolvedValue({
        data: {
          status: 'already_refunded',
          razorpayRefundId: 'rfnd_existing_999',
        },
      });
      prisma.chartAlertPayment.update.mockResolvedValue({});
      prisma.refundRequest.update.mockResolvedValue({});

      const result = await service.setStatus('rr-103', 'RESOLVED');

      expect(result.ok).toBe(true);
      expect(result.refund?.refundId).toBe('rfnd_existing_999');
    });

    it('throws BadRequestException if payment cannot be found', async () => {
      const refundEntry = {
        id: 'rr-notfound',
        email: 'unknown@test.com',
        trainNumber: '99999',
        journeyDate: new Date('2026-12-05'),
        txnId: 'nonexistent_ref',
        status: 'PENDING',
      };
      prisma.refundRequest.findUnique.mockResolvedValue(refundEntry);
      prisma.chartAlertPayment.findUnique.mockResolvedValue(null);
      prisma.chartAlertPayment.findFirst.mockResolvedValue(null);
      prisma.chartAlertPayment.findMany.mockResolvedValue([]);

      await expect(
        service.setStatus('rr-notfound', 'RESOLVED'),
      ).rejects.toThrow(BadRequestException);
      expect(mockMuzoboxClient.post).not.toHaveBeenCalled();
    });

    it('records error and throws when Muzobox refund fails', async () => {
      const refundEntry = {
        id: 'rr-fail',
        email: 'user@test.com',
        trainNumber: '12951',
        journeyDate: new Date('2026-12-05'),
        txnId: 'cuid_will_fail',
        status: 'PENDING',
      };
      prisma.refundRequest.findUnique.mockResolvedValue(refundEntry);
      prisma.chartAlertPayment.findUnique.mockResolvedValue({
        id: 'cuid_will_fail',
        amount: 5,
        status: 'PAID',
        muzoboxPaymentId: 'mb_fail',
        razorpayPaymentId: 'pay_fail',
        refundStatus: 'NONE',
        journeyPayload: { trainNumber: '12951', journeyDate: '2026-12-05' },
      });

      mockMuzoboxClient.post.mockRejectedValue(
        new Error('Gateway connection timed out'),
      );
      prisma.refundRequest.update.mockResolvedValue({});
      prisma.chartAlertPayment.update.mockResolvedValue({});

      await expect(service.setStatus('rr-fail', 'RESOLVED')).rejects.toThrow(
        BadRequestException,
      );

      // Errors recorded in DB
      expect(prisma.refundRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rr-fail' },
          data: expect.objectContaining({
            refundError: expect.stringContaining(
              'Gateway connection timed out',
            ),
          }),
        }),
      );
      expect(prisma.chartAlertPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cuid_will_fail' },
          data: expect.objectContaining({
            refundStatus: 'FAILED',
            refundError: expect.stringContaining(
              'Gateway connection timed out',
            ),
          }),
        }),
      );
    });
  });
});
