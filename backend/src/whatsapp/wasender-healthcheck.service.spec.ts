import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { AxiosInstance } from 'axios';
import {
  WasenderHealthcheckService,
  WasenderHealthcheckResult,
  extractWasenderStatus,
} from './wasender-healthcheck.service';

const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: mockSend,
    },
  })),
}));

describe('WasenderHealthcheckService', () => {
  let service: WasenderHealthcheckService;
  let configService: ConfigService;

  const mockConfig = (envMap: Record<string, string | undefined>) => ({
    get: jest.fn((key: string) => envMap[key]),
  });

  const getHttpClient = (s: WasenderHealthcheckService): AxiosInstance =>
    (s as unknown as { httpClient: AxiosInstance }).httpClient;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({ id: 'resend-msg-123' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WasenderHealthcheckService,
        {
          provide: ConfigService,
          useValue: mockConfig({
            WASENDER_API_KEY: 'test_session_api_key',
            WASENDER_PERSONAL_ACCESS_TOKEN: 'test_pat_token',
            WASENDER_SESSION_ID: '42',
            RESEND_API_KEY: 'test_resend_key',
            MONITORING_ADMIN_EMAIL: 'admin@lastberth.com',
            WHATSAPP_PROVIDER: 'wasender',
          }),
        },
      ],
    }).compile();

    service = module.get<WasenderHealthcheckService>(
      WasenderHealthcheckService,
    );
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('extractWasenderStatus', () => {
    it('extracts top-level status string', () => {
      expect(extractWasenderStatus({ status: 'CONNECTED' })).toBe('connected');
      expect(extractWasenderStatus({ status: 'working' })).toBe('working');
    });

    it('extracts nested data status and state', () => {
      expect(extractWasenderStatus({ data: { status: 'ONLINE' } })).toBe(
        'online',
      );
      expect(extractWasenderStatus({ data: { state: 'ready' } })).toBe('ready');
      expect(extractWasenderStatus({ session: { status: 'paired' } })).toBe(
        'paired',
      );
    });

    it('extracts boolean connected flags', () => {
      expect(extractWasenderStatus({ data: { connected: true } })).toBe(
        'connected',
      );
      expect(extractWasenderStatus({ isConnected: true })).toBe('connected');
      expect(extractWasenderStatus({ success: true })).toBe('connected');
    });

    it('returns null for empty or invalid data', () => {
      expect(extractWasenderStatus(null)).toBeNull();
      expect(extractWasenderStatus({})).toBeNull();
      expect(extractWasenderStatus('unknown')).toBeNull();
    });
  });

  it('returns NOT_CONFIGURED when WASENDER_API_KEY is missing', async () => {
    jest.spyOn(configService, 'get').mockImplementation((key: string) => {
      if (key === 'WASENDER_API_KEY') return undefined;
      if (key === 'WASENDER_PERSONAL_ACCESS_TOKEN') return undefined;
      return undefined;
    });

    const result: WasenderHealthcheckResult = await service.checkHealth();
    expect(result.healthy).toBe(false);
    expect(result.status).toBe('NOT_CONFIGURED');
    expect(result.qrSent).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('reports healthy when status endpoint returns connected or working synonyms', async () => {
    const httpClient = getHttpClient(service);
    jest.spyOn(httpClient, 'get').mockResolvedValue({
      data: { data: { status: 'WORKING' } },
    });

    const result = await service.checkHealth('test');
    expect(result.healthy).toBe(true);
    expect(result.status).toBe('connected');
    expect(result.qrSent).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('reports connecting status gracefully without sending alert email', async () => {
    const httpClient = getHttpClient(service);
    jest.spyOn(httpClient, 'get').mockResolvedValue({
      data: { status: 'connecting' },
    });

    const result = await service.checkHealth('test');
    expect(result.healthy).toBe(true);
    expect(result.status).toBe('connecting');
    expect(result.qrSent).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('handles HTTP 401 as INVALID_API_KEY without attempting QR reconnection', async () => {
    const httpClient = getHttpClient(service);
    const error401 = {
      isAxiosError: true,
      response: {
        status: 401,
        data: {
          success: false,
          message: 'Session not found for the provided API key',
        },
      },
      message: 'Request failed with status code 401',
    };

    jest.spyOn(httpClient, 'get').mockRejectedValue(error401);
    const postSpy = jest.spyOn(httpClient, 'post');

    const result = await service.checkHealth('manual_test');
    expect(result.healthy).toBe(false);
    expect(result.status).toBe('INVALID_API_KEY');
    expect(result.qrSent).toBe(false);
    expect(result.message).toContain('Session not found');

    // Should NOT have called connect POST endpoint
    expect(postSpy).not.toHaveBeenCalled();

    // Should have sent an API key error email instead of a QR email
    expect(mockSend).toHaveBeenCalledTimes(1);
    const emailCalls = mockSend.mock.calls as unknown as Array<
      [
        {
          to?: string[];
          subject?: string;
          html?: string;
          attachments?: Array<{ filename: string }>;
        },
      ]
    >;
    const emailCall = emailCalls[0][0];
    expect(emailCall.subject).toContain('Invalid API Key');
    expect(emailCall.html).toContain('WASender API Key Error');
  });

  it('triggers reconnect and emails QR code when status is logged_out', async () => {
    const httpClient = getHttpClient(service);
    jest.spyOn(httpClient, 'get').mockResolvedValue({
      data: { status: 'logged_out' },
    });
    jest.spyOn(httpClient, 'post').mockResolvedValue({
      data: {
        success: true,
        data: {
          status: 'NEED_SCAN',
          qrCode: '2@mockQrCodeDataString1234567890',
        },
      },
    });

    const result = await service.checkHealth('cron');
    expect(result.healthy).toBe(false);
    expect(result.status).toBe('logged_out');
    expect(result.qrSent).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);

    const emailCalls = mockSend.mock.calls as unknown as Array<
      [
        {
          to?: string[];
          subject?: string;
          html?: string;
          attachments?: Array<{ filename: string }>;
        },
      ]
    >;
    const emailCall = emailCalls[0][0];
    expect(emailCall.to).toEqual(['admin@lastberth.com']);
    expect(emailCall.subject).toContain('WhatsApp Disconnected - Scan QR Code');
    expect(emailCall.html).toContain('Session #42');
    expect(emailCall.attachments).toHaveLength(1);
    expect(emailCall.attachments?.[0]?.filename).toBe(
      'whatsapp-reconnect-qr.png',
    );
  });

  it('falls back to /qrcode endpoint when connect response does not contain qrCode directly', async () => {
    const httpClient = getHttpClient(service);
    jest.spyOn(httpClient, 'get').mockImplementation((url: string) => {
      if (url.endsWith('/api/status')) {
        return Promise.resolve({ data: { status: 'need_scan' } });
      }
      if (url.includes('/qrcode')) {
        return Promise.resolve({
          data: {
            success: true,
            data: { qrCode: '2@fallbackQrCodeString999' },
          },
        });
      }
      return Promise.reject(new Error('Unknown url'));
    });

    jest.spyOn(httpClient, 'post').mockResolvedValue({
      data: {
        success: true,
        data: {
          status: 'NEED_SCAN',
        },
      },
    });

    const result = await service.checkHealth('test');
    expect(result.healthy).toBe(false);
    expect(result.qrSent).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('skips scheduled cron when WHATSAPP_PROVIDER is not wasender', async () => {
    jest.spyOn(configService, 'get').mockImplementation((key: string) => {
      if (key === 'WHATSAPP_PROVIDER') return 'wati';
      if (key === 'WASENDER_API_KEY') return 'test_session_api_key';
      return undefined;
    });

    const checkSpy = jest.spyOn(service, 'checkHealth');
    await service.handleScheduledHealthcheck();
    expect(checkSpy).not.toHaveBeenCalled();
  });

  it('executes scheduled cron when WHATSAPP_PROVIDER is wasender', async () => {
    const spy = jest.spyOn(service, 'checkHealth').mockResolvedValue({
      healthy: true,
      status: 'connected',
      qrSent: false,
      message: 'Session is active',
      timestamp: new Date().toISOString(),
    });

    await service.handleScheduledHealthcheck();
    expect(spy).toHaveBeenCalledWith('cron');
  });

  it('throttles repeated cron alert emails within cooldown window', async () => {
    const httpClient = getHttpClient(service);
    jest.spyOn(httpClient, 'get').mockResolvedValue({
      data: { status: 'logged_out' },
    });
    jest.spyOn(httpClient, 'post').mockResolvedValue({
      data: {
        success: true,
        data: {
          status: 'NEED_SCAN',
          qrCode: '2@mockQrCodeDataString1234567890',
        },
      },
    });

    // First cron check sends email
    await service.checkHealth('cron');
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Second cron check within cooldown window suppresses duplicate email
    const secondResult = await service.checkHealth('cron');
    expect(secondResult.qrSent).toBe(false);
    expect(mockSend).toHaveBeenCalledTimes(1); // Still 1!
  });

  it('returns state metadata from getState()', () => {
    const state = service.getState();
    expect(state.enabled).toBe(true);
    expect(state.sessionId).toBe('42');
    expect(state.adminEmail).toBe('admin@lastberth.com');
    expect(state.activeProvider).toBe('wasender');
    expect(state.isWasenderActive).toBe(true);
  });
});
