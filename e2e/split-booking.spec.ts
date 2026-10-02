import { expect, test } from "@playwright/test";
import {
  alternatePathTwoIntermediatesConfirmed,
  DEFAULT_STATIONS,
  DEFAULT_TRAIN,
} from "./fixtures/booking-v2-mocks";
import type { CreateSplitBookingPayload } from "../lib/split-booking";

for (const scenario of [
  { multipleClasses: false, flagEnabled: true, admin: false },
  { multipleClasses: true, flagEnabled: true, admin: false },
  { multipleClasses: true, flagEnabled: true, admin: false, partial: true },
  { multipleClasses: true, flagEnabled: false, admin: false },
  { multipleClasses: true, flagEnabled: false, admin: true },
]) {
  const { multipleClasses, flagEnabled, admin } = scenario;
  const partial = "partial" in scenario && scenario.partial;
  test(`booking flag ${flagEnabled ? "on" : "off"}, admin ${admin}, ${multipleClasses ? "multiple" : "single"} classes${partial ? ", partial journey" : ""}`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript((isAdmin) => {
      if (isAdmin) localStorage.setItem("admin", "true");
      else localStorage.removeItem("admin");
    }, admin);
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
    if (multipleClasses) {
      const option = (travelClass: string, fare: number | null) => ({
        travelClass,
        fare,
        availabilityDisplayName: "AVL 10",
        railDataStatus: "AVAILABLE-0010",
        availablityStatus: null,
        predictionPercentage: null,
      });
      path.legs[0].confirmedClassOptions = [
        option("SL", 385),
        option("3A", 565),
        option("2A", 770),
        option("1A", null),
      ];
      path.legs[1].confirmedClassOptions = [
        option("SL", 385),
        option("2A", 600),
      ];
      if (partial) {
        path.isComplete = false;
        path.legCount = 2;
        path.totalFare = 505;
        path.legs[0].confirmedClassOptions = [
          option("2S", 85),
          option("CC", 300),
        ];
        path.legs[1] = {
          ...path.legs[1],
          segmentKind: "check_realtime",
          fare: null,
          travelClass: null,
          confirmedClassOptions: [],
          availabilityDisplayName: "REGRET / No seats",
        };
        path.legs[2].travelClass = "CC";
        path.legs[2].fare = 420;
      }
    }
    const price = multipleClasses
      ? { totalFare: 1505, serviceFee: 50, amount: 1555 }
      : { totalFare: 1110, serviceFee: 50, amount: 1160 };
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

    await page.goto(`/?assisted_booking=${flagEnabled ? "1" : "0"}`);
    expect(await page.evaluate(() => localStorage.getItem("admin"))).toBe(
      admin ? "true" : null,
    );
    // Wait for an interactive client control before filling SSR-rendered inputs.
    const classFilter = page.getByRole("button", {
      name: "Select train travel classes",
      exact: true,
    });
    await classFilter.click();
    await expect(classFilter).toHaveAttribute("aria-expanded", "true");
    await classFilter.click();
    await expect(classFilter).toHaveAttribute("aria-expanded", "false");
    await page.getByLabel("From", { exact: true }).fill("Or");
    await page.getByRole("option", { name: /ORIG/ }).click();
    await page.getByLabel("To", { exact: true }).fill("De");
    await page.getByRole("option", { name: /DEST/ }).click();
    await page
      .getByRole("button", { name: "Search trains", exact: true })
      .click();
    await page.getByRole("button", { name: "Select →", exact: true }).click();
    const bookNow = page.getByRole("button", { name: "Book Now", exact: true });
    if (!flagEnabled) {
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(bookNow).toHaveCount(0);
      await expect(page.getByRole("radio")).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "Book Now", exact: true }).first(),
      ).toBeVisible();
      expect(requests).toHaveLength(0);
      return;
    }
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(bookNow).toBeEnabled();
    await bookNow.click();
    if (multipleClasses) {
      const classModal = page.getByRole("dialog").last();
      await expect(
        classModal.getByRole("heading", {
          name: "Choose classes for your tickets",
        }),
      ).toBeVisible();
      const continueButton = classModal.getByRole("button", {
        name: "Continue to passenger details",
        exact: true,
      });
      await expect(continueButton).toBeDisabled();
      expect(requests).toHaveLength(0);
      if (partial) {
        await expect(classModal.getByRole("group")).toHaveCount(2);
        await expect(
          classModal.getByRole("radio", { name: /^Leg 3: CC/ }),
        ).toBeChecked();
        await expect(classModal).toContainText(
          "Unavailable journey segments are not reserved.",
        );
        await classModal.getByRole("radio", { name: /^Leg 1: CC/ }).check();
        await expect(
          classModal.getByRole("status", { name: "Selected ticket fare" }),
        ).toContainText("₹720");
        await expect(continueButton).toBeEnabled();
        await classModal.screenshot({
          path: testInfo.outputPath("class-selection.png"),
        });
        await classModal
          .getByRole("button", { name: "Close class selection" })
          .click();
        await expect(page.getByRole("dialog")).toHaveCount(1);
        await bookNow.click();
        await expect(
          page
            .getByRole("dialog")
            .last()
            .getByRole("button", {
              name: "Continue to passenger details",
              exact: true,
            }),
        ).toBeDisabled();
        expect(requests).toHaveLength(0);
        return;
      }
      await expect(
        page.getByRole("radio", { name: /^Leg 3: SL/ }),
      ).toBeChecked();
      await expect(
        page.getByRole("radio", { name: /^Leg 1: 1A/ }),
      ).toBeDisabled();
      await page.getByRole("radio", { name: /^Leg 1: SL/ }).focus();
      await page.keyboard.press("ArrowDown");
      await expect(
        page.getByRole("radio", { name: /^Leg 1: 3A/ }),
      ).toBeChecked();
      await expect(continueButton).toBeDisabled();
      await page.getByRole("radio", { name: /^Leg 2: 2A/ }).check();
      await expect(continueButton).toBeEnabled();
      await expect(
        classModal.getByRole("status", { name: "Selected ticket fare" }),
      ).toContainText("₹1,505");
      await page.getByRole("radio", { name: /^Leg 1: 2A/ }).check();
      await expect(
        classModal.getByRole("status", { name: "Selected ticket fare" }),
      ).toContainText("₹1,710");
      await page.getByRole("radio", { name: /^Leg 1: 3A/ }).check();
      await classModal.screenshot({
        path: testInfo.outputPath("class-selection.png"),
      });
      await continueButton.click();
    }
    const modal = page.getByRole("dialog").last();
    await expect(
      modal.getByRole("heading", {
        name: "Ticket Reservation & Booking",
        exact: true,
      }),
    ).toBeVisible();
    if (multipleClasses) {
      await expect(modal).toContainText("DEE → S1 · 3A");
      await expect(modal).toContainText("S1 → S2 · 2A");
      await expect(modal).toContainText("S2 → DEST · SL");
    }
    await modal.getByPlaceholder("e.g. 9876543210").fill("9876543210");
    await modal
      .getByPlaceholder("e.g. yourname@example.com")
      .fill("test@example.com");
    await modal.getByPlaceholder("Full Name as per ID").fill("Test Passenger");
    await modal
      .getByRole("button", { name: "Proceed to Payment", exact: true })
      .click();
    await expect(
      modal.getByRole("heading", {
        name: `Pay ₹${price.amount.toLocaleString("en-IN")} via UPI`,
      }),
    ).toBeVisible();
    await expect(modal).toContainText(
      `₹${price.totalFare.toLocaleString("en-IN")} (tickets) + ₹50 (service fee) = ₹${price.amount.toLocaleString("en-IN")}`,
    );
    expect(requests[0].legs).toHaveLength(3);
    expect(requests[0].fromStationCode).toBe("DEE");
    expect(requests[0].totalFare).toBe(price.totalFare);
    expect(requests[0].legs.map((leg) => leg.travelClass)).toEqual(
      multipleClasses ? ["3A", "2A", "SL"] : ["SL", "SL", "SL"],
    );
    expect(requests[0].legs.map((leg) => leg.fare)).toEqual(
      multipleClasses ? [565, 600, 340] : [385, 385, 340],
    );
    await modal.getByRole("button", { name: /Simulate Payment/ }).click();
    await expect(modal).toContainText(
      `Payment Received (₹${price.amount.toLocaleString("en-IN")})`,
    );
    for (const pnr of pnrs)
      await expect(modal.getByText(pnr, { exact: true })).toBeVisible();
    await expect(modal).toContainText("Leg 3 PNR:");
  });
}
