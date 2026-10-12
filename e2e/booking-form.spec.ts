import {
  test,
  expect,
  PASSENGER,
  BOOKING_DATE,
} from "./fixtures/booking-engine";

test("default form submits the complete browser payload accepted by Nest", async ({
  booking,
}) => {
  await booking.open();
  await booking.fill();
  await booking.submit();
  await expect(
    booking
      .details()
      .getByRole("heading", { name: "Pay ₹1,128.00", exact: true }),
  ).toBeVisible();
  expect(booking.state.requests[0]).toEqual({
    trainNumber: "09065",
    trainName: "TEST EXPRESS",
    fromStationCode: "CYI",
    toStationCode: "GOY",
    journeyDate: BOOKING_DATE,
    travelClass: "SL",
    quota: "GN",
    totalFare: 980,
    legs: [
      {
        from: "CYI",
        to: "VGLJ",
        travelClass: "SL",
        fare: 580,
        boardingDate: BOOKING_DATE,
        departureTime: "10:00",
        arrivalTime: "14:00",
        durationMinutes: 240,
        availability: "AVL 12",
      },
      {
        from: "VGLJ",
        to: "GOY",
        travelClass: "SL",
        fare: 400,
        boardingDate: BOOKING_DATE,
        departureTime: "10:00",
        arrivalTime: "14:00",
        durationMinutes: 240,
        availability: "AVL 12",
      },
    ],
    passengers: [PASSENGER],
    childPassengers: [],
    autoUpgrade: true,
    confirmBerthsOnly: false,
    travelInsurance: true,
    contactMobile: "9876543210",
    contactEmail: "booking@example.com",
  });
});

const berths = [
  "No Preference",
  "Lower",
  "Middle",
  "Upper",
  "Side Lower",
  "Side Upper",
  "Window Side",
];
const genders = ["Male", "Female", "Transgender"];
const foods = ["Veg", "Non-Veg", "No Food"];
for (const [i, berth] of berths.entries()) {
  test(`form options: ${berth}, ${genders[i % 3]}, ${foods[i % 3]}`, async ({
    booking,
  }) => {
    await booking.open();
    await booking.fill();
    const form = booking.details();
    await form
      .getByLabel("Berth Preference", { exact: true })
      .selectOption(berth);
    await form
      .getByLabel("Gender", { exact: false })
      .selectOption(genders[i % 3]);
    await form
      .getByLabel("Food Choice", { exact: true })
      .selectOption(foods[i % 3]);
    await booking.submit();
    await expect(form.getByRole("heading", { name: /^Pay ₹/ })).toBeVisible();
    expect(booking.state.requests[0].passengers[0]).toMatchObject({
      berthPreference: berth,
      gender: genders[i % 3],
      foodChoice: foods[i % 3],
    });
  });
}

// Eight orthogonal cases cover every on/off value for every PAIR of five toggles.
for (let i = 0; i < 8; i++) {
  const a = Boolean(i & 1),
    b = Boolean(i & 2),
    c = Boolean(i & 4);
  const prefs = {
    optBerth: a,
    seniorCitizen: b,
    autoUpgrade: c,
    confirmBerthsOnly: a !== b,
    travelInsurance: a !== c,
  };
  test(`preference switch pairwise combination ${i + 1}`, async ({
    booking,
  }) => {
    await booking.open();
    await booking.fill({ age: "65" });
    const form = booking.details();
    await form
      .getByRole("checkbox", { name: "Opt Berth (Allot seat/berth)" })
      .setChecked(prefs.optBerth);
    await form
      .getByRole("checkbox", {
        name: "Senior Citizen concession (if applicable)",
      })
      .setChecked(prefs.seniorCitizen);
    await form
      .getByRole("checkbox", { name: "Consider for Auto-Upgradation" })
      .setChecked(prefs.autoUpgrade);
    await form
      .getByRole("checkbox", {
        name: "Book only if confirm berths are allotted",
      })
      .setChecked(prefs.confirmBerthsOnly);
    await form
      .getByRole("radio", {
        name: prefs.travelInsurance
          ? /Yes, accept insurance/
          : /No, do not add insurance/,
      })
      .check();
    await booking.submit();
    await expect(form.getByRole("heading", { name: /^Pay ₹/ })).toBeVisible();
    const payload = booking.state.requests[0];
    expect(payload).toMatchObject({
      autoUpgrade: prefs.autoUpgrade,
      confirmBerthsOnly: prefs.confirmBerthsOnly,
      travelInsurance: prefs.travelInsurance,
    });
    expect(payload.passengers[0]).toMatchObject({
      optBerth: prefs.optBerth,
      seniorCitizen: prefs.seniorCitizen,
    });
  });
}

