import { normalizeE164Mobile } from './notification.helpers';
import {
  renderSeatsFoundEmailHtml,
  renderChartPreparedNoDestinationEmailHtml,
} from './templates/notification-email.templates';
import { renderAdminMonitoringEmailHtml } from './templates';
import { buildChartPreparedNoDestinationWhatsAppText } from './templates/notification-whatsapp.templates';
import { buildNoSeatsWhatsAppText } from './templates/no-seats.template';

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

  describe('renderChartPreparedNoDestinationEmailHtml', () => {
    it('renders the train label, date, chart preparation text and a check-tickets CTA', () => {
      const html = renderChartPreparedNoDestinationEmailHtml({
        trainNumber: '12310',
        trainName: 'RJPB TEJAS RAJ',
        formattedDateTime: '5th Sep, 04:30 PM',
        checkTicketsUrl: 'https://lastberth.com/s/abc123',
      });
      expect(html).toContain(
        'The chart has been prepared for train 12310 RJPB TEJAS RAJ at 5th Sep, 04:30 PM',
      );
      expect(html).toContain('Check for available tickets on');
      expect(html).toContain('https://lastberth.com/s/abc123');
      expect(html).not.toContain('Unsubscribe');
    });

    it('renders the unsubscribe link when provided', () => {
      const html = renderChartPreparedNoDestinationEmailHtml({
        trainNumber: '12310',
        trainName: null,
        formattedDateTime: '5th Sep, 04:30 PM',
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
        formattedDateTime: '5th Sep, 04:30 PM',
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
        formattedDateTime: '5th Sep, 04:30 PM',
        checkTicketsUrl: 'https://lastberth.com/s/abc',
      });
      expect(text).toBe(
        'The chart has been prepared for train 12310 RJPB TEJAS RAJ at 5th Sep, 04:30 PM\n\nCheck for available tickets on https://lastberth.com/s/abc',
      );
    });

    it('appends the unsubscribe line when provided', () => {
      const text = buildChartPreparedNoDestinationWhatsAppText({
        trainNumber: '12310',
        trainName: null,
        formattedDateTime: '5th Sep, 04:30 PM',
        checkTicketsUrl: 'https://lastberth.com/s/abc',
        unsubscribeUrl: 'https://lastberth.com/s/unsub',
      });
      expect(text).toContain('Unsubscribe: https://lastberth.com/s/unsub');
    });
  });

  describe('renderAdminMonitoringEmailHtml', () => {
    const baseParams = {
      journeyRequestId: 'jid-1',
      taskCount: 2,
      trainNumber: '20111',
      trainName: 'VANDE BHARAT EXP',
      fromStationCode: 'NDLS',
      toStationCode: 'BSB',
      journeyDate: '2026-09-16',
      classCode: 'CC',
    };

    it('shows payment details when the request was paid', () => {
      const html = renderAdminMonitoringEmailHtml({
        ...baseParams,
        payment: {
          ref: 'pay-ref-1',
          status: 'PAID',
          amount: 5,
          currency: 'INR',
          razorpayPaymentId: 'pay_RZP123',
          razorpayOrderId: 'order_RZP123',
          paidAt: '2026-09-15T10:00:00.000Z',
        },
      });
      expect(html).toContain('Paid');
      expect(html).toContain('pay-ref-1');
      expect(html).toContain('pay_RZP123');
      expect(html).toContain('order_RZP123');
    });

    it('marks the request as free when no payment is linked', () => {
      const html = renderAdminMonitoringEmailHtml({
        ...baseParams,
        payment: null,
      });
      expect(html).toContain('free request');
      expect(html).not.toContain('Razorpay payment ID');
    });
  });

  describe('buildNoSeatsWhatsAppText', () => {
    it('matches the requested WhatsApp format with chart time, route, date, and search link', () => {
      const text = buildNoSeatsWhatsAppText({
        trainLabel: '12435 Garib Rath Exp',
        fromCode: 'DDU',
        toCode: 'ANVT',
        date: '2026-09-18',
        chartTime: '7:30 PM',
        searchUrl: 'https://lastberth.com/s/3d6fc70',
        unsubscribeUrl: 'https://lastberth.com/unsubscribe',
      });

      expect(text).toBe(
        '*12435 Garib Rath Exp Chart Alert : 7:30 PM* 🔔\n\n' +
          'No Tickets Found from DDU > ANVT\n' +
          'Date: Fri, 18th September\n\n' +
          'Look for other trains which have confirmed tickets - \n' +
          'https://lastberth.com/s/3d6fc70',
      );
      expect(text).not.toContain('unsubscribe');
    });

    it('handles refund line when refundInfo is provided', () => {
      const text = buildNoSeatsWhatsAppText({
        trainLabel: '12435 Garib Rath Exp',
        fromCode: 'DDU',
        toCode: 'ANVT',
        date: '2026-09-18',
        chartTime: '19:30',
        searchUrl: 'https://lastberth.com/s/3d6fc70',
        refundInfo: {
          attempted: true,
          outcome: 'succeeded',
          amount: 10,
        },
      });

      expect(text).toContain('*12435 Garib Rath Exp Chart Alert : 7:30 PM* 🔔');
      expect(text).toContain('No Tickets Found from DDU > ANVT');
      expect(text).toContain('✅ Refund issued: ₹10');
      expect(text).toContain(
        'Look for other trains which have confirmed tickets - \nhttps://lastberth.com/s/3d6fc70',
      );
    });
  });
});
