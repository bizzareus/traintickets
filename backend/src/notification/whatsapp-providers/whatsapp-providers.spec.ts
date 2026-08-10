import { ConfigService } from '@nestjs/config';
import { WasenderProvider } from './wasender.provider';
import { WatiProvider } from './wati.provider';
import { WhatsAppProviderFactory } from './whatsapp.provider-factory';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

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
      const config = mockConfig({ WASENDER_API_KEY: 'wasender_secret' });
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
    });

    it('returns false when WASENDER_API_KEY is missing', async () => {
      const config = mockConfig({});
      const provider = new WasenderProvider(config);

      const result = await provider.sendWhatsApp({
        mobile: '9876543210',
        text: 'Hello test',
      });

      expect(result).toBe(false);
      expect(mockedAxios.post.mock.calls.length).toBe(0);
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
        'https://live-mt-server.wati.io/api/v2/sendTemplateMessage?whatsappNumber=919876543210',
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
