import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/railchart';
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const TEST_DATA_DIR = path.join(__dirname, '../../test-data');

async function importTasks() {
  console.log('--- Importing ChartTimeAvailabilityTask ---');
  const filePath = path.join(TEST_DATA_DIR, 'ChartTimeAvailabilityTask_rows.csv');
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const records = parse(fileContent, { columns: true, skip_empty_lines: true });

  for (const record of records) {
    // Ensure contact exists to satisfy foreign key
    if (record.journey_request_id) {
      await prisma.journeyMonitorContact.upsert({
        where: { journeyRequestId: record.journey_request_id },
        update: {},
        create: { journeyRequestId: record.journey_request_id }
      });
    }

    try {
      await prisma.chartTimeAvailabilityTask.upsert({
        where: { id: record.id },
        update: {},
        create: {
          id: record.id,
          journeyRequestId: record.journey_request_id,
          trainNumber: record.train_number,
          trainName: record.train_name,
          fromStationCode: record.from_station_code,
          toStationCode: record.to_station_code,
          stationCode: record.station_code,
          journeyDate: new Date(record.journey_date),
          classCode: record.class_code,
          chartAt: new Date(record.chart_at),
          status: record.status,
          resultPayload: record.result_payload ? JSON.parse(record.result_payload) : undefined,
          createdAt: new Date(record.created_at),
          completedAt: record.completed_at ? new Date(record.completed_at) : undefined,
          emailNotifiedAt: record.email_notified_at ? new Date(record.email_notified_at) : undefined,
          whatsappNotifiedAt: record.whatsapp_notified_at ? new Date(record.whatsapp_notified_at) : undefined,
        }
      });
    } catch (e) {
      console.error(`Failed to import task ${record.id}:`, e.message);
    }
  }
}

async function importScheduleCache() {
  console.log('--- Importing TrainScheduleCache ---');
  const filePath = path.join(TEST_DATA_DIR, 'TrainScheduleCache_rows.csv');
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const records = parse(fileContent, { columns: true, skip_empty_lines: true });

  for (const record of records) {
    try {
      await prisma.trainScheduleCache.upsert({
        where: { trainNumber: record.train_number },
        update: {},
        create: {
          id: record.id,
          trainNumber: record.train_number,
          trainName: record.train_name,
          stationFrom: record.station_from,
          stationTo: record.station_to,
          stationList: record.station_list ? JSON.parse(record.station_list) : undefined,
          fetchedAt: new Date(record.fetched_at),
          trainRunsOn: record.train_runs_on ? JSON.parse(record.train_runs_on) : undefined,
        }
      });
    } catch (e) {
      console.error(`Failed to import schedule cache ${record.train_number}:`, e.message);
    }
  }
}

async function importCacheEntries() {
  console.log('--- Importing CacheEntry ---');
  const filePath = path.join(TEST_DATA_DIR, 'cache_entry_rows.csv');
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const records = parse(fileContent, { columns: true, skip_empty_lines: true });

  for (const record of records) {
    try {
      await prisma.cacheEntry.upsert({
        where: { key: record.key },
        update: {},
        create: {
          key: record.key,
          value: record.value ? JSON.parse(record.value) : undefined,
          expiresAt: record.expires_at ? new Date(record.expires_at) : undefined,
          updatedAt: new Date(record.updated_at),
        }
      });
    } catch (e) {
      console.error(`Failed to import cache entry ${record.key}:`, e.message);
    }
  }
}

async function importStationCache() {
  console.log('--- Importing StationCache ---');
  const filePath = path.join(TEST_DATA_DIR, 'station_cache_rows.csv');
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const records = parse(fileContent, { columns: true, skip_empty_lines: true });

  for (const record of records) {
    try {
      await prisma.stationCache.upsert({
        where: { stationCode: record.station_code },
        update: {},
        create: {
          stationCode: record.station_code,
          stationName: record.station_name,
          metadata: record.metadata ? JSON.parse(record.metadata) : undefined,
          updatedAt: new Date(record.updated_at),
        }
      });
    } catch (e) {
      console.error(`Failed to import station cache ${record.station_code}:`, e.message);
    }
  }
}

async function main() {
  await importCacheEntries();
  await importStationCache();
  await importScheduleCache();
  await importTasks();
}

main().catch(console.error).finally(() => prisma.$disconnect());
