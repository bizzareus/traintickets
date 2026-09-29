import { AxiosError, type AxiosResponse } from 'axios';
import { createCronitorClient, CronitorRequestError } from './cronitor-client';

describe('Cronitor SDK transport', () => {
  it('strips credentials and request objects before the SDK logs a telemetry failure', async () => {
    const key = 'fake-secret-for-tests';
    const { sdk, http } = createCronitorClient(key, 'test', 1000);
    http.defaults.adapter = (config) =>
      Promise.reject(new AxiosError(`failed ${key}`, 'ERR_NETWORK', config));
    const logged = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      await expect(
        new sdk.Monitor('test-monitor').ping({ state: 'run' }),
      ).resolves.toBe(false);
      const error = logged.mock.calls[0][0] as CronitorRequestError;
      expect(error).toBeInstanceOf(CronitorRequestError);
      expect(
        `${error.message} ${error.stack} ${JSON.stringify(error)}`,
      ).not.toContain(key);
      expect(error).not.toHaveProperty('config');
      expect(error).not.toHaveProperty('request');
    } finally {
      logged.mockRestore();
    }
  });

  it('retries management rate limits once, honoring retry_after_seconds', async () => {
    jest.useFakeTimers();
    const { http } = createCronitorClient('test-key', 'test', 10_000, true);
    const adapter = jest.fn((config) => {
      if (adapter.mock.calls.length === 1) {
        return Promise.reject(
          new AxiosError(
            'rate limited',
            'ERR_BAD_RESPONSE',
            config,
            undefined,
            {
              status: 429,
              statusText: 'rate limited',
              data: { retry_after_seconds: 2 },
              headers: {},
              config,
            } as AxiosResponse,
          ),
        );
      }
      return Promise.resolve({
        status: 200,
        statusText: 'OK',
        data: {},
        headers: {},
        config,
      });
    });
    http.defaults.adapter = adapter;
    try {
      const request = http.get('https://cronitor.io/api/monitors/test-monitor');
      await jest.advanceTimersByTimeAsync(1999);
      expect(adapter).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      await request;
      expect(adapter).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not retry a plan/permission error and preserves an upgrade link without exposing the key', async () => {
    const { http } = createCronitorClient(
      'secret-test-key',
      'test',
      1000,
      true,
    );
    const adapter = jest.fn((config) => {
      return Promise.reject(
        new AxiosError('denied', 'ERR_BAD_RESPONSE', config, undefined, {
          status: 403,
          statusText: 'Forbidden',
          data: {
            message: 'Monitor limit reached',
            upgrade_url: 'https://cronitor.io/app/upgrade',
          },
          headers: {},
          config,
        } as AxiosResponse),
      );
    });
    http.defaults.adapter = adapter;
    await expect(
      http.get('https://cronitor.io/api/monitors/test'),
    ).rejects.toThrow('https://cronitor.io/app/upgrade');
    expect(adapter).toHaveBeenCalledTimes(1);
  });
});
