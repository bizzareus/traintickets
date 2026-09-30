const mockAxiosPost = jest.fn();
const mockAxiosGet = jest.fn();
const mockGotStreamPost = jest.fn();

jest.mock('../common/retrying-axios', () => ({
  createRetryingAxiosClient: jest.fn(() => ({
    post: mockAxiosPost,
    get: mockAxiosGet,
  })),
}));

jest.mock('got-scraping', () => ({
  gotScraping: {
    stream: {
      post: mockGotStreamPost,
    },
  },
}));

import { IrctcHttpService } from './irctc-http.service';

describe('IrctcHttpService', () => {
  let service: IrctcHttpService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    const { Readable } =
      jest.requireActual<typeof import('node:stream')>('node:stream');
    mockGotStreamPost.mockImplementation(() => {
      const stream = Readable.from([JSON.stringify({ vbd: [] })]);
      process.nextTick(() => stream.emit('response', { statusCode: 200 }));
      return stream;
    });
    process.env = { ...originalEnv };
    delete process.env.IRCTC_ONLINE_CHARTS_BASE_URL;
    delete process.env.IRCTC_BASE_URL;
    service = new IrctcHttpService();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Base URL resolution & proxy detection', () => {
    it('defaults to https://www.irctc.co.in when no env var is set', () => {
      expect(service.getOnlineChartsBaseUrl()).toBe('https://www.irctc.co.in');
      expect(service.isProxied()).toBe(false);
    });

    it('resolves custom ngrok base URL and strips trailing slashes', () => {
      process.env.IRCTC_ONLINE_CHARTS_BASE_URL =
        'https://custom-tunnel.ngrok-free.app///';
      expect(service.getOnlineChartsBaseUrl()).toBe(
        'https://custom-tunnel.ngrok-free.app',
      );
      expect(service.isProxied()).toBe(true);
    });

    it('injects ngrok-skip-browser-warning header when proxied', () => {
      process.env.IRCTC_ONLINE_CHARTS_BASE_URL =
        'https://custom-tunnel.ngrok-free.app';
      const headers = service.buildHeaders({ cookies: 'sample=cookie' });
      expect(headers['ngrok-skip-browser-warning']).toBe('true');
      expect(headers['Cookie']).toBe('sample=cookie');
    });

    it('does not inject ngrok header when direct', () => {
      const headers = service.buildHeaders({ cookies: 'sample=cookie' });
      expect(headers['ngrok-skip-browser-warning']).toBeUndefined();
      expect(headers['Cookie']).toBe('sample=cookie');
    });
  });

  describe('postOnlineCharts', () => {
    it('rejects a direct request error before response headers', async () => {
      const { PassThrough } =
        jest.requireActual<typeof import('node:stream')>('node:stream');
      mockGotStreamPost.mockImplementationOnce(() => {
        const stream = new PassThrough();
        process.nextTick(() => stream.destroy(new Error('connect failed')));
        return stream;
      });

      await expect(
        service.postOnlineCharts(
          '/online-charts/api/vacantBerth',
          {},
          {
            maxAttempts: 1,
          },
        ),
      ).rejects.toThrow('connect failed');
    });

    it('routes requests to ngrok URL when IRCTC_ONLINE_CHARTS_BASE_URL is configured', async () => {
      process.env.IRCTC_ONLINE_CHARTS_BASE_URL =
        'https://tunnel123.ngrok-free.app';
      mockAxiosPost.mockResolvedValueOnce({
        status: 200,
        data: { vbd: [{ coach: 'B1' }] },
      });

      const res = await service.postOnlineCharts(
        '/online-charts/api/vacantBerth',
        { trainNo: '12782' },
        { cookies: 'session=abc' },
      );

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ vbd: [{ coach: 'B1' }] });
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://tunnel123.ngrok-free.app/online-charts/api/vacantBerth',
        { trainNo: '12782' },
        expect.objectContaining({
          headers: expect.objectContaining({
            'ngrok-skip-browser-warning': 'true',
            Cookie: 'session=abc',
          }),
        }),
      );
    });

    it('falls back to direct IRCTC when ngrok proxy fails with an error', async () => {
      process.env.IRCTC_ONLINE_CHARTS_BASE_URL =
        'https://tunnel123.ngrok-free.app';
      mockAxiosPost.mockRejectedValueOnce(
        new Error('Ngrok tunnel 502 Bad Gateway'),
      );

      const res = await service.postOnlineCharts(
        '/online-charts/api/vacantBerth',
        { trainNo: '12782' },
        { cookies: 'session=abc' },
      );

      expect(res.statusCode).toBe(200);
      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    });
  });

  describe('getEticketing', () => {
    it('routes GET request through ngrok proxy when configured', async () => {
      process.env.IRCTC_ONLINE_CHARTS_BASE_URL =
        'https://tunnel123.ngrok-free.app';
      mockAxiosGet.mockResolvedValueOnce({
        status: 200,
        data: JSON.stringify({ trainNumber: '12782' }),
      });

      const res = await service.getEticketing(
        '/eticketing/protected/mapps1/trnscheduleenquiry/12782',
      );

      expect(res.statusCode).toBe(200);
      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://tunnel123.ngrok-free.app/eticketing/protected/mapps1/trnscheduleenquiry/12782',
        expect.objectContaining({
          headers: expect.objectContaining({
            'ngrok-skip-browser-warning': 'true',
          }),
        }),
      );
    });

    it('falls back to direct IRCTC when ngrok GET fails', async () => {
      process.env.IRCTC_ONLINE_CHARTS_BASE_URL =
        'https://tunnel123.ngrok-free.app';
      mockAxiosGet.mockRejectedValueOnce(new Error('Ngrok tunnel down'));
      mockAxiosGet.mockResolvedValueOnce({
        status: 200,
        data: JSON.stringify({ trainNumber: '12782' }),
      });

      const res = await service.getEticketing(
        '/eticketing/protected/mapps1/trnscheduleenquiry/12782',
      );

      expect(res.statusCode).toBe(200);
      expect(mockAxiosGet).toHaveBeenCalledTimes(2);
      expect(mockAxiosGet).toHaveBeenLastCalledWith(
        'https://www.irctc.co.in/eticketing/protected/mapps1/trnscheduleenquiry/12782',
        expect.any(Object),
      );
    });
  });
});
