import { Injectable, Logger } from '@nestjs/common';
import { IrctcService } from '../irctc/irctc.service';
import type { TrainScheduleResponse } from '../irctc/irctc.service';
import { TrainCompositionService } from '../train-composition/train-composition.service';
import { ChartTimeService } from '../chart-time/chart-time.service';

function toStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  return '';
}

export type StructuredSeat = {
  coach: string;
  berth: string | number;
  class: string;
  seat: string;
  from: string;
  to: string;
};

/** One route leg slot: either a bookable segment or an empty object when no ticket. */
export type BookingPlanItem =
  | {
      instruction: string;
      approx_price: number;
      availability?: string;
      departureTime?: string | null;
      arrivalTime?: string | null;
    }
  | Record<string, never>;

export function isFilledPlanItem(
  item: BookingPlanItem | undefined | null,
): item is {
  instruction: string;
  approx_price: number;
  availability?: string;
  departureTime?: string | null;
  arrivalTime?: string | null;
} {
  if (item == null || typeof item !== 'object') return false;
  if (Object.keys(item).length === 0) return false;
  const instruction = toStr(
    (item as Record<string, unknown>).instruction,
  ).trim();
  return instruction.length > 0;
}

/** Consecutive station pairs along the schedule between boarding and destination. */
export function routeConsecutiveLegsForJourney(
  schedule: TrainScheduleResponse | null | undefined,
  boardingStation: string,
  destinationStation: string,
): { from: string; to: string }[] {
  const list = schedule?.stationList;
  if (!Array.isArray(list) || list.length < 2) return [];
  const codes = list
    .map((s) =>
      String(s.stationCode ?? '')
        .trim()
        .toUpperCase(),
    )
    .filter(Boolean);
  const fromIdx = codes.indexOf(boardingStation.trim().toUpperCase());
  const toIdx = codes.indexOf(destinationStation.trim().toUpperCase());
  if (fromIdx < 0 || toIdx < 0 || fromIdx >= toIdx) return [];
  const slice = codes.slice(fromIdx, toIdx + 1);
  const legs: { from: string; to: string }[] = [];
  for (let i = 0; i < slice.length - 1; i++) {
    legs.push({ from: slice[i], to: slice[i + 1] });
  }
  return legs;
}

export type Service2CheckResult = {
  status: 'success' | 'failed';
  composition?: {
    trainNo: string;
    trainName: string;
    from: string;
    to: string;
    chartOneDate: string | null;
    remote: string;
    nextRemote: string | null;
    classes: string[];
    cdd: { coachName: string; classCode: string; vacantBerths: number }[];
  };
  chartPreparationDetails?: {
    chartingStationCode: string;
    firstChartCreationTime: string;
    storedInDb: boolean;
  };
  vacantBerth: { vbd: unknown[]; error: string | null };
  /** Human-readable journey summary (set by the alert engine from confirmed legs). */
  summary?: string | null;
  /** Structured vacant berths: coach, berth, class, seat, from, to (order preserved). */
  structuredSeats?: StructuredSeat[];
  /**
   * One entry per consecutive schedule leg from boarding to destination (aligned with route).
   * Booked leg: { instruction, approx_price }. No ticket for that leg: {}.
   */
  bookingPlan?: BookingPlanItem[];
  /** Total approximate fare for the journey in INR. */
  totalPrice?: number;
  /** Train schedule (station list with times) for UI to show dep/arr times. */
  trainSchedule?: TrainScheduleResponse | null;
  /** When chart is not yet prepared or composition returned "Chart not prepared". */
  chartStatus?:
    | { kind: 'not_prepared_yet'; message: string }
    | { kind: 'chart_prepared_no_vacant_berths'; message: string }
    | { kind: 'chart_error'; error: string }
    | { kind: 'irctc_unavailable'; message: string; detail?: string };
  /** Step-by-step trace for debugging (also logged with Logger). */
  debugLog?: string[];
  /** True if IRCTC vacantBerth API was called (usually only for cron/chart-prep). */
  vacantBerthApiCalled?: boolean;
};

