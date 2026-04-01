/**
 * Parse Nest journey / validate API errors for run-day and validation UI.
 */

export type JourneyRunDayUiError = {
  message: string;
  runningDayNames: string[];
  nextRunDate: string | null;
  nextRunDayAndDate: string | null;
};

export function journeyErrorItemToTrainRunDay(
  item: unknown,
): JourneyRunDayUiError | null {
  if (!item || typeof item !== "object") return null;
  const e = item as Record<string, unknown>;
  if (e.code !== "TRAIN_DOES_NOT_RUN_ON_DATE") return null;
  return {
    message: String(e.message ?? "This train does not run on that day."),
    runningDayNames: Array.isArray(e.runningDayNames)
      ? e.runningDayNames.map(String)
      : [],
    nextRunDate:
      e.nextRunDate != null && String(e.nextRunDate).trim() !== ""
        ? String(e.nextRunDate)
        : null,
    nextRunDayAndDate:
      e.nextRunDayAndDate != null && String(e.nextRunDayAndDate).trim() !== ""
        ? String(e.nextRunDayAndDate)
        : null,
  };
}

/** `POST .../journey/validate` body: `{ valid: false, errors }` */
export function extractTrainRunDayFromValidateBody(
  data: unknown,
): JourneyRunDayUiError | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.valid !== false || !Array.isArray(d.errors)) return null;
  for (const item of d.errors) {
    const td = journeyErrorItemToTrainRunDay(item);
    if (td) return td;
  }
  return null;
}

export function firstJourneyValidationMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.valid !== false || !Array.isArray(d.errors)) return null;
  const first = d.errors[0];
  if (first && typeof first === "object" && "message" in first) {
    return String((first as { message?: string }).message ?? "");
  }
  return null;
}

/** Parse journey 400 / validate error bodies (Nest may nest fields under `message`). */
export function extractJourneyTrainRunDayError(
  err: unknown,
): JourneyRunDayUiError | null {
  const ax = err as { response?: { data?: unknown } };
  const data = ax.response?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const fromValidate = extractTrainRunDayFromValidateBody(data);
  if (fromValidate) return fromValidate;
  const d = data as Record<string, unknown>;
  let payload: Record<string, unknown> | null = null;
  if (d.error === "TRAIN_DOES_NOT_RUN_ON_DATE") payload = d;
  else if (
    d.message != null &&
    typeof d.message === "object" &&
    !Array.isArray(d.message)
  ) {
    const m = d.message as Record<string, unknown>;
    if (m.error === "TRAIN_DOES_NOT_RUN_ON_DATE") payload = m;
  }
  if (!payload) return null;
  return {
    message: String(payload.message ?? "This train does not run on that day."),
    runningDayNames: Array.isArray(payload.runningDayNames)
      ? payload.runningDayNames.map(String)
      : [],
    nextRunDate:
      payload.nextRunDate != null && String(payload.nextRunDate).trim() !== ""
        ? String(payload.nextRunDate)
        : null,
    nextRunDayAndDate:
      payload.nextRunDayAndDate != null &&
      String(payload.nextRunDayAndDate).trim() !== ""
        ? String(payload.nextRunDayAndDate)
        : null,
  };
}
