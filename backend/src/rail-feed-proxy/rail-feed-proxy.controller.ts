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

/**
 * GET proxy: forwards query params to upstream availability POST (empty body).
 */
@Controller('api/rail-feed')
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
    const url = `${RAIL_FEED_UPSTREAM_BASE}?${qs.toString()}`;

    try {
      const upstream = await fetch(url, {
        method: 'POST',
        headers: RAIL_FEED_STATIC_HEADERS,
        body: '',
      });
      const text = await upstream.text();
      const ct = upstream.headers.get('content-type');
      if (ct) res.setHeader('Content-Type', ct);
      res.status(upstream.status).send(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpException(
        { message: 'Rail availability proxy request failed', detail: msg },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
