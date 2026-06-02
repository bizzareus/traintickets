import { expect, test } from "@playwright/test";

test.describe("LiveChart Route Vacancy Predictor & Tatkal-Saver Optimizer", () => {
  test("successfully displays predictive analytics, updates on node click, and activates monitoring alert", async ({ page }) => {
    
    const mockTrainId = "12345";
    const journeyDate = "2026-06-15";

    // 1. Intercept GET /api/trains/12345 to return our detailed chartRules and stations
    await page.route(`**/api/trains/${mockTrainId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: mockTrainId,
          trainNumber: "12345",
          trainName: "Swaraj Express",
          originStation: "NDLS",
          destinationStation: "BRC",
          chartRules: [
            {
              stationCode: "NDLS",
              chartTimeLocal: "10:00",
              sequenceNumber: 1,
              predictionProbability: 88,
              avgBerthsReleased: 12.5,
              optimalWindowStart: "09:50",
              optimalWindowEnd: "10:10",
            },
            {
              stationCode: "KOTA",
              chartTimeLocal: "15:30",
              sequenceNumber: 2,
              predictionProbability: 45,
              avgBerthsReleased: 4.2,
              optimalWindowStart: "15:20",
              optimalWindowEnd: "15:40",
            },
            {
              stationCode: "BRC",
              chartTimeLocal: "21:00",
              sequenceNumber: 3,
              predictionProbability: 25,
              avgBerthsReleased: 1.1,
              optimalWindowStart: "20:50",
              optimalWindowEnd: "21:10",
            },
          ],
        }),
      });
    });

    // 2. Intercept POST /api/monitoring-requests to return a 201 Created mock payload
    await page.route("**/api/monitoring-requests", async (route) => {
      expect(route.request().method()).toBe("POST");
      const postData = route.request().postDataJSON();
      
      // Basic request body validation
      expect(postData).toMatchObject({
        trainId: mockTrainId,
        journeyDate,
        classCode: "3A",
      });

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "alert-mock-123",
          status: "ACTIVE",
          createdAt: new Date().toISOString(),
        }),
      });
    });

    // 3. Navigate to the dynamic predictor detail page
    await page.goto(`/trains/${mockTrainId}?journeyDate=${journeyDate}`);

    // 4. Verify that the interactive SVG timeline renders all three nodes successfully using precise SVG text filters
    const ndlsNode = page.locator("svg text").filter({ hasText: /^NDLS$/ });
    const kotaNode = page.locator("svg text").filter({ hasText: /^KOTA$/ });
    const brcNode = page.locator("svg text").filter({ hasText: /^BRC$/ });

    await expect(ndlsNode).toBeVisible();
    await expect(kotaNode).toBeVisible();
    await expect(brcNode).toBeVisible();

    // Verify percentages are also displayed on the nodes inside the SVG
    await expect(page.locator("svg text").filter({ hasText: /^88%$/ })).toBeVisible();
    await expect(page.locator("svg text").filter({ hasText: /^45%$/ })).toBeVisible();
    await expect(page.locator("svg text").filter({ hasText: /^25%$/ })).toBeVisible();

    // 5. Verify the Tatkal-Saver Card loads the default NDLS station prediction
    // (88% success rate, high-chance/Excellent messaging, saving up to ₹405 for 3A)
    const activeLegText = page.locator("text=Confirmation forecast for journey starting at NDLS");
    await expect(activeLegText).toBeVisible();

    // Gauge center text containing probability and rating
    const circularGaugeText = page.locator(".absolute.text-center").locator("p").filter({ hasText: /^88%$/ });
    await expect(circularGaugeText).toBeVisible();
    
    // NDLS success (88%) is Excellent (high-chance messaging)
    const chanceRatingText = page.locator(".absolute.text-center").locator("p").filter({ hasText: /^Excellent$/ });
    await expect(chanceRatingText).toBeVisible();

    // Verification of historical berths and optimal window
    await expect(page.locator("text=12.5 berths/chart")).toBeVisible();
    await expect(page.locator("text=09:50 - 10:10")).toBeVisible();

    // Class 3A dynamic optimization savings is total 405 (base: 1050 * 0.1 = 105 + tatkal: 300 = 405)
    await expect(page.locator("text=₹405 Saved/Seat")).toBeVisible();

    // 6. Verify the countdown clock renders properly
    // It starts with 13524 seconds: "03h : 45m : 24s" (with slight dynamic updates/countdown)
    const countdownElement = page.locator("div.font-mono").first();
    await expect(countdownElement).toBeVisible();
    const countdownText = await countdownElement.textContent();
    expect(countdownText).toMatch(/\d{2}h\s*:\s*\d{2}m\s*:\s*\d{2}s/);

    // 7. Clicking the KOTA station node in the SVG timeline reactively triggers state updates
    // (circular progress updates to 45% with amber-chance/Moderate messaging, 4.2 berths, 15:20 - 15:40)
    await page.locator("g").filter({ hasText: "KOTA" }).locator("circle").first().click({ force: true });

    // Verify state reactively updated to KOTA
    const kotaLegText = page.locator("text=Confirmation forecast for journey starting at KOTA");
    await expect(kotaLegText).toBeVisible();

    const kotaGaugeText = page.locator(".absolute.text-center").locator("p").filter({ hasText: /^45%$/ });
    await expect(kotaGaugeText).toBeVisible();

    // KOTA success (45%) is Moderate (amber-chance messaging)
    const kotaChanceText = page.locator(".absolute.text-center").locator("p").filter({ hasText: /^Moderate$/ });
    await expect(kotaChanceText).toBeVisible();

    await expect(page.locator("text=4.2 berths/chart")).toBeVisible();
    await expect(page.locator("text=15:20 - 15:40")).toBeVisible();

    // 8. Selecting a class (e.g. 3A) and submitting the "Activate Vacancy Tracker" / Alert form
    // Let's click '3A' to ensure it's selected explicitly
    const classBtn3A = page.getByRole("button", { name: "3A", exact: true });
    await expect(classBtn3A).toBeVisible();
    await classBtn3A.click();

    // Click the submit button: "Activate Vacancy Tracker"
    const submitBtn = page.getByRole("button", { name: "Activate Vacancy Tracker" });
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // 9. Verify the success banner is displayed
    const successHeader = page.locator("text=Monitoring Request Active");
    await expect(successHeader).toBeVisible();

    const successMessage = page.locator("text=We are now tracking train #12345 for station KOTA (3A)");
    await expect(successMessage).toBeVisible();
  });
});
