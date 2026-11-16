import { Injectable, Logger } from '@nestjs/common';
import { fetchWithTimeout } from './fetch-with-timeout';

/** How long a fetched flag payload stays fresh before the next `/flags` call. */
const FLAG_PAYLOAD_TTL_MS = 60_000;
const FLAG_FETCH_TIMEOUT_MS = 3000;

@Injectable()
export class PostHogAnalyticsService {
  private readonly logger = new Logger(PostHogAnalyticsService.name);
  private readonly host: string;
  private readonly apiKey: string | null;
  private readonly flagPayloadCaches = new Map<
    string,
    { value: unknown; expiresAt: number }
  >();
  private readonly inflightFlagFetches = new Map<string, Promise<unknown>>();

  constructor() {
    this.host = (
      process.env.POSTHOG_HOST?.trim() ||
      process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() ||
      'https://us.i.posthog.com'
    ).replace(/\/+$/, '');

    this.apiKey =
      process.env.POSTHOG_PROJECT_API_KEY?.trim() ||
      process.env.POSTHOG_API_KEY?.trim() ||
      process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() ||
      process.env.POSTHOG_KEY?.trim() ||
      null;

    if (this.apiKey) {
      this.logger.log(
        `[PostHogAnalytics] Initialized PostHog telemetry on host "${this.host}"`,
      );
    } else {
      this.logger.log(
        '[PostHogAnalytics] PostHog API key not configured, telemetry disabled in this environment',
      );
    }
  }

  get isEnabled(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Capture an event to PostHog asynchronously (non-blocking fire-and-forget).
   */
  capture(
    event: string,
    properties: Record<string, unknown> = {},
    distinctId = 'backend-seat-cache',
  ): void {
    if (!this.apiKey) return;

    const payload = {
      api_key: this.apiKey,
      event,
      properties: {
        distinct_id: distinctId,
        $lib: 'node-backend',
        timestamp: new Date().toISOString(),
        ...properties,
      },
    };

    void fetchWithTimeout(
      `${this.host}/capture/`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      4000,
    )
      .then((response) => {
        if (!response.ok) {
          this.logger.warn(
            `[PostHogAnalytics] PostHog rejected "${event}" event with HTTP ${response.status}`,
          );
        }
      })
      .catch((err) => {
        this.logger.warn(
          `[PostHogAnalytics] Failed to send "${event}" event: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  /**
   * Latest evaluated payload for a feature flag (parsed JSON), cached ~1min.
   * Returns null when PostHog is unconfigured/unreachable, the flag is off,
   * or it has no payload — callers must treat null as "use defaults" and
   * never depend on this for correctness. Serves the last known payload
   * when a refresh fails (stale-on-error) so a PostHog blip doesn't flip
   * configured prices back to defaults.
   */
  async getFeatureFlagPayload(flagKey: string): Promise<unknown> {
    if (!this.apiKey) return null;
    const cached = this.flagPayloadCaches.get(flagKey);
    if (cached && Date.now() < cached.expiresAt) return cached.value;

    const inflight = this.inflightFlagFetches.get(flagKey);
    if (inflight) return inflight;

    const fetchPromise = this.fetchFlagPayload(flagKey, cached).finally(() =>
      this.inflightFlagFetches.delete(flagKey),
    );
    this.inflightFlagFetches.set(flagKey, fetchPromise);
    return fetchPromise;
  }

  private async fetchFlagPayload(
    flagKey: string,
    stale: { value: unknown } | undefined,
  ): Promise<unknown> {
    try {
      const response = await fetchWithTimeout(
        `${this.host}/flags?v=2`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: this.apiKey,
            distinct_id: 'backend-flags',
          }),
        },
        FLAG_FETCH_TIMEOUT_MS,
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as {
        flags?: Record<
          string,
          { enabled?: boolean; metadata?: { payload?: unknown } }
        >;
      };
      const detail = data.flags?.[flagKey];
      const payload = detail?.enabled
        ? (detail.metadata?.payload ?? null)
        : null;
      this.flagPayloadCaches.set(flagKey, {
        value: payload,
        expiresAt: Date.now() + FLAG_PAYLOAD_TTL_MS,
      });
      return payload;
    } catch (err) {
      if (stale) {
        this.flagPayloadCaches.set(flagKey, {
          value: stale.value,
          expiresAt: Date.now() + FLAG_PAYLOAD_TTL_MS,
        });
        return stale.value;
      }
      this.logger.warn(
        `[PostHogAnalytics] Failed to fetch "${flagKey}" flag payload: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}
