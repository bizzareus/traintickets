import { HttpException, HttpStatus } from '@nestjs/common';
import { RailFeedProxyController } from './rail-feed-proxy.controller';

jest.mock('../common/fetch-with-timeout', () => ({
  fetchWithTimeout: jest.fn(),
  readResponseText: jest.fn(),
}));

import {
  fetchWithTimeout,
  readResponseText,
} from '../common/fetch-with-timeout';

describe('RailFeedProxyController', () => {
  let controller: RailFeedProxyController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new RailFeedProxyController();
  });

  const createMockReqRes = (query: Record<string, string | string[]>) => {
    const req = {
      query,
      once: jest.fn(),
      off: jest.fn(),
    } as any;

    const res = {
      destroyed: false,
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
    } as any;

    return { req, res };
  };

  it('rejects invalid dateOfJourney format', async () => {
    const { req, res } = createMockReqRes({ dateOfJourney: 'invalid-date' });

    await expect(controller.proxyAvailability(req, res)).rejects.toThrow(
      new HttpException(
        {
          error: {
            code: 4001,
            message: 'Invalid journey date format (expected YYYY-MM-DD or DD-MM-YYYY)',
          },
        },
        HttpStatus.BAD_REQUEST,
      ),
    );
  });

  it('rejects past dateOfJourney', async () => {
    const { req, res } = createMockReqRes({ dateOfJourney: '2020-01-01' });

    await expect(controller.proxyAvailability(req, res)).rejects.toThrow(
      new HttpException(
        {
          error: { code: 4002, message: 'Journey date cannot be in the past' },
        },
        HttpStatus.BAD_REQUEST,
      ),
    );
  });

  it('proxies valid request successfully', async () => {
    const futureDate = '2030-12-31';
    const { req, res } = createMockReqRes({
      dateOfJourney: futureDate,
      trainNo: '12626',
    });

    const mockUpstreamResponse = {
      status: 200,
      headers: {
        get: jest.fn().mockReturnValue('application/json'),
      },
    };

    (fetchWithTimeout as jest.Mock).mockResolvedValue(mockUpstreamResponse);
    (readResponseText as jest.Mock).mockResolvedValue('{"success":true}');

    await controller.proxyAvailability(req, res);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/json',
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('{"success":true}');
  });
});
