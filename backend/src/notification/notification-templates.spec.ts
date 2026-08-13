import { normalizeE164Mobile } from './notification.helpers';
import { renderSeatsFoundEmailHtml } from './templates/notification-email.templates';
import { buildWatiTemplateParameters } from './templates/notification-whatsapp.templates';

describe('Notification Templates & Helpers', () => {
  describe('normalizeE164Mobile', () => {
    it('formats 10-digit Indian numbers with 91 prefix', () => {
      expect(normalizeE164Mobile('9999224767')).toBe('919999224767');
      expect(normalizeE164Mobile('+91 9999224767')).toBe('919999224767');
    });

    it('preserves country code if already present', () => {
      expect(normalizeE164Mobile('919999224767')).toBe('919999224767');
    });
  });

  describe('renderSeatsFoundEmailHtml', () => {
    it('renders email HTML containing train label and fare', () => {
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
      expect(params.find((p) => p.name === 'train_number')?.value).toBe('11408');
    });

    it('builds 10 parameters for uncovered_leg__shortlink_alert', () => {
      const params = buildWatiTemplateParameters('uncovered_leg__shortlink_alert', {
        trainNumber: '11408',
        trainName: 'LJN PUNE EXP',
        fromStationCode: 'CNB',
        toStationCode: 'PUNE',
        journeyDateReadable: 'Thu, 13th August',
      });

      expect(params).toHaveLength(10);
      expect(params.find((p) => p.name === 'action_button_text')?.value).toBe('Check Seat Availability');
    });
  });
});
