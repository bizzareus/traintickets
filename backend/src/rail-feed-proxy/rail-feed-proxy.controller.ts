import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  RAIL_FEED_STATIC_HEADERS,
  RAIL_FEED_UPSTREAM_BASE,
} from './rail-feed-proxy.constants';
import { isPastRailDate } from '../booking-v2/booking-v2.utils';
import { Throttle } from '@nestjs/throttler';
import {
  fetchWithTimeout,
  readResponseText,
} from '../common/fetch-with-timeout';

/**
 * GET proxy: forwards query params to upstream availability POST (empty body).
 */
@Controller('api/rail-feed')
@Throttle({ global: { limit: 20, ttl: 60_000 } })
export class RailFeedProxyController {
  @Get('availability')
  async proxyAvailability(
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const qs = new URLSearchParams();
    const src = req.query as Record<string, string | string[] | undefined>;
    for (const [key, value] of Object.entries(src)) {
      if (value === undefined) continue;
      qs.set(key, Array.isArray(value) ? value[0] : value);
    }

    const dateOfJourney = qs.get('dateOfJourney');
    if (dateOfJourney && isPastRailDate(dateOfJourney)) {
      throw new HttpException(
        {
          error: { code: 4002, message: 'Journey date cannot be in the past' },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const url = `${RAIL_FEED_UPSTREAM_BASE}?${qs.toString()}`;
    const abortController = new AbortController();
    const abort = () => abortController.abort();
    req.once('aborted', abort);
    res.once('close', abort);

    try {
      const upstream = await fetchWithTimeout(url, {
        method: 'POST',
        headers: RAIL_FEED_STATIC_HEADERS,
        body: '',
        signal: abortController.signal,
      });
      const text = await readResponseText(upstream, 2 * 1024 * 1024);
      if (res.destroyed) return;
      const ct = upstream.headers.get('content-type');
      if (ct) res.setHeader('Content-Type', ct);
      res.status(upstream.status).send(text);
    } catch (err) {
      if (abortController.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpException(
        { message: 'Rail availability proxy request failed', detail: msg },
        HttpStatus.BAD_GATEWAY,
      );
    } finally {
      req.off('aborted', abort);
      res.off('close', abort);
    }
  }
}
