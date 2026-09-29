import { BadRequestException } from '@nestjs/common';
import {
  buildChartTaskSchedule,
  requirePinnedChartTime,
  type PinnedChartTime,
} from './chart-task-schedule';

describe('frontend-selected chart schedule', () => {
  const selected = {
    chartTimeLocal: '19:08',
    chartOneDayOffset: 0,
    chartTwoTimeLocal: '05:35',
    chartTwoDayOffset: 1,
  };

  it('creates the two exact UTC instants for 12665/RJY, not departure minus four hours', () => {
    expect(buildChartTaskSchedule(new Date('2026-09-28'), selected)).toEqual([
      { chartNumber: 1, chartAt: new Date('2026-09-28T13:38:00Z') },
      { chartNumber: 2, chartAt: new Date('2026-09-29T00:05:00Z') },
    ]);
  });

  it.each([
    ['2026-10-01', '00:00', 0, '2026-09-30T18:30:00Z'],
    ['2027-01-01', '19:08', -1, '2026-12-31T13:38:00Z'],
    ['2026-12-31', '05:35', 1, '2027-01-01T00:05:00Z'],
    ['2028-03-01', '05:35', -1, '2028-02-29T00:05:00Z'],
  ])(
    'handles calendar boundaries: %s %s offset %s',
    (start, time, offset, expected) => {
      expect(
        buildChartTaskSchedule(new Date(start), {
          chartTimeLocal: time,
          chartOneDayOffset: offset,
        }),
      ).toEqual([{ chartNumber: 1, chartAt: new Date(expected) }]);
    },
  );

  it('accepts a single chart and normalizes a one-digit hour', () => {
    expect(
      requirePinnedChartTime({
        chartTimeLocal: ' 5:35 ',
        chartOneDayOffset: 1,
      }),
    ).toEqual({ chartTimeLocal: '05:35', chartOneDayOffset: 1 });
  });

  it.each([
    {},
    { chartTimeLocal: '19:08' },
    { chartTimeLocal: '24:00', chartOneDayOffset: 0 },
    { chartTimeLocal: '19:60', chartOneDayOffset: 0 },
    { chartTimeLocal: '7:08 PM', chartOneDayOffset: 0 },
    { chartTimeLocal: '19:08', chartOneDayOffset: 0.5 },
    { chartTimeLocal: '19:08', chartOneDayOffset: '0' },
    { ...selected, chartTwoTimeLocal: '25:35' },
    { ...selected, chartTwoDayOffset: undefined },
    { ...selected, chartTwoDayOffset: 0 },
    { ...selected, chartTwoTimeLocal: '19:08', chartTwoDayOffset: 0 },
    { chartTimeLocal: '19:08', chartOneDayOffset: 0, chartTwoDayOffset: 1 },
    { ...selected, chartOneDayOffset: Infinity },
  ])(
    'rejects missing or inconsistent times before creating tasks: %j',
    (input) => {
      expect(() => requirePinnedChartTime(input as PinnedChartTime)).toThrow(
        BadRequestException,
      );
    },
  );
});
