import { DateTime } from 'luxon';
import {
  isFilledOpenAiPlanItem,
  routeConsecutiveLegsForJourney,
  type OpenAiBookingPlanItem,
  type Service2CheckResult,
} from '../service2/service2.service';
import type { ScheduleStation } from '../irctc/irctc.service';
import { irctcBookingRedirect } from '../common/irctc-booking-redirect';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export type JourneyLegCoverage =
  | {
      type: 'ticket';
      ticketIndex: number;
      instruction: string;
      approxPrice?: number;
      availability?: string;
      fromCode: string;
      toCode: string;
    }
  | {
      type: 'no_ticket';
      fromCode: string;
      toCode: string;
    };

/** Only notify when there is at least one bookable segment (matches email CTA rows). */
export function hasBookablePlanForNotification(
  result: Pick<Service2CheckResult, 'openAiBookingPlan'>,
): boolean {
  const plan = result.openAiBookingPlan ?? [];
  return plan.some(isFilledOpenAiPlanItem);
}

/**
 * Normalize mobile numbers to Indian E.164 format (e.g. 919999224767).
 * Handles:
 * - 10 digits: "9712640278" -> "919712640278"
 * - Leading zeroes: "09712640278" or "009712640278" -> "919712640278"
 * - Country code with 0: "+91 09712640278" or "9109712640278" -> "919712640278"
 * - Country code: "+91 9712640278" or "919712640278" -> "919712640278"
 */
export function normalizeE164Mobile(phone: string): string {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('910') && digits.length === 13) {
    digits = `91${digits.slice(3)}`;
  }

  digits = digits.replace(/^0+/, '');

  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  return digits;
}

export function ordinalEnglish(day: number): string {
  const j = day % 10;
  const k = day % 100;
  if (j === 1 && k !== 11) return `${day}st`;
  if (j === 2 && k !== 12) return `${day}nd`;
  if (j === 3 && k !== 13) return `${day}rd`;
  return `${day}th`;
}

/** e.g. Fri, 2nd April (calendar date in Asia/Kolkata). */
export function formatJourneyDateReadable(ymd: string): string {
  const raw = ymd.trim().slice(0, 10);
  const dt = DateTime.fromISO(raw, { zone: 'Asia/Kolkata' });
  if (!dt.isValid) return raw;
  const weekday = dt.toFormat('ccc');
  const month = dt.toFormat('LLLL');
  return `${weekday}, ${ordinalEnglish(dt.day)} ${month}`;
}

export function normalizeIrctcTimeDisplay(t: unknown): string {
  if (t == null) return '';
  const s = typeof t === 'string' ? t.trim() : String(t as any).trim();
  if (!s || s === 'undefined' || s === 'null') return '';
  if (/^\d{4}$/.test(s)) return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
  return s;
}

export function findScheduleRow(
  stationList: ScheduleStation[] | undefined,
  code: string,
): ScheduleStation | undefined {
  const c = code.trim().toUpperCase();
  if (!c || !Array.isArray(stationList)) return undefined;
  return stationList.find(
    (s) =>
      String(s.stationCode ?? '')
        .trim()
        .toUpperCase() === c,
  );
}

/** Departure-ish time at origin leg (prefer departure, then arrival). */
export function departureTimeAtStation(
  row: ScheduleStation | undefined,
): string {
  if (!row) return '';
  const dep = normalizeIrctcTimeDisplay(row.departureTime);
  if (dep) return dep;
  return normalizeIrctcTimeDisplay(row.arrivalTime);
}

/** Arrival-ish time at destination leg (prefer arrival, then departure). */
export function arrivalTimeAtStation(row: ScheduleStation | undefined): string {
  if (!row) return '';
  const arr = normalizeIrctcTimeDisplay(row.arrivalTime);
  if (arr) return arr;
  return normalizeIrctcTimeDisplay(row.departureTime);
}

/** One line: Dep FROM: hh:mm · Arr TO: hh:mm (omits missing parts). */
export function formatSegmentScheduleTimes(
  stationList: ScheduleStation[] | undefined,
  fromCode: string,
  toCode: string,
): string {
  const fromRow = findScheduleRow(stationList, fromCode);
  const toRow = findScheduleRow(stationList, toCode);
  const dep = departureTimeAtStation(fromRow);
  const arr = arrivalTimeAtStation(toRow);
  const parts: string[] = [];
  if (dep) {
    parts.push(`Dep ${fromCode.trim().toUpperCase()}: ${dep}`);
  }
  if (arr) {
    parts.push(`Arr ${toCode.trim().toUpperCase()}: ${arr}`);
  }
  return parts.join(' · ');
}

