import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type {
  AlternateClassOption,
  AlternateLeg,
} from "@/components/booking-v2/alternatePathsTypes";
import {
  buildSplitBookingSelection,
  getLegClassOptions,
  getSelectedLegClass,
} from "./splitBookingSelection";

const option = (
  travelClass: string,
  fare: number | null,
): AlternateClassOption => ({
  travelClass,
  fare,
  railDataStatus: "AVAILABLE-0010",
  availabilityDisplayName: "AVL 10",
  availablityStatus: null,
  predictionPercentage: null,
});
const leg = (
  from: string,
  to: string,
  options: AlternateClassOption[],
): AlternateLeg => ({
  ...options[0],
  from,
  to,
  segmentKind: "confirmed",
  confirmedClassOptions: options,
  boardingDate: "2026-10-01",
  departureTime: "10:00",
  arrivalTime: "11:00",
  durationMinutes: 60,
});

describe("per-leg booking class choices", () => {
  const legs = [
    leg("DEC", "GGN", [
      option("SL", 180),
      option("3A", 565),
      option("2A", 770),
    ]),
    leg("GGN", "AII", [option("3A", 565)]),
  ];

  test("requires an explicit choice for multiple classes and auto-selects a single class", () => {
    const selection = buildSplitBookingSelection(legs, {});
    assert.deepEqual(selection.missingLegIndices, [0]);
    assert.equal(selection.totalFare, null);
    assert.equal(selection.legs[0].travelClass, "3A");
    assert.equal(getSelectedLegClass(legs[0]), null);
  });

  test("uses the chosen fare instead of the leg's default cheapest fare", () => {
    const selection = buildSplitBookingSelection(legs, { 0: "2A" });
    assert.equal(selection.totalFare, 1335);
    assert.deepEqual(
      selection.legs.map(({ travelClass, fare }) => ({ travelClass, fare })),
      [
        { travelClass: "2A", fare: 770 },
        { travelClass: "3A", fare: 565 },
      ],
    );
    assert.equal(selection.legs[0].boardingDate, "2026-10-01");
    assert.equal(selection.legs[0].departureTime, "10:00");
    assert.equal(legs[0].travelClass, "SL");
    assert.equal(legs[0].fare, 180);
  });

  test("selects classes independently on each leg", () => {
    const choices = [
      legs[0],
      leg("GGN", "AII", [option("SL", 200), option("3A", 600)]),
    ];
    const incomplete = buildSplitBookingSelection(choices, { 0: "3A" });
    assert.equal(incomplete.totalFare, null);
    assert.deepEqual(incomplete.missingLegIndices, [1]);
    const complete = buildSplitBookingSelection(choices, { 0: "3A", 1: "SL" });
    assert.equal(complete.totalFare, 765);
    assert.deepEqual(
      complete.legs.map((item) => item.travelClass),
      ["3A", "SL"],
    );
  });

  test("keeps original leg indices when unavailable stretches are present", () => {
    const unavailable = {
      ...leg("GGN", "NNL", [option("SL", 999)]),
      segmentKind: "check_realtime" as const,
    };
    const selection = buildSplitBookingSelection(
      [legs[0], unavailable, leg("NNL", "RGS", [option("3A", 565)])],
      { 0: "3A", 1: "SL" },
    );
    assert.equal(selection.totalFare, 1130);
    assert.deepEqual(
      selection.legs.map((item) => [item.from, item.to]),
      [
        ["DEC", "GGN"],
        ["NNL", "RGS"],
      ],
    );
    assert.deepEqual(getLegClassOptions(unavailable), []);
  });

  test("supports legacy single-class results without inventing a missing class", () => {
    const legacy = { ...legs[1], confirmedClassOptions: undefined };
    assert.equal(getSelectedLegClass(legacy)?.travelClass, "3A");
    assert.equal(getSelectedLegClass({ ...legacy, travelClass: null }), null);
  });

  test("blocks stale choices and classes without a valid quoted fare", () => {
    assert.equal(buildSplitBookingSelection(legs, { 0: "1A" }).totalFare, null);
    for (const fare of [null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const unpriced = leg("DEC", "GGN", [option("3A", fare)]);
      assert.equal(getSelectedLegClass(unpriced), null);
      assert.equal(
        buildSplitBookingSelection([unpriced, legs[1]], { 0: "3A" }).totalFare,
        null,
      );
    }
  });

  test("resolves the latest offered fare rather than retaining a stale amount", () => {
    const updated = leg("DEC", "GGN", [option("SL", 180), option("3A", 650)]);
    assert.equal(
      buildSplitBookingSelection([updated, legs[1]], { 0: "3A" }).totalFare,
      1215,
    );
  });

  test("allows skipping any leg and selectively booking a single leg", () => {
    // Skip leg 0, book leg 1
    const skipFirst = buildSplitBookingSelection(legs, { 0: "SKIP" });
    assert.equal(skipFirst.totalFare, 565);
    assert.equal(skipFirst.legs.length, 1);
    assert.equal(skipFirst.legs[0].from, "GGN");
    assert.equal(skipFirst.legs[0].to, "AII");
    assert.deepEqual(skipFirst.missingLegIndices, []);

    // Book leg 0, skip leg 1
    const skipSecond = buildSplitBookingSelection(legs, { 0: "2A", 1: "SKIP" });
    assert.equal(skipSecond.totalFare, 770);
    assert.equal(skipSecond.legs.length, 1);
    assert.equal(skipSecond.legs[0].from, "DEC");
    assert.equal(skipSecond.legs[0].to, "GGN");
    assert.deepEqual(skipSecond.missingLegIndices, []);

    // Skipping all legs yields totalFare null (at least 1 leg is mandatory)
    const skipAll = buildSplitBookingSelection(legs, { 0: "SKIP", 1: "SKIP" });
    assert.equal(skipAll.totalFare, null);
    assert.equal(skipAll.legs.length, 0);
  });

  test("captures availability for each leg at the time of booking", () => {
    const selection = buildSplitBookingSelection(legs, { 0: "2A" });
    assert.equal(selection.legs[0].availability, "AVL 10");
    assert.equal(selection.legs[1].availability, "AVL 10");

    const customLeg = leg("GWL", "BINA", [
      {
        travelClass: "3E",
        fare: 565,
        availabilityDisplayName: "Available",
        availablityStatus: "AVAILABLE-0024#",
        railDataStatus: "AVAILABLE",
        predictionPercentage: null,
      },
    ]);
    const customSelection = buildSplitBookingSelection([customLeg], {});
    assert.equal(customSelection.legs[0].availability, "AVAILABLE-0024");
  });
});
