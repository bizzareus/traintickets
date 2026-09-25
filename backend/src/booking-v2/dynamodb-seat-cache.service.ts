import { Injectable, Logger } from '@nestjs/common';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  BatchWriteCommand,
  paginateScan,
} from '@aws-sdk/lib-dynamodb';

export interface CachedSeatItem {
  trainNumber: string;
  dateClass: string;
  date: string;
  travelClass: string;
  status: string;
  fare?: number | null;
  from?: string;
  to?: string;
  updatedAt?: string;
  ttl?: number;
}

export interface RouteSearchRecord {
  trainNumber: string; // e.g. "ROUTE#NDLS#MMCT"
  dateClass: string; // e.g. "2026-11-05"
  from: string;
  to: string;
  date: string;
  rawSearch: Record<string, unknown>;
  updatedAt: string;
  ttl: number;
}

export interface RouteCacheLookupResult {
  status: 'hit' | 'miss' | 'error' | 'disabled';
  value: Record<string, unknown> | null;
}

export interface CachedTrainInventoryItem {
  trainNumber: string;
  itemCount: number;
  dates: string[];
  classes: string[];
  expiresAt: string | null;
  updatedAt: string | null;
}

export interface SeatCacheInventory {
  available: boolean;
  tableName: string;
  generatedAt: string;
  scannedItemCount: number;
  validItemCount: number;
  trainCount: number;
  seatItemCount: number;
  routeCount: number;
  summaryCount: number;
  expiresAt: string | null;
  updatedAt: string | null;
  trains: CachedTrainInventoryItem[];
}

const DEFAULT_TABLE_NAME = 'lastberth-train-seat-cache';
const DEFAULT_REGION = 'ap-south-1';
const ROUTE_PREFIX = 'ROUTE#';
const DEFAULT_TTL_SECONDS = 48 * 3600; // 48 hours
const STATION_CODE_RE = /^[A-Z0-9]{2,6}$/;

function toSafeString(val: unknown): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return '';
}

@Injectable()
export class DynamoDbSeatCacheService {
  private readonly logger = new Logger(DynamoDbSeatCacheService.name);
  private docClient: DynamoDBDocumentClient | null = null;
  private readonly tableName: string;

  constructor() {
    this.tableName =
      process.env.DYNAMODB_SEAT_CACHE_TABLE?.trim() || DEFAULT_TABLE_NAME;
    this.initClient();
  }

