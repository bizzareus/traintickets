import { normalizeE164Mobile } from './notification.helpers';
import {
  renderSeatsFoundEmailHtml,
  renderChartPreparedNoDestinationEmailHtml,
} from './templates/notification-email.templates';
import {
  buildWatiTemplateParameters,
  buildChartPreparedNoDestinationWhatsAppText,
} from './templates/notification-whatsapp.templates';

describe('Notification Templates & Helpers', () => {
  describe('normalizeE164Mobile', () => {
    it('formats 10-digit Indian numbers with 91 prefix', () => {
      expect(normalizeE164Mobile('9999224767')).toBe('919999224767');
      expect(normalizeE164Mobile('+91 9999224767')).toBe('919999224767');
    });

    it('trims leading zeroes and attaches 91 prefix', () => {
      expect(normalizeE164Mobile('09712640278')).toBe('919712640278');
      expect(normalizeE164Mobile('009712640278')).toBe('919712640278');
      expect(normalizeE164Mobile('+91 09712640278')).toBe('919712640278');
      expect(normalizeE164Mobile('00919712640278')).toBe('919712640278');
    });

    it('preserves country code if already present', () => {
      expect(normalizeE164Mobile('919999224767')).toBe('919999224767');
    });
  });

  describe('renderSeatsFoundEmailHtml', () => {
    it('renders email HTML containing train label and fare without Book quickly line', () => {
      const html = renderSeatsFoundEmailHtml({
        cardRowsHtml: '<tr><td>Ticket 1</td></tr>',
        totalPrice: 450,
        trainLabel: '11408 LJN PUNE EXP',
        routeDisplay: 'CNB → PUNE',
        journeyDateReadable: 'Thu, 13th August',
      });

      expect(html).toContain('11408 LJN PUNE EXP');
      expect(html).toContain('CNB → PUNE');
      expect(html).toContain('450');
      expect(html).not.toContain('Book quickly — seats can sell out fast.');
    });

    it('renders partial journey notice when provided', () => {
      const notice =
        'You can purchase multiple tickets and for journey ticket not available you can buy it on board from TTE based on realtime availability in the train';
      const html = renderSeatsFoundEmailHtml({
        cardRowsHtml: '<tr><td>Ticket 1</td></tr>',
        totalPrice: 450,
        trainLabel: '11408 LJN PUNE EXP',
        routeDisplay: 'CNB → PUNE',
        journeyDateReadable: 'Thu, 13th August',
        partialJourneyNotice: notice,
      });

      expect(html).toContain(notice);
    });
  });

  describe('buildWatiTemplateParameters', () => {
    it('builds 13 parameters for subscription_alert', () => {
      const params = buildWatiTemplateParameters('subscription_alert', {
        trainNumber: '11408',
        trainName: 'LJN PUNE EXP',
        fromStationCode: 'CNB',
        toStationCode: 'PUNE',
        journeyDateReadable: 'Thu, 13th August',
      });

      expect(params).toHaveLength(13);
      expect(params.find((p) => p.name === 'train_number')?.value).toBe(
        '11408',
      );
    });

    it('builds 10 parameters for uncovered_leg__shortlink_alert', () => {
      const params = buildWatiTemplateParameters(
        'uncovered_leg__shortlink_alert',
        {
          trainNumber: '11408',
          trainName: 'LJN PUNE EXP',
          fromStationCode: 'CNB',
          toStationCode: 'PUNE',
          journeyDateReadable: 'Thu, 13th August',
        },
      );

      expect(params).toHaveLength(10);
      expect(params.find((p) => p.name === 'action_button_text')?.value).toBe(
        'Check Seat Availability',
      );
    });
  });

  describe('renderChartPreparedNoDestinationEmailHtml', () => {
    it('renders the train label, date, chart preparation text and a check-tickets CTA', () => {
      const html = renderChartPreparedNoDestinationEmailHtml({
        trainNumber: '12310',
        trainName: 'RJPB TEJAS RAJ',
        formattedDateTime: '05-09 04:30 pm',
        checkTicketsUrl: 'https://lastberth.com/s/abc123',
      });
      expect(html).toContain('The chart has been prepared for train 12310 RJPB TEJAS RAJ for 05-09 04:30 pm');
      expect(html).toContain('Check for available tickets on');
      expect(html).toContain('https://lastberth.com/s/abc123');
      expect(html).not.toContain('Unsubscribe');
    });

    it('renders the unsubscribe link when provided', () => {
      const html = renderChartPreparedNoDestinationEmailHtml({
        trainNumber: '12310',
        trainName: null,
        formattedDateTime: '05-09 04:30 pm',
        checkTicketsUrl: 'https://lastberth.com/s/abc',
        unsubscribeUrl: 'https://lastberth.com/s/unsub',
      });
      expect(html).toContain('Unsubscribe');
      expect(html).toContain('https://lastberth.com/s/unsub');
    });

    it('escapes the check-tickets URL to prevent HTML injection', () => {
      const html = renderChartPreparedNoDestinationEmailHtml({
        trainNumber: '12310',
        trainName: null,
        formattedDateTime: '05-09 04:30 pm',
        checkTicketsUrl: 'https://lastberth.com/s/" onerror="alert(1)',
      });
      expect(html).toContain('&quot;');
      expect(html).not.toContain('onerror="alert(1)');
    });
  });

  describe('buildChartPreparedNoDestinationWhatsAppText', () => {
    it('renders the train, date, chart preparation text and check-tickets link in exact format', () => {
      const text = buildChartPreparedNoDestinationWhatsAppText({
        trainNumber: '12310',
        trainName: 'RJPB TEJAS RAJ',
        formattedDateTime: '05-09 04:30 pm',
        checkTicketsUrl: 'https://lastberth.com/s/abc',
      });
      expect(text).toBe(
        'The chart has been prepared for train 12310 RJPB TEJAS RAJ for 05-09 04:30 pm\n\nCheck for available tickets on https://lastberth.com/s/abc',
      );
    });

    it('appends the unsubscribe line when provided', () => {
      const text = buildChartPreparedNoDestinationWhatsAppText({
        trainNumber: '12310',
        trainName: null,
        formattedDateTime: '05-09 04:30 pm',
        checkTicketsUrl: 'https://lastberth.com/s/abc',
        unsubscribeUrl: 'https://lastberth.com/s/unsub',
      });
      expect(text).toContain('Unsubscribe: https://lastberth.com/s/unsub');
    });
  });
});
