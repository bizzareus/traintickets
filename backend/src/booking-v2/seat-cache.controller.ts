import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SeatCacheCronService } from './seat-cache-cron.service';
import { DynamoDbSeatCacheService } from './dynamodb-seat-cache.service';
import { ADMIN_PASSWORD_HEADER, assertAdminAuth } from '../common/admin-auth';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class SeatCacheController {
  constructor(
    private readonly seatCacheCron: SeatCacheCronService,
    private readonly dynamoDbSeatCache: DynamoDbSeatCacheService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Public endpoint to fetch the latest precomputed seat availability summary from DynamoDB.
   * Can be filtered by category (e.g. `category=diwali`) or by `trainNumber`.
   */
  @Get('api/booking-v2/trains/availability-summary')
  async getAvailabilitySummary(
    @Query('category') category?: string,
    @Query('trainNumber') trainNumber?: string,
  ) {
    const cat = category?.trim() || 'all';
    let summary = await this.dynamoDbSeatCache.getAvailabilitySummary(cat);

    // If category was specific and not found in DynamoDB, check 'ALL'
    if (!summary && cat.toLowerCase() !== 'all') {
      const allSummary =
        await this.dynamoDbSeatCache.getAvailabilitySummary('ALL');
      if (allSummary) {
        const filtered: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(allSummary)) {
          if (
            val &&
            typeof val === 'object' &&
            (val as Record<string, unknown>).category
              ?.toString()
              .toLowerCase() === cat.toLowerCase()
          ) {
            filtered[key] = val;
          }
        }
        summary = filtered;
      }
    }

    const data = summary ?? {};

    if (trainNumber) {
      const tn = trainNumber.trim();
      const single = data[tn] ?? null;
      return {
        success: true,
        data: single,
      };
    }

    return {
      success: true,
      data,
    };
  }

  /**
   * Admin endpoint to trigger a manual run of the unified seat cache warmer.
   * Supports backward compatibility aliases for previous cron endpoints.
   */
  @Post([
    'api/admin/seat-cache-cron/run',
    'api/admin/train-availability-cron/run',
    'api/admin/best-seats-cron/run',
  ])
  async runCron(
    @Body() body?: { category?: string; trainNumber?: string },
    @Headers('x-api-key') apiKey?: string,
    @Headers(ADMIN_PASSWORD_HEADER) pw?: string,
    @Req() req?: Request,
  ) {
    this.assertAuthorized(apiKey, pw, req);
    return this.seatCacheCron.runNow(body);
  }

  /**
   * Admin status endpoint reporting recent cache warming runs from the database.
   */
  @Get(['api/admin/seat-cache-cron', 'api/admin/best-seats-cron'])
  async getStatus(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
  ) {
    assertAdminAuth({ headerPw: pw, req });
    const recentRuns = await this.prisma.bestSeatsCronRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 10,
    });
    return {
      success: true,
      dynamoDbAvailable: this.dynamoDbSeatCache.isAvailable,
      recentRuns,
    };
  }

  private assertAuthorized(apiKey?: string, pw?: string, req?: Request): void {
    const expectedKey = String(
      process.env.SEAT_CACHE_CRON_API_KEY ??
        process.env.BEST_SEATS_CRON_API_KEY ??
        process.env.TRAIN_AVAILABILITY_CRON_API_KEY ??
        '',
    ).trim();

    if (expectedKey && String(apiKey ?? '').trim() === expectedKey) {
      return;
    }

    try {
      assertAdminAuth({ headerPw: pw, req });
    } catch {
      throw new UnauthorizedException(
        'Unauthorized: Valid x-api-key or admin password required.',
      );
    }
  }
}
