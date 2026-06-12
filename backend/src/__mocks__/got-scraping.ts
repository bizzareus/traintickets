/**
 * Jest mock for the ESM-only `got-scraping` package.
 * Tests never call the real IRCTC API, so this provides
 * a no-op stub that satisfies the import.
 */
const noop = jest.fn().mockResolvedValue({ statusCode: 200, body: '{}' });

export const gotScraping = Object.assign(noop, {
  get: noop,
  post: noop,
  put: noop,
  delete: noop,
  patch: noop,
});
