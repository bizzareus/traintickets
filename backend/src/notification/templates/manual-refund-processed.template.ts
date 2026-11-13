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
    ? `${trainName.trim()} (${trainNumber.trim()})`
    : `Train ${trainNumber.trim()}`;
  const readableDate = formatJourneyDateReadable(journeyDate);
  const normalizedClass = (classCode || 'All Classes').trim().toUpperCase();

  const previewText = `Your refund of ₹${amount} for ${trainLabel} has been processed.`;

  const stationRouteBlock = fromStationCode
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;">
        <tr>
          <td style="color:#64748b; font-size:11px;">Boarding</td>
          ${
            toStationCode
              ? '<td width="32" rowspan="2" align="center" style="color:#94a3b8; font-size:20px;">&rarr;</td><td align="right" style="color:#64748b; font-size:11px;">Destination</td>'
              : ''
          }
        </tr>
        <tr>
          <td style="padding-top:4px; color:#2563eb; font-size:24px; font-weight:700; letter-spacing:-0.5px; overflow-wrap:anywhere;">${escapeHtml(fromStationCode)}</td>
          ${
            toStationCode
              ? `<td align="right" style="padding-top:4px; color:#2563eb; font-size:24px; font-weight:700; letter-spacing:-0.5px; overflow-wrap:anywhere;">${escapeHtml(toStationCode)}</td>`
              : ''
          }
        </tr>
      </table>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Refund Processed - LastBerth</title>
