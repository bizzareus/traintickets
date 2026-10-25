import { test, expect } from "./fixtures/booking-engine";
import {
  clickTestCheckout,
  openPaidCheckout,
  simulatePaidStatus,
} from "./fixtures/booking-payment";

test("iframe hint cannot confirm a pending payment", async ({
  booking,
  page,
}) => {
  await openPaidCheckout(booking, page);
  const frame = booking.details().locator("iframe");
  await expect(frame).toHaveAttribute("allow", "payment");
  await expect(frame).toHaveAttribute("src", /iframe=1/);
  const before = booking.state.statusRequests.length;
  await clickTestCheckout(page);
  await expect
    .poll(() => booking.state.statusRequests.length)
    .toBeGreaterThan(before);
  await expect(
    booking.details().getByRole("button", { name: /^Pay ₹/ }),
  ).toBeVisible();
  await expect(booking.details().getByText(/Payment Received/)).toHaveCount(0);
});

test("verified paid then confirmed status displays every PNR and stops polling", async ({
  booking,
  page,
}) => {
  await openPaidCheckout(booking, page);
  await simulatePaidStatus(booking, page);
  await expect(booking.details()).toContainText("Payment Received (₹1,108.29)");
  booking.state.status = {
    ...booking.state.status,
    bookingStatus: "CONFIRMED",
    pnrs: ["1234567890", "2345678901"],
  };
  await page.clock.fastForward(2500);
  await expect(
    booking
      .details()
      .getByRole("heading", { name: "Your tickets are confirmed" }),
  ).toBeVisible();
  for (const pnr of booking.state.status.pnrs!)
    await expect(
      booking.details().getByText(pnr, { exact: true }),
    ).toBeVisible();
  const count = booking.state.statusRequests.length;
  await page.clock.fastForward(10_000);
  expect(booking.state.statusRequests).toHaveLength(count);
});

test("manual payment remains unconfirmed until operator confirmation", async ({
  booking,
  page,
}) => {
  await openPaidCheckout(booking, page);
  await simulatePaidStatus(booking, page, "MANUAL_PENDING");
  await expect(
    booking
      .details()
      .getByRole("heading", { name: "Your tickets are confirmed" }),
  ).toHaveCount(0);
  await expect(booking.details().getByText(/PNR:/)).toHaveCount(0);
  booking.state.status = {
    ...booking.state.status,
    bookingStatus: "CONFIRMED",
    pnrs: ["1234567890", "2345678901"],
  };
  await page.clock.fastForward(2500);
  await expect(
    booking
      .details()
      .getByRole("heading", { name: "Your tickets are confirmed" }),
  ).toBeVisible();
});

test("failed payment removes checkout and never enters reservation", async ({
  booking,
  page,
}) => {
  await openPaidCheckout(booking, page);
  booking.state.status = { paymentStatus: "FAILED", bookingStatus: "IDLE" };
  await clickTestCheckout(page);
  await expect(booking.details().getByRole("alert")).toContainText(
    "Payment failed",
  );
  await expect(booking.details().locator("iframe")).toHaveCount(0);
  await expect(
    booking
      .details()
      .getByRole("heading", { name: "Booking in progress", exact: true }),
  ).toHaveCount(0);
});

test("partial booking failure preserves issued PNR and shows the reason", async ({
  booking,
  page,
}) => {
  await openPaidCheckout(booking, page);
  await simulatePaidStatus(booking, page);
  booking.state.status = {
    ...booking.state.status,
    bookingStatus: "FAILED",
    bookingError: "Second leg requires OTP",
    pnrs: ["1234567890"],
  };
  await page.clock.fastForward(2500);
  await expect(
    booking.details().getByRole("heading", { name: "Booking needs attention" }),
  ).toBeVisible();
  await expect(booking.details()).toContainText("Second leg requires OTP");
  await expect(
    booking.details().getByText("1234567890", { exact: true }),
  ).toBeVisible();
  await expect(booking.details()).toContainText(
    "review these reservations before re-booking",
  );
});

test("transient status errors recover through existing GET retries", async ({
  booking,
  page,
}) => {
  await openPaidCheckout(booking, page);
  booking.state.statusFailures = 2;
  booking.state.status = {
    paymentStatus: "PAID",
    bookingStatus: "IN_PROGRESS",
  };
  await clickTestCheckout(page);
  await page.clock.runFor(1500);
  await expect(
    booking
      .details()
      .getByRole("heading", { name: "Booking in progress", exact: true }),
  ).toBeVisible();
  await expect.poll(() => booking.state.statusFailures).toBe(0);
});

