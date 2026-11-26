import { Injectable, Logger } from '@nestjs/common';
import moment from 'moment';
import {
  BookingV2Service,
  type BookingV2TrainSearchRow,
} from './booking-v2.service';
import { ConnectingRouteGraphService } from './connecting-route-graph.service';
import { isLegConfirmed, type AvlDayLike } from './booking-v2.utils';
import type {
  ConnectingJourneyDto,
  ConnectingJourneyLegDto,
  ConnectingLegClassOption,
  ConnectingTrainsResponseDto,
} from './connecting-trains.types';

const DEFAULT_MIN_LAYOVER_MINUTES = 30;
const DEFAULT_MAX_LAYOVER_MINUTES = 360; // 6 hours
const MAX_DYNAMIC_HUBS = 2;
const MAX_LEG2_DATES_PER_HUB = 3;
const CONFIRMED_TEXT_RE = /^AVL|^AVAIL|^CURR_AV|^CURRENT AV|^CNF/i;

type DatedTrainRow = BookingV2TrainSearchRow & { queryBoardingDate: string };

interface MatchedClassCandidate {
  travelClass: string;
  totalFare: number;
  isFullyConfirmed: boolean;
  leg1Fare: number;
  leg1Status: string;
  leg1RawStatus: string | null;
  leg1Confirmed: boolean;
  leg1Options: ConnectingLegClassOption[];
  leg2Fare: number;
  leg2Status: string;
  leg2RawStatus: string | null;
  leg2Confirmed: boolean;
  leg2Options: ConnectingLegClassOption[];
}

function toSafeString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

function checkRowConfirmed(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  if (isLegConfirmed(r as AvlDayLike)) return true;
  const disp = toSafeString(
    r.availabilityDisplayName || r.railDataStatus,
  ).trim();
  const lastSeg = disp.split('/').pop()?.trim() ?? '';
  return CONFIRMED_TEXT_RE.test(lastSeg);
}

