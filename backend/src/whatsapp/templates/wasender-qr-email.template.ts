import { escapeHtml } from '../../notification/templates/notification-email.templates';

export interface WasenderQrEmailParams {
  sessionId: string;
  status: string;
  qrDataUrl?: string;
  qrRawString?: string;
  instructions?: string;
  timestamp?: string;
}

export function renderWasenderQrEmailHtml(
  params: WasenderQrEmailParams,
): string {
  const {
    sessionId,
    status,
    qrDataUrl,
    qrRawString,
    timestamp = new Date().toISOString(),
  } = params;

  const escapedStatus = escapeHtml(status.toUpperCase());
  const escapedSessionId = escapeHtml(sessionId);
  const escapedTimestamp = escapeHtml(timestamp);

  const qrImageSection = qrDataUrl
    ? `
    <div style="text-align:center;margin:24px 0;">
      <div style="display:inline-block;padding:16px;background:#ffffff;border:2px solid #e2e8f0;border-radius:12px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
        <img src="${qrDataUrl}" alt="WhatsApp Reconnect QR Code" width="300" height="300" style="display:block;margin:0 auto;max-width:100%;height:auto;" />
      </div>
      <p style="color:#64748b;font-size:12px;margin-top:8px;">Scan this QR code with WhatsApp on your phone within 60 seconds.</p>
    </div>`
    : `
    <div style="background-color:#fef2f2;border:1px solid #fecaca;padding:16px;border-radius:8px;margin:20px 0;text-align:center;">
      <p style="color:#991b1b;font-weight:600;margin:0;">⚠️ QR Code image could not be rendered directly.</p>
      ${qrRawString ? `<p style="color:#7f1d1d;font-size:12px;margin-top:8px;font-family:monospace;word-break:break-all;">Raw: ${escapeHtml(qrRawString)}</p>` : ''}
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>WhatsApp Disconnected - Scan QR Code</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:#0f172a;background-color:#f8fafc;margin:0;padding:24px;">
  <div style="max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 10px 15px -3px rgba(0,0,0,0.05);">
    <!-- Header -->
    <div style="background:linear-gradient(135deg, #25D366 0%, #128C7E 100%);padding:24px;text-align:center;color:#ffffff;">
      <h1 style="margin:0;font-size:22px;font-weight:700;letter-spacing:-0.025em;">WhatsApp Reconnection Required</h1>
      <p style="margin:6px 0 0 0;font-size:14px;opacity:0.95;">Your Wasender WhatsApp session is disconnected or logged out.</p>
    </div>

    <div style="padding:24px;">
      <!-- Alert Banner -->
      <div style="background-color:#fff7ed;border-left:4px solid #f97316;padding:12px 16px;margin-bottom:20px;border-radius:0 6px 6px 0;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="color:#9a3412;font-weight:600;font-size:14px;">Status: <strong style="color:#c2410c;">${escapedStatus}</strong></span>
          <span style="color:#9a3412;font-size:12px;background:#ffedd5;padding:2px 8px;border-radius:9999px;">Session #${escapedSessionId}</span>
        </div>
      </div>

      <!-- QR Code Section -->
      ${qrImageSection}

      <!-- Instructions -->
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-top:20px;">
        <h3 style="margin:0 0 12px 0;font-size:15px;color:#1e293b;font-weight:600;">📱 How to Reconnect:</h3>
        <ol style="margin:0;padding-left:20px;color:#475569;font-size:14px;line-height:1.6;">
          <li style="margin-bottom:6px;">Open <strong>WhatsApp</strong> on your phone.</li>
          <li style="margin-bottom:6px;">Go to <strong>Settings</strong> (iOS) or tap the <strong>Three Dots ⋮</strong> (Android) &gt; <strong>Linked Devices</strong>.</li>
          <li style="margin-bottom:6px;">Tap <strong>Link a Device</strong>.</li>
          <li style="margin-bottom:0;">Point your phone camera at the QR code above.</li>
        </ol>
      </div>

      <!-- Footer Info -->
      <div style="margin-top:24px;border-top:1px solid #f1f5f9;padding-top:16px;font-size:12px;color:#94a3b8;text-align:center;">
        <p style="margin:0 0 4px 0;">Detected by Wasender Healthcheck Job</p>
        <p style="margin:0;">Timestamp: ${escapedTimestamp}</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}
