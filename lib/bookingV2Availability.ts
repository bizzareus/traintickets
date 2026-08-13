/**
 * Mirrors backend `booking-v2.utils` leg confirmation rules for train-search cache rows
 * so the UI can open IRCTC vs “find seats” consistently.
 */
export function parseUpstreamAvailablityType(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

export type AvailabilityRowLike = {
  availablityType?: number | string | null;
  availablityStatus?: string | null;
  vendorPredictionStatus?: string | null;
  availabilityDisplayName?: string | null;
  railDataStatus?: string | null;
};

export const CONFIRMED_STATUS_RE = /^AVL|^AVAIL|^CURR_AV|^CURRENT AV|^CNF/i;

export function isLegConfirmed(row: AvailabilityRowLike | null | undefined): boolean {
  if (!row) return false;

  const type = parseUpstreamAvailablityType(row.availablityType);
  if (type === 3) return false;
  if (type === 1) return true;

  const vendorStatus = String(row.vendorPredictionStatus ?? "").trim();
  if (vendorStatus === "Confirm" || vendorStatus === "Probable") return true;

  const statusText = row.availabilityDisplayName ?? row.railDataStatus ?? row.availablityStatus ?? "";
  const currentStatus = statusText.split("/").pop()?.trim() ?? "";

  return CONFIRMED_STATUS_RE.test(currentStatus);
}

/** `true` when user should be sent to IRCTC to book (availablityType 1 or equivalent). */
export function isIrctcDirectBookable(row: AvailabilityRowLike | null | undefined): boolean {
  return isLegConfirmed(row);
}

export type TrainAvailabilityLike = {
  avlClasses?: string[];
  availabilityCache?: Record<string, AvailabilityRowLike>;
};

/** Checks if any class on the train has directly bookable/available seats. */
export function hasAnyAvailableSeat(
  train: TrainAvailabilityLike,
  acOnly = false,
): boolean {
  const displayedClasses = (train.avlClasses ?? []).filter(
    (c) => !acOnly || !["SL", "2S", "GN", "FC"].includes(c.toUpperCase()),
  );
  return displayedClasses.some((cls) => {
    const gn = train.availabilityCache?.[cls];
    return gn ? isIrctcDirectBookable(gn) : false;
  });
}

