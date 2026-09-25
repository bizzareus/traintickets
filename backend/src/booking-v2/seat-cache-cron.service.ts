import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import moment from 'moment';
import { captureSentryException } from '../common/sentry-report';
import { ChartCronLeaderService } from '../chart-cron/chart-cron-leader.service';
import { BookingV2Service } from './booking-v2.service';
import { DynamoDbSeatCacheService } from './dynamodb-seat-cache.service';
import {
  PostHogTopRoutesService,
  type TopRoute,
} from './posthog-top-routes.service';
import { PostHogAnalyticsService } from '../common/posthog-analytics.service';
import { PrismaService } from '../prisma/prisma.service';

/** Curated popular routes to keep warm, matching top searched OD corridors. */
export const POPULAR_ROUTE_PAIRS: ReadonlyArray<{ from: string; to: string }> =
  [
    { from: 'NDLS', to: 'MMCT' }, // delhi -> mumbai
    { from: 'NDLS', to: 'PNBE' }, // delhi -> patna
    { from: 'MMCT', to: 'SBC' }, // mumbai -> bengaluru
    { from: 'MAS', to: 'SBC' }, // chennai -> bengaluru
    { from: 'HWH', to: 'NDLS' }, // kolkata -> delhi
    { from: 'SBC', to: 'MAS' }, // bengaluru -> chennai
    { from: 'NDLS', to: 'JAT' }, // delhi -> jammu
    { from: 'MMCT', to: 'ADI' }, // mumbai -> ahmedabad
    { from: 'NDLS', to: 'HWH' }, // delhi -> kolkata
  ];

/** How many days ahead to cache for top routes, starting today (IST). 0..5 => 6 dates. */
const DAYS_AHEAD = 5;
const IST_UTC_OFFSET = '+05:30';

export interface TrainCacheTarget {
  trainNumber: string;
  trainName?: string;
  from: string;
  to: string;
  /** Explicit YYYY-MM-DD dates; past dates are skipped at runtime. */
  dates?: string[];
  /**
   * Rolling window: warm the next N days starting today (IST).
   * Accepts a number (7) or a "+N" string ("+7").
   */
  days?: number | string;
  category?: string;
}

export interface TrainCacheTargetsFile {
  version: number;
  description?: string;
  targets: TrainCacheTarget[];
}

export interface TrainClassAvailability {
  status: string;
  count: number;
  fare?: number | null;
}

export interface TrainDateAvailability {
  totalSeats: number;
  classes: Record<string, TrainClassAvailability>;
}

export interface TrainAvailabilitySummaryItem {
  trainNumber: string;
  trainName?: string;
  from: string;
  to: string;
  category?: string;
  totalAvailableSeats: number;
  availableClasses: string[];
  lowestFare: number | null;
  dates: Record<string, TrainDateAvailability>;
  lastUpdated: string;
}

export type TrainAvailabilitySummaryMap = Record<
  string,
  TrainAvailabilitySummaryItem
>;

function toSafeString(val: unknown): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return '';
}

function extractAvailableSeatsCount(statusText?: string | null): number {
  if (!statusText) return 0;
  const match = statusText.match(
    /(?:AVAILABLE|AVAIL|CURR_AVBL|CURR_AVL|AVL)[-\s]*(\d+)/i,
  );
  if (match && match[1]) {
    const num = parseInt(match[1], 10);
    return Number.isFinite(num) ? num : 0;
  }
  if (/^CNF|^CONFIRM/i.test(statusText.trim())) {
    return 1;
  }
  return 0;
}

function isRowConfirmed(
  row: Record<string, unknown> | null | undefined,
): boolean {
  if (!row) return false;
  const type = row.availablityType;
  if (type === 3 || type === '3') return false;
  if (type === 1 || type === '1') return true;

  const vendor = toSafeString(row.vendorPredictionStatus).trim();
  if (vendor === 'Confirm' || vendor === 'Probable') return true;

  const statusText = toSafeString(
    row.availabilityDisplayName || row.railDataStatus || row.availablityStatus,
  ).trim();
  return /^AVL|^AVAIL|^CURR_AV|^CURRENT AV|^CNF/i.test(statusText);
}

function ymdToDmy(ymd: string): string {
  const parts = ymd.split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return ymd;
}

/** Upper bound for a target's rolling `days` window (typo guard). */
const MAX_ROLLING_DAYS = 30;

