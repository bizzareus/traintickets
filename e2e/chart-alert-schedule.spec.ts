import { test, expect } from "@playwright/test";

for (const paid of [false, true]) {
  for (const changedDate of [false, true]) {
    test(`${paid ? "paid" : "free"} RJY alert submits both displayed charts${changedDate ? " after changing the boarding date" : ""}`, async ({
      page,
      isMobile,
    }) => {
      // Only exercise payload wiring: no payment, notification, or backend writes.
      await page.clock.setFixedTime(new Date("2026-09-28T09:00:00Z"));
      await page.addInitScript(() =>
        sessionStorage.setItem("findTicketsPopupDismissed:12665", "1"),
      );
      await page.route("**/api/trains/12665/classes", (route) =>
        route.fulfill({ json: { availableClasses: ["SL", "3A"] } }),
      );
      await page.route("**/api/chart-alert-payments/status/**", (route) =>
        route.fulfill({
          json: { status: "pending", journeyCreated: false, journey: null },
        }),
      );
      const endpoint = paid
        ? "/api/chart-alert-payments/create"
        : "/api/availability/journey";
      await page.route(`**${endpoint}`, (route) =>
        route.fulfill({
          json: paid
            ? {
                ref: "e2e-payment",
                orderId: "e2e-order",
                amount: 10,
                qrImageUrl:
                  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',
              }
            : { accepted: true, journeyRequestId: "e2e-journey" },
        }),
      );
      await page.goto(
        `/chart-times/12665-hwh-cape-sf-exp-chart-times?date=2026-09-28&payments=${paid ? "on" : "off"}`,
      );
      const row = page
        .locator(isMobile ? ".md\\:hidden > div" : "tr")
        .filter({ hasText: "Rajahmundry" });
      await expect(row).toContainText("7:08 PM");
      await expect(row).toContainText("5:35 AM");
      await row.getByRole("button", { name: "Get Alert" }).click();
      const dialog = page
        .getByRole("dialog")
        .filter({ hasText: "Chart Alert — Rajahmundry" });
      await dialog.getByLabel(/Destination station/).selectOption("DG");
      await dialog.getByLabel(/^Class/).selectOption("SL");
      await dialog.getByLabel("Email address").fill("test@example.com");
      await expect(dialog.getByLabel("Journey date")).toHaveValue("2026-09-29");
      if (changedDate)
        await dialog.getByLabel("Journey date").fill("2026-10-01");
      const submitted = page.waitForRequest(
        (request) =>
          request.method() === "POST" &&
          new URL(request.url()).pathname === endpoint,
      );
      await dialog
        .getByRole("button", {
          name: paid ? /Pay.*set alert/ : "Set alert (free)",
        })
        .click();
      const request = await submitted;
      expect(request.postDataJSON()).toMatchObject({
        trainNumber: "12665",
        fromStationCode: "RJY",
        toStationCode: "DG",
        classCode: "SL",
        journeyDate: changedDate ? "2026-10-01" : "2026-09-29",
        trainStartDate: changedDate ? "2026-09-30" : "2026-09-28",
        chartTimeLocal: "19:08",
        chartOneDayOffset: 0,
        chartTwoTimeLocal: "05:35",
        chartTwoDayOffset: 1,
      });
    });
  }
}
