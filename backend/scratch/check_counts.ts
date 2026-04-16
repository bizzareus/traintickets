import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const connectionString = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/railchart';
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  console.log('ChartTimeAvailabilityTask:', await prisma.chartTimeAvailabilityTask.count());
  console.log('TrainScheduleCache:', await prisma.trainScheduleCache.count());
  console.log('CacheEntry:', await prisma.cacheEntry.count());
  console.log('StationCache:', await prisma.stationCache.count());

  await prisma.$disconnect();
}

main();
