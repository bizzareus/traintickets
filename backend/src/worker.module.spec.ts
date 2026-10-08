import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { ChartCronService } from './chart-cron/chart-cron.service';
import { PrismaService } from './prisma/prisma.service';
import { WorkerModule } from './worker.module';

describe('API / worker isolation', () => {
  let app: TestingModule | undefined;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-29T00:00:01Z') });
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  async function compile(root: typeof AppModule | typeof WorkerModule) {
    app = await Test.createTestingModule({ imports: [root] })
      .overrideProvider(PrismaService)
      .useValue({ stationCache: { findMany: jest.fn().mockResolvedValue([]) } })
      .compile();
    await app.init();
    return app;
  }

  it('boots the API without cron jobs', async () => {
    const app = await compile(AppModule);

    expect(() => app.get(SchedulerRegistry)).toThrow();
    expect(() => app.get(ChartCronService)).toThrow();
  });

  it('boots every existing schedule in the worker', async () => {
    const app = await compile(WorkerModule);
    const scheduler = app.get(SchedulerRegistry);

    expect(app.get(ChartCronService)).toBeInstanceOf(ChartCronService);
    expect(scheduler.getCronJobs().size).toBe(5);
    expect(scheduler.getTimeouts()).toEqual([]);

    await app.close();
    expect(scheduler.getCronJobs().size).toBe(0);
    expect(scheduler.getTimeouts()).toEqual([]);
  });
});
