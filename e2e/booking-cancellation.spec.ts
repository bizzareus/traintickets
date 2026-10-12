import { test, expect } from "./fixtures/booking-engine";

test("successful cancellation requires acknowledgement and sends normalized details", async ({
  booking,
  page,
}) => {
  await page.goto("/cancel-booking?ref=LB-TEST");
  await expect(
    page.getByRole("button", { name: "Find Ticket Details" }),
  ).toBeEnabled();
  await expect(page.getByLabel("Booking Reference")).toHaveValue("LB-TEST");
  await page
    .getByLabel("Mobile Number", { exact: false })
    .fill("+91 98765-43210");
  await page.getByRole("button", { name: "Find Ticket Details" }).click();
  await expect(page.getByText("1234567890", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm Cancellation Request" }),
  ).toBeDisabled();
  expect(booking.state.cancellationRequests).toHaveLength(0);
  await page
    .getByLabel("Reason for Cancellation")
    .fill("  Travel plans changed  ");
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
      reason: "Travel plans changed",
    },
  ]);
});

for (const mobile of ["", "12345", "1234567890"]) {
  test(`invalid cancellation contact ${JSON.stringify(mobile)} does not request cancellation`, async ({
    booking,
    page,
  }) => {
    await page.goto("/cancel-booking?ref=LB-TEST");
    await expect(
      page.getByRole("button", { name: "Find Ticket Details" }),
    ).toBeEnabled();
    await page.getByLabel("Mobile Number").fill(mobile);
    await page.getByRole("button", { name: "Find Ticket Details" }).click();
    if (mobile)
      await expect(
        page.getByText("Please enter a valid 10-digit mobile number."),
      ).toBeVisible();
    expect(booking.state.cancellationRequests).toHaveLength(0);
    await expect(
      page.getByRole("button", { name: "Confirm Cancellation Request" }),
    ).toHaveCount(0);
  });
}

for (const error of [
  { status: 404, message: "No booking found with this reference" },
  {
    status: 400,
    message: "Mobile number does not match the contact number on this booking",
  },
]) {
  test(`cancellation lookup: ${error.message}`, async ({ booking, page }) => {
    booking.state.cancellationError = error;
    await page.goto("/cancel-booking?ref=LB-TEST");
    await expect(
      page.getByRole("button", { name: "Find Ticket Details" }),
    ).toBeEnabled();
    await page.getByLabel("Mobile Number").fill("9876543210");
    await page.getByRole("button", { name: "Find Ticket Details" }).click();
    await expect(page.getByText(error.message)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Find Ticket Details" }),
    ).toBeEnabled();
    booking.state.cancellationError = undefined;
    await page.getByRole("button", { name: "Find Ticket Details" }).click();
    await expect(
      page.getByRole("button", { name: "Confirm Cancellation Request" }),
    ).toBeVisible();
  });
}

test("existing cancellation is displayed instead of another submission form", async ({
  booking,
  page,
}) => {
  booking.state.existingCancellation = true;
  await page.goto("/cancel-booking?ref=LB-TEST");
  await expect(
    page.getByRole("button", { name: "Find Ticket Details" }),
  ).toBeEnabled();
  await page.getByLabel("Mobile Number").fill("9876543210");
  await page.getByRole("button", { name: "Find Ticket Details" }).click();
  await expect(
    page.getByText("Cancellation Request Already Received"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm Cancellation Request" }),
  ).toHaveCount(0);
  expect(booking.state.cancellationRequests).toHaveLength(0);
});

test("failed cancellation submission keeps details and can be retried", async ({
  booking,
  page,
}) => {
  await page.goto("/cancel-booking?ref=LB-TEST");
  await expect(
    page.getByRole("button", { name: "Find Ticket Details" }),
  ).toBeEnabled();
  await page.getByLabel("Mobile Number").fill("9876543210");
  await page.getByRole("button", { name: "Find Ticket Details" }).click();
  await page.getByRole("checkbox", { name: /I confirm/ }).check();
  booking.state.cancellationError = {
    status: 503,
    message: "Cancellation unavailable",
  };
  await page
    .getByRole("button", { name: "Confirm Cancellation Request" })
    .click();
  await expect(page.getByText("Cancellation unavailable")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm Cancellation Request" }),
  ).toBeEnabled();
  booking.state.cancellationError = undefined;
  await page
    .getByRole("button", { name: "Confirm Cancellation Request" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Cancellation Request Received" }),
  ).toBeVisible();
});
