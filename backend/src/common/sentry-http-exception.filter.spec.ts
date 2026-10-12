import 'reflect-metadata';
import type { ArgumentsHost } from '@nestjs/common';
import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { captureException } from '@sentry/nestjs';
import { SentryHttpExceptionFilter } from './sentry-http-exception.filter';

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

const mockedCapture = captureException as jest.Mock;

function setup(url = '/api/split-booking/create') {
  const reply = jest.fn();
  const filter = new SentryHttpExceptionFilter({
    httpAdapter: { reply, isHeadersSent: () => false },
  } as unknown as HttpAdapterHost);
  const request = { method: 'POST', url };
  const response = {};
  const host = {
    getType: () => 'http',
    getArgByIndex: (index: number) => (index === 0 ? request : response),
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  const warn = jest
    .spyOn(
      (filter as unknown as { logger: { warn: () => void } }).logger,
      'warn',
    )
    .mockImplementation(() => undefined);
  const error = jest
    .spyOn(
      (filter as unknown as { logger: { error: () => void } }).logger,
      'error',
    )
    .mockImplementation(() => undefined);
  return { filter, host, reply, warn, error };
}

describe('SentryHttpExceptionFilter docker logging', () => {
  beforeEach(() => {
    mockedCapture.mockClear();
    delete process.env.SENTRY_DSN;
  });

  it('warns with method, url and messages on DTO validation rejections', () => {
    const { filter, host, reply, warn, error } = setup();
    filter.catch(
      new BadRequestException([
        'legs.0.property availability should not exist',
        'legs.1.property availability should not exist',
      ]),
      host,
    );

    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain('POST /api/split-booking/create -> 400');
    expect(line).toContain('legs.0.property availability should not exist');
    expect(line).toContain('legs.1.property availability should not exist');
    expect(error).not.toHaveBeenCalled();
    expect(mockedCapture).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ statusCode: 400 }),
      400,
    );
  });

  it('stays silent on 404s (bot/scanner noise)', () => {
    const { filter, host, reply, warn, error } = setup('/missing');
    filter.catch(new NotFoundException('Cannot GET /missing'), host);

    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(mockedCapture).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ statusCode: 404 }),
      404,
    );
  });

  it('errors to stdout and reports 5xx to Sentry', () => {
    process.env.SENTRY_DSN = 'https://key@o1.ingest.sentry.io/1';
    const { filter, host, reply, warn, error } = setup();
    filter.catch(new HttpException('boom', 500), host);

    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain(
      'POST /api/split-booking/create -> 500',
    );
    expect(warn).not.toHaveBeenCalled();
    expect(mockedCapture).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      500,
    );
  });

  it('errors to stdout on unhandled non-HTTP exceptions', () => {
    const { filter, host, error } = setup();
    filter.catch(new Error('connection reset'), host);

    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('unhandled');
  });
});