export function formatChartTimeIst(
  journeyDateYmd: string,
  timeStr: string,
  dayOffset: number = 0,
): { label: string; formattedTime: string; isReleased: boolean } | null {
  const ymd = journeyDateYmd.slice(0, 10);
  const normalizedTime = normalizeIrctcTimeDisplay(timeStr);
  const match = normalizedTime.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || !match) return null;
  const hh = match[1].padStart(2, '0');
  const mm = match[2].padStart(2, '0');

  const [y, m, d] = ymd.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d + dayOffset));
  const targetYmd = dateObj.toISOString().slice(0, 10);

  const istIso = `${targetYmd}T${hh}:${mm}:00+05:30`;
  const targetMs = new Date(istIso).getTime();
  if (isNaN(targetMs)) return null;

  const isReleased = Date.now() > targetMs;

  const formatterDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const formatterTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const dateParts = formatterDate.format(new Date(targetMs));
  const timeParts = formatterTime.format(new Date(targetMs));
  const formattedTime = `${dateParts} at ${timeParts}`;

  return {
    label: isReleased
      ? `Chart for station was released at ${formattedTime}`
      : `Chart prepares at ${formattedTime}`,
    formattedTime,
    isReleased,
  };
}

/** Build IRCTC redirect URL for from/to/train/class. */
export function buildIrctcUrl(task: {
  fromStationCode: string;
  toStationCode: string;
  trainNumber: string;
  classCode?: string | null;
}): string {
  return irctcBookingRedirect({
    from: task.fromStationCode,
    to: task.toStationCode,
    trainNo: task.trainNumber,
    classCode: task.classCode,
  });
}

/** Build IRCTC URL for a segment from instruction "FROM - TO - CLASS". */
export function buildSegmentBookUrl(
  trainNumber: string,
  instruction: string | undefined | null,
): string {
  if (!instruction?.trim()) {
    return 'https://www.irctc.co.in/eticketing/login';
  }
  const parts = instruction.split(' - ').map((p) => p.trim());
  const origin = parts[0] ?? '';
  const destination = parts[1] ?? '';
  const classCode = parts[2] ?? '3A';
  if (!origin || !destination) {
    return 'https://www.irctc.co.in/eticketing/login';
  }
  return irctcBookingRedirect({
    from: origin,
    to: destination,
    trainNo: trainNumber,
    classCode,
  });
}

export function firstPlannedClassCode(
  result?: Service2CheckResult,
): string | undefined {
  if (!result) return undefined;
  const filled = result.openAiBookingPlan?.find(isFilledOpenAiPlanItem);
  const instruction = filled?.instruction ?? '';
  const parts = instruction.split(' - ').map((p) => p.trim());
  return parts[2] || undefined;
}

/** Format segment for display: "CODE - Name (hh:mm) → CODE - Name (hh:mm)" using station names and times when available. */
export function formatSegmentRoute(
  instruction: string | undefined | null,
  stationNameMap: Map<string, string>,
  stationScheduleList?: ScheduleStation[],
): string {
  if (!instruction?.trim()) {
    return '';
  }
  const parts = instruction.split(' - ').map((p) => p.trim());
  const fromCode = parts[0] ?? '';
  const toCode = parts[1] ?? '';
  const fromName = stationNameMap.get(fromCode.toUpperCase()) ?? fromCode;
  const toName = stationNameMap.get(toCode.toUpperCase()) ?? toCode;

  const fromRow = findScheduleRow(stationScheduleList, fromCode);
  const toRow = findScheduleRow(stationScheduleList, toCode);
  const depTime = departureTimeAtStation(fromRow);
  const arrTime = arrivalTimeAtStation(toRow);

  const fromDisplay = depTime
    ? `${fromCode} - ${fromName} (${depTime})`
    : `${fromCode} - ${fromName}`;
  const toDisplay = arrTime
    ? `${toCode} - ${toName} (${arrTime})`
    : `${toCode} - ${toName}`;

  return `${fromDisplay} → ${toDisplay}`;
}

/** Format top-level route for email header using full station names and schedule times in brackets when available. */
export function formatJourneyRoute(
  fromCode: string,
  toCode: string,
  stationNameMap: Map<string, string>,
  stationScheduleList?: ScheduleStation[],
): string {
  const fromName =
    stationNameMap.get(fromCode.trim().toUpperCase()) ?? fromCode;
  const toName = stationNameMap.get(toCode.trim().toUpperCase()) ?? toCode;

  const fromRow = findScheduleRow(stationScheduleList, fromCode);
  const toRow = findScheduleRow(stationScheduleList, toCode);
  const depTime = departureTimeAtStation(fromRow);
  const arrTime = arrivalTimeAtStation(toRow);

  const fromDisplay = depTime ? `${fromName} (${depTime})` : fromName;
  const toDisplay = arrTime ? `${toName} (${arrTime})` : toName;

  return `${fromDisplay} → ${toDisplay}`;
}

