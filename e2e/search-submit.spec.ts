import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  alternatePathTwoConfirmed,
  DEFAULT_TRAIN,
  installBookingV2Mocks,
} from "./fixtures/booking-v2-mocks";

async function selectStation(scope: Page | Locator, label: string, code: string) {
  await scope.getByRole("combobox", { name: label, exact: true }).fill(code);
  await scope.getByRole("option", { name: new RegExp(code) }).click();
}

async function setup(page: Page) {
  await page.clock.setFixedTime(new Date("2026-10-01T06:00:00Z"));
  await installBookingV2Mocks(page, {
    // Every search scans this waitlisted train, exposing accidental rescans.
    trains: [{ ...DEFAULT_TRAIN, availabilityCache: {} }],
    alternatePaths: alternatePathTwoConfirmed(DEFAULT_TRAIN.trainNumber),
  });
  await page.route("**/api/booking-v2/best-trains/cached?**", (route) =>
    route.fulfill({ json: { cached: false } }),
  );
  const searches: URLSearchParams[] = [];
  const scans: Array<{ date: string; avlClasses: string[] }> = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/booking-v2/trains/search") {
      searches.push(url.searchParams);
    }
    if (url.pathname === "/api/booking-v2/alternate-paths/stream") {
      scans.push(request.postDataJSON());
    }
  });
  return { searches, scans };
}

test("prefilled search fields wait for Search trains", async ({ page }) => {
  const { searches, scans } = await setup(page);
  await page.goto("/?from=ORIG&to=DEST&date=2026-10-01&classes=SL");
  await expect(page.getByRole("combobox", { name: "From", exact: true })).toHaveValue(/ORIG/);
  // Allow field effects and the station autocomplete debounce to settle.
  await page.waitForTimeout(700);
  expect(searches).toHaveLength(0);
  expect(scans).toHaveLength(0);

  await page.getByRole("button", { name: "Search trains", exact: true }).click();
  await expect(page.getByText("Found 1 train with confirmed options", { exact: true })).toBeVisible();
  expect(searches).toHaveLength(1);
  expect(scans.length).toBeGreaterThan(0);
  expect(searches[0].get("date")).toBe("2026-10-01");
  expect(searches[0].get("classes")).toBe("SL");
});

test("draft fields preserve results and scans until Search trains is clicked", async ({ page, isMobile }) => {
  const { searches, scans } = await setup(page);
  await page.goto("/");
  await expect(page.getByLabel("Departure date", { exact: true })).toHaveValue(/Oct 01/);
  await selectStation(page, "From", "ORIG");
  await selectStation(page, "To", "DEST");
  await page.getByRole("button", { name: "Search trains", exact: true }).click();
  const progress = page.getByText("Found 1 train with confirmed options", { exact: true });
  const results = page.getByRole("list", { name: "Train results" });
  await expect(progress).toBeVisible();
  const initialResults = await results.innerText();
  const initialUrl = page.url();
  expect(searches).toHaveLength(1);
  // Development Strict Mode can restart a scan on mount. Draft edits must
  // cause no additional requests after the submitted scan has completed.
  const initialScanCount = scans.length;
  expect(initialScanCount).toBeGreaterThan(0);

  const summary = page.getByRole("button", { name: "Modify your search", exact: true });
  if (isMobile) await summary.click();
  const fields = isMobile ? page.getByRole("dialog", { name: "Modify your search" }) : page;
  await fields.getByRole("button", { name: "Select train travel classes" }).click();
  await fields.getByRole("button", { name: "Sleeper (SL)", exact: true }).click();
  await fields.getByRole("button", { name: "Select train travel classes" }).click();

  await fields.getByLabel(isMobile ? "Departure date" : "Date", { exact: true }).click();
  await fields.locator(".datepicker-cell.day:not(.prev):not(.next):not(.disabled)")
    .filter({ hasText: /^3$/ }).click();
  await selectStation(fields, "From", "MID");
  await selectStation(fields, "To", "ORIG");
  if (isMobile) {
    await fields.getByRole("button", { name: "Swap origin and destination" }).click();
    await fields.getByRole("button", { name: "Close", exact: true }).click();
    await expect(summary).toContainText("Origin City");
    await expect(summary).toContainText("Destination Town");
  }

  await page.waitForTimeout(700);
  expect(searches).toHaveLength(1);
  expect(scans).toHaveLength(initialScanCount);
  expect(page.url()).toBe(initialUrl);
  await expect(progress).toBeVisible();
  expect(await results.innerText()).toBe(initialResults);

  if (isMobile) await summary.click();
  await fields.getByRole("button", { name: "Search trains", exact: true }).click();
  await expect(progress).toBeVisible();
  expect(searches).toHaveLength(2);
  expect(scans.length).toBeGreaterThan(initialScanCount);
  expect(searches[1].get("from")).toBe(isMobile ? "ORIG" : "MID");
  expect(searches[1].get("to")).toBe(isMobile ? "MID" : "ORIG");
  expect(searches[1].get("date")).toBe("2026-10-03");
  expect(searches[1].get("classes")).toBe("SL");
  expect(scans.at(-1)).toMatchObject({ date: "2026-10-03", avlClasses: ["SL"] });
  const secondScanCount = scans.length;

  // Re-submitting identical criteria must still produce a fresh search/scan.
  if (isMobile) await summary.click();
  await fields.getByRole("button", { name: "Search trains", exact: true }).click();
  await expect(progress).toBeVisible();
  expect(searches).toHaveLength(3);
  expect(scans.length).toBeGreaterThan(secondScanCount);
});
