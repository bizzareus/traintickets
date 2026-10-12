import { expect, test as base, type Locator } from "@playwright/test";
import type {
  AlternateClassOption,
  AlternateLeg,
  AlternatePathsResponse,
  TrainListItem,
} from "../../components/booking-v2/alternatePathsTypes";
import type {
  CreateSplitBookingPayload,
  SplitBookingPaymentResponse,
  SplitBookingStatus,
  CancellationBookingDetails,
} from "../../lib/split-booking";

export const BOOKING_DATE = "2026-11-10";
export const CONTRACT_URL = "http://127.0.0.1:3109";
export const PASSENGER = {
  name: "Test Passenger",
  age: 30,
  gender: "Male",
  berthPreference: "No Preference",
  optBerth: true,
  foodChoice: "Veg",
  seniorCitizen: false,
} as const;

export function classOption(
  travelClass = "SL",
  fare: number | null = 580,
): AlternateClassOption {
  return {
    travelClass,
    fare,
    availabilityDisplayName: "AVL 12",
    railDataStatus: "AVAILABLE-0012",
    availablityStatus: null,
    predictionPercentage: null,
  };
}

export function bookingLeg(
  from = "CYI",
  to = "GOY",
  options = [classOption()],
): AlternateLeg {
  return {
    ...options[0],
    from,
    to,
    segmentKind: "confirmed",
    confirmedClassOptions: options,
    boardingDate: BOOKING_DATE,
    departureTime: "10:00",
    arrivalTime: "14:00",
    durationMinutes: 240,
  };
}

export const TWO_LEGS = [
  bookingLeg("CYI", "VGLJ"),
  bookingLeg("VGLJ", "GOY", [classOption("SL", 400)]),
];

export function alternateResult(legs: AlternateLeg[]): AlternatePathsResponse {
  const confirmed = legs.filter((leg) => leg.segmentKind === "confirmed");
  return {
    trainNumber: "09065",
    legs,
    totalFare: confirmed.reduce((sum, leg) => sum + (leg.fare ?? 0), 0),
    legCount: confirmed.length,
    isComplete: confirmed.length === legs.length,
    stationCodesOnRoute: [legs[0].from, ...legs.map((leg) => leg.to)],
    stationNameMap: { CYI: "Chittorgarh", VGLJ: "Jhansi", GOY: "Govindpuri" },
  };
}

export type TestHttpError = { status: number; message: string | string[] };
export interface BookingState {
  requests: CreateSplitBookingPayload[];
  checkout: SplitBookingPaymentResponse;
  status: Partial<SplitBookingStatus>;
  statusRequests: string[];
  statusFailures: number;
  statusHandler?: (ref: string) => Promise<Partial<SplitBookingStatus>>;
  createError?: TestHttpError;
  createGate?: Promise<void>;
  createTransform?: (payload: CreateSplitBookingPayload) => unknown;
  abortCreate: boolean;
  cancellation?: CancellationBookingDetails;
  cancellationRequests: unknown[];
  cancellationError?: TestHttpError;
  existingCancellation: boolean;
}

export interface BookingHarness {
  state: BookingState;
  open: (options?: {
    direct?: boolean;
    legs?: AlternateLeg[];
    flag?: boolean;
    admin?: boolean;
    actualFlag?: boolean;
    classes?: string[];
  }) => Promise<void>;
  fill: (
    values?: Partial<{
      name: string;
      age: string;
      email: string;
      mobile: string;
    }>,
  ) => Promise<void>;
  submit: () => Promise<void>;
  details: () => Locator;
  classes: () => Locator;
}

