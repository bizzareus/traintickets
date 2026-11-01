import { Injectable, Logger } from '@nestjs/common';
import moment from 'moment';
import {
  BookingV2Service,
  type BookingV2TrainSearchRow,
} from './booking-v2.service';
import { canonicalStation } from './station-hubs';
import { isLegConfirmed, type AvlDayLike } from './booking-v2.utils';
import type {
  ConnectingCorridorConfig,
  ConnectingJourneyDto,
  ConnectingJourneyLegDto,
  ConnectingLegClassOption,
  ConnectingTrainsResponseDto,
} from './connecting-trains.types';

export const CONNECTING_CORRIDORS: readonly ConnectingCorridorConfig[] = [
  {
    fromHub: 'NDLS',
    toHub: 'PNBE',
    intermediateHubs: ['CNB', 'PRYJ', 'DDU'],
    defaultMinLayoverMinutes: 30,
    defaultMaxLayoverMinutes: 360, // 6 hours
  },
];

const KNOWN_STATION_NAMES: Record<string, string> = {
  NDLS: 'New Delhi',
  DLI: 'Old Delhi',
  ANVT: 'Anand Vihar Terminal',
  NZM: 'Hazrat Nizamuddin',
  DEE: 'Delhi Sarai Rohilla',
  CNB: 'Kanpur Central',
  PRYJ: 'Prayagraj Jn',
  DDU: 'Pt. Deen Dayal Upadhyaya Jn',
  PNBE: 'Patna Jn',
  PPTA: 'Patliputra Jn',
  RJPB: 'Rajendra Nagar Terminal',
};

const CONFIRMED_TEXT_RE = /^AVL|^AVAIL|^CURR_AV|^CURRENT AV|^CNF/i;

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

