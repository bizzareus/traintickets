import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RailFeedProxyController } from './rail-feed-proxy.controller';
import * as fetchWithTimeoutModule from '../common/fetch-with-timeout';

describe('RailFeedProxyController', () => {
  let controller: RailFeedProxyController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RailFeedProxyController],
    }).compile();

    controller = module.get<RailFeedProxyController>(RailFeedProxyController);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('proxyAvailability', () => {
    it('should throw HttpException with generic message without detail property on failure', async () => {
      jest
        .spyOn(fetchWithTimeoutModule, 'fetchWithTimeout')
        .mockRejectedValue(
          new Error('Sensitive upstream error: timeout accessing http://internal:8080'),
        );

      const mockReq = {
        query: {
          trainNo: '12345',
          dateOfJourney: '2027-10-01',
        },
        once: jest.fn(),
        off: jest.fn(),
      } as any;

      const mockRes = {
        once: jest.fn(),
        off: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        setHeader: jest.fn(),
      } as any;

      try {
        await controller.proxyAvailability(mockReq, mockRes);
        fail('Expected proxyAvailability to throw HttpException');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        const exc = err as HttpException;
        expect(exc.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
        const response = exc.getResponse() as Record<string, unknown>;
        expect(response.message).toBe('Rail availability proxy request failed');
        expect(response.detail).toBeUndefined();
      }
    });

    it('should filter out unauthorized query parameters', async () => {
      const fetchSpy = jest
        .spyOn(fetchWithTimeoutModule, 'fetchWithTimeout')
        .mockResolvedValue({
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
        } as any);

      jest
        .spyOn(fetchWithTimeoutModule, 'readResponseText')
        .mockResolvedValue('{"status": "ok"}');

      const mockReq = {
        query: {
          trainNo: '12345',
          unauthorizedParam: 'maliciousValue',
          adminOverride: 'true',
          dateOfJourney: '2027-10-01',
        },
        once: jest.fn(),
        off: jest.fn(),
      } as any;

      const mockRes = {
        once: jest.fn(),
        off: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        setHeader: jest.fn(),
      } as any;

      await controller.proxyAvailability(mockReq, mockRes);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const targetUrl = fetchSpy.mock.calls[0][0] as string;
      expect(targetUrl).toContain('trainNo=12345');
      expect(targetUrl).toContain('dateOfJourney=2027-10-01');
      expect(targetUrl).not.toContain('unauthorizedParam');
      expect(targetUrl).not.toContain('adminOverride');
    });
  });
});
