import { Injectable, Logger } from '@nestjs/common';
import { IrctcService } from '../irctc/irctc.service';
import type { ScheduleStation } from '../irctc/irctc.service';
import {
  BOOKING_V2_CONFIRMTKT_BASE,
  BOOKING_V2_CONFIRMTKT_HEADERS,
} from './booking-v2.constants';
import {
  avlDayMatchesJourneyDate,
  isLegConfirmed,
  pickFarthestConfirmedStationIndex,
  stationCodesBetweenStops,
  ymdToConfirmTktDate,
} from './booking-v2.utils';

export type AlternatePathLeg = {
  from: string;
  to: string;
  confirmTktStatus: string | null;
  availablityStatus: string | null;
  predictionPercentage: string | null;
  availabilityDisplayName: string | null;
  fare: number | null;
};

export type FindAlternatePathsResult = {
  trainNumber: string;
  legs: AlternatePathLeg[];
  totalFare: number | null;
  legCount: number;
  isComplete: boolean;
  stationCodesOnRoute: string[];
  /** Step-by-step trace for debugging (also logged with Logger). */
  debugLog: string[];
};

type AvlDayRow = {
  availablityStatus?: string | null;
  confirmTktStatus?: string | null;
  predictionPercentage?: string | null;
  availabilityDisplayName?: string | null;
};

@Injectable()
export class BookingV2Service {
  private readonly logger = new Logger(BookingV2Service.name);

  constructor(private readonly irctc: IrctcService) {}

