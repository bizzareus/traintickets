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
const ALT_PATH_PREFIX = 'ALTPATH#';
const BEST_TRAIN_PREFIX = 'BESTTRAIN#';
const DEFAULT_TTL_SECONDS = 48 * 3600; // 48 hours
const STATION_CODE_RE = /^[A-Z0-9]{2,6}$/;
/** Serve a repeated admin inventory view from memory instead of re-scanning. */
const INVENTORY_CACHE_TTL_MS = 5 * 60 * 1000;

function toSafeString(val: unknown): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return '';
}

// DynamoDB reports auth failures, validation, throttling, and missing
// resources all as HTTP 400, so log the AWS exception name
// (e.g. UnrecognizedClientException, AccessDeniedException,
// ValidationException) to tell them apart.
function awsErrorLabel(err: unknown): string {
  const name = err instanceof Error && err.name ? err.name : 'UnknownError';
  const message = err instanceof Error ? err.message : String(err);
  return `${name}: ${message}`;
}

@Injectable()
export class DynamoDbSeatCacheService {
  private readonly logger = new Logger(DynamoDbSeatCacheService.name);
  private docClient: DynamoDBDocumentClient | null = null;
  private readonly tableName: string;
  private inventoryCache: { at: number; value: SeatCacheInventory } | null =
    null;
  /** In-memory L1 cache for hot route searches (TTL 60s, max 500 entries) */
  private readonly l1RouteCache = new Map<
    string,
    { expiresAt: number; value: Record<string, unknown> }
  >();
  /** In-memory L1 cache for hot alt path searches (TTL 60s, max 1000 entries) */
  private readonly l1AltPathCache = new Map<
    string,
    { expiresAt: number; value: Record<string, unknown> }
  >();
  /** In-memory L1 cache for hot best train searches (TTL 60s, max 500 entries) */
  private readonly l1BestTrainCache = new Map<
    string,
    {
      expiresAt: number;
      value: {
        value: Record<string, unknown>;
        cachedAt: Date;
        expiresAt: Date;
      };
    }
  >();

