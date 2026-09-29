import type { ChartTimeStationRow } from "./chartTimes";
import { trainStartYmdForBoarding } from "./chartTimeDisplay";

export type ChartTimeSelection = Pick<
  ChartTimeStationRow,
  | "chartTimeLocal"
  | "chartOneDayOffset"
  | "chartTwoTimeLocal"
  | "chartTwoDayOffset"
>;

/** Capture exactly what was displayed, including its train-start-relative offsets. */
export function chartTimeSelection(input: Partial<ChartTimeSelection>) {
  const clock = (raw: string | null | undefined) => {
    if (!raw || !/^([01]?\d|2[0-3]):[0-5]\d$/.test(raw.trim())) {
      throw new Error(
        "Chart times are unavailable. Please reload the chart-times page before setting an alert.",
      );
    }
    return raw.trim().padStart(5, "0");
  };
  const offset = (raw: number | null | undefined) => {
    const value = raw ?? 0;
    if (!Number.isSafeInteger(value) || Math.abs(value) > 30)
      throw new Error("Invalid chart day offset.");
    return value;
  };
  const first = {
    chartTimeLocal: clock(input.chartTimeLocal),
    chartOneDayOffset: offset(input.chartOneDayOffset),
  };
  if (!input.chartTwoTimeLocal?.trim()) return first;
  return {
    ...first,
    chartTwoTimeLocal: clock(input.chartTwoTimeLocal),
    chartTwoDayOffset: offset(input.chartTwoDayOffset),
  };
}

type ScheduleInput = Partial<ChartTimeSelection> & {
  trainNumber: string;
  fromStationCode: string;
  journeyDate: string;
  trainStartDate?: string;
};

/** Other alert entry points load the same page data before submitting the snapshot. */
export async function withChartTimeSelection<T extends ScheduleInput>(
  input: T,
): Promise<
  Omit<T, keyof ChartTimeSelection | "trainStartDate"> &
    ReturnType<typeof chartTimeSelection> & { trainStartDate: string }
> {
  const {
    chartTimeLocal,
    chartOneDayOffset,
    chartTwoTimeLocal,
    chartTwoDayOffset,
    trainStartDate: anchor,
    ...rest
  } = input;
  let station: ChartTimeStationRow | undefined;
  if (!chartTimeLocal?.trim() || !anchor) {
    const response = await fetch(
      `/api/chart-alert-schedule/${encodeURIComponent(input.trainNumber.trim())}/${encodeURIComponent(input.fromStationCode.trim().toUpperCase())}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok)
      throw new Error(
        "Chart times are unavailable. Please open the chart-times page and try again.",
      );
    station = (await response.json()) as ChartTimeStationRow;
  }
  if (
    !anchor &&
    (!Number.isInteger(station?.day) || Number(station?.day) < 1)
  ) {
    throw new Error(
      "The boarding station day is unavailable; the train-start date cannot be determined.",
    );
  }
  const trainStartDate =
    anchor || trainStartYmdForBoarding(input.journeyDate, station?.day);
  if (!trainStartDate) throw new Error("A valid train-start date is required.");
  const selected = chartTimeSelection(
    chartTimeLocal?.trim()
      ? {
          chartTimeLocal,
          chartOneDayOffset,
          chartTwoTimeLocal,
          chartTwoDayOffset,
        }
      : (station ?? {}),
  );
  return { ...rest, ...selected, trainStartDate };
}
