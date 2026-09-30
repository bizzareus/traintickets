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
  assert.equal(trains.length, 160);

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
  assert.ok(url.includes("fromName=New+Delhi") || url.includes("fromName=New%20Delhi"));
  assert.ok(url.includes("toName=Varanasi"));
});

test("getDefaultVandeBharatSearchDate - returns tomorrow in YYYY-MM-DD format", () => {
  const d = getDefaultVandeBharatSearchDate();
  assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
});