  private trimL1Cache<K, V>(map: Map<K, V>, maxSize: number): void {
    if (map.size >= maxSize) {
      const iter = map.keys().next();
      if (!iter.done && iter.value !== undefined) {
        map.delete(iter.value);
      }
    }
  }

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
      // Adaptive retry backs off on throttling instead of hammering a
      // capacity-limited table.
      const client = new DynamoDBClient({
        region,
        maxAttempts: 5,
        retryMode: 'adaptive',
      });
      this.docClient = DynamoDBDocumentClient.from(client, {
        marshallOptions: { removeUndefinedValues: true },
      });
      this.logger.log(
        `[DynamoDB] Initialized DynamoDB client for table "${this.tableName}" in region "${region}"`,
      );
    } catch (err) {
      this.logger.warn(
        `[DynamoDB] Could not initialize DynamoDB client: ${awsErrorLabel(err)}`,
      );
    }
  }

  get isAvailable(): boolean {
    return this.docClient !== null;
  }

  async getCacheInventory(): Promise<SeatCacheInventory> {
    const now = Date.now();
    if (
      this.inventoryCache &&
      now - this.inventoryCache.at < INVENTORY_CACHE_TTL_MS
    ) {
      return this.inventoryCache.value;
    }

    const generatedAt = new Date();
    if (!this.docClient) {
      return this.emptyInventory(generatedAt);
    }

    const nowSecs = Math.floor(generatedAt.getTime() / 1000);
    const items: Record<string, unknown>[] = [];
    let scannedItemCount = 0;

    try {
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
    } catch (err) {
      // A full-table Scan can exceed provisioned read capacity; degrade
      // gracefully instead of surfacing a 500 to the admin endpoint.
      this.logger.warn(
        `[DynamoDB] getCacheInventory scan failed: ${awsErrorLabel(err)}`,
      );
      return this.emptyInventory(generatedAt);
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
      if (
        trainNumber.startsWith(ALT_PATH_PREFIX) ||
        trainNumber.startsWith(BEST_TRAIN_PREFIX)
      ) {
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

    const result: SeatCacheInventory = {
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
    this.inventoryCache = { at: now, value: result };
    return result;
  }

  private emptyInventory(generatedAt: Date): SeatCacheInventory {
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

  /**
   * Look up precomputed train search results for a route and date from DynamoDB (with in-memory L1 cache).
   */
  async getRouteCachedSearch(
    from: string,
    to: string,
    journeyDateYmd: string,
  ): Promise<RouteCacheLookupResult> {
    const f = from.trim().toUpperCase();
    const t = to.trim().toUpperCase();
    if (!STATION_CODE_RE.test(f) || !STATION_CODE_RE.test(t)) {
      return { status: 'miss', value: null };
    }
    const d = journeyDateYmd.trim();
    const routeKey = `${ROUTE_PREFIX}${f}#${t}`;
    const l1Key = `${routeKey}#${d}`;

    const now = Date.now();
    const l1Hit = this.l1RouteCache.get(l1Key);
    if (l1Hit) {
      if (l1Hit.expiresAt > now) {
        return { status: 'hit', value: l1Hit.value };
      }
      this.l1RouteCache.delete(l1Key);
    }

    if (!this.docClient) return { status: 'disabled', value: null };

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

      const nowSecs = Math.floor(now / 1000);
      if (res.Item.ttl && res.Item.ttl < nowSecs) {
        return { status: 'miss', value: null };
      }

      const raw = res.Item.rawSearch;
      if (raw && typeof raw === 'object') {
        const val = raw as Record<string, unknown>;
        this.trimL1Cache(this.l1RouteCache, 500);
        this.l1RouteCache.set(l1Key, { expiresAt: now + 60_000, value: val });
        return {
          status: 'hit',
          value: val,
        };
      }
      return { status: 'miss', value: null };
    } catch (err) {
      this.logger.warn(
        `[DynamoDB] getRouteCachedSearch error for ${routeKey} ${d}: ${awsErrorLabel(err)}`,
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
    if (!rawSearch) return;

    const f = from.trim().toUpperCase();
    const t = to.trim().toUpperCase();
    if (!STATION_CODE_RE.test(f) || !STATION_CODE_RE.test(t)) return;
    const d = journeyDateYmd.trim();
    const routeKey = `${ROUTE_PREFIX}${f}#${t}`;
    const l1Key = `${routeKey}#${d}`;

    // Update in-memory L1 cache immediately
    this.trimL1Cache(this.l1RouteCache, 500);
    this.l1RouteCache.set(l1Key, {
      expiresAt: Date.now() + 60_000,
      value: rawSearch,
    });

    if (!this.docClient) return;

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
        `[DynamoDB] Failed saving route search for ${routeKey} ${d}: ${awsErrorLabel(err)}`,
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
        `[DynamoDB] Failed writing seat items for ${routeKey} ${d}: ${awsErrorLabel(err)}`,
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
            `[DynamoDB] BatchWrite failed at offset ${i} (attempt ${attempt}): ${awsErrorLabel(err)}`,
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
        `[DynamoDB] getTrainCachedSeats failed for ${tn}: ${awsErrorLabel(err)}`,
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
        `[DynamoDB] Failed saving availability summary for ${catKey}: ${awsErrorLabel(err)}`,
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
        `[DynamoDB] getAvailabilitySummary failed for ${catKey}: ${awsErrorLabel(err)}`,
      );
      return null;
    }
  }

  /**
   * Save a computed alternate-path split result into DynamoDB (with in-memory L1 cache).
   */
  async saveAltPath(
    from: string,
    to: string,
    trainNumber: string,
    dateDdMmYyyy: string,
    classKey: string,
    quota: string,
    result: Record<string, unknown>,
    ttlSeconds = 6 * 3600,
  ): Promise<void> {
    if (!result) return;

    const f = from.trim().toUpperCase();
    const t = to.trim().toUpperCase();
    const tn = trainNumber.trim();
    const d = dateDdMmYyyy.trim();
    const q = (quota || 'GN').trim().toUpperCase();
    const ck = (classKey || 'ALL').trim().toUpperCase();
    const routeKey = `${ALT_PATH_PREFIX}${f}#${t}`;
    const sortKey = `${tn}#${ck}#${d}#${q}`;
    const l1Key = `${routeKey}#${sortKey}`;

    // Update in-memory L1 cache
    this.trimL1Cache(this.l1AltPathCache, 1000);
    this.l1AltPathCache.set(l1Key, {
      expiresAt: Date.now() + 60_000,
      value: result,
    });

    if (!this.docClient) return;

    const nowSecs = Math.floor(Date.now() / 1000);
    const ttl = nowSecs + ttlSeconds;
    const nowIso = new Date().toISOString();

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            trainNumber: routeKey,
            dateClass: sortKey,
            from: f,
            to: t,
            trainNo: tn,
            classKey: ck,
            date: d,
            quota: q,
            result,
            updatedAt: nowIso,
            ttl,
          },
        }),
      );
    } catch (err) {
      this.logger.warn(
        `[DynamoDB] Failed saving alt path for ${routeKey} ${sortKey}: ${awsErrorLabel(err)}`,
      );
    }
  }

  /**
   * Look up a single cached alternate path by exact parameters (with in-memory L1 cache).
   */
  async getAltPath(
    from: string,
    to: string,
    trainNumber: string,
    dateDdMmYyyy: string,
    classKey: string,
    quota = 'GN',
  ): Promise<Record<string, unknown> | null> {
    const f = from.trim().toUpperCase();
    const t = to.trim().toUpperCase();
    const tn = trainNumber.trim();
    const d = dateDdMmYyyy.trim();
    const q = (quota || 'GN').trim().toUpperCase();
    const ck = (classKey || 'ALL').trim().toUpperCase();
    const routeKey = `${ALT_PATH_PREFIX}${f}#${t}`;
    const sortKey = `${tn}#${ck}#${d}#${q}`;
    const l1Key = `${routeKey}#${sortKey}`;

    const now = Date.now();
    const l1Hit = this.l1AltPathCache.get(l1Key);
    if (l1Hit) {
      if (l1Hit.expiresAt > now) {
        return l1Hit.value;
      }
      this.l1AltPathCache.delete(l1Key);
    }

    if (!this.docClient) return null;

    try {
      const res = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            trainNumber: routeKey,
            dateClass: sortKey,
          },
        }),
      );

      if (!res.Item) return null;
      const nowSecs = Math.floor(now / 1000);
      if (res.Item.ttl && res.Item.ttl < nowSecs) return null;

      if (res.Item.result && typeof res.Item.result === 'object') {
        const val = res.Item.result as Record<string, unknown>;
        this.trimL1Cache(this.l1AltPathCache, 1000);
        this.l1AltPathCache.set(l1Key, { expiresAt: now + 60_000, value: val });
        return val;
      }
      return null;
    } catch (err) {
      this.logger.warn(
        `[DynamoDB] getAltPath failed for ${routeKey} ${sortKey}: ${awsErrorLabel(err)}`,
      );
      return null;
    }
  }

  /**
   * Find all cached alternate paths for a route and date using a fast DynamoDB Query.
   */
  async findAltPathsByRouteAndDate(
    from: string,
    to: string,
    dateDdMmYyyy: string,
    quota = 'GN',
  ): Promise<
    Array<{
      trainNumber: string;
      classKey: string;
      result: Record<string, unknown>;
    }>
  > {
    if (!this.docClient) return [];

    const f = from.trim().toUpperCase();
    const t = to.trim().toUpperCase();
    const d = dateDdMmYyyy.trim();
    const q = (quota || 'GN').trim().toUpperCase();
    const routeKey = `${ALT_PATH_PREFIX}${f}#${t}`;
    const dateSuffix = `#${d}#${q}`;

    try {
      const res = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'trainNumber = :pk',
          ExpressionAttributeValues: {
            ':pk': routeKey,
          },
          ConsistentRead: false,
        }),
      );

      if (!res.Items || res.Items.length === 0) return [];

      const nowSecs = Math.floor(Date.now() / 1000);
      const out: Array<{
        trainNumber: string;
        classKey: string;
        result: Record<string, unknown>;
      }> = [];

      for (const item of res.Items) {
        if (item.ttl && item.ttl < nowSecs) continue;
        const sortKey = toSafeString(item.dateClass);
        if (!sortKey.endsWith(dateSuffix)) continue;

        const parts = sortKey.split('#');
        if (parts.length < 4) continue;
        const trainNumber = parts[0];
        const classKey = parts[1];
        const result = item.result as Record<string, unknown>;
        if (!result || typeof result !== 'object') continue;

        out.push({ trainNumber, classKey, result });
      }

      return out;
    } catch (err) {
      this.logger.warn(
        `[DynamoDB] findAltPathsByRouteAndDate failed for ${routeKey} ${d}: ${awsErrorLabel(err)}`,
      );
      return [];
    }
  }

  /**
   * Save a cached best-train payload into DynamoDB (with in-memory L1 cache).
   */
  async saveBestTrain(
    from: string,
    to: string,
    dateDdMmYyyy: string,
    payload: Record<string, unknown>,
    ttlSeconds = 24 * 3600,
  ): Promise<void> {
    if (!payload) return;

    const f = from.trim().toUpperCase();
    const t = to.trim().toUpperCase();
    const d = dateDdMmYyyy.trim();
    const routeKey = `${BEST_TRAIN_PREFIX}${f}#${t}`;
    const l1Key = `${routeKey}#${d}`;
    const nowSecs = Math.floor(Date.now() / 1000);
    const ttl = nowSecs + ttlSeconds;
    const nowIso = new Date().toISOString();

    // Update in-memory L1 cache
    this.trimL1Cache(this.l1BestTrainCache, 500);
    this.l1BestTrainCache.set(l1Key, {
      expiresAt: Date.now() + 60_000,
      value: {
        value: payload,
        cachedAt: new Date(),
        expiresAt: new Date(ttl * 1000),
      },
    });

    if (!this.docClient) return;

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
            payload,
            cachedAt: nowIso,
            updatedAt: nowIso,
            ttl,
          },
        }),
      );
    } catch (err) {
      this.logger.warn(
        `[DynamoDB] saveBestTrain failed for ${routeKey} ${d}: ${awsErrorLabel(err)}`,
      );
    }
  }

  /**
   * Look up a cached best-train record by OD and date from DynamoDB (with in-memory L1 cache).
   */
  async getBestTrain(
    from: string,
    to: string,
    dateDdMmYyyy: string,
  ): Promise<{
    value: Record<string, unknown>;
    cachedAt: Date;
    expiresAt: Date;
  } | null> {
    const f = from.trim().toUpperCase();
    const t = to.trim().toUpperCase();
    const d = dateDdMmYyyy.trim();
    const routeKey = `${BEST_TRAIN_PREFIX}${f}#${t}`;
    const l1Key = `${routeKey}#${d}`;

    const now = Date.now();
    const l1Hit = this.l1BestTrainCache.get(l1Key);
    if (l1Hit) {
      if (l1Hit.expiresAt > now) {
        return l1Hit.value;
      }
      this.l1BestTrainCache.delete(l1Key);
    }

    if (!this.docClient) return null;

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

      if (!res.Item) return null;
      const nowSecs = Math.floor(now / 1000);
      if (res.Item.ttl && res.Item.ttl < nowSecs) return null;

      const payload = res.Item.payload;
      if (!payload || typeof payload !== 'object') return null;

      const cachedAt = res.Item.cachedAt
        ? new Date(String(res.Item.cachedAt))
        : new Date();
      const expiresAt = res.Item.ttl
        ? new Date(Number(res.Item.ttl) * 1000)
        : new Date(Date.now() + 86400000);

      const entry = {
        value: payload as Record<string, unknown>,
        cachedAt,
        expiresAt,
      };

      this.trimL1Cache(this.l1BestTrainCache, 500);
      this.l1BestTrainCache.set(l1Key, {
        expiresAt: now + 60_000,
        value: entry,
      });

      return entry;
    } catch (err) {
      this.logger.warn(
        `[DynamoDB] getBestTrain failed for ${routeKey} ${d}: ${awsErrorLabel(err)}`,
      );
      return null;
    }
  }
}
