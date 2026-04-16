import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { DateTime } from 'luxon';

async function seedTestAlerts() {
  const connectionString = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/railchart';
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  console.log('🌱 Seeding 100 test alerts for high-concurrency testing...');

  try {
    // 1. Create a test contact
    const journeyRequestId = 'test-batch-' + Date.now();
    const contact = await prisma.journeyMonitorContact.upsert({
      where: { journeyRequestId },
      update: {},
      create: {
        journeyRequestId,
        email: 'tester@example.com',
        mobile: '919999999999',
      },
    });

    // 2. Prepare 100 tasks
    // Set trigger time to 1 minute ago so they are due immediately
    const triggerTime = DateTime.now().minus({ minutes: 1 }).toJSDate();
    const journeyDate = DateTime.now().plus({ days: 7 }).toJSDate();

    const tasks = [];
    for (let i = 1; i <= 100; i++) {
      tasks.push({
        journeyRequestId: contact.journeyRequestId,
        trainNumber: '12958',
        trainName: 'SWRAN J RAJDHANI',
        fromStationCode: 'NDLS',
        toStationCode: 'SBIB',
        journeyDate: journeyDate,
        classCode: i % 2 === 0 ? '3A' : '2A',
        stationCode: 'NDLS',
        chartAt: triggerTime,
        status: 'pending',
      });
    }

    // 3. Insert in bulk
    const created = await prisma.chartTimeAvailabilityTask.createMany({
      data: tasks,
    });

    console.log(`✅ Successfully seeded ${created.count} tasks.`);
    console.log(`⏱️  Trigger Time (IST): ${DateTime.fromJSDate(triggerTime).setZone('Asia/Kolkata').toFormat('HH:mm:ss')}`);
    console.log('🚀 Next cron run should pick these up 20 at a time (due to LIMIT 20).');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedTestAlerts();
