import { MarketingController } from './marketing.controller';
import type { MarketingService } from './marketing.service';
import type { Request } from 'express';

describe('MarketingController', () => {
  let controller: MarketingController;
  let service: Partial<MarketingService>;

  beforeEach(() => {
    process.env.CHART_TIME_INGESTION_PASSWORD = 'admin-secret-password';

    service = {
      getStats: jest.fn().mockResolvedValue({ totalAbandoned: 10 }),
      getConfig: jest.fn().mockResolvedValue({ enabled: true }),
      updateConfig: jest.fn().mockResolvedValue({ enabled: false }),
      listAbandonedBookings: jest
        .fn()
        .mockResolvedValue({ items: [], total: 0 }),
      processAbandonedBookingsCron: jest.fn().mockResolvedValue({ sent: 2 }),
      sendManualReminder: jest.fn().mockResolvedValue({ ok: true }),
      sendTestEmail: jest.fn().mockResolvedValue({ ok: true }),
    };

    controller = new MarketingController(service as MarketingService);
  });

  afterEach(() => {
    delete process.env.CHART_TIME_INGESTION_PASSWORD;
  });

  const validReq = {} as Request;
  const validPw = 'admin-secret-password';

  it('rejects unauthenticated requests', async () => {
    await expect(controller.getStats('wrong-pw', validReq)).rejects.toThrow(
      'Invalid admin password',
    );
  });

  it('allows authenticated getStats', async () => {
    const res = await controller.getStats(validPw, validReq);
    expect(res).toEqual({ totalAbandoned: 10 });
    expect(service.getStats).toHaveBeenCalled();
  });

  it('allows authenticated updateConfig', async () => {
    const res = await controller.updateConfig(validPw, validReq, {
      enabled: false,
    });
    expect(res).toEqual({ enabled: false });
    expect(service.updateConfig).toHaveBeenCalledWith({ enabled: false });
  });

  it('triggers manual run-now', async () => {
    const res = await controller.runCronNow(validPw, validReq);
    expect(res).toEqual({ sent: 2 });
    expect(service.processAbandonedBookingsCron).toHaveBeenCalledWith({
      force: true,
    });
  });

  it('sends manual reminder', async () => {
    const res = await controller.sendManualReminder(
      validPw,
      validReq,
      'LB-123',
    );
    expect(res).toEqual({ ok: true });
    expect(service.sendManualReminder).toHaveBeenCalledWith('LB-123');
  });

  it('sends test email', async () => {
    const res = await controller.sendTestEmail(
      validPw,
      validReq,
      'test@example.com',
    );
    expect(res).toEqual({ ok: true });
    expect(service.sendTestEmail).toHaveBeenCalledWith('test@example.com');
  });
});
