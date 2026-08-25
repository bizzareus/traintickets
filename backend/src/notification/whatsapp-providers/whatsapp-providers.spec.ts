import { ConfigService } from '@nestjs/config';
import { WasenderProvider } from './wasender.provider';
import { WatiProvider } from './wati.provider';
import { WhatsAppProviderFactory } from './whatsapp.provider-factory';
import axios from 'axios';

const sendEmailMock = jest
  .fn()
  .mockResolvedValue({ data: { id: 'email_123' } });
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: sendEmailMock,
    },
  })),
}));

jest.mock('axios', () => {
  const instance = {
    post: jest.fn(),
    get: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  };
  return {
    __esModule: true,
    default: {
      ...instance,
      create: jest.fn(() => instance),
      isAxiosError: jest.fn((err: any) => Boolean(err?.isAxiosError)),
    },
    ...instance,
    create: jest.fn(() => instance),
    isAxiosError: jest.fn((err: any) => Boolean(err?.isAxiosError)),
  };
});
const mockedAxios = axios as unknown as jest.Mocked<typeof axios>;

function mockConfig(env: Record<string, string | undefined>): ConfigService {
  return {
    get: jest.fn((key: string) => env[key]),
  } as unknown as ConfigService;
}

describe('WhatsApp Providers & Factory (Strategy Pattern)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('WasenderProvider', () => {
    it('sends freeform text message when WASENDER_API_KEY is present', async () => {
      const config = mockConfig({
        WASENDER_API_KEY: 'wasender_secret',
        RESEND_API_KEY: 'resend_secret',
        MONITORING_ADMIN_EMAIL: 'admin@example.com',
      });
      const provider = new WasenderProvider(config);

      mockedAxios.post.mockResolvedValueOnce({ data: { success: true } });

      const result = await provider.sendWhatsApp({
        mobile: '9876543210',
        text: 'Hello test',
      });

      expect(result).toBe(true);
      expect(mockedAxios.post.mock.calls.length).toBe(1);
      expect(mockedAxios.post.mock.calls[0][0]).toBe(
        'https://www.wasenderapi.com/api/send-message',
      );
      expect(mockedAxios.post.mock.calls[0][1]).toEqual({
        to: '+919876543210',
        text: 'Hello test',
      });
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it('formats phone numbers starting with 0 properly with +91 prefix', async () => {
      const config = mockConfig({
        WASENDER_API_KEY: 'wasender_secret',
        RESEND_API_KEY: 'resend_secret',
        MONITORING_ADMIN_EMAIL: 'admin@example.com',
      });
      const provider = new WasenderProvider(config);

      mockedAxios.post.mockResolvedValueOnce({ data: { success: true } });

      const result = await provider.sendWhatsApp({
        mobile: '09712640278',
        text: 'Hello test with leading 0',
      });

      expect(result).toBe(true);
      expect(mockedAxios.post.mock.calls.length).toBe(1);
      expect(mockedAxios.post.mock.calls[0][1]).toEqual({
        to: '+919712640278',
        text: 'Hello test with leading 0',
      });
    });

    it('formats complex phone formats with leading zeroes or spaces (+91 09712640278, 009712640278)', async () => {
      const config = mockConfig({
        WASENDER_API_KEY: 'wasender_secret',
        RESEND_API_KEY: 'resend_secret',
        MONITORING_ADMIN_EMAIL: 'admin@example.com',
      });
      const provider = new WasenderProvider(config);

      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      await provider.sendWhatsApp({
        mobile: '+91 09712640278',
        text: 'Test +91 0...',
      });

      expect(mockedAxios.post.mock.calls[0][1]).toEqual({
        to: '+919712640278',
        text: 'Test +91 0...',
      });

      await provider.sendWhatsApp({
        mobile: '009712640278',
        text: 'Test 00...',
      });

      expect(mockedAxios.post.mock.calls[1][1]).toEqual({
        to: '+919712640278',
        text: 'Test 00...',
      });
    });

    it('returns false and sends failure email to MONITORING_ADMIN_EMAIL when WASENDER_API_KEY is missing', async () => {
      const config = mockConfig({
        RESEND_API_KEY: 'resend_secret',
        MONITORING_ADMIN_EMAIL: 'admin@example.com',
      });
      const provider = new WasenderProvider(config);

      const result = await provider.sendWhatsApp({
        mobile: '9876543210',
        text: 'Hello test',
      });

      expect(result).toBe(false);
      expect(mockedAxios.post.mock.calls.length).toBe(0);
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      const [emailPayload] = sendEmailMock.mock.calls[0] as [
        { to: string[]; subject: string; html: string },
      ];
      expect(emailPayload.to).toEqual(['admin@example.com']);
      expect(emailPayload.subject).toContain('[WASender Failure]');
      expect(emailPayload.html).toContain('WASENDER_API_KEY is not set');
    });

    it('returns false and sends failure email with WASender API error response to MONITORING_ADMIN_EMAIL when API call fails with 422 JID error', async () => {
      const config = mockConfig({
        WASENDER_API_KEY: 'wasender_secret',
        RESEND_API_KEY: 'resend_secret',
        MONITORING_ADMIN_EMAIL: 'admin@example.com',
      });
      const provider = new WasenderProvider(config);

      const axiosError = {
        isAxiosError: true,
        message: 'Request failed with status code 422',
        response: {
          status: 422,
          data: {
            message:
              'The to must be a valid WhatsApp JID (User, Group, or Channel format).',
            errors: {
              to: [
                'The to must be a valid WhatsApp JID (User, Group, or Channel format).',
              ],
            },
          },
        },
      };
      mockedAxios.post.mockRejectedValueOnce(axiosError);

      const result = await provider.sendWhatsApp({
        mobile: '09712640278',
        text: 'Hello test alert',
      });

      expect(result).toBe(false);
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      const [emailPayload] = sendEmailMock.mock.calls[0] as [
        { to: string[]; subject: string; html: string },
      ];
      expect(emailPayload.to).toEqual(['admin@example.com']);
      expect(emailPayload.subject).toContain('[WASender Failure]');
      expect(emailPayload.subject).toContain('919712640278');
      expect(emailPayload.html).toContain(
        'The to must be a valid WhatsApp JID',
      );
      expect(emailPayload.html).toContain('HTTP 422');
    });
  });

  describe('WatiProvider', () => {
    it('sends template message to WATI API v2 endpoint', async () => {
      const config = mockConfig({
        WATI_API_ENDPOINT: 'https://live-mt-server.wati.io',
        WATI_ACCESS_TOKEN: 'wati_token_123',
        WATI_CHANNEL_NUMBER: '919999000000',
      });
      const provider = new WatiProvider(config);

      mockedAxios.post.mockResolvedValueOnce({
        data: { result: true, validWhatsAppNumber: true },
      });

      const result = await provider.sendWhatsApp({
        mobile: '9876543210',
        text: 'Fallback text',
        templateName: 'chart_preparation_alert',
        broadcastName: 'lastberth_test',
        parameters: [
          { name: 'name', value: 'Kartik' },
          { name: 'train_number', value: '11039' },
        ],
      });

      expect(result).toBe(true);
      expect(mockedAxios.post.mock.calls.length).toBe(1);
      expect(mockedAxios.post.mock.calls[0][0]).toBe(
        'https://live-mt-server.wati.io/api/v1/sendTemplateMessage?whatsappNumber=919876543210',
      );
    });

    it('returns false if WATI config or templateName is missing', async () => {
      const config = mockConfig({});
      const provider = new WatiProvider(config);

      const result = await provider.sendWhatsApp({
        mobile: '9876543210',
        text: 'Fallback text',
      });

      expect(result).toBe(false);
      expect(mockedAxios.post.mock.calls.length).toBe(0);
    });
  });

  describe('WhatsAppProviderFactory Strategy Selection', () => {
    it('selects WatiProvider strategy when WHATSAPP_PROVIDER=wati', async () => {
      const config = mockConfig({ WHATSAPP_PROVIDER: 'wati' });
      const wasender = new WasenderProvider(config);
      const wati = new WatiProvider(config);

      const wasenderSpy = jest
        .spyOn(wasender, 'sendWhatsApp')
        .mockResolvedValue(true);
      const watiSpy = jest.spyOn(wati, 'sendWhatsApp').mockResolvedValue(true);

      const factory = new WhatsAppProviderFactory(config, wasender, wati);

      expect(factory.providerName).toBe('wati');

      await factory.sendWhatsApp({
        mobile: '9876543210',
        text: 'Test',
        templateName: 'chart_preparation_alert',
      });

      expect(watiSpy).toHaveBeenCalledTimes(1);
      expect(wasenderSpy).not.toHaveBeenCalled();
    });

    it('defaults to WasenderProvider strategy when WHATSAPP_PROVIDER=wasender or empty', async () => {
      const config = mockConfig({});
      const wasender = new WasenderProvider(config);
      const wati = new WatiProvider(config);

      const wasenderSpy = jest
        .spyOn(wasender, 'sendWhatsApp')
        .mockResolvedValue(true);
      const watiSpy = jest.spyOn(wati, 'sendWhatsApp').mockResolvedValue(true);

      const factory = new WhatsAppProviderFactory(config, wasender, wati);

      expect(factory.providerName).toBe('wasender');

      await factory.sendWhatsApp({
        mobile: '9876543210',
        text: 'Test',
      });

      expect(wasenderSpy).toHaveBeenCalledTimes(1);
      expect(watiSpy).not.toHaveBeenCalled();
    });
  });
});