function parseFare(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return Math.round(val);
  if (typeof val === 'string') {
    const parsed = parseInt(val.replace(/[^\d]/g, ''), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseClock(
  timeStr?: string | null,
): { minutes: number; hhmm: string } | null {
  if (!timeStr?.trim()) return null;
  const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return {
    minutes: h * 60 + min,
    hhmm: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
  };
}

function parseIstMoment(dateYmd: string, hhmm: string): moment.Moment {
  return moment(`${dateYmd}T${hhmm}:00+05:30`, 'YYYY-MM-DDTHH:mm:ssZ');
}

function toLegClassOptions(
  classes: readonly string[],
  cache: Record<string, Record<string, unknown>>,
): ConnectingLegClassOption[] {
  return classes.map((cls) => {
    const row = cache[cls];
    const fare = parseFare(row?.fare);
    return {
      travelClass: cls,
      fare: fare > 0 ? fare : null,
      availabilityDisplayName:
        toSafeString(row?.availabilityDisplayName || row?.railDataStatus) ||
        'Check Status',
      isConfirmed: checkRowConfirmed(row),
    };
  });
}

@Injectable()
export class ConnectingTrainsService {
  private readonly logger = new Logger(ConnectingTrainsService.name);

  constructor(
    private readonly bookingV2: BookingV2Service,
    private readonly routeGraph: ConnectingRouteGraphService,
  ) {}

  getStationName(code: string): string {
    return this.routeGraph.getStationName(code);
  }

  async searchConnectingTrains(params: {
    from: string;
    to: string;
    date: string; // YYYY-MM-DD or DD-MM-YYYY
    minLayoverMinutes?: number;
    maxLayoverMinutes?: number;
    classes?: string[];
    signal?: AbortSignal;
  }): Promise<ConnectingTrainsResponseDto> {
    const { from, to, date, signal } = params;
    const fromCode = from.trim().toUpperCase();
    const toCode = to.trim().toUpperCase();

    const normalizedDate = this.bookingV2.normalizeToRailApiDate(date);
    if (!normalizedDate) {
      throw new Error(
        'Invalid journey date format (expected YYYY-MM-DD or DD-MM-YYYY)',
      );
    }
    const [dd, mm, yyyy] = normalizedDate.split('-');
    const journeyDateYmd = `${yyyy}-${mm}-${dd}`;

    await this.routeGraph.ensureLoaded();
    const hubs = this.routeGraph.findIntermediateHubs(
      fromCode,
      toCode,
      MAX_DYNAMIC_HUBS,
    );

    if (hubs.length === 0) {
      return {
        from: fromCode,
        to: toCode,
        date: journeyDateYmd,
        isSupportedCorridor: false,
        totalFound: 0,
        confirmedCount: 0,
        journeys: [],
      };
    }

    const minLayover =
      typeof params.minLayoverMinutes === 'number' &&
      params.minLayoverMinutes >= 15
        ? params.minLayoverMinutes
        : DEFAULT_MIN_LAYOVER_MINUTES;
    const maxLayover =
      typeof params.maxLayoverMinutes === 'number' &&
      params.maxLayoverMinutes > minLayover
        ? params.maxLayoverMinutes
        : DEFAULT_MAX_LAYOVER_MINUTES;

    const allJourneys: ConnectingJourneyDto[] = [];

    await Promise.allSettled(
      hubs.map(async (hub) => {
        const hubJourneys = await this.searchViaHub({
          from: fromCode,
          to: toCode,
          hub: hub.code,
          journeyDateYmd,
          minLayover,
          maxLayover,
          classes: params.classes,
          signal,
        });
        allJourneys.push(...hubJourneys);
      }),
    );

    const uniqueJourneys = this.deduplicateJourneys(allJourneys);
    uniqueJourneys.sort((a, b) => {
      if (a.isFullyConfirmed !== b.isFullyConfirmed) {
        return a.isFullyConfirmed ? -1 : 1;
      }
      if (a.totalDurationMinutes !== b.totalDurationMinutes) {
        return a.totalDurationMinutes - b.totalDurationMinutes;
      }
      return a.layoverMinutes - b.layoverMinutes;
    });

    const confirmedCount = uniqueJourneys.filter(
      (j) => j.isFullyConfirmed,
    ).length;

    return {
      from: fromCode,
      to: toCode,
      date: journeyDateYmd,
      isSupportedCorridor: true,
      totalFound: uniqueJourneys.length,
      confirmedCount,
      journeys: uniqueJourneys.slice(0, 30),
    };
  }

  private async searchViaHub(params: {
    from: string;
    to: string;
    hub: string;
    journeyDateYmd: string;
    minLayover: number;
    maxLayover: number;
    classes?: string[];
    signal?: AbortSignal;
  }): Promise<ConnectingJourneyDto[]> {
    const {
      from,
      to,
      hub,
      journeyDateYmd,
      minLayover,
      maxLayover,
      classes,
      signal,
    } = params;

    try {
      const leg1Res = await this.bookingV2
        .searchTrains(from, hub, journeyDateYmd, classes, signal)
        .catch((err) => {
          this.logger.warn(
            `Leg 1 search failed ${from}->${hub}: ${err instanceof Error ? err.message : String(err)}`,
          );
          return null;
        });

      const leg1Trains = this.extractTrainList(leg1Res);
      if (leg1Trains.length === 0) return [];

      // Compute exact Leg 2 boarding dates required by Leg 1 arrival times + layover window
      const leg1Evaluated: Array<{
        train: BookingV2TrainSearchRow;
        depTime: string;
        arrTime: string;
        durMinutes: number;
        arrMoment: moment.Moment;
      }> = [];
      const neededDates = new Set<string>();

      for (const t1 of leg1Trains) {
        const dep1 = parseClock(t1.departureTime);
        if (!dep1) continue;
        const dur1 =
          typeof t1.duration === 'number' && t1.duration > 0
            ? t1.duration
            : this.estimateDurationMinutes(dep1.hhmm, t1.arrivalTime);
        if (!dur1) continue;

        const depMoment = parseIstMoment(journeyDateYmd, dep1.hhmm);
        const arrMoment = depMoment.clone().add(dur1, 'minutes');
        const earliestDep = arrMoment.clone().add(minLayover, 'minutes');
        const latestDep = arrMoment.clone().add(maxLayover, 'minutes');

        neededDates.add(earliestDep.format('YYYY-MM-DD'));
        neededDates.add(latestDep.format('YYYY-MM-DD'));

        leg1Evaluated.push({
          train: t1,
          depTime: dep1.hhmm,
          arrTime: arrMoment.format('HH:mm'),
          durMinutes: dur1,
          arrMoment,
        });
      }

      if (leg1Evaluated.length === 0 || neededDates.size === 0) return [];

      const queryDates = Array.from(neededDates)
        .sort()
        .slice(0, MAX_LEG2_DATES_PER_HUB);

      const leg2Responses = await Promise.all(
        queryDates.map(async (leg2Date) => {
          const res = await this.bookingV2
            .searchTrains(hub, to, leg2Date, classes, signal)
            .catch((err) => {
              this.logger.warn(
                `Leg 2 search failed ${hub}->${to} (${leg2Date}): ${err instanceof Error ? err.message : String(err)}`,
              );
              return null;
            });
          return this.extractTrainList(res).map((t) => ({
            ...t,
            queryBoardingDate: leg2Date,
          }));
        }),
      );

      const candidateLeg2Trains: DatedTrainRow[] = leg2Responses.flat();
      if (candidateLeg2Trains.length === 0) return [];

      const journeys: ConnectingJourneyDto[] = [];
      for (const l1 of leg1Evaluated) {
        const t1 = l1.train;
        const leg1To = (t1.toStnCode || hub).trim().toUpperCase();

        for (const t2 of candidateLeg2Trains) {
          if (t1.trainNumber === t2.trainNumber) continue;

          // Ensure physical transfer occurs at the exact same station
          const leg2From = (t2.fromStnCode || hub).trim().toUpperCase();
          if (leg1To !== leg2From) continue;

          const dep2 = parseClock(t2.departureTime);
          if (!dep2) continue;
          const dur2 =
            typeof t2.duration === 'number' && t2.duration > 0
              ? t2.duration
              : this.estimateDurationMinutes(dep2.hhmm, t2.arrivalTime);
          if (!dur2) continue;

          const t2DepMoment = parseIstMoment(t2.queryBoardingDate, dep2.hhmm);
          const layoverMinutes = t2DepMoment.diff(l1.arrMoment, 'minutes');
          if (layoverMinutes < minLayover || layoverMinutes > maxLayover) {
            continue;
          }

          const matchedClasses = this.matchClasses(t1, t2, classes);
          if (matchedClasses.length === 0) continue;

          const preferred = matchedClasses[0];
          const t2ArrMoment = t2DepMoment.clone().add(dur2, 'minutes');
          const arr2Time = t2ArrMoment.format('HH:mm');
          const arrivalDate = t2ArrMoment.format('YYYY-MM-DD');
          const totalDurationMinutes = l1.durMinutes + layoverMinutes + dur2;

          const leg1Dto: ConnectingJourneyLegDto = {
            trainNumber: t1.trainNumber,
            trainName: t1.trainName || `Train ${t1.trainNumber}`,
            from: t1.fromStnCode || from,
            to: leg1To,
            boardingDate: journeyDateYmd,
            departureTime: l1.depTime,
            arrivalTime: l1.arrTime,
            durationMinutes: l1.durMinutes,
            travelClass: preferred.travelClass,
            fare: preferred.leg1Fare,
            availabilityDisplayName: preferred.leg1Status,
            availablityStatus: preferred.leg1RawStatus,
            isConfirmed: preferred.leg1Confirmed,
            confirmedClassOptions: preferred.leg1Options,
          };

          const leg2Dto: ConnectingJourneyLegDto = {
            trainNumber: t2.trainNumber,
            trainName: t2.trainName || `Train ${t2.trainNumber}`,
            from: leg2From,
            to: t2.toStnCode || to,
            boardingDate: t2.queryBoardingDate,
            departureTime: dep2.hhmm,
            arrivalTime: arr2Time,
            durationMinutes: dur2,
            travelClass: preferred.travelClass,
            fare: preferred.leg2Fare,
            availabilityDisplayName: preferred.leg2Status,
            availablityStatus: preferred.leg2RawStatus,
            isConfirmed: preferred.leg2Confirmed,
            confirmedClassOptions: preferred.leg2Options,
          };

          journeys.push({
            id: `${t1.trainNumber}-${leg1To}-${t2.trainNumber}-${preferred.travelClass}`,
            from,
            to,
            intermediateStation: leg1To,
            intermediateStationName: this.getStationName(leg1To),
            journeyDate: journeyDateYmd,
            departureTime: l1.depTime,
            arrivalTime: arr2Time,
            arrivalDate,
            totalDurationMinutes,
            layoverMinutes,
            totalFare: preferred.totalFare,
            preferredClass: preferred.travelClass,
            isFullyConfirmed: preferred.isFullyConfirmed,
            legs: [leg1Dto, leg2Dto],
          });
        }
      }

      return journeys;
    } catch (hubErr) {
      this.logger.error(
        `Error processing intermediate hub ${hub}: ${hubErr instanceof Error ? hubErr.message : String(hubErr)}`,
      );
      return [];
    }
  }

  private extractTrainList(res: unknown): BookingV2TrainSearchRow[] {
    if (!res || typeof res !== 'object') return [];
    const data = (res as Record<string, unknown>).data;
    if (!data || typeof data !== 'object') return [];
    const list = (data as Record<string, unknown>).trainList;
    return Array.isArray(list) ? (list as BookingV2TrainSearchRow[]) : [];
  }

  private estimateDurationMinutes(
    depTime: string,
    arrTime?: string,
  ): number | null {
    if (!arrTime) return null;
    const dep = parseClock(depTime);
    const arr = parseClock(arrTime);
    if (!dep || !arr) return null;
    let diff = arr.minutes - dep.minutes;
    if (diff <= 0) diff += 24 * 60;
    return diff;
  }

  private matchClasses(
    t1: BookingV2TrainSearchRow,
    t2: BookingV2TrainSearchRow,
    filterClasses?: string[],
  ): MatchedClassCandidate[] {
    const t1Cache = (t1.availabilityCache ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    const t2Cache = (t2.availabilityCache ?? {}) as Record<
      string,
      Record<string, unknown>
    >;

    const t1Classes = (t1.avlClasses ?? Object.keys(t1Cache)).map((c) =>
      c.toUpperCase(),
    );
    const t2Classes = (t2.avlClasses ?? Object.keys(t2Cache)).map((c) =>
      c.toUpperCase(),
    );
    const t2ClassSet = new Set(t2Classes);
    const allowed = filterClasses?.length
      ? new Set(filterClasses.map((c) => c.toUpperCase()))
      : null;

    const common = t1Classes.filter(
      (c) => t2ClassSet.has(c) && (!allowed || allowed.has(c)),
    );
    if (common.length === 0) return [];

    const leg1AllOptions = toLegClassOptions(t1Classes, t1Cache);
    const leg2AllOptions = toLegClassOptions(t2Classes, t2Cache);

    const candidates: MatchedClassCandidate[] = common.map((cls) => {
      const row1 = t1Cache[cls];
      const row2 = t2Cache[cls];
      const fare1 = parseFare(row1?.fare);
      const fare2 = parseFare(row2?.fare);
      const totalFare = fare1 + fare2;
      const conf1 = checkRowConfirmed(row1);
      const conf2 = checkRowConfirmed(row2);

      return {
        travelClass: cls,
        totalFare: totalFare > 0 ? totalFare : 1000,
        isFullyConfirmed: conf1 && conf2,
        leg1Fare: fare1,
        leg1Status:
          toSafeString(row1?.availabilityDisplayName || row1?.railDataStatus) ||
          'Available',
        leg1RawStatus: (row1?.availablityStatus as string) ?? null,
        leg1Confirmed: conf1,
        leg1Options: leg1AllOptions,
        leg2Fare: fare2,
        leg2Status:
          toSafeString(row2?.availabilityDisplayName || row2?.railDataStatus) ||
          'Available',
        leg2RawStatus: (row2?.availablityStatus as string) ?? null,
        leg2Confirmed: conf2,
        leg2Options: leg2AllOptions,
      };
    });

    candidates.sort((a, b) => {
      if (a.isFullyConfirmed !== b.isFullyConfirmed) {
        return a.isFullyConfirmed ? -1 : 1;
      }
      return a.totalFare - b.totalFare;
    });

    return candidates;
  }

  private deduplicateJourneys(
    journeys: ConnectingJourneyDto[],
  ): ConnectingJourneyDto[] {
    const seen = new Set<string>();
    const res: ConnectingJourneyDto[] = [];
    for (const j of journeys) {
      const key = `${j.legs[0].trainNumber}-${j.intermediateStation}-${j.legs[1].trainNumber}-${j.preferredClass}`;
      if (!seen.has(key)) {
        seen.add(key);
        res.push(j);
      }
    }
    return res;
  }
}
