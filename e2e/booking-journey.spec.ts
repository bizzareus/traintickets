import {
  test,
  expect,
  bookingLeg,
  classOption,
  BOOKING_DATE,
} from "./fixtures/booking-engine";
import {
  openPaidCheckout,
  simulatePaidStatus,
} from "./fixtures/booking-payment";

test("search to paid booking carries the searched route, fares and total", async ({
  booking,
  page,
}) => {
  await openPaidCheckout(booking, page);
  await expect(
    booking.details().getByRole("heading", {
      name: "Pay ₹1,095.85",
      exact: true,
    }),
  ).toBeVisible();
  expect(booking.state.requests).toHaveLength(1);
  const payload = booking.state.requests[0];
  expect(payload.fromStationCode).toBe("CYI");
  expect(payload.toStationCode).toBe("GOY");
  expect(payload.journeyDate).toBe(BOOKING_DATE);
  expect(payload.totalFare).toBe(
    payload.legs.reduce((sum, leg) => sum + leg.fare, 0),
  );
  await simulatePaidStatus(booking, page);
  await expect(booking.details()).toContainText("Payment Received (₹1,096.00)");
});

test("search to confirmed PNRs issues one PNR per leg then stops polling", async ({
  booking,
  page,
}) => {
  await openPaidCheckout(booking, page);
  await simulatePaidStatus(booking, page);
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
  for (const pnr of ["1234567890", "2345678901"])
    await expect(
      booking.details().getByText(pnr, { exact: true }),
    ).toBeVisible();
  const count = booking.state.statusRequests.length;
  await page.clock.fastForward(10_000);
  expect(booking.state.statusRequests).toHaveLength(count);
});

test("class upgrade across the whole journey changes the charged total", async ({
  booking,
}) => {
  await booking.open({
    legs: [
      bookingLeg("CYI", "VGLJ", [
        classOption("SL", 580),
        classOption("3A", 700),
      ]),
      bookingLeg("VGLJ", "GOY", [classOption("SL", 400)]),
    ],
  });
  await booking
    .classes()
    .getByRole("radio", { name: /^Leg 1: 3A/ })
    .check();
  await booking
    .classes()
    .getByRole("button", { name: "Continue to passenger details" })
    .click();
  await booking.fill();
  await booking.submit();
  await expect(
    booking.details().getByRole("heading", {
      name: "Pay ₹1,233.55",
      exact: true,
    }),
  ).toBeVisible();
  const breakdown = booking
    .details()
    .getByRole("region", { name: "Fare breakdown" });
  for (const row of [
    "Ticket Fare₹1,100.00",
    "IRCTC Service Charge₹53.10",
    "LastBerth Service Charge₹80.00",
    "Travel Insurance₹0.45",
    "Total Amount₹1,233.55",
  ]) {
    await expect(breakdown).toContainText(row);
  }
  expect(booking.state.requests[0].legs.map((leg) => leg.travelClass)).toEqual([
    "3A",
    "SL",
  ]);
});

test("a second booking after closing checkout creates a fresh request", async ({
  booking,
  page,
}) => {
  await booking.open();
  await booking.fill();
  await booking.submit();
  await expect(
    booking.details().getByRole("heading", {
      name: "Pay ₹1,095.85",
      exact: true,
    }),
  ).toBeVisible();
  await booking
    .details()
    .getByRole("button", { name: "Close booking" })
    .click();
  await page.getByRole("button", { name: "Book Now", exact: true }).click();
  await booking.fill();
  await booking.submit();
  await expect(
    booking.details().getByRole("heading", {
      name: "Pay ₹1,095.85",
      exact: true,
    }),
  ).toBeVisible();
  expect(booking.state.requests).toHaveLength(2);
  expect(booking.state.requests[1]).toMatchObject({
    fromStationCode: "CYI",
    toStationCode: "GOY",
    journeyDate: BOOKING_DATE,
    totalFare: 980,
  });
});

test("a confirmed booking flows into cancellation with its reference", async ({
  booking,
  page,
}) => {
  await openPaidCheckout(booking, page);
  await simulatePaidStatus(booking, page);
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
  await page.goto("/cancel-booking?ref=LB-TEST");
  await page.getByLabel("Mobile Number", { exact: false }).fill("9876543210");
  await page.getByRole("button", { name: "Find Ticket Details" }).click();
  await expect(page.getByText("1234567890", { exact: true })).toBeVisible();
  await page
    .getByLabel("Reason for Cancellation")
    .fill("Journey complete test");
  await page
    .getByRole("checkbox", { name: /I confirm that I want to cancel booking/ })
    .check();
  await page
    .getByRole("button", { name: "Confirm Cancellation Request" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Cancellation Request Received" }),
  ).toBeVisible();
  expect(booking.state.cancellationRequests).toEqual([
    {
      bookingRef: "LB-TEST",
      mobile: "9876543210",
      reason: "Journey complete test",
    },
  ]);
});

test("payment return page repeats the exact checkout breakdown", async ({
  booking,
  page,
}) => {
  booking.state.status = { paymentStatus: "PAID" };
  await page.goto("/split-booking/payment-complete?ref=LB-TEST");
  await expect(
    page.getByRole("heading", { name: "Payment received", exact: true }),
  ).toBeVisible();
  const breakdown = page.getByRole("region", { name: "Fare breakdown" });
  for (const row of [
    "Ticket Fare₹980.00",
    "IRCTC Service Charge₹35.40",
    "LastBerth Service Charge₹80.00",
    "Travel Insurance₹0.45",
    "Total Amount₹1,095.85",
  ]) {
    await expect(breakdown).toContainText(row);
  }
});
