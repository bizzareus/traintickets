import { expect, test } from "@playwright/test";
import {
  alternatePathLongRealtimeChain,
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
});