/** Build station code -> name map from train schedule (for UI-style segment labels). */
export function getStationNameMap(
  stationList?: Array<{ stationCode?: string; stationName?: string }>,
): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(stationList)) return map;
  for (const s of stationList) {
    const code = String(s.stationCode ?? '')
      .trim()
      .toUpperCase();
    const name = String(s.stationName ?? '').trim();
    if (code && name) map.set(code, name);
  }
  return map;
}

export function extractJourneyLegCoverage(params: {
  fromStationCode: string;
  toStationCode: string;
  plan: OpenAiBookingPlanItem[];
  stationScheduleList?: ScheduleStation[];
}): JourneyLegCoverage[] {
  const { fromStationCode, toStationCode, plan, stationScheduleList } =
    params;
  const fromU = fromStationCode.trim().toUpperCase();
  const toU = toStationCode.trim().toUpperCase();
  const filledPlan = plan.filter(isFilledOpenAiPlanItem);

  if (filledPlan.length === 0) {
    return [{ type: 'no_ticket', fromCode: fromU, toCode: toU }];
  }

  const routeLegs = routeConsecutiveLegsForJourney(
    stationScheduleList
      ? {
          trainNumber: '',
          trainName: '',
          stationFrom: '',
          stationTo: '',
          stationList: stationScheduleList,
        }
      : null,
    fromU,
    toU,
  );

  if (routeLegs.length > 0) {
    const routeStations = [routeLegs[0].from, ...routeLegs.map((l) => l.to)];
    const stationIndex = new Map(routeStations.map((c, i) => [c, i]));

    const legCoveredByTicket: (
      | {
          ticketIndex: number;
          item: {
            instruction: string;
            approx_price: number;
            availability?: string;
          };
        }
      | undefined
    )[] = Array.from({ length: routeLegs.length });

    filledPlan.forEach((item, idx) => {
      const parts = item.instruction
        .split(' - ')
        .map((p) => p.trim().toUpperCase());
      const segFrom = parts[0] ?? '';
      const segTo = parts[1] ?? '';
      const startIdx = stationIndex.get(segFrom);
      const endIdx = stationIndex.get(segTo);
      if (startIdx != null && endIdx != null && startIdx < endIdx) {
        for (let k = startIdx; k < endIdx; k++) {
          if (k < routeLegs.length) {
            legCoveredByTicket[k] = { ticketIndex: idx + 1, item };
          }
        }
      }
    });

    const result: JourneyLegCoverage[] = [];
    let i = 0;
    while (i < routeLegs.length) {
      const cov = legCoveredByTicket[i];
      if (cov) {
        const ticketIndex = cov.ticketIndex;
        const instruction = cov.item.instruction;
        const approxPrice = cov.item.approx_price;
        const availability = cov.item.availability;
        const startFrom = routeLegs[i].from;
        let endTo = routeLegs[i].to;
        while (
          i + 1 < routeLegs.length &&
          legCoveredByTicket[i + 1]?.ticketIndex === ticketIndex
        ) {
          i++;
          endTo = routeLegs[i].to;
        }
        result.push({
          type: 'ticket',
          ticketIndex,
          instruction,
          approxPrice,
          availability,
          fromCode: startFrom,
          toCode: endTo,
        });
      } else {
        const startFrom = routeLegs[i].from;
        let endTo = routeLegs[i].to;
        while (i + 1 < routeLegs.length && !legCoveredByTicket[i + 1]) {
          i++;
          endTo = routeLegs[i].to;
        }
        result.push({
          type: 'no_ticket',
          fromCode: startFrom,
          toCode: endTo,
        });
      }
      i++;
    }
    return result;
  }

  const result: JourneyLegCoverage[] = [];
  let currentStation = fromU;

  filledPlan.forEach((item, idx) => {
    const parts = item.instruction
      .split(' - ')
      .map((p) => p.trim().toUpperCase());
    const segFrom = parts[0] ?? '';
    const segTo = parts[1] ?? '';

    if (segFrom && segFrom !== currentStation) {
      result.push({
        type: 'no_ticket',
        fromCode: currentStation,
        toCode: segFrom,
      });
    }

    result.push({
      type: 'ticket',
      ticketIndex: idx + 1,
      instruction: item.instruction,
      approxPrice: item.approx_price,
      availability: item.availability,
      fromCode: segFrom || currentStation,
      toCode: segTo || toU,
    });

    if (segTo) {
      currentStation = segTo;
    }
  });

  if (currentStation !== toU) {
    result.push({
      type: 'no_ticket',
      fromCode: currentStation,
      toCode: toU,
    });
  }

  return result;
}
