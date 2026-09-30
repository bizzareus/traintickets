import test from "node:test";
import assert from "node:assert/strict";
import { getRouteData, getTopRoutes, getStationByCodeOrName, STATIONS } from "./routes-db";

test("getRouteData - returns valid route data for existing station slugs", async () => {
  const data = await getRouteData("delhi", "mumbai");
  assert.ok(data);
  assert.equal(data?.origin.code, "NDLS");
  assert.equal(data?.destination.code, "MMCT");
  assert.ok(data?.distanceKm > 0);
  assert.ok(data?.topTrains.length > 0);
});

test("getRouteData - returns null for same origin and destination", async () => {
  const data = await getRouteData("delhi", "delhi");
  assert.equal(data, null);
});

test("getRouteData - returns null for non-existent station slug", async () => {
  const data = await getRouteData("delhi", "non-existent-city");
  assert.equal(data, null);
});

test("getTopRoutes - returns list of top routes", async () => {
  const routes = await getTopRoutes();
  assert.ok(routes.length > 0);
  assert.equal(routes[0].origin, "delhi");
  assert.equal(routes[0].dest, "mumbai");
});

test("getStationByCodeOrName - resolves by code or fallback name match", () => {
  const byCode = getStationByCodeOrName("NDLS");
  assert.equal(byCode?.slug, "delhi");

  const byCodeLower = getStationByCodeOrName("ndls");
  assert.equal(byCodeLower?.slug, "delhi");

  const byName = getStationByCodeOrName("New Delhi");
  assert.equal(byName?.slug, "delhi");

  const nonExistent = getStationByCodeOrName("UNKNOWN");
  assert.equal(nonExistent, undefined);
});
