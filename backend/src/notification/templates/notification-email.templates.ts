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

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

/**
 * Lightweight "chart prepared — go check tickets on our platform" email sent
 * when the user set up an alert with no specific destination. We do not run
 * any availability check on the backend, so the email just tells the user the
 * chart is ready and points them at a short-link that opens the search page
 * pre-filled with the train + journey date.
 */
export function renderChartPreparedNoDestinationEmailHtml(params: {
  trainLabel: string;
  journeyDateReadable: string;
  chartPreparationText: string;
  checkTicketsUrl: string;
  unsubscribeUrl?: string;
}): string {
  const {
    trainLabel,
    journeyDateReadable,
    chartPreparationText,
    checkTicketsUrl,
    unsubscribeUrl,
  } = params;
  const safeUrl = escapeHtml(checkTicketsUrl);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chart prepared - ${escapeHtml(trainLabel)} - LastBerth</title>
</head>
<body style="margin:0; padding:0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background:#f1f5f9; color:#334155;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
    <tr>
      <td style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; margin:0 auto; border-radius:16px; border:1px solid #e2e8f0; background:#ffffff; box-shadow:0 4px 6px -1px rgba(0,0,0,0.08); overflow:hidden;">
          <tr>
            <td style="padding:24px 24px 20px;">
              <p style="margin:0; font-size:11px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:#2563eb;">LastBerth Chart Alert</p>
              <p style="margin:8px 0 0 0; font-size:20px; font-weight:700; color:#0f172a;">${escapeHtml(trainLabel)}</p>
              <p style="margin:8px 0 0 0; font-size:14px; color:#334155;">${escapeHtml(journeyDateReadable)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 8px;">
              <p style="margin:0; font-size:15px; color:#0f172a; line-height:1.5;">
                The reservation chart for your train has been prepared.
              </p>
              <p style="margin:8px 0 0 0; font-size:14px; color:#475569; line-height:1.5;">
                ${escapeHtml(chartPreparationText)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 24px;">
              <a href="${safeUrl}" style="display:inline-block; padding:12px 24px; border-radius:12px; background:#2563eb; color:#ffffff; font-size:15px; font-weight:600; text-decoration:none;">Check live tickets on LastBerth</a>
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
