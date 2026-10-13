import test from "node:test";
import assert from "node:assert/strict";
import { getRouteData } from "./routes-db";
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