  private initClient(): void {
    if (process.env.DISABLE_DYNAMODB_CACHE === '1') {
      this.logger.log('[DynamoDB] DynamoDB seat cache explicitly disabled');
      return;
    }

    try {
      const region = process.env.AWS_REGION?.trim() || DEFAULT_REGION;
      const client = new DynamoDBClient({ region });
      this.docClient = DynamoDBDocumentClient.from(client, {
        marshallOptions: { removeUndefinedValues: true },
      });
      this.logger.log(
        `[DynamoDB] Initialized DynamoDB client for table "${this.tableName}" in region "${region}"`,
      );
    } catch (err) {
      this.logger.warn(
        `[DynamoDB] Could not initialize DynamoDB client: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  get isAvailable(): boolean {
    return this.docClient !== null;
  }

  async getCacheInventory(): Promise<SeatCacheInventory> {
    const generatedAt = new Date();
    if (!this.docClient) {
      return {
        available: false,
        tableName: this.tableName,
        generatedAt: generatedAt.toISOString(),
        scannedItemCount: 0,
        validItemCount: 0,
        trainCount: 0,
        seatItemCount: 0,
        routeCount: 0,
        summaryCount: 0,
        expiresAt: null,
        updatedAt: null,
        trains: [],
      };
    }

    const nowSecs = Math.floor(generatedAt.getTime() / 1000);
    const items: Record<string, unknown>[] = [];
    let scannedItemCount = 0;

    for await (const page of paginateScan(
      { client: this.docClient },
      {
        TableName: this.tableName,
        ProjectionExpression:
          'trainNumber, dateClass, travelClass, updatedAt, #ttl',
        FilterExpression: 'attribute_not_exists(#ttl) OR #ttl >= :now',
        ExpressionAttributeNames: { '#ttl': 'ttl' },
        ExpressionAttributeValues: { ':now': nowSecs },
      },
    )) {
      scannedItemCount += page.ScannedCount ?? 0;
      items.push(...((page.Items ?? []) as Record<string, unknown>[]));
    }

    const trains = new Map<
      string,
      {
        itemCount: number;
        dates: Set<string>;
        classes: Set<string>;
        expiresAt: number | null;
        updatedAt: string | null;
      }
    >();
    let routeCount = 0;
    let summaryCount = 0;
    let seatItemCount = 0;
    let expiresAt: number | null = null;
    let updatedAt: string | null = null;

    for (const item of items) {
      const trainNumber = toSafeString(item.trainNumber);
      const ttl = typeof item.ttl === 'number' ? item.ttl : null;
      if (!trainNumber || (ttl !== null && ttl < nowSecs)) continue;

      const itemUpdatedAt = toSafeString(item.updatedAt) || null;
      if (ttl !== null && (expiresAt === null || ttl < expiresAt)) {
        expiresAt = ttl;
      }
      if (itemUpdatedAt && (!updatedAt || itemUpdatedAt > updatedAt)) {
        updatedAt = itemUpdatedAt;
      }

      if (trainNumber.startsWith(ROUTE_PREFIX)) {
        routeCount++;
        continue;
      }
      if (trainNumber.startsWith('SUMMARY#')) {
        summaryCount++;
        continue;
      }

      seatItemCount++;
      const dateClass = toSafeString(item.dateClass);
      const [date, classFromKey] = dateClass.split('#');
      const travelClass = toSafeString(item.travelClass) || classFromKey;
      const current = trains.get(trainNumber) ?? {
        itemCount: 0,
        dates: new Set<string>(),
        classes: new Set<string>(),
        expiresAt: null,
        updatedAt: null,
      };
      current.itemCount++;
      if (date) current.dates.add(date);
      if (travelClass) current.classes.add(travelClass);
      if (
        ttl !== null &&
        (current.expiresAt === null || ttl < current.expiresAt)
      ) {
        current.expiresAt = ttl;
      }
      if (
        itemUpdatedAt &&
        (!current.updatedAt || itemUpdatedAt > current.updatedAt)
      ) {
        current.updatedAt = itemUpdatedAt;
      }
      trains.set(trainNumber, current);
    }

    const trainItems = Array.from(trains, ([trainNumber, item]) => ({
      trainNumber,
      itemCount: item.itemCount,
      dates: Array.from(item.dates).sort(),
      classes: Array.from(item.classes).sort(),
      expiresAt: item.expiresAt
        ? new Date(item.expiresAt * 1000).toISOString()
        : null,
      updatedAt: item.updatedAt,
    })).sort((a, b) =>
      a.trainNumber < b.trainNumber
        ? -1
        : Number(a.trainNumber > b.trainNumber),
    );

    return {
      available: true,
      tableName: this.tableName,
      generatedAt: generatedAt.toISOString(),
      scannedItemCount,
      validItemCount: routeCount + summaryCount + seatItemCount,
      trainCount: trainItems.length,
      seatItemCount,
      routeCount,
      summaryCount,
      expiresAt: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
      updatedAt,
      trains: trainItems,
    };
  }

  /**
   * Look up precomputed train search results for a route and date from DynamoDB.
   */
  async getRouteCachedSearch(
    from: string,
    to: string,
    journeyDateYmd: string,
  ): Promise<RouteCacheLookupResult> {
    if (!this.docClient) return { status: 'disabled', value: null };

    const f = from.trim().toUpperCase();
    const t = to.trim().toUpperCase();
    if (!STATION_CODE_RE.test(f) || !STATION_CODE_RE.test(t)) {
      return { status: 'miss', value: null };
    }
    const d = journeyDateYmd.trim();
    const routeKey = `${ROUTE_PREFIX}${f}#${t}`;

    try {
      const res = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            trainNumber: routeKey,
            dateClass: d,
          },
        }),
      );

