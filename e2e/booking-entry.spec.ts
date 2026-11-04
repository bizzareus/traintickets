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

test("refreshes leg counts concurrently, renders partial responses and waits before continuing", async ({ booking }, testInfo) => {
  let releaseFirst!: () => void;
  let releaseSecond!: () => void;
  const firstReady = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const secondReady = new Promise<void>((resolve) => { releaseSecond = resolve; });
  booking.state.availabilityHandler = async (payload) => {
    const first = payload.legs[0].from === "CYI";
    await (first ? firstReady : secondReady);
    return {
      available: true,
      legs: payload.legs.map((leg) => ({ ...leg, trainNumber: leg.trainNumber ?? payload.trainNumber, status: first ? "AVL 7" : "AVL 3", isConfirmed: true })),
    };
  };
  try {
    await booking.open({ legs: [
      { ...mixed[0], trainNumber: "12302" },
      { ...mixed[1], trainNumber: "12318", boardingDate: "2026-11-11" },
    ] });
    const selector = booking.classes();
    await expect(selector.getByText("Refreshing seat count", { exact: true })).toHaveCount(2);
    await selector.screenshot({ path: testInfo.outputPath("refreshing-seat-count.png") });
    await expect.poll(() => new Set(booking.state.availabilityRequests.map((request) => request.trainNumber)).size).toBe(2);
    const second = booking.state.availabilityRequests.find((request) => request.trainNumber === "12318")!;
    expect(second.legs[0].boardingDate).toBe("2026-11-11");
    expect(second.legs[0].trainNumber).toBe("12318");
    await selector.getByRole("radio", { name: /^Leg 1: SL/ }).check();
    await expect(selector.getByRole("button", { name: "Continue to passenger details" })).toBeDisabled();
    releaseFirst();
    await expect(selector.locator("fieldset").first().getByText("AVL 7")).toHaveCount(2);
    await expect(selector.getByText("Refreshing seat count", { exact: true })).toHaveCount(1);
    releaseSecond();
    await expect(selector.getByText("Refreshing seat count", { exact: true })).toHaveCount(0);
    await expect(selector.locator("fieldset").last()).toContainText("AVL 3");
    await expect(selector.getByRole("button", { name: "Continue to passenger details" })).toBeEnabled();
  } finally {
    releaseFirst();
    releaseSecond();
  }
});

test("a live waitlist invalidates a cached class selection without discarding its fare", async ({ booking }) => {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  booking.state.availabilityHandler = async (payload) => {
    await ready;
    return {
      available: false,
      legs: payload.legs.map((leg) => ({ ...leg, trainNumber: leg.trainNumber ?? payload.trainNumber, status: leg.travelClass === "3A" ? "WL 22" : "AVL 7", isConfirmed: leg.travelClass !== "3A" })),
    };
  };
  try {
    await booking.open({ legs: mixed });
    const selector = booking.classes();
    const staleClass = selector.getByRole("radio", { name: /^Leg 1: 3A/ });
    await staleClass.check();
    release();
    await expect(staleClass).toBeDisabled();
    await expect(staleClass).not.toBeChecked();
    await expect(selector.locator("fieldset").first()).toContainText("WL 22");
    await expect(selector.getByRole("button", { name: "Continue to passenger details" })).toBeDisabled();
    await selector.getByRole("radio", { name: /^Leg 1: SL/ }).check();
    await expect(selector.getByRole("button", { name: "Continue to passenger details" })).toBeEnabled();
    await expect(selector.getByRole("status", { name: "Selected ticket fare" })).toContainText("₹980");
  } finally { release(); }
});

test("failed refresh retains cached counts, does not hide other responses, and can be retried", async ({ booking }) => {
  let fail = true;
  booking.state.availabilityHandler = async (payload) => ({
    available: !fail,
    legs: payload.legs.map((leg) => ({ ...leg, trainNumber: leg.trainNumber ?? payload.trainNumber, status: fail && leg.from === "CYI" ? "CHECK_FAILED" : "AVL 4", isConfirmed: !(fail && leg.from === "CYI") })),
  });
  await booking.open({ legs: mixed });
  const selector = booking.classes();
  await expect(selector.getByText(/Couldn’t refresh seat count/)).toBeVisible();
  await expect(selector.locator("fieldset").first()).toContainText("AVL 12");
  await expect(selector.locator("fieldset").last()).toContainText("AVL 4");
  fail = false;
  await selector.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(selector.getByText(/Couldn’t refresh seat count/)).toHaveCount(0);
  await expect(selector.locator("fieldset").first().getByText("AVL 4")).toHaveCount(2);
});

test("closing the chooser cancels refresh requests and reopening ignores stale responses", async ({ booking, page }) => {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  let aborted = 0;
  page.on("requestfailed", (request) => {
    if (request.url().endsWith("/api/split-booking/check-availability")) aborted++;
  });
  booking.state.availabilityHandler = async (payload) => {
    await ready;
    return {
      available: true,
      legs: payload.legs.map((leg) => ({ ...leg, trainNumber: leg.trainNumber ?? payload.trainNumber, status: "AVL 99", isConfirmed: true })),
    };
  };
  try {
    await booking.open({ legs: mixed });
    await expect.poll(() => booking.state.availabilityRequests.length).toBeGreaterThanOrEqual(2);
    await booking.classes().getByRole("button", { name: "Close class selection" }).click();
    await expect.poll(() => aborted).toBeGreaterThanOrEqual(2);
    release();
    booking.state.availabilityHandler = async (payload) => ({
      available: true,
      legs: payload.legs.map((leg) => ({ ...leg, trainNumber: leg.trainNumber ?? payload.trainNumber, status: "AVL 6", isConfirmed: true })),
    });
    await page.getByRole("button", { name: "Book Now", exact: true }).click();
    await expect(booking.classes().getByText("AVL 6", { exact: true })).toHaveCount(3);
    await expect(booking.classes().getByText("AVL 99", { exact: true })).toHaveCount(0);
  } finally { release(); }
});

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
    const nonAcClasses = new Set(["SL", "2S", "GN", "FC"]);
    const expectedServiceFee = payload.legs.reduce(
      (sum, leg) => sum + (nonAcClasses.has(leg.travelClass) ? 20 : 40),
      0,
    );
    expect(booking.state.checkout.serviceFee).toBe(expectedServiceFee);
    const irctcSubtotalPaise = Math.round(
      (payload.totalFare +
        booking.state.checkout.irctcServiceFee +
        (booking.state.checkout.travelInsuranceFee ?? 0)) *
        100,
    );
    const expectedPgFeePaise = Math.round(irctcSubtotalPaise * 0.0118);
    expect(booking.state.checkout.paymentGatewayFee).toBe(
      expectedPgFeePaise / 100,
    );
    expect(booking.state.checkout.amount).toBe(
      Number(
        (
          (irctcSubtotalPaise +
            expectedPgFeePaise +
            booking.state.checkout.serviceFee * 100) /
          100
        ).toFixed(2),
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
    booking.details().getByRole("heading", { name: /^Pay ₹463/ }),
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
    booking.details().getByRole("heading", { name: /^Pay ₹784/ }),
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
