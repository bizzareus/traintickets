import type { BestTrainCandidateResult } from '../../booking-v2/booking-v2.service';
import { escapeHtml, buildIrctcUrl } from '../notification.helpers';

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

export function buildNoSeatsWhatsAppText(params: {
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
    searchUrl,
  } = params;

  const targetSearchUrl =
    searchUrl ||
    `https://lastberth.com/search?from=${encodeURIComponent(fromCode)}&to=${encodeURIComponent(toCode)}&date=${encodeURIComponent(date)}`;

  const hasAlternatives = Boolean(
    alternativeTrains && alternativeTrains.length > 0,
  );
  let alternativesText = '';
  if (hasAlternatives) {
    const trainLines = (alternativeTrains ?? [])
      .slice(0, 5)
      .map((alt, i) => {
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
          bestLegStr = `\n  ↳ ${statusStr}${classStr}`;
        }

        const depStr = train.departureTime
          ? `Dep: ${train.departureTime}`
          : '';
        const arrStr = train.arrivalTime ? `Arr: ${train.arrivalTime}` : '';
        const durMinutes = train.duration;
        const durStr = durMinutes
          ? `Duration: ${Math.floor(durMinutes / 60)}h ${durMinutes % 60}m`
          : '';
        const timingLine = [depStr, arrStr, durStr].filter(Boolean).join(' | ');

        return `${i + 1}. *${trainNameStr}*\n   ${timingLine}${bestLegStr}`;
      })
      .join('\n\n');

    alternativesText = `\n\n*FOUND TICKETS IN ALTERNATE TRAINS - BOOK NOW* 🔥\n\n${trainLines}`;
  }

  const unsubscribeLine = params.unsubscribeUrl
    ? `\n\nUnsubscribe: ${params.unsubscribeUrl}`
    : '';

  if (hasAlternatives) {
    return `*LastBerth Chart Alert* 🔔

We didn't find any tickets in *${trainLabel}* for *${routeDisplay}* on *${journeyDateReadable}*.${alternativesText}

Look for alternate trains available for your journey:
${targetSearchUrl}${unsubscribeLine}`;
  }

  return `*LastBerth Chart Alert* 🔔
You subscribed to an alert when chart is prepared:

No Tickets Found 😔

Train: ${trainLabel}
Route: ${routeDisplay}
Date: ${journeyDateReadable}

${openAiSummary || "We tried our best but couldn't find any available tickets at this time."}

Look for alternate trains available for your journey:
${targetSearchUrl}${unsubscribeLine}`;
}

export function buildAlternativeTrainsWhatsAppText(params: {
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

  const lines: string[] = [
    '*LastBerth Alternative Train Alert* 🔔',
    `Full-journey confirmed tickets are available on another train for your route:`,
    '',
    `Requested Train: ${originalTrainLabel}`,
    `Route: ${routeDisplay}`,
    `Date: ${journeyDateReadable}`,
    '',
  ];

  alternativeTrains.slice(0, 5).forEach((alt, idx) => {
    const train = alt.train;
    const trainLabel = [train.trainNumber, train.trainName]
      .filter(Boolean)
      .join(' ');
    lines.push(`Option ${idx + 1}: ${trainLabel}`);

    const confirmedLegs = alt.alternatePath.legs.filter(
      (l) => l.segmentKind === 'confirmed',
    );
    for (const leg of confirmedLegs) {
      const segFrom = leg.from;
      const segTo = leg.to;
      const fromName = stationNameMap.get(segFrom.toUpperCase()) ?? segFrom;
      const toName = stationNameMap.get(segTo.toUpperCase()) ?? segTo;
      const legRoute = `${segFrom} - ${fromName} → ${leg.to} - ${toName}`;
      const classTag = leg.travelClass ?? '3A';
      const availTag =
        leg.availabilityDisplayName || leg.railDataStatus || 'Available';
      const priceStr = leg.fare != null ? `approx ₹${leg.fare}` : '';
      const segBookUrl = buildIrctcUrl({
        fromStationCode: segFrom,
        toStationCode: segTo,
        trainNumber: train.trainNumber,
        classCode: classTag,
      });

      lines.push(`Ticket [${classTag}] | ${availTag}`);
      lines.push(legRoute);
      if (priceStr) lines.push(priceStr);
      lines.push(`Book on IRCTC: ${segBookUrl}`);
    }
    lines.push('');
  });

  lines.push('Track live seat updates anytime on LastBerth! 🚄');
  if (params.unsubscribeUrl) {
    lines.push('');
    lines.push(`Unsubscribe: ${params.unsubscribeUrl}`);
  }

  return lines.join('\n').trim();
}
