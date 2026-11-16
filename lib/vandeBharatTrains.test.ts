import test from "node:test";
import assert from "node:assert/strict";
import {
  getAllVandeBharatTrains,
  getVandeBharatTrainByNumber,
  buildVandeBharatSearchRedirectUrl,
  getDefaultVandeBharatSearchDate,
} from "./vandeBharatTrains";

test("getAllVandeBharatTrains - loads the complete catalog of Vande Bharat trains", () => {
  const trains = getAllVandeBharatTrains();
  assert.ok(Array.isArray(trains));
  assert.equal(trains.length, 172);

  for (const t of trains) {
    assert.ok(t.trainNumber && t.trainNumber.length > 0);
    assert.ok(t.trainName && t.trainName.length > 0);
    assert.ok(t.originStation.code && t.originStation.name);
    assert.ok(t.destinationStation.code && t.destinationStation.name);
    assert.ok(t.departureTime);
    assert.ok(t.arrivalTime);
    assert.ok(t.duration);
    assert.ok(Array.isArray(t.classes) && t.classes.length > 0);
    assert.ok(t.slug && t.slug.length > 0);
    assert.ok(t.chartTimesUrl.startsWith("/chart-times/"));
    assert.ok(t.trainDetailUrl.startsWith("/trains/"));
  }
});

test("Every Vande Bharat train has an opposite-direction pair (86 pairs both ways)", () => {
  const trains = getAllVandeBharatTrains();
  const paired = new Set<string>();

  for (const t of trains) {
    if (paired.has(t.trainNumber)) continue;

    const returnTrain = trains.find(
      (other) =>
        other.trainNumber !== t.trainNumber &&
        !paired.has(other.trainNumber) &&
        other.originStation.code === t.destinationStation.code &&
        other.destinationStation.code === t.originStation.code,
    );

    assert.ok(
      returnTrain,
      `Train ${t.trainNumber} (${t.originStation.code} -> ${t.destinationStation.code}) must have an opposite-direction return pair`,
    );

    paired.add(t.trainNumber);
    paired.add(returnTrain.trainNumber);
  }

  assert.equal(
    paired.size,
    172,
    "All 172 trains must be paired in both directions",
  );
});

test("getVandeBharatTrainByNumber - finds specific train by number", () => {
  const t20171 = getVandeBharatTrainByNumber("20171");
  assert.ok(t20171);
  assert.equal(t20171.trainNumber, "20171");
  assert.equal(t20171.originStation.code, "RKMP");
  assert.equal(t20171.destinationStation.code, "NZM");

  const nonExistent = getVandeBharatTrainByNumber("999999");
  assert.equal(nonExistent, null);
});

test("buildVandeBharatSearchRedirectUrl - formats query parameters properly", () => {
  const train = {
    originStation: { code: "NDLS", name: "New Delhi" },
    destinationStation: { code: "BSB", name: "Varanasi" },
  };

  const url = buildVandeBharatSearchRedirectUrl(train, "2026-10-15");
  assert.ok(url.startsWith("/?"));
  assert.ok(url.includes("from=NDLS"));
  assert.ok(url.includes("to=BSB"));
  assert.ok(url.includes("date=2026-10-15"));
  assert.ok(
    url.includes("fromName=New+Delhi") || url.includes("fromName=New%20Delhi"),
  );
  assert.ok(url.includes("toName=Varanasi"));
});

test("getDefaultVandeBharatSearchDate - returns tomorrow in YYYY-MM-DD format", () => {
  const d = getDefaultVandeBharatSearchDate();
  assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
});

test("Vande Bharat Sleeper trains are classified with 1A, 2A, 3A sleeper berths", () => {
  const sleeperNumbers = ["27421", "27422", "27575", "27576", "27651", "27652"];

  for (const num of sleeperNumbers) {
    const t = getVandeBharatTrainByNumber(num);
    assert.ok(t, `Sleeper train ${num} must exist`);
    assert.equal(t.trainType, "Sleeper");
    assert.ok(t.classes.includes("3A"), "Must offer 3A");
    assert.ok(t.classes.includes("2A"), "Must offer 2A");
    assert.ok(t.classes.includes("1A"), "Must offer 1A");
  }
});

test("Every Vande Bharat train has a canonical SEO trainDetailUrl", () => {
  const trains = getAllVandeBharatTrains();
  for (const t of trains) {
    assert.match(
      t.trainDetailUrl,
      /^\/trains\/\d+-[a-z0-9-]+$/,
      `trainDetailUrl must be a slugged URL, got ${t.trainDetailUrl}`,
    );
  }
});

test("Every Vande Bharat train with foodMenuSlug maps to train-food-menu-registry", () => {
  const trains = getAllVandeBharatTrains();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const reg = require("../content/train-food-menu-registry.json");
  const regMap = new Map(
    reg.map((r: { trainNumber: string; slug: string }) => [
      r.trainNumber,
      r.slug,
    ]),
  );

  for (const t of trains) {
    const expectedSlug = regMap.get(t.trainNumber);
    assert.ok(
      expectedSlug,
      `Train ${t.trainNumber} must have a registry entry`,
    );
    assert.equal(
      t.foodMenuSlug,
      expectedSlug,
      `Train ${t.trainNumber} foodMenuSlug must match its own registry slug`,
    );
    assert.equal(
      t.foodMenuUrl,
      `/irctc-train-food-menu/${expectedSlug}`,
      `Train ${t.trainNumber} foodMenuUrl must match its own registry slug`,
    );
  }
});
