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
 * Mirrors `renderChartPreparedNoDestinationEmailHtml`: tells the user the
 * chart is ready and points them at a short-link that opens the search page
 * pre-filled with the train + journey date.
 */
export function buildChartPreparedNoDestinationWhatsAppText(params: {
  trainLabel: string;
  journeyDateReadable: string;
  chartPreparationText: string;
  checkTicketsUrl: string;
  unsubscribeUrl?: string;
}): string {
  const lines: string[] = [
    '*LastBerth Chart Alert* 🔔',
    `${params.trainLabel}`,
    `${params.journeyDateReadable}`,
    '',
    'The reservation chart for your train has been prepared.',
    params.chartPreparationText,
    '',
    `Check live tickets on LastBerth: ${params.checkTicketsUrl}`,
  ];
  if (params.unsubscribeUrl) {
    lines.push(`Unsubscribe: ${params.unsubscribeUrl}`);
  }
  return lines.join('\n');
}
