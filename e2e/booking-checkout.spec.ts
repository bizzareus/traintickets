import { test, expect } from "./fixtures/booking-engine";

for (const error of [
  { status: 400, message: "Fare changed. Select your tickets again." },
  { status: 400, message: ["Fare changed", "Please select tickets again"] },
  { status: 503, message: "Assisted booking is currently disabled" },
  {
    status: 503,
    message: "Payment system is currently unavailable. Please try again later.",
  },
]) {
  test(`checkout ${error.status}: ${JSON.stringify(error.message)} remains recoverable`, async ({
    booking,
  }) => {
    booking.state.createError = error;
    await booking.open();
    await booking.fill();
    await booking.submit();
    const message = Array.isArray(error.message)
      ? error.message.join("; ")
      : error.message;
    await expect(
      booking.details().getByText(message, { exact: true }),
    ).toBeVisible();
    await expect(
      booking.details().getByRole("button", { name: "Proceed to Payment" }),
    ).toBeEnabled();
    await expect(booking.details().getByLabel("Full Name")).toHaveValue(
      "Test Passenger",
    );
    await expect(booking.details().locator("iframe")).toHaveCount(0);
    expect(booking.state.requests).toHaveLength(1);
    booking.state.createError = undefined;
    await booking.submit();
    await expect(
      booking.details().getByRole("heading", { name: /^Pay ₹/ }),
    ).toBeVisible();
    expect(booking.state.requests).toHaveLength(2);
  });
}

test("real Nest whitelist rejection is visible and can be corrected", async ({
  booking,
}) => {
  booking.state.createTransform = (payload) => ({
    ...payload,
    legs: payload.legs.map((leg) => ({ ...leg, unknownField: true })),
  });
  await booking.open();
  await booking.fill();
  await booking.submit();
  await expect(
    booking
      .details()
      .getByText(/legs.0.property unknownField should not exist/),
  ).toBeVisible();
  expect(booking.state.requests).toHaveLength(1);
  booking.state.createTransform = undefined;
  await booking.submit();
  await expect(
    booking.details().getByRole("heading", { name: /^Pay ₹/ }),
  ).toBeVisible();
});

test("a failed create POST is not automatically retried; explicit retry works", async ({
  booking,
}) => {
  booking.state.abortCreate = true;
  await booking.open();
  await booking.fill();
  await booking.submit();
  await expect(
    booking.details().getByText("Network Error", { exact: true }),
  ).toBeVisible();
  await expect(
    booking.details().getByRole("button", { name: "Proceed to Payment" }),
  ).toBeEnabled();
  expect(booking.state.requests).toHaveLength(1);
  booking.state.abortCreate = false;
  await booking.submit();
  await expect(
    booking.details().getByRole("heading", { name: /^Pay ₹/ }),
  ).toBeVisible();
});

test("repeated submits while create is pending produce a single request", async ({
  booking,
}) => {
  let release!: () => void;
  booking.state.createGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await booking.open();
    await booking.fill();
    const button = booking
      .details()
      .getByRole("button", { name: "Proceed to Payment" });
    await button.dblclick();
    await expect(
      booking.details().getByRole("button", { name: /Preparing Checkout/ }),
    ).toBeDisabled();
    await expect.poll(() => booking.state.requests.length).toBe(1);
  } finally {
    release();
  }
  await expect(
    booking.details().getByRole("heading", { name: /^Pay ₹/ }),
  ).toBeVisible();
  expect(booking.state.requests).toHaveLength(1);
});

test("checkout displays backend-authoritative prices and no obsolete fee wording", async ({
  booking,
}) => {
  await booking.open();
  await booking.fill();
  await booking.submit();
  await expect(booking.details()).toContainText(
    "₹980 (tickets) + ₹39 (payment service charge) = ₹1,019",
  );
  expect(booking.state.requests[0]).not.toHaveProperty("serviceFee");
  await expect(booking.details().getByText(/\(service fee\)/)).toHaveCount(0);
});

test("Escape closes passenger details; reopening clears invalid details", async ({
  booking,
  page,
}) => {
  await booking.open();
  await booking.fill({ name: "   " });
  await booking.submit();
  await expect(booking.details()).toContainText("valid name");
  await booking.details().getByLabel("Full Name").focus();
  await page.keyboard.press("Escape");
  await expect(booking.details()).toHaveCount(0);
  await page.getByRole("button", { name: "Book Now", exact: true }).click();
  await expect(booking.details().getByLabel("Full Name")).toHaveValue("");
  await expect(booking.details().getByText(/valid name/)).toHaveCount(0);
});