  /** `YYYY-MM-DD` or passthrough if already `DD-MM-YYYY`. */
  normalizeToConfirmTktDate(dateInput: string): string | null {
    const t = String(dateInput).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return ymdToConfirmTktDate(t);
    if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(t)) {
      const m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
      if (!m) return null;
      const d = m[1].padStart(2, '0');
      const mo = m[2].padStart(2, '0');
      return `${d}-${mo}-${m[3]}`;
    }
    return null;
  }

  async searchStations(searchString: string): Promise<unknown> {
    const q = String(searchString ?? '').trim();
    const params = new URLSearchParams({
      searchString: q,
      sourceStnCode: '',
      popularStnListLimit: '15',
      preferredStnListLimit: '6',
      channel: 'mweb',
      language: 'EN',
    });
    const url = `${BOOKING_V2_CONFIRMTKT_BASE.stationsSuggest}?${params}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: BOOKING_V2_CONFIRMTKT_HEADERS,
    });
    const text = await res.text();
    if (!res.ok) {
      this.logger.warn(
        `[booking-v2/stations] upstream ${res.status} q=${q.slice(0, 40)} body=${text.slice(0, 300)}`,
      );
      throw new Error(`ConfirmTkt stations failed: ${res.status}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new Error('ConfirmTkt stations: invalid JSON');
    }
    return this.mergeStationSuggestResponse(parsed);
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
          const code = String(r.stationCode ?? '').trim();
          const name = String(r.stationName ?? '').trim();
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
    const c = Array.isArray(d.preferredStationList) ? d.preferredStationList : [];
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
    const dateDdMmYyyy = this.normalizeToConfirmTktDate(dateInput);
    if (!dateDdMmYyyy) throw new Error('Invalid journey date');
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
    const url = `${BOOKING_V2_CONFIRMTKT_BASE.trainsSearch}?${params}`;
    const res = await fetch(url, { headers: BOOKING_V2_CONFIRMTKT_HEADERS });
    const text = await res.text();
    if (!res.ok) {
      this.logger.warn(
        `[booking-v2/trains/search] upstream ${res.status} body=${text.slice(0, 200)}`,
      );
      throw new Error(`ConfirmTkt train search failed: ${res.status}`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error('ConfirmTkt train search: invalid JSON');
    }
  }

  async checkAvailability(
    trainNo: string,
    from: string,
    to: string,
    dateInput: string,
    travelClass: string,
    quota: string,
  ): Promise<unknown> {
    const dateDdMmYyyy = this.normalizeToConfirmTktDate(dateInput);
    if (!dateDdMmYyyy) throw new Error('Invalid journey date');
    const params = new URLSearchParams({
      trainNo: String(trainNo).trim(),
      sourceStationCode: from.trim().toUpperCase(),
      destinationStationCode: to.trim().toUpperCase(),
      dateOfJourney: dateDdMmYyyy,
      quota: quota.trim().toUpperCase() || 'GN',
      travelClass: travelClass.trim().toUpperCase() || 'SL',
    });
    const url = `${BOOKING_V2_CONFIRMTKT_BASE.fetchAvailability}?${params}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: BOOKING_V2_CONFIRMTKT_HEADERS,
      body: '',
    });
    const text = await res.text();
    if (!res.ok) {
      this.logger.warn(
        `[booking-v2/availability] upstream ${res.status} train=${trainNo} ${from}-${to} body=${text.slice(0, 200)}`,
      );
      throw new Error(`ConfirmTkt availability failed: ${res.status}`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error('ConfirmTkt availability: invalid JSON');
    }
  }

  async findAlternatePaths(input: {
    trainNumber: string;
    from: string;
    to: string;
    date: string;
    travelClass?: string;
    quota?: string;
  }): Promise<FindAlternatePathsResult> {
    const trainNumber = String(input.trainNumber).trim();
    const from = String(input.from).trim().toUpperCase();
    const to = String(input.to).trim().toUpperCase();
    const travelClass = String(input.travelClass ?? 'SL')
      .trim()
      .toUpperCase();
    const quota = String(input.quota ?? 'GN').trim().toUpperCase();
    const dateDdMmYyyy = this.normalizeToConfirmTktDate(input.date);
    const debugLog: string[] = [];
    const logStep = (msg: string) => {
      debugLog.push(msg);
      this.logger.log(`[alternate-paths ${trainNumber}] ${msg}`);
    };

    if (!trainNumber || !from || !to || !dateDdMmYyyy) {
      throw new Error('trainNumber, from, to, and valid date are required');
    }

    logStep(
      `Start: ${from} → ${to} | journeyDate=${input.date} (ConfirmTkt ${dateDdMmYyyy}) | class=${travelClass} quota=${quota}`,
    );

    const sched = await this.irctc.getTrainSchedule(trainNumber);
    if (!sched.ok || !sched.schedule?.stationList?.length) {
      logStep(
        `IRCTC schedule: FAILED or empty (ok=${sched.ok}) — cannot list intermediate stops`,
      );
      return {
        trainNumber,
        legs: [],
        totalFare: null,
        legCount: 0,
        isComplete: false,
        stationCodesOnRoute: [],
        debugLog,
      };
    }

    logStep(
      `IRCTC schedule: OK — ${sched.schedule.stationList.length} stops on full route (${sched.schedule.trainName ?? 'train'})`,
    );

    const stationList = sched.schedule.stationList as ScheduleStation[];
    const stations = stationCodesBetweenStops(stationList, from, to);
    if (!stations?.length) {
      logStep(
        `Route slice: FAILED — "${from}" or "${to}" not found in order on this train (or same station)`,
      );
      return {
        trainNumber,
        legs: [],
        totalFare: null,
        legCount: 0,
        isComplete: false,
        stationCodesOnRoute: [],
        debugLog,
      };
    }

    logStep(
      `Route slice: ${stations.length} stops from boarding to destination: ${stations.join(' → ')}`,
    );

    const legs: AlternatePathLeg[] = [];
    let currentIdx = 0;
    const targetIdx = stations.length - 1;
    let hop = 0;

    while (currentIdx < targetIdx) {
      hop += 1;
      const candidateIndices: number[] = [];
      for (let j = currentIdx + 1; j <= targetIdx; j++) {
        candidateIndices.push(j);
      }

      const destCodes = candidateIndices.map((i) => stations[i]);
      logStep(
        `Hop ${hop}: boarding ${stations[currentIdx]} — checking ConfirmTkt availability to: ${destCodes.join(', ')} (${candidateIndices.length} parallel calls)`,
      );

      const segmentResults = await Promise.all(
        candidateIndices.map((destIdx) =>
          this.fetchSegmentAvailability(
            trainNumber,
            stations[currentIdx],
            stations[destIdx],
            dateDdMmYyyy,
            travelClass,
            quota,
          ),
        ),
      );

      for (let i = 0; i < segmentResults.length; i++) {
        const destIdx = candidateIndices[i];
        const seg = segmentResults[i];
        logStep(
          this.formatSegmentProbeLine(
            stations[currentIdx],
            stations[destIdx],
            seg,
          ),
        );
      }

      const days = segmentResults.map((s) => s.day);
      const nextIdx = pickFarthestConfirmedStationIndex(
        days,
        candidateIndices,
      );

      if (nextIdx == null) {
        logStep(
          `Hop ${hop}: no segment from ${stations[currentIdx]} satisfied Confirm/Probable/AVAILABLE* — marking failure to ${stations[targetIdx]}`,
        );
        legs.push({
          from: stations[currentIdx],
          to: stations[targetIdx],
          confirmTktStatus: 'NO_CONFIRMED_PATH',
          availablityStatus: null,
          predictionPercentage: null,
          availabilityDisplayName: null,
          fare: null,
        });
        break;
      }

      const pickedK = candidateIndices.indexOf(nextIdx);
      const day = segmentResults[pickedK]?.day ?? null;
      const fare = segmentResults[pickedK]?.fare ?? null;

      logStep(
        `Hop ${hop}: CHOSEN farthest usable segment ${stations[currentIdx]} → ${stations[nextIdx]} (ticket availability OK for greedy step)${fare != null ? ` | fare ₹${fare}` : ''}`,
      );

      legs.push({
        from: stations[currentIdx],
        to: stations[nextIdx],
        confirmTktStatus: day ? String(day.confirmTktStatus ?? '') : null,
        availablityStatus: day ? String(day.availablityStatus ?? '') : null,
        predictionPercentage: day
          ? String(day.predictionPercentage ?? '')
          : null,
        availabilityDisplayName: day
          ? String(day.availabilityDisplayName ?? '')
          : null,
        fare,
      });

      currentIdx = nextIdx;
    }

    const confirmedLegs = legs.filter(
      (l) => l.confirmTktStatus !== 'NO_CONFIRMED_PATH',
    );
    const totalFare =
      confirmedLegs.length > 0 &&
      confirmedLegs.every((l) => typeof l.fare === 'number')
        ? confirmedLegs.reduce((s, l) => s + (l.fare ?? 0), 0)
        : null;

    const hasFailure = legs.some(
      (l) => l.confirmTktStatus === 'NO_CONFIRMED_PATH',
    );
    const isComplete =
      !hasFailure &&
      legs.length > 0 &&
      legs[legs.length - 1].to === stations[targetIdx];

    logStep(
      `Done: isComplete=${isComplete} legs=${legs.length}${totalFare != null ? ` totalFare=₹${totalFare}` : ''}`,
    );

    return {
      trainNumber,
      legs,
      totalFare,
      legCount: legs.length,
      isComplete,
      stationCodesOnRoute: stations,
      debugLog,
    };
  }

  private formatSegmentProbeLine(
    fromStn: string,
    toStn: string,
    seg: {
      day: AvlDayRow | null;
      fare: number | null;
      fetchError?: string;
    },
  ): string {
    if (seg.fetchError) {
      return `  ${fromStn} → ${toStn}: FETCH ERROR — ${seg.fetchError}`;
    }
    if (!seg.day) {
      return `  ${fromStn} → ${toStn}: no avl row for journey date (or empty avlDayList)`;
    }
    const ok = isLegConfirmed(seg.day);
    const disp = String(
      seg.day.availabilityDisplayName ?? seg.day.availablityStatus ?? '?',
    ).trim();
    const ct = String(seg.day.confirmTktStatus ?? '?').trim();
    const pred = seg.day.predictionPercentage
      ? ` prediction=${seg.day.predictionPercentage}%`
      : '';
    const fareStr = seg.fare != null ? ` fare=₹${seg.fare}` : '';
    const verdict = ok
      ? 'ticket availability USABLE (Confirm / Probable / AVAILABLE*)'
      : 'not usable as confirmed leg';
    return `  ${fromStn} → ${toStn}: ${verdict} | ${disp} | ConfirmTkt status=${ct}${pred}${fareStr}`;
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

  private extractAvlDay(
    raw: unknown,
    dateDdMmYyyy: string,
  ): AvlDayRow | null {
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
        return r as AvlDayRow;
      }
    }
    const first = list[0];
    if (first && typeof first === 'object') return first as AvlDayRow;
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
