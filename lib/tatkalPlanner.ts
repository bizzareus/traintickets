/**
 * Tatkal Booking Logic, Timezone Calculations, and Surcharges for Indian Railways
 * All railway timings operate strictly under Indian Standard Time (IST: UTC+5:30).
 */

export type ClassCategory = "AC" | "NON_AC";

export type TatkalClassCode = "1A" | "2A" | "3A" | "3E" | "CC" | "EC" | "SL" | "2S";

export interface TatkalWindowResult {
  /** The date the train departs from its originating station (YYYY-MM-DD) */
  originDepartureDateStr: string;
  /** The date Tatkal booking opens (YYYY-MM-DD), 1 day prior to origin departure */
  tatkalBookingDateStr: string;
  /** Exact ISO timestamp of Tatkal window opening in IST */
  tatkalOpeningTimeIST: string;
  /** Display formatted string e.g. "10:00:00 AM IST" */
  tatkalOpeningTimeFormatted: string;
  /** Category selected */
  category: ClassCategory;
  /** Master List Freeze Window start (e.g. "09:50 AM IST") */
  masterListFreezeStart: string;
  /** Master List Freeze Window end (e.g. "10:10 AM IST") */
  masterListFreezeEnd: string;
  /** Recommended login time to avoid IRCTC session timeout (e.g. "09:58 AM IST") */
  recommendedLoginTime: string;
  /** Booking status relative to current IST time */
  status: "UPCOMING" | "LIVE_TODAY" | "ACTIVE_NOW" | "PAST";
  /** Milliseconds until opening from current time (negative if past) */
  msUntilOpening: number;
}

export interface TatkalSurchargeInfo {
  classCode: TatkalClassCode;
  className: string;
  category: ClassCategory;
  minCharge: number;
  maxCharge: number;
  ratePercentage: number;
  calculatedSurcharge: number;
}

export interface TatkalChecklistItem {
  id: string;
  title: string;
  description: string;
  timing: string;
  priority: "CRITICAL" | "RECOMMENDED" | "TIP";
}

/**
 * Returns current date/time in Indian Standard Time (UTC+5:30)
 */
export function getISTNow(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 5.5 * 3600000);
}

/**
 * Format a Date object into YYYY-MM-DD in IST
 */
