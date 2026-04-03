import {
  ArgumentsHost,
  Catch,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { captureException } from '@sentry/nestjs';

import { isSentryEnabled } from './sentry-report';

/**
 * Sentry’s default Nest global filter skips all HttpException (treated as expected). This filter
 * sends non-HTTP exceptions and HttpException with status >= SENTRY_HTTP_MIN_STATUS (default 500).
 * Keep SentryModule.forRoot() for tracing; use this class as APP_FILTER instead of SentryGlobalFilter.
 */
@Catch()
@Injectable()
export class SentryHttpExceptionFilter extends BaseExceptionFilter {
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
    super.catch(exception, host);
  }

  private shouldReportToSentry(exception: unknown): boolean {
    if (!(exception instanceof HttpException)) {
      return true;
    }
    return exception.getStatus() >= minHttpStatusToReport();
  }
}

function minHttpStatusToReport(): number {
  const raw = process.env.SENTRY_HTTP_MIN_STATUS?.trim();
  if (raw == null || raw === '') return 500;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(599, Math.max(100, n)) : 500;
}
