import { ConfigService } from '@nestjs/config';
import { NotificationService } from './notification.service';
import { NotificationDeduplicationService } from './notification-deduplication.service';
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
    expect(html).toContain(
      'Look for alternate trains available for your journey:',
    );
    expect(html).toContain('Find Alternate Trains');

    const [, whatsAppText] = sendWhatsApp.mock.calls[0];
    expect(whatsAppText).toContain('No Tickets Found');
    expect(whatsAppText).toContain(
      'Look for alternate trains available for your journey:',
    );
  });

  it('sends email with readable journey date, schedule times, and availability count in HTML', async () => {
    const svc = new NotificationService(mockConfig(), mockStationCache());
    const sendEmail = jest.spyOn(svc, 'sendEmail').mockResolvedValue(true);
    jest.spyOn(svc, 'sendWhatsApp').mockResolvedValue(false);

    const resultWithAvailability: Service2CheckResult = {
      ...successWithTickets,
      openAiBookingPlan: [
        {
          instruction: 'NDLS - BCT - 3A',
          approx_price: 1200,
          availability: 'AVAILABLE 24',
        },
      ],
    };

    await svc.notifyUser({
      email: 'user@example.com',
      mobile: undefined,
      task,
      result: resultWithAvailability,
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [, subject, html] = sendEmail.mock.calls[0];
    expect(subject).toContain('Fri, 3rd April');
    expect(html).toContain('Fri, 3rd April');
    expect(html).toContain('New Delhi (09:15) → Mumbai Central (20:15)');
    expect(html).toContain(
      'NDLS - New Delhi (09:15) → BCT - Mumbai Central (20:15)',
    );
    expect(html).toContain('AVAILABLE 24');
    expect(html).toContain('approx');
    expect(html).toContain('₹1,200');
    expect(html).not.toContain('Book quickly — seats can sell out fast.');
    expect(html).toContain('>Book</a>');
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
    expect(text).toContain(
      'CCH - Chinchvad (06:34) → CSMT - C Shivaji Mah T (09:55)',
    );
    expect(text).toMatch(
      /(New tickets open at|Chart for Chinchvad was released at)/,
    );
    expect(text).toContain('/search?from=CCH&to=CSMT&date=2026-08-10');
    expect(text).not.toContain('Total approx. fare');
  });

  it('omits chart open time label when no chart preparation info is available', async () => {
    const svc = new NotificationService(mockConfig(), mockStationCache());
    const sendEmail = jest.spyOn(svc, 'sendEmail').mockResolvedValue(true);
    const sendWhatsApp = jest
      .spyOn(svc, 'sendWhatsApp')
      .mockResolvedValue(true);

    const partialResultNoChartInfo = {
      status: 'success' as const,
      openAiBookingPlan: [
        {
          instruction: 'PUNE - CCH - CC',
          availability: 'CURR_AVL 26',
        },
      ],
      openAiStructuredSeats: [
        {
          from: 'PUNE',
          to: 'CCH',
          class: 'CC',
          coach: 'C1',
          berth: '12',
          seat: '12',
        },
      ],
      trainSchedule: {
        trainNumber: '11010',
        trainName: 'Sinhagad Exp',
        stationList: [
          { stationCode: 'PUNE', stationName: 'Pune Jn', arrivalTime: '0605' },
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
      email: 'user@example.com',
      mobile: '919876543210',
      task: {
        trainNumber: '11010',
        trainName: 'Sinhagad Exp',
        fromStationCode: 'PUNE',
        toStationCode: 'CSMT',
        journeyDate: new Date('2026-08-10T00:00:00.000Z'),
      },
      result: partialResultNoChartInfo,
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [, , emailHtml] = sendEmail.mock.calls[0];
    expect(emailHtml).not.toContain(
      'New tickets open around chart preparation time',
    );
    expect(emailHtml).toContain(
      'No tickets available | Buy ticket from TTE in train',
    );

    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    const [, whatsappText] = sendWhatsApp.mock.calls[0];
    expect(whatsappText).not.toContain(
      'New tickets open around chart preparation time',
    );
  });

  it('includes one-line chart preparation trigger message in email and whatsapp when chartPreparationDetails is present', async () => {
    const svc = new NotificationService(mockConfig(), mockStationCache());
    const sendEmail = jest.spyOn(svc, 'sendEmail').mockResolvedValue(true);
    const sendWhatsApp = jest
      .spyOn(svc, 'sendWhatsApp')
      .mockResolvedValue(true);

    const resultWithChartPrep: Service2CheckResult = {
      ...successWithTickets,
      chartPreparationDetails: {
        chartingStationCode: 'SPN',
        firstChartCreationTime: '03:43',
        storedInDb: true,
      },
      trainSchedule: {
        trainNumber: '12237',
        trainName: 'Begumpura Exp',
        stationFrom: 'SPN',
        stationTo: 'JAT',
        stationList: [
          {
            stationCode: 'SPN',
            stationName: 'Shahjehanpur',
            departureTime: '0343',
          },
          {
            stationCode: 'JAT',
            stationName: 'Jammu Tawi',
            arrivalTime: '1500',
          },
        ],
      },
    };

    await svc.notifyUser({
      email: 'user@example.com',
      mobile: '919876543210',
      task: {
        trainNumber: '12237',
        trainName: 'Begumpura Exp',
        fromStationCode: 'SPN',
        toStationCode: 'JAT',
        journeyDate: new Date('2026-08-30T00:00:00.000Z'),
      },
      result: resultWithChartPrep,
      isFollowUpLeg: true,
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [, , emailHtml] = sendEmail.mock.calls[0];
    expect(emailHtml).toContain('Chart was prepared for Shahjehanpur on');
    expect(emailHtml).toContain('and we found some tickets.');

    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    const [, whatsappText] = sendWhatsApp.mock.calls[0];
    expect(whatsappText).toContain('Chart was prepared for Shahjehanpur on');
    expect(whatsappText).toContain('and we found some tickets.');
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

  it('suppresses notification when isFollowUpLeg is true and no tickets are found', async () => {
    const svc = new NotificationService(
      mockConfig({ wasenderKey: 'ws_test' }),
      mockStationCache(),
    );
    const sendWhatsApp = jest.spyOn(svc, 'sendWhatsApp');
    const sendEmail = jest.spyOn(svc, 'sendEmail');

    const noTicketsResult: Service2CheckResult = {
      status: 'success',
      vacantBerth: { vbd: [], error: null },
      openAiBookingPlan: [],
      trainSchedule: {
        trainNumber: '22603',
        trainName: 'Kgp Vm Sf Exp',
        stationFrom: 'BLS',
        stationTo: 'BBS',
        stationList: [],
      },
    };

    const out = await svc.notifyUser({
      email: 'user@example.com',
      mobile: '919876543210',
      task: {
        trainNumber: '22603',
        trainName: 'Kgp Vm Sf Exp',
        fromStationCode: 'BLS',
        toStationCode: 'BBS',
        journeyDate: new Date('2026-08-20T00:00:00.000Z'),
      },
      result: noTicketsResult,
      isFollowUpLeg: true,
    });

    expect(out).toEqual({ emailSent: false, whatsappSent: false });
    expect(sendWhatsApp).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('formats notification as concise delta update when isFollowUpLeg is true and tickets are found', async () => {
    const svc = new NotificationService(
      mockConfig({ wasenderKey: 'ws_test' }),
      mockStationCache(),
    );
    const sendWhatsApp = jest
      .spyOn(svc, 'sendWhatsApp')
      .mockResolvedValue(true);

    const followUpResult: Service2CheckResult = {
      status: 'success',
      vacantBerth: { vbd: [], error: null },
      openAiBookingPlan: [
        {
          instruction: 'BAM - VZM - SL',
          approx_price: 205,
          availability: 'CURR_AVL 12',
        },
      ],
      trainSchedule: {
        trainNumber: '22603',
        trainName: 'Kgp Vm Sf Exp',
        stationFrom: 'BAM',
        stationTo: 'RJY',
        stationList: [
          { stationCode: 'BAM', stationName: 'Brahmapur' },
          { stationCode: 'VZM', stationName: 'Vizianagram Jn' },
          { stationCode: 'RJY', stationName: 'Rajahmundry' },
        ],
      },
    };

    await svc.notifyUser({
      mobile: '919876543210',
      task: {
        trainNumber: '22603',
        trainName: 'Kgp Vm Sf Exp',
        fromStationCode: 'BAM',
        toStationCode: 'RJY',
        journeyDate: new Date('2026-08-20T00:00:00.000Z'),
      },
      result: followUpResult,
      isFollowUpLeg: true,
    });

    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    const [, text] = sendWhatsApp.mock.calls[0];
    expect(text).toContain('*LastBerth Leg Update* 🔔');
    expect(text).toContain('New tickets found for your journey!');
    expect(text).toContain('Leg: BAM > RJY');
    expect(text).toContain('Ticket Found [SL] | CURR_AVL 12');
    expect(text).toContain('BAM - Brahmapur → VZM - Vizianagram Jn');
    expect(text).toContain('approx ₹205');
  });

  it('safely handles empty objects in openAiBookingPlan without crashing (JBP -> BGP regression test)', async () => {
    const svc = new NotificationService(
      mockConfig({ wasenderKey: 'ws_test' }),
      mockStationCache(),
    );
    const sendWhatsApp = jest
      .spyOn(svc, 'sendWhatsApp')
      .mockResolvedValue(true);
    const sendEmail = jest.spyOn(svc, 'sendEmail').mockResolvedValue(true);

    const sparsePlanResult: Service2CheckResult = {
      status: 'success',
      vacantBerth: { vbd: [], error: null },
      openAiBookingPlan: [
        {} as any,
        {} as any,
        { instruction: 'PNBE - BKP - SL', approx_price: 180 },
        {} as any,
        { instruction: 'KIUL - BGP - SL', approx_price: 180 },
      ],
      trainSchedule: {
        trainNumber: '12336',
        trainName: 'Ltt Bhagalpur Ex',
        stationFrom: 'JBP',
        stationTo: 'BGP',
        stationList: [
          { stationCode: 'JBP', stationName: 'Jabalpur' },
          { stationCode: 'PNBE', stationName: 'Patna Jn' },
          { stationCode: 'BKP', stationName: 'Bakhtiyarpur Jn' },
          { stationCode: 'KIUL', stationName: 'Kiul Jn' },
          { stationCode: 'BGP', stationName: 'Bhagalpur' },
        ],
      },
    };

    const out = await svc.notifyUser({
      email: 'ps7718686@gmail.com',
      mobile: '918603563700',
      task: {
        trainNumber: '12336',
        trainName: 'Ltt Bhagalpur Ex',
        fromStationCode: 'JBP',
        toStationCode: 'BGP',
        journeyDate: new Date('2026-08-25T00:00:00.000Z'),
      },
      result: sparsePlanResult,
      isFollowUpLeg: true,
    });

    expect(out).toEqual({ emailSent: true, whatsappSent: true });
    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [, whatsAppText] = sendWhatsApp.mock.calls[0];
    expect(whatsAppText).toContain('PNBE - Patna Jn → BKP - Bakhtiyarpur Jn');
    expect(whatsAppText).toContain('KIUL - Kiul Jn → BGP - Bhagalpur');
  });

  it('renders partial journey notice and TTE ticket message in email when journey is partially covered', async () => {
    const svc = new NotificationService(mockConfig(), mockStationCache());
    jest.spyOn(svc, 'sendWhatsApp').mockResolvedValue(true);
    const sendEmail = jest.spyOn(svc, 'sendEmail').mockResolvedValue(true);

    const partialPlanResult: Service2CheckResult = {
      status: 'success',
      vacantBerth: { vbd: [], error: null },
      openAiBookingPlan: [
        { instruction: 'PNBE - BKP - SL', approx_price: 180 },
        { instruction: 'KIUL - BGP - SL', approx_price: 180 },
      ],
      trainSchedule: {
        trainNumber: '12336',
        trainName: 'Ltt Bhagalpur Ex',
        stationFrom: 'JBP',
        stationTo: 'BGP',
        stationList: [
          { stationCode: 'JBP', stationName: 'Jabalpur' },
          { stationCode: 'PNBE', stationName: 'Patna Jn' },
          { stationCode: 'BKP', stationName: 'Bakhtiyarpur Jn' },
          { stationCode: 'KIUL', stationName: 'Kiul Jn' },
          { stationCode: 'BGP', stationName: 'Bhagalpur' },
        ],
      },
    };

    const out = await svc.notifyUser({
      email: 'ps7718686@gmail.com',
      mobile: '918603563700',
      task: {
        trainNumber: '12336',
        trainName: 'Ltt Bhagalpur Ex',
        fromStationCode: 'JBP',
        toStationCode: 'BGP',
        journeyDate: new Date('2026-08-25T00:00:00.000Z'),
      },
      result: partialPlanResult,
    });

    expect(out).toEqual({ emailSent: true, whatsappSent: true });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [, , html] = sendEmail.mock.calls[0];
    expect(html).toContain(
      'No tickets available | Buy ticket from TTE in train',
    );
    expect(html).toContain(
      'You can purchase multiple tickets and for journey ticket not available you can buy it on board from TTE based on realtime availability in the train',
    );
  });

  it('suppresses duplicate notifications when NotificationDeduplicationService returns false', async () => {
    const shouldSendNotificationMock = jest.fn().mockResolvedValue(false);
    const recordNotificationSentMock = jest.fn().mockResolvedValue(undefined);
    const mockDedup = {
      shouldSendNotification: shouldSendNotificationMock,
      recordNotificationSent: recordNotificationSentMock,
    } as unknown as NotificationDeduplicationService;

    const svc = new NotificationService(
      mockConfig({ wasenderKey: 'ws_test' }),
      mockStationCache(),
      undefined,
      undefined,
      undefined,
      mockDedup,
    );
    const sendEmail = jest.spyOn(svc, 'sendEmail').mockResolvedValue(true);
    const sendWhatsApp = jest
      .spyOn(svc, 'sendWhatsApp')
      .mockResolvedValue(true);

    const out = await svc.notifyUser({
      email: 'dup@example.com',
      mobile: '919876543210',
      task,
      result: successEmptyPlan,
    });

    expect(shouldSendNotificationMock).toHaveBeenCalledTimes(2);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendWhatsApp).not.toHaveBeenCalled();
    expect(recordNotificationSentMock).not.toHaveBeenCalled();
    expect(out).toEqual({ emailSent: false, whatsappSent: false });
  });

  it('records sent notification when NotificationDeduplicationService returns true and send succeeds', async () => {
    const shouldSendNotificationMock = jest.fn().mockResolvedValue(true);
    const recordNotificationSentMock = jest.fn().mockResolvedValue(undefined);
    const mockDedup = {
      shouldSendNotification: shouldSendNotificationMock,
      recordNotificationSent: recordNotificationSentMock,
    } as unknown as NotificationDeduplicationService;

    const svc = new NotificationService(
      mockConfig({ wasenderKey: 'ws_test' }),
      mockStationCache(),
      undefined,
      undefined,
      undefined,
      mockDedup,
    );
    jest.spyOn(svc, 'sendEmail').mockResolvedValue(true);
    jest.spyOn(svc, 'sendWhatsApp').mockResolvedValue(true);

    const out = await svc.notifyUser({
      email: 'dup@example.com',
      mobile: '919876543210',
      task,
      result: successEmptyPlan,
    });

    expect(out).toEqual({ emailSent: true, whatsappSent: true });
    expect(recordNotificationSentMock).toHaveBeenCalledTimes(2);
    expect(recordNotificationSentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: 'dup@example.com',
        channel: 'email',
        notificationType: 'no_seats',
      }),
    );
    expect(recordNotificationSentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: '919876543210',
        channel: 'whatsapp',
        notificationType: 'no_seats',
      }),
    );
  });

  describe('End-to-End False-Case & Duplicate Prevention Tests', () => {
    let inMemoryLogs: Array<{
      recipient: string;
      channel: string;
      trainNumber: string;
      journeyDate: Date;
      notificationType: string;
      sentAt: Date;
    }>;
    let dedupService: NotificationDeduplicationService;
    let mockPrisma: any;

    beforeEach(() => {
      inMemoryLogs = [];
      mockPrisma = {
        sentNotificationLog: {
          findFirst: jest.fn().mockImplementation(({ where }) => {
            const cutoff = where.sentAt?.gte;
            const targetDateStr =
              where.journeyDate instanceof Date
                ? where.journeyDate.toISOString().slice(0, 10)
                : String(where.journeyDate || '').slice(0, 10);
            return Promise.resolve(
              inMemoryLogs.find((log) => {
                const logDateStr =
                  log.journeyDate instanceof Date
                    ? log.journeyDate.toISOString().slice(0, 10)
                    : String(log.journeyDate || '').slice(0, 10);
                const matchType = where.notificationType?.in
                  ? where.notificationType.in.includes(log.notificationType)
                  : log.notificationType === where.notificationType;
                return (
                  log.recipient === where.recipient &&
                  log.channel === where.channel &&
                  log.trainNumber === where.trainNumber &&
                  logDateStr === targetDateStr &&
                  matchType &&
                  (!cutoff || log.sentAt >= cutoff)
                );
              }) || null,
            );
          }),
          create: jest.fn().mockImplementation(({ data }) => {
            const entry = { ...data, sentAt: new Date() };
            inMemoryLogs.push(entry);
            return Promise.resolve(entry);
          }),
        },
      };
      dedupService = new NotificationDeduplicationService(mockPrisma);
    });

    it('False Case 1: Prevents sending 4 duplicate emails when multiple tasks execute for the same user, train and date (jaip6433@gmail.com scenario)', async () => {
      const svc = new NotificationService(
        mockConfig({ wasenderKey: 'ws_test' }),
        mockStationCache(),
        undefined,
        undefined,
        undefined,
        dedupService,
      );

      const sendEmailSpy = jest.spyOn(svc, 'sendEmail').mockResolvedValue(true);
      const testTask = {
        trainNumber: '12815',
        trainName: 'Nandan Kanan Exp',
        fromStationCode: 'MZP',
        toStationCode: 'ANVT',
        journeyDate: new Date('2026-08-25T00:00:00.000Z'),
      };

      // 1st task execution (e.g. 1st Chart task MZP -> ANVT)
      const res1 = await svc.notifyUser({
        email: 'jaip6433@gmail.com',
        task: testTask,
        result: successEmptyPlan,
      });

      // 2nd task execution (e.g. 2nd Chart task MZP -> ANVT)
      const res2 = await svc.notifyUser({
        email: 'jaip6433@gmail.com',
        task: testTask,
        result: successEmptyPlan,
      });

      // 3rd task execution (e.g. 1st Chart task PRYJ -> ANVT)
      const res3 = await svc.notifyUser({
        email: 'jaip6433@gmail.com',
        task: { ...testTask, fromStationCode: 'PRYJ' },
        result: successEmptyPlan,
      });

      // 4th task execution (e.g. 2nd Chart task PRYJ -> ANVT)
      const res4 = await svc.notifyUser({
        email: 'jaip6433@gmail.com',
        task: { ...testTask, fromStationCode: 'PRYJ' },
        result: successEmptyPlan,
      });

      // Assertions: 1st succeeded, 2nd, 3rd, and 4th were BLOCKED
      expect(res1.emailSent).toBe(true);
      expect(res2.emailSent).toBe(false);
      expect(res3.emailSent).toBe(false);
      expect(res4.emailSent).toBe(false);

      // Crucial: sendEmail was only invoked 1 time total instead of 4 times
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    });

    it('False Case 2: Prevents sending 3 duplicate alternative train emails when multiple alerts fire for same train (connectkumar17@gmail.com scenario)', async () => {
      const svc = new NotificationService(
        mockConfig({ wasenderKey: 'ws_test' }),
        mockStationCache(),
        undefined,
        undefined,
        undefined,
        dedupService,
      );

      const sendEmailSpy = jest.spyOn(svc, 'sendEmail').mockResolvedValue(true);
      const altTrains = [
        {
          train: { trainNumber: '17426', trainName: 'SNSI TPTY EXP' },
          alternatePath: {
            legs: [
              { from: 'GNT', to: 'TPTY', travelClass: '2A', isAvailable: true },
            ],
          },
        },
      ] as any;

      // 1st alternative train alert (e.g. from GNT -> TPTY)
      const res1 = await svc.notifyUser({
        email: 'connectkumar17@gmail.com',
        task: {
          trainNumber: '12734',
          trainName: 'Narayanadri Sf',
          fromStationCode: 'GNT',
          toStationCode: 'TPTY',
          journeyDate: new Date('2026-08-25T00:00:00.000Z'),
        },
        result: successEmptyPlan,
        alternativeTrains: altTrains,
      });

      // 2nd alternative train alert (e.g. from LPI -> TPTY for same train 12734)
      const res2 = await svc.notifyUser({
        email: 'connectkumar17@gmail.com',
        task: {
          trainNumber: '12734',
          trainName: 'Narayanadri Sf',
          fromStationCode: 'LPI',
          toStationCode: 'TPTY',
          journeyDate: new Date('2026-08-25T00:00:00.000Z'),
        },
        result: successEmptyPlan,
        alternativeTrains: altTrains,
      });

      // 3rd alternative train alert via notifyUserAlternativeTrains
      const res3 = await svc.notifyUserAlternativeTrains({
        email: 'connectkumar17@gmail.com',
        originalTrainNumber: '12734',
        originalTrainName: 'Narayanadri Sf',
        fromStationCode: 'GNT',
        toStationCode: 'TPTY',
        journeyDate: new Date('2026-08-25T00:00:00.000Z'),
        alternativeTrains: altTrains,
      });

      // Assertions: 1st email sent, 2nd and 3rd emails suppressed
      expect(res1.emailSent).toBe(true);
      expect(res2.emailSent).toBe(false);
      expect(res3.emailSent).toBe(false);

      // Crucial: sendEmail was only invoked 1 time total instead of 3 times
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    });

    it('False Case 3: Does NOT falsely suppress emails for different train numbers or different dates', async () => {
      const svc = new NotificationService(
        mockConfig({ wasenderKey: 'ws_test' }),
        mockStationCache(),
        undefined,
        undefined,
        undefined,
        dedupService,
      );

      const sendEmailSpy = jest.spyOn(svc, 'sendEmail').mockResolvedValue(true);

      // Alert for Train 12815 on 2026-08-25
      const res1 = await svc.notifyUser({
        email: 'user@example.com',
        task: {
          trainNumber: '12815',
          trainName: 'Nandan Kanan Exp',
          fromStationCode: 'MZP',
          toStationCode: 'ANVT',
          journeyDate: new Date('2026-08-25T00:00:00.000Z'),
        },
        result: successEmptyPlan,
      });

      // Alert for Train 12734 on 2026-08-25 (different train number)
      const res2 = await svc.notifyUser({
        email: 'user@example.com',
        task: {
          trainNumber: '12734',
          trainName: 'Narayanadri Sf',
          fromStationCode: 'GNT',
          toStationCode: 'TPTY',
          journeyDate: new Date('2026-08-25T00:00:00.000Z'),
        },
        result: successEmptyPlan,
      });

      // Alert for Train 12815 on 2026-08-28 (different date)
      const res3 = await svc.notifyUser({
        email: 'user@example.com',
        task: {
          trainNumber: '12815',
          trainName: 'Nandan Kanan Exp',
          fromStationCode: 'MZP',
          toStationCode: 'ANVT',
          journeyDate: new Date('2026-08-28T00:00:00.000Z'),
        },
        result: successEmptyPlan,
      });

      // All distinct trains/dates must send successfully
      expect(res1.emailSent).toBe(true);
      expect(res2.emailSent).toBe(true);
      expect(res3.emailSent).toBe(true);
      expect(sendEmailSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('sendTatkalAlertConfirmation', () => {
    it('sends Tatkal alert confirmation email with proper parameters', async () => {
      const svc = new NotificationService(mockConfig(), mockStationCache());
      const sendEmailSpy = jest.spyOn(svc, 'sendEmail').mockResolvedValue(true);

      const result = await svc.sendTatkalAlertConfirmation({
        email: 'passenger@example.com',
        category: 'AC',
        journeyDate: '2026-09-15',
        tatkalDate: '2026-09-14',
        tatkalTime: '10:00:00 AM IST',
        trainNumber: '12951',
        trainName: 'Mumbai Rajdhani',
      });

      expect(result.emailSent).toBe(true);
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
      expect(sendEmailSpy).toHaveBeenCalledWith(
        'passenger@example.com',
        expect.stringContaining(
          'AC Classes Opens on 2026-09-14 at 10:00:00 AM IST',
        ),
        expect.stringContaining('Your AC Classes Tatkal Alert Is Active!'),
      );
    });
  });

  describe('notifyChartPrepared', () => {
    const chartPreparedParams = {
      email: 'a@example.com',
      mobile: '919999999999',
      trainNumber: '12310',
      trainName: 'RJPB TEJAS RAJ',
      journeyDate: new Date('2026-09-05T00:00:00.000Z'),
      chartPreparationText: 'Chart for 12310 was prepared at 16:30 IST.',
    };

    it('sends the chart-prepared email and WhatsApp with a check-tickets shortlink', async () => {
      const svc = new NotificationService(
        mockConfig(),
        mockStationCache(),
        undefined,
        {
          createShortLink: jest.fn().mockImplementation(({ url, payload }) => {
            expect(url).toContain('/search?');
            expect(url).toContain('trainNo=12310');
            expect(url).toContain('date=2026-09-05');
            expect(payload).toMatchObject({
              type: 'chart_prepared_check_tickets',
              trainNumber: '12310',
            });
            return Promise.resolve('https://lastberth.com/s/abc123');
          }),
        } as never,
      );
      const sendEmail = jest.spyOn(svc, 'sendEmail').mockResolvedValue(true);
      const sendWhatsApp = jest
        .spyOn(svc, 'sendWhatsApp')
        .mockResolvedValue(true);

      const out = await svc.notifyChartPrepared(chartPreparedParams);

      expect(out).toEqual({ emailSent: true, whatsappSent: true });
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendWhatsApp).toHaveBeenCalledTimes(1);

      const [, subject, html] = sendEmail.mock.calls[0];
      expect(subject).toContain('Chart prepared for 12310 RJPB TEJAS RAJ');
      expect(html).toContain('The chart has been prepared for train 12310 RJPB TEJAS RAJ for Chart for 12310 was prepared at 16:30 IST.');
      expect(html).toContain('Check for available tickets on');
      expect(html).toContain('https://lastberth.com/s/abc123');

      const [, whatsAppText] = sendWhatsApp.mock.calls[0];
      expect(whatsAppText).toContain('The chart has been prepared for train 12310 RJPB TEJAS RAJ for Chart for 12310 was prepared at 16:30 IST.');
      expect(whatsAppText).toContain('Check for available tickets on https://lastberth.com/s/abc123');
    });

    it('returns both flags false when no contact is provided', async () => {
      const svc = new NotificationService(mockConfig(), mockStationCache());
      const out = await svc.notifyChartPrepared({
        ...chartPreparedParams,
        email: undefined,
        mobile: undefined,
      });
      expect(out).toEqual({ emailSent: false, whatsappSent: false });
    });

    it('returns both flags false when the recipient has unsubscribed', async () => {
      const svc = new NotificationService(
        mockConfig(),
        mockStationCache(),
        undefined,
        undefined,
        undefined,
        undefined,
        {
          isUnsubscribed: jest.fn().mockResolvedValue(true),
        } as never,
      );
      const sendEmail = jest.spyOn(svc, 'sendEmail').mockResolvedValue(true);
      const out = await svc.notifyChartPrepared(chartPreparedParams);
      expect(out).toEqual({ emailSent: false, whatsappSent: false });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('sends only WhatsApp when no email is provided', async () => {
      const svc = new NotificationService(
        mockConfig(),
        mockStationCache(),
        undefined,
        {
          createShortLink: jest
            .fn()
            .mockResolvedValue('https://lastberth.com/s/abc'),
        } as never,
      );
      const sendEmail = jest.spyOn(svc, 'sendEmail').mockResolvedValue(true);
      const sendWhatsApp = jest
        .spyOn(svc, 'sendWhatsApp')
        .mockResolvedValue(true);

      const out = await svc.notifyChartPrepared({
        ...chartPreparedParams,
        email: undefined,
      });

      expect(out).toEqual({ emailSent: false, whatsappSent: true });
      expect(sendEmail).not.toHaveBeenCalled();
      expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    });
  });
});
