import type { OpenAiBookingPlanItem, Service2CheckResult } from '../../service2/service2.service';
import type { ScheduleStation } from '../../irctc/irctc.service';
import type { BestTrainCandidateResult } from '../../booking-v2/booking-v2.service';
import {
  buildIrctcUrl,
  buildSegmentBookUrl,
  departureTimeAtStation,
  arrivalTimeAtStation,
  findScheduleRow,
  formatSegmentRoute,
  extractJourneyLegCoverage,
  firstPlannedClassCode,
} from '../notification.helpers';

export interface WatiTemplateContext {
  passengerName?: string;
  trainNumber: string;
  trainName?: string;
  fromStationCode: string;
  toStationCode: string;
  journeyDateReadable: string;
  journeyTimesLine?: string;
  classCode?: string;
  availabilityStatus?: string;
  approxPrice?: number;
  chartPreparationText?: string;
  journeyDateStr?: string;
}

export function buildWatiTemplateParameters(
  templateName: string,
  ctx: WatiTemplateContext,
): Array<{ name: string; value: string }> {
  const name = ctx.passengerName || 'Passenger';
  const trainNumber = ctx.trainNumber;
  const trainName = ctx.trainName || 'Express';
  const fromCode = ctx.fromStationCode;
  const toCode = ctx.toStationCode;
  const journeyDate = ctx.journeyDateReadable;
  const journeyTimes = ctx.journeyTimesLine?.trim() || 'Not Available';
  const searchUrl = `https://lastberth.com/search?from=${fromCode}&to=${toCode}&date=${ctx.journeyDateStr ?? ''}&trainNo=${trainNumber}`;

  if (templateName === 'subscription_alert') {
    return [
      { name: 'name', value: name },
      { name: 'train_number', value: trainNumber },
      { name: 'train_name', value: trainName },
      { name: 'from_code', value: fromCode },
      { name: 'to_code', value: toCode },
      { name: 'journey_date', value: journeyDate },
      { name: 'journey_times', value: journeyTimes },
      { name: 'ticket_number', value: '1' },
      { name: 'class_code', value: ctx.classCode || 'SL' },
      {
        name: 'availability_status',
        value: ctx.availabilityStatus || 'Available',
      },
      { name: 'segment_route', value: `${fromCode} → ${toCode}` },
      {
        name: 'approx_price',
        value: ctx.approxPrice ? String(ctx.approxPrice) : '0',
      },
      {
        name: 'irctc_booking_url',
        value: 'https://www.irctc.co.in/nget/redirect',
      },
    ];
  }

  if (
    templateName === 'uncovered_leg__shortlink_alert' ||
    templateName === 'uncovered_leg_alert'
  ) {
    return [
      { name: 'name', value: name },
      { name: 'train_number', value: trainNumber },
      { name: 'train_name', value: trainName },
      { name: 'from_code', value: fromCode },
      { name: 'to_code', value: toCode },
      { name: 'journey_date', value: journeyDate },
      { name: 'uncovered_segment_route', value: `${fromCode} → ${toCode}` },
      {
        name: 'chart_release_time_label',
        value: ctx.chartPreparationText || 'Chart prepared',
      },
      { name: 'action_button_text', value: 'Check Seat Availability' },
      { name: 'action_url', value: searchUrl },
    ];
  }

  return [
    { name: 'name', value: name },
    { name: 'train_number', value: trainNumber },
    { name: 'train_name', value: trainName },
    { name: 'from_code', value: fromCode },
    { name: 'to_code', value: toCode },
    { name: 'journey_date', value: journeyDate },
    { name: 'journey_times', value: journeyTimes },
  ];
}

/**
 * Plain-text WhatsApp body for the "chart prepared — no destination" alert.
 */
