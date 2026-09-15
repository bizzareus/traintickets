import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { RefundRequestService } from './refund-request.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';

describe('RefundRequestService', () => {
  let service: RefundRequestService;
  let prisma: Record<string, any>;
  let notifications: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      refundRequest: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };
    notifications = { sendRefundRequestAdminEmail: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundRequestService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationService, useValue: notifications },
      ],
    }).compile();

    service = module.get(RefundRequestService);
  });

  const validInput = {
    mobile: '9876543210',
    trainNumber: '12951',
    journeyDate: '2026-10-01',
    txnId: 'pay_abc123',
  };

  it('stores normalized E.164 mobile + padded train number and emails admin', async () => {
    prisma.refundRequest.findFirst.mockResolvedValue(null);
    prisma.refundRequest.create.mockResolvedValue({
      id: 'rr-1',
      mobile: '919876543210',
      trainNumber: '12951',
      journeyDate: new Date('2026-10-01'),
      txnId: 'pay_abc123',
      createdAt: new Date(),
    });
    notifications.sendRefundRequestAdminEmail.mockResolvedValue(true);

    const out = await service.create(validInput);

    expect(out).toEqual({ id: 'rr-1', duplicate: false });
    expect(prisma.refundRequest.create).toHaveBeenCalledWith({
      data: {
        mobile: '919876543210',
        trainNumber: '12951',
        journeyDate: new Date('2026-10-01'),
        txnId: 'pay_abc123',
      },
    });
    await Promise.resolve();
    expect(
      notifications.sendRefundRequestAdminEmail,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rr-1', duplicate: false }),
    );
  });

  it('returns the existing id without creating when a pending duplicate exists', async () => {
    prisma.refundRequest.findFirst.mockResolvedValue({
      id: 'rr-old',
      mobile: '919876543210',
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

  it('rejects invalid mobile, train number, and journey date', async () => {
    await expect(
      service.create({ ...validInput, mobile: '123' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.create({ ...validInput, trainNumber: 'abc' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.create({ ...validInput, journeyDate: '01-10-2026' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.refundRequest.create).not.toHaveBeenCalled();
  });

  it('setStatus accepts RESOLVED/REJECTED and rejects anything else', async () => {
    prisma.refundRequest.update.mockResolvedValue({});
    await expect(service.setStatus('rr-1', 'resolved')).resolves.toEqual({
      ok: true,
    });
    expect(prisma.refundRequest.update).toHaveBeenCalledWith({
      where: { id: 'rr-1' },
      data: { status: 'RESOLVED' },
    });
    await expect(service.setStatus('rr-1', 'PENDING')).rejects.toThrow(
      BadRequestException,
    );
  });
});
