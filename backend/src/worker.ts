import 'dotenv/config';
import './instrument';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  Logger.log(
    `Cron worker ready: ${app.get(SchedulerRegistry).getCronJobs().size} scheduled jobs; no HTTP listener`,
    'Worker',
  );
}

void bootstrap().catch((error: unknown) => {
  Logger.error(error, undefined, 'Worker');
  process.exit(1);
});
