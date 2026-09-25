import { ChartCronLeaderService } from './chart-cron-leader.service';

describe('ChartCronLeaderService', () => {
  it('acquires independent leases for independent workers', async () => {
    const prisma = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ name: 'chart-notification' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ name: 'alternative-search' }]),
    };
    const service = new ChartCronLeaderService(prisma as never);

    await expect(service.isLeader('chart-notification')).resolves.toBe(true);
    await expect(service.isLeader('alternative-search')).resolves.toBe(true);

    const values = prisma.$queryRaw.mock.calls.flatMap((call) => call.slice(1));
    expect(values).toContain('chart-notification');
    expect(values).toContain('alternative-search');
  });

  it('applies the chart kill switch only to chart notifications', async () => {
    process.env.CHART_CRON_DISABLED = 'true';
    const prisma = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ name: 'failed-notification-resend' }]),
    };
    const service = new ChartCronLeaderService(prisma as never);

    await expect(service.isLeader('chart-notification')).resolves.toBe(false);
    await expect(service.isLeader('failed-notification-resend')).resolves.toBe(
      true,
    );

    delete process.env.CHART_CRON_DISABLED;
  });
});
