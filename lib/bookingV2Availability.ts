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

/** `true` when user should be sent to IRCTC to book (availablityType 1 or equivalent). */
export function isIrctcDirectBookable(row: AvailabilityRowLike | null | undefined): boolean {
  if (!row) return false;
  const at = parseUpstreamAvailablityType(row.availablityType);
  if (at === 3) return false;
  if (at === 1) return true;
  const ct = String(row.vendorPredictionStatus ?? "").trim();
  if (ct === "Confirm" || ct === "Probable") return true;
  const st = String(row.availablityStatus ?? "").trim().toUpperCase();
  if (st.startsWith("AVAILABLE")) return true;
  const line = String(row.availabilityDisplayName ?? row.railDataStatus ?? "")
    .trim()
    .toUpperCase();
  if (
    line.startsWith("AVAILABLE") ||
    line.includes("CURR_AVL") ||
    line.includes("CAVAILABLE")
  ) {
    return true;
  }
  return false;
}
