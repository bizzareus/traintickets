import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  it('defaults to AI and accepts manual fulfillment', () => {
    expect(validateEnvironment({}).SPLIT_BOOKING_MODE).toBe('ai');
    expect(
      validateEnvironment({ SPLIT_BOOKING_MODE: 'manual' }).SPLIT_BOOKING_MODE,
    ).toBe('manual');
    expect(
      validateEnvironment({ SPLIT_BOOKING_MODE: 'disabled' })
        .SPLIT_BOOKING_MODE,
    ).toBe('disabled');
    expect(() => validateEnvironment({ SPLIT_BOOKING_MODE: 'manul' })).toThrow(
      'SPLIT_BOOKING_MODE',
    );
  });

  it('rejects missing production database and JWT configuration', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(
      /DATABASE_URL.*JWT_SECRET/s,
    );
  });

  it('accepts a complete production configuration without coercing strings', () => {
    const result = validateEnvironment({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/railchart',
      JWT_SECRET: 'a-secure-production-secret-at-least-32-characters',
      PORT: '3009',
    });

    expect(result.PORT).toBe('3009');
  });

  it('allows outbound providers without optional inbound webhooks', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/railchart',
        JWT_SECRET: 'a-secure-production-secret-at-least-32-characters',
        BROWSER_USE_API_KEY: 'configured',
        WHATSAPP_PROVIDER: 'wasender',
      }),
    ).toMatchObject({
      BROWSER_USE_API_KEY: 'configured',
      WHATSAPP_PROVIDER: 'wasender',
    });
  });

  it('rejects partial Razorpay credentials and whitespace-only secrets', () => {
    const validate = () =>
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/railchart',
        JWT_SECRET: 'a-secure-production-secret-at-least-32-characters',
        RAZORPAY_KEY_ID: 'key-id',
        RAZORPAY_WEBHOOK_SECRET: '                    ',
      });

    expect(validate).toThrow(/RAZORPAY_KEY_SECRET/);
    expect(validate).toThrow(/RAZORPAY_WEBHOOK_SECRET/);
  });

  it('rejects surrounding webhook-secret whitespace', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/railchart',
        JWT_SECRET: 'a-secure-production-secret-at-least-32-characters',
        BROWSER_USE_API_KEY: 'configured',
        BROWSER_USE_WEBHOOK_SECRET: ' valid-secret-value ',
      }),
    ).toThrow(/surrounding whitespace/);
  });
});