function parseClockMinutes(timeStr?: string | null): number | null {
  if (!timeStr?.trim()) return null;
  const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

@Injectable()
export class ConnectingTrainsService {
  private readonly logger = new Logger(ConnectingTrainsService.name);

  constructor(private readonly bookingV2: BookingV2Service) {}

  findCorridor(from: string, to: string): ConnectingCorridorConfig | null {
    const fromHub = canonicalStation(from);
    const toHub = canonicalStation(to);
    return (
      CONNECTING_CORRIDORS.find(
        (c) => c.fromHub === fromHub && c.toHub === toHub,
      ) ?? null
    );
  }

  getStationName(code: string): string {
    const c = code.trim().toUpperCase();
    return KNOWN_STATION_NAMES[c] ?? c;
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
    const normalizedDate = this.bookingV2.normalizeToRailApiDate(date);
    if (!normalizedDate) {
      throw new Error(
        'Invalid journey date format (expected YYYY-MM-DD or DD-MM-YYYY)',
      );
    }
    const [dd, mm, yyyy] = normalizedDate.split('-');
    const journeyDateYmd = `${yyyy}-${mm}-${dd}`;
    const nextDayYmd = moment(journeyDateYmd, 'YYYY-MM-DD')
      .add(1, 'day')
      .format('YYYY-MM-DD');

    const corridor = this.findCorridor(from, to);
    if (!corridor) {
      return {
        from: from.toUpperCase(),
        to: to.toUpperCase(),
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
        : corridor.defaultMinLayoverMinutes;
    const maxLayover =
      typeof params.maxLayoverMinutes === 'number' &&
      params.maxLayoverMinutes > minLayover
        ? params.maxLayoverMinutes
        : corridor.defaultMaxLayoverMinutes;

    const allJourneys: ConnectingJourneyDto[] = [];

    // For each intermediate junction hub, query Leg 1 (from -> hub) and Leg 2 (hub -> to)
    await Promise.allSettled(
      corridor.intermediateHubs.map(async (hub) => {
        try {
          // 1. Fetch Leg 1 trains (from -> hub) on journeyDate
          const [leg1Res, leg2ResToday, leg2ResTomorrow] = await Promise.all([
            this.bookingV2
              .searchTrains(from, hub, journeyDateYmd, params.classes, signal)
              .catch((err) => {
                this.logger.warn(
                  `Leg 1 search failed ${from}->${hub}: ${err instanceof Error ? err.message : String(err)}`,
                );
                return null;
              }),
            this.bookingV2
              .searchTrains(hub, to, journeyDateYmd, params.classes, signal)
              .catch((err) => {
                this.logger.warn(
                  `Leg 2 search failed ${hub}->${to} (${journeyDateYmd}): ${err instanceof Error ? err.message : String(err)}`,
                );
                return null;
              }),
            this.bookingV2
              .searchTrains(hub, to, nextDayYmd, params.classes, signal)
              .catch((err) => {
                this.logger.warn(
                  `Leg 2 search failed ${hub}->${to} (${nextDayYmd}): ${err instanceof Error ? err.message : String(err)}`,
                );
                return null;
              }),
          ]);

          const leg1Trains = this.extractTrainList(leg1Res);
          const leg2TrainsToday = this.extractTrainList(leg2ResToday).map(
            (t) => ({
              ...t,
              queryBoardingDate: journeyDateYmd,
            }),
          );
          const leg2TrainsTomorrow = this.extractTrainList(leg2ResTomorrow).map(
            (t) => ({
              ...t,
              queryBoardingDate: nextDayYmd,
            }),
          );

          const candidateLeg2Trains = [
            ...leg2TrainsToday,
            ...leg2TrainsTomorrow,
          ];

          for (const t1 of leg1Trains) {
            const dep1Time = t1.departureTime?.trim();
            if (!dep1Time) continue;

            const dur1Minutes =
              typeof t1.duration === 'number' && t1.duration > 0
                ? t1.duration
                : this.estimateDurationMinutes(dep1Time, t1.arrivalTime);
            if (!dur1Minutes) continue;

            const t1DepMoment = moment(
              `${journeyDateYmd}T${dep1Time}:00+05:30`,
              'YYYY-MM-DDTHH:mm:ssZ',
            );
            const t1ArrMoment = t1DepMoment.clone().add(dur1Minutes, 'minutes');
            const arr1Time = t1ArrMoment.format('HH:mm');

            for (const t2 of candidateLeg2Trains) {
              if (t1.trainNumber === t2.trainNumber) continue;

              const dep2Time = t2.departureTime?.trim();
              if (!dep2Time) continue;

              const dur2Minutes =
                typeof t2.duration === 'number' && t2.duration > 0
                  ? t2.duration
                  : this.estimateDurationMinutes(dep2Time, t2.arrivalTime);
              if (!dur2Minutes) continue;

              const t2DepMoment = moment(
                `${t2.queryBoardingDate}T${dep2Time}:00+05:30`,
                'YYYY-MM-DDTHH:mm:ssZ',
              );
              const layoverMinutes = t2DepMoment.diff(t1ArrMoment, 'minutes');

              // Layover must fall inside [minLayover, maxLayover]
              if (layoverMinutes < minLayover || layoverMinutes > maxLayover) {
                continue;
              }

              const t2ArrMoment = t2DepMoment
                .clone()
                .add(dur2Minutes, 'minutes');
              const arr2Time = t2ArrMoment.format('HH:mm');
              const arrivalDate = t2ArrMoment.format('YYYY-MM-DD');
              const totalDurationMinutes =
                dur1Minutes + layoverMinutes + dur2Minutes;

              // Find class matches and pricing
              const matchedClasses = this.matchClasses(t1, t2, params.classes);
              if (matchedClasses.length === 0) continue;

              const preferred = matchedClasses[0];

              const leg1Dto: ConnectingJourneyLegDto = {
                trainNumber: t1.trainNumber,
                trainName: t1.trainName || `Train ${t1.trainNumber}`,
                from: t1.fromStnCode || from.toUpperCase(),
                to: t1.toStnCode || hub.toUpperCase(),
                boardingDate: journeyDateYmd,
                departureTime: dep1Time,
                arrivalTime: arr1Time,
                durationMinutes: dur1Minutes,
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
                from: t2.fromStnCode || hub.toUpperCase(),
                to: t2.toStnCode || to.toUpperCase(),
                boardingDate: t2.queryBoardingDate,
                departureTime: dep2Time,
                arrivalTime: arr2Time,
                durationMinutes: dur2Minutes,
                travelClass: preferred.travelClass,
                fare: preferred.leg2Fare,
                availabilityDisplayName: preferred.leg2Status,
                availablityStatus: preferred.leg2RawStatus,
                isConfirmed: preferred.leg2Confirmed,
                confirmedClassOptions: preferred.leg2Options,
              };

              allJourneys.push({
                id: `${t1.trainNumber}-${hub}-${t2.trainNumber}-${preferred.travelClass}`,
                from: from.toUpperCase(),
                to: to.toUpperCase(),
                intermediateStation: hub.toUpperCase(),
                intermediateStationName: this.getStationName(hub),
                journeyDate: journeyDateYmd,
                departureTime: dep1Time,
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
        } catch (hubErr) {
          this.logger.error(
            `Error processing intermediate hub ${hub}: ${hubErr instanceof Error ? hubErr.message : String(hubErr)}`,
          );
        }
      }),
    );

    // Deduplicate journeys by identical (train1, train2, intermediateStation)
    const uniqueJourneys = this.deduplicateJourneys(allJourneys);

    // Sort: fully confirmed connections first, then fastest total travel time
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
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      date: journeyDateYmd,
      isSupportedCorridor: true,
      totalFound: uniqueJourneys.length,
      confirmedCount,
      journeys: uniqueJourneys.slice(0, 30),
    };
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
    const depM = parseClockMinutes(depTime);
    const arrM = parseClockMinutes(arrTime);
    if (depM === null || arrM === null) return null;
    let diff = arrM - depM;
    if (diff <= 0) diff += 24 * 60; // crossed midnight
    return diff;
  }

  private matchClasses(
    t1: BookingV2TrainSearchRow,
    t2: BookingV2TrainSearchRow,
    filterClasses?: string[],
  ): Array<{
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
  }> {
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

    const allowed = filterClasses?.length
      ? new Set(filterClasses.map((c) => c.toUpperCase()))
      : null;

    const common = t1Classes.filter(
      (c) => t2Classes.includes(c) && (!allowed || allowed.has(c)),
    );

    const leg1AllOptions: ConnectingLegClassOption[] = t1Classes.map((cls) => {
      const cRow = t1Cache[cls];
      const fare = parseFare(cRow?.fare);
      const isConf = checkRowConfirmed(cRow);
      return {
        travelClass: cls,
        fare: fare > 0 ? fare : null,
        availabilityDisplayName:
          toSafeString(cRow?.availabilityDisplayName || cRow?.railDataStatus) ||
          'Check Status',
        isConfirmed: isConf,
      };
    });

    const leg2AllOptions: ConnectingLegClassOption[] = t2Classes.map((cls) => {
      const cRow = t2Cache[cls];
      const fare = parseFare(cRow?.fare);
      const isConf = checkRowConfirmed(cRow);
      return {
        travelClass: cls,
        fare: fare > 0 ? fare : null,
        availabilityDisplayName:
          toSafeString(cRow?.availabilityDisplayName || cRow?.railDataStatus) ||
          'Check Status',
        isConfirmed: isConf,
      };
    });

    const candidates: Array<{
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
    }> = [];

    for (const cls of common) {
      const row1 = t1Cache[cls];
      const row2 = t2Cache[cls];

      const fare1 = parseFare(row1?.fare);
      const fare2 = parseFare(row2?.fare);
      const totalFare = fare1 + fare2;

      const conf1 = checkRowConfirmed(row1);
      const conf2 = checkRowConfirmed(row2);
      const isFullyConfirmed = conf1 && conf2;

      const leg1Status =
        toSafeString(row1?.availabilityDisplayName || row1?.railDataStatus) ||
        'Available';
      const leg2Status =
        toSafeString(row2?.availabilityDisplayName || row2?.railDataStatus) ||
        'Available';

      candidates.push({
        travelClass: cls,
        totalFare: totalFare > 0 ? totalFare : 1000,
        isFullyConfirmed,
        leg1Fare: fare1,
        leg1Status,
        leg1RawStatus: (row1?.availablityStatus as string) ?? null,
        leg1Confirmed: conf1,
        leg1Options: leg1AllOptions,
        leg2Fare: fare2,
        leg2Status,
        leg2RawStatus: (row2?.availablityStatus as string) ?? null,
        leg2Confirmed: conf2,
        leg2Options: leg2AllOptions,
      });
    }

    // Rank: fully confirmed classes first, then cheapest
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
