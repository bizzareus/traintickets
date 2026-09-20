import { DateTime } from 'luxon';
import { escapeHtml, formatJourneyDateReadable } from '../notification.helpers';

export interface ChartTimeScheduleItem {
  label?: string; // e.g. "Chart 1", "Chart 2"
  chartAt?: Date | string;
  formattedDateTime?: string; // e.g. "21 Sep 2026, 8:00 PM"
}

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
  chartTimes?: ChartTimeScheduleItem[];
}

export function formatChartAtDateTime(chartAt: Date | string): string {
  const dt =
    chartAt instanceof Date
      ? DateTime.fromJSDate(chartAt, { zone: 'Asia/Kolkata' })
      : DateTime.fromISO(String(chartAt), { zone: 'Asia/Kolkata' });
  if (!dt.isValid) return String(chartAt);
  return dt.toFormat('d LLL yyyy, h:mm a');
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
    chartTimes,
  } = params;

  const trainLabel = trainName
    ? `${trainName} (${trainNumber})`
    : `Train ${trainNumber}`;
  const routeLabel = toStationCode
    ? `${fromStationCode} ➔ ${toStationCode}`
    : `${fromStationCode} (Boarding Station)`;
  const readableDate = formatJourneyDateReadable(journeyDate);
  const normalizedClass = (classCode || 'All Classes').trim().toUpperCase();

  const formattedSchedule = (chartTimes || [])
    .map((item, idx) => {
      const label =
        item.label ||
        (chartTimes && chartTimes.length > 1 ? `Chart ${idx + 1}` : 'Chart 1');
      const timeStr =
        item.formattedDateTime ||
        (item.chartAt ? formatChartAtDateTime(item.chartAt) : '');
      return { label, timeStr };
    })
    .filter((s) => Boolean(s.timeStr));

  let scheduleHtml = '';
  if (formattedSchedule.length >= 2) {
    scheduleHtml = `
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin:20px 0 0 0;">
                <p style="margin:0 0 6px 0; font-size:13px; font-weight:700; color:#0f172a;">⏰ Chart Preparation Schedule (2 Times):</p>
                <p style="margin:0 0 8px 0; font-size:13px; color:#475569; line-height:1.4;">The reservation chart for this train is prepared <strong>2 times</strong> before departure:</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px; color:#1e293b;">
                  ${formattedSchedule
                    .map(
                      (s) =>
                        `<tr>
                          <td style="padding:3px 0; width:80px; font-weight:700; color:#2563eb;">${escapeHtml(s.label)}:</td>
                          <td style="padding:3px 0; font-weight:600; color:#0f172a;">${escapeHtml(s.timeStr)}</td>
                        </tr>`,
                    )
                    .join('')}
                </table>
              </div>`;
  } else if (formattedSchedule.length === 1) {
    scheduleHtml = `
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin:20px 0 0 0;">
                <p style="margin:0 0 6px 0; font-size:13px; font-weight:700; color:#0f172a;">⏰ Chart Preparation Schedule:</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px; color:#1e293b;">
                  <tr>
                    <td style="padding:3px 0; width:80px; font-weight:700; color:#2563eb;">${escapeHtml(formattedSchedule[0].label)}:</td>
                    <td style="padding:3px 0; font-weight:600; color:#0f172a;">${escapeHtml(formattedSchedule[0].timeStr)}</td>
                  </tr>
                </table>
              </div>`;
  } else {
    scheduleHtml = `
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin:20px 0 0 0;">
                <p style="margin:0 0 4px 0; font-size:13px; font-weight:700; color:#0f172a;">⏰ Chart Preparation:</p>
                <p style="margin:0; font-size:13px; color:#475569; line-height:1.4;">IRCTC usually finalizes the chart <strong>4 to 8 hours before departure</strong>.</p>
              </div>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chart Alert Active - LastBerth</title>
</head>
<body style="margin:0; padding:0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background:#f1f5f9; color:#334155;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
    <tr>
      <td style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; margin:0 auto; border-radius:16px; border:1px solid #e2e8f0; background:#ffffff; box-shadow:0 4px 6px -1px rgba(0,0,0,0.08); overflow:hidden;">
          <tr>
            <td style="padding:24px 24px 20px;">
              <p style="margin:0; font-size:11px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:#2563eb;">LastBerth Chart Alert</p>
              <h1 style="margin:8px 0 0 0; font-size:20px; font-weight:700; color:#0f172a;">Your Chart Alert Is Active!</h1>
              <p style="margin:12px 0 0 0; font-size:16px; font-weight:700; color:#0f172a;">${escapeHtml(trainLabel)}</p>
              <p style="margin:4px 0 0 0; font-size:14px; color:#64748b;">${escapeHtml(routeLabel)}</p>
              <p style="margin:4px 0 0 0; font-size:14px; color:#334155;">Journey Date: <strong>${escapeHtml(readableDate)}</strong></p>
              <p style="margin:4px 0 0 0; font-size:14px; color:#334155;">Class: <strong>${escapeHtml(normalizedClass)}</strong>${amount ? ` &bull; Paid: <strong style="color:#16a34a;">₹${amount}</strong>` : ''}</p>
              ${paymentRef ? `<p style="margin:4px 0 0 0; font-size:11px; color:#94a3b8;">Ref ID: ${escapeHtml(paymentRef)}</p>` : ''}
              ${scheduleHtml}
              <p style="margin:20px 0 8px 0; font-size:14px; font-weight:700; color:#0f172a;">⚡ What Happens Next?</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px; color:#475569; line-height:1.5;">
                <tr>
                  <td style="padding:4px 0; vertical-align:top; width:20px; font-weight:700; color:#2563eb;">1.</td>
                  <td style="padding:4px 0;"><strong>We will find you tickets at chart prepare:</strong> Our system will automatically monitor chart preparation and scan for unallocated quota seats and cancellations.</td>
                </tr>
                <tr>
                  <td style="padding:4px 0; vertical-align:top; width:20px; font-weight:700; color:#2563eb;">2.</td>
                  <td style="padding:4px 0;"><strong>Instant Notification:</strong> The moment vacant seats are discovered, you will receive an immediate alert via email / WhatsApp with direct booking links.</td>
                </tr>
                ${
                  amount
                    ? `<tr>
                  <td style="padding:4px 0; vertical-align:top; width:20px; font-weight:700; color:#2563eb;">3.</td>
                  <td style="padding:4px 0;"><strong>Automated Refund:</strong> If no confirmed tickets are found after chart preparation, your subscription fee of ₹${amount} is automatically refunded.</td>
                </tr>`
                    : ''
                }
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px;">
              <a href="https://lastberth.com" style="display:inline-block; padding:12px 24px; border-radius:12px; background:#2563eb; color:#ffffff; font-size:14px; font-weight:600; text-decoration:none;">Visit LastBerth</a>
            </td>
          </tr>
        </table>
        <p style="margin:24px 0 0 0; font-size:11px; color:#94a3b8; text-align:center;">You received this because you asked LastBerth to monitor chart preparation.</p>
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
    paymentRef,
    chartTimes,
  } = params;

  const trainLabel = trainName
    ? `${trainName} (${trainNumber})`
    : `Train ${trainNumber}`;
  const routeLabel = toStationCode
    ? `${fromStationCode} ➔ ${toStationCode}`
    : `${fromStationCode} (Boarding Station)`;
  const readableDate = formatJourneyDateReadable(journeyDate);
  const normalizedClass = (classCode || 'All Classes').trim().toUpperCase();
  const paymentLine =
    amount || paymentRef
      ? `\n💳 *Payment:* ${amount ? `₹${amount} (Confirmed)` : 'Confirmed'}${paymentRef ? `\n🧾 *Payment ID:* ${paymentRef}` : ''}`
      : '';

  const formattedSchedule = (chartTimes || [])
    .map((item, idx) => {
      const label =
        item.label ||
        (chartTimes && chartTimes.length > 1 ? `Chart ${idx + 1}` : 'Chart 1');
      const timeStr =
        item.formattedDateTime ||
        (item.chartAt ? formatChartAtDateTime(item.chartAt) : '');
      return { label, timeStr };
    })
    .filter((s) => Boolean(s.timeStr));

  let scheduleWhatsapp = '';
  if (formattedSchedule.length >= 2) {
    scheduleWhatsapp =
      `⏰ *Chart Preparation Schedule (2 Times):*\n` +
      `The chart for this train is prepared 2 times:\n` +
      formattedSchedule.map((s) => `• *${s.label}:* ${s.timeStr}`).join('\n');
  } else if (formattedSchedule.length === 1) {
    scheduleWhatsapp =
      `⏰ *Chart Preparation Schedule:*\n` +
      `• *${formattedSchedule[0].label}:* ${formattedSchedule[0].timeStr}`;
  } else {
    scheduleWhatsapp =
      `⏰ *Chart Preparation:*\n` +
      `IRCTC typically prepares charts 4 to 8 hours before departure.`;
  }

  return (
    `🔔 *LastBerth Chart Alert Active*\n\n` +
    `Your chart alert is now active! We will monitor chart preparation and find you tickets at the time of chart prepare.\n\n` +
    `🚆 *Train:* ${trainLabel}\n` +
    `📍 *Route:* ${routeLabel}\n` +
    `📅 *Journey Date:* ${readableDate}\n` +
    `🎫 *Class:* ${normalizedClass}${paymentLine}\n\n` +
    `${scheduleWhatsapp}\n\n` +
    `⚡ *What happens next?*\n` +
    `We will automatically monitor seat availability and find you tickets at the time of chart prepare. As soon as the chart is prepared and vacant seats are released, you'll receive an instant alert right here with direct booking links!\n\n` +
    `🔗 https://lastberth.com`
  );
}
