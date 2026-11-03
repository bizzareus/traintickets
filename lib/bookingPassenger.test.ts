import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  BOOKING_PASSENGER_STORAGE_KEY,
  createDefaultPassenger,
  getStoredBookingPassenger,
  saveStoredBookingPassenger,
} from "./bookingPassenger";

describe("device-local booking passenger", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  let values: Map<string, string>;
  beforeEach(() => {
    values = new Map();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      } },
    });
  });
  afterEach(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });

  const passenger = { ...createDefaultPassenger(), name: "Test Passenger", age: 42 };

  test("round-trips the passenger and whitelists fields rather than saving a booking payload", () => {
    const input = { ...passenger, paymentToken: "must-not-be-saved", bookingRef: "LB-TEST" };
    saveStoredBookingPassenger(input);
    assert.deepEqual(getStoredBookingPassenger(), passenger);
    assert.deepEqual(JSON.parse(values.get(BOOKING_PASSENGER_STORAGE_KEY)!), passenger);
  });

  test("missing and invalid JSON do not break prefill", () => {
    assert.equal(getStoredBookingPassenger(), null);
    for (const value of ["{broken", "null", "[]", '"wrong"', "{}", JSON.stringify({ ...passenger, age: -5 }), JSON.stringify({ ...passenger, gender: "wrong" })]) {
      values.set(BOOKING_PASSENGER_STORAGE_KEY, value);
      assert.equal(getStoredBookingPassenger(), null);
    }
  });

  test("invalid drafts do not replace a valid saved passenger", () => {
    saveStoredBookingPassenger(passenger);
    saveStoredBookingPassenger({ ...passenger, age: 0 });
    assert.deepEqual(getStoredBookingPassenger(), passenger);
  });

  test("unsupported preferences fall back to valid defaults", () => {
    values.set(BOOKING_PASSENGER_STORAGE_KEY, JSON.stringify({ ...passenger, foodChoice: "unknown", berthPreference: "unknown" }));
    assert.equal(getStoredBookingPassenger()?.foodChoice, "Veg");
    assert.equal(getStoredBookingPassenger()?.berthPreference, "No Preference");
  });

  test("SSR and blocked localStorage are safe", () => {
    Reflect.deleteProperty(globalThis, "window");
    assert.equal(getStoredBookingPassenger(), null);
    assert.doesNotThrow(() => saveStoredBookingPassenger(passenger));
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { get localStorage() { throw new Error("Storage disabled"); } },
    });
    assert.equal(getStoredBookingPassenger(), null);
    assert.doesNotThrow(() => saveStoredBookingPassenger(passenger));
  });
});
