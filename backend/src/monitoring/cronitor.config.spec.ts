import {
  cronitorEnvironment,
  cronitorMonitorDefinitions,
  cronitorSchedule,
} from './cronitor.config';

describe('Cronitor monitor plan', () => {
  it('defines all seven enabled backend workloads with explicit schedules and timezones', () => {
    const monitors = cronitorMonitorDefinitions({
      NODE_ENV: 'production',
      WASENDER_HEALTHCHECK_ENABLED: 'true',
      IRCTC_KEEPER_ENABLED: 'true',
      BROWSERLESS_API_KEY: 'not-a-real-key',
    });
    expect(monitors).toHaveLength(7);
    expect(new Set(monitors.map((m) => m.key)).size).toBe(7);
    expect(
      monitors.find((m) => m.key.endsWith('failed-delivery-refund')),
    ).toMatchObject({ schedules: ['0 9 * * *'], timezone: 'Asia/Kolkata' });
    expect(monitors.find((m) => m.key.endsWith('seat-cache'))).toMatchObject({
      schedules: ['30 3 * * *'],
      timezone: 'Asia/Kolkata',
    });
    expect(
      monitors.every(
        (m) => !m.assertions.some((rule) => rule.includes('metric.count >')),
      ),
    ).toBe(true);
  });

  it('omits disabled jobs and requires an actual browser configuration for the keeper', () => {
    const jobs = cronitorMonitorDefinitions({
      NODE_ENV: 'development',
      CHART_CRON_ENABLED: 'false',
      IRCTC_KEEPER_ENABLED: 'true',
    });
    expect(jobs.map((m) => m.key)).toEqual([
      'lastberth-alternative-search',
      'lastberth-failed-notification-resend',
      'lastberth-failed-delivery-refund',
    ]);
  });

  it('uses runtime overrides without assuming UTC for the daily refund job', () => {
    const jobs = cronitorMonitorDefinitions({
      NODE_ENV: 'production',
      FAILED_DELIVERY_REFUND_CRON: '0 11 * * *',
      IRCTC_KEEPER_ENABLED: 'true',
      IRCTC_BROWSER_WSS: 'wss://example.invalid',
      IRCTC_KEEPER_CRON: '0 */15 * * * *',
      TZ: 'Asia/Kolkata',
      CHART_TASK_DEADLINE_SECONDS: '900',
    });
    expect(
      jobs.find((m) => m.key.endsWith('failed-delivery-refund'))?.schedules,
    ).toEqual(['0 11 * * *']);
    expect(
      jobs.find((m) => m.key.endsWith('irctc-session-keeper')),
    ).toMatchObject({ schedules: ['*/15 * * * *'], timezone: 'Asia/Kolkata' });
    expect(jobs[0].assertions).toContain('metric.duration < 1020 seconds');
  });

  it('keeps local telemetry out of production by default', () => {
    expect(cronitorEnvironment({})).toBe('development');
    expect(cronitorEnvironment({ NODE_ENV: 'production' })).toBe('production');
    expect(
      cronitorEnvironment({
        NODE_ENV: 'production',
        CRONITOR_ENVIRONMENT: 'staging',
      }),
    ).toBe('staging');
  });

  it('converts fixed-second Nest schedules but rejects unsupported second-level intervals', () => {
    expect(cronitorSchedule('40 * * * * *')).toBe('* * * * *');
    expect(() => cronitorSchedule('*/5 * * * * *')).toThrow();
    expect(() => cronitorSchedule('99 * * * * *')).toThrow();
  });
});
