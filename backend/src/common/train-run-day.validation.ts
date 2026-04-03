import type { TrainRunsOnJson } from '../irctc/irctc.service';

/** getDay(): 0 Sun … 6 Sat → IRCTC field names */
const TRAIN_RUNS_ON_BY_GET_DAY = [
  'trainRunsOnSun',
  'trainRunsOnMon',
  'trainRunsOnTue',
  'trainRunsOnWed',
  'trainRunsOnThu',
  'trainRunsOnFri',
  'trainRunsOnSat',
] as const;

const RUN_DAY_ORDER: (keyof TrainRunsOnJson)[] = [
  'trainRunsOnMon',
  'trainRunsOnTue',
  'trainRunsOnWed',
  'trainRunsOnThu',
  'trainRunsOnFri',
  'trainRunsOnSat',
  'trainRunsOnSun',
];

const RUN_KEY_TO_LABEL: Record<string, string> = {
  trainRunsOnMon: 'Monday',
  trainRunsOnTue: 'Tuesday',
  trainRunsOnWed: 'Wednesday',
  trainRunsOnThu: 'Thursday',
  trainRunsOnFri: 'Friday',
  trainRunsOnSat: 'Saturday',
  trainRunsOnSun: 'Sunday',
};

function normalizeRunsOnFlag(v: unknown): 'Y' | 'N' | undefined {
  if (v === 'Y' || v === 'N') return v;
  if (typeof v === 'string') {
    const u = v.trim().toUpperCase();
    if (u === 'Y' || u === 'N') return u;
  }
  return undefined;
}

/** Undefined if date invalid or schedule has no usable run-day data (caller: do not block). */
function getTrainRunsOnFlagForYmd(
  ymd: string,
  runs: TrainRunsOnJson | null | undefined,
): 'Y' | 'N' | undefined {
  if (!runs || Object.keys(runs).length === 0) return undefined;
  const parts = ymd.trim().split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n)))
    return undefined;
  const [y, mo, d] = parts;
  const date = new Date(y, (mo ?? 1) - 1, d ?? 1);
  if (Number.isNaN(date.getTime())) return undefined;
  const key = TRAIN_RUNS_ON_BY_GET_DAY[date.getDay()];
  return normalizeRunsOnFlag(runs[key]);
}

function getTrainRunningDayNames(runs: TrainRunsOnJson): string[] {
  return RUN_DAY_ORDER.filter((k) => normalizeRunsOnFlag(runs[k]) === 'Y').map(
    (k) => RUN_KEY_TO_LABEL[k] ?? String(k),
  );
}

function parseYmdLocal(ymd: string): Date {
  const parts = ymd.trim().slice(0, 10).split('-').map(Number);
  const [y, mo, d] = parts;
  return new Date(y, (mo ?? 1) - 1, d ?? 1);
}

function formatYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatLongDateEnIn(ymd: string): string {
  const d = parseYmdLocal(ymd);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** First calendar date strictly after `fromYmd` on which the train runs (Y). */
function findNextTrainRunYmdAfter(
  fromYmd: string,
  runs: TrainRunsOnJson,
): string | null {
  const cur = parseYmdLocal(fromYmd);
  if (Number.isNaN(cur.getTime())) return null;
  cur.setDate(cur.getDate() + 1);
  for (let i = 0; i < 400; i++) {
    const key = TRAIN_RUNS_ON_BY_GET_DAY[cur.getDay()];
    if (normalizeRunsOnFlag(runs[key]) === 'Y') {
      return formatYmdLocal(cur);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return null;
}

export function parseJourneyYmdForValidation(raw: string): string | null {
  const t = String(raw ?? '')
    .trim()
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [y, mo, d] = t.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return t;
}

export type TrainRunOnDateValidationError = {
  code: string;
  message: string;
  runningDayNames?: string[];
  nextRunDate?: string | null;
  nextRunDayAndDate?: string | null;
  requestedJourneyDate?: string;
};

/**
 * When IRCTC schedule includes weekday flags and the journey date is explicitly a non-run day, returns a structured error.
 * If run-day data is missing or inconclusive, returns null (do not block).
 */
export function getTrainDoesNotRunOnDateError(
  jYmd: string,
  trainRunsOn: TrainRunsOnJson | null | undefined,
): TrainRunOnDateValidationError | null {
  if (
    !trainRunsOn ||
    typeof trainRunsOn !== 'object' ||
    Array.isArray(trainRunsOn) ||
    Object.keys(trainRunsOn).length === 0
  ) {
    return null;
  }
  const flag = getTrainRunsOnFlagForYmd(jYmd, trainRunsOn);
  if (flag !== 'N') return null;
  const runningDayNames = getTrainRunningDayNames(trainRunsOn);
  const nextRunDate = findNextTrainRunYmdAfter(jYmd, trainRunsOn);
  return {
    code: 'TRAIN_DOES_NOT_RUN_ON_DATE',
    message: `This train does not run on ${formatLongDateEnIn(jYmd)}.`,
    runningDayNames,
    nextRunDate,
    nextRunDayAndDate: nextRunDate ? formatLongDateEnIn(nextRunDate) : null,
    requestedJourneyDate: jYmd,
  };
}
