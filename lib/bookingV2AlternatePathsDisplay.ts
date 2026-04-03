/**
 * Shapes alternate-path legs for the booking v2 modal.
 *
 * Any contiguous run of ≥2 consecutive `check_realtime` legs that chain
 * (leg[i].to === leg[i+1].from) is collapsed into a single "unavailable
 * segment" display item showing the span from the first leg's origin to the
 * last leg's destination.  A lone `check_realtime` hop is kept as-is.
 *
 * This produces a flat list of `AlternatePathDisplayItem`s ready to render
 * directly — one card per item.
 */

export type AlternatePathLegForPartition = {
  from: string;
  to: string;
  segmentKind: "confirmed" | "check_realtime";
};

/** A single leg shown as one card (confirmed or lone check_realtime). */
export type AlternatePathDisplayItemSingle<T extends AlternatePathLegForPartition> = {
  kind: "single";
  leg: T;
};

/**
 * A collapsed span of ≥2 chained `check_realtime` legs shown as one merged
 * "no tickets" card spanning `from` → `to`.
 */
export type AlternatePathDisplayItemCollapsed<T extends AlternatePathLegForPartition> = {
  kind: "collapsed";
  from: string;
  to: string;
  /** Original legs making up this span, for timing aggregation. */
  legs: T[];
};

export type AlternatePathDisplayItem<T extends AlternatePathLegForPartition> =
  | AlternatePathDisplayItemSingle<T>
  | AlternatePathDisplayItemCollapsed<T>;

function normCode(s: string): string {
  return s.trim().toUpperCase();
}

/**
 * Convert a legs array into a flat sequence of display items, collapsing
 * any contiguous chain of ≥2 `check_realtime` legs into a single item.
 */
export function buildAlternatePathDisplayItems<T extends AlternatePathLegForPartition>(
  legs: T[],
): AlternatePathDisplayItem<T>[] {
  const items: AlternatePathDisplayItem<T>[] = [];
  let i = 0;

  while (i < legs.length) {
    const leg = legs[i];

    if (leg.segmentKind !== "check_realtime") {
      items.push({ kind: "single", leg });
      i++;
      continue;
    }

    // Walk forward to find the longest chained run of check_realtime legs.
    let end = i; // inclusive index of last leg in the run
    for (let j = i + 1; j < legs.length; j++) {
      const next = legs[j];
      if (next.segmentKind !== "check_realtime") break;
      if (normCode(legs[j - 1].to) !== normCode(next.from)) break;
      end = j;
    }

    const runLegs = legs.slice(i, end + 1);

    if (runLegs.length >= 2) {
      // Collapse the whole chain into one card.
      items.push({
        kind: "collapsed",
        from: runLegs[0].from,
        to: runLegs[runLegs.length - 1].to,
        legs: runLegs,
      });
    } else {
      // Single unavailable hop — keep as-is.
      items.push({ kind: "single", leg });
    }

    i = end + 1;
  }

  return items;
}

// ---------------------------------------------------------------------------
// Legacy export kept for backward-compat with existing e2e tests that assert
// on the old "collapsed suffix" shape.  New code should use
// `buildAlternatePathDisplayItems` instead.
// ---------------------------------------------------------------------------

export type AlternatePathLegsModalPartition<T extends AlternatePathLegForPartition> =
  | { mode: "flat"; legs: T[] }
  | {
      mode: "collapsed";
      /** Legs shown individually before the merged realtime tail. */
      confirmedPrefix: T[];
      fromLastConfirmedStopToDestination: { from: string; to: string };
    };

function findCollapsibleRealtimeSuffixStart<T extends AlternatePathLegForPartition>(
  legs: T[],
  dest: string,
): number | null {
  const n = legs.length;
  if (n === 0) return null;
  const d = normCode(dest);
  const last = legs[n - 1];
  if (normCode(last.to) !== d) return null;
  if (last.segmentKind !== "check_realtime") return null;

  let start = n - 1;
  for (let i = n - 2; i >= 0; i--) {
    if (legs[i].segmentKind !== "check_realtime") break;
    if (normCode(legs[i].to) !== normCode(legs[i + 1].from)) break;
    start = i;
  }
  return start;
}

export function partitionAlternatePathLegsForModal<T extends AlternatePathLegForPartition>(
  legs: T[],
  journeyDestinationCode: string,
): AlternatePathLegsModalPartition<T> {
  const dest = journeyDestinationCode.trim();
  if (legs.length === 0) {
    return { mode: "flat", legs: [] };
  }

  const start = findCollapsibleRealtimeSuffixStart(legs, dest);
  if (start === null) {
    return { mode: "flat", legs };
  }

  const confirmedPrefix = legs.slice(0, start);
  const suffix = legs.slice(start);
  const from = suffix[0].from;
  const to = suffix[suffix.length - 1].to;

  return {
    mode: "collapsed",
    confirmedPrefix,
    fromLastConfirmedStopToDestination: { from, to },
  };
}
