import { expect, type Page } from "@playwright/test";
import type { BookingHarness } from "./booking-engine";

/** Search, fill, submit and wait for the Muzobox iframe to be ready. */
export async function openPaidCheckout(booking: BookingHarness, page: Page) {
  await page.clock.install({ time: new Date("2026-10-12T06:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-12T06:00:01Z"));
  await booking.open();
  await booking.fill();
  await booking.submit();
  await expect(booking.details().locator("iframe")).toBeVisible();
  await expect(checkoutButton(booking)).toBeVisible();
}

function checkoutButton(booking: BookingHarness) {
  return booking
    .details()
    .frameLocator('iframe[title="Complete payment via Muzobox"]')
    .getByRole("button", { name: "Complete test checkout" });
}

/** Click the stubbed Muzobox "Complete test checkout" button. */
export async function clickTestCheckout(page: Page) {
  await page
    .frameLocator('iframe[title="Complete payment via Muzobox"]')
    .getByRole("button", { name: "Complete test checkout" })
    .click();
}

/** Mark the next status poll as paid and wait for the progress screen. */
export async function simulatePaidStatus(
  booking: BookingHarness,
  page: Page,
  bookingStatus: "IN_PROGRESS" | "MANUAL_PENDING" = "IN_PROGRESS",
) {
  booking.state.status = {
    paymentStatus: "PAID",
    bookingStatus,
    paidAt: await page.evaluate(() => new Date().toISOString()),
  };
  await clickTestCheckout(page);
  await expect(
    booking
      .details()
      .getByRole("heading", { name: "Booking in progress", exact: true }),
  ).toBeVisible();
}
