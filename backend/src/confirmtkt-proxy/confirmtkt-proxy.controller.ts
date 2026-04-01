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
  CONFIRMTKT_STATIC_HEADERS,
  CONFIRMTKT_UPSTREAM_BASE,
} from './confirmtkt-proxy.constants';

/**
 * GET proxy to ConfirmTkt fetchAvailability (query params only on this server).
 * Upstream is still POST with empty body, as ConfirmTkt expects.
 */
@Controller('api/confirmtkt')
export class ConfirmTktProxyController {
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
    const url = `${CONFIRMTKT_UPSTREAM_BASE}?${qs.toString()}`;

    try {
      const upstream = await fetch(url, {
        method: 'POST',
        headers: CONFIRMTKT_STATIC_HEADERS,
        body: '',
      });
      const text = await upstream.text();
      const ct = upstream.headers.get('content-type');
      if (ct) res.setHeader('Content-Type', ct);
      res.status(upstream.status).send(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpException(
        { message: 'ConfirmTkt proxy request failed', detail: msg },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
