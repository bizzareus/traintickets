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

// Performance Optimization: Direct lastIndexOf + slice avoids array allocations (.split("/")) on every status check.
function getLastStatusSegment(statusText: string): string {
  const idx = statusText.lastIndexOf("/");
  const seg = idx === -1 ? statusText : statusText.slice(idx + 1);
  return seg.trim();
}

export function isLegConfirmed(row: AvailabilityRowLike | null | undefined): boolean {
  if (!row) return false;

  const type = parseUpstreamAvailablityType(row.availablityType);
  if (type === 3) return false;
  if (type === 1) return true;

  const vendorStatus = String(row.vendorPredictionStatus ?? "").trim();
  if (vendorStatus === "Confirm" || vendorStatus === "Probable") return true;

  const statusText = row.availabilityDisplayName ?? row.railDataStatus ?? row.availablityStatus ?? "";
  const currentStatus = getLastStatusSegment(statusText);

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

const NON_AC_CLASSES = new Set(["SL", "2S", "GN", "FC"]);

/** Checks if any class on the train has directly bookable/available seats.
 * Performance Optimization: Avoids intermediate array allocation (.filter) on every train item.
 */
export function hasAnyAvailableSeat(
  train: TrainAvailabilityLike,
  acOnly = false,
): boolean {
  const avlClasses = train?.avlClasses;
  if (!avlClasses || avlClasses.length === 0) return false;

  return avlClasses.some((cls) => {
    if (acOnly && NON_AC_CLASSES.has(cls.toUpperCase())) {
      return false;
    }
    const gn = train.availabilityCache?.[cls];
    return gn ? isIrctcDirectBookable(gn) : false;
  });
}

// Performance Optimization: Single combined regex reduces 5 sequential regex string replacement passes down to 1 pass.
const CURR_AVL_RE = /\bCURR_(?:AVBL|AVL|AV)\b|CURR_AV(?:BL|L)/gi;

/**
 * Normalizes availability status string for clean display, converting CURR_AVL / CURR_AVBL / CURR_AV to AVL.
 */
export function formatAvailabilityStatus(status?: string | null): string {
  if (!status) return "—";
  return status.replace(CURR_AVL_RE, "AVL");
}

