/**
 * Shapes alternate-path legs for the booking v2 modal: collapse a suffix of
 * consecutive `check_realtime` hops that chain together and end at the journey
 * destination into one “from → destination” row.
 */

export type AlternatePathLegForPartition = {
  from: string;
  to: string;
  segmentKind: "confirmed" | "check_realtime";
};

export type AlternatePathLegsModalPartition<T extends AlternatePathLegForPartition> =
  | { mode: "flat"; legs: T[] }
  | {
      mode: "collapsed";
      /** Legs shown individually before the merged realtime tail (may include confirmed or check_realtime). */
      confirmedPrefix: T[];
      fromLastConfirmedStopToDestination: { from: string; to: string };
    };

function normCode(s: string): string {
  return s.trim().toUpperCase();
}

/**
 * Index of the first leg in the longest suffix such that: every leg is
 * `check_realtime`, consecutive legs chain (to → from), and the last leg ends
 * at `dest`. Returns null if the final leg does not qualify.
 */
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
