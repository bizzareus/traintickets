import { expect, test } from "@playwright/test";

test.describe("Smart PNR Ticket Rescue & Live Charting Cockpit E2E Tests", () => {
  test("successfully searches PNR, displays confirmation probability, interactive rescue segments, and triggers live scraper session", async ({ page }) => {
    const mockPnr = "4335734389";
    const trainNumber = "12345";
    const trainName = "Swaraj Express";

    // 1. Intercept PNR search API
    await page.route(`**/api/booking-v2/pnr/${mockPnr}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: true,
          data: {
            Pnr: mockPnr,
            TrainNo: trainNumber,
            TrainName: trainName,
            Doj: "15-06-2026",
            Quota: "GN",
            Class: "3A",
            From: "NDLS",
            To: "BPL",
            BoardingStationName: "New Delhi",
            SourceName: "New Delhi",
            DestinationName: "Bhopal Junction",
            ReservationUptoName: "Bhopal Junction",
            DepartureTime: "10:00",
            ArrivalTime: "18:00",
            Duration: "08h:00m",
            PassengerStatus: [
              {
                Number: 1,
                CurrentStatus: "WL 15",
                BookingStatus: "WL 30",
              },
              {
                Number: 2,
                CurrentStatus: "WL 12",
                BookingStatus: "WL 28",
              },
            ],
          },
        }),
      });
    });

    // 2. Intercept alternate-paths stream API
    await page.route("**/api/booking-v2/alternate-paths/stream", async (route) => {
      const altResult = {
        trainNumber,
        legs: [
          {
            from: "NDLS",
            to: "KOTA",
            segmentKind: "confirmed",
            travelClass: "3A",
            railDataStatus: "AVAILABLE 24",
            availablityStatus: "AVAILABLE",
            predictionPercentage: "95",
            availabilityDisplayName: "Available (24 seats)",
            fare: 890,
          },
          {
            from: "KOTA",
            to: "BPL",
            segmentKind: "confirmed",
            travelClass: "3A",
            railDataStatus: "AVAILABLE 12",
            availablityStatus: "AVAILABLE",
            predictionPercentage: "85",
            availabilityDisplayName: "Available (12 seats)",
            fare: 960,
          },
        ],
        totalFare: 1850,
        legCount: 2,
        isComplete: true,
        stationCodesOnRoute: ["NDLS", "KOTA", "BPL"],
        stationNameMap: {
          NDLS: "New Delhi",
          KOTA: "Kota Junction",
          BPL: "Bhopal Junction",
        },
      };

      const ndjson = [
        JSON.stringify({ type: "progress", event: { type: "schedule_ok", trainName, stopCount: 12 } }),
        JSON.stringify({ type: "progress", event: { type: "route_ok", from: "NDLS", to: "BPL", stopCount: 4 } }),
        JSON.stringify({ type: "result", data: altResult }),
      ].join("\n") + "\n";

      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: ndjson,
      });
    });

    // 3. Intercept journey validation & registration API for Scraper Cockpit
    await page.route("**/api/availability/journey/validate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ valid: true }),
      });
    });

    await page.route("**/api/availability/journey", async (route) => {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    // 4. Navigate to the main application
    await page.goto("/");

    // 5. Click on the "Search PNR" tab
    const pnrTabButton = page.getByRole("button", { name: "Search PNR" });
    await expect(pnrTabButton).toBeVisible();
    await pnrTabButton.click();

    // 6. Fill 10-digit PNR input and trigger search
    const pnrInput = page.locator("#pnrInput");
    await expect(pnrInput).toBeVisible();
    await pnrInput.fill(mockPnr);

    const findAlternatesButton = page.getByRole("button", { name: "Find Alternate Tickets" });
    await expect(findAlternatesButton).toBeVisible();
    await findAlternatesButton.click();

    // 7. Verify PNR details card loads successfully
    await expect(page.getByText(mockPnr).first()).toBeVisible();
    await expect(page.getByText("Swaraj Express", { exact: true })).toBeVisible();
    await expect(page.getByText("New Delhi", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Bhopal Junction", { exact: false }).first()).toBeVisible();

    // 8. VERIFY SMART PNR STATUS PREDICTOR (SmartPnrPredictor)
    // WL 15 confirmation probability = 71%, WL 12 probability = 75%. Min = 71% (Moderate Risk)
    const confidenceText = page.locator(".text-slate-800").filter({ hasText: /^71%$/ });
    await expect(confidenceText).toBeVisible();

    const riskBadge = page.locator("span").filter({ hasText: /^Moderate Risk$/ });
    await expect(riskBadge).toBeVisible();

    // Verify mini breakdown grid passenger statistics
    await expect(page.getByText("Pax 1")).toBeVisible();
    await expect(page.getByText("WL 15", { exact: true })).toBeVisible();
    await expect(page.locator("span.font-extrabold.font-mono").filter({ hasText: /^71%$/ })).toBeVisible();

    await expect(page.getByText("Pax 2")).toBeVisible();
    await expect(page.getByText("WL 12", { exact: true })).toBeVisible();
    await expect(page.locator("span.font-extrabold.font-mono").filter({ hasText: /^75%$/ })).toBeVisible();

    // 9. VERIFY STRESS-FREE TICKET RESCUE & SEGMENT SPLITTER (VisualSegmentSplitter)
    await expect(page.getByText("Stress-Free Ticket Rescue Cockpit")).toBeVisible();
    await expect(page.getByText("Smart Segment Splitter")).toBeVisible();

    // Close the best seats dialog modal to interact with the inline cockpits
    const dialogCloseBtn = page.getByRole("dialog").getByRole("button", { name: "Close" });
    await expect(dialogCloseBtn).toBeVisible();
    await dialogCloseBtn.click();
    await expect(page.getByRole("dialog")).not.toBeVisible();

    // Verify station nodes in interactive SVG timeline (renders default fallback NDLS-BPL nodes after altResult is cleared)
    const ndlsNode = page.locator("svg text").filter({ hasText: /^NDLS$/ });
    const bplNode = page.locator("svg text").filter({ hasText: /^BPL$/ });

    await expect(ndlsNode).toBeVisible();
    await expect(bplNode).toBeVisible();

    // Verify hover node capability (hovering BPL station node)
    await page.locator("g.cursor-pointer").filter({ hasText: /^BPL$/ }).dispatchEvent("mouseover");

    // Node details tooltip should appear
    await expect(page.getByText("Seat Clearance:")).toBeVisible();
    await expect(page.getByText("Estimated Charting:")).toBeVisible();

    // 10. VERIFY GUARDIAN LIVE SCRAPER (LiveScraperCockpit)
    await expect(page.getByText("Guardian Live Scraper & Coach Blueprint Monitor")).toBeVisible();

    const launchScraperButton = page.getByRole("button", { name: "Launch Live Scraper" });
    await expect(launchScraperButton).toBeVisible();
    await launchScraperButton.click();

    // Scraper cockpit expanded
    await expect(page.getByText("Synthwave Scraper Cockpit")).toBeVisible();
    await expect(page.getByText("Live Monitoring Console")).toBeVisible();

    const initScraperButton = page.getByRole("button", { name: "Initialize Neon Scraper" });
    await expect(initScraperButton).toBeVisible();
    await initScraperButton.click();

    // Console terminals, sessions logs stream
    await expect(page.getByText("Playwright-Chromium @ LB-Scraper")).toBeVisible();
    await expect(page.getByText("Realtime 2D Coach Berth Layout")).toBeVisible({ timeout: 15000 });

    // Verify vacant pulsing berths on interactive Seat Grid
    const vacantBerthIndicator = page.locator("span.absolute.top-1.right-1.h-1\\.5.w-1\\.5.rounded-full.bg-emerald-400").first();
    await expect(vacantBerthIndicator).toBeVisible();

    // Hover over vacant berth (e.g. Seat #3) to verify reactive details panel
    const seat3 = page.locator("div.cursor-pointer").filter({ hasText: /^3/ }).first();
    await seat3.hover({ force: true });

    await expect(page.getByText("Berth Vacant")).toBeVisible();
    await expect(page.getByText("Seat #3")).toBeVisible();
    await expect(page.getByText("Book CNF Now!")).toBeVisible();

    // Fill alert monitor setup form
    const scraperEmailInput = page.locator("#scraperEmail");
    await expect(scraperEmailInput).toBeVisible();
    await scraperEmailInput.fill("e2e-guardian@example.com");

    const scraperMobileInput = page.locator("#scraperMobile");
    await expect(scraperMobileInput).toBeVisible();
    await scraperMobileInput.fill("+91 99999 88888");

    // Submit alert form
    const registerAlertButton = page.getByRole("button", { name: "Register Alert Monitor" });
    await expect(registerAlertButton).toBeVisible();
    await registerAlertButton.click();

    // Verify alert activation confirmation banner
    await expect(page.getByText("Guardian Scraper Monitor successfully established!")).toBeVisible({ timeout: 10000 });
  });
});
