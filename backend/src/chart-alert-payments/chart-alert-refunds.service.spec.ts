import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ChartAlertRefundsService } from './chart-alert-refunds.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ChartAlertRefundsService', () => {
  let service: ChartAlertRefundsService;
  let prisma: Record<string, any>;
  let client: { post: jest.Mock; get: jest.Mock };

  const paidRecord = {
    id: 'pay_123',
    journeyRequestId: 'jid_123',
    status: 'PAID',
    amount: 5,
    refundStatus: 'NONE',
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
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'MUZOBOX_PROXY_API_KEY') return 'test-key';
        if (key === 'MUZOBOX_API_URL') return 'https://muzobox.test/api';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChartAlertRefundsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(ChartAlertRefundsService);
    client = { post: jest.fn(), get: jest.fn() };
    (service as any).client = client;
  });

  it('skips the refund when the journey has no destination (chart-prepared-only)', async () => {
    prisma.chartAlertPayment.findFirst.mockResolvedValue(paidRecord);
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

  it('attempts the refund when a destination was selected', async () => {
    prisma.chartAlertPayment.findFirst.mockResolvedValue(paidRecord);
    prisma.journeyMonitoringRequest.findUnique.mockResolvedValue({
      toStationCode: 'SBC',
    });
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
    expect(client.post).toHaveBeenCalledTimes(1);
  });
});
