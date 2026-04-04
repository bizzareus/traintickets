import { ConfigService } from '@nestjs/config';
import { NotificationService } from './notification.service';
import type { Service2CheckResult } from '../service2/service2.service';

function mockConfig(overrides?: {
  resendKey?: string;
  wasenderKey?: string;
}): ConfigService {
  return {
    get: jest.fn((k: string) => {
      if (k === 'RESEND_API_KEY') return overrides?.resendKey ?? 'rk_test';
      if (k === 'WASENDER_API_KEY') return overrides?.wasenderKey;
      if (k === 'MONITORING_ADMIN_EMAIL') return '';
      return undefined;
    }),
  } as unknown as ConfigService;
}

describe('NotificationService', () => {
  const task = {
    trainNumber: '12951',
    trainName: 'Test Express',
    fromStationCode: 'NDLS',
    toStationCode: 'BCT',
    journeyDate: new Date('2026-04-03T00:00:00.000Z'),
    classCode: '3A',
  };

  const successEmptyPlan: Service2CheckResult = {
    status: 'success',
    vacantBerth: { vbd: [], error: null },
    openAiBookingPlan: [{}, {}],
  };

  const successWithTickets: Service2CheckResult = {
    status: 'success',
    vacantBerth: { vbd: [], error: null },
    openAiBookingPlan: [
      { instruction: 'NDLS - BCT - 3A', approx_price: 1200 },
    ],
    trainSchedule: {
      trainNumber: '12951',
      trainName: 'Test Express',
      stationFrom: 'NDLS',
      stationTo: 'BCT',
      stationList: [
        {
          stationCode: 'NDLS',
          stationName: 'New Delhi',
          departureTime: '0915',
        },
        {
          stationCode: 'BCT',
          stationName: 'Mumbai Central',
          arrivalTime: '2015',
        },
      ],
    },
  };

  it('does not call sendEmail or sendWhatsApp when status is success but no bookable plan', async () => {
    const svc = new NotificationService(mockConfig());
    const sendEmail = jest.spyOn(svc, 'sendEmail').mockResolvedValue(true);
    const sendWhatsApp = jest.spyOn(svc, 'sendWhatsApp').mockResolvedValue(true);

    const out = await svc.notifyUser({
      email: 'a@example.com',
      mobile: '919999999999',
      task,
      result: successEmptyPlan,
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendWhatsApp).not.toHaveBeenCalled();
    expect(out).toEqual({ emailSent: false, whatsappSent: false });
  });

  it('sends email with readable journey date and schedule times in HTML', async () => {
    const svc = new NotificationService(mockConfig());
    const sendEmail = jest.spyOn(svc, 'sendEmail').mockResolvedValue(true);
    jest.spyOn(svc, 'sendWhatsApp').mockResolvedValue(false);

    await svc.notifyUser({
      email: 'user@example.com',
      mobile: undefined,
      task,
      result: successWithTickets,
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [, subject, html] = sendEmail.mock.calls[0];
    expect(subject).toContain('Fri, 3rd April');
    expect(html).toContain('Fri, 3rd April');
    expect(html).toContain('Dep NDLS: 09:15');
    expect(html).toContain('Arr BCT: 20:15');
    expect(html).toMatch(/Book[\s\S]*Book/s);
  });
});
