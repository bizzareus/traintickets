import test from "node:test";
import assert from "node:assert/strict";
import {
  getCachedChartTimeStation,
  getChartTimesPageData,
  listChartTimesSlugs,
} from "./chartTimes";

test("getCachedChartTimeStation - performs O(1) station lookup and handles case-insensitivity", async () => {
  // Ensure train file is loaded/cached
  const pageData = await getChartTimesPageData("12015");
  assert.ok(pageData !== null && pageData.stations.length > 0);

  const firstStation = pageData.stations[0];
  const foundExact = getCachedChartTimeStation("12015", firstStation.stationCode);
  assert.ok(foundExact !== null);
  assert.equal(foundExact?.stationCode, firstStation.stationCode);

  const foundLowercase = getCachedChartTimeStation(
    "12015",
    firstStation.stationCode.toLowerCase(),
  );
  assert.ok(foundLowercase !== null);
  assert.equal(foundLowercase?.stationCode, firstStation.stationCode);

  const nonExistent = getCachedChartTimeStation("12015", "INVALID_STATION_CODE");
  assert.equal(nonExistent, null);
});

test("getChartTimesPageData - resolves page data for known train using O(1) cached path lookup", async () => {
  const data = await getChartTimesPageData("12015");
  assert.ok(data !== null, "Should return page data for train 12015");
  assert.equal(data?.trainNumber, "12015");
  assert.ok(Array.isArray(data?.stations));
});

test("getChartTimesPageData - returns null for non-existent train", async () => {
  const data = await getChartTimesPageData("9999999");
  assert.equal(data, null);
});

test("listChartTimesSlugs - returns cached list of chart times slugs", () => {
  const slugs1 = listChartTimesSlugs();
  const slugs2 = listChartTimesSlugs();
  assert.ok(Array.isArray(slugs1));
  assert.ok(slugs1.length > 0);
  assert.equal(
    slugs1,
    slugs2,
    "Should return the identical cached array reference",
  );
});
