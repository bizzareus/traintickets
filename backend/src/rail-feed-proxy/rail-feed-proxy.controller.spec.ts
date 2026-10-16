import { UnauthorizedException } from '@nestjs/common';
import { RailFeedProxyController } from './rail-feed-proxy.controller';
import { ADMIN_PASSWORD_ENV } from '../common/admin-auth';

describe('RailFeedProxyController', () => {
  let controller: RailFeedProxyController;
  const originalEnv = process.env;

  beforeEach(() => {
    controller = new RailFeedProxyController();
    process.env = { ...originalEnv, [ADMIN_PASSWORD_ENV]: 'test-secret' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('rejects requests without admin password with UnauthorizedException', async () => {
    const req = { query: {} } as any;
    const res = {} as any;

    await expect(
      controller.proxyAvailability(undefined, req, res),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects requests with incorrect admin password', async () => {
    const req = { query: {} } as any;
    const res = {} as any;

    await expect(
      controller.proxyAvailability('wrong-password', req, res),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('accepts requests with valid admin password', async () => {
    const mockReq = {
      query: {},
      once: jest.fn(),
      off: jest.fn(),
    } as any;
    const mockRes = {
      once: jest.fn(),
      off: jest.fn(),
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as any;

    // Global fetch mock to avoid real network call
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: jest.fn().mockResolvedValue('{"status": "ok"}'),
    });

    try {
      await expect(
        controller.proxyAvailability('test-secret', mockReq, mockRes),
      ).resolves.not.toThrow();
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith('{"status": "ok"}');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
