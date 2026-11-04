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
  const readableDate = formatJourneyDateReadable(journeyDate);
  const normalizedClass = (classCode || 'All Classes').trim().toUpperCase();
  const notificationChannels = params.mobile?.trim()
    ? 'email and WhatsApp'
    : 'email';

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

  const scheduleHtml = formattedSchedule.length
    ? `<p style="margin:4px 0 12px; font-size:12px; color:#64748b;">All times in IST (India Standard Time).</p>
       <table aria-label="Chart preparation schedule" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed; border-collapse:collapse; font-size:14px; line-height:1.5;">
         ${formattedSchedule
           .map(
             (s) => `<tr>
               <th scope="row" width="36%" style="padding:12px 8px 12px 0; border-top:1px solid #e2e8f0; text-align:left; vertical-align:top; font-weight:600; color:#2563eb; overflow-wrap:anywhere;">${escapeHtml(s.label)}</th>
               <td style="padding:12px 0; border-top:1px solid #e2e8f0; vertical-align:top; font-weight:600; color:#0f172a; overflow-wrap:anywhere;">${escapeHtml(s.timeStr)}</td>
             </tr>`,
           )
           .join('')}
       </table>`
    : `<p style="margin:8px 0 0; font-size:14px; line-height:1.6; color:#475569;">Exact chart times are not available yet. We’ll monitor chart preparation for your train.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chart Alert Active - LastBerth</title>
</head>
<body style="margin:0; padding:0; font-family:'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background:#f8fafc; color:#0f172a; -webkit-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">Your chart alert for ${escapeHtml(trainLabel)} is active. We’ll notify you if vacant seats are found.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; margin:0 auto; table-layout:fixed; border-radius:16px; border:1px solid #e2e8f0; background:#ffffff;">
          <tr>
            <td style="padding:20px 24px; border-bottom:1px solid #f1f5f9;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td><a href="https://lastberth.com" style="color:#2563eb; font-size:20px; font-weight:600; letter-spacing:-0.5px; text-decoration:none;">LastBerth</a></td>
                  <td align="right" style="color:#64748b; font-size:12px;">Chart alert</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 12px;"><span style="display:inline-block; padding:4px 8px; border-radius:6px; background:#ecfdf5; color:#047857; font-size:12px; font-weight:600; line-height:1.5;">&#10003; Monitoring active</span></p>
              <h1 style="margin:0; font-size:26px; line-height:1.25; letter-spacing:-0.5px; font-weight:700; color:#0f172a;">Your chart alert is active</h1>
              <p style="margin:8px 0 24px; font-size:14px; line-height:1.6; color:#475569;">You’re all set. We’ll watch for vacant seats when your train’s chart is prepared.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed; border:1px solid #e2e8f0; border-radius:12px; background:#f8fafc;">
                <tr>
                  <td style="padding:16px;">
                    <p style="margin:0 0 16px; font-size:16px; line-height:1.5; font-weight:700; color:#0f172a; overflow-wrap:anywhere;">${escapeHtml(trainLabel)}</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;">
                      <tr>
                        <td style="color:#64748b; font-size:11px;">Boarding</td>
                        ${toStationCode ? '<td width="32" rowspan="2" align="center" style="color:#94a3b8; font-size:20px;">&rarr;</td><td align="right" style="color:#64748b; font-size:11px;">Destination</td>' : ''}
                      </tr>
                      <tr>
                        <td style="padding-top:4px; color:#2563eb; font-size:24px; font-weight:700; letter-spacing:-0.5px; overflow-wrap:anywhere;">${escapeHtml(fromStationCode)}</td>
                        ${toStationCode ? `<td align="right" style="padding-top:4px; color:#2563eb; font-size:24px; font-weight:700; letter-spacing:-0.5px; overflow-wrap:anywhere;">${escapeHtml(toStationCode)}</td>` : ''}
                      </tr>
                    </table>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px; border-top:1px solid #e2e8f0; table-layout:fixed;">
                      <tr>
                        <td width="68%" style="padding:12px 12px 0 0; color:#64748b; font-size:11px;">Journey date</td>
                        <td style="padding-top:12px; color:#64748b; font-size:11px;">Class</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 12px 0 0; color:#0f172a; font-size:13px; line-height:1.5; font-weight:600; overflow-wrap:anywhere;">${escapeHtml(readableDate)}</td>
                        <td style="padding-top:4px; vertical-align:top; color:#0f172a; font-size:13px; line-height:1.5; font-weight:600; overflow-wrap:anywhere;">${escapeHtml(normalizedClass)}</td>
                      </tr>
                    </table>
                    ${amount ? `<p style="margin:12px 0 0; padding-top:12px; border-top:1px solid #e2e8f0; font-size:12px; line-height:1.5; color:#475569;">Alert subscription <strong style="color:#047857;">&middot; ₹${escapeHtml(String(amount))} paid</strong></p>` : ''}
                    ${paymentRef ? `<p style="margin:8px 0 0; font-size:11px; line-height:1.5; color:#64748b; overflow-wrap:anywhere; word-break:break-all;">Payment reference:<br>${escapeHtml(paymentRef)}</p>` : ''}
                  </td>
                </tr>
              </table>
              <h2 style="margin:24px 0 0; font-size:16px; line-height:1.5; font-weight:700; color:#0f172a;">Chart preparation schedule</h2>
              ${scheduleHtml}
              <h2 style="margin:24px 0 12px; font-size:16px; line-height:1.5; font-weight:700; color:#0f172a;">What happens next?</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px; line-height:1.6; color:#475569;">
                <tr>
                  <td width="28" style="padding:0 0 12px; vertical-align:top; font-weight:600; color:#2563eb;">01</td>
                  <td style="padding:0 0 12px;"><strong style="color:#0f172a;">We check for seats</strong><br>We’ll scan for vacant seats and cancellations at chart preparation.</td>
                </tr>
                <tr>
                  <td width="28" style="vertical-align:top; font-weight:600; color:#2563eb;">02</td>
                  <td><strong style="color:#0f172a;">You get notified</strong><br>If seats are found, we’ll send you booking links by ${notificationChannels}.</td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                <tr>
                  <td align="center" bgcolor="#2563eb" style="border-radius:8px; mso-padding-alt:14px 24px;">
                    <a href="https://lastberth.com" style="display:block; padding:14px 24px; border-radius:8px; color:#ffffff; font-size:14px; line-height:20px; font-weight:600; text-decoration:none;">Visit LastBerth &rarr;</a>
                  </td>
                </tr>
              </table>
              <p style="margin:12px 0 0; font-size:12px; line-height:1.5; color:#64748b; text-align:center;">This is an alert subscription, not a confirmed ticket.<br>Seats are subject to availability at the time of booking.</p>
            </td>
          </tr>
        </table>
        <table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; margin:0 auto;">
          <tr><td style="padding:20px 12px 0; font-size:11px; line-height:1.6; color:#64748b; text-align:center;">You received this because you asked LastBerth to monitor chart preparation.</td></tr>
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
