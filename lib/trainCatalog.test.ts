import test from "node:test";
import assert from "node:assert/strict";
import {
  getTrains,
  getTrainByNumber,
  buildSearchUrl,
  type TrainCatalogType,
} from "./trainCatalog";

const CATALOG_TYPES: TrainCatalogType[] = [
  "vande-bharat",
  "shatabdi",
  "rajdhani",
  "garib-rath",
];

test("getTrains - returns array for each catalog type", () => {
  for (const type of CATALOG_TYPES) {
    const trains = getTrains(type);
    assert.ok(Array.isArray(trains), `Catalog ${type} should return an array`);
    assert.ok(trains.length > 0, `Catalog ${type} should contain trains`);

    const first = trains[0];
    assert.ok(first.trainNumber, "Train number should be present");
    assert.ok(first.trainName, "Train name should be present");
    assert.ok(first.originStation.code, "Origin station code should be present");
    assert.ok(first.destinationStation.code, "Destination station code should be present");
  }
});

test("getTrainByNumber - returns O(1) map lookup result for existing train numbers across all catalogs", () => {
  for (const type of CATALOG_TYPES) {
    const trains = getTrains(type);
    const sample = trains[0];

    const found = getTrainByNumber(type, sample.trainNumber);
    assert.ok(found, `Should find train ${sample.trainNumber} in ${type}`);
    assert.equal(found?.trainNumber, sample.trainNumber);
    assert.equal(found?.trainName, sample.trainName);

    // Test with leading/trailing whitespace
    const foundPadded = getTrainByNumber(type, `  ${sample.trainNumber}  `);
    assert.ok(foundPadded, `Should find train ${sample.trainNumber} even with whitespace`);
    assert.equal(foundPadded?.trainNumber, sample.trainNumber);
  }
});

test("getTrainByNumber - handles missing and invalid train numbers", () => {
  assert.equal(getTrainByNumber("vande-bharat", "999999"), null);
  assert.equal(getTrainByNumber("shatabdi", ""), null);
  assert.equal(getTrainByNumber("rajdhani", null as unknown as string), null);
  assert.equal(getTrainByNumber("garib-rath", undefined as unknown as string), null);
});

test("buildSearchUrl - formats search parameters correctly", () => {
  const url = buildSearchUrl({
    originStation: { code: "ndls", name: "New Delhi" },
    destinationStation: { code: "sbc", name: "KSR Bengaluru" },
  });

  assert.equal(url, "/?from=NDLS&to=SBC&fromName=New+Delhi&toName=KSR+Bengaluru");
});
