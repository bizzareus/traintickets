import { UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

export const ADMIN_PASSWORD_HEADER = 'x-admin-password';
export const ADMIN_PASSWORD_ENV = 'CHART_TIME_INGESTION_PASSWORD';
export const ADMIN_SESSION_COOKIE = 'admin_session';
/** 24h — long enough for a working session, short enough to limit exposure. */
const ADMIN_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Gate admin endpoints behind the shared CHART_TIME_INGESTION_PASSWORD.
 * Accepts EITHER the x-admin-password header (for curl/scripts/CLI) OR a
 * signed `admin_session` cookie set by `POST /api/chart-time-ingestion/verify`
 * (for browser flows).
 *
 * Pass an Express `Request` (with cookies parsed by cookie-parser middleware)
 * so the cookie path works. The header path still works without a request.
 */
export function assertAdminAuth(args: {
  headerPw?: string | undefined;
  req?: Request | undefined;
}): void {
  const expected = String(process.env[ADMIN_PASSWORD_ENV] ?? '').trim();
  if (!expected) {
    throw new UnauthorizedException('Admin password not set.');
  }
  if (String(args.headerPw ?? '') === expected) return;
  if (
    args.req &&
    isAdminSessionCookieValid(args.req.cookies?.[ADMIN_SESSION_COOKIE])
  )
    return;
  throw new UnauthorizedException('Invalid admin password.');
}

/**
 * Backwards-compat shim — accepts just a header value. Existing call sites
 * (admin controllers) keep working unchanged.
 */
export function assertAdminPassword(pw: string | undefined): void {
  assertAdminAuth({ headerPw: pw });
}

/** Build the signed `admin_session` cookie value. Empty env => returns null. */
export function buildAdminSessionCookieValue(
  now: number = Date.now(),
): string | null {
  const secret = String(process.env[ADMIN_PASSWORD_ENV] ?? '').trim();
  if (!secret) return null;
  const sig = createHmac('sha256', secret).update(String(now)).digest('hex');
  return `${now}.${sig}`;
}

/**
 * Validate a `admin_session` cookie value. Returns true iff signature matches
 * AND timestamp is within TTL. Uses timingSafeEqual to avoid timing attacks.
 */
export function isAdminSessionCookieValid(value: string | undefined): boolean {
  if (!value) return false;
  const secret = String(process.env[ADMIN_PASSWORD_ENV] ?? '').trim();
  if (!secret) return false;
  const dot = value.indexOf('.');
  if (dot <= 0) return false;
  const tsStr = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const ts = Number(tsStr);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() - ts) > ADMIN_SESSION_TTL_MS) return false;
  const expected = createHmac('sha256', secret).update(tsStr).digest('hex');
  if (expected.length !== sig.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(sig, 'utf8'),
    );
  } catch {
    return false;
  }
}

/** Build the Set-Cookie header value for an admin session. */
export function buildAdminSessionSetCookie(value: string): string {
  const secure =
    process.env.NODE_ENV === 'production' ||
    process.env.ADMIN_COOKIE_SECURE === '1';
  const maxAge = Math.floor(ADMIN_SESSION_TTL_MS / 1000);
  const parts = [
    `${ADMIN_SESSION_COOKIE}=${value}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Strict',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
