import { escapeHtml } from '../notification.helpers';

export function renderAlertFailureEmailHtml(params: {
  alertType: string;
  recipientMobile?: string | null;
  recipientEmail?: string | null;
  trainNumber?: string | null;
  trainName?: string | null;
  fromStationCode?: string | null;
  toStationCode?: string | null;
  journeyDate?: string | Date | null;
  failureReason: string;
  logs?: string | null;
  payload?: any;
}): string {
  const trainLabel = [params.trainNumber, params.trainName]
    .filter(Boolean)
    .join(' ');
  const routeLabel = [params.fromStationCode, params.toStationCode]
    .filter(Boolean)
    .join(' → ');
  const dateStr =
    params.journeyDate instanceof Date
      ? params.journeyDate.toISOString().slice(0, 10)
      : String(params.journeyDate || '').slice(0, 10);

  const formattedPayload = params.payload
    ? escapeHtml(
        typeof params.payload === 'string'
          ? params.payload
          : JSON.stringify(params.payload, null, 2),
      )
    : undefined;

  const formattedLogs = params.logs
    ? escapeHtml(params.logs)
    : escapeHtml(params.failureReason);

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#0f172a;background-color:#f8fafc;padding:20px;">
  <div style="max-width:650px;margin:0 auto;background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background-color:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;margin-bottom:20px;border-radius:0 4px 4px 0;">
      <h2 style="color:#991b1b;margin:0 0 4px 0;font-size:18px;">⚠️ Alert Delivery Failure Report</h2>
      <p style="color:#7f1d1d;margin:0;font-size:14px;">An alert failed to deliver. Details and failure logs are attached below.</p>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px;">
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:8px;color:#64748b;font-weight:600;width:140px;">Alert Type</td>
        <td style="padding:8px;font-weight:600;color:#0f172a;">${escapeHtml(params.alertType)}</td>
      </tr>
      ${
        params.recipientMobile
          ? `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px;color:#64748b;font-weight:600;">Recipient Mobile</td><td style="padding:8px;color:#0f172a;">${escapeHtml(
              params.recipientMobile,
            )}</td></tr>`
          : ''
      }
      ${
        params.recipientEmail
          ? `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px;color:#64748b;font-weight:600;">Recipient Email</td><td style="padding:8px;color:#0f172a;">${escapeHtml(
              params.recipientEmail,
            )}</td></tr>`
          : ''
      }
      ${
        trainLabel
          ? `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px;color:#64748b;font-weight:600;">Train</td><td style="padding:8px;color:#0f172a;">${escapeHtml(
              trainLabel,
            )}</td></tr>`
          : ''
      }
      ${
        routeLabel
          ? `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px;color:#64748b;font-weight:600;">Route</td><td style="padding:8px;color:#0f172a;">${escapeHtml(
              routeLabel,
            )}</td></tr>`
          : ''
      }
      ${
        dateStr
          ? `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px;color:#64748b;font-weight:600;">Journey Date</td><td style="padding:8px;color:#0f172a;">${escapeHtml(
              dateStr,
            )}</td></tr>`
          : ''
      }
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:8px;color:#64748b;font-weight:600;">Failure Reason</td>
        <td style="padding:8px;color:#dc2626;font-weight:600;">${escapeHtml(params.failureReason)}</td>
      </tr>
      <tr>
        <td style="padding:8px;color:#64748b;font-weight:600;">Timestamp</td>
        <td style="padding:8px;color:#475569;">${new Date().toISOString()}</td>
      </tr>
    </table>

    <h3 style="color:#334155;margin:20px 0 8px 0;font-size:15px;">Failure Logs & Trace</h3>
    <pre style="background:#0f172a;color:#f8fafc;padding:12px;border-radius:6px;font-size:12px;overflow-x:auto;white-space:pre-wrap;font-family:monospace;">${formattedLogs}</pre>

    ${
      formattedPayload
        ? `
    <h3 style="color:#334155;margin:20px 0 8px 0;font-size:15px;">Alert Context & Payload</h3>
    <pre style="background:#f1f5f9;color:#334155;padding:12px;border-radius:6px;font-size:12px;overflow-x:auto;white-space:pre-wrap;font-family:monospace;border:1px solid #e2e8f0;">${formattedPayload}</pre>
    `
        : ''
    }
  </div>
</body>
</html>`;
}

export function renderAdminMonitoringEmailHtml(params: {
  journeyRequestId: string;
  taskCount: number;
  trainNumber: string;
  trainName?: string;
  fromStationCode: string;
  toStationCode: string;
  journeyDate: string;
  classCode: string;
  stationCodesToMonitor?: string[];
  userEmail?: string;
  userMobile?: string;
}): string {
  const trainLabel = [params.trainNumber, params.trainName]
    .filter(Boolean)
    .join(' ');
  const stationsLine =
    params.stationCodesToMonitor?.length &&
    params.stationCodesToMonitor.length > 0
      ? escapeHtml(params.stationCodesToMonitor.join(', '))
      : 'All stations with chart times on route';
  const contactLines: string[] = [];
  if (params.userEmail?.trim()) {
    contactLines.push(`Email: ${escapeHtml(params.userEmail.trim())}`);
  }
  if (params.userMobile?.trim()) {
    contactLines.push(`Mobile: ${escapeHtml(params.userMobile.trim())}`);
  }
  const contactBlock =
    contactLines.length > 0
      ? `<p style="margin:12px 0 0 0;"><strong>Contact</strong><br/>${contactLines.join('<br/>')}</p>`
      : '<p style="margin:12px 0 0 0;color:#64748b;">No email or mobile on the request.</p>';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a;">
  <p><strong>Someone requested journey monitoring</strong> via <code>POST /api/availability/journey</code>.</p>
  <table style="border-collapse:collapse;margin-top:8px;font-size:14px;">
    <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Journey request ID</td><td><code>${escapeHtml(params.journeyRequestId)}</code></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Tasks created</td><td>${params.taskCount}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Train</td><td>${escapeHtml(trainLabel)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Route</td><td>${escapeHtml(params.fromStationCode)} → ${escapeHtml(params.toStationCode)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Journey date</td><td>${escapeHtml(params.journeyDate)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Class</td><td>${escapeHtml(params.classCode)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;vertical-align:top;color:#64748b;">Stations</td><td>${stationsLine}</td></tr>
  </table>
  ${contactBlock}
</body>
</html>`;
}