      if (!res.Item) return { status: 'miss', value: null };

      const nowSecs = Math.floor(Date.now() / 1000);
      if (res.Item.ttl && res.Item.ttl < nowSecs) {
        return { status: 'miss', value: null };
      }

      const raw = res.Item.rawSearch;
      if (raw && typeof raw === 'object') {
        return {
          status: 'hit',
          value: raw as Record<string, unknown>,
        };
      }
      return { status: 'miss', value: null };
    } catch (err) {
      this.logger.warn(
        `[DynamoDB] getRouteCachedSearch error for ${routeKey} ${d}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { status: 'error', value: null };
    }
  }

  /**
   * Saves a full train search result and all per-train seat classes into DynamoDB.
   */
  async saveRouteCachedSearch(
    from: string,
    to: string,
    journeyDateYmd: string,
    rawSearch: Record<string, unknown>,
    ttlSeconds = DEFAULT_TTL_SECONDS,
  ): Promise<void> {
    if (!this.docClient || !rawSearch) return;

    const f = from.trim().toUpperCase();
    const t = to.trim().toUpperCase();
    if (!STATION_CODE_RE.test(f) || !STATION_CODE_RE.test(t)) return;
    const d = journeyDateYmd.trim();
    const routeKey = `${ROUTE_PREFIX}${f}#${t}`;
    const nowSecs = Math.floor(Date.now() / 1000);
    const ttl = nowSecs + ttlSeconds;
    const nowIso = new Date().toISOString();

    // 1. Save the route-level search record
    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            trainNumber: routeKey,
            dateClass: d,
            from: f,
            to: t,
            date: d,
            rawSearch,
            updatedAt: nowIso,
            ttl,
          },
        }),
      );
    } catch (err) {
      this.logger.warn(
        `[DynamoDB] Failed saving route search for ${routeKey} ${d}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 2. Extract and write individual train seat items
    try {
      const data = rawSearch.data as Record<string, unknown> | undefined;
      const trainList = Array.isArray(data?.trainList) ? data.trainList : [];
      const seatItems: CachedSeatItem[] = [];

      for (const item of trainList) {
        if (!item || typeof item !== 'object') continue;
        const train = item as Record<string, unknown>;
        const trainNo = toSafeString(train.trainNumber).trim();
        if (!trainNo) continue;

        const availCache = train.availabilityCache as
          | Record<string, Record<string, unknown>>
          | undefined;
        if (!availCache || typeof availCache !== 'object') continue;

        for (const [cls, row] of Object.entries(availCache)) {
          if (!row || typeof row !== 'object') continue;
          const status =
            toSafeString(
              row.availabilityDisplayName ||
                row.railDataStatus ||
                row.availablityStatus,
            ) || 'AVL';
          let fareNum: number | null = null;
          if (row.fare) {
            const parsed = parseInt(toSafeString(row.fare), 10);
            if (!Number.isNaN(parsed) && parsed > 0) fareNum = parsed;
          }

          seatItems.push({
            trainNumber: trainNo,
            dateClass: `${d}#${cls.toUpperCase()}`,
            date: d,
            travelClass: cls.toUpperCase(),
            status,
            fare: fareNum,
            from: f,
            to: t,
            updatedAt: nowIso,
            ttl,
          });
        }
      }

      if (seatItems.length > 0) {
        await this.batchWriteSeatItems(seatItems);
      }
    } catch (err) {
      this.logger.warn(
        `[DynamoDB] Failed writing seat items for ${routeKey} ${d}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Batch write seat items in chunks of 25 (DynamoDB maximum per BatchWriteItem).
   */
  async batchWriteSeatItems(items: CachedSeatItem[]): Promise<void> {
    if (!this.docClient || items.length === 0) return;

    const BATCH_SIZE = 25;
    const MAX_RETRIES = 3;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const chunk = items.slice(i, i + BATCH_SIZE);
      let putRequests: Array<{
        PutRequest: { Item: Record<string, unknown> };
      }> = chunk.map((item) => ({
        PutRequest: { Item: item as unknown as Record<string, unknown> },
      }));

      let attempt = 0;
      while (putRequests.length > 0 && attempt <= MAX_RETRIES) {
        try {
          const res = await this.docClient.send(
            new BatchWriteCommand({
              RequestItems: {
                [this.tableName]: putRequests,
              },
            }),
          );

          const unprocessed = res.UnprocessedItems?.[this.tableName];
          if (Array.isArray(unprocessed) && unprocessed.length > 0) {
            putRequests = unprocessed as typeof putRequests;
            attempt++;
            if (attempt <= MAX_RETRIES) {
              await new Promise((resolve) =>
                setTimeout(resolve, 50 * 2 ** attempt),
              );
            } else {
              this.logger.warn(
                `[DynamoDB] Dropped ${putRequests.length} unprocessed seat items after ${MAX_RETRIES} retries`,
              );
              break;
            }
          } else {
            break;
          }
        } catch (err) {
          this.logger.warn(
            `[DynamoDB] BatchWrite failed at offset ${i} (attempt ${attempt}): ${err instanceof Error ? err.message : String(err)}`,
          );
          break;
        }
      }
    }
  }

  /**
   * Queries cached seats for a trainNumber across dates.
   */
  async getTrainCachedSeats(trainNumber: string): Promise<CachedSeatItem[]> {
    if (!this.docClient) return [];

    const tn = trainNumber.trim();
    if (!tn) return [];

    try {
      const res = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'trainNumber = :tn',
          ExpressionAttributeValues: {
            ':tn': tn,
          },
          ConsistentRead: false,
        }),
      );

      if (!res.Items || res.Items.length === 0) {
        return [];
      }

      const nowSecs = Math.floor(Date.now() / 1000);
      return res.Items.filter((item) => !item.ttl || item.ttl >= nowSecs).map(
        (item) => ({
          trainNumber: String(item.trainNumber || ''),
          dateClass: String(item.dateClass || ''),
          date: String(item.date || ''),
          travelClass: String(item.travelClass || ''),
          status: String(item.status || 'AVAILABLE'),
          fare: typeof item.fare === 'number' ? item.fare : null,
          from: item.from ? String(item.from) : undefined,
          to: item.to ? String(item.to) : undefined,
          updatedAt: item.updatedAt ? String(item.updatedAt) : undefined,
        }),
      );
    } catch (err) {
      this.logger.warn(
        `[DynamoDB] getTrainCachedSeats failed for ${tn}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  /**
   * Save a computed category summary into DynamoDB.
   */
  async saveAvailabilitySummary(
    category: string,
    summary: Record<string, unknown>,
    ttlSeconds = DEFAULT_TTL_SECONDS,
  ): Promise<void> {
    if (!this.docClient) return;

    const catKey = `SUMMARY#${(category || 'ALL').trim().toUpperCase()}`;
    const nowSecs = Math.floor(Date.now() / 1000);
    const ttl = nowSecs + ttlSeconds;
    const nowIso = new Date().toISOString();

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            trainNumber: catKey,
            dateClass: 'LATEST',
            category: category.trim().toLowerCase(),
            summary,
            updatedAt: nowIso,
            ttl,
          },
        }),
      );
    } catch (err) {
      this.logger.warn(
        `[DynamoDB] Failed saving availability summary for ${catKey}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Retrieve cached availability summary from DynamoDB.
   */
  async getAvailabilitySummary(
    category?: string,
  ): Promise<Record<string, unknown> | null> {
    if (!this.docClient) return null;

    const catKey = `SUMMARY#${(category || 'ALL').trim().toUpperCase()}`;
    try {
      const res = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            trainNumber: catKey,
            dateClass: 'LATEST',
          },
        }),
      );

      if (!res.Item) return null;
      const nowSecs = Math.floor(Date.now() / 1000);
      if (res.Item.ttl && res.Item.ttl < nowSecs) return null;

      if (res.Item.summary && typeof res.Item.summary === 'object') {
        return res.Item.summary as Record<string, unknown>;
      }
      return null;
    } catch (err) {
      this.logger.warn(
        `[DynamoDB] getAvailabilitySummary failed for ${catKey}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}
