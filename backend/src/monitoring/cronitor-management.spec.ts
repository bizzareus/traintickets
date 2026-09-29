import { createCronitorClient, CronitorRequestError } from './cronitor-client';
import { manageCronitor } from './cronitor-management';

jest.mock('./cronitor-client', () => ({
  ...jest.requireActual('./cronitor-client'),
  createCronitorClient: jest.fn(),
}));

describe('Cronitor monitor reconciliation', () => {
  const env = { NODE_ENV: 'development', CRONITOR_API_KEY: 'test-key' };
  const get = jest.fn();
  const put = jest.fn();
  beforeEach(() => {
    get.mockReset();
    put.mockReset();
    jest
      .mocked(createCronitorClient)
      .mockClear()
      .mockReturnValue({
        http: { get } as never,
        sdk: {
          Monitor: { put },
          _api: {
            monitorUrl: (key: string) =>
              `https://cronitor.io/api/monitors/${key}`,
          },
        } as never,
      });
  });

  it('requires a configured key without making network calls', async () => {
    await expect(manageCronitor('sync', {})).rejects.toThrow(
      'Set CRONITOR_API_KEY',
    );
    expect(createCronitorClient).not.toHaveBeenCalled();
  });

  it('status is read-only and does not print request or event payloads', async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          key: url.split('/').pop(),
          type: 'job',
          initialized: true,
          passing: true,
          latest_event: {
            stamp: 123,
            state: 'complete',
            message: 'private data',
          },
        },
      }),
    );
    const result = await manageCronitor('status', env);
    expect(put).not.toHaveBeenCalled();
    expect(result.monitors).toHaveLength(4);
    expect(JSON.stringify(result)).not.toContain('private data');
  });

  it('reads existing resources before upserting stable keys and preserves recipients, pauses, and custom rules', async () => {
    const saved = new Map<string, Record<string, unknown>>();
    const key = 'lastberth-chart-notification';
    saved.set(key, {
      key,
      type: 'job',
      name: 'Keep my name',
      note: 'Keep my note',
      notify: ['my-alerts'],
      paused: true,
      assertions: ['metric.duration < 5 minutes'],
    });
    get.mockImplementation((url: string) => {
      const record = saved.get(url.split('/').pop()!);
      return record
        ? Promise.resolve({ data: record })
        : Promise.reject(new CronitorRequestError(404));
    });
    put.mockImplementation((definition: { key: string }) => {
      expect(get.mock.calls.length).toBeGreaterThanOrEqual(4);
      saved.set(definition.key, {
        ...saved.get(definition.key),
        ...definition,
      });
      return Promise.resolve({});
    });
    const result = await manageCronitor('sync', env);
    expect(put).toHaveBeenCalledTimes(4);
    expect(saved.get(key)).toMatchObject({
      name: 'Keep my name',
      note: 'Keep my note',
      notify: ['my-alerts'],
      paused: true,
    });
    expect(saved.get(key)?.assertions).toContain('metric.duration < 5 minutes');
    expect(put.mock.calls[0][0]).not.toHaveProperty('notify');
    expect(put.mock.calls[0][0]).not.toHaveProperty('paused');
    expect(result.result).toBe('configured but unverified');
  });

  it('stops before writing if a stable key belongs to a different monitor type', async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve({ data: { key: url.split('/').pop(), type: 'check' } }),
    );
    await expect(manageCronitor('sync', env)).rejects.toThrow(
      'different monitor type',
    );
    expect(put).not.toHaveBeenCalled();
  });

  it('stops on plan-limit errors without retrying with other resource keys', async () => {
    get.mockRejectedValue(new CronitorRequestError(404));
    put.mockRejectedValue(
      new Error('Monitor limit reached: https://cronitor.io/app/upgrade'),
    );
    await expect(manageCronitor('sync', env)).rejects.toThrow(
      'Monitor limit reached',
    );
    expect(put).toHaveBeenCalledTimes(1);
  });
});
