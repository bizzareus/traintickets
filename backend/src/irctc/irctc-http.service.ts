import { Injectable, Logger } from '@nestjs/common';
import { createRetryingAxiosClient } from '../common/retrying-axios';
import { retryTransient } from '../common/fetch-with-timeout';
import { buildCurl, curlLogEnabled } from '../common/curl-log';
let gotScrapingFn: typeof import('got-scraping').gotScraping | null = null;
async function getGotScraping(): Promise<
  typeof import('got-scraping').gotScraping
> {
  if (!gotScrapingFn) {
    try {
      const mod = require('got-scraping');
      gotScrapingFn =
        mod.gotScraping || mod.default?.gotScraping || mod.default || mod;
    } catch {
      const mod = await (Function('return import("got-scraping")')() as Promise<
        typeof import('got-scraping')
      >);
      gotScrapingFn = mod.gotScraping;
    }
  }
  if (!gotScrapingFn) {
    throw new Error('Failed to load got-scraping module');
  }
  return gotScrapingFn;
}

const DEFAULT_IRCTC_BASE_URL = 'https://www.irctc.co.in';

const DEFAULT_CHART_ATTEMPT_TIMEOUT_MS = (() => {
  const n = Number.parseInt(process.env.IRCTC_CHART_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(n) && n >= 1_000 && n <= 30_000 ? n : 5_000;
})();

const DEFAULT_CHART_MAX_ATTEMPTS = (() => {
  const n = Number.parseInt(process.env.IRCTC_CHART_MAX_ATTEMPTS ?? '', 10);
  return Number.isFinite(n) && n >= 1 && n <= 6 ? n : 4;
})();

export interface IrctcHttpOptions {
  cookies?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  logContext?: string;
  referer?: string;
}

export interface IrctcHttpResponse {
  statusCode: number;
  body: string;
}

@Injectable()
export class IrctcHttpService {
  private readonly logger = new Logger(IrctcHttpService.name);

  /**
   * Logs an upstream response body (truncated). Never logs headers, so the
   * IRCTC cookie bundle can't leak — only URL, status, and a body preview.
   * Same knob as request (curl) logging: `IRCTC_CURL_LOG=false` mutes.
   */
  private logResponse(
    logCtx: string,
    url: string,
    statusCode: number,
    body: string,
  ): void {
    if (!curlLogEnabled()) return;
    const preview = body.slice(0, 2000).replace(/\s+/g, ' ');
    const truncated = body.length > 2000 ? '…(truncated)' : '';
    this.logger.log(
      `${logCtx} response url=${url} status=${statusCode} bytes=${body.length} body=${preview}${truncated}`,
    );
  }

  private readonly axiosClient = createRetryingAxiosClient({
    serviceName: 'irctc/http-gateway',
    retries: 2,
    retryTimeouts: true,
  });

  /**
   * Returns the configured base URL for IRCTC online-charts requests.
   * If `IRCTC_ONLINE_CHARTS_BASE_URL` or `IRCTC_BASE_URL` is set, uses that (e.g. ngrok endpoint).
   * Otherwise defaults to `https://www.irctc.co.in`.
   */
  getOnlineChartsBaseUrl(): string {
    const custom =
      process.env.IRCTC_ONLINE_CHARTS_BASE_URL?.trim() ||
      process.env.IRCTC_BASE_URL?.trim();
    if (custom) {
      return custom.replace(/\/+$/, '');
    }
    return DEFAULT_IRCTC_BASE_URL;
  }

  /**
   * Returns true if requests are being routed through a custom reverse-proxy / ngrok tunnel.
   */
  isProxied(): boolean {
    const custom =
      process.env.IRCTC_ONLINE_CHARTS_BASE_URL?.trim() ||
      process.env.IRCTC_BASE_URL?.trim();
    return Boolean(custom && !custom.includes('irctc.co.in'));
  }

  /**
   * Resolves outgoing forward proxy URL (e.g. residential forward proxy) if enabled.
   */
  getOutgoingProxyUrl(): string | undefined {
    const enabled =
      process.env.IRCTC_PROXY_ENABLED?.trim().toLowerCase() === 'true' ||
      process.env.IRCTC_PROXY_ENABLED?.trim() === '1';
    if (!enabled) return undefined;
    return (
      process.env.IRCTC_PROXY_URL?.trim() ||
      process.env.HTTPS_PROXY?.trim() ||
      process.env.HTTP_PROXY?.trim() ||
      undefined
    );
  }

  /**
   * Constructs standardized browser-like headers for IRCTC requests.
   */
  buildHeaders(options?: {
    cookies?: string;
    referer?: string;
  }): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/json',
      DNT: '1',
      Origin: 'https://www.irctc.co.in',
      Referer: options?.referer || 'https://www.irctc.co.in/online-charts/',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      'sec-ch-ua':
        '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
    };

    if (this.isProxied()) {
      headers['ngrok-skip-browser-warning'] = 'true';
    }

    if (options?.cookies?.trim()) {
      headers['Cookie'] = options.cookies.trim();
    }

    return headers;
  }

  /**
   * Sends a POST request to an IRCTC online-charts endpoint.
   * If a custom ngrok proxy base URL is configured, routes through it first,
   * with automatic fallback to direct IRCTC if the tunnel is unreachable.
   */
  async postOnlineCharts(
    path: string,
    body: unknown,
    options: IrctcHttpOptions = {},
  ): Promise<IrctcHttpResponse> {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const timeoutMs = options.timeoutMs ?? DEFAULT_CHART_ATTEMPT_TIMEOUT_MS;
    const maxAttempts = options.maxAttempts ?? DEFAULT_CHART_MAX_ATTEMPTS;
    const logCtx = options.logContext || `[irctc/post]`;
    const headers = this.buildHeaders({
      cookies: options.cookies,
      referer: options.referer,
    });

    if (this.isProxied()) {
      const proxyBase = this.getOnlineChartsBaseUrl();
      const proxyUrl = `${proxyBase}${cleanPath}`;
      const t0 = Date.now();
      this.logger.log(
        `${logCtx} routing via ngrok proxy: ${proxyUrl} cookies=${Boolean(options.cookies)}`,
      );

      if (curlLogEnabled()) {
        this.logger.log(
          `${logCtx} curl: ${buildCurl({
            method: 'POST',
            url: proxyUrl,
            headers,
            body: JSON.stringify(body),
          })}`,
        );
      }

      try {
        const res = await this.axiosClient.post(proxyUrl, body, {
          headers,
          timeout: timeoutMs,
        });
        const status = res.status;
        const text =
          typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        this.logResponse(logCtx, proxyUrl, status, text);
        return { statusCode: status, body: text };
      } catch (proxyErr: any) {
        const ms = Date.now() - t0;
        const errMsg =
          proxyErr instanceof Error ? proxyErr.message : String(proxyErr);
        this.logger.error(
          `${logCtx} ngrok proxy request failed ms=${ms} (${errMsg}), falling back to direct IRCTC...`,
        );
      }
    }

    const directUrl = `${DEFAULT_IRCTC_BASE_URL}${cleanPath}`;
    return this.executeDirectPost(
      directUrl,
      headers,
      body,
      timeoutMs,
      maxAttempts,
      logCtx,
    );
  }

  /**
   * Sends a GET request to an IRCTC endpoint (e.g. eticketing schedule enquiry).
   */
  async getEticketing(
    path: string,
    options: IrctcHttpOptions = {},
  ): Promise<IrctcHttpResponse> {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const timeoutMs = options.timeoutMs ?? 5_000;
    const logCtx = options.logContext || `[irctc/get]`;
    const headers = this.buildHeaders({
      cookies: options.cookies,
      referer:
        options.referer ||
        'https://www.irctc.co.in/eticketing/protected/mapps1/trnscheduleenquiry',
    });

    if (this.isProxied()) {
      const proxyBase = this.getOnlineChartsBaseUrl();
      const proxyUrl = `${proxyBase}${cleanPath}`;
      const t0 = Date.now();
      this.logger.log(
        `${logCtx} routing via ngrok proxy: ${proxyUrl} cookies=${Boolean(options.cookies)}`,
      );

      try {
        const res = await this.axiosClient.get(proxyUrl, {
          headers,
          timeout: timeoutMs,
        });
        const status = res.status;
        const text =
          typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        this.logResponse(logCtx, proxyUrl, status, text);
        return { statusCode: status, body: text };
      } catch (proxyErr: any) {
        const ms = Date.now() - t0;
        const errMsg =
          proxyErr instanceof Error ? proxyErr.message : String(proxyErr);
        this.logger.error(
          `${logCtx} ngrok proxy GET failed ms=${ms} (${errMsg}), falling back to direct IRCTC...`,
        );
      }
    }

    const directUrl = `${DEFAULT_IRCTC_BASE_URL}${cleanPath}`;
    const res = await this.axiosClient.get(directUrl, {
      headers,
      timeout: timeoutMs,
    });
    const text =
      typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    this.logResponse(logCtx, directUrl, res.status, text);
    return { statusCode: res.status, body: text };
  }

  /**
   * Direct POST via got-scraping (with outgoing proxy and Akamai retry handling).
   */
  private async executeDirectPost(
    url: string,
    headers: Record<string, string>,
    body: unknown,
    timeoutMs: number,
    maxAttempts: number,
    logCtx: string,
  ): Promise<IrctcHttpResponse> {
    const proxyUrl = this.getOutgoingProxyUrl();
    if (curlLogEnabled()) {
      this.logger.log(
        `${logCtx} curl: ${buildCurl({
          method: 'POST',
          url,
          headers,
          body: JSON.stringify(body),
        })}`,
      );
    }

    const gotScraping = await getGotScraping();
    const res = await retryTransient(
      () =>
        gotScraping.post(url, {
          headers,
          json: body,
          proxyUrl,
          timeout: { request: timeoutMs },
          retry: { limit: 0 },
        }),
      {
        attempts: maxAttempts,
        onRetry: (attempt, err) =>
          this.logger.warn(
            `${logCtx} transient retry attempt=${attempt} ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
      },
    );

    const text =
      typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
    this.logResponse(logCtx, url, res.statusCode, text);
    return { statusCode: res.statusCode, body: text };
  }
}
