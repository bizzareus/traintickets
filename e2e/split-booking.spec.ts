import { expect, test } from "@playwright/test";
import {
  alternatePathTwoIntermediatesConfirmed,
  DEFAULT_STATIONS,
  DEFAULT_TRAIN,
} from "./fixtures/booking-v2-mocks";
import type { CreateSplitBookingPayload } from "../lib/split-booking";

test("three-leg checkout displays one service fee and all three PNRs", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("admin", "true"));
  const requests: CreateSplitBookingPayload[] = [];
  const path = alternatePathTwoIntermediatesConfirmed(
    DEFAULT_TRAIN.trainNumber,
  );
  path.legs[0].from = "DEE";
  path.legs = path.legs.map((leg, index) => ({
    ...leg,
    fare: [385, 385, 340][index],
    boardingDate: "2026-10-01",
  }));
  path.totalFare = 1110;
  const price = { totalFare: 1110, serviceFee: 50, amount: 1160 };
  const pnrs = ["1234567890", "2345678901", "3456789012"];
  let paid = false;

  // All API requests are intercepted, including payment simulation. No real
  // reservation, payment order, email or WhatsApp can be triggered by this test.
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let json: unknown = {};
    if (url.pathname.endsWith("/stations/suggest"))
      json = { data: { stationList: DEFAULT_STATIONS } };
    if (url.pathname.endsWith("/trains/search"))
      json = {
        data: {
          trainList: [
            {
              ...DEFAULT_TRAIN,
              avlClasses: ["SL"],
              availabilityCache: {
                SL: {
                  railDataStatus: "WL 15",
                  availabilityDisplayName: "WL 15",
                  fare: "1110",
                },
              },
            },
          ],
        },
      };
    if (url.pathname.endsWith("/stations-meta")) json = { stations: [] };
    if (url.pathname.endsWith("/alternate-paths")) json = path;
    if (url.pathname.endsWith("/alternate-paths/stream")) {
      await route.fulfill({
        contentType: "application/x-ndjson",
        body: JSON.stringify({ type: "result", data: path }) + "\n",
      });
      return;
    }
    if (url.pathname === "/api/split-booking/create") {
      requests.push(
        route.request().postDataJSON() as CreateSplitBookingPayload,
      );
      json = {
        ...price,
        bookingRef: "LB-TEST",
        bookingMode: "AI",
        orderId: "order-test",
        qrImageUrl:
          "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      };
    }
    if (url.pathname.includes("/simulate-pay/")) paid = true;
    if (
      url.pathname.includes("/split-booking/status/") ||
      url.pathname.includes("/simulate-pay/")
    ) {
      json = {
        ...price,
        bookingRef: "LB-TEST",
        bookingMode: "AI",
        paymentStatus: paid ? "PAID" : "PENDING",
        bookingStatus: paid ? "CONFIRMED" : "IDLE",
        pnrs: paid ? pnrs : [],
        logs: [],
      };
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(json),
    });
  });

  await page.goto("/");
  await page.getByLabel("From", { exact: true }).fill("Or");
  await page.getByRole("option", { name: /ORIG/ }).click();
  await page.getByLabel("To", { exact: true }).fill("De");
  await page.getByRole("option", { name: /DEST/ }).click();
  await page
    .getByRole("button", { name: "Search trains", exact: true })
    .click();
  await page.getByRole("button", { name: "Select →", exact: true }).click();
  await page.getByRole("button", { name: "Book Now", exact: true }).click();
  const modal = page.getByRole("dialog").last();
  await modal.getByPlaceholder("e.g. 9876543210").fill("9876543210");
  await modal
    .getByPlaceholder("e.g. yourname@example.com")
    .fill("test@example.com");
  await modal.getByPlaceholder("Full Name as per ID").fill("Test Passenger");
  await modal
    .getByRole("button", { name: "Proceed to Payment", exact: true })
    .click();
  await expect(
    modal.getByRole("heading", { name: "Pay ₹1,160 via UPI" }),
  ).toBeVisible();
  await expect(modal).toContainText(
    "₹1,110 (tickets) + ₹50 (service fee) = ₹1,160",
  );
  expect(requests[0].legs).toHaveLength(3);
  expect(requests[0].fromStationCode).toBe("DEE");
  expect(requests[0].totalFare).toBe(1110);
  await modal.getByRole("button", { name: /Simulate Payment/ }).click();
  await expect(modal).toContainText("Payment Received (₹1,160)");
  for (const pnr of pnrs)
    await expect(modal.getByText(pnr, { exact: true })).toBeVisible();
  await expect(modal).toContainText("Leg 3 PNR:");
});
