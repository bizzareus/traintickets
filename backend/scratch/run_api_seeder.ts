import { PrismaService } from '../src/prisma/prisma.service';
import axios from 'axios';

const TRAIN_NUMBERS = [
  // Delhi to Mumbai
  '12952', '12954',
  // Delhi to Patna
  '12310', '12394',
  // Mumbai to Bengaluru
  '11301', '11013',
  // Chennai to Bengaluru
  '12007', '12607',
  // Kolkata to Delhi
  '12301', '12381',
  // Bengaluru to Chennai
  '12008', '12608',
  // Delhi to Jammu
  '12425', '12445',
  // Mumbai to Ahmedabad
  '12009', '12931',
  // Delhi to Kolkata
  '12302', '12314',
  // Fallbacks
  '12001', '12958'
];

async function seed() {
  console.log('🔌 Connecting to database via PrismaService...');
  const prisma = new PrismaService();
  await prisma.onModuleInit();

  console.log('🧹 Cleaning up old database entries for target popular trains to allow fresh scraping...');
  
  // Clean up existing records in Train and TrainScheduleCache for the target trains
  const deleteTrainsResult = await prisma.train.deleteMany({
    where: {
      trainNumber: {
        in: TRAIN_NUMBERS
      }
    }
  });
  console.log(`Deleted ${deleteTrainsResult.count} records from Train table.`);

  const deleteCacheResult = await prisma.trainScheduleCache.deleteMany({
    where: {
      trainNumber: {
        in: TRAIN_NUMBERS
      }
    }
  });
  console.log(`Deleted ${deleteCacheResult.count} records from TrainScheduleCache table.`);

  console.log('🚀 Requesting NestJS API to scrape and populate schedules dynamically...');
  
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < TRAIN_NUMBERS.length; i++) {
    const trainNumber = TRAIN_NUMBERS[i];
    console.log(`[${i + 1}/${TRAIN_NUMBERS.length}] Seeding train: ${trainNumber}...`);

    try {
      // Hitting the running backend server to trigger dynamic fetching and caching
      const response = await axios.get(`http://localhost:3009/api/trains/${trainNumber}`, {
        timeout: 25000 // Give ample time for scraping and saving
      });
      
      if (response.status === 200 && response.data) {
        const train = response.data;
        console.log(`   ✅ Success! Train Name: "${train.trainName}", Stations: ${train.schedule?.stationList?.length || 0}`);
        successCount++;
      } else {
        console.warn(`   ⚠️ Received status code ${response.status} for train ${trainNumber}`);
        failureCount++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`   ❌ Failed to seed train ${trainNumber}: ${message}`);
      failureCount++;
    }

    if (i < TRAIN_NUMBERS.length - 1) {
      console.log('   ⏱️ Waiting 2.5 seconds before next request to avoid rate limiting...');
      await new Promise(resolve => setTimeout(resolve, 2500));
    }
  }

  console.log('--------------------------------------------------');
  console.log(`🎉 Seeding finished! Success: ${successCount}, Failures: ${failureCount}`);
  console.log('--------------------------------------------------');

  await prisma.onModuleDestroy();
  process.exit(0);
}

seed().catch(err => {
  console.error('Critical seeding error:', err);
  process.exit(1);
});
