import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { BookingV2Service } from './booking-v2.service';
import type {
  AlternatePathProgressEvent,
  BookingV2TrainSearchRow,
  BestTrainProgressEvent,
} from './booking-v2.service';
import { AlternatePathsDto, BestTrainsDto } from './booking-v2.dto';
import {
  createResponseLifecycle,
  endResponse,
  writeChunk,
} from '../common/http-stream';

function trimStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
  return '';
}

function bodyStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => trimStr(x).toUpperCase()).filter((s) => s.length > 0);
}

function streamErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Unexpected error';
  if (
    /fetch failed|ETIMEDOUT|IRCTC request failed|Train composition is temporarily unavailable|unable to contact rail systems/i.test(
      message,
    )
  ) {
    return 'We are unable to contact rail systems. Please try again later.';
  }
  return message;
}

@Controller('api/booking-v2')
@Throttle({ global: { limit: 20, ttl: 60_000 } })
export class BookingV2Controller {
  constructor(private readonly bookingV2: BookingV2Service) {}

  @Get('stations/suggest')
  async suggestStations(
    @Query('q') q: string | undefined,
    @Query('searchString') searchStringParam: string | undefined,
  ) {
    const searchString = trimStr(q) || trimStr(searchStringParam);
    if (searchString.length < 2) {
      throw new BadRequestException(
        'Query q or searchString must be at least 2 characters',
      );
    }
    return this.bookingV2.searchStations(searchString);
  }

  @Get('trains/search')
  async searchTrains(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('date') date: string | undefined,
    @Query('classes') classesParam: string | string[] | undefined,
  ) {
    const f = trimStr(from).toUpperCase();
    const t = trimStr(to).toUpperCase();
    const d = trimStr(date);
    if (!f || !t || !d) {
      throw new BadRequestException(
        'from, to, and date query params are required',
      );
    }
    if (!this.bookingV2.normalizeToRailApiDate(d)) {
      throw new BadRequestException('date must be YYYY-MM-DD or DD-MM-YYYY');
    }
    if (this.bookingV2.isPastDate(d)) {
      throw new BadRequestException('Journey date cannot be in the past');
    }
    const classes = bodyStringArray(
      typeof classesParam === 'string' ? classesParam.split(',') : classesParam,
    );
    return this.bookingV2.searchTrains(f, t, d, classes);
  }

  /**
   * Precomputed best-train for a route, served from the route cache written by the
   * background cron. Pure cache read — never triggers a compute or an IRCTC call,
   * so it stays fast. Miss (un-cached, expired, or a computed "no train" marker)
   * returns { cached: false } and the client falls back to the live-scan CTA.
   */
  @Get('best-trains/cached')
  async cachedBestTrain(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('date') date: string | undefined,
  ) {
    const f = trimStr(from).toUpperCase();
    const t = trimStr(to).toUpperCase();
    const d = trimStr(date);
    if (!f || !t || !d) {
      throw new BadRequestException(
        'from, to, and date query params are required',
      );
    }
    if (!this.bookingV2.normalizeToRailApiDate(d)) {
      throw new BadRequestException('date must be YYYY-MM-DD or DD-MM-YYYY');
    }
    if (this.bookingV2.isPastDate(d)) {
      throw new BadRequestException('Journey date cannot be in the past');
    }
    const record = await this.bookingV2.getCachedBestTrain(f, t, d);
    if (!record || record.value.found !== true) {
      return { cached: false as const };
    }
    return {
      cached: true as const,
      cachedAt: record.cachedAt.toISOString(),
      best: record.value,
    };
  }

  @Post('alternate-paths')
  async alternatePaths(
    @Body()
    body: AlternatePathsDto,
  ) {
    const trainNumber = trimStr(body?.trainNumber);
    const from = trimStr(body?.from);
    const to = trimStr(body?.to);
    const date = trimStr(body?.date);
    const avlClasses = bodyStringArray(body?.avlClasses ?? body?.classes);
    const quota = trimStr(body?.quota) || 'GN';
    if (!trainNumber || !from || !to || !date) {
      throw new BadRequestException(
        'trainNumber, from, to, and date are required',
      );
    }
    if (!this.bookingV2.normalizeToRailApiDate(date)) {
      throw new BadRequestException('date must be YYYY-MM-DD or DD-MM-YYYY');
    }
    if (this.bookingV2.isPastDate(date)) {
      throw new BadRequestException('Journey date cannot be in the past');
    }
    const cacheOnly = Boolean(body?.cacheOnly);
    const forceRefresh = Boolean(body?.forceRefresh);
    const { result, cached } = await this.bookingV2.findAlternatePathsCached({
      trainNumber,
      from,
      to,
      date,
      avlClasses,
      quota,
      forceRefresh,
      cacheOnly,
    });
    if (cacheOnly) {
      return { cached, result };
    }
    return result;
  }

