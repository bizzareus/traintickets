import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAlternatePathDisplayItems,
  type AlternatePathLegForPartition,
} from "./bookingV2AlternatePathsDisplay";

describe("buildAlternatePathDisplayItems", () => {
  test("collapses chained check_realtime legs on the same train", () => {
    const legs: AlternatePathLegForPartition[] = [
      {
        from: "NDLS",
        to: "CNB",
        segmentKind: "check_realtime",
        trainNumber: "12561",
      },
      {
        from: "CNB",
        to: "BSB",
        segmentKind: "check_realtime",
        trainNumber: "12561",
      },
      {
        from: "BSB",
        to: "PNBE",
        segmentKind: "confirmed",
        trainNumber: "05585",
      },
    ];

    const items = buildAlternatePathDisplayItems(legs);
    assert.equal(items.length, 2);
    assert.equal(items[0].kind, "collapsed");
    if (items[0].kind === "collapsed") {
      assert.equal(items[0].from, "NDLS");
      assert.equal(items[0].to, "BSB");
      assert.equal(items[0].legs.length, 2);
    }
    assert.equal(items[1].kind, "single");
  });

  test("does not merge chained check_realtime legs across different connecting trains", () => {
    const legs: AlternatePathLegForPartition[] = [
      {
        from: "NDLS",
        to: "CNB",
        segmentKind: "check_realtime",
        trainNumber: "12561",
      },
      {
        from: "CNB",
        to: "BSB",
        segmentKind: "check_realtime",
        trainNumber: "12561",
      },
      {
        from: "BSB",
        to: "DDU",
        segmentKind: "check_realtime",
        trainNumber: "05585",
      },
      {
        from: "DDU",
        to: "PNBE",
        segmentKind: "check_realtime",
        trainNumber: "05585",
      },
    ];

    const items = buildAlternatePathDisplayItems(legs);
    assert.equal(items.length, 2);
    assert.deepEqual(
      items.map((item) =>
        item.kind === "collapsed"
          ? {
              kind: item.kind,
              from: item.from,
              to: item.to,
              train: item.legs[0].trainNumber,
            }
          : null,
      ),
      [
        { kind: "collapsed", from: "NDLS", to: "BSB", train: "12561" },
        { kind: "collapsed", from: "BSB", to: "PNBE", train: "05585" },
      ],
    );
  });
});