</head>
<body style="margin:0; padding:0; font-family:'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background:#f8fafc; color:#0f172a; -webkit-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">${escapeHtml(previewText)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; margin:0 auto; table-layout:fixed; border-radius:16px; border:1px solid #e2e8f0; background:#ffffff;">
          <!-- Top bar with LastBerth logo link and category label -->
          <tr>
            <td style="padding:20px 24px; border-bottom:1px solid #f1f5f9;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td><a href="https://lastberth.com" style="color:#2563eb; font-size:20px; font-weight:600; letter-spacing:-0.5px; text-decoration:none;">LastBerth</a></td>
                  <td align="right" style="color:#64748b; font-size:12px;">Refund notification</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding:24px;">
              <!-- Status pill -->
              <p style="margin:0 0 12px;"><span style="display:inline-block; padding:4px 8px; border-radius:6px; background:#ecfdf5; color:#047857; font-size:12px; font-weight:600; line-height:1.5;">&#10003; Refund processed</span></p>

              <!-- Heading & Subtitle -->
              <h1 style="margin:0; font-size:26px; line-height:1.25; letter-spacing:-0.5px; font-weight:700; color:#0f172a;">Your payment has been refunded</h1>
              <p style="margin:8px 0 24px; font-size:14px; line-height:1.6; color:#475569;">
                We have refunded <strong style="color:#0f172a;">₹${escapeHtml(String(amount))}</strong> to your original payment method via Razorpay. It usually reflects in your account within <strong>5–7 business days</strong> depending on your bank.
              </p>

              <!-- Train / Alert Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed; border:1px solid #e2e8f0; border-radius:12px; background:#f8fafc;">
                <tr>
                  <td style="padding:16px;">
                    <p style="margin:0 0 16px; font-size:16px; line-height:1.5; font-weight:700; color:#0f172a; overflow-wrap:anywhere;">${escapeHtml(trainLabel)}</p>
                    ${stationRouteBlock}
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${fromStationCode ? 'margin-top:16px; border-top:1px solid #e2e8f0;' : ''} table-layout:fixed;">
                      <tr>
                        <td width="68%" style="padding:12px 12px 0 0; color:#64748b; font-size:11px;">Journey date</td>
                        <td style="padding-top:12px; color:#64748b; font-size:11px;">Class</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 12px 0 0; color:#0f172a; font-size:13px; line-height:1.5; font-weight:600; overflow-wrap:anywhere;">${escapeHtml(readableDate)}</td>
                        <td style="padding-top:4px; vertical-align:top; color:#0f172a; font-size:13px; line-height:1.5; font-weight:600; overflow-wrap:anywhere;">${escapeHtml(normalizedClass)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Refund Details Box -->
              <h2 style="margin:24px 0 12px; font-size:16px; line-height:1.5; font-weight:700; color:#0f172a;">Refund details</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed; border:1px solid #e2e8f0; border-radius:12px; background:#f8fafc;">
                <tr>
                  <td style="padding:16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed; font-size:13px; line-height:1.5;">
                      <tr>
                        <td style="padding:6px 12px 6px 0; color:#64748b; font-weight:500;">Refund amount</td>
                        <td align="right" style="padding:6px 0; color:#047857; font-weight:700; font-size:15px;">₹${escapeHtml(String(amount))}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 12px 6px 0; border-top:1px solid #e2e8f0; color:#64748b; font-weight:500;">Refund ID (Razorpay)</td>
                        <td align="right" style="padding:6px 0; border-top:1px solid #e2e8f0; color:#0f172a; font-weight:600; font-family:monospace; font-size:12px; overflow-wrap:anywhere; word-break:break-all;">${escapeHtml(refundId)}</td>
                      </tr>
                      ${
                        paymentId
                          ? `<tr>
                        <td style="padding:6px 12px 6px 0; border-top:1px solid #e2e8f0; color:#64748b; font-weight:500;">Original payment ID</td>
                        <td align="right" style="padding:6px 0; border-top:1px solid #e2e8f0; color:#0f172a; font-weight:600; font-family:monospace; font-size:12px; overflow-wrap:anywhere; word-break:break-all;">${escapeHtml(paymentId)}</td>
                      </tr>`
                          : ''
                      }
                      <tr>
                        <td style="padding:6px 12px 6px 0; border-top:1px solid #e2e8f0; color:#64748b; font-weight:500;">Status</td>
                        <td align="right" style="padding:6px 0; border-top:1px solid #e2e8f0; color:#047857; font-weight:600;">Processed</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- What happens next? -->
              <h2 style="margin:24px 0 12px; font-size:16px; line-height:1.5; font-weight:700; color:#0f172a;">What happens next?</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px; line-height:1.6; color:#475569;">
                <tr>
                  <td width="28" style="padding:0 0 12px; vertical-align:top; font-weight:600; color:#2563eb;">01</td>
                  <td style="padding:0 0 12px;"><strong style="color:#0f172a;">Refund submitted to bank</strong><br>The refund was initiated through Razorpay and forwarded to your issuing bank.</td>
                </tr>
                <tr>
                  <td width="28" style="vertical-align:top; font-weight:600; color:#2563eb;">02</td>
                  <td><strong style="color:#0f172a;">Bank account credit</strong><br>Most banks credit the source account or card within 5–7 business days.</td>
                </tr>
              </table>

              <!-- Primary CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                <tr>
                  <td align="center" bgcolor="#2563eb" style="border-radius:8px; mso-padding-alt:14px 24px;">
                    <a href="https://lastberth.com" style="display:block; padding:14px 24px; border-radius:8px; color:#ffffff; font-size:14px; line-height:20px; font-weight:600; text-decoration:none;">Visit LastBerth &rarr;</a>
                  </td>
                </tr>
              </table>

              <!-- Support Note -->
              <p style="margin:20px 0 0; font-size:13px; line-height:1.6; color:#64748b; text-align:center;">
                Questions about this refund? Reply directly to this email or reach us at <a href="mailto:support@lastberth.com" style="color:#2563eb; text-decoration:none;">support@lastberth.com</a>.
              </p>
            </td>
          </tr>
        </table>

        <!-- Sub-footer -->
        <table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; margin:0 auto;">
          <tr>
            <td style="padding:20px 12px 0; font-size:11px; line-height:1.6; color:#64748b; text-align:center;">
              You received this because a refund was requested and processed for your LastBerth chart alert.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
