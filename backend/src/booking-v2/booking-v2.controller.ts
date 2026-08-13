import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { BookingV2Service } from './booking-v2.service';
import type {
  AlternatePathProgressEvent,
  BookingV2TrainSearchRow,
  BestTrainProgressEvent,
} from './booking-v2.service';

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
    return this.bookingV2.searchTrains(f, t, d);
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
    body: {
      trainNumber?: unknown;
      from?: unknown;
      to?: unknown;
      date?: unknown;
      /** Train search `avlClasses` — each is probed via fetchAvailability. */
      avlClasses?: unknown;
      quota?: unknown;
    },
  ) {
    const trainNumber = trimStr(body?.trainNumber);
    const from = trimStr(body?.from);
    const to = trimStr(body?.to);
    const date = trimStr(body?.date);
    const avlClasses = bodyStringArray(body?.avlClasses);
    const quota = trimStr(body?.quota) || 'GN';
    if (!trainNumber || !from || !to || !date) {
      throw new BadRequestException(
        'trainNumber, from, to, and date are required',
      );
    }
    if (!this.bookingV2.normalizeToRailApiDate(date)) {
      throw new BadRequestException('date must be YYYY-MM-DD or DD-MM-YYYY');
    }
    const { result } = await this.bookingV2.findAlternatePathsCached({
      trainNumber,
      from,
      to,
      date,
      avlClasses,
      quota,
    });
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
    body: {
      trainNumber?: unknown;
      from?: unknown;
      to?: unknown;
      date?: unknown;
      avlClasses?: unknown;
      quota?: unknown;
      forceRefresh?: unknown;
    },
    @Res() res: Response,
  ) {
    const trainNumber = trimStr(body?.trainNumber);
    const from = trimStr(body?.from);
    const to = trimStr(body?.to);
    const date = trimStr(body?.date);
    const avlClasses = bodyStringArray(body?.avlClasses);
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

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();

    const writeLine = (obj: unknown) => {
      res.write(JSON.stringify(obj) + '\n');
    };

    const forceRefresh = Boolean(body?.forceRefresh);

    try {
      const { result, cached } = await this.bookingV2.findAlternatePathsCached(
        { trainNumber, from, to, date, avlClasses, quota, forceRefresh },
        (event: AlternatePathProgressEvent) => {
          writeLine({ type: 'progress', event });
        },
      );
      writeLine({ type: 'result', data: result, cached });
    } catch (err: unknown) {
      writeLine({ type: 'error', message: streamErrorMessage(err) });
    } finally {
      res.end();
    }
  }

  @Post('best-trains/stream')
  async bestTrainsStream(
    @Body()
    body: {
      from?: unknown;
      to?: unknown;
      date?: unknown;
      quota?: unknown;
      acOnly?: unknown;
      maxTrains?: unknown;
      trains?: unknown;
    },
    @Res() res: Response,
  ) {
    const from = trimStr(body?.from).toUpperCase();
    const to = trimStr(body?.to).toUpperCase();
    const date = trimStr(body?.date);
    const quota = trimStr(body?.quota) || 'GN';
    const acOnly = body?.acOnly === true || trimStr(body?.acOnly) === 'true';
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

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();

    const writeLine = (obj: unknown) => {
      res.write(JSON.stringify(obj) + '\n');
    };

    try {
      const result = await this.bookingV2.findBestTrains(
        {
          from,
          to,
          date,
          quota,
          acOnly,
          maxTrains,
          trains: Array.isArray(body?.trains)
            ? (body.trains as BookingV2TrainSearchRow[])
            : undefined,
        },
        (event: BestTrainProgressEvent) => {
          writeLine({ type: 'progress', event });
        },
      );
      writeLine({ type: 'result', data: result });
      // Warm the route cache from a real full scan (skip AC-only — the cache
      // stores the all-class best). Best-effort; never blocks the response.
      if (!acOnly) {
        void this.bookingV2
          .cacheBestTrainResult(from, to, date, result)
          .catch(() => undefined);
      }
    } catch (err: unknown) {
      writeLine({ type: 'error', message: streamErrorMessage(err) });
    } finally {
      res.end();
    }
  }

  @Get('trains/schedule/:trainNumber')
  async getTrainSchedule(
    @Param('trainNumber') paramNo: string | undefined,
    @Query('trainNumber') queryNo: string | undefined,
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
