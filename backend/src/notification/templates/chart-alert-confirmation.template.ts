import { escapeHtml, formatJourneyDateReadable } from '../notification.helpers';

export interface ChartAlertConfirmationParams {
  email?: string;
  mobile?: string;
  trainNumber: string;
  trainName?: string;
  fromStationCode: string;
  toStationCode?: string;
  journeyDate: string;
  classCode: string;
  amount?: number;
  paymentRef?: string;
}

export function renderChartAlertConfirmationEmailHtml(
  params: ChartAlertConfirmationParams,
): string {
  const {
    trainNumber,
    trainName,
    fromStationCode,
    toStationCode,
    journeyDate,
    classCode,
    amount,
    paymentRef,
  } = params;

  const trainLabel = trainName
    ? `${trainName} (${trainNumber})`
    : `Train ${trainNumber}`;
  const routeLabel = toStationCode
    ? `${fromStationCode} ➔ ${toStationCode}`
    : `${fromStationCode} (Boarding Station)`;
  const readableDate = formatJourneyDateReadable(journeyDate);
  const normalizedClass = (classCode || 'All Classes').trim().toUpperCase();

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chart Alert Confirmed - LastBerth</title>
</head>
<body style="margin:0; padding:0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background:#f8fafc; color:#334155;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;">
    <tr>
      <td style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px; margin:0 auto; background:#ffffff; border-radius:16px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">

          <!-- Header -->
          <tr>
            <td style="padding:28px 28px 20px 28px; background:linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); text-align:left;">
              <span style="display:inline-block; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#93c5fd; margin-bottom:8px;">
                🔔 LASTBERTH CHART ALERT
              </span>
              <h1 style="margin:0; font-size:22px; font-weight:800; color:#ffffff; line-height:1.3;">
                Your Chart Alert Is Active!
              </h1>
              <p style="margin:8px 0 0 0; font-size:14px; color:#dbeafe; line-height:1.4;">
                We'll monitor chart preparation and notify you the moment seats are released.
              </p>
            </td>
          </tr>

          <!-- Core Details Card -->
          <tr>
            <td style="padding:24px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0; padding:16px;">
                <tr>
                  <td>
                    <p style="margin:0 0 2px 0; font-size:12px; font-weight:700; text-transform:uppercase; color:#64748b; letter-spacing:0.5px;">Train</p>
                    <p style="margin:0 0 12px 0; font-size:16px; font-weight:700; color:#0f172a;">${escapeHtml(trainLabel)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:10px; border-top:1px dashed #cbd5e1;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50%" style="vertical-align:top; padding-bottom:10px;">
                          <p style="margin:0; font-size:11px; font-weight:700; text-transform:uppercase; color:#64748b;">Route</p>
                          <p style="margin:2px 0 0 0; font-size:14px; font-weight:600; color:#0f172a;">${escapeHtml(routeLabel)}</p>
                        </td>
                        <td width="50%" style="vertical-align:top; padding-bottom:10px;">
                          <p style="margin:0; font-size:11px; font-weight:700; text-transform:uppercase; color:#64748b;">Journey Date</p>
                          <p style="margin:2px 0 0 0; font-size:14px; font-weight:600; color:#0f172a;">${escapeHtml(readableDate)}</p>
                        </td>
                      </tr>
                      <tr>
                        <td width="50%" style="vertical-align:top;">
                          <p style="margin:0; font-size:11px; font-weight:700; text-transform:uppercase; color:#64748b;">Class</p>
                          <p style="margin:2px 0 0 0; font-size:14px; font-weight:600; color:#0284c7;">${escapeHtml(normalizedClass)}</p>
                        </td>
                        <td width="50%" style="vertical-align:top;">
                          <p style="margin:0; font-size:11px; font-weight:700; text-transform:uppercase; color:#64748b;">Payment Status</p>
                          <p style="margin:2px 0 0 0; font-size:14px; font-weight:600; color:#16a34a;">Paid ${amount ? `(₹${amount})` : '✓'}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${
                  paymentRef
                    ? `<tr>
                  <td style="padding-top:8px; border-top:1px dashed #cbd5e1;">
                    <p style="margin:0; font-size:11px; color:#94a3b8;">Ref ID: ${escapeHtml(paymentRef)}</p>
                  </td>
                </tr>`
                    : ''
                }
              </table>

              <!-- What Happens Next -->
              <h3 style="margin:24px 0 12px 0; font-size:15px; font-weight:700; color:#0f172a;">
                ⚡ What Happens Next:
              </h3>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px; color:#475569; line-height:1.5;">
                <tr>
                  <td style="padding:4px 0; vertical-align:top; width:24px;">1.</td>
                  <td style="padding:4px 0;"><strong>Chart Preparation:</strong> IRCTC usually finalizes the reservation chart <strong>4 to 8 hours before train departure</strong>.</td>
                </tr>
                <tr>
                  <td style="padding:4px 0; vertical-align:top; width:24px;">2.</td>
                  <td style="padding:4px 0;"><strong>Real-time Berth Discovery:</strong> Any unallocated quota berths or last-minute cancellations get released for current booking.</td>
                </tr>
                <tr>
                  <td style="padding:4px 0; vertical-align:top; width:24px;">3.</td>
                  <td style="padding:4px 0;"><strong>Instant Notification:</strong> As soon as the chart is prepared and vacant seats are detected, we will alert you via email / WhatsApp so you can book immediately.</td>
                </tr>
              </table>

              <!-- Action CTA -->
              <div style="margin:28px 0 16px 0; text-align:center;">
                <a href="https://lastberth.com" target="_blank" style="display:inline-block; background:#2563eb; color:#ffffff; font-size:14px; font-weight:700; text-decoration:none; padding:12px 28px; border-radius:10px; box-shadow:0 2px 4px rgba(37,99,235,0.2);">
                  Visit LastBerth &rarr;
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 28px; background:#f8fafc; border-top:1px solid #e2e8f0; text-align:center; font-size:11px; color:#94a3b8;">
              <p style="margin:0;">LastBerth is an independent rail discovery tool and is not affiliated with IRCTC or Indian Railways.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildChartAlertConfirmationWhatsAppText(
  params: ChartAlertConfirmationParams,
): string {
  const {
    trainNumber,
    trainName,
    fromStationCode,
    toStationCode,
    journeyDate,
    classCode,
    amount,
  } = params;

  const trainLabel = trainName
    ? `${trainName} (${trainNumber})`
    : `Train ${trainNumber}`;
  const routeLabel = toStationCode
    ? `${fromStationCode} ➔ ${toStationCode}`
    : `${fromStationCode} (Boarding Station)`;
  const readableDate = formatJourneyDateReadable(journeyDate);
  const normalizedClass = (classCode || 'All Classes').trim().toUpperCase();
  const paymentLine = amount ? `\n💳 *Payment:* ₹${amount} (Confirmed)` : '';

  return (
    `🔔 *LastBerth Chart Alert Confirmed*\n\n` +
    `Your chart alert is now active! We are monitoring chart preparation and available berths.\n\n` +
    `🚆 *Train:* ${trainLabel}\n` +
    `📍 *Route:* ${routeLabel}\n` +
    `📅 *Journey Date:* ${readableDate}\n` +
    `🎫 *Class:* ${normalizedClass}${paymentLine}\n\n` +
    `⚡ *What happens next?*\n` +
    `IRCTC typically prepares charts 4 to 8 hours before departure. We'll alert you right here as soon as the chart is prepared and vacant seats open up.\n\n` +
    `🔗 https://lastberth.com`
  );
}
