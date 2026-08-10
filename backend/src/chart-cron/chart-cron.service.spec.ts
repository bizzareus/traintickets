import { ChartCronService } from './chart-cron.service';

describe('ChartCronService', () => {
  it('skips the cron body when this process is not the leader', async () => {
    const journeyTask = { runDueTasks: jest.fn() };
    const leader = { isLeader: jest.fn().mockResolvedValue(false) };
    const service = new ChartCronService(journeyTask as never, leader as never);

    await service.handleChartCron();

    expect(leader.isLeader).toHaveBeenCalledTimes(1);
    expect(journeyTask.runDueTasks).not.toHaveBeenCalled();
  });

  it('runs due tasks when this process is the leader', async () => {
    const mockRunResult = { claimedTaskIds: [], tasksRun: 0, results: [] };
    const journeyTask = {
      runDueTasks: jest.fn().mockResolvedValue(mockRunResult),
      logCronRun: jest.fn().mockResolvedValue({ id: 'log-1' }),
    };
    const leader = { isLeader: jest.fn().mockResolvedValue(true) };
    const service = new ChartCronService(journeyTask as never, leader as never);

    await service.handleChartCron();

    expect(leader.isLeader).toHaveBeenCalledTimes(1);
    expect(journeyTask.runDueTasks).toHaveBeenCalledTimes(1);
  });

  it('does not overlap local cron runs in the same process', async () => {
    let finishRun!: (value: any) => void;
    const running = new Promise<any>((resolve) => {
      finishRun = resolve;
    });
    const journeyTask = {
      runDueTasks: jest.fn().mockReturnValue(running),
      logCronRun: jest.fn().mockResolvedValue({ id: 'log-1' }),
    };
    const leader = { isLeader: jest.fn().mockResolvedValue(true) };
    const service = new ChartCronService(journeyTask as never, leader as never);

    const firstRun = service.handleChartCron();
    await Promise.resolve();
    await service.handleChartCron();
    finishRun({ claimedTaskIds: [], tasksRun: 0, results: [] });
    await firstRun;

    expect(leader.isLeader).toHaveBeenCalledTimes(2);
    expect(journeyTask.runDueTasks).toHaveBeenCalledTimes(1);
  });
});
