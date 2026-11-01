import { escapeHtml } from '../notification.helpers';

export interface AbandonedBookingReminderTemplateParams {
  bookingRef: string;
  trainNumber: string;
  trainName?: string | null;
  fromStationCode: string;
  toStationCode: string;
  journeyDateReadable: string;
  travelClass: string;
  quota: string;
  passengerName: string;
  passengerAge?: number;
  passengerGender?: string;
  totalFare: number;
  legs?: Array<{
    from: string;
    to: string;
    travelClass: string;
    boardingDate?: string;
    fare?: number;
  }>;
  resumeUrl: string;
  unsubscribeUrl?: string;
}

export function renderAbandonedBookingReminderHtml(
  params: AbandonedBookingReminderTemplateParams,
): string {
  const {
    bookingRef,
    trainNumber,
    trainName,
    fromStationCode,
    toStationCode,
    journeyDateReadable,
    travelClass,
    quota,
    passengerName,
    passengerAge,
    passengerGender,
    totalFare,
    legs = [],
    resumeUrl,
    unsubscribeUrl,
  } = params;

  const trainLabel = trainName
    ? `${escapeHtml(trainName)} (${escapeHtml(trainNumber)})`
    : `Train ${escapeHtml(trainNumber)}`;

  const passengerDetails = [
    passengerName,
    passengerAge ? `${passengerAge} yrs` : null,
    passengerGender,
  ]
    .filter(Boolean)
    .map((s) => escapeHtml(String(s)))
    .join(' · ');

  const legRows =
    legs.length > 1
      ? `
      <tr>
        <td style="padding:12px 0 6px; font-size:13px; font-weight:600; color:#475569;">Confirmed Split Itinerary:</td>
      </tr>
      ${legs
        .map(
          (leg, idx) => `
        <tr>
          <td style="padding:6px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; font-size:12px; color:#334155;">
            <strong>Leg ${idx + 1}:</strong> ${escapeHtml(leg.from)} → ${escapeHtml(leg.to)} 
            <span style="color:#64748b;">(${escapeHtml(leg.travelClass)}${leg.fare ? ` · ₹${leg.fare}` : ''})</span>
          </td>
        </tr>`,
        )
        .join('')}
    `
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Complete your train booking - LastBerth</title>
</head>
<body style="margin:0; padding:0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color:#f1f5f9; color:#1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9; padding:24px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px; background:#ffffff; border:1px solid #e2e8f0; border-radius:16px; overflow:hidden; box-shadow:0 10px 25px -5px rgba(0,0,0,0.05);">
          
          <!-- Brand Header -->
          <tr>
            <td style="padding:24px 28px; background:linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); text-align:left;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:22px; font-weight:800; color:#ffffff; letter-spacing:-0.5px;">LastBerth</span>
                    <span style="display:inline-block; margin-left:8px; padding:2px 8px; background:rgba(255,255,255,0.2); border-radius:999px; font-size:10px; font-weight:700; color:#ffffff; text-transform:uppercase; letter-spacing:0.5px; vertical-align:middle;">Official IRCTC Agent</span>
                  </td>
                  <td align="right">
                    <span style="font-size:11px; color:#bfdbfe; font-weight:500;">Ref: ${escapeHtml(bookingRef)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Eyebrow & Headline -->
          <tr>
            <td style="padding:28px 28px 12px;">
              <div style="display:inline-block; padding:4px 10px; background:#fef3c7; border:1px solid #fde68a; border-radius:6px; font-size:11px; font-weight:700; color:#92400e; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:12px;">
                Booking Incomplete
              </div>
              <h1 style="margin:0 0 10px; font-size:22px; font-weight:800; color:#0f172a; line-height:1.25;">
                Finish your booking for ${trainLabel}
              </h1>
              <p style="margin:0; font-size:14px; line-height:1.5; color:#475569;">
                Hi <strong>${escapeHtml(passengerName)}</strong>, you started booking train tickets from <strong>${escapeHtml(fromStationCode)}</strong> to <strong>${escapeHtml(toStationCode)}</strong> on <strong>${escapeHtml(journeyDateReadable)}</strong>, but did not complete payment. Your selected seats and details have been saved for you!
              </p>
            </td>
          </tr>

          <!-- Primary Book Now CTA Button -->
          <tr>
            <td style="padding:16px 28px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(resumeUrl)}" target="_blank" style="display:inline-block; width:100%; box-sizing:border-box; background:#2563eb; color:#ffffff; text-align:center; padding:14px 24px; border-radius:10px; font-size:15px; font-weight:700; text-decoration:none; box-shadow:0 4px 12px rgba(37,99,235,0.3);">
                      Book Now — Confirm Your Berth &rarr;
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:8px 0 0; font-size:12px; color:#64748b; text-align:center;">
                Clicking opens your saved booking details directly. You can edit any details or proceed to pay in 1 click.
              </p>
            </td>
          </tr>

          <!-- Booking Summary Box -->
          <tr>
            <td style="padding:0 28px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:18px;">
                <tr>
                  <td colspan="2" style="padding-bottom:12px; border-bottom:1px solid #e2e8f0;">
                    <div style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.5px;">Saved Reservation Details</div>
                    <div style="font-size:16px; font-weight:700; color:#0f172a; margin-top:2px;">${trainLabel}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0 4px; font-size:13px; color:#64748b;">Route:</td>
                  <td align="right" style="padding:10px 0 4px; font-size:13px; font-weight:600; color:#0f172a;">${escapeHtml(fromStationCode)} &rarr; ${escapeHtml(toStationCode)}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0; font-size:13px; color:#64748b;">Journey Date:</td>
                  <td align="right" style="padding:4px 0; font-size:13px; font-weight:600; color:#0f172a;">${escapeHtml(journeyDateReadable)}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0; font-size:13px; color:#64748b;">Class & Quota:</td>
                  <td align="right" style="padding:4px 0; font-size:13px; font-weight:600; color:#0f172a;">${escapeHtml(travelClass)} (${escapeHtml(quota)})</td>
                </tr>
                <tr>
                  <td style="padding:4px 0 10px; font-size:13px; color:#64748b;">Primary Passenger:</td>
                  <td align="right" style="padding:4px 0 10px; font-size:13px; font-weight:600; color:#0f172a;">${passengerDetails}</td>
                </tr>
                ${legRows}
                <tr>
                  <td style="padding:12px 0 0; border-top:1px dashed #cbd5e1; font-size:14px; font-weight:700; color:#0f172a;">Total Fare:</td>
                  <td align="right" style="padding:12px 0 0; border-top:1px dashed #cbd5e1; font-size:18px; font-weight:800; color:#2563eb;">₹${totalFare.toLocaleString('en-IN')}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Why Complete on LastBerth -->
          <tr>
            <td style="padding:0 28px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #dbeafe; background:#eff6ff; border-radius:10px; padding:14px;">
                <tr>
                  <td>
                    <div style="font-size:13px; font-weight:700; color:#1e40af; margin-bottom:4px;">Why finish booking now?</div>
                    <ul style="margin:0; padding-left:18px; font-size:12px; color:#1e3a8a; line-height:1.6;">
                      <li>Train seats are live on IRCTC and can sell out without prior notice.</li>
                      <li>Your passenger and contact info are saved — finish in less than 60 seconds.</li>
                      <li>Automatic verification & confirmed PNR delivered instantly to WhatsApp and Email.</li>
                    </ul>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Secondary Bottom CTA -->
          <tr>
            <td style="padding:0 28px 28px; text-align:center;">
              <a href="${escapeHtml(resumeUrl)}" target="_blank" style="display:inline-block; background:#0f172a; color:#ffffff; padding:12px 28px; border-radius:8px; font-size:14px; font-weight:600; text-decoration:none;">
                Complete Booking (₹${totalFare.toLocaleString('en-IN')}) &rarr;
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 28px; background:#f8fafc; border-top:1px solid #e2e8f0; text-align:center;">
              <p style="margin:0 0 8px; font-size:12px; color:#64748b;">
                Need help with your booking? Reply to this email or contact us at <a href="mailto:support@lastberth.com" style="color:#2563eb; text-decoration:none;">support@lastberth.com</a>
              </p>
              <p style="margin:0; font-size:11px; color:#94a3b8;">
                &copy; ${new Date().getFullYear()} LastBerth. Official IRCTC Authorized Agent Partner.
                ${
                  unsubscribeUrl
                    ? ` &middot; <a href="${escapeHtml(unsubscribeUrl)}" style="color:#94a3b8; text-decoration:underline;">Unsubscribe</a>`
                    : ''
                }
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
