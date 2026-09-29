import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type Cronitor from 'cronitor';
import { createCronitorClient } from './cronitor-client';
import { CRONITOR_JOBS, type CronitorJob } from './cronitor.config';

export type CronitorOutcome = { count?: number; errorCount?: number };

@Injectable()
export class CronitorService {
  private readonly logger = new Logger(CronitorService.name);
  private readonly monitors = new Map<CronitorJob, Cronitor.Monitor>();
  private readonly environment: string;

  constructor(config: ConfigService) {
    const key = config.get<string>('CRONITOR_API_KEY')?.trim();
    const enabled = config
      .get<string>('CRONITOR_ENABLED')
      ?.trim()
      .toLowerCase();
    const nodeEnv =
      config.get<string>('NODE_ENV') || process.env.NODE_ENV || 'development';
    this.environment =
      config.get<string>('CRONITOR_ENVIRONMENT')?.trim() || nodeEnv;
    if (!key || /^(false|0|no|off)$/.test(enabled ?? '') || nodeEnv === 'test')
      return;
    const requestedTimeout = Number(
      config.get<string>('CRONITOR_TIMEOUT_MS') ?? 2000,
    );
    const timeout =
      Number.isFinite(requestedTimeout) &&
      requestedTimeout >= 100 &&
      requestedTimeout <= 5000
        ? requestedTimeout
        : 2000;
    const { sdk } = createCronitorClient(key, this.environment, timeout);
    // Construct once: SDK Monitor holds a process-global API configuration.
    for (const job of Object.keys(CRONITOR_JOBS) as CronitorJob[]) {
      this.monitors.set(job, new sdk.Monitor(CRONITOR_JOBS[job]));
    }
    this.logger.log(`Cronitor telemetry enabled for ${this.environment}`);
  }

  async run<T>(
    job: CronitorJob,
    work: () => Promise<T>,
    summarize?: (result: T) => CronitorOutcome,
  ): Promise<T> {
    const monitor = this.monitors.get(job);
    if (!monitor) return work();
    const series = randomUUID();
    const startTime = performance.now();
    // Start telemetry concurrently so a slow monitoring endpoint cannot delay an alert.
    const started = this.ping(monitor, { state: 'run', series });
    try {
      const result = await work();
      let outcome: CronitorOutcome = {};
      try {
        outcome = summarize?.(result) ?? {};
      } catch {
        this.logger.warn(
          `Unable to summarize ${job}; inspect application logs`,
        );
        outcome = { errorCount: 1 };
      }
      const count = this.metric(outcome.count);
      const errors = this.metric(outcome.errorCount);
      const duration = (performance.now() - startTime) / 1000;
      await started;
      await this.ping(monitor, {
        state: errors > 0 ? 'fail' : 'complete',
        series,
        metrics: { count, error_count: errors, duration },
        message:
          errors > 0
            ? 'Job reported failures; inspect the application run log.'
            : undefined,
      });
      return result;
    } catch (error) {
      const duration = (performance.now() - startTime) / 1000;
      await started;
      await this.ping(monitor, {
        state: 'fail',
        series,
        metrics: { error_count: 1, duration },
        message: 'Job threw an exception; inspect the application run log.',
      });
      throw error;
    }
  }

  private metric(value?: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? value
      : 0;
  }

  private async ping(
    monitor: Cronitor.Monitor,
    params: Cronitor.PingParams,
  ): Promise<void> {
    try {
      const accepted = await monitor.ping({
        ...params,
        env: this.environment,
        host: hostname(),
      });
      if (!accepted)
        this.logger.warn(`Cronitor telemetry unavailable for ${monitor.key}`);
    } catch {
      this.logger.warn(`Cronitor telemetry unavailable for ${monitor.key}`);
    }
  }
}

/** Optional injection keeps isolated worker tests and existing manual callers lightweight. */
export function monitorCron<T>(
  monitoring: CronitorService | undefined,
  job: CronitorJob,
  work: () => Promise<T>,
  summarize?: (result: T) => CronitorOutcome,
): Promise<T> {
  return monitoring ? monitoring.run(job, work, summarize) : work();
}