export function buildChartPreparedNoDestinationWhatsAppText(params: {
  trainNumber: string;
  trainName?: string | null;
  formattedDateTime: string;
  checkTicketsUrl: string;
  unsubscribeUrl?: string;
}): string {
  const tName = params.trainName?.trim() ? ` ${params.trainName.trim()}` : '';
  const line1 = `The chart has been prepared for train ${params.trainNumber}${tName} at ${params.formattedDateTime}`;
  const line2 = `Check for available tickets on ${params.checkTicketsUrl}`;

  const lines = [line1, '', line2];
  if (params.unsubscribeUrl) {
    lines.push('', `Unsubscribe: ${params.unsubscribeUrl}`);
  }
  return lines.join('\n');
}

export function buildFollowUpLegWhatsAppText(params: {
  trainLabel: string;
  routeDisplay: string;
  journeyDateReadable: string;
  plan: OpenAiBookingPlanItem[];
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
  } = params;

  const lines: string[] = [
    '*LastBerth Leg Update* 🔔',
    'New tickets found for your journey!',
    '',
    `Train: ${trainLabel}`,
    `Leg: ${routeDisplay}`,
    `Date: ${journeyDateReadable}`,
    ...(chartPreparationText ? [chartPreparationText] : []),
    '',
  ];

  for (let idx = 0; idx < plan.length; idx++) {
    const item = plan[idx];
    const segmentRoute = formatSegmentRoute(
      item.instruction,
      stationNameMap,
      stationScheduleList,
    );
    const classTag = ((item.instruction || '').split(' - ')[2] ?? '3A').trim();
    const priceStr =
      item.approx_price != null && item.approx_price > 0
        ? `approx ₹${Number(item.approx_price).toLocaleString('en-IN')}`
        : '';
    const segBookUrl = buildSegmentBookUrl(trainNumber, item.instruction);
    const availabilityTag = item.availability
      ? ` | ${item.availability}`
      : '';

    lines.push(`Ticket Found [${classTag}]${availabilityTag}`);
    lines.push(segmentRoute);
    if (priceStr) lines.push(priceStr);
    lines.push(`Book on IRCTC: ${segBookUrl}`);
    lines.push('');
  }

  lines.push('Track live seat updates anytime on LastBerth! 🚄');
  if (params.unsubscribeUrl) {
    lines.push(`Unsubscribe: ${params.unsubscribeUrl}`);
  }
  return lines.join('\n').trim();
}

