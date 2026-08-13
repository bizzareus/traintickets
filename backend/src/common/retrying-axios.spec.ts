import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { createRetryingAxiosClient } from './retrying-axios';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({ interceptors: {} })),
  },
}));

jest.mock('axios-retry', () => {
  const fn = jest.fn();
  Object.assign(fn, {
    exponentialDelay: jest.fn(() => 0),
    isNetworkOrIdempotentRequestError: jest.fn(() => false),
  });
  return {
    __esModule: true,
    default: fn,
  };
});

const axiosRetryMock = jest.requireMock('axios-retry').default as jest.Mock & {
  isNetworkOrIdempotentRequestError: jest.Mock;
};

function lastRetryOptions() {
  const calls = axiosRetryMock.mock.calls;
  return calls[calls.length - 1][1] as {
    shouldResetTimeout: boolean;
    retryCondition: (err: AxiosError) => boolean;
  };
}

function errorFor(params: {
  method?: string;
  code?: string;
  status?: number;
}): AxiosError {
  return {
    message: 'boom',
    name: 'AxiosError',
    code: params.code,
    config: {
      method: params.method,
      headers: {},
    } as InternalAxiosRequestConfig,
    response:
      params.status == null
        ? undefined
        : ({
            status: params.status,
          } as AxiosError['response']),
    isAxiosError: true,
    toJSON: () => ({}),
  };
}

describe('createRetryingAxiosClient', () => {
  beforeEach(() => {
    axiosRetryMock.mockClear();
    axiosRetryMock.isNetworkOrIdempotentRequestError.mockReturnValue(false);
  });

  it('resets timeout between retries', () => {
    createRetryingAxiosClient();

    expect(lastRetryOptions().shouldResetTimeout).toBe(true);
  });

  it('retries ECONNABORTED timeouts when timeout retries are enabled', () => {
    createRetryingAxiosClient({ retryTimeouts: true });

    expect(
      lastRetryOptions().retryCondition(
        errorFor({ method: 'GET', code: 'ECONNABORTED' }),
      ),
    ).toBe(true);
  });

  it('does not retry POST requests unless explicitly enabled', () => {
    createRetryingAxiosClient();

    expect(
      lastRetryOptions().retryCondition(
        errorFor({ method: 'POST', status: 503 }),
      ),
    ).toBe(false);
  });

  it('retries POST requests when retryPost is enabled', () => {
    createRetryingAxiosClient({ retryPost: true });

    expect(
      lastRetryOptions().retryCondition(
        errorFor({ method: 'POST', status: 503 }),
      ),
    ).toBe(true);
  });

  it('retries 429 and 5xx responses', () => {
    createRetryingAxiosClient();
    const retryCondition = lastRetryOptions().retryCondition;

    expect(retryCondition(errorFor({ method: 'GET', status: 429 }))).toBe(true);
    expect(retryCondition(errorFor({ method: 'GET', status: 502 }))).toBe(true);
  });

  it('does not retry 400 responses', () => {
    createRetryingAxiosClient();

    expect(
      lastRetryOptions().retryCondition(
        errorFor({ method: 'GET', status: 400 }),
      ),
    ).toBe(false);
  });

  it('uses custom retryDelayMs when specified', () => {
    createRetryingAxiosClient({ retryDelayMs: 5000 });
    const delayFn = (
      axiosRetryMock.mock.calls[axiosRetryMock.mock.calls.length - 1][1] as {
        retryDelay: (count: number, err: AxiosError) => number;
      }
    ).retryDelay;

    expect(delayFn(1, errorFor({ status: 500 }))).toBe(5000);
  });
});