test("normalizes contact, passenger name and optional coach without losing selections", async ({
  booking,
}) => {
  await booking.open();
  await booking.fill({
    name: "  Test Passenger  ",
    mobile: "+91 98765-43210",
    email: "  booking@example.com  ",
  });
  await booking.details().getByLabel("Preferred Coach").fill(" b1 ");
  await booking.submit();
  await expect(
    booking.details().getByRole("heading", { name: /^Pay ₹/ }),
  ).toBeVisible();
  expect(booking.state.requests[0]).toMatchObject({
    preferredCoach: "B1",
    contactMobile: "9876543210",
    contactEmail: "booking@example.com",
  });
  expect(booking.state.requests[0].passengers[0].name).toBe("Test Passenger");
});

for (const age of [5, 125]) {
  test(`valid age boundary ${age} reaches checkout`, async ({ booking }) => {
    await booking.open();
    await booking.fill({ age: String(age) });
    await booking.submit();
    await expect(
      booking.details().getByRole("heading", { name: /^Pay ₹/ }),
    ).toBeVisible();
    expect(booking.state.requests[0].passengers[0].age).toBe(age);
  });
}

for (const scenario of [
  { name: "empty name", values: { name: "" }, field: "Full Name" },
  { name: "whitespace name", values: { name: "   " }, message: /valid name/ },
  { name: "one-character name", values: { name: "A" }, message: /valid name/ },
  { name: "empty email", values: { email: "" }, field: "Email Address" },
  {
    name: "malformed email",
    values: { email: "invalid" },
    field: "Email Address",
  },
  {
    name: "incomplete email",
    values: { email: "test@" },
    field: "Email Address",
  },
  {
    name: "email without domain suffix",
    values: { email: "test@example" },
    message: /valid email/,
  },
  { name: "empty mobile", values: { mobile: "" }, field: "Mobile Number" },
  {
    name: "short mobile",
    values: { mobile: "98765" },
    message: /valid 10-digit/,
  },
  {
    name: "invalid mobile prefix",
    values: { mobile: "1234567890" },
    message: /valid 10-digit/,
  },
  {
    name: "extra leading digits",
    values: { mobile: "55559876543210" },
    message: /valid 10-digit/,
  },
  {
    name: "letters in mobile",
    values: { mobile: "abcdefghij" },
    message: /valid 10-digit/,
  },
  { name: "age below minimum", values: { age: "4" }, field: "Age" },
  { name: "age above maximum", values: { age: "126" }, field: "Age" },
  { name: "empty age", values: { age: "" }, field: "Age" },
]) {
  test(`rejects ${scenario.name} without creating checkout`, async ({
    booking,
  }) => {
    await booking.open();
    await booking.fill(scenario.values);
    await booking.submit();
    if ("field" in scenario)
      expect(
        await booking
          .details()
          .getByLabel(scenario.field!)
          .evaluate((el: HTMLInputElement) => el.validity.valid),
      ).toBe(false);
    if ("message" in scenario)
      await expect(
        booking.details().getByText(scenario.message!),
      ).toBeVisible();
    expect(booking.state.requests).toHaveLength(0);
    await expect(
      booking.details().getByRole("button", { name: "Proceed to Payment" }),
    ).toBeEnabled();
  });
}

test("only one passenger and no infant inputs are offered", async ({
  booking,
}) => {
  await booking.open();
  await expect(booking.details()).toContainText("Single Passenger (1 Max)");
  await expect(booking.details().getByLabel("Full Name")).toHaveCount(1);
  await expect(
    booking.details().getByRole("button", { name: /Add Passenger|Add Child/ }),
  ).toHaveCount(0);
});
