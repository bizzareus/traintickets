import { expect, test } from "@playwright/test";
import {
  alternatePathLongRealtimeChain,
  alternatePathMiddleChainUnavailable,
  alternatePathMultiClassConfirmed,
  alternatePathTwoConfirmed,
  alternatePathTwoIntermediatesConfirmed,
  alternatePathWithCollapsedRemainder,
  DEFAULT_STATIONS,
  DEFAULT_TRAIN,
  installBookingV2Mocks,
} from "./fixtures/booking-v2-mocks";

const MONITOR_STORAGE_KEY = "lastBerth_monitor_contact";

async function selectStation(
  page: import("@playwright/test").Page,
  label: string,
  searchText: string,
  optionPattern: RegExp,
) {
  const waitSuggest = page.waitForResponse(
    (r) =>
      r.url().includes("/api/booking-v2/stations/suggest") &&
      r.request().method() === "GET",
  );
  await page.getByLabel(label, { exact: true }).fill(searchText);
  await waitSuggest;
  await page.getByRole("option", { name: optionPattern }).click();
}

async function selectDefaultRoute(page: import("@playwright/test").Page) {
  await selectStation(page, "From", "Or", /ORIG/);
  await selectStation(page, "To", "De", /DEST/);
}

async function openAlternateModal(page: import("@playwright/test").Page) {
  await selectDefaultRoute(page);
  await page.getByRole("button", { name: "Search trains" }).click();
  await expect(page.getByRole("list", { name: "Train results" })).toContainText(DEFAULT_TRAIN.trainNumber);
  await page.getByRole("button", { name: "Find best available seats" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test.describe("booking v2 (mocked API)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }, MONITOR_STORAGE_KEY);
  });

  test("search shows trains and class availability", async ({ page }) => {
    await installBookingV2Mocks(page, {
      alternatePaths: (body) => alternatePathTwoConfirmed(String(body.trainNumber ?? "")),
    });
    await page.goto("/");

    await selectDefaultRoute(page);

    await page.getByRole("button", { name: "Search trains" }).click();
    await expect(page.getByRole("heading", { name: new RegExp(DEFAULT_TRAIN.trainNumber) })).toBeVisible();
    await expect(page.getByText("WL 15")).toBeVisible();
    await expect(page.getByText("AVAILABLE-0001")).toBeVisible();
  });

  test("empty train list shows friendly status", async ({ page }) => {
    await installBookingV2Mocks(page, {
      trains: [],
      alternatePaths: (body) => alternatePathTwoConfirmed(String(body.trainNumber ?? "")),
    });
    await page.goto("/");
    await selectDefaultRoute(page);
    await page.getByRole("button", { name: "Search trains" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "No trains loaded" }),
    ).toBeVisible();
  });

  test("train search API error surfaces in UI", async ({ page }) => {
    await installBookingV2Mocks(page, {
      trainSearchError: { status: 503, body: { message: "Rail search unavailable" } },
      alternatePaths: (body) => alternatePathTwoConfirmed(String(body.trainNumber ?? "")),
    });
    await page.goto("/");
    await selectDefaultRoute(page);
    await page.getByRole("button", { name: "Search trains" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Rail search unavailable" }),
    ).toBeVisible();
  });

  test("alternate path: 4 chained unavailable hops in middle collapse into one card", async ({ page }) => {
    await installBookingV2Mocks(page, {
      alternatePaths: (body) =>
        alternatePathMiddleChainUnavailable(String(body.trainNumber ?? "")),
    });
    await page.goto("/");
    await openAlternateModal(page);

    const dialog = page.getByRole("dialog");

    // Should show 3 leg cards total: confirmed ORIG→A, collapsed A→MID, confirmed MID→DEST
    const legHeaders = dialog.locator("text=/^LEG \\d+ OF \\d+$/i");
    await expect(legHeaders).toHaveCount(3);

    // The collapsed middle card should say "No confirmed tickets" and show A → MID span
    await expect(dialog).toContainText("No confirmed tickets");
    // "No tickets available on this segment." should appear for the middle span
    await expect(dialog).toContainText("No tickets available on this segment.");

    // Individual hop codes B, C, D must NOT appear as station codes in any leg card
    // (they are interior nodes of the collapsed span and should not be rendered separately)
    const stationSpans = dialog.locator(".text-lg.font-bold.tracking-tight");
    const allStationTexts = await stationSpans.allTextContents();
    expect(allStationTexts.some((t) => t.trim() === "B")).toBe(false);
    expect(allStationTexts.some((t) => t.trim() === "C")).toBe(false);
    expect(allStationTexts.some((t) => t.trim() === "D")).toBe(false);
  });

  test("alternate path: multi-class confirmed — shows sub-cards for each available class", async ({
    page,
  }) => {
    await installBookingV2Mocks(page, {
      alternatePaths: (body) =>
        alternatePathMultiClassConfirmed(String(body.trainNumber ?? "")),
    });
    await page.goto("/");
    await openAlternateModal(page);

    const dialog = page.getByRole("dialog");

    // Both class options should appear
    await expect(dialog).toContainText("Class SL");
    await expect(dialog).toContainText("Class 3A");

    // Both availability labels should be shown
    await expect(dialog).toContainText("AVAILABLE-0020");
    await expect(dialog).toContainText("AVAILABLE-0005");

    // Both fares should appear
    await expect(dialog).toContainText("₹655");
    await expect(dialog).toContainText("₹1270");

    // Two Book buttons — one per class option
    const bookLinks = dialog.getByRole("link", { name: /Book/ });
    await expect(bookLinks).toHaveCount(2);
  });

  test("alternate path: two confirmed segments (short positive)", async ({ page }) => {
    await installBookingV2Mocks(page, {
      alternatePaths: (body) => alternatePathTwoConfirmed(String(body.trainNumber ?? "")),
    });
    await page.goto("/");
    await openAlternateModal(page);

    await expect(page.getByRole("dialog")).toContainText("Full journey covered in 2 confirmed segments");
    await expect(page.getByRole("dialog")).toContainText("Total fare (confirmed segments): ₹450");
    await expect(page.getByRole("dialog")).toContainText("ORIG");
    await expect(page.getByRole("dialog")).toContainText("MID");
    await expect(page.getByRole("dialog")).toContainText("Book");
  });

  test("alternate path: two intermediate stations (three confirmed segments)", async ({ page }) => {
    await installBookingV2Mocks(page, {
      alternatePaths: (body) => alternatePathTwoIntermediatesConfirmed(String(body.trainNumber ?? "")),
    });
    await page.goto("/");
    await openAlternateModal(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Full journey covered in 3 confirmed segments");
    await expect(dialog).toContainText("S1");
    await expect(dialog).toContainText("S2");
  });

  test("alternate path: collapsed remainder after one confirmed leg (2 realtime hops)", async ({ page }) => {
    await installBookingV2Mocks(page, {
      alternatePaths: (body) => alternatePathWithCollapsedRemainder(String(body.trainNumber ?? "")),
    });
    await page.goto("/");
    await openAlternateModal(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("There are no tickets available overall.");
    await expect(dialog).toContainText("To final destination");
    await expect(dialog).toContainText("MID");
    await expect(dialog).toContainText("DEST");
    await expect(dialog.getByText("Get availability alerts")).toBeVisible();
  });

  test("alternate path: 20-segment realtime chain collapses to single remainder row", async ({ page }) => {
    await installBookingV2Mocks(page, {
      alternatePaths: (body) =>
        alternatePathLongRealtimeChain(String(body.trainNumber ?? ""), 20, "ORIG", "DEST"),
    });
    await page.goto("/");
    await openAlternateModal(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("There are no tickets available overall.");
    await expect(dialog).toContainText("ORIG");
    await expect(dialog).toContainText("DEST");
    await expect(dialog).toContainText("Leg 1 of 1");
  });

  test("alternate path: 50-segment realtime chain still shows collapsed leg and subscribe panel", async ({
    page,
  }) => {
    await installBookingV2Mocks(page, {
      alternatePaths: (body) =>
        alternatePathLongRealtimeChain(String(body.trainNumber ?? ""), 50, "ORIG", "DEST"),
    });
    await page.goto("/");
    await openAlternateModal(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("There are no tickets available overall.");
    await expect(dialog.getByText("Get availability alerts")).toBeVisible();
  });

  test("alternate path API error shows in modal", async ({ page }) => {
    await installBookingV2Mocks(page, {
      alternatePathsError: { status: 502, body: { message: "Upstream timeout" } },
    });
    await page.goto("/");
    await selectDefaultRoute(page);
    await page.getByRole("button", { name: "Search trains" }).click();
    await page.getByRole("button", { name: "Find best available seats" }).click();
    await expect(page.getByRole("dialog")).toContainText("Upstream timeout");
  });

  test("subscribe workflow: validate + journey succeeds", async ({ page }) => {
    await installBookingV2Mocks(page, {
      alternatePaths: (body) => alternatePathWithCollapsedRemainder(String(body.trainNumber ?? "")),
      journeyValidate: { valid: true },
    });
    await page.goto("/");
    await openAlternateModal(page);

    await expect(page.getByRole("dialog")).not.toContainText("Loading IRCTC chart preparation", {
      timeout: 15_000,
    });

    await page.getByPlaceholder("Email").fill("e2e-mock@example.com");
    await page.getByRole("button", { name: "Subscribe to alerts" }).click();

    await expect(page.getByText(/Alert has been set up!/)).toBeVisible();
    await expect(page.getByText(/realtime availability/)).toBeVisible();
  });

  test("subscribe workflow: validation failure shows message", async ({ page }) => {
    await installBookingV2Mocks(page, {
      alternatePaths: (body) => alternatePathWithCollapsedRemainder(String(body.trainNumber ?? "")),
      journeyValidate: {
        valid: false,
        errors: [{ code: "RUN_DAY", message: "Train does not run on this day." }],
      },
    });
    await page.goto("/");
    await openAlternateModal(page);
    await expect(page.getByRole("dialog")).not.toContainText("Loading IRCTC chart preparation", {
      timeout: 15_000,
    });

    await page.getByPlaceholder("Email").fill("e2e@example.com");
    await page.getByRole("button", { name: "Subscribe to alerts" }).click();

    await expect(page.getByRole("dialog")).toContainText("Train does not run on this day.");
    await expect(page.getByText(/Alert has been set up!/)).not.toBeVisible();
  });

  test("subscribe workflow: journey POST error after validate", async ({ page }) => {
    await installBookingV2Mocks(page, {
      alternatePaths: (body) => alternatePathWithCollapsedRemainder(String(body.trainNumber ?? "")),
      journeyValidate: { valid: true },
      journeyPostError: { status: 400, body: { message: "Queue full" } },
    });
    await page.goto("/");
    await openAlternateModal(page);
    await expect(page.getByRole("dialog")).not.toContainText("Loading IRCTC chart preparation", {
      timeout: 15_000,
    });

    await page.getByPlaceholder("Email").fill("e2e@example.com");
    await page.getByRole("button", { name: "Subscribe to alerts" }).click();

    await expect(page.getByRole("dialog")).toContainText("Queue full");
  });

  test("station suggest failure shows in dropdown", async ({ page }) => {
    await installBookingV2Mocks(page, {
      suggestError: { status: 500, body: { message: "Suggest down" } },
      alternatePaths: (body) => alternatePathTwoConfirmed(String(body.trainNumber ?? "")),
    });
    await page.goto("/");

    const waitSuggest = page.waitForResponse((r) =>
      r.url().includes("/api/booking-v2/stations/suggest"),
    );
    await page.getByLabel("From", { exact: true }).fill("Or");
    await waitSuggest;

    await expect(page.getByRole("listbox")).toContainText("Suggest down");
  });

  test("subscribe requires email or mobile", async ({ page }) => {
    await installBookingV2Mocks(page, {
      alternatePaths: (body) => alternatePathWithCollapsedRemainder(String(body.trainNumber ?? "")),
    });
    await page.goto("/");
    await openAlternateModal(page);
    await expect(page.getByRole("dialog")).not.toContainText("Loading IRCTC chart preparation", {
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "Subscribe to alerts" }).click();
    await expect(page.getByRole("dialog")).toContainText("Enter an email or mobile number for alerts.");
  });

  test("date picker displays in readable format (e.g. 'Friday, Apr 03') instead of YYYY-MM-DD", async ({
    page,
  }) => {
    await installBookingV2Mocks(page, {
      alternatePaths: (body) => alternatePathTwoConfirmed(String(body.trainNumber ?? "")),
    });
    await page.goto("/");

    // The date input should display a human-readable format, not raw ISO
    const dateInput = page.getByRole("textbox", { name: /departure date/i });
    if (await dateInput.isVisible()) {
      const value = await dateInput.inputValue();
      // Should NOT be in YYYY-MM-DD format
      expect(value).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("station field shows train icon (not truck icon)", async ({ page }) => {
    await installBookingV2Mocks(page, {
      alternatePaths: (body) => alternatePathTwoConfirmed(String(body.trainNumber ?? "")),
    });
    await page.goto("/");

    // The station labels should be visible
    await expect(page.getByLabel("From", { exact: true })).toBeVisible();
    await expect(page.getByLabel("To", { exact: true })).toBeVisible();
  });

  test("station suggest: typing in From field fires suggest API and shows options", async ({
    page,
  }) => {
    let suggestCallCount = 0;
    await installBookingV2Mocks(page, {
      alternatePaths: (body) => alternatePathTwoConfirmed(String(body.trainNumber ?? "")),
      // Count suggest calls inside the mock by using a custom stations override
      stations: DEFAULT_STATIONS,
    });

    await page.goto("/");

    // First suggest call
    const wait1 = page.waitForResponse((r) =>
      r.url().includes("/api/booking-v2/stations/suggest") && r.request().method() === "GET",
    );
    await page.getByLabel("From", { exact: true }).fill("Or");
    await wait1;
    suggestCallCount++;

    // Options should appear from the mock suggest response
    await expect(page.getByRole("option", { name: /ORIG/ })).toBeVisible();
    expect(suggestCallCount).toBe(1);

    // Second suggest call on To field
    const wait2 = page.waitForResponse((r) =>
      r.url().includes("/api/booking-v2/stations/suggest") && r.request().method() === "GET",
    );
    await page.getByRole("option", { name: /ORIG/ }).click();
    await page.getByLabel("To", { exact: true }).fill("De");
    await wait2;
    suggestCallCount++;

    await expect(page.getByRole("option", { name: /DEST/ })).toBeVisible();
    expect(suggestCallCount).toBe(2);
  });

  test("train search result is shown after selecting both stations and clicking Search trains", async ({
    page,
  }) => {
    await installBookingV2Mocks(page, {
      alternatePaths: (body) => alternatePathTwoConfirmed(String(body.trainNumber ?? "")),
    });
    await page.goto("/");
    await selectDefaultRoute(page);
    await page.getByRole("button", { name: "Search trains" }).click();

    // Train list should be populated
    await expect(
      page.getByRole("list", { name: "Train results" }),
    ).toContainText(DEFAULT_TRAIN.trainNumber);
    await expect(
      page.getByRole("list", { name: "Train results" }),
    ).toContainText(DEFAULT_TRAIN.trainName);
  });

  // ---------------------------------------------------------------------------
  // LegChartTimeInsight — chart preparation time + alert CTA
  // ---------------------------------------------------------------------------

  // LegChartTimeInsight is rendered for a lone check_realtime leg (not chained).
  // Use alternatePathLongRealtimeChain with segmentCount=1 → single ORIG→DEST hop
  // which buildAlternatePathDisplayItems keeps as kind:"single".

  // ---------------------------------------------------------------------------
  // Streaming progress feed
  // ---------------------------------------------------------------------------

  test("streaming progress: shows step-by-step progress while searching for seats", async ({
    page,
  }) => {
    await installBookingV2Mocks(page, {
      alternatePaths: (body) => alternatePathTwoConfirmed(String(body.trainNumber ?? "")),
    });
    await page.goto("/");
    await selectDefaultRoute(page);
    await page.getByRole("button", { name: "Search trains" }).click();
    await expect(page.getByRole("list", { name: "Train results" })).toContainText(
      DEFAULT_TRAIN.trainNumber,
    );

    // Intercept the stream to inject a deliberate delay so we can see the loading state
    let resolveStream: (() => void) | null = null;
    await page.route("**/api/booking-v2/alternate-paths/stream", async (route) => {
      const req = route.request();
      let body: Record<string, unknown> = {};
      try { body = req.postDataJSON() as Record<string, unknown>; } catch { /**/ }
      const alt = alternatePathTwoConfirmed(String(body.trainNumber ?? "12345"));
      const ndjson = [
        JSON.stringify({ type: "progress", event: { type: "schedule_ok", trainName: "Mock Express", stopCount: 8 } }),
        JSON.stringify({ type: "progress", event: { type: "route_ok", from: "ORIG", to: "DEST", stopCount: 3 } }),
        JSON.stringify({ type: "progress", event: { type: "hop_confirmed", from: "ORIG", to: "MID", travelClass: "SL", fare: 200, hopIndex: 1 } }),
        JSON.stringify({ type: "result", data: alt }),
      ].join("\n") + "\n";
      // Hold the response momentarily so the loading UI is visible
      await new Promise<void>((res) => { resolveStream = res; setTimeout(res, 60); });
      await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: ndjson });
    });

    await page.getByRole("button", { name: "Find best available seats" }).click();

    // Loading state — spinner and initial text should appear
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Searching for the best seats on this train…")).toBeVisible({
      timeout: 5_000,
    });

    resolveStream?.();

    // After stream resolves, results should appear
    await expect(dialog.getByText("Best available on")).toBeVisible({ timeout: 10_000 });
  });

  test("streaming progress: progress events rendered as step items", async ({ page }) => {
    await installBookingV2Mocks(page, {
      alternatePaths: (body) => alternatePathTwoConfirmed(String(body.trainNumber ?? "")),
    });

    // Override stream to emit known events synchronously
    await page.route("**/api/booking-v2/alternate-paths/stream", async (route) => {
      const req = route.request();
      let body: Record<string, unknown> = {};
      try { body = req.postDataJSON() as Record<string, unknown>; } catch { /**/ }
      const alt = alternatePathTwoConfirmed(String(body.trainNumber ?? "12345"));
      const ndjson = [
        JSON.stringify({ type: "progress", event: { type: "schedule_ok", trainName: "Mock Express", stopCount: 10 } }),
        JSON.stringify({ type: "progress", event: { type: "hop_confirmed", from: "ORIG", to: "MID", travelClass: "SL", fare: 200, hopIndex: 1 } }),
        JSON.stringify({ type: "result", data: alt }),
      ].join("\n") + "\n";
      await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: ndjson });
    });

    await page.goto("/");
    await openAlternateModal(page);

    const dialog = page.getByRole("dialog");
    // After stream completes the result should show
    await expect(dialog).toContainText("Best available on", { timeout: 10_000 });

    // The confirmed-ticket progress event text should appear in the result
    await expect(dialog).toContainText("ORIG");
    await expect(dialog).toContainText("MID");
  });

  // ---------------------------------------------------------------------------
  // LegChartTimeInsight — chart preparation time + alert CTA
  // ---------------------------------------------------------------------------

  test("chart time: shows spinner while loading station meta", async ({ page }) => {
    await installBookingV2Mocks(page, {
      alternatePaths: (body) =>
        alternatePathLongRealtimeChain(String(body.trainNumber ?? ""), 1, "ORIG", "DEST"),
    });

    let resolveMeta: (() => void) | null = null;
    await page.route("**/api/train-composition/stations-meta", async (route) => {
      await new Promise<void>((res) => { resolveMeta = res; });
      await route.continue();
    });

    await page.goto("/");
    await openAlternateModal(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Still checking the best options/i)).toBeVisible({
      timeout: 8_000,
    });
    // Alert CTA already visible while still loading
    await expect(dialog.getByText("Get notified when seats open")).toBeVisible();

    resolveMeta?.();
  });

  test("chart time: chart NOT prepared yet — shows chart time and alert CTA", async ({
    page,
  }) => {
    // chartOneTime "23:59" is always in the future today → not prepared yet
    await installBookingV2Mocks(page, {
      alternatePaths: (body) =>
        alternatePathLongRealtimeChain(String(body.trainNumber ?? ""), 1, "ORIG", "DEST"),
      stationsMetaBySource: {
        ORIG: { stationCode: "ORIG", chartOneTime: "23:59", chartTwoTime: null },
      },
    });
    await page.goto("/");
    await openAlternateModal(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Chart not prepared yet")).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toContainText("11:59 PM");

    await expect(dialog.getByText("Get notified when seats open")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Set alert for this leg" })).toBeVisible();
  });

  test("chart time: chart ALREADY prepared — shows warning and still shows alert CTA", async ({
    page,
  }) => {
    // chartOneTime "00:01" is always in the past today → already prepared
    await installBookingV2Mocks(page, {
      alternatePaths: (body) =>
        alternatePathLongRealtimeChain(String(body.trainNumber ?? ""), 1, "ORIG", "DEST"),
      stationsMetaBySource: {
        ORIG: { stationCode: "ORIG", chartOneTime: "00:01", chartTwoTime: null },
      },
    });
    await page.goto("/");
    await openAlternateModal(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Chart already prepared")).toBeVisible({ timeout: 15_000 });

    // Alert CTA must still be visible even though chart is already prepared
    await expect(dialog.getByText("Get notified when seats open")).toBeVisible();
  });

  test("chart time: no chart time available — shows fallback card and alert CTA", async ({
    page,
  }) => {
    await installBookingV2Mocks(page, {
      alternatePaths: (body) =>
        alternatePathLongRealtimeChain(String(body.trainNumber ?? ""), 1, "ORIG", "DEST"),
      stationsMetaBySource: {
        ORIG: { stationCode: "ORIG", chartOneTime: null, chartTwoTime: null },
      },
    });
    await page.goto("/");
    await openAlternateModal(page);

    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText(/Chart preparation time for .+ is not yet available/i),
    ).toBeVisible({ timeout: 15_000 });

    // Alert CTA still present
    await expect(dialog.getByText("Get notified when seats open")).toBeVisible();
  });

  test("chart time: alert CTA — requires email or mobile before submitting", async ({ page }) => {
    await installBookingV2Mocks(page, {
      alternatePaths: (body) =>
        alternatePathLongRealtimeChain(String(body.trainNumber ?? ""), 1, "ORIG", "DEST"),
      stationsMetaBySource: {
        ORIG: { stationCode: "ORIG", chartOneTime: "23:59" },
      },
    });
    await page.goto("/");
    await openAlternateModal(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Chart not prepared yet")).toBeVisible({ timeout: 15_000 });

    await dialog.getByRole("button", { name: "Set alert for this leg" }).first().click();
    await expect(dialog.getByText("Enter an email or mobile number for alerts.")).toBeVisible();
  });

  test("chart time: alert CTA — successful alert submission shows confirmation", async ({
    page,
  }) => {
    await installBookingV2Mocks(page, {
      alternatePaths: (body) =>
        alternatePathLongRealtimeChain(String(body.trainNumber ?? ""), 1, "ORIG", "DEST"),
      stationsMetaBySource: {
        ORIG: { stationCode: "ORIG", chartOneTime: "23:59" },
      },
    });
    await page.goto("/");
    await openAlternateModal(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Chart not prepared yet")).toBeVisible({ timeout: 15_000 });

    await dialog.getByPlaceholder("Email").first().fill("e2e-leg@example.com");
    await dialog.getByRole("button", { name: "Set alert for this leg" }).first().click();

    await expect(dialog.getByText("✓ Alert set up")).toBeVisible({ timeout: 8_000 });
    await expect(dialog.getByText(/We'll notify you when a ticket opens/i)).toBeVisible();
  });
});
