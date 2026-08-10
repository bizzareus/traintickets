import { AlternativeSearchTaskService } from './alternative-search-task.service';
import { PrismaService } from '../prisma/prisma.service';
import { BookingV2Service } from '../booking-v2/booking-v2.service';
import { NotificationService } from '../notification/notification.service';

describe('AlternativeSearchTaskService', () => {
  let service: AlternativeSearchTaskService;
  let prisma: jest.Mocked<PrismaService>;
  let bookingV2: jest.Mocked<BookingV2Service>;
  let notification: jest.Mocked<NotificationService>;

  beforeEach(() => {
    prisma = {
      alternativeSearchTask: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    bookingV2 = {
      findBestTrainCandidates: jest.fn(),
    } as unknown as jest.Mocked<BookingV2Service>;

    notification = {
      notifyUserAlternativeTrains: jest.fn(),
    } as unknown as jest.Mocked<NotificationService>;

    service = new AlternativeSearchTaskService(prisma, bookingV2, notification);
  });

  it('should enqueue a task and trigger async processing', async () => {
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
    };

    (prisma.alternativeSearchTask.create as jest.Mock).mockResolvedValue(
      mockTask,
    );
    (prisma.alternativeSearchTask.findUnique as jest.Mock).mockResolvedValue(
      mockTask,
    );
    (bookingV2.findBestTrainCandidates as jest.Mock).mockResolvedValue([]);
    (prisma.alternativeSearchTask.update as jest.Mock).mockResolvedValue(
      mockTask,
    );

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

    (prisma.alternativeSearchTask.findUnique as jest.Mock).mockResolvedValue(
      mockTask,
    );
    (prisma.alternativeSearchTask.update as jest.Mock).mockResolvedValue(
      mockTask,
    );
    (bookingV2.findBestTrainCandidates as jest.Mock).mockResolvedValue(
      mockCandidates,
    );
    (notification.notifyUserAlternativeTrains as jest.Mock).mockResolvedValue({
      whatsappSent: true,
      emailSent: true,
    });

    await service.processTask('alt_task_2');

    expect(
      (bookingV2.findBestTrainCandidates as jest.Mock).mock.calls.length,
    ).toBeGreaterThan(0);

    expect(
      (notification.notifyUserAlternativeTrains as jest.Mock).mock.calls.length,
    ).toBeGreaterThan(0);

    expect(prisma.alternativeSearchTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'alt_task_2' },
        data: expect.objectContaining({
          status: 'completed',
          notificationSent: true,
        }),
      }),
    );
  });
});
