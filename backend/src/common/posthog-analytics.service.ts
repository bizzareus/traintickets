import { Injectable, Logger } from '@nestjs/common';
import { fetchWithTimeout } from './fetch-with-timeout';

@Injectable()
export class PostHogAnalyticsService {
  private readonly logger = new Logger(PostHogAnalyticsService.name);
  private readonly host: string;
  private readonly apiKey: string | null;

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
}
