import axios, { AxiosError, type AxiosAdapter } from 'axios';
import type { RetryingAxiosClientOptions } from '../common/retrying-axios';
import type { Cache } from 'cache-manager';
import type { PrismaService } from '../prisma/prisma.service';
import type { IrctcCookieStoreService } from './irctc-cookie-store.service';
import type { IrctcHttpService } from './irctc-http.service';

const mockAdapter = jest.fn<
  ReturnType<AxiosAdapter>,
  Parameters<AxiosAdapter>
>();
jest.mock('../common/retrying-axios', () => {
  const actual = jest.requireActual<typeof import('../common/retrying-axios')>(
    '../common/retrying-axios',
  );
  return {
    createRetryingAxiosClient: (options: RetryingAxiosClientOptions) =>
      actual.createRetryingAxiosClient({
        ...options,
        client: axios.create({ adapter: mockAdapter }),
      }),
  };
});

import { IrctcService } from './irctc.service';

describe('station autocomplete retry policy', () => {
  it('returns after one failed HTTP attempt, using the real axios-retry policy', async () => {
    jest.useFakeTimers();
    try {
      mockAdapter.mockImplementation((config) =>
        Promise.reject(
          new AxiosError('Unavailable', 'ERR_BAD_RESPONSE', config, undefined, {
            data: {},
            status: 503,
            statusText: 'Unavailable',
            headers: {},
            config,
          }),
        ),
      );
      const cache = {
        get: jest.fn().mockResolvedValue(undefined),
        set: jest.fn(),
      };
      const service = new IrctcService(
        {} as PrismaService,
        {} as IrctcCookieStoreService,
        {} as IrctcHttpService,
        cache as unknown as Cache,
      );
      const result = service.searchStationsViaConfirmTkt('warangal');
      await jest.runAllTimersAsync();
      await expect(result).resolves.toEqual([]);
      expect(mockAdapter).toHaveBeenCalledTimes(1);
      expect(cache.set).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
