import { test, expect } from "@playwright/test";

test("12952 shows pricing only in the existing payment popup", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
  await page.addInitScript(() =>
    sessionStorage.setItem("findTicketsPopupDismissed:12952", "1"),
  );
  await page.route("**/api/trains/12952/classes", (route) =>
    route.fulfill({ json: { availableClasses: ["1A", "2A", "3A"] } }),
  );
  await page.route("**/api/chart-alert-payments/status/**", (route) =>
    route.fulfill({
      json: { status: "pending", journeyCreated: false, journey: null },
    }),
  );
  await page.route("**/api/chart-alert-payments/create", (route) =>
    route.fulfill({
      json: {
        ref: "e2e-12952-payment",
        orderId: "e2e-order",
        amount: 25,
        qrImageUrl:
          'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',
      },
    }),
  );
  await page.goto(
    "/chart-times/12952-mmct-tejas-raj-chart-times?date=2026-11-04&payments=on",
  );
  await expect(page.getByRole("heading", { level: 1 })).toContainText("12952");
  await expect(page.locator("body")).not.toContainText("₹");
  await expect(page.getByRole("img", { name: /Diwali Sale/i })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Set Alert", exact: true })
    .first()
    .click();
  const form = page
    .getByRole("heading", { name: /Chart preparation alert for/ })
    .locator("..");
  await form.getByLabel(/^Class/).selectOption("3A");
  await form.getByLabel("Email address").fill("test@example.com");
  await expect(form).not.toContainText("₹");
  const submitted = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/chart-alert-payments/create",
  );
  await form.getByRole("button", { name: "Set Alert", exact: true }).click();
  expect((await submitted).postDataJSON()).toMatchObject({
    trainNumber: "12952",
    classCode: "3A",
  });
  const paymentDialog = page.getByRole("dialog", { name: "Complete payment" });
  await expect(paymentDialog).toBeVisible();
  await expect(paymentDialog).toContainText("₹25");
});

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
      await row.getByRole("button", { name: "Set Alert", exact: true }).click();
      const dialog = page
        .getByRole("dialog")
        .filter({ hasText: "Seat Alert from Rajahmundry" });
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
      await expect(dialog).not.toContainText("₹");
      await dialog
        .getByRole("button", {
          name: "Set Alert",
          exact: true,
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
      if (paid) {
        const paymentDialog = page.getByRole("dialog", {
          name: "Complete payment",
        });
        await expect(paymentDialog).toBeVisible();
        await expect(paymentDialog).toContainText("₹10");
      }
    });
  }
}