  /**
   * Same as POST /alternate-paths but streams NDJSON progress events followed
   * by the final result line as the response body completes.
   *
   * Each line is a JSON object:
   *   { type: "progress", event: AlternatePathProgressEvent }
   *   { type: "result", data: FindAlternatePathsResult }
   *   { type: "error", message: string }
   */
  @Post('alternate-paths/stream')
  async alternatePathsStream(
    @Body()
    body: AlternatePathsDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const trainNumber = trimStr(body?.trainNumber);
    const from = trimStr(body?.from);
    const to = trimStr(body?.to);
    const date = trimStr(body?.date);
    const avlClasses = bodyStringArray(body?.avlClasses ?? body?.classes);
    const quota = trimStr(body?.quota) || 'GN';

    if (!trainNumber || !from || !to || !date) {
      res
        .status(400)
        .json({ message: 'trainNumber, from, to, and date are required' });
      return;
    }
    if (!this.bookingV2.normalizeToRailApiDate(date)) {
      res
        .status(400)
        .json({ message: 'date must be YYYY-MM-DD or DD-MM-YYYY' });
      return;
    }
    if (this.bookingV2.isPastDate(date)) {
      res.status(400).json({ message: 'Journey date cannot be in the past' });
      return;
    }

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();
    const lifecycle = createResponseLifecycle(req, res, 180_000);

    const writeLine = (obj: unknown) =>
      writeChunk(res, `${JSON.stringify(obj)}\n`, lifecycle.signal);

    const forceRefresh = Boolean(body?.forceRefresh);
    const cacheOnly = Boolean(body?.cacheOnly);

    const heartbeatTimer = setInterval(() => {
      if (!res.destroyed && !res.writableEnded && !lifecycle.signal.aborted) {
        res.write(`${JSON.stringify({ type: 'heartbeat' })}\n`);
      }
    }, 15_000);

    try {
      const { result, cached } = await this.bookingV2.findAlternatePathsCached(
        {
          trainNumber,
          from,
          to,
          date,
          avlClasses,
          quota,
          forceRefresh,
          cacheOnly,
          signal: lifecycle.signal,
        },
        (event: AlternatePathProgressEvent) =>
          writeLine({ type: 'progress', event }),
      );
      await writeLine({ type: 'result', data: result, cached });
    } catch (err: unknown) {
      if (!lifecycle.signal.aborted) {
        await writeLine({ type: 'error', message: streamErrorMessage(err) });
      }
    } finally {
      clearInterval(heartbeatTimer);
      endResponse(res);
      lifecycle.cleanup();
    }
  }

  @Post('best-trains/stream')
  async bestTrainsStream(
    @Body()
    body: BestTrainsDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const from = trimStr(body?.from).toUpperCase();
    const to = trimStr(body?.to).toUpperCase();
    const date = trimStr(body?.date);
    const quota = trimStr(body?.quota) || 'GN';
    const acOnly = body?.acOnly === true || trimStr(body?.acOnly) === 'true';
    const classes = bodyStringArray(body?.classes);
    const maxTrainsRaw =
      typeof body?.maxTrains === 'number'
        ? body.maxTrains
        : parseInt(trimStr(body?.maxTrains), 10);
    const maxTrains = Number.isFinite(maxTrainsRaw) ? maxTrainsRaw : undefined;

    if (!from || !to || !date) {
      res.status(400).json({ message: 'from, to, and date are required' });
      return;
    }
    if (!this.bookingV2.normalizeToRailApiDate(date)) {
      res
        .status(400)
        .json({ message: 'date must be YYYY-MM-DD or DD-MM-YYYY' });
      return;
    }
    if (this.bookingV2.isPastDate(date)) {
      res.status(400).json({ message: 'Journey date cannot be in the past' });
      return;
    }

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();
    const lifecycle = createResponseLifecycle(req, res, 180_000);

    const writeLine = (obj: unknown) =>
      writeChunk(res, `${JSON.stringify(obj)}\n`, lifecycle.signal);

    const heartbeatTimer = setInterval(() => {
      if (!res.destroyed && !res.writableEnded && !lifecycle.signal.aborted) {
        res.write(`${JSON.stringify({ type: 'heartbeat' })}\n`);
      }
    }, 15_000);

    try {
      const result = await this.bookingV2.findBestTrains(
        {
          from,
          to,
          date,
          quota,
          acOnly,
          classes,
          maxTrains,
          trains: Array.isArray(body?.trains)
            ? (body.trains as BookingV2TrainSearchRow[])
            : undefined,
          signal: lifecycle.signal,
        },
        (event: BestTrainProgressEvent) =>
          writeLine({ type: 'progress', event }),
      );
      await writeLine({ type: 'result', data: result });
      // Warm the route cache from a real full scan (skip AC-only — the cache
      // stores the all-class best). Best-effort; never blocks the response.
      if (!acOnly) {
        void this.bookingV2
          .cacheBestTrainResult(from, to, date, result)
          .catch(() => undefined);
      }
    } catch (err: unknown) {
      if (!lifecycle.signal.aborted) {
        await writeLine({ type: 'error', message: streamErrorMessage(err) });
      }
    } finally {
      clearInterval(heartbeatTimer);
      endResponse(res);
      lifecycle.cleanup();
    }
  }

  @Get('trains/schedule/:trainNumber')
  async getTrainSchedule(
    @Param('trainNumber') paramNo: string | undefined,
    @Query('trainNumber') queryNo: string | undefined,
    @Res() res: Response,
  ) {
    const num = trimStr(paramNo) || trimStr(queryNo);
    if (!num) {
      throw new BadRequestException('trainNumber is required');
    }
    const result = await this.bookingV2.getTrainSchedule(num);
    if (!result.ok) {
      if (result.reason === 'maintenance') {
        res.status(503).json({ message: result.message });
        return;
      }
      res.status(404).json({ message: 'Schedule not available' });
      return;
    }
    res.json(result.schedule);
  }

  @Get('pnr/:pnr')
  async getPnrStatus(@Param('pnr') pnr: string) {
    const trimmed = trimStr(pnr);
    if (!trimmed || trimmed.length !== 10 || !/^\d+$/.test(trimmed)) {
      throw new BadRequestException('PNR must be a 10-digit number');
    }
    return this.bookingV2.getPnrStatus(trimmed);
  }
}
