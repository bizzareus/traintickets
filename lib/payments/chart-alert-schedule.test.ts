import test from "node:test";
import assert from "node:assert/strict";
import {
  chartTimeSelection,
  withChartTimeSelection,
} from "../chart-alert-schedule";
import {
  createChartAlertPaymentLink,
  createFreeChartAlert,
} from "../chart-alert-payments";
import { apiClient } from "../api";

const selected = {
  chartTimeLocal: "19:08",
  chartOneDayOffset: 0,
  chartTwoTimeLocal: "05:35",
  chartTwoDayOffset: 1,
};
const journey = {
  trainNumber: "12665",
  fromStationCode: "RJY",
  toStationCode: "DG",
  journeyDate: "2026-09-29",
  classCode: "SL",
  email: "test@example.com",
};

test("preserves both displayed times and the selected train start without another lookup", async (t) => {
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("Unexpected metadata lookup");
  });
  const input = { ...journey, ...selected, trainStartDate: "2026-09-28" };
  assert.deepEqual(await withChartTimeSelection(input), input);
});

test("search alerts fetch the page snapshot and derive train start for Day-2 boarding", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ ...selected, stationCode: "RJY", day: 2 }),
  );
  assert.deepEqual(await withChartTimeSelection(journey), {
    ...journey,
    ...selected,
    trainStartDate: "2026-09-28",
  });
  assert.equal(
    fetchMock.mock.calls[0].arguments[0],
    "/api/chart-alert-schedule/12665/RJY",
  );
});

test("changing the boarding date shifts the derived run date, not the selected clocks", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ ...selected, day: 2 }),
  );
  const input = await withChartTimeSelection({
    ...journey,
    journeyDate: "2026-10-01",
  });
  assert.equal(input.trainStartDate, "2026-09-30");
  assert.deepEqual(chartTimeSelection(input), selected);
});

test("a date lookup cannot overwrite already selected chart times with different cache values", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ chartTimeLocal: "13:41", chartOneDayOffset: 0, day: 2 }),
  );
  const input = await withChartTimeSelection({ ...journey, ...selected });
  assert.deepEqual(chartTimeSelection(input), selected);
});

test("payment and free-alert HTTP payloads both include the same two-chart snapshot", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ ...selected, day: 2 }),
  );
  const requests: { url: string; body: unknown }[] = [];
  const previousAdapter = apiClient.defaults.adapter;
  t.after(() => {
    apiClient.defaults.adapter = previousAdapter;
  });
  apiClient.defaults.adapter = async (config) => {
    requests.push({ url: config.url!, body: JSON.parse(config.data) });
    return {
      data: { qrImageUrl: "https://example.test/qr.png" },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    };
  };
  await createChartAlertPaymentLink(journey);
  await createFreeChartAlert(journey);
  assert.deepEqual(
    requests,
    ["/api/chart-alert-payments/create", "/api/availability/journey"].map(
      (url) => ({
        url,
        body: { ...journey, ...selected, trainStartDate: "2026-09-28" },
      }),
    ),
  );
});

test("free chart alert from shortlink params (e.g. 22439/UMB) resolves schedule and posts complete snapshot", async (t) => {
  const shortlinkJourney = {
    trainNumber: "22439",
    fromStationCode: "UMB",
    toStationCode: "LDH",
    journeyDate: "2026-10-08",
    classCode: "CC",
    email: "ajayk345290@gmail.com",
  };
  const umbSnapshot = {
    stationCode: "UMB",
    day: 1,
    chartTimeLocal: "21:19",
    chartOneDayOffset: -1,
    chartTwoTimeLocal: "05:45",
    chartTwoDayOffset: 0,
  };
  t.mock.method(globalThis, "fetch", async (url: string) => {
    assert.equal(url, "/api/chart-alert-schedule/22439/UMB");
    return Response.json(umbSnapshot);
  });
  let postedPayload: Record<string, unknown> | null = null;
  t.mock.method(apiClient, "post", async (url: string, data: Record<string, unknown>) => {
    assert.equal(url, "/api/availability/journey");
    postedPayload = data;
    return { data: { accepted: true, status: "scheduled" } };
  });

  await createFreeChartAlert(shortlinkJourney);

  assert.deepEqual(postedPayload, {
    ...shortlinkJourney,
    chartTimeLocal: "21:19",
    chartOneDayOffset: -1,
    chartTwoTimeLocal: "05:45",
    chartTwoDayOffset: 0,
    trainStartDate: "2026-10-08",
  });
});

test("missing chart data fails before any payment or subscription POST", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "unavailable" }, { status: 404 }),
  );
  const post = t.mock.method(apiClient, "post", async () => {
    throw new Error("POST must not happen");
  });
  await assert.rejects(
    createChartAlertPaymentLink(journey),
    /Chart times are unavailable/,
  );
  await assert.rejects(
    createFreeChartAlert(journey),
    /Chart times are unavailable/,
  );
  assert.equal(post.mock.callCount(), 0);
});

test("single-chart data does not invent a second chart or preserve an orphaned offset", async (t) => {
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("Unexpected lookup");
  });
  const input = await withChartTimeSelection({
    ...journey,
    trainStartDate: "2026-09-28",
    chartTimeLocal: "19:08",
    chartOneDayOffset: 0,
    chartTwoDayOffset: 1,
  });
  assert.equal("chartTwoTimeLocal" in input, false);
  assert.equal("chartTwoDayOffset" in input, false);
});

test("normalizes nullable offsets consistently with the displayed page", () => {
  assert.deepEqual(
    chartTimeSelection({ chartTimeLocal: "5:35", chartOneDayOffset: null }),
    { chartTimeLocal: "05:35", chartOneDayOffset: 0 },
  );
  assert.throws(
    () => chartTimeSelection({ chartTimeLocal: "24:00" }),
    /Chart times are unavailable/,
  );
  assert.throws(
    () =>
      chartTimeSelection({ chartTimeLocal: "19:08", chartOneDayOffset: 0.5 }),
    /Invalid chart day offset/,
  );
  assert.throws(
    () => chartTimeSelection({ ...selected, chartTwoTimeLocal: "05:99" }),
    /Chart times are unavailable/,
  );
});

test("does not guess a Day-1 anchor when the boarding-day metadata is missing", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json(selected));
  await assert.rejects(
    withChartTimeSelection(journey),
    /boarding station day is unavailable/,
  );
});
