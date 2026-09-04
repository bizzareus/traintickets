import { DateTime } from 'luxon';
import {
  isFilledOpenAiPlanItem,
  type Service2CheckResult,
} from '../service2/service2.service';
import type { ScheduleStation } from '../irctc/irctc.service';

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
