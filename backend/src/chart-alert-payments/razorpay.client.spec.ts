import { createHmac } from 'node:crypto';
import {
  verifyRazorpayWebhookSignature,
  verifyBrowserPaymentSignature,
} from './razorpay.client';

describe('verifyRazorpayWebhookSignature', () => {
  const secret = 'whsec-test';
  const body = JSON.stringify({ event: 'payment.authorized' });
  const valid = createHmac('sha256', secret).update(body).digest('hex');

  it('accepts a correct signature', () => {
    expect(
      verifyRazorpayWebhookSignature(Buffer.from(body), valid, secret),
    ).toBe(true);
  });

  it('rejects wrong signatures, secrets, and empty inputs', () => {
    expect(
      verifyRazorpayWebhookSignature(Buffer.from(body), 'bad', secret),
    ).toBe(false);
    expect(
      verifyRazorpayWebhookSignature(Buffer.from(body), valid, 'other'),
    ).toBe(false);
    expect(verifyRazorpayWebhookSignature(Buffer.from(body), '', secret)).toBe(
      false,
    );
    expect(
      verifyRazorpayWebhookSignature(undefined as never, valid, secret),
    ).toBe(false);
  });
});

describe('verifyBrowserPaymentSignature', () => {
  const keySecret = 'rzp_secret_test';

  const makeSignature = (orderId: string, paymentId: string) =>
    createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

  it('accepts a valid signature', () => {
    expect(
      verifyBrowserPaymentSignature(
        'order_1',
        'pay_1',
        makeSignature('order_1', 'pay_1'),
      ),
    ).toBe(true);
  });

  it('rejects wrong signatures', () => {
    expect(
      verifyBrowserPaymentSignature('order_1', 'pay_1', 'bad'),
    ).toBe(false);
    expect(
      verifyBrowserPaymentSignature('order_1', 'pay_1', makeSignature('order_2', 'pay_1')),
    ).toBe(false);
    expect(
      verifyBrowserPaymentSignature('order_1', 'pay_2', makeSignature('order_1', 'pay_1')),
    ).toBe(false);
  });

  it('rejects missing inputs', () => {
    expect(verifyBrowserPaymentSignature('', 'pay_1', 'sig')).toBe(false);
    expect(verifyBrowserPaymentSignature('order_1', '', 'sig')).toBe(false);
    expect(verifyBrowserPaymentSignature('order_1', 'pay_1', '')).toBe(false);
    expect(verifyBrowserPaymentSignature('order_1', 'pay_1', undefined as never)).toBe(
      false,
    );
  });
});