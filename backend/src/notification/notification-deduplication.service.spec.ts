import { Test, TestingModule } from '@nestjs/testing';
import { NotificationDeduplicationService } from './notification-deduplication.service';
import { PrismaService } from '../prisma/prisma.service';

describe('NotificationDeduplicationService', () => {
  let service: NotificationDeduplicationService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      sentNotificationLog: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDeduplicationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NotificationDeduplicationService>(
      NotificationDeduplicationService,
    );
    prisma = module.get(PrismaService);
  });

  it('should allow sending notification if no previous log exists', async () => {
    (prisma.sentNotificationLog.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await service.shouldSendNotification({
      recipient: '919876543210',
      channel: 'whatsapp',
      trainNumber: '22667',
      journeyDate: '2026-08-16',
      notificationType: 'no_seats',
    });

    expect(result).toBe(true);
  });

  it('should suppress notification if previous log exists within window', async () => {
    (prisma.sentNotificationLog.findFirst as jest.Mock).mockResolvedValue({
      id: 'log1',
      recipient: '919876543210',
      channel: 'whatsapp',
      trainNumber: '22667',
      journeyDate: new Date('2026-08-16'),
      notificationType: 'no_seats',
      sentAt: new Date(),
    });

    const result = await service.shouldSendNotification({
      recipient: '919876543210',
      channel: 'whatsapp',
      trainNumber: '22667',
      journeyDate: '2026-08-16',
      notificationType: 'no_seats',
    });

    expect(result).toBe(false);
  });

  it('should record notification log upon dispatch', async () => {
    (prisma.sentNotificationLog.create as jest.Mock).mockResolvedValue({
      id: 'log2',
    });

    await service.recordNotificationSent({
      recipient: 'john@example.com',
      channel: 'email',
      trainNumber: '20922',
      journeyDate: '2026-08-16',
      notificationType: 'alt_trains',
    });

    expect(prisma.sentNotificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipient: 'john@example.com',
          channel: 'email',
          trainNumber: '20922',
          notificationType: 'alt_trains',
        }),
      }),
    );
  });
});
