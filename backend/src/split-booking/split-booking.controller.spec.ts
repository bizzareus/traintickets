import { createHmac } from 'node:crypto';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { SplitBookingController } from './split-booking.controller';
import type { SplitBookingService } from './split-booking.service';
import type { RazorpayClient } from '../chart-alert-payments/razorpay.client';

describe('Split booking payment trigger', () => {
  const confirmPayment = jest.fn();
  const controller = new SplitBookingController(
    { confirmPayment } as unknown as SplitBookingService,
    { webhookSecret: 'fixture-secret' } as RazorpayClient,
  );
  const callback = (event: string, status: string) => {
    const body = {
      event,
      payload: {
        payment: {
          entity: {
            id: 'pay1',
            status,
            amount: 81000,
            currency: 'INR',
            order_id: 'order1',
            notes: { bookingRef: 'LB-SB-TEST' },
          },
        },
      },
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = createHmac('sha256', 'fixture-secret')
      .update(rawBody)
      .digest('hex');
    return controller.handleCallback(
      { body, rawBody } as RawBodyRequest<Request>,
      signature,
    );
  };
  beforeEach(() => jest.clearAllMocks());

  it.each(['payment.failed', 'payment.authorized', 'refund.processed'])(
    'never launches a reservation for %s',
    async (event) => {
      await callback(event, 'authorized');
      expect(confirmPayment).not.toHaveBeenCalled();
    },
  );
  it('passes captured payment details for amount/order matching', async () => {
    await callback('payment.captured', 'captured');
    expect(confirmPayment).toHaveBeenCalledWith('LB-SB-TEST', 'pay1', {
      amount: 81000,
      currency: 'INR',
      orderId: 'order1',
    });
  });
  it('rejects a captured event whose payment is not captured', async () => {
    await expect(callback('payment.captured', 'failed')).rejects.toThrow(
      'captured payment',
    );
    expect(confirmPayment).not.toHaveBeenCalled();
  });
});
