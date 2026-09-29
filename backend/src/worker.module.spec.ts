import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { ChartCronService } from './chart-cron/chart-cron.service';
import { IrctcSessionKeeperService } from './irctc/irctc-session-keeper.service';
import { PrismaService } from './prisma/prisma.service';
import { WorkerModule } from './worker.module';

describe('API / worker isolation', () => {
  let app: TestingModule | undefined;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-29T00:00:01Z') });
    jest.replaceProperty(process, 'env', {
      ...process.env,
      IRCTC_KEEPER_ENABLED: 'true',
      IRCTC_BROWSER_WSS: 'wss://browser.example.test',
    });
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
    const refresh = jest
      .spyOn(app.get(IrctcSessionKeeperService), 'refresh')
      .mockResolvedValue({ ok: true });
    await app.init();
    return { app, refresh };
  }

  it('boots the API without cron jobs or an automatic browser harvest', async () => {
    const { app, refresh } = await compile(AppModule);

    expect(() => app.get(SchedulerRegistry)).toThrow();
    expect(() => app.get(ChartCronService)).toThrow();
    await jest.advanceTimersByTimeAsync(5_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('boots every existing schedule and the cookie warmup in the worker', async () => {
    const { app, refresh } = await compile(WorkerModule);
    const scheduler = app.get(SchedulerRegistry);

    expect(app.get(ChartCronService)).toBeInstanceOf(ChartCronService);
    expect(scheduler.getCronJobs().size).toBe(7);
    expect(scheduler.getTimeouts()).toEqual(['irctc-keeper-boot']);
    await jest.advanceTimersByTimeAsync(5_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith('boot');

    await app.close();
    expect(scheduler.getCronJobs().size).toBe(0);
    expect(scheduler.getTimeouts()).toEqual([]);
  });

  it('cancels the startup harvest when the worker shuts down before warmup', async () => {
    const { app, refresh } = await compile(WorkerModule);

    await app.close();
    await jest.advanceTimersByTimeAsync(5_000);
    expect(refresh).not.toHaveBeenCalled();
  });
});
