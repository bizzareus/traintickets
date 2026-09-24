import test from "node:test";
import assert from "node:assert/strict";
import {
  getDiwaliSpecialTrains,
  getDiwaliTrainRunningDates,
  buildDiwaliSearchRedirectUrl,
  extractAvailableSeatsCount,
  DEFAULT_DIWALI_SEARCH_DATE,
  DIWALI_TARGET_DATES,
} from "./diwaliTrains";

test("getDiwaliSpecialTrains - loads the complete list of 63 Diwali special trains", () => {
  const trains = getDiwaliSpecialTrains();
  assert.ok(Array.isArray(trains));
  assert.equal(trains.length, 63);
});

test("getDiwaliSpecialTrains - verifies train structure and essential fields", () => {
  const trains = getDiwaliSpecialTrains();
  for (const t of trains) {
    assert.ok(t.trainNumber && t.trainNumber.length > 0);
    assert.ok(t.trainName && t.trainName.length > 0);
    assert.ok(t.fromStation.code && t.fromStation.name);
    assert.ok(t.toStation.code && t.toStation.name);
    assert.ok(t.departureTime);
    assert.ok(t.arrivalTime);
    assert.ok(t.duration);
  }
});

test("getDiwaliTrainRunningDates - filters strictly to Nov 4-7, 2026", () => {
  const trains = getDiwaliSpecialTrains();
  assert.equal(DIWALI_TARGET_DATES.length, 4);

  // Train 05047 runs Wed in Oct 07 - Nov 25 -> 2026-11-04 (Wed)
  const t05047 = trains.find((t) => t.trainNumber === "05047");
  assert.ok(t05047);
  const dates05047 = getDiwaliTrainRunningDates(t05047);
  assert.equal(dates05047.length, 1);
  assert.equal(dates05047[0].date, "2026-11-04");

  // Train 05977 runs Thu in Oct 08 - Nov 26 -> 2026-11-05 (Thu)
  const t05977 = trains.find((t) => t.trainNumber === "05977");
  assert.ok(t05977);
  const dates05977 = getDiwaliTrainRunningDates(t05977);
  assert.equal(dates05977.length, 1);
  assert.equal(dates05977[0].date, "2026-11-05");

  // Train 04064 runs daily (all 7 days) -> all 4 dates (Nov 4, 5, 6, 7)
  const t04064 = trains.find((t) => t.trainNumber === "04064");
  assert.ok(t04064);
  const dates04064 = getDiwaliTrainRunningDates(t04064);
  assert.equal(dates04064.length, 4);
});

test("buildDiwaliSearchRedirectUrl - generates search URL with date 2026-11-05", () => {
  const url = buildDiwaliSearchRedirectUrl({
    fromStation: { code: "NDLS", name: "New Delhi" },
    toStation: { code: "PNBE", name: "Patna" },
  });

  assert.equal(
    url,
    `/?from=NDLS&to=PNBE&date=${DEFAULT_DIWALI_SEARCH_DATE}&fromName=New+Delhi&toName=Patna`,
  );
});

test("extractAvailableSeatsCount - extracts seat numbers from various IRCTC formats", () => {
  assert.equal(extractAvailableSeatsCount("AVAILABLE-0042"), 42);
  assert.equal(extractAvailableSeatsCount("AVAILABLE 15"), 15);
  assert.equal(extractAvailableSeatsCount("AVL 8"), 8);
  assert.equal(extractAvailableSeatsCount("CURR_AVBL-0004"), 4);
  assert.equal(extractAvailableSeatsCount("CURR_AVL 5"), 5);
  assert.equal(extractAvailableSeatsCount("CNF"), 1);
  assert.equal(extractAvailableSeatsCount("WL 12"), 0);
  assert.equal(extractAvailableSeatsCount("REGRET"), 0);
  assert.equal(extractAvailableSeatsCount(""), 0);
  assert.equal(extractAvailableSeatsCount(null), 0);
});
