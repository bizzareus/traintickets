import test from "node:test";
import assert from "node:assert/strict";
import { getDiwaliSpecialTrains } from "./diwaliTrains";

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

test("getDiwaliSpecialTrains - contains key high-density festival corridors", () => {
  const trains = getDiwaliSpecialTrains();
  const stations = new Set<string>();
  trains.forEach((t) => {
    stations.add(t.fromStation.code);
    stations.add(t.toStation.code);
  });

  assert.ok(stations.has("KOAA") || stations.has("HWH"));
  assert.ok(stations.has("BNRS") || stations.has("BSB"));
  assert.ok(stations.has("GKP"));
  assert.ok(stations.has("ANVT") || stations.has("NDLS"));
  assert.ok(stations.has("DNR") || stations.has("PNBE"));
});
