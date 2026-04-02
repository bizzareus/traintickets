type IrctcBookingRedirectParams = {
  from?: string | null;
  to?: string | null;
  trainNo?: string | null;
  classCode?: string | null;
};

/**
 * Canonical IRCTC booking redirect URL used across web + backend notifications.
 * Keep behavior in sync with `lib/irctcBookingRedirect.ts` in the Next app.
 */
export function irctcBookingRedirect(
  params: IrctcBookingRedirectParams,
): string {
  const from = String(params.from ?? '')
    .trim()
    .toUpperCase();
  const to = String(params.to ?? '')
    .trim()
    .toUpperCase();
  const trainNo = String(params.trainNo ?? '').trim();
  const classCode = String(params.classCode ?? '')
    .trim()
    .toUpperCase()
    .replace(/AC$/i, 'A');

  if (!from || !to || !trainNo) {
    return 'https://www.irctc.co.in/eticketing/login';
  }

  return `https://www.irctc.co.in/nget/redirect?${new URLSearchParams({
    from,
    to,
    trainNo,
    class: classCode,
    page: 'train-chart',
  }).toString()}`;
}
