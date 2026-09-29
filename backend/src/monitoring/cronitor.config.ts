export const CRONITOR_API_VERSION = '2025-11-28';

export const CRONITOR_JOBS = {
  'chart-notification': 'lastberth-chart-notification',
  'alternative-search': 'lastberth-alternative-search',
  'failed-notification-resend': 'lastberth-failed-notification-resend',
  'failed-delivery-refund': 'lastberth-failed-delivery-refund',
  'seat-cache': 'lastberth-seat-cache',
  'wasender-healthcheck': 'lastberth-wasender-healthcheck',
  'irctc-session-keeper': 'lastberth-irctc-session-keeper',
} as const;

export type CronitorJob = keyof typeof CRONITOR_JOBS;
export type CronitorMonitorDefinition = {
  key: string;
  type: 'job';
  name: string;
  schedules: string[];
  timezone: string;
  grace_seconds: number;
  assertions: string[];
  failure_tolerance: number;
  note: string;
};

export function cronitorEnvironment(env: NodeJS.ProcessEnv): string {
  return env.CRONITOR_ENVIRONMENT?.trim() || env.NODE_ENV || 'development';
}

/** Cronitor uses five cron fields; Nest also permits a fixed second field. */
export function cronitorSchedule(expression: string): string {
  const fields = expression.trim().split(/\s+/);
  if (fields.length === 6 && /^([0-5]?\d)$/.test(fields[0])) fields.shift();
  if (fields.length !== 5)
    throw new Error(
      'Cronitor job schedules require five fields (or six with a fixed second).',
    );
  return fields.join(' ');
}

/** Provision only workloads enabled by the same environment used by the backend. */
export function cronitorMonitorDefinitions(
  env: NodeJS.ProcessEnv,
): CronitorMonitorDefinition[] {
  const off = (value?: string) =>
    /^(false|0|no|off)$/i.test(value?.trim() ?? '');
  const deadline = Number(env.CHART_TASK_DEADLINE_SECONDS ?? 240);
  const chartDeadline =
    Number.isFinite(deadline) && deadline >= 30 && deadline <= 900
      ? deadline
      : 240;
  const job = (
    id: CronitorJob,
    name: string,
    schedule: string,
    duration: string,
    grace: number,
    note: string,
    timezone = 'Asia/Kolkata',
  ): CronitorMonitorDefinition => ({
    key: CRONITOR_JOBS[id],
    type: 'job',
    name,
    schedules: [cronitorSchedule(schedule)],
    timezone,
    grace_seconds: grace,
    failure_tolerance: 0,
    assertions: [`metric.duration < ${duration}`, 'metric.error_count < 1'],
    note,
  });
  return [
    ...(!off(env.CHART_CRON_ENABLED) &&
    !/^(true|1|yes|on)$/i.test(env.CHART_CRON_DISABLED?.trim() ?? '')
      ? [
          job(
            'chart-notification',
            'LastBerth: chart alerts',
            '* * * * *',
            `${chartDeadline + 120} seconds`,
            120,
            'Leader only. An idle scan is healthy; failed tasks or notification channels are failures.',
          ),
        ]
      : []),
    job(
      'alternative-search',
      'LastBerth: alternative searches',
      '* * * * *',
      '15 minutes',
      180,
      'Runs at second 20. Tracks claimed work and rejected searches; not a delivery receipt.',
    ),
    job(
      'failed-notification-resend',
      'LastBerth: notification recovery',
      '* * * * *',
      '10 minutes',
      180,
      'Runs at second 40. Five-minute per-task cooldown; partial channel failures fail the run.',
    ),
    job(
      'failed-delivery-refund',
      'LastBerth: failed-delivery refunds',
      env.FAILED_DELIVERY_REFUND_CRON || '0 9 * * *',
      '60 minutes',
      600,
      'Daily paid-alert refund audit. Reports refund/email failures; zero eligible refunds is healthy.',
    ),
    ...(env.NODE_ENV !== 'development' && !off(env.SEAT_CACHE_ENABLED)
      ? [
          job(
            'seat-cache',
            'LastBerth: seat cache warming',
            '30 3 * * *',
            '2 hours',
            600,
            'NestJS cache warmer. Route failures fail the monitor even when the pass returns normally.',
          ),
        ]
      : []),
    ...(env.WASENDER_HEALTHCHECK_ENABLED?.trim().toLowerCase() === 'true'
      ? [
          job(
            'wasender-healthcheck',
            'LastBerth: WhatsApp connection',
            '*/30 * * * *',
            '5 minutes',
            300,
            'Reports the actual provider health result, not merely an HTTP-successful check.',
          ),
        ]
      : []),
    ...(env.IRCTC_KEEPER_ENABLED === 'true' &&
    (env.IRCTC_BROWSER_WSS?.trim() ||
      env.BROWSERLESS_WSS?.trim() ||
      env.BROWSERLESS_API_KEY?.trim())
      ? [
          job(
            'irctc-session-keeper',
            'LastBerth: IRCTC cookie refresh',
            env.IRCTC_KEEPER_CRON || '*/30 * * * *',
            '4 minutes',
            1200,
            'Automatic boot/cron harvests only, after winning the DB claim. Skipped replicas do not ping.',
            env.TZ || 'UTC',
          ),
        ]
      : []),
  ];
}
