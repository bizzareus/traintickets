export interface TatkalAlertEmailParams {
  category: "AC" | "NON_AC";
  journeyDateReadable: string;
  tatkalDateReadable: string;
  tatkalTimeFormatted: string;
  masterListFreezeWindow: string;
  recommendedLoginTime: string;
  trainNumber?: string;
  trainName?: string;
  fromStationCode?: string;
  toStationCode?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderTatkalAlertEmailHtml(params: TatkalAlertEmailParams): string {
  const {
    category,
    journeyDateReadable,
    tatkalDateReadable,
    tatkalTimeFormatted,
    masterListFreezeWindow,
    recommendedLoginTime,
    trainNumber,
    trainName,
  } = params;

  const isAc = category === "AC";
  const trainLine = trainNumber
    ? `<p style="margin:6px 0 0 0; font-size:14px; font-weight:600; color:#1e293b;">Train: ${escapeHtml(trainName ? `${trainName} (${trainNumber})` : trainNumber)}</p>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tatkal Booking Alert - LastBerth</title>
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
                🔔 LASTBERTH TATKAL ALERT
              </span>
              <h1 style="margin:0; font-size:22px; font-weight:800; color:#ffffff; line-height:1.3;">
                Your ${isAc ? 'AC Classes' : 'Sleeper / 2S'} Tatkal Alert Is Active!
              </h1>
              <p style="margin:8px 0 0 0; font-size:14px; color:#dbeafe; line-height:1.4;">
                Opens on <strong>${escapeHtml(tatkalDateReadable)}</strong> at <strong>${escapeHtml(tatkalTimeFormatted)}</strong>
              </p>
            </td>
          </tr>

          <!-- Core Details Card -->
          <tr>
            <td style="padding:24px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0; padding:16px;">
                <tr>
                  <td>
                    <p style="margin:0 0 4px 0; font-size:12px; font-weight:700; text-transform:uppercase; color:#64748b; letter-spacing:0.5px;">Journey Date</p>
                    <p style="margin:0; font-size:16px; font-weight:700; color:#0f172a;">${escapeHtml(journeyDateReadable)}</p>
                    ${trainLine}
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:12px; border-top:1px dashed #cbd5e1; margin-top:12px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50%" style="vertical-align:top;">
                          <p style="margin:0; font-size:11px; font-weight:700; text-transform:uppercase; color:#64748b;">Master List Freeze</p>
                          <p style="margin:2px 0 0 0; font-size:13px; font-weight:600; color:#dc2626;">${escapeHtml(masterListFreezeWindow)}</p>
                        </td>
                        <td width="50%" style="vertical-align:top;">
                          <p style="margin:0; font-size:11px; font-weight:700; text-transform:uppercase; color:#64748b;">Recommended Login</p>
                          <p style="margin:2px 0 0 0; font-size:13px; font-weight:600; color:#0284c7;">${escapeHtml(recommendedLoginTime)}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- 60-Second Speed Checklist -->
              <h3 style="margin:24px 0 12px 0; font-size:15px; font-weight:700; color:#0f172a;">
                ⚡ 60-Second Tatkal Speed Checklist:
              </h3>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px; color:#475569; line-height:1.5;">
                <tr>
                  <td style="padding:4px 0; vertical-align:top; width:20px;">1.</td>
                  <td style="padding:4px 0;"><strong>Pre-save Passenger Details:</strong> Add all names to your IRCTC Master List before <strong>${escapeHtml(masterListFreezeWindow.split('–')[0].trim())}</strong>.</td>
                </tr>
                <tr>
                  <td style="padding:4px 0; vertical-align:top; width:20px;">2.</td>
                  <td style="padding:4px 0;"><strong>Fastest Payment Mode:</strong> Use <strong>UPI Dynamic QR</strong> or <strong>IRCTC iMudra Wallet</strong> to bypass bank SMS OTP latency.</td>
                </tr>
                <tr>
                  <td style="padding:4px 0; vertical-align:top; width:20px;">3.</td>
                  <td style="padding:4px 0;"><strong>Aadhaar Verified:</strong> Ensure your IRCTC ID is Aadhaar-linked for smooth peak-hour booking.</td>
                </tr>
              </table>

              <!-- Action CTA -->
              <div style="margin:28px 0 16px 0; text-align:center;">
                <a href="https://www.irctc.co.in/nget/train-search" target="_blank" style="display:inline-block; background:#2563eb; color:#ffffff; font-size:14px; font-weight:700; text-decoration:none; padding:12px 28px; border-radius:10px; box-shadow:0 2px 4px rgba(37,99,235,0.2);">
                  Open IRCTC Train Booking &rarr;
                </a>
              </div>

              <!-- Backup Strategy -->
              <div style="background:#eff6ff; border-radius:10px; padding:14px 16px; border:1px solid #bfdbfe; margin-top:20px;">
                <p style="margin:0; font-size:12px; color:#1e40af; line-height:1.5;">
                  <strong>💡 What if Tatkal sells out?</strong> Don't panic! Check <a href="https://lastberth.com" style="color:#1d4ed8; font-weight:700; text-decoration:underline;">Finding Smart Seats</a> to get guaranteed confirmed split-berths on the exact same train without paying surge pricing.
                </p>
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
