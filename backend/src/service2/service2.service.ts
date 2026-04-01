import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
import type { ReasoningEffort } from 'openai/resources/shared';
import { IrctcService } from '../irctc/irctc.service';
import type { TrainScheduleResponse } from '../irctc/irctc.service';
import { ChartTimeService } from '../chart-time/chart-time.service';

function toStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  return '';
}

export type OpenAIStructuredSeat = {
  coach: string;
  berth: string | number;
  class: string;
  seat: string;
  from: string;
  to: string;
};

/** One route leg slot: either a bookable segment or an empty object when no ticket. */
export type OpenAiBookingPlanItem =
  | { instruction: string; approx_price: number }
  | Record<string, never>;

export function isFilledOpenAiPlanItem(
  item: OpenAiBookingPlanItem | undefined | null,
): item is { instruction: string; approx_price: number } {
  if (item == null || typeof item !== 'object') return false;
  if (Object.keys(item).length === 0) return false;
  const instruction = String(
    (item as { instruction?: unknown }).instruction ?? '',
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
    .map((s) => String(s.stationCode ?? '').trim().toUpperCase())
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

function isRawBookingPlanSlotEmpty(raw: unknown): boolean {
  if (raw == null) return true;
  if (typeof raw !== 'object') return true;
  if (Object.keys(raw as object).length === 0) return true;
  const rec = raw as Record<string, unknown>;
  const instruction = toStr(rec.instruction).trim();
  if (instruction.length > 0) return false;
  return true;
}

function normalizeCompactBookingPlan(
  plan: unknown[] | undefined,
): OpenAiBookingPlanItem[] {
  if (!Array.isArray(plan) || plan.length === 0) return [];
  const out: OpenAiBookingPlanItem[] = [];
  for (const raw of plan) {
    if (isRawBookingPlanSlotEmpty(raw)) continue;
    const rec = raw as Record<string, unknown>;
    const instruction = toStr(rec.instruction).trim();
    const approx_price =
      typeof rec.approx_price === 'number' && rec.approx_price >= 0
        ? rec.approx_price
        : 0;
    if (instruction) out.push({ instruction, approx_price });
  }
  return out;
}

function routeStationsFromLegs(
  routeLegs: { from: string; to: string }[],
): string[] {
  if (routeLegs.length === 0) return [];
  return [routeLegs[0].from, ...routeLegs.map((leg) => leg.to)];
}

function compactPlanFullyCoversRoute(
  plan: OpenAiBookingPlanItem[],
  routeLegs: { from: string; to: string }[],
): boolean {
  if (plan.length === 0 || routeLegs.length === 0) return false;
  const routeStations = routeStationsFromLegs(routeLegs);
  const routeIndex = new Map(routeStations.map((code, i) => [code, i]));
  let current = routeStations[0];
  const destination = routeStations[routeStations.length - 1];

  for (const item of plan) {
    if (!isFilledOpenAiPlanItem(item)) return false;
    const ends = parseInstructionEndpoints(item.instruction);
    if (!ends) return false;
    const fromIdx = routeIndex.get(ends.from);
    const toIdx = routeIndex.get(ends.to);
    const currentIdx = routeIndex.get(current);
    if (
      fromIdx == null ||
      toIdx == null ||
      currentIdx == null ||
      fromIdx !== currentIdx ||
      toIdx <= fromIdx
    ) {
      return false;
    }
    current = ends.to;
  }

  return current === destination;
}

/**
 * Furthest station code toward `finalDestination` reached by any filled ticket
 * in `plan` (by route order). Returns null if nothing booked or already at destination.
 */
function furthestTicketDestinationTowardGoal(
  plan: OpenAiBookingPlanItem[] | undefined,
  routeLegs: { from: string; to: string }[],
  finalDestination: string,
): string | null {
  if (!plan?.length || !routeLegs.length) return null;
  const routeStations = routeStationsFromLegs(routeLegs);
  const idx = new Map(routeStations.map((c, i) => [c.toUpperCase(), i]));
  const destU = finalDestination.trim().toUpperCase();
  const destI = idx.get(destU);
  if (destI == null) return null;

  let bestIdx = -1;
  for (const item of plan) {
    if (!isFilledOpenAiPlanItem(item)) continue;
    const ends = parseInstructionEndpoints(item.instruction);
    if (!ends) continue;
    const t = idx.get(ends.to);
    if (t != null && t > bestIdx && t <= destI) bestIdx = t;
  }
  if (bestIdx < 0) return null;
  if (bestIdx >= destI) return null;
  return routeStations[bestIdx];
}

/**
 * Next boarding station for a vacant-berth fetch: prefer `furthest` (end of last
 * booked ticket). If we already fetched from there, walk forward along the route
 * (e.g. RTM → NAD) so we can discover onward availability without getting stuck
 * when the model still ends at the same station.
 */
function resolveNextVacantBerthBoarding(
  furthest: string,
  routeLegs: { from: string; to: string }[],
  planDestinationStation: string,
  fetchedBoardings: Set<string>,
): string | null {
  const routeStations = routeStationsFromLegs(routeLegs);
  if (routeStations.length < 2) return null;
  const idxMap = new Map(
    routeStations.map((c, i) => [c.trim().toUpperCase(), i]),
  );
  const destU = planDestinationStation.trim().toUpperCase();
  const destI = idxMap.get(destU);
  if (destI == null) return null;

  let candidateU = furthest.trim().toUpperCase();
  const maxSteps = routeStations.length + 2;
  for (let step = 0; step < maxSteps; step++) {
    const ci = idxMap.get(candidateU);
    if (ci == null) return null;
    if (ci >= destI) return null;
    if (!fetchedBoardings.has(candidateU)) {
      return routeStations[ci];
    }
    const nextI = ci + 1;
    if (nextI >= routeStations.length || nextI > destI) return null;
    candidateU = routeStations[nextI].trim().toUpperCase();
  }
  return null;
}

/**
 * Align model output to route legs: correct length, {} for empty slots.
 * When schedule legs are unknown, returns only filled segments (legacy shape).
 */
function normalizeBookingPlanToRouteLegs(
  plan: unknown[] | undefined,
  routeLegs: { from: string; to: string }[],
): OpenAiBookingPlanItem[] {
  const compactPlan = normalizeCompactBookingPlan(plan);
  if (routeLegs.length === 0) return compactPlan;
  if (compactPlanFullyCoversRoute(compactPlan, routeLegs)) return compactPlan;

  const n = routeLegs.length;
  const out: OpenAiBookingPlanItem[] = [];
  for (let i = 0; i < n; i++) {
    const raw = Array.isArray(plan) ? plan[i] : undefined;
    if (isRawBookingPlanSlotEmpty(raw)) {
      out.push({});
      continue;
    }
    const rec = raw as Record<string, unknown>;
    const instruction = toStr(rec.instruction).trim();
    const approx_price =
      typeof rec.approx_price === 'number' && rec.approx_price >= 0
        ? rec.approx_price
        : 0;
    if (!instruction) {
      out.push({});
      continue;
    }
    out.push({ instruction, approx_price });
  }
  return out;
}

function sumFilledPlanPrices(plan: OpenAiBookingPlanItem[]): number {
  let s = 0;
  for (const item of plan) {
    if (isFilledOpenAiPlanItem(item)) s += item.approx_price ?? 0;
  }
  return s;
}

/** Parse "FROM - TO - CLASS" → endpoints (station codes uppercased). */
function parseInstructionEndpoints(
  instruction: string,
): { from: string; to: string } | null {
  const parts = instruction.split(' - ').map((p) => p.trim());
  if (parts.length < 3) return null;
  const from = parts[0].toUpperCase();
  const to = parts[1].toUpperCase();
  if (!from || !to) return null;
  return { from, to };
}

/** Same physical ticket on consecutive route-leg slots (model mistake) → merge fares, keep {} on repeats. */
function instructionDedupeKey(instruction: string): string | null {
  const ends = parseInstructionEndpoints(instruction);
  if (!ends) return null;
  const parts = instruction.split(' - ').map((p) => p.trim());
  const cls = (parts[2] ?? '').toUpperCase().replace(/\s+/g, '');
  return `${ends.from}|${ends.to}|${cls}`;
}

function collapseConsecutiveDuplicateBookingInstructions(
  plan: OpenAiBookingPlanItem[],
): OpenAiBookingPlanItem[] {
  if (plan.length === 0) return plan;
  const out: OpenAiBookingPlanItem[] = plan.map((item) =>
    isFilledOpenAiPlanItem(item) ? { ...item } : {},
  );
  let i = 0;
  while (i < out.length) {
    if (!isFilledOpenAiPlanItem(out[i])) {
      i++;
      continue;
    }
    const key = instructionDedupeKey(out[i].instruction);
    if (key == null) {
      i++;
      continue;
    }
    let sum = out[i].approx_price ?? 0;
    let j = i + 1;
    while (j < out.length) {
      if (!isFilledOpenAiPlanItem(out[j])) break;
      const keyJ = instructionDedupeKey(out[j].instruction);
      if (keyJ !== key) break;
      sum += out[j].approx_price ?? 0;
      out[j] = {};
      j++;
    }
    if (j > i + 1) {
      out[i] = { instruction: out[i].instruction, approx_price: sum };
    }
    i = j;
  }
  return out;
}

/**
 * When the model repeats the same boarding→destination ticket on every route leg
 * (with bogus zeros / bad totals), collapse to one bookable segment for the UI.
 */
function collapseFullJourneySingleTicketLegs(
  plan: OpenAiBookingPlanItem[],
  routeLegs: { from: string; to: string }[],
  boardingStation: string,
  destinationStation: string,
  modelTotalPrice: number | undefined,
): { plan: OpenAiBookingPlanItem[]; collapsed: boolean } {
  if (routeLegs.length === 0 || plan.length !== routeLegs.length) {
    return { plan, collapsed: false };
  }

  const board = boardingStation.trim().toUpperCase();
  const dest = destinationStation.trim().toUpperCase();
  if (
    routeLegs[0].from !== board ||
    routeLegs[routeLegs.length - 1].to !== dest
  ) {
    return { plan, collapsed: false };
  }

  let commonInstruction: string | null = null;
  for (const item of plan) {
    if (!isFilledOpenAiPlanItem(item)) {
      return { plan, collapsed: false };
    }
    const instr = item.instruction.trim();
    if (commonInstruction === null) commonInstruction = instr;
    else if (commonInstruction !== instr) {
      return { plan, collapsed: false };
    }
  }
  if (!commonInstruction) return { plan, collapsed: false };

  const ends = parseInstructionEndpoints(commonInstruction);
  if (!ends || ends.from !== board || ends.to !== dest) {
    return { plan, collapsed: false };
  }

  const summed = sumFilledPlanPrices(plan);
  const modelP =
    typeof modelTotalPrice === 'number' && modelTotalPrice > 0
      ? modelTotalPrice
      : 0;
  const price = Math.max(summed, modelP);

  return {
    plan: [{ instruction: commonInstruction, approx_price: price }],
    collapsed: true,
  };
}

/** Remove unnecessary TTE line when we know the journey is fully covered. */
function scrubErroneousTteFromFullJourneySummary(summary: string): string {
  const stripped = summary
    .replace(/\s*\.?\s*Speak to the TTE to figure out a space\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length > 0 ? stripped : summary;
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
  /**
   * One entry per consecutive schedule leg from boarding to destination (aligned with route).
   * Booked leg: { instruction, approx_price }. No ticket for that leg: {}.
   */
  openAiBookingPlan?: OpenAiBookingPlanItem[];
  /** Total approximate fare for the journey in INR. */
  openAiTotalPrice?: number;
  /** Train schedule (station list with times) for UI to show dep/arr times. */
  trainSchedule?: TrainScheduleResponse | null;
  /** When chart is not yet prepared or composition returned "Chart not prepared". */
  chartStatus?:
    | { kind: 'not_prepared_yet'; message: string }
    | { kind: 'chart_error'; error: string }
    | { kind: 'irctc_unavailable'; message: string; detail?: string };
};

/** User-facing copy when IRCTC schedule API returns maintenance / downtime. */
const IRCTC_RESERVATIONS_BLOCKED_MESSAGE =
  'IRCTC is temporarily blocking reservations (for example during daily maintenance), so we cannot look up tickets for you right now. Please come back a little later.';

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

Step 4: Generate Possible Journey Paths (including partial journeys)
Start from the source (boarding) station index.

Partial journeys are required when no combination of vacant segments covers the full route from source to destination. You must still return the **best forward chain** that starts at the boarding station: only segments whose **from** station equals the current position in the chain (the end of the previous segment, or the boarding station for the first ticket). Do not skip ahead to book only from an intermediate station—the first booked segment must originate at the user's boarding station.

At each step after the first segment:
- The next segment's **from** station must match the previous segment's **to** station (same station code as on the train route).
- Find vacant segments that extend the journey forward along the route (toIndex > fromIndex, within source..destination bounds).

Repeat until:
- The destination station is reached, or
- No vacant segment continues the chain from the current station.

Each chain of segments forms a possible journey plan. A plan that stops before the destination is valid and must be returned if it is the best such chain.

Example (order for train 12951; use the actual schedule from the user message when provided): SURAT (ST) → VADODARA JN (BRC) → RATLAM JN (RTM) → NAGDA JN (NAD) → KOTA JN (KOTA) with typical halts (e.g. ST 19:43–19:48, BRC 21:06–21:16, RTM 00:25–00:28, NAD 01:08–01:10, KOTA 03:15–03:20). If there is no vacant segment ST→KOTA but there is ST→BRC and BRC→RTM, the plan must include those two tickets and then explain the remainder (see Step 8).

Step 5: Scoring and Prioritization
Score each journey plan using the following priorities (from highest to lowest importance).

Priority 1 — Reach furthest toward destination
Among valid chains starting at the boarding station, prefer the one whose last segment's **to** station has the **highest route index** (gets closest to the destination). If one plan reaches the destination and another does not, the full journey wins.

Priority 2 — Longest individual segments
Prefer segments that cover the largest distance toward the destination when breaking ties.

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

- Reaches the furthest point toward the destination (or the destination itself if possible)
- Uses the fewest tickets when tied on coverage
- Maintains seat continuity when possible
- Maintains coach continuity when possible
- Keeps the class type consistent when possible
- Minimizes coach movement if a change is required

Step 7: No usable vacant segments (strict output)
If **no** vacant segment in the data can form even the first leg from the boarding station toward the destination (after Step 3 filtering), you must **not** invent tickets. Set:
- summary (exact string): Sorry, we couldn't find any tickets, try some other train
- seats: []
- booking_plan: an array with **exactly one entry per consecutive route leg** listed under "Route legs for this journey" in the user message — use **only empty JSON objects** (open brace + close brace, no keys) for every leg
- total_price: 0

Step 8: Gaps and unreserved portions
If **every** part of the route from boarding station to requested destination is **fully covered** by your chosen vacant segment(s) (e.g. one ticket from boarding to destination), you must **not** mention the TTE or any unreserved gap — there is no gap.

Only for route portions that are **actually not** covered by your plan, tell the user they should: **Speak to the TTE to figure out a space** (exact sentence for those gaps only). Between two booked segments there is no gap if the first segment's **to** equals the second's **from**.

If there is no full journey ticket but partial tickets exist, explain the partial bookings and include the TTE sentence **only** for uncovered legs along the route to destination.

Step 9: Output Format (booking instructions)
Return the booking plan as a list of instructions:

Source - Destination - Class

Example (full journey):

NDLS - SBIB - 1AC

Example (multiple tickets):

NDLS - JP - 2AC
FA - ABR - 3AC
ABR - SBIB - 2AC

---

Given the provided train route, source, destination, and raw seat segment data (vacant berths across classes), apply this algorithm. Consider all classes on the train when building the best plan.

Summary rules:
- If Step 7 applies, use only the exact summary string given there.
- Otherwise: short, friendly, action-oriented—just say what tickets to book. Include **Speak to the TTE to figure out a space** **only** if Step 8 says there is an uncovered gap. Do not add any extra sentence explaining that there is no gap.

**Step 10: Build booking_plan from the chosen plan**

Do **not** re-run or change scoring from Steps 4–6. After the best plan is fixed:

- If your chosen plan **fully covers** the journey from boarding station to destination, return **only the actual booked tickets** in order: one object per real ticket, no duplicates, no per-leg repetition, no empty objects.
- Only if your chosen plan does **not** fully cover the journey, use the route-leg mapping rules below for partial coverage / gaps.

For each consecutive route leg (local stations **A→B** along the route):

1. **Coverage:** A chosen vacant segment **covers** leg A→B if, on the route index line, that segment’s from ≤ A and segment’s to ≥ B (the segment’s interval fully contains the leg).

2. **If covered:** emit \`{ "instruction": "FROM - TO - CLASS", "approx_price": <number> }\`.
   - **instruction** is the **actual ticket** you book for that vacant segment — usually the segment’s own endpoints and class (e.g. **ST - KOTA - 3AC**), **not** rewritten as A - B unless the ticket is only for that short leg.
   - **approx_price:** A single ticket has **one** total fare **P** in INR. If that ticket spans **k** consecutive schedule legs (many **A→B** micro-hops under one IRCTC ticket), you must **not** emit **k** filled objects with the same **instruction** — that breaks the product UI. Use **exactly one** of:
     - **Required for multi-hop tickets:** Put **P** (or your prorated shares that sum to **P**) on the **first** micro-leg that ticket covers, and emit **{}** (empty object) on **every following** micro-leg until that ticket ends. **Never** repeat the same **FROM - TO - CLASS** instruction on two **consecutive** array positions.
     - **Optional:** Split **P** across the **k** legs with **different** per-leg instructions only if they are genuinely different tickets (they are not).

3. **If not covered** by any chosen segment: emit **{}** (empty object). This rule is for partial journeys only; do not use \`{}\` when the journey is fully covered.

4. **total_price** must equal the sum of **distinct ticket fares** in your chosen plan (one **P** per physical ticket), and must also equal the **sum of all approx_price values** in **booking_plan** (every rupee allocated exactly once across legs).

5. **Never** return **all zeros** for **approx_price** and **total_price** when at least one route leg is covered by a real ticket — estimate a realistic total in INR for that ticket (or class/distance), put **total_price** to that estimate, and allocate per Step 10 (e.g. first covered leg = full estimate, others 0 for that ticket).

Return your summary, the list of seat segments used (as the "seats" array with coach, berth, class, seat, from, to), booking_plan as above, and total price (in INR), as specified in the JSON schema.`;

/** JSON schema: summary, seats, booking_plan (instruction + approx_price per segment), total_price (INR). */
const OPENAI_RESPONSE_JSON_SCHEMA = {
  type: 'object' as const,
  properties: {
    summary: {
      type: 'string',
      description:
        'If no vacant segment can start from the boarding station, set exactly: Sorry, we couldn\'t find any tickets, try some other train. Otherwise: concise booking guidance. Mention Speak to the TTE to figure out a space only for genuinely uncovered gaps. Do not add extra no-gap commentary.',
    },
    seats: {
      type: 'array',
      description:
        'Seat segments with coach, berth, class, seat, from, to in order for the chosen plan. Empty array if summary is the no-tickets message.',
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
        'If the journey is fully covered, return only actual booked tickets in order (one object per real ticket, no duplicates, no {}). If the journey is partial, use one element per schedule micro-leg in order. For one physical ticket spanning several micro-legs: only the first micro-leg may be a filled object; use {} on subsequent micro-legs under that ticket. Never repeat the same instruction on consecutive indices.',
      items: {
        anyOf: [
          {
            type: 'object',
            properties: {
              instruction: {
                type: 'string',
                description:
                  'IRCTC ticket line for the covering segment: "FROM_STATION - TO_STATION - CLASS" (ticket endpoints, not necessarily this leg’s A-B)',
              },
              approx_price: {
                type: 'number',
                description:
                  'INR share of that ticket’s fare for this route leg; sum across all legs equals sum of distinct ticket fares',
              },
            },
            required: ['instruction', 'approx_price'],
            additionalProperties: false,
          },
          {
            type: 'object',
            description: 'No ticket for this leg',
            properties: {},
            additionalProperties: false,
          },
        ],
      },
    },
    total_price: {
      type: 'number',
      description:
        'Total INR for all distinct tickets in the plan; must equal sum of booking_plan approx_price (each ticket counted once via proration)',
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

/** Parse IRCTC "YYYY-MM-DD HH:MM[:SS]" as an IST instant. */
function parseIrctcDateTimeIst(
  value: string | null | undefined,
): Date | null {
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
  /** Fired after IRCTC vacant-berth data has been collected, before any OpenAI call. */
  onIrctcDataReady?: (info: {
    vacantSegmentCount: number;
    vacantBerthApiError: string | null;
    destinationStation: string;
  }) => void;
  /** Fired immediately before the OpenAI request (only when an API key is configured). */
  onAiStarted?: (info: { destinationStation: string }) => void;
  /**
   * First-pass OpenAI result when the plan does not yet reach the user's destination
   * and a chained vacant-berth fetch will run from the next station.
   */
  onPartialOpenAiResult?: (info: {
    chainRound: number;
    nextBoardingStation: string;
    openAiSummary: string | null;
    openAiStructuredSeats?: OpenAIStructuredSeat[];
    openAiBookingPlan?: OpenAiBookingPlanItem[];
    openAiTotalPrice?: number;
    composition: NonNullable<Service2CheckResult['composition']>;
    chartPreparationDetails?: Service2CheckResult['chartPreparationDetails'];
    trainSchedule: TrainScheduleResponse | undefined;
  }) => void;
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
    const scheduleResult = await this.irctc.getTrainSchedule(trainNo, {
      fillRunsOnFromComposition: {
        jDate,
        boardingStation,
      },
    });
    if (!scheduleResult.ok && scheduleResult.reason === 'maintenance') {
      this.logger.warn(
        `[service2/check] step=irctc_schedule_maintenance ${baseCtx} irctc=${scheduleResult.message}`,
      );
      return {
        status: 'failed',
        chartStatus: {
          kind: 'irctc_unavailable',
          message: IRCTC_RESERVATIONS_BLOCKED_MESSAGE,
          detail: scheduleResult.message,
        },
        vacantBerth: { vbd: [], error: null },
      };
    }
    const trainSchedule = scheduleResult.ok ? scheduleResult.schedule : null;
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
    const chartTypeForVacantBerth = chartTypeFromComposition(composition);
    const initialRemoteStation = composition.remote ?? boardingStation;
    const trainSourceStation = composition.from ?? boardingStation;
    this.logger.log(
      `[service2/check] step=vacant_berth_setup ${baseCtx} classes=${classes.length} initialRemote=${initialRemoteStation} trainSource=${trainSourceStation} chartType=${chartTypeForVacantBerth} chartTwoDate=${composition.chartTwoDate ?? 'none'} classList=${classes.join(',')}`,
    );
    const allVbd: unknown[] = [];
    const errors: string[] = [];

    const appendVacantBerthRound = async (
      roundBoarding: string,
      roundRemote: string,
      roundLabel: string,
    ) => {
      this.logger.log(
        `[service2/check] step=vacant_berth_round_start ${baseCtx} label=${roundLabel} boarding=${roundBoarding} remote=${roundRemote}`,
      );
      for (const classCode of classes) {
        try {
          this.logger.log(
            `[service2/check] step=vacant_berth_class ${baseCtx} label=${roundLabel} cls=${classCode}`,
          );
          const vbdRes = await this.irctc.getVacantBerth({
            trainNo,
            boardingStation: roundBoarding,
            remoteStation: roundRemote,
            trainSourceStation,
            jDate,
            cls: classCode,
            chartType: chartTypeForVacantBerth,
          });
          const vbdPayload = vbdRes as { vbd?: unknown[]; error?: string | null };
          const vbdList = Array.isArray(vbdPayload?.vbd) ? vbdPayload.vbd : [];
          for (const item of vbdList) {
            allVbd.push(item);
          }
          if (vbdPayload?.error) {
            errors.push(`${roundLabel}/${classCode}: ${vbdPayload.error}`);
          }
          this.logger.log(
            `[service2/check] step=vacant_berth_class_done ${baseCtx} label=${roundLabel} cls=${classCode} segments=${vbdList.length} apiError=${vbdPayload?.error ?? 'none'}`,
          );
        } catch (err) {
          const emsg = err instanceof Error ? err.message : String(err);
          errors.push(`${roundLabel}/${classCode}: ${emsg}`);
          this.logger.error(
            `[service2/check] step=vacant_berth_class_error ${baseCtx} label=${roundLabel} cls=${classCode} ${emsg}`,
            err instanceof Error ? err.stack : undefined,
          );
        }
      }
      this.logger.log(
        `[service2/check] step=vacant_berth_round_done ${baseCtx} label=${roundLabel} totalSegmentsSoFar=${allVbd.length}`,
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

    const planDestinationStation = String(
      destinationStation ?? composition.to ?? boardingStation,
    ).trim();
    const routeLegsForPlan = routeConsecutiveLegsForJourney(
      trainSchedule,
      boardingStation,
      planDestinationStation,
    );
    const boardingStationsFetched = new Set<string>();
    boardingStationsFetched.add(boardingStation.trim().toUpperCase());

    let openAiSummary: string | null = null;
    let resultOpenAiStructuredSeats: OpenAIStructuredSeat[] | undefined;
    let resultOpenAiBookingPlan: OpenAiBookingPlanItem[] | undefined;
    let resultOpenAiTotalPrice: number | undefined;
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey?.trim()) {
      try {
        const chainBoardings: string[] = [];
        const maxOpenAiChain = 12;
        const client = new OpenAI({ apiKey: apiKey.trim() });
        const textVerbosity = openAiTextVerbosity();

        for (let chainAttempt = 1; chainAttempt <= maxOpenAiChain; chainAttempt++) {
          this.logger.log(
            `[service2/check] step=openai_request_start ${baseCtx} chainAttempt=${chainAttempt}/${maxOpenAiChain} model=${process.env.OPENAI_MODEL ?? 'default'}`,
          );
          if (chainAttempt === 1) {
            hooks?.onAiStarted?.({ destinationStation: destForUi });
          }

          vacantBerth = {
            vbd: allVbd,
            error: errors.length > 0 ? errors.join('; ') : null,
          };
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
            vacantBerthChainBoardings:
              chainBoardings.length > 0 ? [...chainBoardings] : undefined,
          });
          this.logger.log(
            `[service2/check] step=openai_user_message_built ${baseCtx} chainAttempt=${chainAttempt} chars=${userMessage.length}`,
          );
          const OPENAI_PROMPT_LOG_MAX = 32_000;
          const instructionsForLog =
            OPENAI_AGENT_PROMPT.length > OPENAI_PROMPT_LOG_MAX
              ? `${OPENAI_AGENT_PROMPT.slice(0, OPENAI_PROMPT_LOG_MAX)}… [truncated, totalChars=${OPENAI_AGENT_PROMPT.length}]`
              : OPENAI_AGENT_PROMPT;
          this.logger.log(
            `[service2/check] step=openai_prompt_instructions ${baseCtx} chars=${OPENAI_AGENT_PROMPT.length} ${instructionsForLog}`,
          );
          const userMessageForLog =
            userMessage.length > OPENAI_PROMPT_LOG_MAX
              ? `${userMessage.slice(0, OPENAI_PROMPT_LOG_MAX)}… [truncated, totalChars=${userMessage.length}]`
              : userMessage;
          this.logger.log(
            `[service2/check] step=openai_prompt_user ${baseCtx} chars=${userMessage.length} ${userMessageForLog}`,
          );

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
                // booking_plan uses anyOf (filled segment vs {}); strict rejects that union
                strict: false,
              },
            },
          });

          const rawContent = response.output_text?.trim();
          this.logger.log(
            `[service2/check] step=openai_response ${baseCtx} chainAttempt=${chainAttempt} outputChars=${rawContent?.length ?? 0} responseId=${(response as { id?: string }).id ?? 'n/a'}`,
          );
          if (!rawContent) {
            this.logger.warn(
              `[service2/check] step=openai_response_body_empty ${baseCtx} chainAttempt=${chainAttempt} responseId=${(response as { id?: string }).id ?? 'n/a'}`,
            );
            break;
          }
          this.logger.log(
            `[service2/check] step=openai_response_output_exact ${baseCtx} chars=${rawContent.length} ${rawContent}`,
          );
          const parsed = parseOpenAIStructuredResponse(rawContent);
          openAiSummary = parsed.summary ?? rawContent;
          if (parsed.seats?.length) {
            resultOpenAiStructuredSeats = parsed.seats;
          }
          if (Array.isArray(parsed.booking_plan)) {
            let normalizedPlan = normalizeBookingPlanToRouteLegs(
              parsed.booking_plan,
              routeLegsForPlan,
            );
            normalizedPlan =
              collapseConsecutiveDuplicateBookingInstructions(normalizedPlan);
            let fullJourneyCollapsed = false;
            if (normalizedPlan.length > 1 && routeLegsForPlan.length > 1) {
              const { plan: collapsed, collapsed: didCollapse } =
                collapseFullJourneySingleTicketLegs(
                  normalizedPlan,
                  routeLegsForPlan,
                  boardingStation,
                  planDestinationStation,
                  parsed.total_price,
                );
              if (didCollapse) {
                normalizedPlan = collapsed;
                fullJourneyCollapsed = true;
              }
            }
            if (normalizedPlan.length > 0) {
              resultOpenAiBookingPlan = normalizedPlan;
              resultOpenAiTotalPrice = sumFilledPlanPrices(normalizedPlan);
            } else {
              resultOpenAiBookingPlan = undefined;
            }
            if (
              fullJourneyCollapsed &&
              typeof openAiSummary === 'string' &&
              openAiSummary.length > 0
            ) {
              openAiSummary =
                scrubErroneousTteFromFullJourneySummary(openAiSummary);
            }
          } else {
            resultOpenAiBookingPlan = undefined;
            if (parsed.total_price != null) {
              resultOpenAiTotalPrice = parsed.total_price;
            }
          }
          this.logger.log(
            `[service2/check] step=openai_parsed ${baseCtx} chainAttempt=${chainAttempt} seats=${parsed.seats?.length ?? 0} bookingPlanRaw=${parsed.booking_plan?.length ?? 0} bookingPlanNorm=${resultOpenAiBookingPlan?.length ?? 0} totalPrice=${resultOpenAiTotalPrice ?? parsed.total_price ?? 'n/a'}`,
          );

          const compactForCover = normalizeCompactBookingPlan(
            resultOpenAiBookingPlan as unknown as unknown[],
          );
          if (
            routeLegsForPlan.length > 0 &&
            compactPlanFullyCoversRoute(compactForCover, routeLegsForPlan)
          ) {
            break;
          }

          const furthest = furthestTicketDestinationTowardGoal(
            resultOpenAiBookingPlan,
            routeLegsForPlan,
            planDestinationStation,
          );
          if (!furthest) {
            break;
          }
          const nextBoarding = resolveNextVacantBerthBoarding(
            furthest,
            routeLegsForPlan,
            planDestinationStation,
            boardingStationsFetched,
          );
          if (!nextBoarding) {
            break;
          }

          hooks?.onPartialOpenAiResult?.({
            chainRound: chainAttempt,
            nextBoardingStation: nextBoarding,
            openAiSummary,
            openAiStructuredSeats: resultOpenAiStructuredSeats,
            openAiBookingPlan: resultOpenAiBookingPlan,
            openAiTotalPrice: resultOpenAiTotalPrice,
            composition: compositionPayload,
            chartPreparationDetails,
            trainSchedule: trainSchedule ?? undefined,
          });

          chainBoardings.push(nextBoarding);
          await appendVacantBerthRound(
            nextBoarding,
            nextBoarding,
            `chain_${nextBoarding}`,
          );
          boardingStationsFetched.add(nextBoarding.trim().toUpperCase());
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

    const hasUsableOpenAiResult =
      Boolean(resultOpenAiStructuredSeats?.length) ||
      Boolean(resultOpenAiBookingPlan?.length) ||
      (typeof openAiSummary === 'string' && openAiSummary.trim().length > 0);
    const finalStatus =
      vacantBerth.error && !hasUsableOpenAiResult ? 'failed' : 'success';
    this.logger.log(
      `[service2/check] step=return ${baseCtx} status=${finalStatus} vacantBerthError=${vacantBerth.error ?? 'none'} hasOpenAiSummary=${Boolean(openAiSummary)} hasUsableOpenAiResult=${hasUsableOpenAiResult}`,
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

function parseOpenAIStructuredResponse(raw: string): {
  summary?: string;
  seats?: OpenAIStructuredSeat[];
  booking_plan?: unknown[];
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
      ? obj.booking_plan.filter(
          (x): x is Record<string, unknown> => x != null && typeof x === 'object',
        )
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
  /** Boarding stations used for extra IRCTC vacant-berth fetches (chained segments). */
  vacantBerthChainBoardings?: string[];
}): string {
  const chartTimeStr = ctx.chartPreparationDetails
    ? `Chart time for ${ctx.chartPreparationDetails.chartingStationCode}: ${ctx.chartPreparationDetails.firstChartCreationTime} (stored in DB: ${ctx.chartPreparationDetails.storedInDb})`
    : 'Chart preparation time not available for this station.';

  const routeLegs = routeConsecutiveLegsForJourney(
    ctx.trainSchedule,
    ctx.originStation,
    ctx.destinationStation,
  );
  const routeLegsBlock =
    routeLegs.length > 0
      ? `**Route legs for this journey** (${routeLegs.length} legs) — \`booking_plan\` MUST be an array of exactly **${routeLegs.length}** elements in this order (index 0 = first leg, etc.):\n${routeLegs
        .map((l, i) => `${i + 1}. ${l.from} → ${l.to}`)
        .join('\n')}`
      : '**Route legs for this journey**: Not derived (boarding/destination not found on cached schedule). Return \`booking_plan\` as a compact array in journey order: only objects \`{ "instruction", "approx_price" }\` for bookable segments (no empty slots required).';

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

${routeLegsBlock}
${
  ctx.vacantBerthChainBoardings?.length
    ? `\n**Vacant berth data sources:** IRCTC was called multiple times with the same train/date/classes; boarding station was advanced to: ${ctx.vacantBerthChainBoardings.join(', ')}. The JSON below is the **concatenation** of all responses.\n`
    : ''
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
- "summary": If no vacant segment starts at the boarding station: exactly "Sorry, we couldn't find any tickets, try some other train". Otherwise: what to book plus for any uncovered leg to destination: "Speak to the TTE to figure out a space".
- "seats": Seat objects from the chosen plan only; [] if no plan.
- "booking_plan": If the journey is fully covered, return only the real booked tickets in order, one object per ticket. If the journey is partial, use **one array slot per schedule micro-leg** (same count as the numbered route legs). For each physical IRCTC ticket that spans several micro-legs: put **one** filled object on the **first** micro-leg only (instruction + approx_price or prorated shares), then **\`{}\`** on each following micro-leg until that ticket ends — **do not** repeat the same instruction on consecutive slots.
- "total_price": Sum of distinct ticket fares; must equal the sum of all \`approx_price\` in \`booking_plan\`.`;
}
