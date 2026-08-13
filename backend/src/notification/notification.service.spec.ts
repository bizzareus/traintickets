import { ConfigService } from '@nestjs/config';
import { NotificationService } from './notification.service';
import type { StationCacheService } from '../cache/station-cache.service';
import type { Service2CheckResult } from '../service2/service2.service';

function mockStationCache(): StationCacheService {
  return {
    namesForCodes: jest.fn().mockResolvedValue(new Map<string, string>()),
    search: jest.fn().mockResolvedValue([]),
    upsertMany: jest.fn().mockResolvedValue(undefined),
  } as unknown as StationCacheService;
}

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
    openAiBookingPlan: [{ instruction: 'NDLS - BCT - 3A', approx_price: 1200 }],
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

  it('sends "No Tickets Found" email and WhatsApp when status is success but no bookable plan', async () => {
    const svc = new NotificationService(mockConfig(), mockStationCache());
    const sendEmail = jest.spyOn(svc, 'sendEmail').mockResolvedValue(true);
    const sendWhatsApp = jest
      .spyOn(svc, 'sendWhatsApp')
      .mockResolvedValue(true);

    const out = await svc.notifyUser({
      email: 'a@example.com',
      mobile: '919999999999',
      task,
      result: successEmptyPlan,
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ emailSent: true, whatsappSent: true });

    const [, subject, html] = sendEmail.mock.calls[0];
    expect(subject).toContain('No Tickets Found');
    expect(html).toContain('No Tickets Found');

    const [, whatsAppText] = sendWhatsApp.mock.calls[0];
    expect(whatsAppText).toContain('No Tickets Found');
  });

  it('sends email with readable journey date and schedule times in HTML', async () => {
    const svc = new NotificationService(mockConfig(), mockStationCache());
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

  it('correctly extracts journey leg coverage for partial journeys', () => {
    const svc = new NotificationService(mockConfig(), mockStationCache());
    const stationScheduleList = [
      { stationCode: 'PUNE', stationName: 'Pune Jn' },
      { stationCode: 'CCH', stationName: 'Chinchvad' },
      { stationCode: 'CSMT', stationName: 'C Shivaji Mah T' },
    ];
    const plan = [{ instruction: 'PUNE - CCH - CC', approx_price: 270 }];

    const coverage = svc.extractJourneyLegCoverage({
      fromStationCode: 'PUNE',
      toStationCode: 'CSMT',
      plan,
      stationScheduleList,
    });

    expect(coverage).toEqual([
      {
        type: 'ticket',
        ticketIndex: 1,
        instruction: 'PUNE - CCH - CC',
        approxPrice: 270,
        fromCode: 'PUNE',
        toCode: 'CCH',
      },
      {
        type: 'no_ticket',
        fromCode: 'CCH',
        toCode: 'CSMT',
      },
    ]);
  });

  it('formats WhatsApp message with "No tickets available" and chart opening time for missing leg', async () => {
    const svc = new NotificationService(
      mockConfig({ wasenderKey: 'ws_test' }),
      mockStationCache(),
    );
    const sendWhatsApp = jest
      .spyOn(svc, 'sendWhatsApp')
      .mockResolvedValue(true);

    const partialResult: Service2CheckResult = {
      status: 'success',
      vacantBerth: { vbd: [], error: null },
      openAiBookingPlan: [
        {
          instruction: 'PUNE - CCH - CC',
          approx_price: 270,
          availability: 'CURR_AVL 26',
        },
        {},
      ],
      openAiTotalPrice: 270,
      chartPreparationDetails: {
        chartingStationCode: 'PUNE',
        firstChartCreationTime: '05:50',
        storedInDb: true,
      },
      trainSchedule: {
        trainNumber: '11010',
        trainName: 'Sinhagad Exp',
        stationFrom: 'PUNE',
        stationTo: 'CSMT',
        stationList: [
          {
            stationCode: 'PUNE',
            stationName: 'Pune Jn',
            departureTime: '0605',
          },
          { stationCode: 'CCH', stationName: 'Chinchvad', arrivalTime: '0634' },
          {
            stationCode: 'CSMT',
            stationName: 'C Shivaji Mah T',
            arrivalTime: '0955',
          },
        ],
      },
    };

    await svc.notifyUser({
      mobile: '919876543210',
      task: {
        trainNumber: '11010',
        trainName: 'Sinhagad Exp',
        fromStationCode: 'PUNE',
        toStationCode: 'CSMT',
        journeyDate: new Date('2026-08-10T00:00:00.000Z'),
      },
      result: partialResult,
    });

    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    const [, text] = sendWhatsApp.mock.calls[0];

    expect(text).toContain('*LastBerth Chart Alert* 🔔');
    expect(text).toContain(
      'You subscribed to an alert when chart is prepared:',
    );
    expect(text).toContain('11010 Sinhagad Exp');
    expect(text).toContain('PUNE > CSMT');
    expect(text).toContain('Ticket 1 [CC] | CURR_AVL 26');
    expect(text).toContain(
      'Book on IRCTC: https://www.irctc.co.in/nget/redirect?from=PUNE&to=CCH&trainNo=11010&class=CC&page=train-chart',
    );
    expect(text).toContain('No tickets available:');
    expect(text).toContain('CCH - Chinchvad → CSMT - C Shivaji Mah T');
    expect(text).toMatch(
      /(New tickets open at|Chart for Chinchvad was released at)/,
    );
    expect(text).toContain('/search?from=CCH&to=CSMT&date=2026-08-10');
    expect(text).not.toContain('Total approx. fare');
  });

  it('triggers sendAlertFailureReport to me@kartikarora.in when WhatsApp or Email sending fails', async () => {
    const svc = new NotificationService(mockConfig(), mockStationCache());
    const failureReportSpy = jest
      .spyOn(svc, 'sendAlertFailureReport')
      .mockResolvedValue(true);
    jest.spyOn(svc, 'sendWhatsApp').mockResolvedValue(false);
    jest.spyOn(svc, 'sendEmail').mockResolvedValue(false);

    const out = await svc.notifyUser({
      email: 'user@example.com',
      mobile: '919876543210',
      task,
      result: successWithTickets,
    });

    expect(out).toEqual({ emailSent: false, whatsappSent: false });
    expect(failureReportSpy).toHaveBeenCalled();
    const calls = failureReportSpy.mock.calls;
    expect(calls.some(([arg]) => arg.alertType.includes('WhatsApp'))).toBe(
      true,
    );
    expect(calls.some(([arg]) => arg.alertType.includes('Email'))).toBe(true);
  });
});
