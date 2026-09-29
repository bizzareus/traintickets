import {
  JourneyTaskService,
  type JourneyValidContext,
} from './journey-task.service';
import type { Prisma } from '@prisma/client';

describe('chart subscription persistence', () => {
  const selection = {
    chartTimeLocal: '19:08',
    chartOneDayOffset: 0,
    chartTwoTimeLocal: '05:35',
    chartTwoDayOffset: 1,
  };
  const input = {
    trainNumber: '12665',
    trainName: 'HWH CAPE SF EXP',
    fromStationCode: 'RJY',
    toStationCode: 'DG',
    journeyDate: '2026-09-29',
    trainStartDate: '2026-09-28',
    classCode: 'SL',
    email: 'test@example.com',
    ...selection,
  };
  const context: JourneyValidContext = {
    fromCode: 'RJY',
    toCode: 'DG',
    trainNumber: '12665',
    trainStartDate: '2026-09-28',
    jYmd: '2026-09-29',
    stationsToProcess: ['RJY'],
    schedule: {
      trainNumber: '12665',
      trainName: 'HWH CAPE SF EXP',
      stationFrom: 'HWH',
      stationTo: 'CAPE',
      stationList: [
        {
          stationCode: 'RJY',
          stationName: 'Rajahmundry',
          dayCount: 2,
          departureTime: '08:40',
        },
        { stationCode: 'DG', stationName: 'Dindigul', dayCount: 3 },
      ],
    },
  };

  function setup() {
    const prisma = {
      monitoringContact: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'contact-1' }),
      },
      journeyMonitoringRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'journey-1' }),
      },
      journeyMonitorContact: {
        create: jest.fn().mockResolvedValue({ id: 'contact-2' }),
      },
      chartTimeAvailabilityTask: {
        createMany: jest.fn(
          (_args: Prisma.ChartTimeAvailabilityTaskCreateManyArgs) =>
            Promise.resolve({ count: 2 }),
        ),
      },
      chartAlertPayment: { findFirst: jest.fn().mockResolvedValue(null) },
      trainStationChartTime: { upsert: jest.fn() },
      $transaction: jest.fn(async (operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    const chartTime = {
      getChartTimesWithSecondChartForTrain: jest
        .fn()
        .mockResolvedValue(
          new Map([['RJY', { chartOne: { time: '04:40', dayOffset: 1 } }]]),
        ),
    };
    const irctc = {
      getTrainSchedule: jest
        .fn()
        .mockResolvedValue({ ok: true, schedule: context.schedule }),
      getTrainComposition: jest.fn(),
    };
    const notification = {
      sendAdminMonitoringRequestEmail: jest.fn().mockResolvedValue(true),
    };
    const service = new JourneyTaskService(
      prisma as never,
      chartTime as never,
      irctc as never,
      {} as never,
      {} as never,
      notification as never,
      {} as never,
    );
    return { service, prisma, chartTime, irctc };
  }

  it('stores exactly two rows for RJY with immutable event numbers and UTC timestamps', async () => {
    const { service, prisma, chartTime, irctc } = setup();
    const result = await service.createJourneyTasks(input, {
      validatedContext: context,
      journeyRequestId: 'journey-rjy',
    });
    expect(result.tasks.map((t) => t.chartAt)).toEqual([
      '2026-09-28T13:38:00.000Z',
      '2026-09-29T00:05:00.000Z',
    ]);
    const rows =
      prisma.chartTimeAvailabilityTask.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      [1, 2].map((chartNumber) =>
        expect.objectContaining({
          journeyRequestId: 'journey-rjy',
          stationCode: 'RJY',
          journeyDate: new Date('2026-09-29'),
          trainStartDate: new Date('2026-09-28'),
          chartNumber,
        }),
      ),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(
      chartTime.getChartTimesWithSecondChartForTrain,
    ).not.toHaveBeenCalled();
    expect(prisma.trainStationChartTime.upsert).not.toHaveBeenCalled();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(irctc.getTrainComposition).not.toHaveBeenCalled();
  });

  it('stores one event only when the frontend selected one chart', async () => {
    const { service, prisma } = setup();
    await service.createJourneyTasks(
      { ...input, chartTwoTimeLocal: undefined, chartTwoDayOffset: undefined },
      { validatedContext: context },
    );
    expect(
      prisma.chartTimeAvailabilityTask.createMany.mock.calls[0][0].data,
    ).toHaveLength(1);
  });

  it('refuses missing chart fields even when a cache value or departure estimate exists', async () => {
    const { service, prisma } = setup();
    await expect(
      service.createJourneyTasks(
        { ...input, chartTimeLocal: undefined },
        { validatedContext: context },
      ),
    ).rejects.toThrow('chartTimeLocal');
    expect(prisma.monitoringContact.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('preserves two events for no-destination subscriptions too', async () => {
    const { service, prisma } = setup();
    await expect(
      service.queueChartPreparedMonitoring(
        { ...input, toStationCode: '' },
        'no-destination',
      ),
    ).resolves.toBe(true);
    expect(
      prisma.chartTimeAvailabilityTask.createMany.mock.calls[0][0].data,
    ).toEqual([
      expect.objectContaining({
        chartAt: new Date('2026-09-28T13:38:00Z'),
        chartNumber: 1,
        toStationCode: '',
      }),
      expect.objectContaining({
        chartAt: new Date('2026-09-29T00:05:00Z'),
        chartNumber: 2,
        toStationCode: '',
      }),
    ]);
  });
});
