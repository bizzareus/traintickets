import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';

/** Clock times and day offsets selected by the frontend, anchored at train start. */
export type PinnedChartTime = {
  chartTimeLocal?: string;
  chartOneDayOffset?: number | null;
  chartTwoTimeLocal?: string;
  chartTwoDayOffset?: number | null;
};

export function requirePinnedChartTime(input: PinnedChartTime) {
  const clock = (value: unknown, field: string): string => {
    if (
      typeof value !== 'string' ||
      !/^([01]?\d|2[0-3]):[0-5]\d$/.test(value.trim())
    ) {
      throw new BadRequestException(
        `${field} must be supplied in HH:MM 24-hour format`,
      );
    }
    return value.trim().padStart(5, '0');
  };
  const offset = (value: unknown, field: string): number => {
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      Math.abs(value) > 30
    ) {
      throw new BadRequestException(
        `${field} must be an integer day offset between -30 and 30`,
      );
    }
    return value;
  };
  const chartTimeLocal = clock(input.chartTimeLocal, 'chartTimeLocal');
  const chartOneDayOffset = offset(
    input.chartOneDayOffset,
    'chartOneDayOffset',
  );
  if (input.chartTwoTimeLocal == null || input.chartTwoTimeLocal === '') {
    if (input.chartTwoDayOffset != null) {
      throw new BadRequestException(
        'chartTwoTimeLocal is required with chartTwoDayOffset',
      );
    }
    return { chartTimeLocal, chartOneDayOffset };
  }
  const chartTwoTimeLocal = clock(input.chartTwoTimeLocal, 'chartTwoTimeLocal');
  const chartTwoDayOffset = offset(
    input.chartTwoDayOffset,
    'chartTwoDayOffset',
  );
  const minutes = (time: string, day: number) => {
    const [hour, minute] = time.split(':').map(Number);
    return day * 1440 + hour * 60 + minute;
  };
  if (
    minutes(chartTwoTimeLocal, chartTwoDayOffset) <=
    minutes(chartTimeLocal, chartOneDayOffset)
  ) {
    throw new BadRequestException(
      'The second chart must be after the first chart',
    );
  }
  return {
    chartTimeLocal,
    chartOneDayOffset,
    chartTwoTimeLocal,
    chartTwoDayOffset,
  };
}

export function buildChartTaskSchedule(
  trainStartDate: Date,
  input: PinnedChartTime,
) {
  const pinned = requirePinnedChartTime(input);
  const start = DateTime.fromISO(trainStartDate.toISOString().slice(0, 10), {
    zone: 'Asia/Kolkata',
  });
  const events = [
    {
      time: pinned.chartTimeLocal,
      offset: pinned.chartOneDayOffset,
      chartNumber: 1,
    },
  ];
  if (pinned.chartTwoTimeLocal != null && pinned.chartTwoDayOffset != null) {
    events.push({
      time: pinned.chartTwoTimeLocal,
      offset: pinned.chartTwoDayOffset,
      chartNumber: 2,
    });
  }
  return events.map(({ time, offset, chartNumber }) => {
    const [hour, minute] = time.split(':').map(Number);
    return {
      chartNumber,
      chartAt: start.plus({ days: offset }).set({ hour, minute }).toJSDate(),
    };
  });
}
