import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
import type { ReasoningEffort } from 'openai/resources/shared';
import { IrctcService } from '../irctc/irctc.service';
import type { TrainScheduleResponse } from '../irctc/irctc.service';
import { ChartTimeService } from '../chart-time/chart-time.service';

const OPENAI_AGENT_PROMPT = `You are an expert at finding the best train booking combination from seat segment data. Apply the following algorithm exactly.

---

Algorithm to Find the Best Train Booking Combination from Seat Segment Data

Goal:
Determine the best way to travel from a source station to a destination station using available seat segments. The algorithm should prioritize the longest possible journey segments first, then try to maintain continuity in seat, coach, and class to minimize movement during the journey.

Input:
You will receive:
- A list of seat segments containing:
  - coachName
  - berthNumber
  - from station
  - to station
- A list of stations representing the train route in order.
- A source station.
- A destination station.

Step 1: Determine Station Order
Use the train route list to assign an index to each station. The order of the stations determines travel direction. Convert every seat segment into an interval using these indices.

Each segment should contain:
- fromIndex
- toIndex
- coachName
- berthNumber
- classType (derived from coachName)

Example class mapping:
H1, HA → 1AC  
A1, A2, A3 → 2AC  
B1, B2, B3 → 3AC  

Step 2: Keep All Coach Types
Do not filter by class. All coach types must be considered so the algorithm can choose the best possible combination.

Step 3: Filter Valid Segments
Keep only segments that:
- Start at or after the source station
- End at or before the destination station
- Move forward in the route (toIndex > fromIndex)

Step 4: Generate Possible Journey Paths
Start from the source station index.

At each step:
- Find all segments whose starting station is at or before the current position.
- From those segments select ones that extend the journey forward.
- Each segment becomes a possible continuation of the journey.

Repeat until:
- The destination station is reached, or
- No segment extends the journey further.

Each chain of segments forms a possible journey plan.

Step 5: Scoring and Prioritization
Score each journey plan using the following priorities (from highest to lowest importance).

Priority 1 — Longest Journey Segment
Prefer segments that cover the largest distance toward the destination. The algorithm should always try to extend the journey as far as possible before adding another ticket.

Priority 2 — Reach Destination
Plans that reach the final destination are preferred over plans that stop earlier.

Priority 3 — Minimum Number of Tickets
Plans with fewer segments are better.

Priority 4 — Same Seat
If multiple options exist, prefer segments that keep the same berthNumber.

Priority 5 — Same Coach
Prefer segments where coachName remains the same.

Priority 6 — Same Class
Prefer segments that stay within the same class type (for example 2AC → 2AC).

Priority 7 — Closest Coach
If coach continuity cannot be maintained, prefer coaches that are numerically closest to the previous coach. For example:
A2 → A3 is better than A2 → B5.

Step 6: Select the Best Plan
Sort all journey plans using the priority rules above. Choose the plan that:

- Covers the longest possible journey
- Reaches the destination if possible
- Uses the fewest tickets
- Maintains seat continuity when possible
- Maintains coach continuity when possible
- Keeps the class type consistent when possible
- Minimizes coach movement if a change is required

Step 7: Output Format
Return the final booking plan as a list of booking instructions in the format:

Source - Destination - Class

Example output:

NDLS - SBIB - 1AC

Or if multiple tickets are required:

NDLS - JP - 2AC  
FA - ABR - 3AC  
ABR - SBIB - 2AC  

Step 8: Handling Gaps
If a gap exists between two booked segments, assume the passenger remains on the train without reservation until the next booked segment begins.

---

Given the provided train route, source, destination, and raw seat segment data (vacant berths across classes), apply this algorithm. Consider all classes on the train when building the best plan.

Summary: One-line, easy-reading summary of what the user needs to do (e.g. book 1 ticket from A-B, 1 ticket from B-C). Short, friendly, action-oriented. And if there is no ticket between 2 stations then tell the user about it as well.

Return your summary, the list of seat segments used (as the "seats" array with coach, berth, class, seat, from, to), and the best booking plan with approximate price per segment and total price (in INR), as specified in the JSON schema.`;