export const test = base.extend<{ booking: BookingHarness }>({
  booking: async ({ page, request }, provide) => {
    const state: BookingState = {
      requests: [],
      checkout: {
        bookingRef: "LB-TEST",
        bookingMode: "AI",
        totalFare: 980,
        irctcServiceFee: 35.4,
        serviceFee: 80,
        paymentGatewayFee: 32.86,
        amount: 1128.26,
        payUrl: "https://muzobox.com/pay/mb_test?source=reservation",
      },
      status: {},
      statusRequests: [],
      statusFailures: 0,
      abortCreate: false,
      cancellationRequests: [],
      existingCancellation: false,
    };
    let path = alternateResult(TWO_LEGS);
    let train: TrainListItem = {
      trainNumber: "09065",
      trainName: "TEST EXPRESS",
      fromStnCode: "CYI",
      toStnCode: "GOY",
      departureTime: "10:00",
      arrivalTime: "14:00",
      duration: 240,
      avlClasses: ["SL"],
      availabilityCache: {
        SL: { fare: "980", availabilityDisplayName: "WL 15" },
      },
      cachedAlternatePath: path,
    };
    const unexpected: string[] = [];
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.clock.setFixedTime(new Date("2026-10-12T06:00:00Z"));
    // Ads, telemetry and remote scripts are unrelated to checkout. Payment iframe
    // requests are handled by the more-specific local fixture below.
    await page.route("https://**/*", (route) => route.abort());
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
        await route.abort();
        return;
      }
      const pathname = url.pathname;
      const fulfill = (options: Parameters<typeof route.fulfill>[0]) =>
        route.fulfill({
          ...options,
          headers: {
            "access-control-allow-origin": "http://localhost:3110",
            "access-control-allow-credentials": "true",
            "access-control-allow-headers": "content-type, authorization",
            "access-control-allow-methods": "GET, POST, OPTIONS",
            ...options?.headers,
          },
        });
      if (route.request().method() === "OPTIONS") {
        await fulfill({ status: 204 });
        return;
      }
      const fail = (error: TestHttpError) =>
        fulfill({
          status: error.status,
          json: { statusCode: error.status, message: error.message },
        });
      if (pathname === "/api/booking-v2/stations/suggest") {
        await fulfill({
          json: {
            data: {
              stationList: [
                { stationCode: "CYI", stationName: "Chittorgarh" },
                { stationCode: "GOY", stationName: "Govindpuri" },
              ],
            },
          },
        });
        return;
      }
      if (pathname === "/api/booking-v2/trains/search") {
        await fulfill({ json: { data: { trainList: [train] } } });
        return;
      }
      if (pathname === "/api/booking-v2/best-trains/cached") {
        await fulfill({ json: { cached: false } });
        return;
      }
      if (pathname.endsWith("/stations-meta")) {
        await fulfill({ json: { stations: [] } });
        return;
      }
      if (pathname === "/api/booking-v2/alternate-paths/stream") {
        await fulfill({
          contentType: "application/x-ndjson",
          body: JSON.stringify({ type: "result", data: path }) + "\n",
        });
        return;
      }
      if (pathname === "/api/booking-v2/alternate-paths") {
        await fulfill({ json: path });
        return;
      }
      if (pathname === "/api/split-booking/create") {
        const payload = route
          .request()
          .postDataJSON() as CreateSplitBookingPayload;
        state.requests.push(payload);
        if (state.createGate) await state.createGate;
        if (state.abortCreate) {
          await route.abort("connectionfailed");
          return;
        }
        if (state.createError) {
          await fail(state.createError);
          return;
        }
        // The REAL browser payload crosses Nest's production validation boundary.
        const response = await request.post(CONTRACT_URL + pathname, {
          data: state.createTransform
            ? state.createTransform(payload)
            : payload,
        });
        const body = await response.json();
        if (response.ok()) state.checkout = body as SplitBookingPaymentResponse;
        await fulfill({ status: response.status(), json: body });
        return;
      }
      if (pathname.startsWith("/api/split-booking/status/")) {
        const ref = pathname.split("/").pop()!;
        state.statusRequests.push(ref);
        if (state.statusFailures > 0) {
          state.statusFailures--;
          await fail({ status: 503, message: "Temporary status failure" });
          return;
        }
        const extra = state.statusHandler
          ? await state.statusHandler(ref)
          : state.status;
        await fulfill({
          json: {
            ...state.checkout,
            bookingRef: ref,
            paymentStatus: "PENDING",
            bookingStatus: "IDLE",
            pnrs: [],
            logs: [],
            paidAt: null,
            ...extra,
          },
        });
        return;
      }
      if (pathname === "/api/split-booking/cancellation/lookup") {
        if (state.cancellationError) {
          await fail(state.cancellationError);
          return;
        }
        await fulfill({
          json: {
            bookingRef: "LB-TEST",
            trainNumber: "09065",
            trainName: "TEST EXPRESS",
            fromStationCode: "CYI",
            toStationCode: "GOY",
            journeyDate: BOOKING_DATE,
            travelClass: "SL",
            quota: "GN",
            totalFare: 980,
            irctcServiceFee: 35.4,
            serviceFee: 80,
            paymentGatewayFee: 32.86,
            amount: 1128.26,
            passengers: { adults: [PASSENGER] },
            legsPayload: [],
            bookingStatus: "CONFIRMED",
            paymentStatus: "PAID",
            pnrs: ["1234567890"],
            createdAt: "2026-10-12T06:00:00Z",
            ...(state.existingCancellation
              ? {
                  existingCancellation: {
                    id: "CANCEL-TEST",
                    status: "PENDING",
                    createdAt: "2026-10-12T06:00:00Z",
                  },
                }
              : {}),
            ...state.cancellation,
          },
        });
        return;
      }
      if (pathname === "/api/split-booking/cancellation/request") {
        state.cancellationRequests.push(route.request().postDataJSON());
        if (state.cancellationError) {
          await fail(state.cancellationError);
          return;
        }
        await fulfill({
          json: { success: true, requestId: "CANCEL-TEST" },
        });
        return;
      }
      unexpected.push(`${route.request().method()} ${pathname}`);
      await route.abort();
    });
    await page.route("https://muzobox.com/pay/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<button onclick=\"parent.postMessage({type: 'payment_complete', status: 'paid'}, '*')\">Complete test checkout</button>",
      }),
    );
    const details = () =>
      page.getByRole("dialog", {
        name: "Ticket Reservation & Booking",
        exact: true,
      });
    const classes = () =>
      page.getByRole("dialog", {
        name: "Choose classes for your tickets",
        exact: true,
      });
    const open: BookingHarness["open"] = async (options = {}) => {
      const legs = structuredClone(options.legs ?? TWO_LEGS);
      path = alternateResult(legs);
      train = {
        ...train,
        fromStnCode: legs[0].from,
        toStnCode: legs.at(-1)!.to,
        cachedAlternatePath: options.direct ? null : path,
      };
      if (options.direct) {
        const opts = legs[0].confirmedClassOptions ?? [classOption()];
        train = {
          ...train,
          avlClasses: opts.map((o) => o.travelClass),
          availabilityCache: Object.fromEntries(
            opts.map((o) => [
              o.travelClass,
              {
                fare: o.fare == null ? undefined : String(o.fare),
                availabilityDisplayName: "AVL 12",
                railDataStatus: "AVAILABLE-0012",
              },
            ]),
          ),
        };
      }
      await page.addInitScript(
        ({ admin }) => {
          localStorage.clear();
          if (admin) localStorage.setItem("admin", "true");
        },
        { admin: options.admin ?? false },
      );
      await page.goto(
        `/?from=${train.fromStnCode}&to=${train.toStnCode}&date=${BOOKING_DATE}${options.actualFlag ? "" : `&assisted_booking=${options.flag === false ? "0" : "1"}`}${options.classes ? `&classes=${options.classes.join(",")}` : ""}`,
      );
      if (options.actualFlag) {
        await page.waitForFunction(() => Boolean(window.posthog));
        await page.evaluate(
          (flag) =>
            window.posthog?.featureFlags.overrideFeatureFlags({
              flags: { "split-ticket-assisted-booking": flag },
            }),
          options.flag ?? true,
        );
      }
      const search = page.getByRole("button", {
        name: "Search trains",
        exact: true,
      });
      await expect(
        page.getByRole("combobox", { name: "From", exact: true }).first(),
      ).toHaveValue(new RegExp(train.fromStnCode!));
      await search.click();
      if (!options.direct)
        await page
          .getByRole("button", { name: "Select →", exact: true })
          .click();
      if (options.flag !== false)
        await page
          .getByRole("button", { name: "Book Now", exact: true })
          .click();
    };
    await provide({
      state,
      open,
      details,
      classes,
      async fill(values = {}) {
        const form = details();
        await form
          .getByLabel("Mobile Number (10 Digits)")
          .fill(values.mobile ?? "9876543210");
        await form
          .getByLabel("Email Address")
          .fill(values.email ?? "booking@example.com");
        await form.getByLabel("Full Name").fill(values.name ?? PASSENGER.name);
        await form.getByLabel("Age", { exact: false }).fill(values.age ?? "30");
      },
      async submit() {
        await details()
          .getByRole("button", { name: "Proceed to Payment", exact: true })
          .click();
      },
    });
    expect(
      unexpected,
      "Unexpected API requests must never fall through to a real provider",
    ).toEqual([]);
    expect(pageErrors, "Unexpected browser runtime errors").toEqual([]);
  },
});

export { expect };
