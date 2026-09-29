import { ConfigService } from '@nestjs/config';
import type Cronitor from 'cronitor';
import { CronitorService } from './cronitor.service';
import { createCronitorClient } from './cronitor-client';

jest.mock('./cronitor-client', () => ({ createCronitorClient: jest.fn() }));

describe('Cronitor runtime telemetry', () => {
  const ping = jest.fn().mockResolvedValue(true);
  function service(values: Record<string, string | undefined> = {}) {
    const config: Record<string, string | undefined> = {
      CRONITOR_API_KEY: 'test-only-key',
      NODE_ENV: 'production',
      ...values,
    };
    return new CronitorService({
      get: (key: string) => config[key],
    } as unknown as ConfigService);
  }
  beforeEach(() => {
    ping.mockReset().mockResolvedValue(true);
    jest
      .mocked(createCronitorClient)
      .mockClear()
      .mockReturnValue({
        sdk: {
          Monitor: class {
            constructor(readonly key: string) {}
            ping(params: Cronitor.PingParams) {
              return ping(this.key, params);
            }
          },
        } as never,
        http: {} as never,
      });
  });

  it.each([
    { CRONITOR_API_KEY: undefined },
    { CRONITOR_ENABLED: 'false' },
    { NODE_ENV: 'test', CRONITOR_ENABLED: 'true' },
  ])('does not connect or ping when disabled: %j', async (config) => {
    const work = jest.fn().mockResolvedValue(42);
    await expect(service(config).run('chart-notification', work)).resolves.toBe(
      42,
    );
    expect(createCronitorClient).not.toHaveBeenCalled();
    expect(ping).not.toHaveBeenCalled();
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('correlates start/completion and treats an idle scan as healthy', async () => {
    const result = { tasks: 0 };
    await expect(
      service().run(
        'chart-notification',
        () => Promise.resolve(result),
        (value) => ({ count: value.tasks }),
      ),
    ).resolves.toBe(result);
    expect(ping).toHaveBeenCalledTimes(2);
    const [key, start] = ping.mock.calls[0];
    expect(key).toBe('lastberth-chart-notification');
    expect(start).toMatchObject({
      state: 'run',
      env: 'production',
      series: expect.any(String),
    });
    expect(ping.mock.calls[1][1]).toMatchObject({
      state: 'complete',
      series: start.series,
      metrics: { count: 0, error_count: 0, duration: expect.any(Number) },
    });
  });

  it('reports returned business failures without changing the return value', async () => {
    const result = {
      found: 2,
      failed: 1,
      recipient: 'private@example.invalid',
    };
    await expect(
      service().run(
        'failed-notification-resend',
        () => Promise.resolve(result),
        (value) => ({ count: value.found, errorCount: value.failed }),
      ),
    ).resolves.toBe(result);
    expect(ping.mock.calls[1][1]).toMatchObject({
      state: 'fail',
      metrics: { count: 2, error_count: 1 },
    });
    expect(JSON.stringify(ping.mock.calls)).not.toContain(result.recipient);
  });

  it('reports an exception and rethrows the original error without transmitting its contents', async () => {
    const error = new Error('Private recipient and payment data');
    await expect(
      service().run('failed-delivery-refund', () => Promise.reject(error)),
    ).rejects.toBe(error);
    expect(ping.mock.calls[1][1].state).toBe('fail');
    expect(JSON.stringify(ping.mock.calls)).not.toContain(error.message);
  });

  it('keeps successful work successful when Cronitor rejects both pings', async () => {
    ping.mockRejectedValue(new Error('telemetry is down'));
    await expect(
      service().run('seat-cache', () => Promise.resolve('done')),
    ).resolves.toBe('done');
  });

  it('does not hold up the business operation while the start ping is pending', async () => {
    let release!: (value: boolean) => void;
    ping.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        release = resolve;
      }),
    );
    const work = jest.fn().mockResolvedValue('done');
    const run = service().run('chart-notification', work);
    expect(work).toHaveBeenCalledTimes(1);
    release(true);
    await expect(run).resolves.toBe('done');
  });

  it('uses distinct series IDs for overlapping runs', async () => {
    const monitoring = service({ CRONITOR_ENVIRONMENT: 'staging' });
    await Promise.all([
      monitoring.run('chart-notification', () => Promise.resolve(1)),
      monitoring.run('chart-notification', () => Promise.resolve(2)),
    ]);
    const starts = ping.mock.calls.filter(
      ([, params]) => params.state === 'run',
    );
    expect(new Set(starts.map(([, params]) => params.series)).size).toBe(2);
    expect(
      ping.mock.calls.every(([, params]) => params.env === 'staging'),
    ).toBe(true);
  });

  it('a telemetry-summary bug cannot fail the workload', async () => {
    await expect(
      service().run(
        'chart-notification',
        () => Promise.resolve(42),
        () => {
          throw new Error('summary failed');
        },
      ),
    ).resolves.toBe(42);
    expect(ping.mock.calls[1][1].state).toBe('fail');
  });
});
