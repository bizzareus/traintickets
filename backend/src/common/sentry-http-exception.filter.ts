import {
  ArgumentsHost,
  Catch,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { captureException } from '@sentry/nestjs';

import { isSentryEnabled } from './sentry-report';
import { isBenignUpstreamError } from './expected-upstream-errors';

/**
 * Sentry’s default Nest global filter skips all HttpException (treated as expected). This filter
 * sends non-HTTP exceptions and HttpException with status >= SENTRY_HTTP_MIN_STATUS (default 500).
 * Keep SentryModule.forRoot() for tracing; use this class as APP_FILTER instead of SentryGlobalFilter.
 *
 * It also writes one line per failed request to stdout so errors are visible
 * in docker logs: 4xx at warn (DTO validation rejections included), 5xx and
 * unhandled errors at error. 404s are skipped — they are mostly bot/scanner noise.
 */
@Catch()
@Injectable()
export class SentryHttpExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(SentryHttpExceptionFilter.name);

  constructor(adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    if (isSentryEnabled() && this.shouldReportToSentry(exception)) {
      captureException(exception, {
        mechanism: {
          handled: false,
          type: 'auto.http.nestjs.sentry_http_exception_filter',
        },
      });
    }
    this.logForDockerLogs(exception, host);
    super.catch(exception, host);
  }

  private shouldReportToSentry(exception: unknown): boolean {
    // Expected upstream conditions (e.g. "Chart not prepared") are normal
    // states, not faults — never report them regardless of how they surface.
    if (isBenignUpstreamError(exception)) {
      return false;
    }
    if (!(exception instanceof HttpException)) {
      return true;
    }
    return exception.getStatus() >= minHttpStatusToReport();
  }

  private logForDockerLogs(exception: unknown, host: ArgumentsHost): void {
    const requestLine = describeRequest(host);
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === 404) return;
      const message = describeHttpMessage(exception.getResponse());
      if (status >= 500) {
        this.logger.error(`${requestLine} -> ${status} ${message}`);
      } else {
        this.logger.warn(`${requestLine} -> ${status} ${message}`);
      }
      return;
    }
    const detail =
      exception instanceof Error ? exception.message : String(exception);
    this.logger.error(`${requestLine} -> unhandled ${detail}`);
  }
}

function describeRequest(host: ArgumentsHost): string {
  try {
    const req = host
      .switchToHttp()
      .getRequest<{ method?: string; url?: string }>();
    return `${req?.method ?? '?'} ${req?.url ?? '?'}`;
  } catch {
    return '? ?';
  }
}

/** Flattens string | { message } | string[] bodies (e.g. ValidationPipe arrays) to one line. */
function describeHttpMessage(body: unknown): string {
  const raw: unknown =
    typeof body === 'object' && body !== null && 'message' in body
      ? (body as { message?: unknown }).message
      : body;
  const parts = Array.isArray(raw) ? raw : [raw];
  const text = parts.map(toLogText).join('; ');
  return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}

function toLogText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  const json = JSON.stringify(value);
  return typeof json === 'string' ? json : '';
}

function minHttpStatusToReport(): number {
  const raw = process.env.SENTRY_HTTP_MIN_STATUS?.trim();
  if (raw == null || raw === '') return 500;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(599, Math.max(100, n)) : 500;
}
