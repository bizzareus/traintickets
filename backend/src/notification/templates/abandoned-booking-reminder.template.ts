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
    passengerAge ? `${passengerAge}y` : null,
    passengerGender,
  ]
    .filter(Boolean)
    .map((s) => escapeHtml(String(s)))
    .join(' · ');

  const currentYear = new Date().getFullYear();

  // Split ticket contiguous legs visual card list (if multiple legs exist)
  const isSplitBooking = legs.length > 1;
  const splitLegsHtml = isSplitBooking
    ? `
      <tr>
        <td style="padding:14px 20px 8px; background:#f0fdf4; border-top:1px solid #dcfce7; border-bottom:1px solid #dcfce7;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <span style="font-size:11px; font-weight:800; color:#15803d; text-transform:uppercase; letter-spacing:0.5px;">
                  ✓ Contiguous Confirmed Berths (${legs.length} Split Tickets)
                </span>
                <p style="margin:3px 0 0; font-size:12px; color:#166534; line-height:1.4;">
                  Continuous journey on the <strong>same train</strong>. Board at ${escapeHtml(fromStationCode)} and deboard at ${escapeHtml(toStationCode)} without changing trains.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 20px; background:#f0fdf4; border-bottom:1px solid #dcfce7;">
          ${legs
            .map(
              (leg, idx) => `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:${
              idx === legs.length - 1 ? '0' : '8px'
            }; background:#ffffff; border:1px solid #86efac; border-radius:8px; padding:10px 14px; box-shadow:0 1px 2px rgba(0,0,0,0.03);">
              <tr>
                <td style="vertical-align:middle;">
                  <div style="font-size:13px; font-weight:800; color:#0f172a;">
                    Ticket ${idx + 1} of ${legs.length}: 
                    <span style="color:#2563eb;">${escapeHtml(leg.from)}</span> ➔ <span style="color:#2563eb;">${escapeHtml(leg.to)}</span>
                  </div>
                  <div style="font-size:11px; color:#64748b; margin-top:2px;">
                    Class: <strong>${escapeHtml(leg.travelClass)}</strong>${
                      leg.boardingDate ? ` · Date: ${escapeHtml(leg.boardingDate)}` : ''
                    }
                  </div>
                </td>
                <td align="right" style="vertical-align:middle; white-space:nowrap; padding-left:12px;">
                  <span style="display:inline-block; padding:3px 8px; background:#dcfce7; border:1px solid #86efac; border-radius:6px; font-size:11px; font-weight:800; color:#166534;">
                    CONFIRMED
                  </span>
                  ${
                    leg.fare
                      ? `<div style="font-size:12px; font-weight:700; color:#0f172a; margin-top:3px;">₹${leg.fare.toLocaleString(
                          'en-IN',
                        )}</div>`
                      : ''
                  }
                </td>
              </tr>
            </table>`,
            )
            .join('')}
        </td>
      </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Complete your booking for ${trainLabel} — LastBerth</title>
</head>
<body style="margin:0; padding:0; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color:#f1f5f9; color:#0f172a;">

  <!-- Outer background wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9; padding:32px 16px;">
    <tr>
      <td align="center">

        <!-- Main Card Container (aligned with LastBerth website card standards) -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px; margin:0 auto; background:#ffffff; border:1px solid #e2e8f0; border-radius:18px; overflow:hidden; box-shadow:0 8px 30px rgba(15,23,42,0.06);">
          
          <!-- Site Header Navigation Bar -->
          <tr>
            <td style="padding:18px 26px; background:#ffffff; border-bottom:1px solid #f1f5f9;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <a href="https://lastberth.com" target="_blank" style="text-decoration:none; display:inline-block;">
                      <span style="font-size:22px; font-weight:900; color:#2563eb; letter-spacing:-0.5px;">LastBerth</span>
                    </a>
                    <span style="display:inline-block; margin-left:8px; padding:2px 8px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:999px; font-size:10px; font-weight:700; color:#15803d; vertical-align:middle;">
                      ✓ Secured Booking
                    </span>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size:11px; font-weight:700; color:#475569; background:#f8fafc; border:1px solid #e2e8f0; padding:4px 9px; border-radius:6px;">
                      REF: ${escapeHtml(bookingRef)}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Eyebrow Tag & Main Headline -->
          <tr>
            <td style="padding:28px 26px 8px;">
              <div style="display:inline-block; padding:4px 10px; background:#fef3c7; border:1px solid #fde68a; border-radius:999px; font-size:11px; font-weight:800; color:#92400e; margin-bottom:12px; letter-spacing:0.2px;">
                ⏳ RESERVED SEATS AWAITING PAYMENT
              </div>
              <h1 style="margin:0 0 10px; font-size:22px; font-weight:900; color:#0f172a; line-height:1.25; letter-spacing:-0.3px;">
                Complete your booking for ${trainLabel}
              </h1>
              <p style="margin:0; font-size:14px; line-height:1.55; color:#475569;">
                Hi <strong>${escapeHtml(passengerName)}</strong>, you started booking confirmed train tickets from <strong>${escapeHtml(fromStationCode)}</strong> to <strong>${escapeHtml(toStationCode)}</strong> on <strong>${escapeHtml(journeyDateReadable)}</strong>. Your selected berths and details are held for you. Finish payment now to confirm your tickets before seats run out!
              </p>
            </td>
          </tr>

          <!-- Primary Hero Action CTA Button (Above the fold) -->
          <tr>
            <td style="padding:16px 26px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(resumeUrl)}" target="_blank" style="display:block; width:100%; box-sizing:border-box; background:#2563eb; color:#ffffff; text-align:center; padding:15px 24px; border-radius:12px; font-size:16px; font-weight:800; text-decoration:none; box-shadow:0 6px 16px rgba(37,99,235,0.3); letter-spacing:-0.2px;">
                      Resume Booking & Pay (₹${totalFare.toLocaleString('en-IN')}) &rarr;
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:8px 0 0; font-size:12px; color:#64748b; text-align:center;">
                ⚡ Pre-filled checkout: Opens your saved booking directly. You can edit passengers or pay in 1 click.
              </p>
            </td>
          </tr>

          <!-- Visual Train Journey & Ticket Card (Designed as per Website Train Card) -->
          <tr>
            <td style="padding:0 26px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff; border:1px solid #cbd5e1; border-radius:14px; overflow:hidden; box-shadow:0 2px 6px rgba(15,23,42,0.03);">
                
                <!-- Train Card Header -->
                <tr>
                  <td style="padding:14px 20px; background:#f8fafc; border-bottom:1px solid #e2e8f0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <div style="font-size:15px; font-weight:800; color:#0f172a;">
                            🚆 ${escapeHtml(trainNumber)} ${trainName ? `· ${escapeHtml(trainName)}` : ''}
                          </div>
                          <div style="font-size:12px; color:#64748b; margin-top:2px;">
                            ${escapeHtml(fromStationCode)} &rarr; ${escapeHtml(toStationCode)}
                          </div>
                        </td>
                        <td align="right" style="vertical-align:top;">
                          <span style="display:inline-block; padding:3px 9px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; font-size:11px; font-weight:800; color:#1e40af;">
                            ${escapeHtml(travelClass)} · ${escapeHtml(quota)}
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Route & Date Row -->
                <tr>
                  <td style="padding:16px 20px 14px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:40%; vertical-align:top;">
                          <div style="font-size:22px; font-weight:900; color:#0f172a; letter-spacing:-0.5px;">
                            ${escapeHtml(fromStationCode)}
                          </div>
                          <div style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; margin-top:2px;">
                            Origin Station
                          </div>
                        </td>
                        <td style="width:20%; text-align:center; vertical-align:middle;">
                          <span style="display:inline-block; font-size:16px; color:#94a3b8; font-weight:bold;">➔</span>
                        </td>
                        <td align="right" style="width:40%; vertical-align:top;">
                          <div style="font-size:22px; font-weight:900; color:#0f172a; letter-spacing:-0.5px;">
                            ${escapeHtml(toStationCode)}
                          </div>
                          <div style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; margin-top:2px;">
                            Destination
                          </div>
                        </td>
                      </tr>
                    </table>

                    <div style="margin-top:14px; padding-top:12px; border-top:1px dashed #e2e8f0;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:12px; color:#334155;">
                        <tr>
                          <td>
                            📅 <strong>Journey Date:</strong> ${escapeHtml(journeyDateReadable)}
                          </td>
                          <td align="right">
                            👤 <strong>Passenger:</strong> ${passengerDetails}
                          </td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>

                <!-- Contiguous Confirmed Split Leg Tickets (if split booking) -->
                ${splitLegsHtml}

                <!-- Fare Breakdown Summary (Website Pricing Standard) -->
                <tr>
                  <td style="padding:14px 20px; background:#f8fafc; border-top:1px solid #e2e8f0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;">
                      <tr>
                        <td style="color:#64748b; padding:3px 0;">Total Train Fare:</td>
                        <td align="right" style="font-weight:600; color:#0f172a; padding:3px 0;">₹${totalFare.toLocaleString('en-IN')}</td>
                      </tr>
                      <tr>
                        <td style="color:#64748b; padding:3px 0;">LastBerth Service Charge:</td>
                        <td align="right" style="font-weight:700; color:#15803d; padding:3px 0;">Included</td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0 0; border-top:1px dashed #cbd5e1; font-size:15px; font-weight:800; color:#0f172a;">
                          Total Payable:
                        </td>
                        <td align="right" style="padding:10px 0 0; border-top:1px dashed #cbd5e1; font-size:18px; font-weight:900; color:#2563eb;">
                          ₹${totalFare.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Trust Badges & Guarantee Strip (matching HomeTrustStrip) -->
          <tr>
            <td style="padding:0 26px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px;">
                <tr>
                  <td style="vertical-align:top; width:33.33%; padding:0 8px 0 0; text-align:center;">
                    <div style="font-size:16px;">🛡️</div>
                    <div style="font-size:11px; font-weight:800; color:#0f172a; margin-top:4px;">100% Genuine Tickets</div>
                    <div style="font-size:10px; color:#64748b; line-height:1.3; margin-top:2px;">Real IRCTC e-tickets with verified PNRs</div>
                  </td>
                  <td style="vertical-align:top; width:33.33%; padding:0 4px; text-align:center; border-left:1px solid #e2e8f0; border-right:1px solid #e2e8f0;">
                    <div style="font-size:16px;">⚡</div>
                    <div style="font-size:11px; font-weight:800; color:#0f172a; margin-top:4px;">Instant Delivery</div>
                    <div style="font-size:10px; color:#64748b; line-height:1.3; margin-top:2px;">Confirmed PNR to WhatsApp & Email</div>
                  </td>
                  <td style="vertical-align:top; width:33.33%; padding:0 0 0 8px; text-align:center;">
                    <div style="font-size:16px;">💰</div>
                    <div style="font-size:11px; font-weight:800; color:#0f172a; margin-top:4px;">Instant Refund</div>
                    <div style="font-size:10px; color:#64748b; line-height:1.3; margin-top:2px;">100% money back if not confirmed</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Secondary Bottom Action Button -->
          <tr>
            <td style="padding:0 26px 28px; text-align:center;">
              <a href="${escapeHtml(resumeUrl)}" target="_blank" style="display:inline-block; background:#0f172a; color:#ffffff; padding:13px 32px; border-radius:10px; font-size:14px; font-weight:800; text-decoration:none; letter-spacing:-0.2px;">
                Complete Booking (₹${totalFare.toLocaleString('en-IN')}) &rarr;
              </a>
            </td>
          </tr>

          <!-- Footer Legal & Support Strip -->
          <tr>
            <td style="padding:22px 26px; background:#f8fafc; border-top:1px solid #e2e8f0; text-align:center;">
              <p style="margin:0 0 6px; font-size:12px; font-weight:600; color:#475569;">
                Need assistance with your booking? Reply directly to this email or reach us at <a href="mailto:support@lastberth.com" style="color:#2563eb; text-decoration:none; font-weight:700;">support@lastberth.com</a>
              </p>
              <p style="margin:0; font-size:11px; color:#94a3b8; line-height:1.5;">
                &copy; ${currentYear} LastBerth (<a href="https://lastberth.com" target="_blank" style="color:#94a3b8; text-decoration:underline;">lastberth.com</a>). We are not affiliated with IRCTC or Indian Railways.
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
