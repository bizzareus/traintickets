import {
  test,
  expect,
  bookingLeg,
  classOption,
  TWO_LEGS,
  BOOKING_DATE,
} from "./fixtures/booking-engine";

test("November 11 stays selected when the calendar input regains focus", async ({
  page,
  booking,
}) => {
  await page.goto("/?date=2026-10-12");
  const input = page.getByRole("textbox", { name: /departure date/i });
  await expect(input).toHaveValue("Monday, Oct 12");
  await input.click();
  const calendar = input.locator("..");
  await calendar.locator(".next-btn").click();
  await expect(calendar.locator(".view-switch")).toHaveText("November 2026");
  const november11 = await page.evaluate(() =>
    new Date(2026, 10, 11).getTime(),
  );
  await calendar.locator(`[data-date="${november11}"]`).click();
  await expect(input).toHaveValue("Wednesday, Nov 11");
  await page.getByRole("heading", { level: 1 }).click();
  await input.click();
  await expect(input).toHaveValue("Wednesday, Nov 11");
  await expect(calendar.locator(".view-switch")).toHaveText("November 2026");
  expect(booking.state.requests).toHaveLength(0);
});

test("the 60th day unlocks at 8 AM IST after refocusing the calendar", async ({
  page,
  booking,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-12T02:29:00Z"));
  await page.goto("/?date=2026-12-10");
  const input = page.getByRole("textbox", { name: /departure date/i });
  await expect(input).toHaveValue("Thursday, Dec 10");
  await input.click();
  const calendar = input.locator("..");
  const [december11, december12] = await page.evaluate(() => [
    new Date(2026, 11, 11).getTime(),
    new Date(2026, 11, 12).getTime(),
  ]);
  await expect(calendar.locator(`[data-date="${december11}"]`)).toHaveClass(
    /disabled/,
  );
  await page.getByRole("heading", { level: 1 }).click();
  await page.clock.setFixedTime(new Date("2026-10-12T02:30:00Z"));
  await input.click();
  await expect(calendar.locator(`[data-date="${december11}"]`)).not.toHaveClass(
    /disabled/,
  );
  await expect(calendar.locator(`[data-date="${december12}"]`)).toHaveClass(
    /disabled/,
  );
  await calendar.locator(`[data-date="${december11}"]`).click();
  await expect(input).toHaveValue("Friday, Dec 11");
  expect(booking.state.requests).toHaveLength(0);
});

const mixed = [
  bookingLeg("CYI", "VGLJ", [classOption("SL", 580), classOption("3A", 700)]),
  bookingLeg("VGLJ", "GOY", [classOption("SL", 400)]),
];

for (const scenario of [
  { name: "direct ticket, one class", direct: true, legs: [bookingLeg()] },
  {
    name: "direct ticket, class choice",
    direct: true,
    legs: [
      bookingLeg("CYI", "GOY", [
        classOption("SL", 580),
        classOption("3A", 700),
      ]),
    ],
    choose: true,
  },
  { name: "two split tickets", legs: TWO_LEGS },
  {
    name: "three mixed-class tickets",
    legs: [
      bookingLeg("CYI", "AAA", [classOption("3A", 565)]),
      bookingLeg("AAA", "BBB", [classOption("2A", 600)]),
      bookingLeg("BBB", "GOY", [classOption("SL", 340)]),
    ],
  },
  {
    name: "unavailable middle stretch",
    legs: [
      bookingLeg("CYI", "AAA"),
      {
        ...bookingLeg("AAA", "BBB"),
        segmentKind: "check_realtime" as const,
        travelClass: null,
        fare: null,
        confirmedClassOptions: [],
      },
      bookingLeg("BBB", "GOY", [classOption("CC", 400)]),
    ],
  },
  {
    name: "overnight boarding dates",
    legs: [TWO_LEGS[0], { ...TWO_LEGS[1], boardingDate: "2026-11-11" }],
  },
]) {
  test(`checkout accepts ${scenario.name}`, async ({ booking }) => {
    await booking.open(scenario);
    if ("choose" in scenario) {
      await booking
        .classes()
        .getByRole("radio", { name: /^Leg 1: 3A/ })
        .check();
      await booking
        .classes()
        .getByRole("button", { name: "Continue to passenger details" })
        .click();
    }
    await booking.fill();
    await booking.submit();
    await expect(
      booking.details().getByRole("heading", { name: /^Pay ₹/ }),
    ).toBeVisible();
    expect(booking.state.requests).toHaveLength(1);
    const payload = booking.state.requests[0];
    const confirmed = scenario.legs.filter(
      (leg) => leg.segmentKind === "confirmed",
    );
    expect(payload.legs).toHaveLength(confirmed.length);
    expect(payload.fromStationCode).toBe(confirmed[0].from);
    expect(payload.toStationCode).toBe(confirmed.at(-1)!.to);
    expect(payload.journeyDate).toBe(BOOKING_DATE);
    expect(payload.legs.map((leg) => leg.boardingDate)).toEqual(
      confirmed.map((leg) => leg.boardingDate),
    );
    expect(payload.legs.every((leg) => leg.availability === "AVL 12")).toBe(
      true,
    );
    expect(payload.totalFare).toBe(
      payload.legs.reduce((sum, leg) => sum + leg.fare, 0),
    );
    expect(booking.state.checkout.serviceFee).toBe(payload.legs.length * 40);
    // The chargeable total is the exact paise sum rounded once to whole rupees.
    expect(Number.isInteger(booking.state.checkout.amount)).toBe(true);
    expect(booking.state.checkout.amount).toBe(
      Math.round(
        Math.round(
          (payload.totalFare +
            booking.state.checkout.serviceFee +
            booking.state.checkout.irctcServiceFee) *
            100 +
            booking.state.checkout.paymentGatewayFee * 100,
        ) / 100,
      ),
    );
  });
}

for (const skip of [0, 1, 2]) {
  test(`skip ticket ${skip + 1} updates submitted route and fare`, async ({
    booking,
  }) => {
    const legs = [
      mixed[0],
      bookingLeg("VGLJ", "BBB"),
      { ...bookingLeg("BBB", "GOY"), boardingDate: "2026-11-11" },
    ];
    await booking.open({ legs });
    const selector = booking.classes();
    if (skip !== 0)
      await selector.getByRole("radio", { name: /^Leg 1: 3A/ }).check();
    await selector
      .getByRole("radio", {
        name: `Leg ${skip + 1}: Skip this leg`,
        exact: true,
      })
      .check();
    await selector
      .getByRole("button", { name: "Continue to passenger details" })
      .click();
    await booking.fill();
    await booking.submit();
    await expect(
      booking.details().getByRole("heading", { name: /^Pay ₹/ }),
    ).toBeVisible();
    const payload = booking.state.requests[0];
    const remaining = legs.filter((_leg, index) => index !== skip);
    expect(payload.legs.map((leg) => [leg.from, leg.to])).toEqual(
      remaining.map((leg) => [leg.from, leg.to]),
    );
    expect(payload.fromStationCode).toBe(remaining[0].from);
    expect(payload.toStationCode).toBe(remaining.at(-1)!.to);
    expect(payload.journeyDate).toBe(remaining[0].boardingDate);
  });
}

test("skip all blocks continuation; retaining one ticket is bookable", async ({
  booking,
}) => {
  await booking.open({ legs: mixed });
  const selector = booking.classes();
  for (const i of [1, 2])
    await selector
      .getByRole("radio", { name: `Leg ${i}: Skip this leg`, exact: true })
      .check();
  await expect(
    selector.getByRole("button", { name: "Continue to passenger details" }),
  ).toBeDisabled();
  expect(booking.state.requests).toHaveLength(0);
  await selector.getByRole("radio", { name: /^Leg 2: SL/ }).check();
  await selector
    .getByRole("button", { name: "Continue to passenger details" })
    .click();
  await booking.fill();
  await booking.submit();
  await expect(
    booking.details().getByRole("heading", { name: /^Pay ₹471/ }),
  ).toBeVisible();
  expect(booking.state.requests[0].legs).toHaveLength(1);
});

test("unquoted class cannot be selected or submitted", async ({ booking }) => {
  await booking.open({
    legs: [
      bookingLeg("CYI", "GOY", [
        classOption("SL", null),
        classOption("3A", 700),
      ]),
    ],
  });
  await expect(
    booking.classes().getByRole("radio", { name: /SL, fare unavailable/ }),
  ).toBeDisabled();
  await expect(
    booking
      .classes()
      .getByRole("button", { name: "Continue to passenger details" }),
  ).toBeDisabled();
  expect(booking.state.requests).toHaveLength(0);
});

test("closing and reopening class selection discards old choices", async ({
  booking,
  page,
}) => {
  await booking.open({ legs: mixed });
  await booking
    .classes()
    .getByRole("radio", { name: /^Leg 1: 3A/ })
    .check();
  await booking
    .classes()
    .getByRole("button", { name: "Close class selection" })
    .click();
  await page.getByRole("button", { name: "Book Now", exact: true }).click();
  await expect(
    booking
      .classes()
      .getByRole("button", { name: "Continue to passenger details" }),
  ).toBeDisabled();
});

test("new search replaces selected classes and fares", async ({ booking }) => {
  await booking.open({ legs: mixed });
  await booking
    .classes()
    .getByRole("radio", { name: /^Leg 1: 3A/ })
    .check();
  await booking.open({
    legs: [
      bookingLeg("CYI", "GOY", [
        classOption("2A", 800),
        classOption("3A", 650),
      ]),
    ],
  });
  await expect(
    booking
      .classes()
      .getByRole("button", { name: "Continue to passenger details" }),
  ).toBeDisabled();
  await booking
    .classes()
    .getByRole("radio", { name: /^Leg 1: 3A/ })
    .check();
  await expect(booking.classes().getByRole("status")).toContainText("₹650");
});

test("direct class filter restricts booking options", async ({ booking }) => {
  await booking.open({
    direct: true,
    classes: ["3A"],
    legs: [
      bookingLeg("CYI", "GOY", [
        classOption("SL", 580),
        classOption("3A", 700),
      ]),
    ],
  });
  await booking.fill();
  await booking.submit();
  await expect(
    booking.details().getByRole("heading", { name: /^Pay ₹799/ }),
  ).toBeVisible();
  expect(booking.state.requests[0].travelClass).toBe("3A");
});

for (const admin of [false, true]) {
  test(`PostHog flag off prevents internal checkout, admin=${admin}`, async ({
    booking,
    page,
  }) => {
    await booking.open({ flag: false, actualFlag: true, admin });
    await expect(
      page.getByRole("button", { name: "Book Now", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Book Now", exact: true }).first(),
    ).toBeVisible();
    expect(booking.state.requests).toHaveLength(0);
  });
}

test("PostHog flag on enables checkout without testing URL or admin overrides", async ({
  booking,
}) => {
  await booking.open({ actualFlag: true });
  await booking.fill();
  await booking.submit();
  await expect(
    booking.details().getByRole("heading", { name: /^Pay ₹/ }),
  ).toBeVisible();
});

test("direct flag-off uses the external IRCTC fallback", async ({
  booking,
  page,
}) => {
  await booking.open({ direct: true, legs: [bookingLeg()], flag: false });
  await expect(page.getByRole("link", { name: /Book IRCTC/ })).toHaveAttribute(
    "href",
    /irctc\.co\.in/,
  );
  expect(booking.state.requests).toHaveLength(0);
});
