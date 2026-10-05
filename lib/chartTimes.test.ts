import test from "node:test";
import assert from "node:assert/strict";
import { getChartTimesPageData, listChartTimesSlugs, getCachedChartTimeStation } from "./chartTimes";

test("getCachedChartTimeStation - resolves station chart meta and caches page data in memory", () => {
  const station1 = getCachedChartTimeStation("12015", "JP");
  assert.ok(station1 !== null, "Should return station meta for train 12015 at JP");
  assert.equal(station1?.stationCode, "JP");

  const station2 = getCachedChartTimeStation("12015", "JP");
  assert.deepEqual(station1, station2, "Subsequent calls should return identical cached data");
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
  assert.equal(slugs1, slugs2, "Should return the identical cached array reference");
});
