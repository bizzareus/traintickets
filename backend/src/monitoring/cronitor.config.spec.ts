import {
  cronitorEnvironment,
  cronitorMonitorDefinitions,
  cronitorSchedule,
} from './cronitor.config';

describe('Cronitor monitor plan', () => {
  it('defines all six enabled backend workloads with explicit schedules and timezones', () => {
    const monitors = cronitorMonitorDefinitions({
      NODE_ENV: 'production',
      WASENDER_HEALTHCHECK_ENABLED: 'true',
    });
    expect(monitors).toHaveLength(6);
    expect(new Set(monitors.map((m) => m.key)).size).toBe(6);
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

  it('omits disabled jobs', () => {
    const jobs = cronitorMonitorDefinitions({
      NODE_ENV: 'development',
      CHART_CRON_ENABLED: 'false',
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
      CHART_TASK_DEADLINE_SECONDS: '900',
    });
    expect(
      jobs.find((m) => m.key.endsWith('failed-delivery-refund'))?.schedules,
    ).toEqual(['0 11 * * *']);
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
