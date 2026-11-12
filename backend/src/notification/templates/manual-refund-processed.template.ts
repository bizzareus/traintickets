import { escapeHtml, formatJourneyDateReadable } from '../notification.helpers';

export interface ManualRefundProcessedEmailParams {
  email: string;
  amount: number;
  refundId: string;
  paymentId?: string;
  trainNumber: string;
  trainName?: string;
  fromStationCode?: string;
  toStationCode?: string;
  journeyDate: string;
  classCode?: string;
}

export function renderManualRefundProcessedEmailHtml(
  params: ManualRefundProcessedEmailParams,
): string {
  const {
    amount,
    refundId,
    paymentId,
    trainNumber,
    trainName,
    fromStationCode,
    toStationCode,
    journeyDate,
    classCode,
  } = params;

  const trainLabel = trainName?.trim()
    ? `Train ${trainNumber} (${trainName.trim()})`
    : `Train ${trainNumber}`;
  const readableDate = formatJourneyDateReadable(journeyDate);
  const route =
    fromStationCode && toStationCode
      ? `${fromStationCode.trim()} → ${toStationCode.trim()}`
      : fromStationCode?.trim() || toStationCode?.trim() || '';
  const normalizedClass = classCode?.trim()
    ? classCode.trim().toUpperCase()
    : 'All Classes';

  const refundRows: Array<[string, string]> = [
    ['Refund ID (Razorpay)', refundId],
    ...(paymentId ? [['Original Payment ID', paymentId] as [string, string]] : []),
    ['Refund Amount', `₹${amount}`],
  ];

  const alertRows: Array<[string, string]> = [
    ['Train', trainLabel],
    ['Date of Journey', readableDate],
    ...(route ? [['Route', route] as [string, string]] : []),
    ['Class', normalizedClass],
  ];

  const renderTableRows = (rows: Array<[string, string]>) =>
    rows
      .map(
        ([label, value]) => `<tr>
          <td style="padding:8px 12px 8px 0; color:#64748b; font-size:13px; font-weight:500; vertical-align:top; white-space:nowrap;">${escapeHtml(label)}</td>
          <td style="padding:8px 0; font-size:13px; font-weight:600; color:#0f172a; vertical-align:top; overflow-wrap:anywhere; word-break:break-all;">${escapeHtml(value)}</td>
        </tr>`,
      )
      .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Refund Processed - LastBerth</title>
</head>
<body style="margin:0; padding:0; font-family:'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background:#f8fafc; color:#0f172a; -webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background:#ffffff; border-radius:16px; border:1px solid #e2e8f0; box-shadow:0 1px 3px rgba(0,0,0,0.05); overflow:hidden; text-align:left;">
          <!-- Header -->
          <tr>
            <td style="padding:28px 24px 20px; border-bottom:1px solid #f1f5f9;">
              <p style="margin:0; font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#2563eb;">LastBerth</p>
              <h1 style="margin:8px 0 0; font-size:22px; font-weight:700; color:#0f172a; line-height:1.3;">Your payment has been refunded 💸</h1>
            </td>
          </tr>

          <!-- Message -->
          <tr>
            <td style="padding:24px 24px 16px;">
              <p style="margin:0; font-size:15px; line-height:1.6; color:#334155;">
                We have processed a refund of <strong style="color:#0f172a;">₹${amount}</strong> for your chart alert request.
              </p>
              <p style="margin:10px 0 0; font-size:14px; line-height:1.6; color:#475569;">
                The amount has been refunded to your original payment method via Razorpay. It usually reflects in your account within <strong>5–7 business days</strong> depending on your bank's processing timelines.
              </p>
            </td>
          </tr>

          <!-- Refund Summary Box -->
          <tr>
            <td style="padding:0 24px 16px;">
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px 20px;">
                <p style="margin:0 0 10px; font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#475569;">Refund Details</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  ${renderTableRows(refundRows)}
                </table>
              </div>
            </td>
          </tr>

          <!-- Alert Details Box -->
          <tr>
            <td style="padding:0 24px 24px;">
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px 20px;">
                <p style="margin:0 0 10px; font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#475569;">Chart Alert Details</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  ${renderTableRows(alertRows)}
                </table>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 24px 28px; background:#fafafa; border-top:1px solid #e2e8f0;">
              <p style="margin:0; font-size:13px; line-height:1.5; color:#64748b;">
                Questions about this refund? Reply directly to this email or reach us at
                <a href="mailto:support@lastberth.com" style="color:#2563eb; text-decoration:none; font-weight:500;">support@lastberth.com</a>.
              </p>
            </td>
          </tr>
        </table>

        <!-- Sub-footer -->
        <p style="margin:16px 0 0; font-size:12px; color:#94a3b8; text-align:center;">
          © ${new Date().getFullYear()} LastBerth · Confirm waitlisted train tickets
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
