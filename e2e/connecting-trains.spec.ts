import { expect, test } from "@playwright/test";
import type { ConnectingJourneyDto } from "../lib/connectingTrains";
import { installBookingV2Mocks } from "./fixtures/booking-v2-mocks";

const journey: ConnectingJourneyDto = {
  id: "connection-waitlisted",
  from: "ORIG",
  to: "DEST",
  intermediateStation: "MID",
  intermediateStationName: "Midway Junction",
  journeyDate: "2026-11-10",
  departureTime: "16:50",
  arrivalTime: "23:43",
  arrivalDate: "2026-11-10",
  totalDurationMinutes: 413,
  layoverMinutes: 42,
  totalFare: 2705,
  preferredClass: "3A",
  isFullyConfirmed: false,
  legs: [
    {
      trainNumber: "12302",
      trainName: "HWH RAJDHANI",
      from: "ORIG",
      to: "MID",
      boardingDate: "2026-11-10",
      departureTime: "16:50",
      arrivalTime: "20:03",
      durationMinutes: 193,
      travelClass: "3A",
      fare: 2140,
      availabilityDisplayName: "Regret",
      availablityStatus: "REGRET",
      isConfirmed: false,
      confirmedClassOptions: ["3A", "2A", "1A"].map((travelClass) => ({
        travelClass,
        fare: 2140,
        availabilityDisplayName: "Regret",
        isConfirmed: false,
      })),
    },
    {
      trainNumber: "12318",
      trainName: "AKAL TAKHAT EXP",
      from: "MID",
      to: "DEST",
      boardingDate: "2026-11-10",
      departureTime: "20:45",
      arrivalTime: "23:43",
      durationMinutes: 178,
      travelClass: "3A",
      fare: 565,
      availabilityDisplayName: "WL 22",
      availablityStatus: "WL",
      isConfirmed: false,
      confirmedClassOptions: ["3A", "2A", "1A"].map((travelClass) => ({
        travelClass,
        fare: 565,
        availabilityDisplayName: "WL 22",
        isConfirmed: false,
      })),
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-03T06:00:00Z"));
  await installBookingV2Mocks(page);
  await page.route("**/api/booking-v2/best-trains/cached?**", (route) =>
    route.fulfill({ json: { cached: false } }),
  );
  await page.route("**/api/booking-v2/connecting-trains?**", (route) =>
    route.fulfill({
      json: {
        from: journey.from,
        to: journey.to,
        date: journey.journeyDate,
        isSupportedCorridor: true,
        totalFound: 2,
        confirmedCount: 1,
        journeys: [
          {
            ...journey,
            id: "connection-confirmed",
            isFullyConfirmed: true,
            legs: journey.legs.map((leg) => ({
              ...leg,
              isConfirmed: true,
              confirmedClassOptions: [],
            })),
          },
          journey,
        ],
      },
    }),
  );
  await page.goto("/?from=ORIG&to=DEST&date=2026-11-10");
  await expect(
    page.getByRole("combobox", { name: "From", exact: true }),
  ).toHaveValue(/ORIG/);
  await page.getByRole("button", { name: "Search trains", exact: true }).click();
});

test("stop filters preserve results and simplified connection details", async (
  { page },
  testInfo,
) => {
  const direct = page.getByRole("list", { name: "Direct train results" });
  const connections = page.getByRole("list", { name: "Connecting train results" });
  const directFilter = page.getByRole("checkbox", { name: "Direct", exact: true });
  const oneStopFilter = page.getByRole("checkbox", { name: "1 Stop", exact: true });
  await expect(direct).toBeVisible();
  await expect(connections).toBeVisible();
  await expect(directFilter).toBeChecked();
  await expect(oneStopFilter).toBeChecked();

  const card = connections.getByRole("listitem").last();
  await card.getByRole("button", { name: "Route Details" }).click();
  await expect(card.getByText(/Regret|WL 22/)).toHaveCount(0);
  await expect(card.getByText("Select Class:")).toHaveCount(0);
  await expect(card.getByRole("button", { name: /^(3A|2A|1A)$/ })).toHaveCount(0);
  await expect(card.getByText("₹2140", { exact: true })).toBeVisible();
  await expect(card.getByText("₹565", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Find Tickets" })).toBeEnabled();

  const searchRequests: string[] = [];
  page.on("request", (request) => {
    if (
      /\/api\/booking-v2\/(trains\/search|connecting-trains|alternate-paths)/.test(
        request.url(),
      )
    ) {
      searchRequests.push(request.url());
    }
  });
  await directFilter.uncheck();
  await expect(direct).toBeHidden();
  await expect(connections).toBeVisible();
  await oneStopFilter.uncheck();
  await expect(connections).toBeHidden();
  await expect(
    page.getByText("Select Direct or 1 Stop to see journeys."),
  ).toBeVisible();
  await directFilter.check();
  await expect(direct).toBeVisible();
  await expect(connections).toBeHidden();
  await oneStopFilter.check();
  await expect(connections).toBeVisible();
  await expect(card.getByRole("button", { name: "Hide Details" })).toBeVisible();
  expect(searchRequests).toHaveLength(0);

  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("body")).toHaveCSS("font-family", /geistSans/i);
  await card.screenshot({ path: testInfo.outputPath("connecting-card.png") });
});

test("1 Stop filter explains when no connecting route exists", async ({ page }) => {
  await page.route("**/api/booking-v2/connecting-trains?**", (route) =>
    route.fulfill({ json: { isSupportedCorridor: false, journeys: [] } }),
  );
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "From", exact: true }),
  ).toHaveValue(/ORIG/);
  await page.getByRole("button", { name: "Search trains", exact: true }).click();
  await page.getByRole("checkbox", { name: "Direct", exact: true }).uncheck();
  await expect(
    page.getByText(
      "No 1-stop connections found for this route on the selected date.",
    ),
  ).toBeVisible();
});
