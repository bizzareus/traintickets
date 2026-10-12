import { createHash } from 'crypto';
import type { Request } from 'express';

/**
 * Canonicalize a client IP for stable hashing. Strips the IPv4-mapped IPv6
 * prefix and zone ids. Full RFC-5952 normalization is intentionally out of
 * scope — an attacker rotating IPv6 spellings only harms their own trial.
 */
export function normalizeIp(ip: string): string {
  let v = ip.trim().toLowerCase();
  const zone = v.indexOf('%');
  if (zone !== -1) v = v.slice(0, zone);
  if (v.startsWith('::ffff:')) v = v.slice('::ffff:'.length);
  return v || 'unknown';
}

/**
 * Prefer Express' proxy-aware `req.ip` (Caddy sets X-Forwarded-For and the
 * app trusts private-network proxies in main.ts). Fall back to the first
 * forwarded entry, then 'unknown' — never an empty string, so unrelated
 * clients can't collapse into one shared quota row.
 */
export function resolveClientIp(req: Request): string {
  const direct = typeof req.ip === 'string' ? req.ip.trim() : '';
  if (direct) return normalizeIp(direct);
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === 'string'
      ? forwarded.split(',')[0]
      : '';
  if (first?.trim()) return normalizeIp(first);
  return 'unknown';
}

export function hashIp(ip: string): string {
  const salt = process.env.SEARCH_CREDITS_IP_SALT?.trim() || '';
  return createHash('sha256')
    .update(`${salt}:${normalizeIp(ip)}`)
    .digest('hex');
}

/** Truncated display value for admin/debug — never the full client IP. */
export function ipDisplay(ip: string): string {
  const n = normalizeIp(ip);
  if (n === 'unknown') return n;
  if (n.includes(':')) {
    const parts = n.split(':').filter((p) => p.length > 0);
    return `${parts.slice(0, 3).join(':')}:*:*:*`;
  }
  const parts = n.split('.');
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.*` : n;
}
