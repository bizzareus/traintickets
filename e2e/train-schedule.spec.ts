import { expect, test, type Page } from "@playwright/test";
import type { TrainScheduleResponse } from "../components/booking-v2/alternatePathsTypes";
import { DEFAULT_TRAIN, installBookingV2Mocks } from "./fixtures/booking-v2-mocks";

const schedule: TrainScheduleResponse = {
  trainNumber: "12424",
  trainName: "DBRT RAJDHANI",
  stationFrom: "NDLS",
  stationTo: "DBRG",
  stationList: [
    { stationCode: "NDLS", stationName: "NEW DELHI", departureTime: "16:20", dayCount: 1 },
    { stationCode: "CNB", stationName: "KANPUR CENTRAL", arrivalTime: "21:00", departureTime: "21:05", dayCount: 1 },
    { stationCode: "PRYJ", stationName: "PRAYAGRAJ JN.", arrivalTime: "23:08", departureTime: "23:10", dayCount: 1 },
    { stationCode: "DDU", stationName: "PT. DEEN DAYAL UPADHYAYA JUNCTION", arrivalTime: "01:13", departureTime: "01:20", dayCount: 2 },
    { stationCode: "DNR", stationName: "DANAPUR", arrivalTime: "03:38", departureTime: "03:40", dayCount: 2 },
    { stationCode: "PPTA", stationName: "PATLIPUTRA", arrivalTime: "04:00", departureTime: "04:10", dayCount: 2 },
    { stationCode: "BJU", stationName: "BARAUNI JN.", arrivalTime: "06:35", departureTime: "06:45", dayCount: 2 },
    { stationCode: "KIR", stationName: "KATIHAR JN.", arrivalTime: "09:30", departureTime: "09:40", dayCount: 2 },
    { stationCode: "NJP", stationName: "NEW JALPAIGURI", arrivalTime: "12:05", departureTime: "12:15", dayCount: 2 },
    { stationCode: "DBRG", stationName: "DIBRUGARH", arrivalTime: "05:55", dayCount: 3 },
  ],
};

const scheduleUrl = "**/api/booking-v2/trains/schedule/12424";

async function openSchedule(page: Page) {
  await page.getByRole("button", { name: /^(Train )?Schedule$/ }).click();
  return page.getByRole("dialog", { name: "Train schedule", exact: true });
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-03T06:00:00Z"));
  await installBookingV2Mocks(page, {
    trains: [{ ...DEFAULT_TRAIN, trainNumber: "12424", trainName: "DBRT RAJDHANI", fromStnCode: "NDLS", toStnCode: "PPTA" }],
  });
  await page.route("**/api/booking-v2/best-trains/cached?**", (route) =>
    route.fulfill({ json: { cached: false } }),
  );
  await page.route("**/api/booking-v2/connecting-trains?**", (route) =>
    route.fulfill({ json: { isSupportedCorridor: false, journeys: [] } }),
  );
  await page.route(scheduleUrl, (route) => route.fulfill({ json: schedule }));
  await page.goto("/?from=NDLS&to=PPTA&date=2026-11-10");
  await expect(page.getByRole("combobox", { name: "From", exact: true })).toHaveValue(/NDLS/);
  await page.getByRole("button", { name: "Search trains", exact: true }).click();
});

test("timetable aligns timings, marks the selected journey and restores focus", async ({ page }, testInfo) => {
  const trigger = page.getByRole("button", { name: /^(Train )?Schedule$/ });
  const dialog = await openSchedule(page);
  await expect(dialog.getByRole("table")).toBeVisible();
  await expect(dialog.getByText("Your journey")).toBeVisible();
  await expect(dialog.getByRole("columnheader", { name: "Arrival" })).toBeVisible();
  await expect(dialog.getByRole("columnheader", { name: "Departure" })).toBeVisible();
  await expect(dialog.getByRole("row", { name: /NEW DELHI/ })).toContainText("Boarding");
  await expect(dialog.getByRole("row", { name: /PATLIPUTRA/ })).toContainText("Alighting");
  await expect(dialog.getByRole("row", { name: /UPADHYAYA/ })).toContainText("Day 2");
  await expect(dialog.getByRole("row", { name: /KANPUR/ })).toContainText("9:00 PM");
  await expect(dialog.getByText("All times in IST · Days counted from origin")).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/overflow-hidden/);
  const dimensions = await dialog.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    height: element.getBoundingClientRect().height,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(dimensions.height).toBeLessThanOrEqual(page.viewportSize()!.height * 0.91);
  await dialog.screenshot({ path: testInfo.outputPath("train-schedule.png") });

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator("body")).not.toHaveClass(/overflow-hidden/);
  await trigger.click();
  await page.getByRole("button", { name: "Close train schedule" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("loading and empty schedules have clear states", async ({ page }) => {
  let release = () => {};
  const ready = new Promise<void>((resolve) => { release = resolve; });
  await page.route(scheduleUrl, async (route) => {
    await ready;
    await route.fulfill({ json: { ...schedule, stationList: [] } });
  });
  const dialog = await openSchedule(page);
  await expect(dialog.getByText("Loading train schedule…")).toBeVisible();
  release();
  await expect(dialog.getByText("No schedule available")).toBeVisible();
  await expect(dialog.getByRole("table")).toHaveCount(0);
});

test("failed schedules can be retried", async ({ page }) => {
  await page.route(scheduleUrl, (route) =>
    route.fulfill({ status: 404, json: { message: "Schedule not available" } }),
  );
  const dialog = await openSchedule(page);
  await expect(dialog.getByRole("alert")).toContainText("Schedule unavailable");
  await page.route(scheduleUrl, (route) => route.fulfill({ json: schedule }));
  await dialog.getByRole("button", { name: "Try again" }).click();
  await expect(dialog.getByRole("table")).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
});

test("small screens keep the timetable inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const dialog = await openSchedule(page);
  await expect(dialog.getByRole("table")).toBeVisible();
  const sizing = await dialog.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(sizing.width).toBeLessThanOrEqual(320);
  expect(sizing.scrollWidth).toBeLessThanOrEqual(sizing.clientWidth);
  await expect(dialog.getByRole("button", { name: "Close train schedule" })).toBeVisible();
});
