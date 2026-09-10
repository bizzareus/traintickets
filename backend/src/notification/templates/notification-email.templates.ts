import type { Service2CheckResult } from '../../service2/service2.service';
import type { ScheduleStation } from '../../irctc/irctc.service';
import type { BestTrainCandidateResult } from '../../booking-v2/booking-v2.service';
import {
  escapeHtml,
  buildIrctcUrl,
  buildSegmentBookUrl,
  departureTimeAtStation,
  arrivalTimeAtStation,
  findScheduleRow,
  formatSegmentRoute,
  getStationChartOpenTimeLabelHelper,
} from '../notification.helpers';

export { escapeHtml };

export interface EmailCardRowParams {
  cardRowsHtml: string;
  totalPrice?: number;
  trainLabel: string;
  routeDisplay: string;
  journeyDateReadable: string;
  journeyTimesLine?: string;
  chartPreparationText?: string;
  partialJourneyNotice?: string;
  unsubscribeUrl?: string;
}

export function renderSeatsFoundEmailHtml(params: EmailCardRowParams): string {
  const {
    cardRowsHtml,
    totalPrice,
    trainLabel,
    routeDisplay,
    journeyDateReadable,
    journeyTimesLine,
    chartPreparationText,
    partialJourneyNotice,
    unsubscribeUrl,
  } = params;

  const totalRow =
    totalPrice != null && totalPrice > 0
      ? `\n    <tr><td style="padding:16px 20px 0 0; font-size:15px; font-weight:500; color:#1e293b; text-align:right;">Total approx. fare: ~ ₹${Number(totalPrice).toLocaleString('en-IN')}</td></tr>`
      : '';

  const chartPrepLine = chartPreparationText
    ? `<p style="margin:6px 0 0 0; font-size:13px; color:#475569;">${escapeHtml(chartPreparationText)}</p>`
    : '';

  const timesLine = journeyTimesLine
    ? `<p style="margin:4px 0 0 0; font-size:13px; color:#64748b;">${escapeHtml(journeyTimesLine)}</p>`
    : '';

  const partialNoticeLine = partialJourneyNotice
    ? `<p style="margin:8px 0 0 0; font-size:13px; font-weight:500; color:#b45309; line-height:1.4;">${escapeHtml(partialJourneyNotice)}</p>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Seats Available - LastBerth</title>
</head>
<body style="margin:0; padding:0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background:#f1f5f9; color:#334155;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
    <tr>
      <td style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; margin:0 auto; border-radius:16px; border:1px solid #e2e8f0; background:#ffffff; box-shadow:0 4px 6px -1px rgba(0,0,0,0.08); overflow:hidden;">
          <tr>
            <td style="padding:24px 24px 20px;">
              <p style="margin:0; font-size:20px; font-weight:700; color:#0f172a;">${escapeHtml(trainLabel)}</p>
              <p style="margin:8px 0 0 0; font-size:14px; color:#64748b;">${escapeHtml(routeDisplay)}</p>
              ${timesLine}
              <p style="margin:8px 0 0 0; font-size:14px; color:#334155;">${escapeHtml(journeyDateReadable)}</p>
              ${partialNoticeLine}
              ${chartPrepLine}
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${cardRowsHtml}
              </table>
              ${totalRow}
            </td>
          </tr>
        </table>
        <p style="margin:24px 0 0 0; font-size:11px; color:#94a3b8; text-align:center;">You received this because you asked LastBerth to monitor seat availability.${
          unsubscribeUrl
            ? ` <a href="${escapeHtml(unsubscribeUrl)}" style="color:#94a3b8; text-decoration:underline;">Unsubscribe</a>`
            : ''
        }</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderChartPreparedNoDestinationEmailHtml(params: {
  trainNumber: string;
  trainName?: string | null;
  formattedDateTime: string;
  checkTicketsUrl: string;
  unsubscribeUrl?: string;
}): string {
  const {
    trainNumber,
    trainName,
    formattedDateTime,
    checkTicketsUrl,
    unsubscribeUrl,
  } = params;
  const safeUrl = escapeHtml(checkTicketsUrl);
  const tName = trainName?.trim() ? ` ${trainName.trim()}` : '';
  const mainText = `The chart has been prepared for train ${trainNumber}${tName} at ${formattedDateTime}`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chart prepared - ${escapeHtml(trainNumber)}${escapeHtml(tName)} - LastBerth</title>
</head>
<body style="margin:0; padding:0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background:#f1f5f9; color:#334155;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
    <tr>
      <td style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; margin:0 auto; border-radius:16px; border:1px solid #e2e8f0; background:#ffffff; box-shadow:0 4px 6px -1px rgba(0,0,0,0.08); overflow:hidden;">
          <tr>
            <td style="padding:24px 24px 20px;">
              <p style="margin:0; font-size:11px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:#2563eb;">LastBerth Chart Alert</p>
              <p style="margin:12px 0 0 0; font-size:16px; font-weight:600; color:#0f172a; line-height:1.5;">${escapeHtml(mainText)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px;">
              <p style="margin:0 0 12px 0; font-size:14px; color:#334155;">Check for available tickets on <a href="${safeUrl}" style="color:#2563eb; text-decoration:underline;">${safeUrl}</a></p>
              <a href="${safeUrl}" style="display:inline-block; padding:12px 24px; border-radius:12px; background:#2563eb; color:#ffffff; font-size:15px; font-weight:600; text-decoration:none;">Check for available tickets</a>
            </td>
          </tr>
        </table>
        <p style="margin:24px 0 0 0; font-size:11px; color:#94a3b8; text-align:center;">You received this because you asked LastBerth to alert you when the chart is prepared.${
          unsubscribeUrl
            ? ` <a href="${escapeHtml(unsubscribeUrl)}" style="color:#94a3b8; text-decoration:underline;">Unsubscribe</a>`
            : ''
        }</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderFollowUpLegEmailHtml(params: {
  trainLabel: string;
  routeDisplay: string;
  journeyDateReadable: string;
  plan: Array<{ instruction: string; approx_price?: number; availability?: string }>;
  stationNameMap: Map<string, string>;
  stationScheduleList?: ScheduleStation[];
  trainNumber: string;
  chartPreparationText?: string;
  unsubscribeUrl?: string;
}): string {
  const {
    trainLabel,
    routeDisplay,
    journeyDateReadable,
    plan,
    stationNameMap,
    stationScheduleList,
    trainNumber,
    chartPreparationText,
    unsubscribeUrl,
  } = params;

  const cardsHtml = plan
    .map((item, idx) => {
      const segUrl = buildSegmentBookUrl(trainNumber, item.instruction);
      const segmentRoute = formatSegmentRoute(
        item.instruction,
        stationNameMap,
        stationScheduleList,
      );
      const classTag = (
        (item.instruction || '').split(' - ')[2] ?? '3A'
      ).trim();
      const priceStr =
        item.approx_price != null && item.approx_price > 0
          ? `₹${Number(item.approx_price).toLocaleString('en-IN')}`
          : '';
      const availStr = item.availability?.trim() || '';

      return `
    <tr><td style="padding:0 0 12px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px; border:1px solid #86efac; background:#e6ffe6; box-shadow:0 1px 3px rgba(0,0,0,0.06); overflow:hidden;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 10px 0; font-size:14px; font-weight:500; color:#1e293b;">Ticket ${idx + 1}
              <span style="display:inline-block; margin-left:8px; padding:3px 10px; border-radius:8px; background:#22c55e; color:#fff; font-size:12px; font-weight:600;">${classTag}</span>
            </p>
            <p style="margin:0 0 10px 0; font-size:14px; font-weight:500; color:#1e293b;">${escapeHtml(segmentRoute)}</p>
            ${availStr ? `<p style="margin:10px 0 0 0; font-size:13px; font-weight:600; color:#15803d;">${escapeHtml(availStr)}</p>` : ''}
            ${priceStr ? `<p style="margin:${availStr ? '4px' : '10px'} 0 0 0; font-size:15px; font-weight:600; color:#0f172a;"><span style="font-size:12px; font-weight:400; color:#64748b;">approx</span> ${priceStr}</p>` : ''}
            <a href="${segUrl}" style="display:inline-block; margin-top:16px; padding:12px 24px; border-radius:12px; background:#22c55e; color:#fff; font-size:15px; font-weight:600; text-decoration:none;">Book</a>
          </td>
        </tr>
      </table>
    </td></tr>`;
    })
    .join('');

  return renderSeatsFoundEmailHtml({
    cardRowsHtml: cardsHtml,
    trainLabel,
    routeDisplay,
    journeyDateReadable,
    chartPreparationText,
    unsubscribeUrl,
  });
}

export function renderNoSeatsEmailHtml(params: {
  trainLabel: string;
  routeDisplay: string;
  journeyDateReadable: string;
  openAiSummary?: string | null;
  alternativeTrains?: BestTrainCandidateResult[];
  fromCode: string;
  toCode: string;
  date: string;
  searchUrl?: string;
  unsubscribeUrl?: string;
}): string {
  const {
    trainLabel,
    routeDisplay,
    journeyDateReadable,
    openAiSummary,
    alternativeTrains,
    fromCode,
    toCode,
    date,
  } = params;

  const hasAlternatives = Boolean(
    alternativeTrains && alternativeTrains.length > 0,
  );
  const title = hasAlternatives
    ? 'Alternate Trains Available 🚆'
    : 'No Tickets Found 😔';
  const mainNote = hasAlternatives
    ? `We didn't find any tickets in <strong>${escapeHtml(trainLabel)}</strong> for <strong>${escapeHtml(routeDisplay)}</strong> on <strong>${escapeHtml(journeyDateReadable)}</strong>.`
    : `We tried our best to find tickets for your journey:`;

  let alternativesHtml = '';
  if (hasAlternatives) {
    const trainCards = (alternativeTrains ?? [])
      .slice(0, 5)
      .map((alt) => {
        const train = alt.train;
        const trainNameStr = [train.trainNumber, train.trainName]
          .filter(Boolean)
          .join(' - ');

        const confirmedLegs = alt.alternatePath.legs.filter(
          (l) => l.segmentKind === 'confirmed',
        );
        let bestLegStr = '';
        if (confirmedLegs.length > 0) {
          const firstLeg = confirmedLegs[0];
          const classStr = firstLeg.travelClass
            ? ` [Class ${firstLeg.travelClass}]`
            : '';
          const statusStr =
            firstLeg.availabilityDisplayName ||
            firstLeg.railDataStatus ||
            'Available';
          bestLegStr = `<p style="margin:4px 0 0 0;font-size:13px;font-weight:600;color:#059669;">${statusStr}${classStr}</p>`;
        }

        let timingsStr = '';
        if (train.departureTime || train.arrivalTime || train.duration) {
          const depStr = train.departureTime
            ? `Dep: ${train.departureTime}`
            : '';
          const arrStr = train.arrivalTime ? `Arr: ${train.arrivalTime}` : '';
          const durMinutes = train.duration;
          const durStr = durMinutes
            ? `Duration: ${Math.floor(durMinutes / 60)}h ${durMinutes % 60}m`
            : '';
          const parts = [depStr, arrStr, durStr].filter(Boolean).join(' | ');
          timingsStr = `<p style="margin:4px 0 0 0;font-size:13px;color:#475569;">${escapeHtml(parts)}</p>`;
        }

        return `
      <div style="padding:12px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;">
        <p style="margin:0;font-weight:600;font-size:15px;color:#1e293b;">${escapeHtml(trainNameStr)}</p>
        ${timingsStr}
        ${bestLegStr}
      </div>`;
      })
      .join('');

    alternativesHtml = `
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;">
      <h3 style="margin:0 0 12px 0;font-size:16px;color:#059669;font-weight:700;">FOUND TICKETS IN ALTERNATE TRAINS - BOOK NOW</h3>
      ${trainCards}
    </div>`;
  }

  const primaryDetailsBlock = hasAlternatives
    ? ''
    : `
  <div style="background:#f8fafc;padding:12px;border-radius:8px;margin-bottom:16px;">
    <p style="margin:0;font-weight:600;">${escapeHtml(trainLabel)}</p>
    <p style="margin:4px 0 0 0;color:#475569;">${escapeHtml(routeDisplay)}</p>
    <p style="margin:4px 0 0 0;color:#475569;">${escapeHtml(journeyDateReadable)}</p>
  </div>
  <p style="margin:0 0 16px 0;color:#b91c1c;">${escapeHtml(openAiSummary || "Unfortunately, we couldn't find any available tickets at this time.")}</p>`;

  const searchHref =
    params.searchUrl ||
    `https://lastberth.com/search?from=${encodeURIComponent(fromCode)}&to=${encodeURIComponent(toCode)}&date=${encodeURIComponent(date)}`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a;background:#f1f5f9;margin:0;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:24px;border:1px solid #e2e8f0;box-shadow:0 4px 6px -1px rgba(0,0,0,0.08);">
    <h2 style="margin:0 0 16px 0;font-size:20px;color:#0f172a;">${title}</h2>
    <p style="margin:0 0 12px 0;">${mainNote}</p>
    ${primaryDetailsBlock}
    ${alternativesHtml}
    <p style="margin:16px 0 16px 0;">Look for alternate trains available for your journey:</p>
    <a href="${searchHref}" style="display:inline-block;padding:10px 20px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:8px;font-weight:500;">Find Alternate Trains</a>
  </div>
  <p style="margin:24px 0 0 0; font-size:11px; color:#94a3b8; text-align:center;">You received this because you asked LastBerth to monitor seat availability.${
    params.unsubscribeUrl
      ? ` <a href="${escapeHtml(params.unsubscribeUrl)}" style="color:#94a3b8; text-decoration:underline;">Unsubscribe</a>`
      : ''
  }</p>
</body>
</html>`;
}

export function renderAlternativeTrainsEmailHtml(params: {
  originalTrainLabel: string;
  routeDisplay: string;
  journeyDateReadable: string;
  journeyDateStr: string;
  fromStationCode: string;
  toStationCode: string;
  alternativeTrains: BestTrainCandidateResult[];
  stationNameMap: Map<string, string>;
  unsubscribeUrl?: string;
}): string {
  const {
    originalTrainLabel,
    routeDisplay,
    journeyDateReadable,
    alternativeTrains,
    stationNameMap,
  } = params;

  const cardsHtml = alternativeTrains
    .slice(0, 5)
    .map((alt, idx) => {
      const train = alt.train;
      const trainLabel = [train.trainNumber, train.trainName]
        .filter(Boolean)
        .join(' ');
      const confirmedLegs = alt.alternatePath.legs.filter(
        (l) => l.segmentKind === 'confirmed',
      );

      const legsHtml = confirmedLegs
        .map((leg) => {
          const segFrom = leg.from;
          const segTo = leg.to;
          const fromName =
            stationNameMap.get(segFrom.toUpperCase()) ?? segFrom;
          const toName = stationNameMap.get(segTo.toUpperCase()) ?? segTo;
          const legRoute = `${segFrom} - ${fromName} → ${leg.to} - ${toName}`;
          const classTag = leg.travelClass ?? '3A';
          const availTag =
            leg.availabilityDisplayName || leg.railDataStatus || 'Available';
          const priceStr = leg.fare != null ? `₹${leg.fare}` : '';
          const segBookUrl = buildIrctcUrl({
            fromStationCode: segFrom,
            toStationCode: segTo,
            trainNumber: train.trainNumber,
            classCode: classTag,
          });

          return `
        <div style="margin-top:8px; padding:12px; border-radius:8px; border:1px solid #86efac; background:#e6ffe6;">
          <p style="margin:0; font-size:14px; font-weight:600; color:#166534;">Option ${idx + 1}: ${escapeHtml(trainLabel)}</p>
          <p style="margin:4px 0 0 0; font-size:13px; color:#1e293b;">${escapeHtml(legRoute)}</p>
          <p style="margin:4px 0 0 0; font-size:13px; font-weight:600; color:#059669;">Class ${classTag} | ${escapeHtml(availTag)} ${priceStr ? `(${priceStr})` : ''}</p>
          <a href="${segBookUrl}" style="display:inline-block; margin-top:8px; padding:6px 14px; border-radius:6px; background:#16a34a; color:#fff; font-size:12px; font-weight:600; text-decoration:none;">Book on IRCTC</a>
        </div>`;
        })
        .join('');

      return legsHtml;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a;background:#f1f5f9;margin:0;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:24px;border:1px solid #e2e8f0;box-shadow:0 4px 6px -1px rgba(0,0,0,0.08);">
    <h2 style="margin:0 0 16px 0;font-size:20px;color:#0f172a;">Alternative Trains Available 🔔</h2>
    <p style="margin:0 0 12px 0;">We found full-journey confirmed seats on another train for your route:</p>
    <div style="background:#f8fafc;padding:12px;border-radius:8px;margin-bottom:16px;">
      <p style="margin:0;font-weight:600;">Requested: ${escapeHtml(originalTrainLabel)}</p>
      <p style="margin:4px 0 0 0;color:#475569;">${escapeHtml(routeDisplay)}</p>
      <p style="margin:4px 0 0 0;color:#475569;">${escapeHtml(journeyDateReadable)}</p>
    </div>
    ${cardsHtml}
  </div>
  <p style="margin:24px 0 0 0; font-size:11px; color:#94a3b8; text-align:center;">You received this because you asked LastBerth to monitor seat availability.${
    params.unsubscribeUrl
      ? ` <a href="${escapeHtml(params.unsubscribeUrl)}" style="color:#94a3b8; text-decoration:underline;">Unsubscribe</a>`
      : ''
  }</p>
</body>
</html>`;
}

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