/** User-facing copy when IRCTC schedule API returns maintenance / downtime. */
const IRCTC_RESERVATIONS_BLOCKED_MESSAGE =
  'IRCTC is temporarily blocking reservations (for example during daily maintenance), so we cannot look up tickets for you right now. Please come back a little later.';

/** IRCTC schedule times are typically "HH:MM" or "HH:MM:SS". */
function parseIrctcClockToMinutes(t: string | undefined | null): number | null {
  if (!t || typeof t !== 'string') return null;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Previous calendar day as YYYY-MM-DD (UTC date math on the given day). */
function ymdMinusOneDay(ymd: string): string {
  const [y, mo, d] = ymd.split('-').map(Number);
  if (!y || !mo || !d) return ymd;
  const t = Date.UTC(y, mo - 1, d);
  return new Date(t - 86400000).toISOString().slice(0, 10);
}

/**
 * For trains that leave soon after midnight (or any time before the day's chart
 * clock), IRCTC prepares the first chart on the *previous* calendar day at the
 * stored time (e.g. chart 16:08 on 29 Mar for a 30 Mar 00:07 departure).
 * If departure is after the chart clock on jDate, the chart is on jDate itself.
 */
function chartCalendarDateForJourney(
  journeyDateYmd: string,
  chartTimeLocal: string,
  boardingDepartureClock: string | null,
): string {
  const chartM = parseIrctcClockToMinutes(chartTimeLocal);
  const depM = parseIrctcClockToMinutes(boardingDepartureClock);
  if (chartM != null && depM != null && depM < chartM) {
    return ymdMinusOneDay(journeyDateYmd);
  }
  return journeyDateYmd;
}

function boardingDepartureOrArrivalClock(
  schedule: TrainScheduleResponse | null,
  boardingStation: string,
): string | null {
  if (!schedule?.stationList?.length) return null;
  const st = schedule.stationList.find(
    (s) =>
      String(s.stationCode ?? '')
        .trim()
        .toUpperCase() === boardingStation,
  );
  if (!st) return null;
  const dep = st.departureTime?.trim();
  if (dep) return dep;
  const arr = st.arrivalTime?.trim();
  return arr || null;
}

/**
 * True if the first chart instant (IST) is still in the future vs now.
 * Uses previous calendar day when the train departs before the chart clock on jDate.
 */
function isChartTimeInFuture(
  jDate: string,
  chartTimeLocal: string,
  boardingDepartureClock: string | null,
): boolean {
  const match = String(chartTimeLocal)
    .trim()
    .match(/^(\d{1,2}):?(\d{2})/);
  if (!match) return false;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const chartYmd = chartCalendarDateForJourney(
    jDate,
    chartTimeLocal,
    boardingDepartureClock,
  );
  const chartIst = new Date(
    `${chartYmd}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00+05:30`,
  );
  const now = new Date();
  return chartIst.getTime() > now.getTime();
}

/** Parse IRCTC "YYYY-MM-DD HH:MM[:SS]" as an IST instant. */
function parseIrctcDateTimeIst(value: string | null | undefined): Date | null {
  if (!value || typeof value !== 'string') return null;
  const m = value
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, ymd, hh, mm, ss] = m;
  return new Date(
    `${ymd}T${hh.padStart(2, '0')}:${mm}:${(ss ?? '00').padStart(2, '0')}+05:30`,
  );
}

/** After chartTwoDate passes, IRCTC vacant-berth API should be called with chartType=2. */
function chartTypeFromComposition(
  composition: Awaited<ReturnType<IrctcService['getTrainComposition']>>,
): 1 | 2 {
  const chartTwoAt = parseIrctcDateTimeIst(composition.chartTwoDate);
  if (!chartTwoAt) return 1;
  return chartTwoAt.getTime() <= Date.now() ? 2 : 1;
}

/** Optional progress callbacks when running a check (e.g. SSE streaming). */
export type Service2CheckHooks = {
  /** Fired after IRCTC vacant-berth data has been collected. */
  onIrctcDataReady?: (info: {
    vacantSegmentCount: number;
    vacantBerthApiError: string | null;
    destinationStation: string;
  }) => void | Promise<void>;
};

