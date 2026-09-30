import test from "node:test";
import assert from "node:assert/strict";
import {
  getAllSpecialTrains,
  getSpecialTrainsForFestival,
  getFestivalConfig,
  getSpecialTrainRunningDates,
  buildSpecialTrainSearchRedirectUrl,
  extractAvailableSeatsCount,
  FESTIVAL_KEYS,
  DIWALI_TARGET_DATES,
  CHHATH_TARGET_DATES,
  DUSSHERA_TARGET_DATES,
  PUJA_TARGET_DATES,
} from "./specialTrains";

test("getAllSpecialTrains - loads full catalog of festival special trains", () => {
  const trains = getAllSpecialTrains();
  assert.ok(Array.isArray(trains));
  assert.ok(trains.length >= 100, `Expected at least 100 special trains, got ${trains.length}`);

  for (const t of trains) {
    assert.ok(t.trainNumber && t.trainNumber.length > 0);
    assert.ok(t.trainName && t.trainName.length > 0);
    assert.ok(t.fromStation.code && t.fromStation.name);
    assert.ok(t.toStation.code && t.toStation.name);
    assert.ok(t.departureTime);
    assert.ok(t.arrivalTime);
    assert.ok(t.duration);
    assert.ok(Array.isArray(t.festivals) && t.festivals.length > 0);
  }
});

test("getSpecialTrainsForFestival - correctly filters by festival", () => {
  for (const festival of FESTIVAL_KEYS) {
    const trains = getSpecialTrainsForFestival(festival);
    assert.ok(trains.length > 0, `Expected trains for festival ${festival}`);
    for (const t of trains) {
      assert.ok(
        t.festivals.includes(festival),
        `Train ${t.trainNumber} must have festival tag ${festival}`,
      );
    }
  }

  const diwaliTrains = getSpecialTrainsForFestival("diwali");
  const chhathTrains = getSpecialTrainsForFestival("chhath");
  const dussheraTrains = getSpecialTrainsForFestival("dusshera");
  const pujaTrains = getSpecialTrainsForFestival("puja");

  assert.ok(diwaliTrains.length >= 90, `Diwali trains: ${diwaliTrains.length}`);
  assert.ok(chhathTrains.length >= 50, `Chhath trains: ${chhathTrains.length}`);
  assert.ok(dussheraTrains.length >= 30, `Dusshera trains: ${dussheraTrains.length}`);
  assert.ok(pujaTrains.length >= 25, `Puja trains: ${pujaTrains.length}`);
});

test("getFestivalConfig - retrieves configuration including aliases", () => {
  const diwali = getFestivalConfig("diwali");
  assert.ok(diwali && diwali.title.includes("Diwali"));
  assert.equal(diwali.canonicalPath, "/special-trains/diwali");

  const chhath = getFestivalConfig("chhath");
  assert.ok(chhath && chhath.title.includes("Chhath"));
  assert.equal(chhath.canonicalPath, "/special-trains/chhath");

  const dusshera = getFestivalConfig("dusshera");
  assert.ok(dusshera && dusshera.title.includes("Dusshera"));
  assert.equal(dusshera.canonicalPath, "/special-trains/dusshera");

  // Alias support for alternate spelling "dussehra"
  const dussehraAlias = getFestivalConfig("dussehra");
  assert.ok(dussehraAlias);
  assert.equal(dussehraAlias.key, "dusshera");

  const puja = getFestivalConfig("puja");
  assert.ok(puja && puja.title.includes("Durga Puja"));
  assert.equal(puja.canonicalPath, "/special-trains/puja");

  assert.equal(getFestivalConfig("nonexistent"), null);
});

test("Festival target dates are defined correctly for 2026", () => {
  assert.equal(DIWALI_TARGET_DATES.length, 5);
  assert.equal(CHHATH_TARGET_DATES.length, 6);
  assert.equal(DUSSHERA_TARGET_DATES.length, 5);
  assert.equal(PUJA_TARGET_DATES.length, 6);
});

test("getSpecialTrainRunningDates - matches dates for respective festival windows", () => {
  // Train 04072 runs daily (all 7 days) from Oct 01 to Nov 30
  const train04072 = {
    dateFrom: "Oct 01",
    dateTo: "Nov 30",
    runningDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  };

  const diwaliDates = getSpecialTrainRunningDates(train04072, "diwali");
  assert.equal(diwaliDates.length, DIWALI_TARGET_DATES.length);

  const chhathDates = getSpecialTrainRunningDates(train04072, "chhath");
  assert.equal(chhathDates.length, CHHATH_TARGET_DATES.length);

  const dussheraDates = getSpecialTrainRunningDates(train04072, "dusshera");
  assert.equal(dussheraDates.length, DUSSHERA_TARGET_DATES.length);
});

test("buildSpecialTrainSearchRedirectUrl - formats query parameters properly", () => {
  const train = {
    fromStation: { code: "NDLS", name: "New Delhi" },
    toStation: { code: "PNBE", name: "Patna Jn" },
    dateFrom: "Oct 01",
    dateTo: "Nov 30",
    runningDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  };

  const diwaliUrl = buildSpecialTrainSearchRedirectUrl(train, "diwali");
  assert.ok(diwaliUrl.startsWith("/?"));
  assert.ok(diwaliUrl.includes("from=NDLS"));
  assert.ok(diwaliUrl.includes("to=PNBE"));
  assert.ok(diwaliUrl.includes("date=2026-11-05"));

  const chhathUrl = buildSpecialTrainSearchRedirectUrl(train, "chhath");
  assert.ok(chhathUrl.includes("date=2026-11-14"));

  const dussheraUrl = buildSpecialTrainSearchRedirectUrl(train, "dusshera");
  assert.ok(dussheraUrl.includes("date=2026-10-18"));

  const pujaUrl = buildSpecialTrainSearchRedirectUrl(train, "puja");
  assert.ok(pujaUrl.includes("date=2026-10-17"));
});

test("extractAvailableSeatsCount - extracts availability counts correctly", () => {
  assert.equal(extractAvailableSeatsCount("AVAILABLE-0042"), 42);
  assert.equal(extractAvailableSeatsCount("CURR_AVBL 15"), 15);
  assert.equal(extractAvailableSeatsCount("AVL 5"), 5);
  assert.equal(extractAvailableSeatsCount("CNF"), 1);
  assert.equal(extractAvailableSeatsCount("WL 45"), 0);
  assert.equal(extractAvailableSeatsCount(null), 0);
  assert.equal(extractAvailableSeatsCount(""), 0);
});