export function formatYmdIST(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Format a Date object into a readable date string e.g. "Mon, 15 Sep 2026"
 */
export function formatReadableDateIST(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Calculates the exact Tatkal booking schedule for a given journey date and class.
 *
 * Rules:
 * - Tatkal opens 1 day before the train departs from its ORIGINATING station.
 * - AC Classes (2A, 3A, 3E, CC, EC) open at 10:00:00 AM IST.
 * - Non-AC Classes (Sleeper, 2S) open at 11:00:00 AM IST.
 * - 1AC (First AC) does NOT have Tatkal quota under Indian Railways rules.
 *
 * @param journeyDateStr Boarding date at passenger's station (YYYY-MM-DD)
 * @param category "AC" or "NON_AC"
 * @param originOffsetDays Days before boarding date that the train starts from origin (0 for same-day start, 1 for yesterday, 2 for 2 days ago)
 */
export function calculateTatkalWindow(
  journeyDateStr: string,
  category: ClassCategory,
  originOffsetDays: number = 0,
): TatkalWindowResult {
  const [jYear, jMonth, jDay] = journeyDateStr.split("-").map(Number);
  
  // Calculate Origin Departure Date: journeyDate - originOffsetDays
  const originDate = new Date(Date.UTC(jYear, jMonth - 1, jDay - originOffsetDays, 12, 0, 0));
  const originDepartureDateStr = originDate.toISOString().slice(0, 10);

  // Tatkal opens 1 day before Origin Departure Date
  const tatkalDate = new Date(Date.UTC(originDate.getUTCFullYear(), originDate.getUTCMonth(), originDate.getUTCDate() - 1, 12, 0, 0));
  const tatkalBookingDateStr = tatkalDate.toISOString().slice(0, 10);

  const openHour = category === "AC" ? 10 : 11;
  const openMinute = 0;
  const openSecond = 0;

  // Exact target opening timestamp in UTC (which corresponds to 10:00 or 11:00 AM IST)
  // IST is UTC+5:30 -> 10:00 IST is 04:30 UTC, 11:00 IST is 05:30 UTC
  const [tY, tM, tD] = tatkalBookingDateStr.split("-").map(Number);
  const targetUtcMs = Date.UTC(tY, tM - 1, tD, openHour - 5, openMinute - 30, openSecond);

  const now = new Date();
  const currentUtcMs = now.getTime();
  const msUntilOpening = targetUtcMs - currentUtcMs;

  const istNow = getISTNow();
  const todayYmdIST = formatYmdIST(istNow);

  let status: TatkalWindowResult["status"] = "UPCOMING";
  if (tatkalBookingDateStr === todayYmdIST) {
    if (msUntilOpening > 0) {
      status = "LIVE_TODAY";
    } else if (msUntilOpening >= -3600000) { // Active in the first 1 hour
      status = "ACTIVE_NOW";
    } else {
      status = "PAST";
    }
  } else if (tatkalBookingDateStr < todayYmdIST) {
    status = "PAST";
  } else {
    status = "UPCOMING";
  }

  const isAc = category === "AC";

  return {
    originDepartureDateStr,
    tatkalBookingDateStr,
    tatkalOpeningTimeIST: new Date(targetUtcMs).toISOString(),
    tatkalOpeningTimeFormatted: isAc ? "10:00:00 AM IST" : "11:00:00 AM IST",
    category,
    masterListFreezeStart: isAc ? "09:50 AM IST" : "10:50 AM IST",
    masterListFreezeEnd: isAc ? "10:10 AM IST" : "11:10 AM IST",
    recommendedLoginTime: isAc ? "09:58 AM IST" : "10:58 AM IST",
    status,
    msUntilOpening,
  };
}

/**
 * Tatkal Surcharge Tariffs for 2026 (Ministry of Railways / IRCTC)
 */
export const TATKAL_TARIFF_TABLE: Record<
  TatkalClassCode,
  { name: string; category: ClassCategory; ratePct: number; min: number; max: number }
> = {
  SL: { name: "Sleeper Class (SL)", category: "NON_AC", ratePct: 10, min: 100, max: 200 },
  "2S": { name: "Second Sitting (2S)", category: "NON_AC", ratePct: 10, min: 15, max: 15 },
  "3A": { name: "AC 3 Tier (3A)", category: "AC", ratePct: 30, min: 300, max: 400 },
  "3E": { name: "AC 3 Economy (3E)", category: "AC", ratePct: 30, min: 300, max: 400 },
  CC: { name: "AC Chair Car (CC)", category: "AC", ratePct: 30, min: 125, max: 225 },
  "2A": { name: "AC 2 Tier (2A)", category: "AC", ratePct: 30, min: 400, max: 500 },
  EC: { name: "Executive Class (EC)", category: "AC", ratePct: 30, min: 400, max: 500 },
  "1A": { name: "First AC (1A) - No Tatkal", category: "AC", ratePct: 0, min: 0, max: 0 },
};

/**
 * Calculates exact Tatkal surcharge for a given class and optional base fare.
 */
export function getTatkalSurcharge(
  classCode: TatkalClassCode,
  baseFare: number = 0,
): TatkalSurchargeInfo {
  const tariff = TATKAL_TARIFF_TABLE[classCode] ?? TATKAL_TARIFF_TABLE.SL;
  
  let calculated = tariff.min;
  if (baseFare > 0 && tariff.ratePct > 0) {
    const rawSurcharge = Math.round((baseFare * tariff.ratePct) / 100);
    calculated = Math.min(Math.max(rawSurcharge, tariff.min), tariff.max);
  }

  return {
    classCode,
    className: tariff.name,
    category: tariff.category,
    minCharge: tariff.min,
    maxCharge: tariff.max,
    ratePercentage: tariff.ratePct,
    calculatedSurcharge: calculated,
  };
}

/**
 * Checklist items for maximum Tatkal booking speed
 */
export function getTatkalChecklist(): TatkalChecklistItem[] {
  return [
    {
      id: "master_list",
      title: "Pre-Save Passenger Master List",
      description:
        "Add all passenger names, ages, gender, and berth preferences in your IRCTC profile before 09:45 AM (AC) or 10:45 AM (Non-AC). IRCTC freezes Master List additions 10 minutes before the window opens.",
      timing: "15 mins before opening",
      priority: "CRITICAL",
    },
    {
      id: "aadhaar_otp",
      title: "Verify Aadhaar on IRCTC Account",
      description:
        "Linking your Aadhaar increases your monthly booking quota from 12 to 24 tickets and bypasses additional verification roadblocks during high-traffic Tatkal hours.",
      timing: "1 day before booking",
      priority: "RECOMMENDED",
    },
    {
      id: "login_timing",
      title: "Login Exactly 2 Minutes Prior",
      description:
        "Log in to IRCTC website or Rail Connect app at 09:58 AM (AC) or 10:58 AM (Non-AC). Logging in earlier risks session timeout; logging in later hits heavy server congestion.",
      timing: "2 mins before opening",
      priority: "CRITICAL",
    },
    {
      id: "fast_payment",
      title: "Use UPI Dynamic QR or IRCTC iMudra Wallet",
      description:
        "UPI QR Code (scanned from mobile) or IRCTC e-Wallet/iMudra bypasses bank SMS OTP latency, saving 15–30 crucial seconds at checkout.",
      timing: "During checkout",
      priority: "CRITICAL",
    },
    {
      id: "berth_checkbox",
      title: "Careful with 'Book Only If Confirmed Berths Allocated'",
      description:
        "Selecting this checkbox prevents booking waitlisted tickets if seats run out mid-transaction, but your money will be deducted and refunded within 3–5 working days.",
      timing: "On passenger details page",
      priority: "TIP",
    },
  ];
}

export interface TatkalFaqItem {
  question: string;
  answer: string;
}

export function getTatkalFaqs(): TatkalFaqItem[] {
  return [
    {
      question: "What is the exact opening time for Tatkal train ticket booking?",
      answer:
        "Tatkal booking opens at 10:00 AM IST for all AC classes (2A, 3A, 3E, CC, EC) and at 11:00 AM IST for Non-AC classes (Sleeper, 2S), exactly one day in advance of the train's departure from its originating station.",
    },
    {
      question: "How is the Tatkal booking date calculated for long-distance multi-day trains?",
      answer:
        "Tatkal booking opens 1 day before the train departs from its originating station, NOT your boarding station. For example, if a train leaves Kanyakumari on Monday (Day 1) and reaches your boarding station on Tuesday (Day 2), Tatkal opens on Sunday at 10:00 AM/11:00 AM IST.",
    },
    {
      question: "Can I book Tatkal tickets in 1st AC (1A) or Executive Anubhuti coaches?",
      answer:
        "No. Under Indian Railways commercial rules, 1st AC (1A) and Executive Anubhuti coaches do not have Tatkal quota. Tatkal is available only for 2A, 3A, 3E, CC, EC, Sleeper, and 2S classes.",
    },
    {
      question: "What is the refund rule if I cancel a confirmed Tatkal ticket?",
      answer:
        "Zero refund is granted on cancellation of confirmed Tatkal tickets. However, a 100% full refund is granted if the train is delayed by more than 3 hours, if the train is cancelled, or if the passenger is not accommodated in the booked class.",
    },
    {
      question: "What is the maximum number of Tatkal tickets a user can book per day?",
      answer:
        "A single user ID can book a maximum of 2 Tatkal tickets per day between 08:00 AM and 12:00 PM, and only 2 Tatkal PNRs can be generated from a single IP address during the opening hour.",
    },
    {
      question: "What should I do if Tatkal seats are sold out in seconds?",
      answer:
        "If Tatkal sells out, do not panic. Use LastBerth Finding Smart Seats to find guaranteed confirmed seats on the exact same train by splitting your journey into contiguous coach segments, or check vacant berths on Chart Vacancy after final chart preparation.",
    },
    {
      question: "What is the difference between Tatkal and Premium Tatkal (PT)?",
      answer:
        "Tatkal tickets have fixed government surcharges (₹100–₹500 depending on class), whereas Premium Tatkal (PT) uses dynamic surge pricing that rises steeply as seats sell out. Premium Tatkal tickets cannot be booked at station counters (online only) and offer zero refund upon cancellation.",
    },
    {
      question: "When does IRCTC freeze the Master List for Tatkal bookings?",
      answer:
        "IRCTC disables adding or modifying passengers in the Master List from 09:50 AM to 10:10 AM IST for AC Tatkal, and from 10:50 AM to 11:10 AM IST for Non-AC Tatkal. Always pre-save your passenger list at least 15 minutes before opening.",
    },
  ];
}
