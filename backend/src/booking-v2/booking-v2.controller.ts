import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { BookingV2Service } from './booking-v2.service';

function trimStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
  return '';
}

function bodyStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => trimStr(x).toUpperCase())
    .filter((s) => s.length > 0);
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
      throw new BadRequestException('from, to, and date query params are required');
    }
    if (!this.bookingV2.normalizeToRailApiDate(d)) {
      throw new BadRequestException(
        'date must be YYYY-MM-DD or DD-MM-YYYY',
      );
    }
    return this.bookingV2.searchTrains(f, t, d);
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
      throw new BadRequestException(
        'date must be YYYY-MM-DD or DD-MM-YYYY',
      );
    }
    return this.bookingV2.findAlternatePaths({
      trainNumber,
      from,
      to,
      date,
      avlClasses,
      quota,
    });
  }
}