/** JSON schema: summary, seats, booking_plan (instruction + approx_price per segment), total_price (INR). */
const OPENAI_RESPONSE_JSON_SCHEMA = {
  type: 'object' as const,
  properties: {
    summary: {
      type: 'string',
      description:
        'One-line, easy-reading summary of what the user needs to do (e.g. book 1 ticket from A-B, 1 ticket from B-C). Short, friendly, action-oriented. And if there is no ticket between 2 stations then tell the user about it as well.',
    },
    seats: {
      type: 'array',
      description:
        'Seat segments with coach, berth, class, seat, from, to in order',
      items: {
        type: 'object',
        properties: {
          coach: { type: 'string' },
          berth: { type: 'string', description: 'Berth number or code' },
          class: { type: 'string' },
          seat: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
        },
        required: ['coach', 'berth', 'class', 'seat', 'from', 'to'],
        additionalProperties: false,
      },
    },
    booking_plan: {
      type: 'array',
      description:
        'Best booking plan: each item has instruction (FROM_STATION - TO_STATION - CLASS) and approx_price (INR)',
      items: {
        type: 'object',
        properties: {
          instruction: {
            type: 'string',
            description:
              'Segment in format "FROM_STATION - TO_STATION - CLASS"',
          },
          approx_price: {
            type: 'number',
            description:
              'Approximate fare for this segment in Indian Rupees (INR)',
          },
        },
        required: ['instruction', 'approx_price'],
        additionalProperties: false,
      },
    },
    total_price: {
      type: 'number',
      description:
        'Total approximate fare for the entire journey in Indian Rupees (INR)',
    },
  },
  required: ['summary', 'seats', 'booking_plan', 'total_price'],
  additionalProperties: false,
};

const OPENAI_TEXT_VERBOSITIES = new Set(['low', 'medium', 'high']);

const OPENAI_REASONING_EFFORTS = new Set([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
]);

/** `text.verbosity` for Responses API — lower usually means fewer tokens / faster. */
function openAiTextVerbosity():
  | NonNullable<ResponseCreateParamsNonStreaming['text']>['verbosity']
  | undefined {
  const raw = process.env.OPENAI_TEXT_VERBOSITY?.trim().toLowerCase();
  if (raw === 'off' || raw === 'default') return undefined;
  if (raw && OPENAI_TEXT_VERBOSITIES.has(raw)) {
    return raw as NonNullable<
      ResponseCreateParamsNonStreaming['text']
    >['verbosity'];
  }
  return 'low';
}

type OpenAiResponsesTuning = Pick<
  ResponseCreateParamsNonStreaming,
  'max_output_tokens' | 'service_tier' | 'prompt_cache_key'
> & { reasoning?: ResponseCreateParamsNonStreaming['reasoning'] };

/**
 * Responses API knobs for latency vs quality (after picking the smallest model
 * that passes evals): cap output tokens, optional reasoning effort, service tier,
 * prompt cache key. Pair with `openAiTextVerbosity` and a smaller `OPENAI_MODEL`.
 * @see https://developers.openai.com/api/reference/resources/responses/methods/create
 */
function openAiResponsesTuning(): OpenAiResponsesTuning {
  const effortRaw = process.env.OPENAI_REASONING_EFFORT?.trim().toLowerCase();
  const skipReasoning =
    effortRaw === 'off' ||
    effortRaw === 'skip' ||
    effortRaw === 'disabled' ||
    effortRaw === '';

  const parsedMax = parseInt(
    process.env.OPENAI_MAX_OUTPUT_TOKENS ?? '4096',
    10,
  );
  const max_output_tokens = Number.isFinite(parsedMax)
    ? Math.min(16000, Math.max(512, parsedMax))
    : 4096;

  const serviceTier = process.env.OPENAI_SERVICE_TIER?.trim();
  const promptCacheKey = process.env.OPENAI_PROMPT_CACHE_KEY?.trim();

  const out: OpenAiResponsesTuning = {
    max_output_tokens,
    ...(serviceTier
      ? {
          service_tier:
            serviceTier as ResponseCreateParamsNonStreaming['service_tier'],
        }
      : {}),
    ...(promptCacheKey ? { prompt_cache_key: promptCacheKey } : {}),
  };

  if (!skipReasoning) {
    const effort: ReasoningEffort =
      effortRaw && OPENAI_REASONING_EFFORTS.has(effortRaw)
        ? (effortRaw as ReasoningEffort)
        : 'medium';
    out.reasoning = { effort };
  }

  return out;
}

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
  if (
    chartM != null &&
    depM != null &&
    depM < chartM
  ) {
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
    (s) => String(s.stationCode ?? '').trim().toUpperCase() === boardingStation,
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
  openAiSummary?: string | null;
  /** Structured vacant berths from OpenAI: coach, berth, class, seat, from, to (order preserved). */
  openAiStructuredSeats?: OpenAIStructuredSeat[];
  /** Best booking plan: each segment with instruction and approximate price (INR). */
  openAiBookingPlan?: { instruction: string; approx_price: number }[];
  /** Total approximate fare for the journey in INR. */
  openAiTotalPrice?: number;
  /** Train schedule (station list with times) for UI to show dep/arr times. */
  trainSchedule?: TrainScheduleResponse | null;
  /** When chart is not yet prepared or composition returned "Chart not prepared". */
  chartStatus?:
    | { kind: 'not_prepared_yet'; message: string }
    | { kind: 'chart_error'; error: string };
};

