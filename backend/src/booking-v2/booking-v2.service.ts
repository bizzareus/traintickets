import { Injectable, Logger } from '@nestjs/common';
import moment from 'moment';
import { IrctcService } from '../irctc/irctc.service';
import { CacheService } from '../cache/cache.service';
import { StationCacheService } from '../cache/station-cache.service';
import {
  BOOKING_V2_ALTERNATE_PATH_CLASSES,
  BOOKING_V2_RAIL_API_AVAILABILITY_HEADERS,
  BOOKING_V2_RAIL_API_BASE,
  BOOKING_V2_RAIL_API_HEADERS,
} from './booking-v2.constants';
import {
  avlDayMatchesJourneyDate,
  collapsibleRealtimeRemainderEndpoints,
  filterDepartedTrainsFromSearchResponse,
  isLegConfirmed,
  legScheduleTiming,
  normalizeAndDedupeClassCodes,
  normalizeScheduleStationCode,
  orderedDestinationIndices,
  parseScheduleDayCount,
  parseUpstreamAvailablityType,
  stationCodesBetweenStops,
  ymdToRailApiDdMmYyyy,
} from './booking-v2.utils';

/** Opaque upstream JSON key for vendor prediction text on availability day rows. */
const UPSTREAM_VENDOR_STATUS_KEY = Buffer.from(
  'Y29uZmlybVRrdFN0YXR1cw==',
  'base64',
).toString('utf8');

/** One class option for a confirmed leg — used in `confirmedClassOptions`. */
export type AlternatePathClassOption = {
  travelClass: string;
  railDataStatus: string | null;
  availablityStatus: string | null;
  predictionPercentage: string | null;
  availabilityDisplayName: string | null;
  fare: number | null;
};

export type AlternatePathLeg = {
  from: string;
  to: string;
  /** Confirmed booking segment vs. hop with no usable class — verify live on IRCTC. */
  segmentKind: 'confirmed' | 'check_realtime';
  /** Travel class when `segmentKind` is confirmed; null for check_realtime. */
  travelClass: string | null;
  railDataStatus: string | null;
  availablityStatus: string | null;
  predictionPercentage: string | null;
  availabilityDisplayName: string | null;
  fare: number | null;
  /**
   * All confirmed class options for this segment, sorted cheapest-first.
   * Populated only when `segmentKind` is `'confirmed'`.
   * When there is only one confirmed class this will have length 1.
   */
  confirmedClassOptions: AlternatePathClassOption[];
  /** From IRCTC schedule at boarding stop (HH:MM). */
  departureTime: string | null;
  /** From IRCTC schedule at alighting stop (HH:MM). */
  arrivalTime: string | null;
  /** Travel time for this leg when both clocks resolved (and `dayCount` when present). */
  durationMinutes: number | null;
};

// ---------------------------------------------------------------------------
// Progress streaming
// ---------------------------------------------------------------------------

/** Granular events emitted during findAlternatePaths for real-time UI feedback. */
export type AlternatePathProgressEvent =
  | { type: 'schedule_ok'; trainName: string | null; stopCount: number }
  | { type: 'schedule_fail' }
  | { type: 'route_ok'; from: string; to: string; stopCount: number }
  | { type: 'route_fail'; from: string; to: string }
  | {
      type: 'hop_confirmed';
      from: string;
      to: string;
      travelClass: string;
      fare: number | null;
      hopIndex: number;
    }
  | { type: 'hop_unavailable'; from: string; to: string; hopIndex: number }
  | {
      type: 'done';
      isComplete: boolean;
      legCount: number;
      totalFare: number | null;
    };

export type AlternatePathRemainderMergedSchedule = {
  from: string;
  to: string;
  departureTime: string | null;
  arrivalTime: string | null;
  durationMinutes: number | null;
};

export type FindAlternatePathsResult = {
  trainNumber: string;
  legs: AlternatePathLeg[];
  totalFare: number | null;
  legCount: number;
  isComplete: boolean;
  stationCodesOnRoute: string[];
  /** Code → human-readable name for every station on the route (from IRCTC schedule). */
  stationNameMap: Record<string, string>;
  /** When the UI merges a realtime suffix, IRCTC schedule timing for that whole OD (DEE → BVI). */
  remainderMergedSchedule: AlternatePathRemainderMergedSchedule | null;
  /** Code and departure time (HH:MM) of the train's very first station. */
  trainOriginCode: string | null;
  trainOriginDepartureTime: string | null;
  /** Step-by-step trace for debugging (also logged with Logger). */
  debugLog: string[];
  trainStartDate?: string;
};

