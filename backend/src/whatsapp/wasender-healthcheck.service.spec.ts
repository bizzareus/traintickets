import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { AxiosInstance } from 'axios';
import {
  WasenderHealthcheckService,
  WasenderHealthcheckResult,
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
          }),
        },
      ],
    }).compile();

    service = module.get<WasenderHealthcheckService>(
      WasenderHealthcheckService,
    );
    configService = module.get<ConfigService>(ConfigService);
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

  it('reports healthy when status endpoint returns connected', async () => {
    const httpClient = getHttpClient(service);
    jest.spyOn(httpClient, 'get').mockResolvedValue({
      data: { status: 'connected' },
    });

    const result = await service.checkHealth('test');
    expect(result.healthy).toBe(true);
    expect(result.status).toBe('connected');
    expect(result.qrSent).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
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

    const calls = mockSend.mock.calls as unknown as Array<
      [
        {
          to: string[];
          subject: string;
          html: string;
          attachments: Array<{ filename: string }>;
        },
      ]
    >;
    const emailCall = calls[0][0];
    expect(emailCall.to).toEqual(['admin@lastberth.com']);
    expect(emailCall.subject).toContain('WhatsApp Disconnected - Scan QR Code');
    expect(emailCall.html).toContain('Session #42');
    expect(emailCall.attachments).toHaveLength(1);
    expect(emailCall.attachments[0].filename).toBe('whatsapp-reconnect-qr.png');
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

  it('treats 401 unauthenticated status check as logged_out and triggers reconnect', async () => {
    const httpClient = getHttpClient(service);
    const error401 = {
      isAxiosError: true,
      response: {
        status: 401,
        data: {
          success: false,
          message: 'Session not found for provided API key',
        },
      },
      message: 'Request failed with status code 401',
    };

    jest.spyOn(httpClient, 'get').mockRejectedValue(error401);
    jest.spyOn(httpClient, 'post').mockResolvedValue({
      data: {
        success: true,
        data: {
          status: 'NEED_SCAN',
          qrCode: '2@reconnectQrCode401',
        },
      },
    });

    const result = await service.checkHealth('test');
    expect(result.healthy).toBe(false);
    expect(result.status).toBe('logged_out');
    expect(result.qrSent).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('executes scheduled cron check without throwing', async () => {
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

  it('returns state metadata from getState()', () => {
    const state = service.getState();
    expect(state.enabled).toBe(true);
    expect(state.sessionId).toBe('42');
    expect(state.adminEmail).toBe('admin@lastberth.com');
  });
});