/** Parse a `days` value (7 or "+7") into a day count; garbage => 0. */
function parseRollingDays(days: unknown): number {
  const n =
    typeof days === 'number'
      ? days
      : typeof days === 'string'
        ? parseInt(days.replace(/^\+/, '').trim(), 10)
        : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/**
 * Effective YYYY-MM-DD dates for a target: explicit `dates` (past days
 * skipped) union the rolling `days` window starting today (IST), sorted.
 */
export function resolveTargetDates(
  target: TrainCacheTarget,
  todayYmd: string = moment().utcOffset(IST_UTC_OFFSET).format('YYYY-MM-DD'),
): string[] {
  const out = new Set<string>();
  for (const d of target.dates ?? []) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d >= todayYmd) out.add(d);
  }
  const n = Math.min(parseRollingDays(target.days), MAX_ROLLING_DAYS);
  const base = moment(todayYmd, 'YYYY-MM-DD');
  for (let i = 0; i < n; i++) {
    out.add(base.clone().add(i, 'days').format('YYYY-MM-DD'));
  }
  return [...out].sort();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class SeatCacheCronService {
  private readonly logger = new Logger(SeatCacheCronService.name);
  private running = false;

  private readonly ownerId =
    process.env.RAILWAY_REPLICA_ID?.trim() ||
    process.env.RAILWAY_DEPLOYMENT_ID?.trim() ||
    null;

  constructor(
    private readonly bookingV2: BookingV2Service,
    private readonly dynamoDbSeatCache: DynamoDbSeatCacheService,
    private readonly leader: ChartCronLeaderService,
    private readonly topRoutes: PostHogTopRoutesService,
    private readonly prisma: PrismaService,
    private readonly posthogAnalytics: PostHogAnalyticsService,
  ) {}

  private get enabled(): boolean {
    if (process.env.NODE_ENV === 'development') return false;
    const v = process.env.SEAT_CACHE_ENABLED?.trim().toLowerCase();
    return v !== '0' && v !== 'false' && v !== 'no' && v !== 'off';
  }

  /**
   * Resolves and reads targets from data/train-cache-targets.json.
   */
  loadTargets(): TrainCacheTarget[] {
    const candidates = [
      path.resolve(process.cwd(), 'data/train-cache-targets.json'),
      path.resolve(process.cwd(), '../data/train-cache-targets.json'),
      path.resolve(__dirname, '../../../data/train-cache-targets.json'),
      path.resolve(__dirname, '../../../../data/train-cache-targets.json'),
    ];

    for (const filePath of candidates) {
      if (fs.existsSync(filePath)) {
        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const parsed = JSON.parse(raw) as TrainCacheTargetsFile;
          if (Array.isArray(parsed?.targets)) {
            return parsed.targets;
          }
        } catch (err) {
          this.logger.warn(
            `[seat-cache-cron] failed reading targets from ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    this.logger.warn(
      `[seat-cache-cron] no valid train-cache-targets.json found among candidates: ${candidates.join(', ')}`,
    );
    return [];
  }

  /**
   * Daily cron running at 03:30 IST to refresh seat availability cache.
   */
  @Cron('30 3 * * *', { timeZone: 'Asia/Kolkata' })
  async handleCron(): Promise<void> {
    if (!this.enabled) return;
    if (!(await this.leader.isLeader('seat-cache'))) return;
    if (this.running) return;

    this.running = true;
    try {
      await this.refreshSeatCache();
    } catch (err) {
      this.logger.error(
        `[seat-cache-cron] cron tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      captureSentryException(err, {
        tags: { service: 'seat-cache-cron' },
      });
    } finally {
      this.running = false;
    }
  }

  /**
   * Manual run entry point for admin triggers.
   */
  async runNow(options?: { category?: string; trainNumber?: string }): Promise<{
    success: boolean;
    totalRoutesWarmed: number;
    totalTargetsProcessed: number;
    summaryCount: number;
  }> {
    return this.refreshSeatCache(options);
  }

  /**
   * Unified cache warmer:
   * 1. Collate routes from PostHog + popular routes (today + next 5 days)
   * 2. Collate specific train routes and dates from train-cache-targets.json
   * 3. Fetch from ConfirmTkt upstream and write to DynamoDB
   * 4. Build category availability summaries and write to DynamoDB
   */
  async refreshSeatCache(options?: {
    category?: string;
    trainNumber?: string;
  }): Promise<{
    success: boolean;
    totalRoutesWarmed: number;
    totalTargetsProcessed: number;
    summaryCount: number;
  }> {
    const startedAt = new Date();
    this.logger.log('[seat-cache-cron] starting seat cache warming pass...');

    // 1. Get targets from JSON
    let targets = this.loadTargets();
    if (options?.category && options.category !== 'ALL') {
      const cat = options.category.toLowerCase();
      targets = targets.filter((t) => t.category?.toLowerCase() === cat);
    }
    if (options?.trainNumber) {
      const tn = options.trainNumber.trim();
      targets = targets.filter((t) => t.trainNumber === tn);
    }

    // 2. Collate routes to warm:
    // Map: "FROM#TO#YYYY-MM-DD" -> { from, to, dateYmd, dateDmy }
    const routeTasks = new Map<
      string,
      { from: string; to: string; dateYmd: string; dateDmy: string }
    >();

    // A. Add target routes from JSON (only if options don't restrict to something outside)
    for (const target of targets) {
      for (const d of resolveTargetDates(target)) {
        const key = `${target.from.toUpperCase()}#${target.to.toUpperCase()}#${d}`;
        if (!routeTasks.has(key)) {
          routeTasks.set(key, {
            from: target.from.toUpperCase(),
            to: target.to.toUpperCase(),
            dateYmd: d,
            dateDmy: ymdToDmy(d),
          });
        }
      }
    }

    // B. If not filtering by a specific category/train, include PostHog top routes + popular routes
    if (!options?.category && !options?.trainNumber) {
      const topRoutes: TopRoute[] = await this.topRoutes
        .getTopRoutes()
        .catch(() => []);
      const routePairs: Array<{ from: string; to: string }> = [
        ...POPULAR_ROUTE_PAIRS,
        ...topRoutes.map((r) => ({ from: r.from, to: r.to })),
      ];

      // Generate dates for today + DAYS_AHEAD (IST)
      const baseMoment = moment().utcOffset(IST_UTC_OFFSET);
      const datesToWarm: Array<{ ymd: string; dmy: string }> = [];
      for (let i = 0; i <= DAYS_AHEAD; i++) {
        const day = baseMoment.clone().add(i, 'days');
        datesToWarm.push({
          ymd: day.format('YYYY-MM-DD'),
          dmy: day.format('DD-MM-YYYY'),
        });
      }

      for (const pair of routePairs) {
        const f = pair.from.trim().toUpperCase();
        const t = pair.to.trim().toUpperCase();
        if (!f || !t || f === t) continue;

        for (const dateObj of datesToWarm) {
          const key = `${f}#${t}#${dateObj.ymd}`;
          if (!routeTasks.has(key)) {
            routeTasks.set(key, {
              from: f,
              to: t,
              dateYmd: dateObj.ymd,
              dateDmy: dateObj.dmy,
            });
          }
        }
      }
    }

    this.logger.log(
      `[seat-cache-cron] collated ${routeTasks.size} unique route-date searches to warm`,
    );

    let warmedCount = 0;
    let failedCount = 0;
    const taskList = Array.from(routeTasks.values());

    // 3. Process route-date searches with bounded concurrency and rate limit
    const inMemorySearches = new Map<string, Record<string, unknown>>();
    const CONCURRENCY = 2;
    const queue = [...taskList];

    const worker = async () => {
      while (queue.length > 0) {
        const task = queue.shift();
        if (!task) break;

        try {
          const rawSearch = (await this.bookingV2.fetchTrainsFromUpstream(
            task.from,
            task.to,
            task.dateDmy,
          )) as Record<string, unknown>;

          await this.dynamoDbSeatCache.saveRouteCachedSearch(
            task.from,
            task.to,
            task.dateYmd,
            rawSearch,
          );

          inMemorySearches.set(
            `${task.from}#${task.to}#${task.dateYmd}`,
            rawSearch,
          );
          warmedCount++;
          await sleep(250); // 250ms throttle per worker
        } catch (err) {
          failedCount++;
          this.logger.warn(
            `[seat-cache-cron] failed warming ${task.from}->${task.to} on ${task.dateYmd}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    };

    if (taskList.length > 0) {
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, taskList.length) }, worker),
      );
    }

    // 4. Build category availability summaries from target trains
    const summaryMap: TrainAvailabilitySummaryMap = {};
    const nowIso = new Date().toISOString();

    for (const target of targets) {
      const summaryItem: TrainAvailabilitySummaryItem = {
        trainNumber: target.trainNumber,
        trainName: target.trainName,
        from: target.from,
        to: target.to,
        category: target.category,
        totalAvailableSeats: 0,
        availableClasses: [],
        lowestFare: null,
        dates: {},
        lastUpdated: nowIso,
      };

      const classesWithSeats = new Set<string>();
      let minFare: number | null = null;
      let grandTotalSeats = 0;

      for (const d of resolveTargetDates(target)) {
        const memKey = `${target.from.toUpperCase()}#${target.to.toUpperCase()}#${d}`;
        // Reuse in-memory search from warming pass if available; fallback to DynamoDB
        const cachedRoute =
          inMemorySearches.get(memKey) ??
          (
            await this.dynamoDbSeatCache.getRouteCachedSearch(
              target.from,
              target.to,
              d,
            )
          ).value;

        const data = cachedRoute?.data as Record<string, unknown> | undefined;
        const trainList = Array.isArray(data?.trainList) ? data.trainList : [];
        const matched = trainList.find(
          (t) =>
            toSafeString((t as Record<string, unknown>).trainNumber).trim() ===
            target.trainNumber,
        ) as Record<string, unknown> | undefined;

        if (
          matched?.availabilityCache &&
          typeof matched.availabilityCache === 'object'
        ) {
          const availCache = matched.availabilityCache as Record<
            string,
            Record<string, unknown>
          >;
          const dateClasses: Record<string, TrainClassAvailability> = {};
          let dateSeats = 0;

          for (const [cls, row] of Object.entries(availCache)) {
            if (!row || typeof row !== 'object') continue;
            const statusText = toSafeString(
              row.availabilityDisplayName ||
                row.railDataStatus ||
                row.availablityStatus,
            );
            const confirmed = isRowConfirmed(row);
            const count = confirmed
              ? Math.max(1, extractAvailableSeatsCount(statusText))
              : 0;

            let fareNum: number | null = null;
            if (row.fare) {
              const parsed = parseInt(toSafeString(row.fare), 10);
              if (!Number.isNaN(parsed) && parsed > 0) fareNum = parsed;
            }

            if (count > 0) {
              dateSeats += count;
              classesWithSeats.add(cls.toUpperCase());
              if (fareNum !== null) {
                if (minFare === null || fareNum < minFare) minFare = fareNum;
              }
            }

            dateClasses[cls.toUpperCase()] = {
              status: statusText || 'NOT_AVAILABLE',
              count,
              fare: fareNum,
            };
          }

          summaryItem.dates[d] = {
            totalSeats: dateSeats,
            classes: dateClasses,
          };
          grandTotalSeats += dateSeats;
        }
      }

      summaryItem.totalAvailableSeats = grandTotalSeats;
      summaryItem.availableClasses = Array.from(classesWithSeats);
      summaryItem.lowestFare = minFare;

      summaryMap[target.trainNumber] = summaryItem;
    }

    // Save summaries to DynamoDB
    if (Object.keys(summaryMap).length > 0) {
      // Save by category (e.g. "diwali")
      const categories = new Set(
        targets.map((t) => t.category?.toLowerCase()).filter(Boolean),
      );
      for (const cat of categories) {
        if (!cat) continue;
        const catFiltered: TrainAvailabilitySummaryMap = {};
        for (const [tn, item] of Object.entries(summaryMap)) {
          if (item.category?.toLowerCase() === cat) {
            catFiltered[tn] = item;
          }
        }
        await this.dynamoDbSeatCache.saveAvailabilitySummary(cat, catFiltered);
      }
      // Save global "ALL"
      await this.dynamoDbSeatCache.saveAvailabilitySummary('ALL', summaryMap);
    }

    const durationMs = Date.now() - startedAt.getTime();
    this.logger.log(
      `[seat-cache-cron] finished warming pass in ${durationMs}ms: warmed=${warmedCount}, failed=${failedCount}, targets=${targets.length}`,
    );

    // Record run in database for audit trail
    try {
      await this.prisma.bestSeatsCronRun.create({
        data: {
          startedAt,
          finishedAt: new Date(),
          durationMs,
          due: routeTasks.size,
          batch: warmedCount,
          refreshed: warmedCount,
          failed: failedCount,
          skipped: 0,
          routes: {
            warmedCount,
            failedCount,
            targetsCount: targets.length,
          },
          ownerId: this.ownerId,
        },
      });
    } catch (e) {
      this.logger.warn(
        `[seat-cache-cron] could not persist run record: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    this.posthogAnalytics.capture('seat_cache_cron_finished', {
      routes_warmed: warmedCount,
      routes_failed: failedCount,
      targets_processed: targets.length,
      summary_count: Object.keys(summaryMap).length,
      duration_ms: durationMs,
      category: options?.category ?? 'all',
      trigger: options ? 'manual' : 'cron',
    });

    return {
      success: true,
      totalRoutesWarmed: warmedCount,
      totalTargetsProcessed: targets.length,
      summaryCount: Object.keys(summaryMap).length,
    };
  }
}