export type OpenAIStructuredSeat = {
  coach: string;
  berth: string | number;
  class: string;
  seat: string;
  from: string;
  to: string;
};

/** Optional progress callbacks when running a check (e.g. SSE streaming). */
export type Service2CheckHooks = {
  /** Fired after IRCTC vacant-berth data has been collected, before any OpenAI call. */
  onIrctcDataReady?: (info: {
    vacantSegmentCount: number;
    vacantBerthApiError: string | null;
    destinationStation: string;
  }) => void;
  /** Fired immediately before the OpenAI request (only when an API key is configured). */
  onAiStarted?: (info: { destinationStation: string }) => void;
};

/**
 * Service 2: IRCTC APIs only.
 * 1. Call trainComposition to get classes and chart time.
 * 2. Store chart time in DB for the station (constant data).
 * 3. Call vacantBerth for the selected class.
 * 4. (Later) Pass data to OpenAI with a prompt - placeholder for now.
 */
@Injectable()
export class Service2Service {
  private readonly logger = new Logger(Service2Service.name);

  constructor(
    private irctc: IrctcService,
    private chartTime: ChartTimeService,
  ) {}

  async check(
    params: {
      trainNumber: string;
      stationCode: string;
      journeyDate: string;
      classCode: string;
      destinationStation?: string;
      passengerDetails?: string;
    },
    hooks?: Service2CheckHooks,
  ): Promise<Service2CheckResult> {
    const trainNo = String(params.trainNumber).trim();
    const boardingStation = String(params.stationCode).trim().toUpperCase();
    const jDate = String(params.journeyDate).trim().slice(0, 10);
    const cls = String(params.classCode).trim().toUpperCase();
    const destinationStation = params.destinationStation
      ? String(params.destinationStation).trim().toUpperCase()
      : undefined;

    const baseCtx = `train=${trainNo} station=${boardingStation} date=${jDate} class=${cls}`;
    this.logger.log(
      `[service2/check] step=start ${baseCtx} dest=${destinationStation ?? 'default-from-composition'} hasPassengerDetails=${Boolean(params.passengerDetails)}`,
    );

    this.logger.log(`[service2/check] step=fetch_train_schedule ${baseCtx}`);
    const trainSchedule = await this.irctc.getTrainSchedule(trainNo);
    this.logger.log(
      `[service2/check] step=train_schedule_done ${baseCtx} stations=${trainSchedule?.stationList?.length ?? 0}`,
    );

    const boardingDepartureClock = boardingDepartureOrArrivalClock(
      trainSchedule,
      boardingStation,
    );

    this.logger.log(`[service2/check] step=chart_time_db_lookup ${baseCtx}`);
    const chartTimeFromDb = await this.chartTime.getChartTime(
      trainNo,
      boardingStation,
    );
    this.logger.log(
      `[service2/check] step=chart_time_db_result ${baseCtx} fromDb=${chartTimeFromDb ?? 'none'} boardingDepClock=${boardingDepartureClock ?? 'none'}`,
    );

    if (
      chartTimeFromDb &&
      isChartTimeInFuture(jDate, chartTimeFromDb, boardingDepartureClock)
    ) {
      this.logger.warn(
        `[service2/check] step=exit_early_chart_not_ready_db ${baseCtx} chartTimeFromDb=${chartTimeFromDb}`,
      );
      return {
        status: 'failed',
        chartStatus: {
          kind: 'not_prepared_yet',
          message: 'Chart is not prepared for this journey date yet.',
        },
        vacantBerth: { vbd: [], error: null },
      };
    }

    let composition: Awaited<ReturnType<IrctcService['getTrainComposition']>>;
    try {
      this.logger.log(
        `[service2/check] step=fetch_composition ${baseCtx} jDate=${jDate}`,
      );
      composition = await this.irctc.getTrainComposition({
        trainNo,
        jDate,
        boardingStation,
      });
      this.logger.log(
        `[service2/check] step=composition_ok ${baseCtx} remote=${composition.remote ?? '?'} chartOneDate=${composition.chartOneDate ?? 'none'} trainName=${composition.trainName ?? '?'}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[service2/check] step=composition_error ${baseCtx} ${msg}`,
        err instanceof Error ? err.stack : undefined,
      );
      if (/chart\s+not\s+prepared/i.test(msg)) {
        return {
          status: 'failed',
          chartStatus: { kind: 'chart_error', error: 'Chart not prepared' },
          vacantBerth: { vbd: [], error: null },
        };
      }
      return {
        status: 'failed',
        chartStatus: { kind: 'chart_error', error: msg },
        vacantBerth: { vbd: [], error: null },
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
        this.logger.warn(
          `[service2/check] step=exit_early_chart_not_ready_composition ${baseCtx} chartOneDate=${composition.chartOneDate} parsedLocal=${timeLocal}`,
        );
        return {
          status: 'failed',
          chartStatus: {
            kind: 'not_prepared_yet',
            message: 'Chart is not prepared for this journey date yet.',
          },
          vacantBerth: { vbd: [], error: null },
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
    this.logger.log(
      `[service2/check] step=classes_from_composition ${baseCtx} count=${classes.length} codes=${classes.join(',')}`,
    );

    let chartPreparationDetails:
      | Service2CheckResult['chartPreparationDetails']
      | undefined;
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
        this.logger.log(
          `[service2/check] step=persist_chart_time ${baseCtx} stationCode=${stationCode} timeLocal=${timeLocal}`,
        );
        await this.chartTime.setChartTime(trainNo, stationCode, timeLocal);
        storedInDb = true;
      }
      chartPreparationDetails = {
        chartingStationCode: stationCode,
        firstChartCreationTime: timeLocal ?? chartOneDate,
        storedInDb,
      };
      this.logger.log(
        `[service2/check] step=chart_prep_details ${baseCtx} ${JSON.stringify(chartPreparationDetails)}`,
      );
    }

    let vacantBerth: Service2CheckResult['vacantBerth'] = {
      vbd: [],
      error: null,
    };
    const remoteStation = composition.remote ?? boardingStation;
    const trainSourceStation = composition.from ?? boardingStation;
    this.logger.log(
      `[service2/check] step=vacant_berth_loop_start ${baseCtx} classes=${classes.length} remote=${remoteStation} trainSource=${trainSourceStation} classList=${classes.join(',')}`,
    );
    const allVbd: unknown[] = [];
    const errors: string[] = [];
    for (const classCode of classes) {
      try {
        this.logger.log(
          `[service2/check] step=vacant_berth_class ${baseCtx} cls=${classCode}`,
        );
        const vbdRes = await this.irctc.getVacantBerth({
          trainNo,
          boardingStation,
          remoteStation,
          trainSourceStation,
          jDate,
          cls: classCode,
          chartType: 1,
        });
        const vbdPayload = vbdRes as { vbd?: unknown[]; error?: string | null };
        const vbdList = Array.isArray(vbdPayload?.vbd) ? vbdPayload.vbd : [];
        for (const item of vbdList) {
          allVbd.push(item);
        }
        if (vbdPayload?.error) {
          errors.push(`${classCode}: ${vbdPayload.error}`);
        }
        this.logger.log(
          `[service2/check] step=vacant_berth_class_done ${baseCtx} cls=${classCode} segments=${vbdList.length} apiError=${vbdPayload?.error ?? 'none'}`,
        );
      } catch (err) {
        const emsg = err instanceof Error ? err.message : String(err);
        errors.push(`${classCode}: ${emsg}`);
        this.logger.error(
          `[service2/check] step=vacant_berth_class_error ${baseCtx} cls=${classCode} ${emsg}`,
          err instanceof Error ? err.stack : undefined,
        );
      }
    }
    vacantBerth = {
      vbd: allVbd,
      error: errors.length > 0 ? errors.join('; ') : null,
    };
    this.logger.log(
      `[service2/check] step=vacant_berth_all_done ${baseCtx} totalSegments=${allVbd.length} aggregatedError=${vacantBerth.error ?? 'none'}`,
    );

    const destForUi =
      destinationStation ?? composition.to ?? boardingStation;

    hooks?.onIrctcDataReady?.({
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

    this.logger.log(
      `[service2/check] step=composition_payload_summary ${baseCtx} coaches=${compositionPayload.cdd.length} classesOnTrain=${compositionPayload.classes.join(',')}`,
    );

    let openAiSummary: string | null = null;
    let resultOpenAiStructuredSeats: OpenAIStructuredSeat[] | undefined;
    let resultOpenAiBookingPlan:
      | { instruction: string; approx_price: number }[]
      | undefined;
    let resultOpenAiTotalPrice: number | undefined;
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey?.trim()) {
      try {
        this.logger.log(
          `[service2/check] step=openai_request_start ${baseCtx} model=${process.env.OPENAI_MODEL ?? 'default'}`,
        );
        hooks?.onAiStarted?.({ destinationStation: destForUi });
        const userMessage = buildOpenAIUserMessage({
          trainNumber: trainNo,
          originStation: boardingStation,
          destinationStation: destinationStation ?? composition.to,
          journeyDate: jDate,
          classCode: cls,
          passengerDetails: params.passengerDetails,
          composition: compositionPayload,
          chartPreparationDetails: chartPreparationDetails ?? null,
          vacantBerth,
          trainSchedule,
        });
        this.logger.log(
          `[service2/check] step=openai_user_message_built ${baseCtx} chars=${userMessage.length}`,
        );
        const client = new OpenAI({ apiKey: apiKey.trim() });
        const textVerbosity = openAiTextVerbosity();
        const response = await client.responses.create({
          model: process.env.OPENAI_MODEL,
          instructions: OPENAI_AGENT_PROMPT,
          input: [{ role: 'user', content: userMessage }],
          ...openAiResponsesTuning(),
          text: {
            ...(textVerbosity ? { verbosity: textVerbosity } : {}),
            format: {
              type: 'json_schema',
              name: 'railchart_response',
              description:
                'Response with summary, seats, booking_plan (instruction + approx_price per segment), and total_price (INR)',
              schema: OPENAI_RESPONSE_JSON_SCHEMA,
              strict: true,
            },
          },
        });
        const rawContent = response.output_text?.trim();
        this.logger.log(
          `[service2/check] step=openai_response ${baseCtx} outputChars=${rawContent?.length ?? 0} responseId=${(response as { id?: string }).id ?? 'n/a'}`,
        );
        if (rawContent) {
          const parsed = parseOpenAIStructuredResponse(rawContent);
          openAiSummary = parsed.summary ?? rawContent;
          if (parsed.seats?.length) {
            resultOpenAiStructuredSeats = parsed.seats;
          }
          if (parsed.booking_plan?.length) {
            resultOpenAiBookingPlan = parsed.booking_plan;
          }
          if (parsed.total_price != null) {
            resultOpenAiTotalPrice = parsed.total_price;
          }
          this.logger.log(
            `[service2/check] step=openai_parsed ${baseCtx} seats=${parsed.seats?.length ?? 0} bookingPlan=${parsed.booking_plan?.length ?? 0} totalPrice=${parsed.total_price ?? 'n/a'}`,
          );
        }
      } catch (err) {
        const emsg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `[service2/check] step=openai_error ${baseCtx} ${emsg}`,
          err instanceof Error ? err.stack : undefined,
        );
        openAiSummary = `OpenAI summary unavailable: ${emsg}`;
      }
    } else {
      this.logger.warn(
        `[service2/check] step=openai_skipped_no_api_key ${baseCtx}`,
      );
    }

    const finalStatus = vacantBerth.error ? 'failed' : 'success';
    this.logger.log(
      `[service2/check] step=return ${baseCtx} status=${finalStatus} vacantBerthError=${vacantBerth.error ?? 'none'} hasOpenAiSummary=${Boolean(openAiSummary)}`,
    );

    return {
      status: finalStatus,
      composition: compositionPayload,
      chartPreparationDetails,
      vacantBerth: { vbd: [], error: null },
      openAiSummary,
      openAiStructuredSeats: resultOpenAiStructuredSeats,
      openAiBookingPlan: resultOpenAiBookingPlan,
      openAiTotalPrice: resultOpenAiTotalPrice,
      trainSchedule: trainSchedule ?? undefined,
    };
  }
}

function toStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  return '';
}

