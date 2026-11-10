import {
  type ChartAlertConfirmationParams,
  renderChartAlertConfirmationEmailHtml,
} from './chart-alert-confirmation.template';

const params: ChartAlertConfirmationParams = {
  email: 'passenger@example.com',
  trainNumber: '11061',
  trainName: 'LTT JAYNAGAR EXP',
  fromStationCode: 'KYN',
  toStationCode: 'NYN',
  journeyDate: '2026-11-05',
  classCode: ' sl ',
  amount: 10,
  paymentRef: 'payment_123',
  chartTimes: [
    { chartAt: '2026-11-04T15:15:00.000Z' },
    { chartAt: '2026-11-05T05:30:00.000Z' },
  ],
};

describe('chart alert confirmation email', () => {
  it('renders the journey, payment, and chart times in the customer-facing design', () => {
    const html = renderChartAlertConfirmationEmailHtml(params);

    expect(html).toContain('<html lang="en">');
    expect(html).toContain('Monitoring active');
    expect(html).toContain('LTT JAYNAGAR EXP (11061)');
    expect(html).toContain('Boarding');
    expect(html).toContain('KYN');
    expect(html).toContain('Destination');
    expect(html).toContain('NYN');
    expect(html).toContain('Thu, 5th November');
    expect(html).toContain('>SL</td>');
    expect(html).toContain('₹10 paid');
    expect(html).toContain('Payment reference:<br>payment_123');
    expect(html).toContain('Chart 1');
    expect(html).toContain('Chart 2');
    expect(html).toContain('4 Nov 2026, 8:45 PM');
    expect(html).toContain('5 Nov 2026, 11:00 AM');
    expect(html).toContain('All times in IST (India Standard Time).');
    expect(html).toContain('aria-label="Chart preparation schedule"');
    expect(html).toContain('scope="row"');
    expect(html).toContain('href="https://lastberth.com"');
    expect(html).toContain('not a confirmed ticket');
    expect(html).not.toContain('Exact chart times are not available yet');
  });

  it('renders a single supplied schedule without inventing a second chart', () => {
    const html = renderChartAlertConfirmationEmailHtml({
      ...params,
      chartTimes: [
        { label: 'Final chart', formattedDateTime: '5 Nov 2026, 11:00 AM' },
      ],
    });

    expect(html).toContain('Final chart');
    expect(html).toContain('5 Nov 2026, 11:00 AM');
    expect(html).not.toContain('Chart 2');
  });

  it.each([undefined, [], [{}]])(
    'handles an unavailable schedule (%j) without claiming an exact time',
    (chartTimes) => {
      const html = renderChartAlertConfirmationEmailHtml({
        ...params,
        chartTimes,
      });

      expect(html).toContain('Exact chart times are not available yet.');
      expect(html).not.toContain('aria-label="Chart preparation schedule"');
      expect(html).not.toContain('4 to 8 hours');
    },
  );

  it('omits optional journey and payment fields when absent', () => {
    const html = renderChartAlertConfirmationEmailHtml({
      ...params,
      trainName: undefined,
      toStationCode: undefined,
      classCode: '',
      amount: undefined,
      paymentRef: undefined,
    });

    expect(html).toContain('Train 11061');
    expect(html).toContain('KYN');
    expect(html).toContain('ALL CLASSES');
    expect(html).not.toContain('Destination');
    expect(html).not.toContain('&rarr;</td>');
    expect(html).not.toContain('Payment reference:');
    expect(html).not.toContain('₹');
    expect(html).not.toContain('undefined');
  });

  it.each([
    [undefined, 'by email.'],
    ['', 'by email.'],
    ['   ', 'by email.'],
    ['9876543210', 'by email and WhatsApp.'],
  ])('describes only the subscribed channels (%j)', (mobile, expected) => {
    const html = renderChartAlertConfirmationEmailHtml({ ...params, mobile });

    expect(html).toContain(expected);
  });

  it('links a bold, prefilled refund request near the end', () => {
    const html = renderChartAlertConfirmationEmailHtml(params);

    expect(html).toContain(
      '<strong>If you have had any issues, please raise a refund request using <a href="https://lastberth.com/refund?train=11061&amp;date=2026-11-05&amp;email=passenger%40example.com&amp;txn=payment_123" style="color:#2563eb;">https://lastberth.com/refund</a>.</strong>',
    );
  });

  it('omits email and txn from the refund link when absent', () => {
    const html = renderChartAlertConfirmationEmailHtml({
      ...params,
      email: undefined,
      paymentRef: undefined,
    });

    expect(html).toContain(
      'href="https://lastberth.com/refund?train=11061&amp;date=2026-11-05"',
    );
  });

  it('escapes dynamic content in the preview, journey, payment, and schedule', () => {
    const html = renderChartAlertConfirmationEmailHtml({
      ...params,
      trainNumber: '11061<',
      trainName: '<img src=x onerror=alert(1)>',
      fromStationCode: 'KYN<',
      toStationCode: 'NYN&',
      classCode: '<sl>',
      paymentRef: 'ref"<script>alert(1)</script>',
      chartTimes: [
        { label: '<Chart>', formattedDateTime: '5 Nov & <11:00 AM>' },
      ],
    });

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('11061&lt;');
    expect(html).toContain('KYN&lt;');
    expect(html).toContain('NYN&amp;');
    expect(html).toContain('&lt;SL&gt;');
    expect(html).toContain('ref&quot;&lt;script&gt;');
    expect(html).toContain('&lt;Chart&gt;');
    expect(html).toContain('5 Nov &amp; &lt;11:00 AM&gt;');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
  });
});
