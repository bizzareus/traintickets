import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import axios from 'axios';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { createRetryingAxiosClient } from '../common/retrying-axios';
import type { AxiosInstance } from 'axios';

const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';
/** Single-use UPI QR lifetime (seconds). Enough to scan + approve. */
const QR_CLOSE_BY_SECONDS = 1800;

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status?: string;
};

export type RazorpayQrCode = {
  id: string;
  imageUrl: string;
  status?: string;
};

export type RazorpayPaymentItem = {
  id: string;
  status?: string;
  amount?: number;
  currency?: string;
  order_id?: string;
  notes?: Record<string, unknown>;
};

export type UpiAppIntents = {
  /** Generic `upi://pay?...` — every UPI app handles it. */
  upiIntent: string;
  /** Google Pay deep link. */
  gpayIntent: string;
  /** PhonePe deep link. */
  phonepeIntent: string;
};

/**
 * Derive per-app UPI intent links from a decoded `upi://pay?...` string by
 * re-scheming only — every query param (including the provider's own
 * transaction refs) is preserved byte-for-byte so attribution survives.
 * Returns null when the input is not a valid UPI intent URL.
 */
export function buildUpiAppIntents(intentUrl: string): UpiAppIntents | null {
  let parsed: URL;
  try {
    parsed = new URL(intentUrl.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'upi:' || !parsed.searchParams.get('pa')) {
    return null;
  }
  const canonical = `upi://${parsed.host}${parsed.pathname}${parsed.search}`;
  return {
    upiIntent: canonical,
    gpayIntent: canonical.replace(/^upi:/, 'tez:'),
    phonepeIntent: canonical.replace(/^upi:\/\/pay/, 'phonepe://pay'),
  };
}

/**
 * Decode the UPI intent string embedded in a QR PNG. Pure function over
 * bytes — unit-testable without network.
 */
export function decodeQrIntent(pngBuffer: Buffer): string | null {
  try {
    const png = PNG.sync.read(pngBuffer);
    const pixels = new Uint8ClampedArray(
      png.data.buffer,
      png.data.byteOffset,
      png.data.length,
    );
    return jsQR(pixels, png.width, png.height)?.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Constant-time HMAC-SHA256 check for Razorpay webhook signatures
 * (`x-razorpay-signature` header over the raw request body).
 */
export function verifyRazorpayWebhookSignature(
  rawBody: Buffer | string,
  signature: string | undefined,
  secret: string | undefined,
): boolean {
  if (!rawBody || !signature || !secret) return false;
  const expected = createHmac('sha256', secret)
    .update(typeof rawBody === 'string' ? rawBody : rawBody)
    .digest('hex');
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Thin Razorpay REST client (Basic auth). All chart-alert money movement —
 * orders, single-use UPI QRs, refunds, verification — goes through here so
 * the payment service stays orchestration-only.
 */
@Injectable()
export class RazorpayClient {
  private readonly logger = new Logger(RazorpayClient.name);
  private readonly client: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    this.client = createRetryingAxiosClient({
      serviceName: 'razorpay',
      retries: 2,
      retryPost: false,
    });
    this.client.defaults.baseURL = RAZORPAY_API_BASE;
    this.client.defaults.timeout = 15_000;
  }

  private get keyId(): string {
    return this.config.get<string>('RAZORPAY_KEY_ID')?.trim() ?? '';
  }

  private get keySecret(): string {
    return this.config.get<string>('RAZORPAY_KEY_SECRET')?.trim() ?? '';
  }

  get webhookSecret(): string {
    return this.config.get<string>('RAZORPAY_WEBHOOK_SECRET')?.trim() ?? '';
  }

  get isConfigured(): boolean {
    return Boolean(this.keyId && this.keySecret);
  }

  private authHeaders(): Record<string, string> {
    const token = Buffer.from(`${this.keyId}:${this.keySecret}`).toString(
      'base64',
    );
    return { Authorization: `Basic ${token}` };
  }

  private requireConfigured(): void {
    if (!this.isConfigured) {
      throw new Error(
        'Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing)',
      );
    }
  }

  async createOrder(params: {
    amountPaise: number;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<RazorpayOrder> {
    this.requireConfigured();
    const res = await this.client.post<RazorpayOrder>(
      '/orders',
      {
        amount: params.amountPaise,
        currency: 'INR',
        receipt: params.receipt,
        notes: params.notes ?? {},
      },
      { headers: this.authHeaders() },
    );
    if (!res.data?.id) throw new Error('Razorpay order creation failed');
    return res.data;
  }

  async createUpiQr(params: {
    amountPaise: number;
    name: string;
    description?: string;
    notes?: Record<string, string>;
  }): Promise<RazorpayQrCode> {
    this.requireConfigured();
    const res = await this.client.post<{
      id?: string;
      image_url?: string;
      status?: string;
    }>(
      '/payments/qr_codes',
      {
        type: 'upi_qr',
        name: params.name,
        usage: 'single_use',
        fixed_amount: true,
        payment_amount: params.amountPaise,
        description: params.description,
        close_by: Math.floor(Date.now() / 1000) + QR_CLOSE_BY_SECONDS,
        notes: params.notes ?? {},
      },
      { headers: this.authHeaders() },
    );
    if (!res.data?.id || !res.data?.image_url) {
      throw new Error('Razorpay QR creation failed');
    }
    return {
      id: res.data.id,
      imageUrl: res.data.image_url,
      status: res.data.status,
    };
  }

  /** Payments captured against an order (for status polling). */
  async orderPayments(orderId: string): Promise<RazorpayPaymentItem[]> {
    this.requireConfigured();
    const res = await this.client.get<{
      items?: RazorpayPaymentItem[];
    }>(`/orders/${encodeURIComponent(orderId)}/payments`, {
      headers: this.authHeaders(),
    });
    return Array.isArray(res.data?.items) ? res.data.items : [];
  }

  async fetchPayment(paymentId: string): Promise<RazorpayPaymentItem> {
    this.requireConfigured();
    const res = await this.client.get<RazorpayPaymentItem>(
      `/payments/${encodeURIComponent(paymentId)}`,
      { headers: this.authHeaders() },
    );
    return res.data;
  }

  async createRefund(params: {
    paymentId: string;
    amountPaise: number;
    notes?: Record<string, string>;
  }): Promise<{ id?: string }> {
    this.requireConfigured();
    const res = await this.client.post<{ id?: string }>(
      '/refunds',
      {
        payment_id: params.paymentId,
        amount: params.amountPaise,
        notes: params.notes ?? {},
      },
      { headers: this.authHeaders() },
    );
    if (!res.data?.id) throw new Error('Razorpay refund failed');
    return { id: res.data.id };
  }

  /**
   * Fetch QR PNG bytes and extract its UPI intent, then derive per-app
   * links. Never throws — returns nulls on any failure so the caller can
   * degrade to QR-image-only display.
   */
  async resolveQrIntents(qrImageUrl: string): Promise<{
    intent: string | null;
    apps: UpiAppIntents | null;
  }> {
    try {
      const res = await axios.get<ArrayBuffer>(qrImageUrl, {
        responseType: 'arraybuffer',
        timeout: 15_000,
      });
      const intent = decodeQrIntent(Buffer.from(res.data));
      if (!intent) return { intent: null, apps: null };
      return { intent, apps: buildUpiAppIntents(intent) };
    } catch (err) {
      this.logger.warn(
        `QR intent resolve failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { intent: null, apps: null };
    }
  }
}