/**
 * Service 2: IRCTC APIs only.
 * 1. Call trainComposition to get classes and chart time.
 * 2. Store chart time in DB for the station (constant data).
 * 3. Call vacantBerth for the selected class.
 */
@Injectable()
export class Service2Service {
  private readonly logger = new Logger(Service2Service.name);

  constructor(
    private irctc: IrctcService,
    private chartTime: ChartTimeService,
    private trainComposition: TrainCompositionService,
  ) {}

  async check(
    params: {
      trainNumber: string;
      stationCode: string;
      journeyDate: string;
      classCode?: string;
      destinationStation?: string;
      triggerSource?: 'manual' | 'cron';
      forceVacantBerth?: boolean;
      /** The date the train starts its journey from source (Day 1). Useful for multi-day routes. */
      trainStartDate?: string;
      signal?: AbortSignal;
    },
    hooks?: Service2CheckHooks,
  ): Promise<Service2CheckResult> {
    params.signal?.throwIfAborted();
    const debugLog: string[] = [];
    const logStep = (msg: string) => {
      debugLog.push(msg);
      this.logger.log(`[service2/check] ${msg}`);
    };

    const trainNo = String(params.trainNumber).trim();
    const jDate = String(params.journeyDate ?? '')
      .trim()
      .slice(0, 10);
    const trainStartDate = params.trainStartDate
      ? String(params.trainStartDate).trim().slice(0, 10)
      : jDate;
    const boardingStation = String(params.stationCode ?? '')
      .trim()
      .toUpperCase();
    const cls = String(params.classCode ?? 'ALL')
      .trim()
      .toUpperCase();
    const triggerSource = params.triggerSource ?? 'manual';
    const destinationStation = params.destinationStation
      ? String(params.destinationStation).trim().toUpperCase()
      : undefined;

    const baseCtx = `train=${trainNo} station=${boardingStation} date=${jDate} class=${cls} source=${triggerSource}`;
    logStep(
      `step=start ${baseCtx} dest=${destinationStation ?? 'default-from-composition'}`,
    );

    logStep(`step=fetch_train_schedule ${baseCtx}`);
    const scheduleResult = await this.irctc.getTrainSchedule(trainNo, {
      fillRunsOnFromComposition: {
        jDate,
        boardingStation,
      },
    });
    if (!scheduleResult.ok) {
      const irctcMsg =
        scheduleResult.reason === 'maintenance'
          ? scheduleResult.message
          : 'IRCTC schedule service unavailable';
      logStep(`step=irctc_schedule_maintenance ${baseCtx} irctc=${irctcMsg}`);
      return {
        status: 'failed',
        chartStatus: {
          kind: 'irctc_unavailable',
          message: IRCTC_RESERVATIONS_BLOCKED_MESSAGE,
          detail: irctcMsg,
        },
        vacantBerth: { vbd: [], error: null },
        debugLog,
      };
    }
    const trainSchedule = scheduleResult.ok ? scheduleResult.schedule : null;
    logStep(
      `step=train_schedule_done ${baseCtx} stations=${trainSchedule?.stationList?.length ?? 0}`,
    );

    const boardingDepartureClock = boardingDepartureOrArrivalClock(
      trainSchedule,
      boardingStation,
    );

    logStep(`step=chart_time_db_lookup ${baseCtx}`);
    const chartTimeFromDb = await this.chartTime.getChartTime(
      trainNo,
      boardingStation,
    );
    logStep(
      `step=chart_time_db_result ${baseCtx} fromDb=${chartTimeFromDb ?? 'none'} boardingDepClock=${boardingDepartureClock ?? 'none'}`,
    );

    if (
      chartTimeFromDb &&
      isChartTimeInFuture(jDate, chartTimeFromDb, boardingDepartureClock)
    ) {
      logStep(
        `step=exit_early_chart_not_ready_db ${baseCtx} chartTimeFromDb=${chartTimeFromDb}`,
      );
      return {
        status: 'failed',
        chartStatus: {
          kind: 'not_prepared_yet',
          message: 'Chart is not prepared for this journey date yet.',
        },
        vacantBerth: { vbd: [], error: null },
        debugLog,
      };
    }

    let composition: Awaited<ReturnType<IrctcService['getTrainComposition']>>;
    try {
      logStep(
        `step=fetch_composition ${baseCtx} compositionRequestDate=${trainStartDate} journeyDate=${jDate}`,
      );
      composition = await this.trainComposition.fetchForBoarding({
        trainNo,
        jDate: trainStartDate,
        boardingStation,
      });
      logStep(
        `step=composition_ok ${baseCtx} remote=${composition.remote ?? '?'} chartOneDate=${composition.chartOneDate ?? 'none'} trainName=${composition.trainName ?? '?'}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logStep(`step=composition_error ${baseCtx} ${msg}`);
      if (/chart\s+not\s+prepared/i.test(msg)) {
        return {
          status: 'failed',
          chartStatus: {
            kind: 'not_prepared_yet',
            message: 'Chart is not prepared for this journey date yet.',
          },
          vacantBerth: { vbd: [], error: null },
          debugLog,
        };
      }
      return {
        status: 'failed',
        chartStatus: { kind: 'chart_error', error: msg },
        vacantBerth: { vbd: [], error: null },
        debugLog,
      };
    }

    if (!chartTimeFromDb && composition.chartOneDate) {
      const match = composition.chartOneDate.match(
        /\d{4}-\d{2}-\d{2}\s+(\d{1,2}):(\d{2})/,
      );
      const timeLocal = match
        ? `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}`
        : null;
      if (
        timeLocal &&
        isChartTimeInFuture(jDate, timeLocal, boardingDepartureClock)
      ) {
        logStep(
          `step=exit_early_chart_not_ready_composition ${baseCtx} chartOneDate=${composition.chartOneDate} parsedLocal=${timeLocal}`,
        );
        return {
          status: 'failed',
          chartStatus: {
            kind: 'not_prepared_yet',
            message: 'Chart is not prepared for this journey date yet.',
          },
          vacantBerth: { vbd: [], error: null },
          debugLog,
        };
      }
    }

    const classes = [
      ...new Set(
        (composition.cdd ?? [])
          .map((c) => String(c.classCode).trim())
          .filter(Boolean),
      ),
    ].sort();
    logStep(
      `step=classes_from_composition ${baseCtx} count=${classes.length} codes=${classes.join(',')}`,
    );

    let chartPreparationDetails:
      Service2CheckResult['chartPreparationDetails'] | undefined;
    const chartOneDate = composition.chartOneDate ?? null;
    if (chartOneDate) {
      const match = chartOneDate.match(/\d{4}-\d{2}-\d{2}\s+(\d{1,2}):(\d{2})/);
      const timeLocal = match
        ? `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}`
        : null;
      const stationCode =
        composition.chartStatusResponseDto?.remoteStationCode ??
        composition.remote ??
        boardingStation;
      let storedInDb = false;
      if (timeLocal) {
        logStep(
          `step=persist_chart_time ${baseCtx} stationCode=${stationCode} timeLocal=${timeLocal}`,
        );
        await this.chartTime.setChartTime(trainNo, stationCode, timeLocal);
        storedInDb = true;
      }
      chartPreparationDetails = {
        chartingStationCode: stationCode,
        firstChartCreationTime: timeLocal ?? chartOneDate,
        storedInDb,
      };
      logStep(
        `step=chart_prep_details ${baseCtx} ${JSON.stringify(chartPreparationDetails)}`,
      );
    }

    let vacantBerth: Service2CheckResult['vacantBerth'] = {
      vbd: [],
      error: null,
    };
    let vacantBerthApiCalled = false;
    const chartTypeForVacantBerth = chartTypeFromComposition(composition);
    const initialRemoteStation = composition.remote ?? boardingStation;
    const trainSourceStation = composition.from ?? boardingStation;
    logStep(
      `step=vacant_berth_setup ${baseCtx} classes=${classes.length} initialRemote=${initialRemoteStation} trainSource=${trainSourceStation} chartType=${chartTypeForVacantBerth} chartTwoDate=${composition.chartTwoDate ?? 'none'} classList=${classes.join(',')}`,
    );
    const allVbd: unknown[] = [];
    const errors: string[] = [];

    const appendVacantBerthRound = async (
      roundBoarding: string,
      roundRemote: string,
      roundLabel: string,
    ) => {
      // Logic for deciding whether to hit vacantBerth API
      const isManual = triggerSource === 'manual';
      const forceManual = params.forceVacantBerth === true;

      if (isManual && !forceManual) {
        logStep(
          `step=vacant_berth_round_skip ${baseCtx} label=${roundLabel} reason="Triggered manually; skipping detailed IRCTC vacant-berth fetch to rely on composition counts only. Set forceVacantBerth=true to override."`,
        );
        return;
      }

      vacantBerthApiCalled = true;
      logStep(
        `step=vacant_berth_round_start ${baseCtx} label=${roundLabel} boarding=${roundBoarding} remote=${roundRemote}`,
      );
      for (const classCode of classes) {
        try {
          logStep(
            `step=vacant_berth_class ${baseCtx} label=${roundLabel} cls=${classCode}`,
          );
          const vbdRes = await this.irctc.getVacantBerth({
            trainNo,
            boardingStation: roundBoarding,
            remoteStation: roundRemote,
            trainSourceStation,
            jDate: trainStartDate,
            cls: classCode,
            chartType: chartTypeForVacantBerth,
          });
          const vbdPayload = vbdRes as {
            vbd?: unknown[];
            error?: string | null;
          };
          const vbdList = Array.isArray(vbdPayload?.vbd) ? vbdPayload.vbd : [];
          for (const item of vbdList) {
            allVbd.push(item);
          }
          if (vbdPayload?.error) {
            errors.push(`${roundLabel}/${classCode}: ${vbdPayload.error}`);
          }
          logStep(
            `step=vacant_berth_class_done ${baseCtx} label=${roundLabel} cls=${classCode} segments=${vbdList.length} apiError=${vbdPayload?.error ?? 'none'}`,
          );
        } catch (err) {
          const emsg = err instanceof Error ? err.message : String(err);
          errors.push(`${roundLabel}/${classCode}: ${emsg}`);
          logStep(
            `step=vacant_berth_class_error ${baseCtx} label=${roundLabel} cls=${classCode} ${emsg}`,
          );
        }
      }
      logStep(
        `step=vacant_berth_round_done ${baseCtx} label=${roundLabel} totalSegmentsSoFar=${allVbd.length}`,
      );
    };

    await appendVacantBerthRound(
      boardingStation,
      initialRemoteStation,
      'initial',
    );
    vacantBerth = {
      vbd: allVbd,
      error: errors.length > 0 ? errors.join('; ') : null,
    };

    logStep(
      `step=vacant_berth_all_done ${baseCtx} totalSegments=${allVbd.length} aggregatedError=${vacantBerth.error ?? 'none'}`,
    );

    const destForUi = destinationStation ?? composition.to ?? boardingStation;

    await hooks?.onIrctcDataReady?.({
      vacantSegmentCount: allVbd.length,
      vacantBerthApiError: vacantBerth.error,
      destinationStation: destForUi,
    });

    const compositionPayload = {
      trainNo: composition.trainNo,
      trainName: composition.trainName ?? '',
      from: composition.from,
      to: composition.to,
      chartOneDate,
      remote: composition.remote,
      nextRemote: composition.nextRemote ?? null,
      classes,
      cdd: (composition.cdd ?? []).map((c) => ({
        coachName: c.coachName,
        classCode: c.classCode,
        vacantBerths: c.vacantBerths,
      })),
    };

    logStep(
      `step=composition_payload_summary ${baseCtx} coaches=${compositionPayload.cdd.length} classesOnTrain=${compositionPayload.classes.join(',')}`,
    );

    const finalStatus = vacantBerth.error ? 'failed' : 'success';

    logStep(
      `step=return ${baseCtx} status=${finalStatus} vacantBerthError=${vacantBerth.error ?? 'none'} vacantBerthApiCalled=${vacantBerthApiCalled}`,
    );

    return {
      status: finalStatus,
      composition: compositionPayload,
      chartPreparationDetails,
      vacantBerth,
      trainSchedule: trainSchedule ?? undefined,
      debugLog,
      vacantBerthApiCalled,
    };
  }
}