export async function buildWhatsAppSeatsFoundText(params: {
  trainLabel: string;
  routeDisplay: string;
  journeyDateReadable: string;
  journeyDateStr: string;
  trainNumber: string;
  fromStationCode: string;
  toStationCode: string;
  journeyTimesLine?: string;
  chartPreparationText?: string;
  plan: OpenAiBookingPlanItem[];
  totalPrice?: number;
  stationNameMap: Map<string, string>;
  stationScheduleList?: ScheduleStation[];
  result?: Service2CheckResult;
  email?: string;
  mobile?: string;
  unsubscribeUrl?: string;
  getChartOpenInfoFn: (item: {
    fromCode: string;
    fromName: string;
  }) => Promise<{ label?: string; isReleased: boolean }>;
  createAlertShortLinkFn?: (params: {
    trainNumber: string;
    trainName?: string;
    fromStationCode: string;
    toStationCode: string;
    journeyDate: string;
    classCode?: string;
    email?: string;
    mobile?: string;
  }) => Promise<string>;
}): string | Promise<string> {
  const {
    trainLabel,
    routeDisplay,
    journeyDateReadable,
    journeyDateStr,
    trainNumber,
    fromStationCode,
    toStationCode,
    journeyTimesLine,
    chartPreparationText,
    plan,
    stationNameMap,
    stationScheduleList,
    result,
    getChartOpenInfoFn,
    createAlertShortLinkFn,
  } = params;

  const lines: string[] = [
    '*LastBerth Chart Alert* 🔔',
    'You subscribed to an alert when chart is prepared:',
    '',
    trainLabel,
    routeDisplay,
    journeyDateReadable,
    ...(journeyTimesLine ? [journeyTimesLine] : []),
    ...(chartPreparationText ? [chartPreparationText] : []),
    '',
  ];

  const coverage = extractJourneyLegCoverage({
    fromStationCode,
    toStationCode,
    plan,
    stationScheduleList,
  });

  const baseUrl = process.env.FRONTEND_URL || 'https://lastberth.com';

  for (const item of coverage) {
    if (item.type === 'ticket') {
      const segmentRoute = formatSegmentRoute(
        item.instruction,
        stationNameMap,
        stationScheduleList,
      );
      const classTag = (item.instruction.split(' - ')[2] ?? '3A').trim();
      const priceStr =
        item.approxPrice != null
          ? `approx ₹${Number(item.approxPrice).toLocaleString('en-IN')}`
          : '';
      const segBookUrl = buildSegmentBookUrl(trainNumber, item.instruction);
      const availabilityTag = item.availability
        ? ` | ${item.availability}`
        : '';
      lines.push(`Ticket ${item.ticketIndex} [${classTag}]${availabilityTag}`);
      lines.push(segmentRoute);
      if (priceStr) lines.push(priceStr);
      lines.push(`Book on IRCTC: ${segBookUrl}`);
      lines.push('');
    } else {
      const fromName =
        stationNameMap.get(item.fromCode.trim().toUpperCase()) ??
        item.fromCode;
      const toName =
        stationNameMap.get(item.toCode.trim().toUpperCase()) ?? item.toCode;
      const fromRow = findScheduleRow(stationScheduleList, item.fromCode);
      const toRow = findScheduleRow(stationScheduleList, item.toCode);
      const depTime = departureTimeAtStation(fromRow);
      const arrTime = arrivalTimeAtStation(toRow);
      const fromDisplay = depTime
        ? `${item.fromCode} - ${fromName} (${depTime})`
        : `${item.fromCode} - ${fromName}`;
      const toDisplay = arrTime
        ? `${item.toCode} - ${toName} (${arrTime})`
        : `${item.toCode} - ${toName}`;
      const segDisplay = `${fromDisplay} → ${toDisplay}`;

      const chartOpenInfo = await getChartOpenInfoFn({
        fromCode: item.fromCode,
        fromName,
      });

      lines.push(`No tickets available:`);
      lines.push(segDisplay);
      if (chartOpenInfo.label) {
        lines.push(chartOpenInfo.label);
      }

      if (chartOpenInfo.isReleased) {
        const alternateClassUrl = `${baseUrl}/search?from=${encodeURIComponent(item.fromCode)}&to=${encodeURIComponent(item.toCode)}&date=${encodeURIComponent(journeyDateStr)}&trainNo=${encodeURIComponent(trainNumber)}`;
        lines.push(`Check Alternate Class Tickets: ${alternateClassUrl}`);
      } else {
        let alertUrl = `${baseUrl}/search?from=${encodeURIComponent(item.fromCode)}&to=${encodeURIComponent(item.toCode)}&date=${encodeURIComponent(journeyDateStr)}`;
        if (createAlertShortLinkFn) {
          try {
            alertUrl = await createAlertShortLinkFn({
              trainNumber,
              trainName: result?.trainSchedule?.trainName,
              fromStationCode: item.fromCode,
              toStationCode: item.toCode,
              journeyDate: journeyDateStr,
              classCode: firstPlannedClassCode(result),
              email: params.email,
              mobile: params.mobile,
            });
          } catch {
            // fallback
          }
        }
        lines.push(`Get alert for this leg: ${alertUrl}`);
      }
      lines.push('');
    }
  }

  lines.push('Track live seat updates anytime on LastBerth! 🚄');
  if (params.unsubscribeUrl) {
    lines.push('');
    lines.push(`Unsubscribe: ${params.unsubscribeUrl}`);
  }

  return lines.join('\n').trim();
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
