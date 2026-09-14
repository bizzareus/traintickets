import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ChartAlertPaymentsController } from './chart-alert-payments.controller';
import { ChartAlertPaymentsService } from './chart-alert-payments.service';

describe('ChartAlertPaymentsController', () => {
  let controller: ChartAlertPaymentsController;
  let payments: Record<string, jest.Mock>;

  beforeEach(async () => {
    payments = {
      createPaymentLink: jest.fn(),
      getStatus: jest.fn(),
      handleCallback: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChartAlertPaymentsController],
      providers: [{ provide: ChartAlertPaymentsService, useValue: payments }],
    }).compile();
    controller = module.get(ChartAlertPaymentsController);
  });

  const validBody = {
    trainNumber: '12639',
    fromStationCode: 'MAS',
    toStationCode: 'SBC',
    journeyDate: '2026-10-01',
    classCode: '3A',
    email: 'a@example.com',
  };

  it('creates a payment link for valid input', async () => {
    payments.createPaymentLink.mockResolvedValue({
      ref: 'ref-1',
      payUrl: 'https://pay.test/x',
      amount: 5,
    });
    await expect(controller.create({ ...validBody })).resolves.toEqual({
      ref: 'ref-1',
      payUrl: 'https://pay.test/x',
      amount: 5,
    });
  });

  it('throws 400 for missing contact, bad date, and missing fields', async () => {
    await expect(
      controller.create({ ...validBody, email: undefined }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      controller.create({ ...validBody, journeyDate: '01-10-2026' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      controller.create({ ...validBody, trainNumber: ' ' }),
    ).rejects.toThrow(BadRequestException);
    expect(payments.createPaymentLink).not.toHaveBeenCalled();
  });

  it('maps proxy outages to 503', async () => {
    payments.createPaymentLink.mockRejectedValue(
      new ServiceUnavailableException('down'),
    );
    await expect(controller.create({ ...validBody })).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('requires a ref for status checks', async () => {
    await expect(controller.getStatus('  ')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('always acks callbacks even when handling fails', async () => {
    payments.handleCallback.mockRejectedValue(new Error('poison'));
    await expect(controller.handleCallback({})).resolves.toEqual({
      received: true,
    });
  });
});
