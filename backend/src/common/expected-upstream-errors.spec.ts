import {
  isBenignUpstreamError,
  isBenignUpstreamErrorMessage,
} from './expected-upstream-errors';

describe('expected-upstream-errors', () => {
  it('matches benign upstream states (not faults)', () => {
    for (const msg of [
      'Chart not prepared',
      'CHART NOT PREPARED',
      'Chart not ready',
      'Train Cancelled.',
      'Train cancelled',
      'Train Canceled', // US spelling
      'Unexpected server response: 401',
      'Unexpected server response: 403',
      'Unexpected server response: 429',
      'Error: net::ERR_TUNNEL_CONNECTION_FAILED at https://www.irctc.co.in/online-charts/',
    ]) {
      expect(isBenignUpstreamErrorMessage(msg)).toBe(true);
    }
  });

  it('does NOT match real errors', () => {
    for (const msg of [
      'Availability request failed: 500',
      'Timeout awaiting request for 30000ms',
      'NGHTTP2_INTERNAL_ERROR',
      'Something went wrong',
      '',
    ]) {
      expect(isBenignUpstreamErrorMessage(msg)).toBe(false);
    }
  });

  it('extracts the message from Error / object shapes', () => {
    expect(isBenignUpstreamError(new Error('Train Cancelled.'))).toBe(true);
    expect(isBenignUpstreamError({ message: 'Chart not prepared' })).toBe(true);
    expect(isBenignUpstreamError(new Error('DB pool exhausted'))).toBe(false);
    expect(isBenignUpstreamError(null)).toBe(false);
  });
});
