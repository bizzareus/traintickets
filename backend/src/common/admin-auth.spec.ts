import { UnauthorizedException } from '@nestjs/common';
import {
  assertAdminAuth,
  assertAdminPassword,
  buildAdminSessionCookieValue,
  buildAdminSessionSetCookie,
  isAdminSessionCookieValid,
} from './admin-auth';

describe('assertAdminPassword (header-only shim)', () => {
  const originalEnv = process.env.CHART_TIME_INGESTION_PASSWORD;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CHART_TIME_INGESTION_PASSWORD;
    } else {
      process.env.CHART_TIME_INGESTION_PASSWORD = originalEnv;
    }
  });

  it('throws when the env var is not set', () => {
    delete process.env.CHART_TIME_INGESTION_PASSWORD;
    expect(() => assertAdminPassword('anything')).toThrow(
      UnauthorizedException,
    );
  });

  it('throws when the supplied password does not match', () => {
    process.env.CHART_TIME_INGESTION_PASSWORD = 'correct';
    expect(() => assertAdminPassword('wrong')).toThrow(UnauthorizedException);
  });

  it('passes when the supplied password matches', () => {
    process.env.CHART_TIME_INGESTION_PASSWORD = 'correct';
    expect(() => assertAdminPassword('correct')).not.toThrow();
  });

  it('treats undefined pw as a non-match', () => {
    process.env.CHART_TIME_INGESTION_PASSWORD = 'correct';
    expect(() => assertAdminPassword(undefined)).toThrow(UnauthorizedException);
  });
});

describe('assertAdminAuth (header + cookie)', () => {
  const originalEnv = process.env.CHART_TIME_INGESTION_PASSWORD;

  beforeEach(() => {
    process.env.CHART_TIME_INGESTION_PASSWORD = 'secret';
  });
  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CHART_TIME_INGESTION_PASSWORD;
    } else {
      process.env.CHART_TIME_INGESTION_PASSWORD = originalEnv;
    }
  });

  it('accepts a valid header password', () => {
    expect(() => assertAdminAuth({ headerPw: 'secret' })).not.toThrow();
  });

  it('accepts a valid signed cookie', () => {
    const value = buildAdminSessionCookieValue()!;
    expect(() =>
      assertAdminAuth({ req: { cookies: { admin_session: value } } } as never),
    ).not.toThrow();
  });

  it('rejects when neither header nor cookie is valid', () => {
    expect(() => assertAdminAuth({})).toThrow(UnauthorizedException);
    expect(() =>
      assertAdminAuth({
        req: { cookies: { admin_session: 'not-a-valid-cookie' } } as never,
      }),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a cookie whose signature does not verify', () => {
    const value = buildAdminSessionCookieValue()!;
    const tampered = value.slice(0, -1) + (value.endsWith('0') ? '1' : '0');
    expect(() =>
      assertAdminAuth({
        req: { cookies: { admin_session: tampered } } as never,
      }),
    ).toThrow(UnauthorizedException);
  });
});

describe('admin session cookie', () => {
  const originalEnv = process.env.CHART_TIME_INGESTION_PASSWORD;
  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CHART_TIME_INGESTION_PASSWORD;
    } else {
      process.env.CHART_TIME_INGESTION_PASSWORD = originalEnv;
    }
  });

  it('returns null when no env password is set', () => {
    delete process.env.CHART_TIME_INGESTION_PASSWORD;
    expect(buildAdminSessionCookieValue()).toBeNull();
  });

  it('produces a `<ts>.<sig>` string', () => {
    process.env.CHART_TIME_INGESTION_PASSWORD = 'secret';
    const value = buildAdminSessionCookieValue(1_700_000_000_000)!;
    expect(value).toMatch(/^\d+\.[a-f0-9]{64}$/);
    expect(value.startsWith('1700000000000.')).toBe(true);
  });

  it('validates a freshly built cookie', () => {
    process.env.CHART_TIME_INGESTION_PASSWORD = 'secret';
    const value = buildAdminSessionCookieValue()!;
    expect(isAdminSessionCookieValid(value)).toBe(true);
  });

  it('rejects garbage', () => {
    process.env.CHART_TIME_INGESTION_PASSWORD = 'secret';
    expect(isAdminSessionCookieValid(undefined)).toBe(false);
    expect(isAdminSessionCookieValid('')).toBe(false);
    expect(isAdminSessionCookieValid('no-dot-here')).toBe(false);
    expect(isAdminSessionCookieValid('abc.def')).toBe(false);
  });

  it('rejects an expired cookie', () => {
    process.env.CHART_TIME_INGESTION_PASSWORD = 'secret';
    const oldTs = Date.now() - 25 * 60 * 60 * 1000;
    const value = buildAdminSessionCookieValue(oldTs)!;
    expect(isAdminSessionCookieValid(value)).toBe(false);
  });

  it('rejects a cookie signed with a different password', () => {
    process.env.CHART_TIME_INGESTION_PASSWORD = 'secret';
    const value = buildAdminSessionCookieValue()!;
    process.env.CHART_TIME_INGESTION_PASSWORD = 'other';
    expect(isAdminSessionCookieValid(value)).toBe(false);
  });

  it('builds a Set-Cookie header with HttpOnly + SameSite=Strict', () => {
    process.env.CHART_TIME_INGESTION_PASSWORD = 'secret';
    const header = buildAdminSessionSetCookie('abc.def');
    expect(header).toContain('admin_session=abc.def');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Strict');
    expect(header).toContain('Path=/');
    expect(header).toContain('Max-Age=86400');
  });
});
