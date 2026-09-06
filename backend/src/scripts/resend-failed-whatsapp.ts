import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import { NotificationService } from '../notification/notification.service';
import { StationCacheService } from '../cache/station-cache.service';
import type { Service2CheckResult } from '../service2/service2.service';

async function main() {
  const connectionString =
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/railchart';
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  console.log('Connecting to PostgreSQL database...');

  const configService = new ConfigService(process.env);
  const stationCacheService = new StationCacheService(prisma as any);
  const notificationService = new NotificationService(
    configService,
    stationCacheService,
  );

  console.log(
    'Searching for completed tasks missing WhatsApp notifications...',
  );

  const tasks = await prisma.chartTimeAvailabilityTask.findMany({
    where: {
      status: 'completed',
      whatsappNotifiedAt: null,
      whatsappRetryCount: { lt: 3 },
      whatsappStatus: { not: 'unsend' },
      contact: {
        mobile: { not: null },
      },
    },
    include: {
      contact: true,
    },
  });

  console.log(
    `Found ${tasks.length} task(s) needing WhatsApp notification resend.`,
  );

  for (const task of tasks) {
    if (!task.contact?.mobile) continue;

    console.log(
      `Resending WhatsApp notification for task ${task.id} (${task.trainNumber} - ${task.stationCode}) to ${task.contact.mobile}...`,
    );

    try {
      const result = task.resultPayload as unknown as Service2CheckResult;
      const status = await notificationService.notifyUser({
        email: task.contact.email ?? undefined,
        mobile: task.contact.mobile ?? undefined,
        task: {
          trainNumber: task.trainNumber,
          trainName: task.trainName,
          fromStationCode: task.fromStationCode,
          toStationCode: task.toStationCode,
          journeyDate: task.journeyDate,
        },
        result,
      });

      console.log('Notification status:', status);

      if (status.whatsappSent) {
        await prisma.chartTimeAvailabilityTask.update({
          where: { id: task.id },
          data: {
            whatsappNotifiedAt: new Date(),
            whatsappStatus: 'sent',
          },
        });
        console.log(`Updated whatsappNotifiedAt for task ${task.id}`);
      } else {
        const currentRetries = task.whatsappRetryCount ?? 0;
        const nextRetryCount = currentRetries + 1;
        await prisma.chartTimeAvailabilityTask.update({
          where: { id: task.id },
          data: {
            whatsappRetryCount: { increment: 1 },
            ...(nextRetryCount >= 3 ? { whatsappStatus: 'unsend' } : {}),
          },
        });
        console.log(
          `Incremented retry count for task ${task.id} (${nextRetryCount}/3)${nextRetryCount >= 3 ? ' - marked as unsend' : ''}`,
        );
      }
    } catch (err) {
      console.error(`Error processing task ${task.id}:`, err);
      const currentRetries = task.whatsappRetryCount ?? 0;
      const nextRetryCount = currentRetries + 1;
      await prisma.chartTimeAvailabilityTask.update({
        where: { id: task.id },
        data: {
          whatsappRetryCount: { increment: 1 },
          ...(nextRetryCount >= 3 ? { whatsappStatus: 'unsend' } : {}),
        },
      }).catch(console.error);
    }
  }

  await prisma.$disconnect();
  console.log('Done!');
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
