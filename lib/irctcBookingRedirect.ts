type IrctcBookingRedirectParams = {
  from?: string | null;
  to?: string | null;
  trainNo?: string | null;
  classCode?: string | null;
};

/**
 * Canonical IRCTC booking redirect URL used across web + backend notifications.
 * Keeps query parameter names and static page target consistent everywhere.
 */
export function irctcBookingRedirect(
  params: IrctcBookingRedirectParams,
): string {
  const from = String(params.from ?? "")
    .trim()
    .toUpperCase();
  const to = String(params.to ?? "")
    .trim()
    .toUpperCase();
  const trainNo = String(params.trainNo ?? "").trim();
  const classCode = String(params.classCode ?? "")
    .trim()
    .toUpperCase()
    .replace(/AC$/i, "A");

  if (!from || !to || !trainNo) {
    return "https://www.irctc.co.in/eticketing/login";
  }

  // user requested format: www.irctc.co.in/nget/redirect?from=PNU&to=ABR&trainNo=12957&class=3A&page=train-chart
  return `https://www.irctc.co.in/nget/redirect?from=${from}&to=${to}&trainNo=${trainNo}&class=${classCode}&page=train-chart`;
}
