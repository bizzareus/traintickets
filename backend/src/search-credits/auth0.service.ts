import { createPublicKey, type JsonWebKey } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { createRetryingAxiosClient } from '../common/retrying-axios';

export type VerifiedAuth0Identity = {
  sub: string;
  phoneNumber: string | null;
  email: string | null;
};

type JwksKey = {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
};

/**
 * Verifies Auth0 access-token JWTs (RS256 via tenant JWKS) for the
 * LastBerth backend audience. Uses only Node built-ins + the shared
 * retrying axios client — no extra auth dependencies.
 */
@Injectable()
export class Auth0Service {
  private readonly logger = new Logger(Auth0Service.name);
  private readonly http = createRetryingAxiosClient({
    serviceName: 'auth0',
    retries: 2,
    timeoutMs: 8_000,
  });
  private jwksKeys = new Map<string, string>();
  private jwksExpiresAt = 0;

  constructor(private readonly config: ConfigService) {}

  get domain(): string {
    return (
      this.config.get<string>('AUTH0_DOMAIN')?.trim().replace(/\/$/, '') || ''
    );
  }

  get audience(): string {
    return this.config.get<string>('AUTH0_AUDIENCE')?.trim() || '';
  }

  get configured(): boolean {
    return this.domain.length > 0 && this.audience.length > 0;
  }

  /**
   * Auth0 user profile for a verified access token. Passwordless-SMS access
   * tokens don't carry the phone claim, so this is fetched lazily (once per
   * user, then cached on the User row) — never on the hot admission path.
   */
  async fetchUserProfile(token: string): Promise<VerifiedAuth0Identity | null> {
    if (!token || !this.configured) return null;
    try {
      const { data } = await this.http.get<Record<string, unknown>>(
        `https://${this.domain}/userinfo`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const sub = typeof data?.sub === 'string' ? data.sub : '';
      if (!sub) return null;
      return {
        sub,
        phoneNumber:
          typeof data?.phone_number === 'string' ? data.phone_number : null,
        email: typeof data?.email === 'string' ? data.email : null,
      };
    } catch {
      return null;
    }
  }

  /** Null when absent, invalid, expired, or mis-issued — caller stays anonymous. */
  async verifyAccessToken(
    token: string,
  ): Promise<VerifiedAuth0Identity | null> {
    if (!token || !this.configured) return null;
    let kid: string | undefined;
    try {
      const decoded = jwt.decode(token, { complete: true });
      kid =
        typeof decoded === 'object' && decoded?.header?.kid
          ? String(decoded.header.kid)
          : undefined;
    } catch {
      return null;
    }
    if (!kid) return null;
    const pem = await this.publicKeyFor(kid);
    if (!pem) return null;
    try {
      const payload = jwt.verify(token, pem, {
        algorithms: ['RS256'],
        audience: this.audience,
        issuer: `https://${this.domain}/`,
      }) as Record<string, unknown>;
      const sub = typeof payload.sub === 'string' ? payload.sub : '';
      if (!sub) return null;
      const phone =
        typeof payload.phone_number === 'string' ? payload.phone_number : null;
      const email = typeof payload.email === 'string' ? payload.email : null;
      return { sub, phoneNumber: phone, email };
    } catch (err) {
      this.logger.debug(
        `Auth0 token rejected: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private async publicKeyFor(kid: string): Promise<string | null> {
    if (Date.now() < this.jwksExpiresAt) {
      const hit = this.jwksKeys.get(kid);
      if (hit) return hit;
    }
    try {
      const { data } = await this.http.get<{ keys?: JwksKey[] }>(
        `https://${this.domain}/.well-known/jwks.json`,
      );
      const next = new Map<string, string>();
      for (const key of data?.keys ?? []) {
        if (!key?.kid || key.kty !== 'RSA' || !key.n || !key.e) continue;
        try {
          const pem = createPublicKey({
            key: key as unknown as JsonWebKey,
            format: 'jwk',
          })
            .export({ format: 'pem', type: 'spki' })
            .toString();
          next.set(key.kid, pem);
        } catch {
          // Skip unusable keys; others may still verify.
        }
      }
      this.jwksKeys = next;
      this.jwksExpiresAt = Date.now() + 10 * 60_000;
      return next.get(kid) ?? null;
    } catch (err) {
      this.logger.warn(
        `Auth0 JWKS fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return this.jwksKeys.get(kid) ?? null;
    }
  }
}
