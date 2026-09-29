import { AlternativeSearchTaskService } from './alternative-search-task.service';
import { PrismaService } from '../prisma/prisma.service';
import { BookingV2Service } from '../booking-v2/booking-v2.service';
import { NotificationService } from '../notification/notification.service';

describe('AlternativeSearchTaskService', () => {
  let service: AlternativeSearchTaskService;
  let prisma: {
    alternativeSearchTask: Record<
      'create' | 'findUnique' | 'findMany' | 'update' | 'updateMany',
      jest.Mock
    >;
  };
  let bookingV2: jest.Mocked<BookingV2Service>;
  let notification: jest.Mocked<NotificationService>;

  beforeEach(() => {
    prisma = {
      alternativeSearchTask: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    bookingV2 = {
      findBestTrains: jest.fn(),
    } as unknown as jest.Mocked<BookingV2Service>;

    notification = {
      notifyUserAlternativeTrains: jest.fn(),
    } as unknown as jest.Mocked<NotificationService>;

    service = new AlternativeSearchTaskService(
      prisma as unknown as PrismaService,
      bookingV2,
      notification,
    );
  });

  it('should enqueue a task for the isolated cron worker', async () => {
    const mockTask = {
      id: 'alt_task_1',
      trainNumber: '11039',
      trainName: 'Maharashtra Exp',
      fromStationCode: 'PUNE',
      toStationCode: 'G',
      journeyDate: new Date('2026-08-10T00:00:00.000Z'),
      classCode: '3A',
      email: 'user@example.com',
      mobile: '919999224767',
      status: 'pending',
      leaseVersion: 0,
    };

    prisma.alternativeSearchTask.create.mockResolvedValue(mockTask);
    prisma.alternativeSearchTask.findUnique.mockResolvedValue(mockTask);
    (bookingV2.findBestTrains as jest.Mock).mockResolvedValue({
      results: [],
    });
    prisma.alternativeSearchTask.update.mockResolvedValue(mockTask);

    const result = await service.enqueueTask({
      trainNumber: '11039',
      trainName: 'Maharashtra Exp',
      fromStationCode: 'PUNE',
      toStationCode: 'G',
      journeyDate: '2026-08-10',
      email: 'user@example.com',
      mobile: '919999224767',
    });

    expect(result.id).toBe('alt_task_1');
    expect(prisma.alternativeSearchTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        trainNumber: '11039',
        fromStationCode: 'PUNE',
        toStationCode: 'G',
        email: 'user@example.com',
        status: 'pending',
      }),
    });
  });

  it('processes its bounded batch concurrently', async () => {
    let finishFirst!: (value: boolean) => void;
    let finishSecond!: (value: boolean) => void;
    const first = new Promise<boolean>((resolve) => {
      finishFirst = resolve;
    });
    const second = new Promise<boolean>((resolve) => {
      finishSecond = resolve;
    });
    prisma.alternativeSearchTask.findMany.mockResolvedValue([
      { id: 'alt-1' },
      { id: 'alt-2' },
    ]);
    const processTask = jest
      .spyOn(service, 'processTask')
      .mockImplementation((id) => (id === 'alt-1' ? first : second));

    const run = service.processDueTasks(2);
    await Promise.resolve();

    expect(processTask).toHaveBeenCalledTimes(2);
    finishFirst(true);
    finishSecond(true);
    await expect(run).resolves.toBe(2);
  });

  it('exposes caught task failures to monitoring instead of returning a green count', async () => {
    prisma.alternativeSearchTask.findMany.mockResolvedValue([
      { id: 'success' },
      { id: 'failed' },
      { id: 'claimed-elsewhere' },
    ]);
    jest
      .spyOn(service, 'processTask')
      .mockImplementation((id) =>
        id === 'failed'
          ? Promise.reject(new Error('search failed'))
          : Promise.resolve(id === 'success'),
      );
    await expect(service.processDueTasksWithStats()).resolves.toEqual({
      processed: 1,
      failed: 1,
      skipped: 1,
    });
  });

  it('should process a task, filter out original train, and send follow-up notifications when alternatives are found', async () => {
    const mockTask = {
      id: 'alt_task_2',
      trainNumber: '11039',
      trainName: 'Maharashtra Exp',
      fromStationCode: 'PUNE',
      toStationCode: 'G',
      journeyDate: new Date('2026-08-10T00:00:00.000Z'),
      classCode: '3A',
      email: 'user@example.com',
      mobile: '919999224767',
      status: 'pending',
      leaseVersion: 0,
    };

    const mockCandidates = [
      {
        train: { trainNumber: '11039', trainName: 'Maharashtra Exp' },
        alternatePath: {
          isComplete: true,
          legs: [{ segmentKind: 'confirmed' }],
        },
      },
      {
        train: { trainNumber: '12126', trainName: 'Pragati Exp' },
        alternatePath: {
          isComplete: true,
          legs: [
            {
              segmentKind: 'confirmed',
              from: 'PUNE',
              to: 'G',
              travelClass: 'CC',
              availabilityDisplayName: 'AVAILABLE 42',
              fare: 340,
            },
          ],
        },
      },
    ];

    prisma.alternativeSearchTask.findUnique.mockResolvedValue(mockTask);
    prisma.alternativeSearchTask.update.mockResolvedValue(mockTask);
    (bookingV2.findBestTrains as jest.Mock).mockResolvedValue({
      results: mockCandidates,
    });
    (notification.notifyUserAlternativeTrains as jest.Mock).mockResolvedValue({
      whatsappSent: true,
      emailSent: true,
    });

    await service.processTask('alt_task_2');

    expect(
      (bookingV2.findBestTrains as jest.Mock).mock.calls.length,
    ).toBeGreaterThan(0);

    expect(
      (notification.notifyUserAlternativeTrains as jest.Mock).mock.calls.length,
    ).toBeGreaterThan(0);

    expect(prisma.alternativeSearchTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'alt_task_2', leaseVersion: 1 },
        data: expect.objectContaining({
          status: 'completed',
          notificationSent: true,
        }),
      }),
    );
  });

  it('reclaims an expired processing task with a new lease', async () => {
    prisma.alternativeSearchTask.findUnique.mockResolvedValue({
      id: 'alt-stale',
      trainNumber: '11039',
      fromStationCode: 'PUNE',
      toStationCode: 'G',
      journeyDate: new Date('2026-08-10T00:00:00.000Z'),
      status: 'processing',
      lockedAt: new Date('2026-08-09T00:00:00.000Z'),
      leaseVersion: 4,
    });
    (bookingV2.findBestTrains as jest.Mock).mockResolvedValue({ results: [] });

    await expect(service.processTask('alt-stale')).resolves.toBe(true);

    expect(prisma.alternativeSearchTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'alt-stale',
          leaseVersion: 4,
        }),
        data: expect.objectContaining({
          status: 'processing',
          leaseVersion: { increment: 1 },
        }),
      }),
    );
  });
});
