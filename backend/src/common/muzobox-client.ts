import type { ConfigService } from '@nestjs/config';
import { createRetryingAxiosClient } from './retrying-axios';

const DEFAULT_MUZOBOX_API_URL =
  'https://ai-jukebox-backend-production.up.railway.app/api';

export function muzoboxAuthHeaders(config: ConfigService) {
  const key = config.get<string>('MUZOBOX_PROXY_API_KEY')?.trim();
  return key ? { 'x-api-key': key } : undefined;
}

/** Share chart-alert proxy configuration; never retry money-moving POSTs. */
export function createMuzoboxClient(config: ConfigService) {
  const client = createRetryingAxiosClient({
    serviceName: 'muzobox',
    retries: 2,
    retryPost: false,
  });
  client.defaults.baseURL =
    config.get<string>('MUZOBOX_API_URL')?.trim().replace(/\/$/, '') ||
    DEFAULT_MUZOBOX_API_URL;
  return client;
}

/** Muzobox amounts are INR rupees, not Razorpay paise. */
export interface MuzoboxPaymentLink {
  id: string;
  amount: number;
  payUrl: string;
  referenceId?: string;
  razorpayOrderId?: string;
}

export interface MuzoboxPaymentStatus {
  status: 'created' | 'paid' | 'failed';
  amount: number;
  referenceId: string | null;
  razorpayPaymentId: string | null;
  razorpayOrderId: string | null;
}