type AvlDayRow = {
  availablityType?: number | string | null;
  availablityStatus?: string | null;
  vendorPredictionStatus?: string | null;
  predictionPercentage?: string | null;
  availabilityDisplayName?: string | null;
};

type SegmentProbeRow = {
  day: AvlDayRow | null;
  fare: number | null;
  fetchError?: string;
};

type MultiClassProbeResult = {
  perClass: SegmentProbeRow[];
  bestConfirmedClassIndex: number | null;
  /** First class with an availability row (for regret / realtime messaging). */
  displayRow: AvlDayRow | null;
};

/** 24 hours in milliseconds — TTL for train search cache entries. */
const TRAIN_SEARCH_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class BookingV2Service {
  private readonly logger = new Logger(BookingV2Service.name);

  constructor(
    private readonly irctc: IrctcService,
    private readonly cache: CacheService,
    private readonly stationCache: StationCacheService,
  ) {}

  async getTrainSchedule(trainNumber: string) {
    return this.irctc.getTrainSchedule(trainNumber);
  }

  /** `YYYY-MM-DD` or passthrough if already `DD-MM-YYYY`. */
  normalizeToRailApiDate(dateInput: string): string | null {
    const t = String(dateInput).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return ymdToRailApiDdMmYyyy(t);
    if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(t)) {
      const m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
      if (!m) return null;
      const d = m[1].padStart(2, '0');
      const mo = m[2].padStart(2, '0');
      return `${d}-${mo}-${m[3]}`;
    }
    return null;
  }

  private normalizeAvlDayRow(r: Record<string, unknown>): AvlDayRow {
    const rawVendor = r[UPSTREAM_VENDOR_STATUS_KEY];
    const vendor =
      typeof rawVendor === 'string' && rawVendor.trim() !== ''
        ? rawVendor.trim()
        : null;
    return {
      availablityType: r.availablityType as AvlDayRow['availablityType'],
      availablityStatus:
        typeof r.availablityStatus === 'string' ? r.availablityStatus : null,
      vendorPredictionStatus: vendor,
      predictionPercentage:
        typeof r.predictionPercentage === 'string'
          ? r.predictionPercentage
          : null,
      availabilityDisplayName:
        typeof r.availabilityDisplayName === 'string'
          ? r.availabilityDisplayName
          : null,
    };
  }

  async searchStations(searchString: string): Promise<unknown> {
    const q = (searchString || '').trim();

    // DB-first: try the station cache before hitting the upstream API.
    const cached = await this.stationCache.search(q);
    if (cached !== null) {
      return { data: { stationList: cached } };
    }

    const params = new URLSearchParams({
      searchString: q,
      sourceStnCode: '',
      popularStnListLimit: '15',
      preferredStnListLimit: '6',
      channel: 'mweb',
      language: 'EN',
    });
    const url = `${BOOKING_V2_RAIL_API_BASE.stationsSuggest}?${params}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: BOOKING_V2_RAIL_API_HEADERS,
    });
    const text = await res.text();
    if (!res.ok) {
      this.logger.warn(
        `[booking-v2/stations] upstream ${res.status} q=${q.slice(0, 40)} body=${text.slice(0, 300)}`,
      );
      throw new Error(`Station search failed: ${res.status}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new Error('Station search: invalid JSON');
    }
    const merged = this.mergeStationSuggestResponse(parsed);

    // Fire-and-forget: populate the station cache from API results.
    const stations = this.extractStationListFromResponse(merged);
    if (stations.length > 0) {
      void this.stationCache
        .upsertMany(stations)
        .catch((e: unknown) =>
          this.logger.warn('[booking-v2/stations] cache upsert failed', e),
        );
    }

    return merged;
  }

  /** Extract a flat stationList from a merged suggest response for cache upsert. */
  private extractStationListFromResponse(
    body: unknown,
  ): Array<{ stationCode: string; stationName: string }> {
    if (!body || typeof body !== 'object') return [];
    const data = (body as Record<string, unknown>).data;
    if (!data || typeof data !== 'object') return [];
    const list = (data as Record<string, unknown>).stationList;
    if (!Array.isArray(list)) return [];
    const out: Array<{ stationCode: string; stationName: string }> = [];
    for (const row of list) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, string>;
      const code = (r.stationCode ?? '').trim();
      const name = (r.stationName ?? '').trim();
      if (code && name) out.push({ stationCode: code, stationName: name });
    }
    return out;
  }

  /** Merge stationList + popularStationList (+ preferred), dedupe by code+name. */
  private mergeStationSuggestResponse(body: unknown): unknown {
    if (!body || typeof body !== 'object') return body;
    const root = body as Record<string, unknown>;
    const data = root.data;
    if (!data || typeof data !== 'object') return body;
    const d = data as Record<string, unknown>;
    const merge = (lists: unknown[][]): unknown[] => {
      const seen = new Set<string>();
      const out: unknown[] = [];
      for (const list of lists) {
        for (const row of list) {
          if (!row || typeof row !== 'object') continue;
          const r = row as Record<string, unknown>;
          const code = ((r.stationCode as string) || '').trim();
          const name = ((r.stationName as string) || '').trim();
          const key = `${code}|${name}`.toUpperCase();
          if (!code || seen.has(key)) continue;
          seen.add(key);
          out.push(row);
        }
      }
      return out;
    };
    const a = Array.isArray(d.stationList) ? d.stationList : [];
    const b = Array.isArray(d.popularStationList) ? d.popularStationList : [];
    const c = Array.isArray(d.preferredStationList)
      ? d.preferredStationList
      : [];
    const stationList = merge([a, b, c]);
    return {
      ...root,
      data: {
        ...d,
        stationList,
      },
    };
  }

  async searchTrains(
    from: string,
    to: string,
    dateInput: string,
  ): Promise<unknown> {
    const dateDdMmYyyy = this.normalizeToRailApiDate(dateInput);
    if (!dateDdMmYyyy) throw new Error('Invalid journey date');

    const cacheKey = `trains:${from.trim().toUpperCase()}:${to.trim().toUpperCase()}:${dateDdMmYyyy}`;
    return this.cache.getOrSet(
      cacheKey,
      () => this.fetchTrainsFromUpstream(from, to, dateDdMmYyyy),
      TRAIN_SEARCH_TTL_MS,
    );
  }

  private async fetchTrainsFromUpstream(
    from: string,
    to: string,
    dateDdMmYyyy: string,
  ): Promise<unknown> {
    const params = new URLSearchParams({
      sourceStationCode: from.trim().toUpperCase(),
      destinationStationCode: to.trim().toUpperCase(),
      addAvailabilityCache: 'true',
      excludeMultiTicketAlternates: 'false',
      excludeBoostAlternates: 'false',
      sortBy: 'DEFAULT',
      dateOfJourney: dateDdMmYyyy,
      enableNearby: 'true',
      enableTG: 'true',
      tGPlan: 'CTG-A36',
      showTGPrediction: 'false',
      tgColor: 'DEFAULT',
      showPredictionGlobal: 'true',
      showNewAlternates: 'true',
      showNewAltText: 'true',
    });
    const url = `${BOOKING_V2_RAIL_API_BASE.trainsSearch}?${params}`;
    const res = await fetch(url, { headers: BOOKING_V2_RAIL_API_HEADERS });
    const text = await res.text();
    if (!res.ok) {
      this.logger.warn(
        `[booking-v2/trains/search] upstream ${res.status} body=${text.slice(0, 200)}`,
      );
      throw new Error(`Train search failed: ${res.status}`);
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      const sanitized = this.sanitizeVendorStatusKeys(parsed);
      return filterDepartedTrainsFromSearchResponse(sanitized);
    } catch {
      throw new Error('Train search: invalid JSON');
    }
  }

  /** Recursively expose `railDataStatus` instead of legacy vendor-only JSON keys. */
  private sanitizeVendorStatusKeys(node: unknown): unknown {
    if (node == null) return node;
    if (Array.isArray(node)) {
      return node.map((x) => this.sanitizeVendorStatusKeys(x));
    }
    if (typeof node !== 'object') return node;
    const legacyKey = Buffer.from(
      'Y29uZmlybVRrdFN0YXR1cw==',
      'base64',
    ).toString('utf8');
    const obj = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === legacyKey) {
        out.railDataStatus = this.sanitizeVendorStatusKeys(v);
        continue;
      }
      out[k] = this.sanitizeVendorStatusKeys(v);
    }
    return out;
  }

  async checkAvailability(
    trainNo: string,
    from: string,
    to: string,
    dateInput: string,
    travelClass: string,
    quota: string,
  ): Promise<unknown> {
    const dateDdMmYyyy = this.normalizeToRailApiDate(dateInput);
    if (!dateDdMmYyyy) throw new Error('Invalid journey date');
    const params = new URLSearchParams({
      trainNo: String(trainNo).trim(),
      sourceStationCode: from.trim().toUpperCase(),
      destinationStationCode: to.trim().toUpperCase(),
      dateOfJourney: dateDdMmYyyy,
      quota: quota.trim().toUpperCase() || 'GN',
      travelClass: travelClass.trim().toUpperCase() || 'SL',
      enableTG: 'true',
      tGPlan: 'CTG-A36',
      showTGPrediction: 'false',
      tgColor: 'DEFAULT',
      showPredictionGlobal: 'true',
      showNewMealOptions: 'true',
      showNewAlternates: 'false',
      showNewAltText: 'true',
    });
    const url = `${BOOKING_V2_RAIL_API_BASE.fetchAvailability}?${params}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: BOOKING_V2_RAIL_API_AVAILABILITY_HEADERS,
      body: '',
    });
    const text = await res.text();
    if (!res.ok) {
      this.logger.warn(
        `[booking-v2/availability] upstream ${res.status} train=${trainNo} ${from}-${to} body=${text.slice(0, 200)}`,
      );
      throw new Error(`Availability request failed: ${res.status}`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error('Availability: invalid JSON');
    }
  }

  async findAlternatePaths(
    input: {
      trainNumber: string;
      from: string;
      to: string;
      date: string;
      /** Classes offered on this train (train search `avlClasses`). When empty, a default list is used. */
      avlClasses?: string[];
      quota?: string;
    },
    onProgress?: (event: AlternatePathProgressEvent) => void,
  ): Promise<FindAlternatePathsResult> {
    const emit = (ev: AlternatePathProgressEvent) => onProgress?.(ev);
    const trainNumber = String(input.trainNumber).trim();
    const from = String(input.from).trim().toUpperCase();
    const to = String(input.to).trim().toUpperCase();
    const quota = String(input.quota ?? 'GN')
      .trim()
      .toUpperCase();
    const dateDdMmYyyy = this.normalizeToRailApiDate(input.date);
    const debugLog: string[] = [];
    const logStep = (msg: string) => {
      debugLog.push(msg);
      this.logger.log(`[alternate-paths ${trainNumber}] ${msg}`);
    };

    if (!trainNumber || !from || !to || !dateDdMmYyyy) {
      throw new Error('trainNumber, from, to, and valid date are required');
    }

    const fromTrain = normalizeAndDedupeClassCodes(input.avlClasses ?? []);
    const classes =
      fromTrain.length > 0 ? fromTrain : [...BOOKING_V2_ALTERNATE_PATH_CLASSES];

    logStep(
      `Start: ${from} → ${to} | journeyDate=${input.date} (DD-MM-YYYY ${dateDdMmYyyy}) | probeClasses=${classes.join(',')} (${fromTrain.length ? 'from train avlClasses' : 'fallback list'}) quota=${quota}`,
    );

    const stationNameMap: Record<string, string> = {};

    const sched = await this.irctc.getTrainSchedule(trainNumber);
    if (!sched.ok || !sched.schedule?.stationList?.length) {
      logStep(
        `IRCTC schedule: FAILED or empty (ok=${sched.ok}) — cannot list intermediate stops`,
      );
      emit({ type: 'schedule_fail' });
      return {
        trainNumber,
        legs: [],
        totalFare: null,
        legCount: 0,
        isComplete: false,
        stationCodesOnRoute: [],
        stationNameMap,
        trainOriginCode: null,
        trainOriginDepartureTime: null,
        remainderMergedSchedule: null,
        debugLog,
      };
    }

    logStep(
      `IRCTC schedule: OK — ${sched.schedule.stationList.length} stops on full route (${sched.schedule.trainName ?? 'train'})`,
    );
    emit({
      type: 'schedule_ok',
      trainName: sched.schedule.trainName ?? null,
      stopCount: sched.schedule.stationList.length,
    });

    const stationList = sched.schedule.stationList;

    // Build a code→name lookup from the full schedule (upper-cased keys).
    for (const st of stationList) {
      const code = String(st.stationCode ?? '')
        .trim()
        .toUpperCase();
      const name = String(st.stationName ?? '').trim();
      if (code && name) stationNameMap[code] = name;
    }
    const stations = stationCodesBetweenStops(stationList, from, to);
    if (!stations?.length) {
      logStep(
        `Route slice: FAILED — "${from}" or "${to}" not found in order on this train (or same station)`,
      );
      emit({ type: 'route_fail', from, to });
      return {
        trainNumber,
        legs: [],
        totalFare: null,
        legCount: 0,
        isComplete: false,
        stationCodesOnRoute: [],
        stationNameMap,
        trainOriginCode: null,
        trainOriginDepartureTime: null,
        remainderMergedSchedule: null,
        debugLog,
      };
    }

    logStep(
      `Route slice: ${stations.length} stops from boarding to destination: ${stations.join(' → ')}`,
    );
    emit({ type: 'route_ok', from, to, stopCount: stations.length });

    const legTim = (fromSt: string, toSt: string) =>
      legScheduleTiming(stationList, fromSt, toSt);

    const legs: AlternatePathLeg[] = [];
    let currentIdx = 0;
    const targetIdx = stations.length - 1;
    let hop = 0;
    const probeCache = new Map<string, MultiClassProbeResult>();
    const maxIterations = Math.max(8, stations.length * 4);
    let iterations = 0;

    const startStopLine = stationList.find(
      (s) => normalizeScheduleStationCode(s.stationCode) === stations[0],
    );
    const startDayCount = parseScheduleDayCount(startStopLine?.dayCount) ?? 1;

    const cacheKey = (a: string, b: string, d: string) => `${a}|${b}|${d}`;

    while (currentIdx < targetIdx && iterations < maxIterations) {
      iterations += 1;
      hop += 1;
      const destOrder = orderedDestinationIndices(currentIdx, targetIdx);
      const waveLabels = destOrder.map(
        (i) => `${stations[currentIdx]}→${stations[i]}`,
      );
      logStep(
        `Hop ${hop}: at ${stations[currentIdx]} — parallel fetch (${destOrder.length} ODs × ${classes.length} classes), manual priority: ${waveLabels.join(' > ')}; first confirmed in this order wins`,
      );

      const probes: MultiClassProbeResult[] = await Promise.all(
        destOrder.map(async (destIdx) => {
          const fromStn = stations[currentIdx];
          const fromStopLine = stationList.find(
            (s) => normalizeScheduleStationCode(s.stationCode) === fromStn,
          );
          const fromDayCount =
            parseScheduleDayCount(fromStopLine?.dayCount) ?? startDayCount;
          const dayOffset = Math.max(0, fromDayCount - startDayCount);
          const currentHopDate = moment(input.date, 'YYYY-MM-DD')
            .add(dayOffset, 'days')
            .format('DD-MM-YYYY');

          const toStn = stations[destIdx];
          const key = cacheKey(fromStn, toStn, currentHopDate);
          let probe = probeCache.get(key);
          if (!probe) {
            probe = await this.probeSegmentAllClasses(
              trainNumber,
              fromStn,
              toStn,
              currentHopDate,
              classes,
              quota,
            );
            probeCache.set(key, probe);
          }
          return probe;
        }),
      );

      let chosenDestIdx: number | null = null;
      let chosenProbe: MultiClassProbeResult | null = null;
      for (let w = 0; w < destOrder.length; w++) {
        const destIdx = destOrder[w];
        const fromStn = stations[currentIdx];
        const toStn = stations[destIdx];
        const probe = probes[w];
        logStep(this.formatMultiClassProbeLine(fromStn, toStn, probe, classes));
        if (probe.bestConfirmedClassIndex != null) {
          chosenDestIdx = destIdx;
          chosenProbe = probe;
          break;
        }
      }

      if (
        chosenDestIdx != null &&
        chosenProbe != null &&
        chosenProbe.bestConfirmedClassIndex != null
      ) {
        const bc = chosenProbe.bestConfirmedClassIndex;
        const picked = chosenProbe.perClass[bc];
        const day = picked.day;
        logStep(
          `Hop ${hop}: CHOSEN ${stations[currentIdx]} → ${stations[chosenDestIdx]} | class=${classes[bc]}${picked.fare != null ? ` fare ₹${picked.fare}` : ''}`,
        );
        emit({
          type: 'hop_confirmed',
          from: stations[currentIdx],
          to: stations[chosenDestIdx],
          travelClass: classes[bc],
          fare: picked.fare,
          hopIndex: hop,
        });
        legs.push({
          from: stations[currentIdx],
          to: stations[chosenDestIdx],
          segmentKind: 'confirmed',
          travelClass: classes[bc],
          railDataStatus: day ? String(day.vendorPredictionStatus ?? '') : null,
          availablityStatus: day ? String(day.availablityStatus ?? '') : null,
          predictionPercentage: day
            ? String(day.predictionPercentage ?? '')
            : null,
          availabilityDisplayName: day
            ? String(day.availabilityDisplayName ?? '')
            : null,
          fare: picked.fare,
          confirmedClassOptions: this.buildConfirmedClassOptions(
            chosenProbe.perClass,
            classes,
          ),
          ...legTim(stations[currentIdx], stations[chosenDestIdx]),
        });
        currentIdx = chosenDestIdx;
        continue;
      }

      const nextIdx = currentIdx + 1;
      if (nextIdx > targetIdx) {
        logStep(`Hop ${hop}: cannot advance past ${stations[targetIdx]}`);
        break;
      }

      const fromStn = stations[currentIdx];
      const fromStopLine = stationList.find(
        (s) => normalizeScheduleStationCode(s.stationCode) === fromStn,
      );
      const fromDayCount =
        parseScheduleDayCount(fromStopLine?.dayCount) ?? startDayCount;
      const dayOffset = Math.max(0, fromDayCount - startDayCount);
      const bridgeDate = moment(input.date, 'YYYY-MM-DD')
        .add(dayOffset, 'days')
        .format('DD-MM-YYYY');

      const toStn = stations[nextIdx];
      const key = cacheKey(fromStn, toStn, bridgeDate);
      let bridge = probeCache.get(key);
      if (!bridge) {
        bridge = await this.probeSegmentAllClasses(
          trainNumber,
          fromStn,
          toStn,
          bridgeDate,
          classes,
          quota,
        );
        probeCache.set(key, bridge);
      }
      logStep(
        `Hop ${hop}: no confirmed segment in destination order — bridge ${fromStn} → ${toStn} (check realtime)`,
      );
      logStep(this.formatMultiClassProbeLine(fromStn, toStn, bridge, classes));
      emit({
        type: 'hop_unavailable',
        from: fromStn,
        to: toStn,
        hopIndex: hop,
      });

      if (bridge.bestConfirmedClassIndex != null) {
        const bc: number = bridge.bestConfirmedClassIndex;
        const picked = bridge.perClass[bc];
        const day = picked.day;
        logStep(
          `Hop ${hop}: bridge segment is confirmed in ${classes[bc]}${picked.fare != null ? ` fare ₹${picked.fare}` : ''}`,
        );
        emit({
          type: 'hop_confirmed',
          from: fromStn,
          to: toStn,
          travelClass: classes[bc],
          fare: picked.fare,
          hopIndex: hop,
        });
        legs.push({
          from: fromStn,
          to: toStn,
          segmentKind: 'confirmed',
          travelClass: classes[bc],
          railDataStatus: day ? String(day.vendorPredictionStatus ?? '') : null,
          availablityStatus: day ? String(day.availablityStatus ?? '') : null,
          predictionPercentage: day
            ? String(day.predictionPercentage ?? '')
            : null,
          availabilityDisplayName: day
            ? String(day.availabilityDisplayName ?? '')
            : null,
          fare: picked.fare,
          confirmedClassOptions: this.buildConfirmedClassOptions(
            bridge.perClass,
            classes,
          ),
          ...legTim(fromStn, toStn),
        });
      } else {
        const disp = bridge.displayRow;
        legs.push({
          from: fromStn,
          to: toStn,
          segmentKind: 'check_realtime',
          travelClass: null,
          railDataStatus: disp
            ? String(disp.vendorPredictionStatus ?? '')
            : null,
          availablityStatus: disp ? String(disp.availablityStatus ?? '') : null,
          predictionPercentage: disp
            ? String(disp.predictionPercentage ?? '')
            : null,
          availabilityDisplayName: disp
            ? String(disp.availabilityDisplayName ?? '')
            : null,
          fare: null,
          confirmedClassOptions: [],
          ...legTim(fromStn, toStn),
        });
      }
      currentIdx = nextIdx;
    }

    const confirmedLegs = legs.filter((l) => l.segmentKind === 'confirmed');
    const totalFare =
      confirmedLegs.length > 0 &&
      confirmedLegs.every((l) => typeof l.fare === 'number')
        ? confirmedLegs.reduce((s, l) => s + (l.fare ?? 0), 0)
        : null;

    const hasRealtime = legs.some((l) => l.segmentKind === 'check_realtime');
    const isComplete =
      !hasRealtime &&
      legs.length > 0 &&
      legs[legs.length - 1].to === stations[targetIdx];

    if (currentIdx < targetIdx) {
      logStep(
        `Stopped before final stop ${stations[targetIdx]} (still at ${stations[currentIdx]} after ${iterations} iteration(s))`,
      );
    }

    logStep(
      `Done: isComplete=${isComplete} legs=${legs.length}${totalFare != null ? ` totalFare=₹${totalFare}` : ''}`,
    );
    emit({ type: 'done', isComplete, legCount: legs.length, totalFare });

    const journeyDest = stations[targetIdx] ?? to;
    const remainderEp = collapsibleRealtimeRemainderEndpoints(
      legs,
      journeyDest,
    );
    const remainderMergedSchedule: AlternatePathRemainderMergedSchedule | null =
      remainderEp != null
        ? {
            from: remainderEp.from,
            to: remainderEp.to,
            ...legScheduleTiming(stationList, remainderEp.from, remainderEp.to),
          }
        : null;

    return {
      trainNumber,
      legs,
      totalFare,
      legCount: legs.length,
      isComplete,
      stationCodesOnRoute: stations,
      stationNameMap,
      remainderMergedSchedule,
      trainOriginCode: stationList[0]?.stationCode?.trim().toUpperCase() || null,
      trainOriginDepartureTime: stationList[0]?.departureTime ?? null,
      debugLog,
      trainStartDate: moment(input.date, 'YYYY-MM-DD')
        .subtract(startDayCount - 1, 'days')
        .format('YYYY-MM-DD'),
    };
  }

  /** One-line per segment: each probed class with the availability snapshot used. */
  private formatMultiClassProbeLine(
    fromStn: string,
    toStn: string,
    probe: MultiClassProbeResult,
    classCodes: readonly string[],
  ): string {
    const parts = classCodes.map((code, i) => {
      const p = probe.perClass[i];
      const label = p ? this.formatPerClassAvailabilityLabel(p) : 'missing';
      return `${code} (${label})`;
    });
    const best = probe.bestConfirmedClassIndex;
    const bestStr =
      best != null && classCodes[best]
        ? ` | picked ${classCodes[best]}`
        : ' | no confirmed class';
    return `  ${fromStn} → ${toStn} — ${parts.join(', ')}${bestStr}`;
  }

  /** Human-readable label from one fetchAvailability row (debug / UI). */
  private formatPerClassAvailabilityLabel(row: SegmentProbeRow): string {
    if (row.fetchError) {
      const m = row.fetchError.trim();
      return m.length > 28 ? `${m.slice(0, 25)}…` : m;
    }
    if (!row.day) {
      return 'no row';
    }
    const day = row.day;
    const disp = String(day.availabilityDisplayName ?? '').trim();
    const st = String(day.availablityStatus ?? '').trim();
    const ct = String(day.vendorPredictionStatus ?? '').trim();
    const at = parseUpstreamAvailablityType(day.availablityType);

    if (at === 3) {
      return disp ? `Waiting (${this.shortenDebugLabel(disp, 20)})` : 'Waiting';
    }
    if (at === 1) {
      return disp ? this.shortenDebugLabel(disp, 24) : 'Available';
    }

    if (isLegConfirmed(day)) {
      if (disp) return this.shortenDebugLabel(disp, 24);
      if (st.toUpperCase().startsWith('AVAILABLE')) {
        const tail = st
          .replace(/^AVAILABLE/i, '')
          .replace(/^[-#]/, '')
          .slice(0, 14);
        return tail ? `Avail ${tail}` : 'Available';
      }
      return ct ? this.shortenDebugLabel(ct, 24) : 'Confirmed';
    }

    const du = disp.toUpperCase();
    const su = st.toUpperCase();
    if (du.includes('WL') || du.includes('WAITLIST') || su.includes('WL')) {
      const num =
        disp.match(/WL\D*(\d+)/i)?.[1] ??
        st.match(/WL\D*(\d+)/i)?.[1] ??
        disp.match(/(\d+)/)?.[1];
      return num ? `WL-${num}` : 'WL';
    }
    if (du.includes('RAC') || su.includes('RAC')) {
      return disp ? this.shortenDebugLabel(disp, 24) : 'RAC';
    }
    if (du.includes('REGRET') || su.includes('REGRET')) {
      return 'Regret';
    }
    if (disp) return this.shortenDebugLabel(disp, 24);
    if (ct) return this.shortenDebugLabel(ct, 24);
    if (st) return this.shortenDebugLabel(st, 24);
    return '?';
  }

  private shortenDebugLabel(s: string, max: number): string {
    const t = s.trim();
    if (t.length <= max) return t;
    return `${t.slice(0, Math.max(1, max - 1))}…`;
  }

  /** Build all confirmed class options sorted cheapest-first. */
  private buildConfirmedClassOptions(
    perClass: SegmentProbeRow[],
    classCodes: readonly string[],
  ): AlternatePathClassOption[] {
    const options: Array<AlternatePathClassOption & { fareN: number }> = [];
    for (let i = 0; i < perClass.length; i++) {
      const row = perClass[i];
      if (!row || !isLegConfirmed(row.day)) continue;
      const day = row.day;
      const fareN =
        typeof row.fare === 'number' && !Number.isNaN(row.fare)
          ? row.fare
          : Number.POSITIVE_INFINITY;
      options.push({
        travelClass: classCodes[i] ?? '',
        railDataStatus: day ? String(day.vendorPredictionStatus ?? '') : null,
        availablityStatus: day ? String(day.availablityStatus ?? '') : null,
        predictionPercentage: day
          ? String(day.predictionPercentage ?? '')
          : null,
        availabilityDisplayName: day
          ? String(day.availabilityDisplayName ?? '')
          : null,
        fare: row.fare,
        fareN,
      });
    }
    options.sort(
      (a, b) => a.fareN - b.fareN || a.travelClass.localeCompare(b.travelClass),
    );
    return options.map(({ fareN: _fareN, ...rest }) => rest);
  }

  private pickBestConfirmedClassIndex(
    perClass: SegmentProbeRow[],
  ): number | null {
    let best: { i: number; fare: number } | null = null;
    for (let i = 0; i < perClass.length; i++) {
      const row = perClass[i]?.day;
      if (!isLegConfirmed(row)) continue;
      const fare = perClass[i]?.fare;
      const fareN =
        typeof fare === 'number' && !Number.isNaN(fare)
          ? fare
          : Number.POSITIVE_INFINITY;
      if (
        best == null ||
        fareN < best.fare ||
        (fareN === best.fare && i < best.i)
      ) {
        best = { i, fare: fareN };
      }
    }
    return best?.i ?? null;
  }

  private async probeSegmentAllClasses(
    trainNo: string,
    fromStn: string,
    toStn: string,
    dateDdMmYyyy: string,
    classCodes: readonly string[],
    quota: string,
  ): Promise<MultiClassProbeResult> {
    const perClass = await Promise.all(
      classCodes.map((c) =>
        this.fetchSegmentAvailability(
          trainNo,
          fromStn,
          toStn,
          dateDdMmYyyy,
          c,
          quota,
        ),
      ),
    );
    const bestConfirmedClassIndex = this.pickBestConfirmedClassIndex(perClass);
    const displayRow = perClass.find((p) => p.day)?.day ?? null;
    return { perClass, bestConfirmedClassIndex, displayRow };
  }

  private async fetchSegmentAvailability(
    trainNo: string,
    fromStn: string,
    toStn: string,
    dateDdMmYyyy: string,
    travelClass: string,
    quota: string,
  ): Promise<{
    day: AvlDayRow | null;
    fare: number | null;
    fetchError?: string;
  }> {
    try {
      const raw = await this.checkAvailability(
        trainNo,
        fromStn,
        toStn,
        dateDdMmYyyy,
        travelClass,
        quota,
      );
      const day = this.extractAvlDay(raw, dateDdMmYyyy);
      const fare = this.extractFare(raw);
      return { day, fare };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[booking-v2] availability segment failed ${trainNo} ${fromStn}-${toStn}: ${msg}`,
      );
      return { day: null, fare: null, fetchError: msg };
    }
  }

  private extractAvlDay(raw: unknown, dateDdMmYyyy: string): AvlDayRow | null {
    if (!raw || typeof raw !== 'object') return null;
    const data = (raw as Record<string, unknown>).data;
    if (!data || typeof data !== 'object') return null;
    const list = (data as Record<string, unknown>).avlDayList;
    if (!Array.isArray(list)) return null;
    for (const row of list) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const ad = r.availablityDate;
      if (
        typeof ad === 'string' &&
        avlDayMatchesJourneyDate(ad, dateDdMmYyyy)
      ) {
        return this.normalizeAvlDayRow(r);
      }
    }
    const first = list[0] as unknown;
    if (first && typeof first === 'object')
      return this.normalizeAvlDayRow(first as Record<string, unknown>);
    return null;
  }

  private extractFare(raw: unknown): number | null {
    if (!raw || typeof raw !== 'object') return null;
    const data = (raw as Record<string, unknown>).data;
    if (!data || typeof data !== 'object') return null;
    const fi = (data as Record<string, unknown>).fareInfo;
    if (!fi || typeof fi !== 'object') return null;
    const tf = (fi as Record<string, unknown>).totalFare;
    if (typeof tf === 'number' && !Number.isNaN(tf)) return tf;
    if (typeof tf === 'string') {
      const n = parseFloat(tf);
      return Number.isNaN(n) ? null : n;
    }
    return null;
  }
}
