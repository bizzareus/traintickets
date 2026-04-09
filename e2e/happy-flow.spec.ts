import { expect, test } from "@playwright/test";
import {
  alternatePathTwoConfirmed,
  DEFAULT_TRAIN,
  installBookingV2Mocks,
} from "./fixtures/booking-v2-mocks";

test.describe("The Happy Flow", () => {
  test("user can find a train and book the best available seats (NDLS to MMCT)", async ({
    page,
  }) => {
    // 1. Calculate tomorrow's date for a realistic search
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // 2. Mock API responses with real-world station codes
    await installBookingV2Mocks(page, {
      stations: [
        { stationCode: "NDLS", stationName: "New Delhi" },
        { stationCode: "MMCT", stationName: "Mumbai Central" },
      ],
      alternatePaths: (body) =>
        alternatePathTwoConfirmed(String(body.trainNumber ?? "")),
    });

    // 3. Go to home page
    await page.goto("/");

    // 4. Select stations
    const waitFrom = page.waitForResponse((r) => r.url().includes("/api/booking-v2/stations/suggest"));
    await page.getByLabel("From", { exact: true }).fill("NDLS");
    await waitFrom;
    await page.getByRole("option", { name: /NDLS/ }).click();

    const waitTo = page.waitForResponse((r) => r.url().includes("/api/booking-v2/stations/suggest"));
    await page.getByLabel("To", { exact: true }).fill("MMCT");
    await waitTo;
    await page.getByRole("option", { name: /MMCT/ }).click();

    // 5. Submit Search
    await page.getByRole("button", { name: "Search trains" }).click();

    // 6. Verify results are visible
    await expect(
      page.getByRole("list", { name: "Train results" }),
    ).toContainText(DEFAULT_TRAIN.trainNumber);
    await expect(page.getByText(/AVAILABLE-\d+/).first()).toBeVisible();

    // 7. Explore alternate paths for the specific train
    const trainItem = page
      .getByRole("listitem")
      .filter({ hasText: DEFAULT_TRAIN.trainNumber });
    await trainItem.getByRole("button", { name: /Find best available seats/i }).click();

    // 8. Verify the alternate path modal opens
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toContainText("Full journey covered in 2 confirmed tickets");

    // 9. Confirm "Book" button exists
    const bookButton = dialog.getByRole("link", { name: /Book/ }).first();
    await expect(bookButton).toBeVisible();
    
    const href = await bookButton.getAttribute("href");
    expect(href).toContain("irctc.co.in");
    expect(href).toContain("trainNo=" + DEFAULT_TRAIN.trainNumber);
  });
});