test("wrong-origin and wrong-window payment messages are ignored", async ({
  booking,
  page,
}) => {
  await openPaidCheckout(booking, page);
  await expect
    .poll(() => booking.state.statusRequests.length)
    .toBeGreaterThan(0);
  await page.evaluate(() => Promise.resolve());
  const count = booking.state.statusRequests.length;
  await page.evaluate(() => {
    const source = document.querySelector<HTMLIFrameElement>(
      'iframe[title="Complete payment via Muzobox"]',
    )!.contentWindow;
    for (const event of [
      { origin: "https://malicious.example", source },
      { origin: "https://muzobox.com", source: window },
    ]) {
      const message = new MessageEvent("message", {
        origin: event.origin,
        data: { type: "payment_complete", status: "paid" },
      });
      Object.defineProperty(message, "source", { value: event.source });
      window.dispatchEvent(message);
    }
  });
  expect(booking.state.statusRequests).toHaveLength(count);
  await expect(booking.details().locator("iframe")).toBeVisible();
});

test("five-minute message respects persisted paidAt and clears after completion", async ({
  booking,
  page,
}) => {
  await openPaidCheckout(booking, page);
  await simulatePaidStatus(booking, page);
  await page.clock.fastForward(299_000);
  await expect(booking.details().getByRole("status")).toHaveCount(0);
  await page.clock.fastForward(1_000);
  await expect(booking.details().getByRole("status")).toContainText(
    "It's taking longer than usual.",
  );
  await expect(
    booking.details().getByRole("link", { name: "+919999224767" }),
  ).toHaveAttribute("href", /booking%20LB-TEST/);
  booking.state.status = {
    ...booking.state.status,
    bookingStatus: "CONFIRMED",
    pnrs: ["1234567890"],
  };
  await page.clock.fastForward(2500);
  await expect(
    booking
      .details()
      .getByRole("heading", { name: "Your tickets are confirmed" }),
  ).toBeVisible();
  await expect(booking.details().getByRole("status")).toHaveCount(0);
});

test("closing checkout stops polling and ignores an in-flight late response", async ({
  booking,
  page,
}) => {
  await openPaidCheckout(booking, page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  booking.state.statusHandler = async () => {
    await gate;
    return {
      paymentStatus: "PAID",
      bookingStatus: "CONFIRMED",
      pnrs: ["1234567890"],
    };
  };
  try {
    const count = booking.state.statusRequests.length;
    await clickTestCheckout(page);
    await expect
      .poll(() => booking.state.statusRequests.length)
      .toBeGreaterThan(count);
    await booking
      .details()
      .getByRole("button", { name: "Close booking" })
      .click();
    await page.getByRole("button", { name: "Book Now", exact: true }).click();
    await expect(
      booking.details().getByRole("button", { name: "Proceed to Payment" }),
    ).toBeVisible();
  } finally {
    release();
  }
  const count = booking.state.statusRequests.length;
  await page.clock.fastForward(10_000);
  expect(booking.state.statusRequests).toHaveLength(count);
  await expect(
    booking
      .details()
      .getByRole("heading", { name: "Your tickets are confirmed" }),
  ).toHaveCount(0);
});

for (const [paymentStatus, heading] of [
  ["PENDING", "Confirming your payment"],
  ["PAID", "Payment received"],
  ["FAILED", "Payment failed"],
] as const) {
  test(`return page uses verified ${paymentStatus}, ignoring query amount and status`, async ({
    booking,
    page,
  }) => {
    booking.state.status = { paymentStatus };
    await page.goto(
      "/split-booking/payment-complete?ref=LB-TEST&status=paid&amount=1",
    );
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Fare breakdown" }),
    ).toContainText("Total Amount₹1,108.29");
  });
}

test("return page without reference makes no status request", async ({
  booking,
  page,
}) => {
  await page.goto("/split-booking/payment-complete");
  await expect(
    page.getByRole("heading", { name: "Missing booking reference" }),
  ).toBeVisible();
  expect(booking.state.statusRequests).toHaveLength(0);
});

test("return page recovers from status failures then stops after verified payment", async ({
  booking,
  page,
}) => {
  booking.state.statusFailures = 100;
  await page.goto("/split-booking/payment-complete?ref=LB-TEST");
  await expect(page.getByRole("status")).toContainText("Retrying");
  booking.state.statusFailures = 0;
  booking.state.status = { paymentStatus: "PAID" };
  await expect(
    page.getByRole("heading", { name: "Payment received", exact: true }),
  ).toBeVisible();
  await page.clock.install();
  const count = booking.state.statusRequests.length;
  await page.clock.fastForward(10_000);
  expect(booking.state.statusRequests).toHaveLength(count);
});