function parseOpenAIStructuredResponse(raw: string): {
  summary?: string;
  seats?: OpenAIStructuredSeat[];
  booking_plan?: { instruction: string; approx_price: number }[];
  total_price?: number;
} {
  try {
    const obj = JSON.parse(raw) as {
      summary?: string;
      seats?: unknown[];
      booking_plan?: unknown;
      total_price?: unknown;
    };
    const summary =
      typeof obj.summary === 'string' ? obj.summary.trim() : undefined;
    const arr = Array.isArray(obj.seats) ? obj.seats : [];
    const seats: OpenAIStructuredSeat[] = arr
      .filter(
        (s): s is Record<string, unknown> => s != null && typeof s === 'object',
      )
      .map((s) => ({
        coach: toStr(s.coach),
        berth: typeof s.berth === 'number' ? s.berth : toStr(s.berth),
        class: toStr(s.class),
        seat: toStr(s.seat),
        from: toStr(s.from),
        to: toStr(s.to),
      }));
    const booking_plan = Array.isArray(obj.booking_plan)
      ? obj.booking_plan
          .filter(
            (x): x is Record<string, unknown> =>
              x != null && typeof x === 'object',
          )
          .map((x) => ({
            instruction: toStr(x.instruction),
            approx_price:
              typeof x.approx_price === 'number' && x.approx_price >= 0
                ? x.approx_price
                : 0,
          }))
      : undefined;
    const total_price =
      typeof obj.total_price === 'number' && obj.total_price >= 0
        ? obj.total_price
        : undefined;
    return { summary, seats, booking_plan, total_price };
  } catch {
    return {};
  }
}

