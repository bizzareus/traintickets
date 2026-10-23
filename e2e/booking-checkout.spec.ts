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
  const breakdown = booking
    .details()
    .getByRole("region", { name: "Fare breakdown" });
  for (const row of [
    "Ticket Fare₹980.00",
    "IRCTC Service Charge₹35.40",
    "IRCTC Payment Gateway Fee₹11.99",
    "LastBerth Service Charge₹80.00",
    "Travel Insurance₹0.90",
    "Total Amount₹1,108.29",
  ]) {
    await expect(breakdown).toContainText(row);
  }
  expect(booking.state.requests[0]).not.toHaveProperty("serviceFee");
  await expect(booking.details().getByText(/\(service fee\)/)).toHaveCount(0);
});

test("passenger details show the server quote before any checkout is created", async ({
  booking,
}) => {
  await booking.open();
  const breakdown = booking
    .details()
    .getByRole("region", { name: "Fare breakdown" });
  for (const row of [
    "Ticket Fare₹980.00",
    "IRCTC Service Charge₹35.40",
    "IRCTC Payment Gateway Fee₹11.99",
    "LastBerth Service Charge₹80.00",
    "Travel Insurance₹0.90",
    "Total Amount₹1,108.29",
  ]) {
    await expect(breakdown).toContainText(row);
  }
  expect(booking.state.quoteRequests).toEqual([
    {
      totalFare: 980,
      legs: [{ travelClass: "SL" }, { travelClass: "SL" }],
    },
  ]);
  expect(booking.state.requests).toHaveLength(0);
});

for (const back of ["Back to details", "1. Passenger Details"]) {
  test(`payment link is reused when returning with unchanged details via ${back}`, async ({
    booking,
    isMobile,
  }) => {
    await booking.open();
    await booking.fill();
    await booking.submit();
    const originalUrl = await booking
      .details()
      .locator("iframe")
      .getAttribute("src");
    await booking
      .details()
      .getByRole("button", {
        name: back === "1. Passenger Details" && isMobile ? "1. Details" : back,
      })
      .click();
    await expect(booking.details().getByLabel("Full Name")).toHaveValue(
      "Test Passenger",
    );
    await expect(booking.details().getByLabel("Email Address")).toHaveValue(
      "booking@example.com",
    );
    await expect(
      booking.details().getByRole("region", { name: "Fare breakdown" }),
    ).toContainText("Total Amount₹1,108.29");
    await booking.submit();
    await expect(booking.details().locator("iframe")).toHaveAttribute(
      "src",
      originalUrl!,
    );
    expect(booking.state.requests).toHaveLength(1);
    expect(booking.state.quoteRequests).toHaveLength(1);
    expect(booking.state.statusRequests).toContain("LB-TEST");
  });
}

test("edited passenger details create a new payment intent, then reuse that intent", async ({
  booking,
}) => {
  await booking.open();
  await booking.fill();
  await booking.submit();
  await booking
    .details()
    .getByRole("button", { name: "Back to details" })
    .click();
  await booking.details().getByLabel("Full Name").fill("Updated Passenger");
  await booking
    .details()
    .getByRole("checkbox", { name: "Consider for Auto-Upgradation" })
    .uncheck();
  await booking.submit();
  await expect(
    booking.details().getByRole("heading", { name: /^Pay ₹/ }),
  ).toBeVisible();
  expect(booking.state.requests).toHaveLength(2);
  expect(booking.state.requests[1].passengers[0].name).toBe(
    "Updated Passenger",
  );
  expect(booking.state.requests[1].autoUpgrade).toBe(false);
  await booking
    .details()
    .getByRole("button", { name: "Back to details" })
    .click();
  await booking.submit();
  await expect(
    booking.details().getByRole("heading", { name: /^Pay ₹/ }),
  ).toBeVisible();
  expect(booking.state.requests).toHaveLength(2);
});

test("if checking the original payment fails, no second checkout is created", async ({
  booking,
}) => {
  await booking.open();
  await booking.fill();
  await booking.submit();
  await booking
    .details()
    .getByRole("button", { name: "Back to details" })
    .click();
  booking.state.statusFailures = 4;
  await booking.submit();
  await expect(
    booking.details().getByRole("button", { name: "Proceed to Payment" }),
  ).toBeEnabled();
  await expect(
    booking.details().getByText("Temporary status failure"),
  ).toBeVisible();
  expect(booking.state.requests).toHaveLength(1);
});

test("a paid payment while reviewing details resumes booking without a second charge", async ({
  booking,
}) => {
  await booking.open();
  await booking.fill();
  await booking.submit();
  await booking
    .details()
    .getByRole("button", { name: "Back to details" })
    .click();
  booking.state.status = {
    paymentStatus: "PAID",
    bookingStatus: "IN_PROGRESS",
  };
  await booking.details().getByLabel("Full Name").fill("Updated Passenger");
  await booking.submit();
  await expect(
    booking
      .details()
      .getByRole("heading", { name: "Booking in progress", exact: true }),
  ).toBeVisible();
  expect(booking.state.requests).toHaveLength(1);
});

test("a failed payment intent is not reused", async ({ booking }) => {
  await booking.open();
  await booking.fill();
  await booking.submit();
  await booking
    .details()
    .getByRole("button", { name: "Back to details" })
    .click();
  booking.state.status = { paymentStatus: "FAILED", bookingStatus: "IDLE" };
  await booking.submit();
  await expect(
    booking.details().getByRole("heading", { name: /^Pay ₹/ }),
  ).toBeVisible();
  expect(booking.state.requests).toHaveLength(2);
});

test("quote errors prevent checkout until the breakdown can be loaded", async ({
  booking,
}) => {
  booking.state.quoteError = { status: 503, message: "Unavailable" };
  await booking.open();
  await expect(
    booking
      .details()
      .getByText("Could not load the fare breakdown. Please try again."),
  ).toBeVisible();
  await expect(
    booking.details().getByRole("button", { name: "Proceed to Payment" }),
  ).toBeDisabled();
  booking.state.quoteError = undefined;
  await booking.details().getByRole("button", { name: "Retry" }).click();
  await expect(
    booking.details().getByRole("region", { name: "Fare breakdown" }),
  ).toContainText("Total Amount₹1,108.29");
  await booking.fill();
  await booking.submit();
  await expect(
    booking.details().getByRole("heading", { name: /^Pay ₹/ }),
  ).toBeVisible();
  expect(booking.state.quoteRequests).toHaveLength(2);
  expect(booking.state.requests).toHaveLength(1);
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
