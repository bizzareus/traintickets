/**
 * IRCTC weekday run flags (same shape as backend irctc TrainRunsOnJson).
 * Core parsing matches backend/src/common/train-run-day.validation.ts.
 */
import moment from "moment";

export type TrainRunsOnJson = Partial<
  Record<
    | "trainRunsOnMon"
    | "trainRunsOnTue"
    | "trainRunsOnWed"
    | "trainRunsOnThu"
    | "trainRunsOnFri"
    | "trainRunsOnSat"
    | "trainRunsOnSun",
    string
  >
>;

/** getDay(): 0 Sun … 6 Sat → IRCTC field names */
const TRAIN_RUNS_ON_BY_GET_DAY = [
  "trainRunsOnSun",
  "trainRunsOnMon",
  "trainRunsOnTue",
  "trainRunsOnWed",
  "trainRunsOnThu",
  "trainRunsOnFri",
  "trainRunsOnSat",
] as const;

function normalizeRunsOnFlag(v: unknown): "Y" | "N" | undefined {
  if (v === "Y" || v === "N") return v;
  if (typeof v === "string") {
    const u = v.trim().toUpperCase();
    if (u === "Y" || u === "N") return u;
  }
  return undefined;
}

/** Undefined if date invalid or schedule has no run-day data (do not block). */
export function getTrainRunsOnFlagForYmd(
  ymd: string,
  runs: TrainRunsOnJson | null | undefined,
): "Y" | "N" | undefined {
  if (!runs || Object.keys(runs).length === 0) return undefined;
  const parts = ymd.trim().split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n)))
    return undefined;
  const [y, mo, d] = parts;
  const date = new Date(y, (mo ?? 1) - 1, d ?? 1);
  if (Number.isNaN(date.getTime())) return undefined;
  const key = TRAIN_RUNS_ON_BY_GET_DAY[date.getDay()];
  return normalizeRunsOnFlag(runs[key]);
}

function parseYmdLocal(ymd: string): Date {
  const parts = ymd.trim().slice(0, 10).split("-").map(Number);
  const [y, mo, d] = parts;
  return new Date(y, (mo ?? 1) - 1, d ?? 1);
}

function formatYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** First calendar date strictly after `fromYmd` on which the train runs (Y). */
export function findNextTrainRunYmdAfter(
  fromYmd: string,
  runs: TrainRunsOnJson,
): string | null {
  const cur = parseYmdLocal(fromYmd);
  if (Number.isNaN(cur.getTime())) return null;
  cur.setDate(cur.getDate() + 1);
  for (let i = 0; i < 400; i++) {
    const key = TRAIN_RUNS_ON_BY_GET_DAY[cur.getDay()];
    if (normalizeRunsOnFlag(runs[key]) === "Y") {
      return formatYmdLocal(cur);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return null;
}

/** e.g. "(tomorrow)", "(day after tomorrow)", "(Friday)" — relative to local today. */
export function nextRunRelativeParenthetical(nextYmd: string): string {
  const next = moment(nextYmd, "YYYY-MM-DD", true);
  if (!next.isValid()) return "";
  const diff = next
    .clone()
    .startOf("day")
    .diff(moment().startOf("day"), "days");
  if (diff === 0) return "(today)";
  if (diff === 1) return "(tomorrow)";
  if (diff === 2) return "(day after tomorrow)";
  return `(${next.format("dddd")})`;
}

/** e.g. `2nd April (tomorrow)` — moment `Do` = ordinal day, `MMMM` = full month */
export function formatNextTrainRunPhrase(nextYmd: string | null): string | null {
  if (!nextYmd) return null;
  const m = moment(nextYmd, "YYYY-MM-DD", true);
  if (!m.isValid()) return null;
  return `${m.format("Do MMMM")} ${nextRunRelativeParenthetical(nextYmd)}`;
}

/** Full alert line when the user picked a date the train does not run (caller knows flag === "N"). */
export function buildTrainDoesNotRunUiMessage(
  journeyDate: string,
  runs: TrainRunsOnJson | null | undefined,
): string {
  let msg = "This train doesn't run on that day.";
  if (runs && Object.keys(runs).length > 0) {
    const nextYmd = findNextTrainRunYmdAfter(journeyDate, runs);
    const phrase = formatNextTrainRunPhrase(nextYmd);
    if (phrase) {
      msg += ` Next run: ${phrase}.`;
    }
  }
  return msg;
}
