import { renderManualRefundProcessedEmailHtml } from './manual-refund-processed.template';

describe('renderManualRefundProcessedEmailHtml', () => {
  const baseParams = {
    email: 'passenger@example.com',
    amount: 5,
    refundId: 'rfnd_razorpay_999',
    paymentId: 'pay_razorpay_123',
    trainNumber: '18048',
    trainName: 'Amaravati Express',
    fromStationCode: 'VSKP',
    toStationCode: 'HWH',
    journeyDate: '2026-11-12',
    classCode: '3A',
  };

  it('renders refund details, alert details and Razorpay IDs matching LastBerth design standards', () => {
    const html = renderManualRefundProcessedEmailHtml(baseParams);

    expect(html).toContain('<html lang="en">');
    expect(html).toContain('Refund notification');
    expect(html).toContain('Refund processed');
    expect(html).toContain('Your payment has been refunded');
    expect(html).toContain('₹5');
    expect(html).toContain('rfnd_razorpay_999');
    expect(html).toContain('pay_razorpay_123');
    expect(html).toContain('Amaravati Express (18048)');
    expect(html).toContain('Thu, 12th November');
    expect(html).toContain('VSKP');
    expect(html).toContain('HWH');
    expect(html).toContain('&rarr;');
    expect(html).toContain('3A');
    expect(html).toContain('5–7 business days');
    expect(html).toContain('Refund submitted to bank');
    expect(html).toContain('Bank account credit');
    expect(html).toContain('Visit LastBerth &rarr;');
    expect(html).toContain('support@lastberth.com');
  });

  it('handles optional fields gracefully without breaking', () => {
    const html = renderManualRefundProcessedEmailHtml({
      email: 'user@test.com',
      amount: 10,
      refundId: 'rfnd_simple_1',
      trainNumber: '12951',
      journeyDate: '2026-12-01',
    });

    expect(html).toContain('Train 12951');
    expect(html).toContain('rfnd_simple_1');
    expect(html).toContain('₹10');
    expect(html).not.toContain('Original payment ID');
    expect(html).not.toContain('Boarding');
    expect(html).toContain('ALL CLASSES');
  });

  it('escapes user input to prevent XSS injection', () => {
    const html = renderManualRefundProcessedEmailHtml({
      email: 'user@test.com',
      amount: 5,
      refundId: 'rfnd_<script>alert(1)</script>',
      paymentId: 'pay_"onload="evil()',
      trainNumber: '12345',
      trainName: 'Test <Train>',
      journeyDate: '2026-11-12',
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('"onload="evil()');
    expect(html).toContain('Test &lt;Train&gt; (12345)');
  });
});
