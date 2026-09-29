import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "../../app/api/chart-alert-schedule/[trainNumber]/[stationCode]/route";

test("the public alert snapshot matches the displayed 12665/RJY row including remote charting", async () => {
  const response = await GET(new Request("http://localhost/"), {
    params: Promise.resolve({ trainNumber: "12665", stationCode: "RJY" }),
  });
  assert.equal(response.status, 200);
  const row = await response.json();
  assert.equal(row.chartTimeLocal, "19:08");
  assert.equal(row.chartOneDayOffset, 0);
  assert.equal(row.chartTwoTimeLocal, "05:35");
  assert.equal(row.chartTwoDayOffset, 1);
  assert.equal(row.chartRemoteStation, "VSKP");
  assert.equal(row.day, 2);
});

test("unknown station data is unavailable, never a made-up departure estimate", async () => {
  const response = await GET(new Request("http://localhost/"), {
    params: Promise.resolve({ trainNumber: "12665", stationCode: "UNKNOWN" }),
  });
  assert.equal(response.status, 404);
});

test("rejects invalid train and station identifiers before reading page data", async () => {
  const response = await GET(new Request("http://localhost/"), {
    params: Promise.resolve({ trainNumber: "../12665", stationCode: "RJY" }),
  });
  assert.equal(response.status, 400);
});
