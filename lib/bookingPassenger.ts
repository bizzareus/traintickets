import type { SplitBookingPassenger } from "@/lib/split-booking";

export const BOOKING_PASSENGER_STORAGE_KEY = "lastBerth_booking_passenger";
export const BERTH_OPTIONS = [
  "No Preference",
  "Lower",
  "Middle",
  "Upper",
  "Side Lower",
  "Side Upper",
  "Window Side",
] as const;
export const FOOD_OPTIONS = ["Veg", "Non-Veg", "No Food"] as const;

export const createDefaultPassenger = (): SplitBookingPassenger => ({
  name: "",
  age: 30,
  gender: "Male",
  berthPreference: "No Preference",
  optBerth: true,
  foodChoice: "Veg",
  seniorCitizen: false,
});

function parsePassenger(value: unknown): SplitBookingPassenger | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const gender = (["Male", "Female", "Transgender"] as const).find(
    (candidate) => candidate === data.gender,
  );
  if (
    typeof data.name !== "string" ||
    data.name.trim().length < 2 ||
    typeof data.age !== "number" ||
    !Number.isInteger(data.age) ||
    data.age < 5 ||
    data.age > 125 ||
    !gender
  ) {
    return null;
  }
  return {
    name: data.name,
    age: data.age,
    gender,
    berthPreference:
      BERTH_OPTIONS.find((option) => option === data.berthPreference) ??
      "No Preference",
    foodChoice:
      FOOD_OPTIONS.find((option) => option === data.foodChoice) ?? "Veg",
    optBerth: typeof data.optBerth === "boolean" ? data.optBerth : true,
    seniorCitizen:
      typeof data.seniorCitizen === "boolean" ? data.seniorCitizen : false,
  };
}

/** Device-local passenger profile only; never store booking or payment payloads here. */
export function getStoredBookingPassenger(): SplitBookingPassenger | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(BOOKING_PASSENGER_STORAGE_KEY);
    return raw ? parsePassenger(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveStoredBookingPassenger(
  passenger: SplitBookingPassenger,
): void {
  try {
    if (typeof window === "undefined") return;
    const safe = parsePassenger(passenger);
    if (safe) {
      window.localStorage.setItem(
        BOOKING_PASSENGER_STORAGE_KEY,
        JSON.stringify(safe),
      );
    }
  } catch {
    // Disabled storage or a full quota must never prevent a booking.
  }
}