function buildOpenAIUserMessage(ctx: {
  trainNumber: string;
  originStation: string;
  destinationStation: string;
  journeyDate: string;
  classCode: string;
  passengerDetails?: string;
  composition: NonNullable<Service2CheckResult['composition']>;
  chartPreparationDetails:
    | Service2CheckResult['chartPreparationDetails']
    | null;
  vacantBerth: Service2CheckResult['vacantBerth'];
  trainSchedule: TrainScheduleResponse | null;
}): string {
  const chartTimeStr = ctx.chartPreparationDetails
    ? `Chart time for ${ctx.chartPreparationDetails.chartingStationCode}: ${ctx.chartPreparationDetails.firstChartCreationTime} (stored in DB: ${ctx.chartPreparationDetails.storedInDb})`
    : 'Chart preparation time not available for this station.';

  return `Current data from IRCTC APIs:

**User inputs**
- Train number: ${ctx.trainNumber}
- Origin (boarding) station: ${ctx.originStation}
- Destination station: ${ctx.destinationStation}
- Travel date: ${ctx.journeyDate}
${ctx.passengerDetails ? `- Passenger details: ${ctx.passengerDetails}` : ''}

**Train composition**
- Train: ${ctx.composition.trainName} (${ctx.composition.trainNo})
- Route: ${ctx.composition.from} → ${ctx.composition.to}
- Chart date/time: ${ctx.composition.chartOneDate ?? 'N/A'}
- Remote station: ${ctx.composition.remote}, next remote: ${ctx.composition.nextRemote ?? 'N/A'}
- Classes on train: ${ctx.composition.classes.join(', ')}
- ${chartTimeStr}

** Train schedule (from DB: TrainScheduleCache) **
${
  ctx.trainSchedule?.stationList?.length
    ? ctx.trainSchedule.stationList
        .map(
          (s) =>
            `- ${s.stationCode} → ${s.stationName ?? ''}${s.arrivalTime ? ` (arr: ${s.arrivalTime})` : ''}${s.departureTime ? ` (dep: ${s.departureTime})` : ''}`,
        )
        .join('\n')
    : '(schedule not in cache)'
}

**Entire raw vacant berth data (all classes)** — use this complete list to build the "seats" array (keys: coach, berth, class, seat, from, to); do not rely only on the summary above.
\`\`\`json
${JSON.stringify(ctx.vacantBerth.vbd)}
\`\`\`

Apply the algorithm from your instructions. Use:
- Source station: ${ctx.originStation}
- Destination station: ${ctx.destinationStation}
- Consider all classes on the train: ${ctx.composition.classes.join(', ')}. Find the best plan across any class.
- Train route: as listed above in order
- Seat segments: use the entire raw vacant berth JSON above for all classes (coachName, berthNumber, from, to, class)

Return a JSON object with:
- "summary": concise situation summary and recommended next steps based on the algorithm result.
- "seats": array of seat objects with keys coach, berth, class, seat, from, to (from the segments you used in the best plan).
- "booking_plan": array of objects, each with "instruction" (string, format "FROM_STATION - TO_STATION - CLASS") and "approx_price" (number, approximate fare in INR for that segment). Use typical Indian Railways fare rules for the class and distance.
- "total_price": number, total approximate fare for the entire journey in INR (sum of all segment approx_price).`;
}
