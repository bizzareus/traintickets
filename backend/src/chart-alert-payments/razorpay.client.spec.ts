import { createHmac } from 'node:crypto';
import QRCode from 'qrcode';
import {
  buildUpiAppIntents,
  decodeQrIntent,
  verifyRazorpayWebhookSignature,
} from './razorpay.client';

describe('buildUpiAppIntents', () => {
  const intent =
    'upi://pay?pa=merchant@upi&pn=LastBerth&am=25&cu=INR&tn=ref-1&tr=ref-1';

  it('derives generic, GPay, and PhonePe links preserving all params', () => {
    const apps = buildUpiAppIntents(intent);
    expect(apps).toEqual({
      upiIntent: intent,
      gpayIntent: intent.replace(/^upi:/, 'tez:'),
      phonepeIntent: intent.replace(/^upi:\/\/pay/, 'phonepe://pay'),
    });
    expect(apps?.gpayIntent).toContain('pa=merchant@upi');
    expect(apps?.gpayIntent).toContain('tr=ref-1');
    expect(apps?.phonepeIntent).toContain('am=25');
  });

  it('returns null for non-UPI URLs and garbage', () => {
    expect(buildUpiAppIntents('https://pay.test/x')).toBeNull();
    expect(buildUpiAppIntents('not a url')).toBeNull();
    expect(buildUpiAppIntents('')).toBeNull();
  });

  it('returns null when the payee address is missing', () => {
    expect(buildUpiAppIntents('upi://pay?am=25&cu=INR')).toBeNull();
  });
});

describe('decodeQrIntent', () => {
  it('round-trips a generated UPI QR back to its intent string', async () => {
    const intent =
      'upi://pay?pa=merchant@upi&pn=LastBerth&am=10&cu=INR&tn=ref-9&tr=ref-9';
    const png = await QRCode.toBuffer(intent, { width: 360, margin: 2 });
    expect(decodeQrIntent(png)).toBe(intent);
  });

  it('returns null for non-QR bytes', () => {
    expect(decodeQrIntent(Buffer.from('definitely not a png'))).toBeNull();
  });
});

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
    expect(verifyRazorpayWebhookSignature(undefined as never, valid, secret)).toBe(
      false,
    );
  });
});
