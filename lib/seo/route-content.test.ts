import test from "node:test";
import assert from "node:assert/strict";
import { getRouteData, getTopRoutes } from "./routes-db";
import { getRouteTrains } from "./route-content";

test("route guides use actual stations and exclude trains missing the corridor", async () => {
  const route = await getRouteData("chennai", "bengaluru");
  assert.ok(route);
  const trains = await getRouteTrains(route);
  assert.ok(
    trains.some(
      (train) =>
        train.number === "12007" &&
        train.from.stationCode === "MAS" &&
        train.to.stationCode === "SBC",
    ),
  );
  assert.ok(!trains.some((train) => train.number === "12607"));
});

test("every published route has matching timetable data", async () => {
  for (const { origin, dest } of await getTopRoutes()) {
    const route = await getRouteData(origin, dest);
    assert.ok(route);
    const trains = await getRouteTrains(route);
    assert.ok(trains.length > 0, `${origin}-to-${dest} has no valid trains`);
    for (const train of trains) {
      assert.ok(train.from.departureTime && train.to.arrivalTime);
      assert.ok(train.distanceKm === null || train.distanceKm > 0);
    }
  }
});

test("route distance is measured between boarding and destination stations", async () => {
  const route = await getRouteData("bengaluru", "chennai");
  assert.ok(route);
  const train = (await getRouteTrains(route)).find((t) => t.number === "12008");
  assert.equal(train?.distanceKm, 361);
  assert.equal(train?.to.day, 1);
});
