import { ConfigService } from '@nestjs/config';
import { WasenderProvider } from './wasender.provider';
import { Msg91Provider } from './msg91.provider';
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

  describe('Msg91Provider', () => {
    it('sends chart_alert_tickets_found template with first 4 parameters as bodies', async () => {
      const config = mockConfig({
        MSG91_AUTH_KEY: 'msg91_secret',
        MSG91_INTEGRATED_NUMBER: '15554731911',
        MSG91_NAMESPACE: 'test-namespace',
      });
      const provider = new Msg91Provider(config);

      mockedAxios.post.mockResolvedValueOnce({ data: { type: 'success' } });

      const result = await provider.sendWhatsApp({
        mobile: '9876543210',
        text: 'Fallback text',
        templateName: 'subscription_alert',
        parameters: [
          { name: 'name', value: 'Passenger' },
          { name: 'train_number', value: '11039' },
          { name: 'train_name', value: 'Maharashtra Exp' },
          { name: 'from_code', value: 'PUNE' },
          { name: 'to_code', value: 'NGP' },
          { name: 'journey_date', value: '12 Sep 2026' },
        ],
      });

      expect(result).toBe(true);
      expect(mockedAxios.post.mock.calls.length).toBe(1);
      expect(mockedAxios.post.mock.calls[0][0]).toBe(
        'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/',
      );
      expect(mockedAxios.post.mock.calls[0][2]).toMatchObject({
        headers: {
          'Content-Type': 'application/json',
          authkey: 'msg91_secret',
        },
      });
      expect(mockedAxios.post.mock.calls[0][1]).toEqual({
        integrated_number: '15554731911',
        content_type: 'template',
        payload: {
          messaging_product: 'whatsapp',
          type: 'template',
          template: {
            name: 'chart_alert_tickets_found',
            language: { code: 'en', policy: 'deterministic' },
            namespace: 'test-namespace',
            to_and_components: [
              {
                to: ['919876543210'],
                components: {
                  body_1: { type: 'text', value: 'Passenger' },
                  body_2: { type: 'text', value: '11039' },
                  body_3: { type: 'text', value: 'Maharashtra Exp' },
                  body_4: { type: 'text', value: 'PUNE' },
                },
              },
            ],
          },
        },
      });
    });

    it('maps uncovered-leg templates to chart_alert_no_ticket_found with 5 bodies', async () => {
      const config = mockConfig({ MSG91_AUTH_KEY: 'msg91_secret' });
      const provider = new Msg91Provider(config);

      mockedAxios.post.mockResolvedValueOnce({ data: { type: 'success' } });

      const result = await provider.sendWhatsApp({
        mobile: '+91 9876543210',
        text: 'Fallback text',
        templateName: 'uncovered_leg__shortlink_alert',
        parameters: [
          { name: 'name', value: 'Passenger' },
          { name: 'train_number', value: '11039' },
        ],
      });

      expect(result).toBe(true);
      expect(mockedAxios.post.mock.calls[0][1]).toEqual({
        integrated_number: '15554731911',
        content_type: 'template',
        payload: {
          messaging_product: 'whatsapp',
          type: 'template',
          template: {
            name: 'chart_alert_no_ticket_found',
            language: { code: 'en', policy: 'deterministic' },
            namespace: '6d56ff76_c549_4ce8_a6b5_280c2377d64b',
            to_and_components: [
              {
                to: ['919876543210'],
                components: {
                  body_1: { type: 'text', value: 'Passenger' },
                  body_2: { type: 'text', value: '11039' },
                  body_3: { type: 'text', value: 'N/A' },
                  body_4: { type: 'text', value: 'N/A' },
                  body_5: { type: 'text', value: 'N/A' },
                },
              },
            ],
          },
        },
      });
    });

    it('maps chart-prepare flow (few parameters) to chart_prepare template', async () => {
      const config = mockConfig({ MSG91_AUTH_KEY: 'msg91_secret' });
      const provider = new Msg91Provider(config);

      mockedAxios.post.mockResolvedValueOnce({ data: { type: 'success' } });

      const result = await provider.sendWhatsApp({
        mobile: '9876543210',
        text: 'Fallback text',
        templateName: 'subscription_alert',
        parameters: [
          { name: 'train_number', value: '11039' },
          { name: 'train_name', value: 'Maharashtra Exp' },
          { name: 'journey_date', value: '2026-09-12' },
          { name: 'check_url', value: 'https://lastberth.com/r/abc' },
        ],
      });

      expect(result).toBe(true);
      expect(mockedAxios.post.mock.calls[0][1]).toMatchObject({
        payload: { template: { name: 'chart_prepare' } },
      });
    });

    it('returns false without calling the API when MSG91_AUTH_KEY is missing', async () => {
      const config = mockConfig({});
      const provider = new Msg91Provider(config);

      const result = await provider.sendWhatsApp({
        mobile: '9876543210',
        text: 'Hello test',
        templateName: 'chart_prepare',
      });

      expect(result).toBe(false);
      expect(mockedAxios.post.mock.calls.length).toBe(0);
    });

    it('returns false when the MSG91 API call fails', async () => {
      const config = mockConfig({ MSG91_AUTH_KEY: 'msg91_secret' });
      const provider = new Msg91Provider(config);

      mockedAxios.post.mockRejectedValueOnce({
        isAxiosError: true,
        message: 'Request failed with status code 401',
        response: { status: 401, data: { message: 'Invalid authkey' } },
      });

      const result = await provider.sendWhatsApp({
        mobile: '9876543210',
        text: 'Hello test',
        templateName: 'chart_prepare',
      });

      expect(result).toBe(false);
    });
  });

  describe('WhatsAppProviderFactory Strategy Selection', () => {
    it('selects Msg91Provider strategy by default (WHATSAPP_PROVIDER unset)', async () => {
      const config = mockConfig({});
      const wasender = new WasenderProvider(config);
      const msg91 = new Msg91Provider(config);

      const wasenderSpy = jest
        .spyOn(wasender, 'sendWhatsApp')
        .mockResolvedValue(true);
      const msg91Spy = jest
        .spyOn(msg91, 'sendWhatsApp')
        .mockResolvedValue(true);

      const factory = new WhatsAppProviderFactory(config, wasender, msg91);

      expect(factory.providerName).toBe('msg91');

      await factory.sendWhatsApp({
        mobile: '9876543210',
        text: 'Test',
      });

      expect(msg91Spy).toHaveBeenCalledTimes(1);
      expect(wasenderSpy).not.toHaveBeenCalled();
    });

    it('selects WasenderProvider strategy when WHATSAPP_PROVIDER=wasender', async () => {
      const config = mockConfig({ WHATSAPP_PROVIDER: 'wasender' });
      const wasender = new WasenderProvider(config);
      const msg91 = new Msg91Provider(config);

      const wasenderSpy = jest
        .spyOn(wasender, 'sendWhatsApp')
        .mockResolvedValue(true);
      const msg91Spy = jest
        .spyOn(msg91, 'sendWhatsApp')
        .mockResolvedValue(true);

      const factory = new WhatsAppProviderFactory(config, wasender, msg91);

      expect(factory.providerName).toBe('wasender');

      await factory.sendWhatsApp({
        mobile: '9876543210',
        text: 'Test',
      });

      expect(wasenderSpy).toHaveBeenCalledTimes(1);
      expect(msg91Spy).not.toHaveBeenCalled();
    });

    it('defaults to Msg91Provider strategy when WHATSAPP_PROVIDER is empty', async () => {
      const config = mockConfig({});
      const wasender = new WasenderProvider(config);
      const msg91 = new Msg91Provider(config);

      const wasenderSpy = jest
        .spyOn(wasender, 'sendWhatsApp')
        .mockResolvedValue(true);
      const msg91Spy = jest
        .spyOn(msg91, 'sendWhatsApp')
        .mockResolvedValue(true);

      const factory = new WhatsAppProviderFactory(config, wasender, msg91);

      expect(factory.providerName).toBe('msg91');

      await factory.sendWhatsApp({
        mobile: '9876543210',
        text: 'Test',
      });

      expect(msg91Spy).toHaveBeenCalledTimes(1);
      expect(wasenderSpy).not.toHaveBeenCalled();
    });
  });
});
