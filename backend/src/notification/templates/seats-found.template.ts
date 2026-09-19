import type {
  OpenAiBookingPlanItem,
  Service2CheckResult,
} from '../../service2/service2.service';
import type { ScheduleStation } from '../../irctc/irctc.service';
import {
  buildRefundWhatsappLine,
  escapeHtml,
  buildSegmentBookUrl,
  formatSegmentRoute,
  extractJourneyLegCoverage,
  firstPlannedClassCode,
  renderRefundBannerHtml,
  formatJourneyDateShort,
  to12HourTime,
  formatAvailabilitySeats,
  type RefundInfo,
} from '../notification.helpers';

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
  refundInfo?: RefundInfo | null;
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
    refundInfo,
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
              ${renderRefundBannerHtml(refundInfo)}
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

export function renderFollowUpLegEmailHtml(params: {
  trainLabel: string;
  routeDisplay: string;
  journeyDateReadable: string;
  plan: Array<{
    instruction: string;
    approx_price?: number;
    availability?: string;
  }>;
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

export function buildFollowUpLegWhatsAppText(params: {
  trainLabel: string;
  routeDisplay: string;
  journeyDateReadable: string;
  plan: OpenAiBookingPlanItem[];
  stationNameMap: Map<string, string>;
  stationScheduleList?: ScheduleStation[];
  trainNumber: string;
  chartPreparationText?: string;
  refundUrl?: string;
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
    const availabilityTag = item.availability ? ` | ${item.availability}` : '';

    lines.push(`Ticket Found [${classTag}]${availabilityTag}`);
    lines.push(segmentRoute);
    if (priceStr) lines.push(priceStr);
    lines.push(`Book on IRCTC: ${segBookUrl}`);
    lines.push('');
  }

  lines.push('Track live seat updates anytime on LastBerth! 🚄');
  if (params.refundUrl) {
    lines.push('');
    lines.push(`Claim Refund - ${params.refundUrl}`);
  }
  return lines.join('\n').trim();
}

export async function buildWhatsAppSeatsFoundText(params: {
  trainLabel: string;
  routeDisplay?: string;
  journeyDateReadable?: string;
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
  refundUrl?: string;
  refundInfo?: RefundInfo | null;
  chartNumber?: '1st' | '2nd';
  chartTime?: string;
  getChartOpenInfoFn: (item: {
    fromCode: string;
    fromName: string;
  }) => Promise<{
    label?: string;
    isReleased: boolean;
    hasFutureChart?: boolean;
    isSecondChart?: boolean;
    formattedChartTime?: string;
  }>;
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
}): Promise<string> {
  const {
    trainLabel,
    journeyDateStr,
    trainNumber,
    fromStationCode,
    toStationCode,
    plan,
    stationNameMap,
    stationScheduleList,
    result,
    getChartOpenInfoFn,
    createAlertShortLinkFn,
  } = params;

  const refundLine = buildRefundWhatsappLine(params.refundInfo);
  const chartNumber = params.chartNumber ?? '1st';
  const chartTime = to12HourTime(params.chartTime) || '7:30 PM';
  const dateStr = formatJourneyDateShort(journeyDateStr);

  const lines: string[] = [
    `🔔 ${chartNumber} Chart Alert: ${trainLabel} prepared at ${chartTime}`,
    `Route: ${fromStationCode} → ${toStationCode} | Date: ${dateStr}`,
  ];

  if (refundLine) {
    lines.push(refundLine);
  }

  lines.push('');

  const coverage = extractJourneyLegCoverage({
    fromStationCode,
    toStationCode,
    plan,
    stationScheduleList,
  });

  const baseUrl = process.env.FRONTEND_URL || 'https://lastberth.com';

  for (let idx = 0; idx < coverage.length; idx++) {
    const item = coverage[idx];
    const legNum = idx + 1;

    if (item.type === 'ticket') {
      const classTag = (item.instruction.split(' - ')[2] ?? '3A').trim();
      const seatsText = formatAvailabilitySeats(item.availability);
      const availTag = seatsText
        ? `(${seatsText} in ${classTag})`
        : `(${classTag})`;
      const priceStr =
        item.approxPrice != null && item.approxPrice > 0
          ? ` Price: ~₹${Number(item.approxPrice).toLocaleString('en-IN')}`
          : '';
      const segBookUrl = buildSegmentBookUrl(trainNumber, item.instruction);
      lines.push(
        `🟢 Leg ${legNum}: ${item.fromCode} → ${item.toCode} ${availTag}${priceStr} 🔗 Book Now: ${segBookUrl}`,
      );
    } else {
      const fromName =
        stationNameMap.get(item.fromCode.trim().toUpperCase()) ?? item.fromCode;
      const chartOpenInfo = await getChartOpenInfoFn({
        fromCode: item.fromCode,
        fromName,
      });

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

      if (
        chartOpenInfo.isSecondChart &&
        chartOpenInfo.hasFutureChart &&
        chartOpenInfo.formattedChartTime
      ) {
        lines.push(
          `🔴 Leg ${legNum}: ${item.fromCode} → ${item.toCode} (No Seats)`,
        );
        lines.push(
          `New Chart prepares: ${chartOpenInfo.formattedChartTime} 🔗 Get alert: ${alertUrl}`,
        );
      } else if (
        chartOpenInfo.hasFutureChart &&
        chartOpenInfo.formattedChartTime
      ) {
        lines.push(
          `🔴 Leg ${legNum}: ${item.fromCode} → ${item.toCode} (No Seats) Chart prepares: ${chartOpenInfo.formattedChartTime} 🔗 Get alert: ${alertUrl}`,
        );
      } else {
        lines.push(
          `🔴 Leg ${legNum}: ${item.fromCode} → ${item.toCode} (No Seats)`,
        );
      }
    }
  }

  lines.push('🚄 Track live seat updates anytime on LastBerth.com!');
  if (params.refundUrl) {
    lines.push('');
    lines.push(`Claim Refund - ${params.refundUrl}`);
  }

  return lines.join('\n').trim();
}
