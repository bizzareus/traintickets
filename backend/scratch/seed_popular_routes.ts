import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { TrainsService } from '../src/trains/trains.service';
import { PrismaService } from '../src/prisma/prisma.service';

const TRAIN_NUMBERS = [
  // Popular
  '11013', '11301', '12007', '12008', '12009', '12301', '12302', '12310', '12314', '12381', '12394', '12425', '12445', '12607', '12608', '12931', '12952', '12954',
  // Fallback
  '12001', '12958'
];

async function seedPopularRoutes() {
  console.log('🌱 Bootstrapping NestJS application context...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log']
  });

  try {
    const trainsService = app.get(TrainsService);
    const prismaService = app.get(PrismaService);

    console.log(`🚀 Starting seeding for ${TRAIN_NUMBERS.length} unique trains...`);

    for (const trainNumber of TRAIN_NUMBERS) {
      console.log(`--------------------------------------------------`);
      console.log(`Checking train: ${trainNumber}`);

      const existingTrain = await prismaService.train.findUnique({
        where: { trainNumber },
        include: { chartRules: true },
      });

      if (existingTrain && existingTrain.chartRules.length > 0) {
        console.log(`✅ Train ${trainNumber} (${existingTrain.trainName}) is already in database with ${existingTrain.chartRules.length} chart rules. Skipping.`);
        continue;
      }

      console.log(`🔄 Train ${trainNumber} not found or has no chart rules. Fetching and seeding...`);

      try {
        const train = await trainsService.findOne(trainNumber);
        console.log(`✅ Successfully seeded train ${trainNumber}: ${train.trainName} with ${train.chartRules.length} stations/rules.`);
      } catch (err) {
        console.error(`❌ Failed to seed train ${trainNumber}:`, err instanceof Error ? err.message : err);
      }

      console.log(`⏱️ Waiting 2 seconds before next request...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`==================================================`);
    console.log('🎉 Seeding process completed.');
  } catch (error) {
    console.error('❌ Seeding process encountered a critical error:', error);
  } finally {
    console.log('🔌 Closing NestJS application context...');
    await app.close();
  }
}

seedPopularRoutes();
