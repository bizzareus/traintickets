import type { Page, Route } from "@playwright/test";

const MOCK_API_PORT = 3009;

/** Match any host (localhost / 127.0.0.1 / ::1) on the mock API port. */
export function isMockApiRequest(url: URL): boolean {
  if (!url.pathname.startsWith("/api/")) return false;
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  return port === String(MOCK_API_PORT);
}

export type MockStation = { stationCode: string; stationName: string };

export type MockTrain = {
  trainNumber: string;
  trainName: string;
  departureTime?: string;
  arrivalTime?: string;
  duration?: number;
  fromStnCode?: string;
  toStnCode?: string;
  avlClasses?: string[];
  availabilityCache?: Record<
    string,
    {
      travelClass?: string;
      fare?: string;
      availabilityDisplayName?: string;
      railDataStatus?: string;
    }
  >;
};

export type MockAlternateClassOption = {
  travelClass: string;
  railDataStatus: string | null;
  availablityStatus: string | null;
  predictionPercentage: string | null;
  availabilityDisplayName: string | null;
  fare: number | null;
};

export type MockAlternateLeg = {
  from: string;
  to: string;
  segmentKind: "confirmed" | "check_realtime";
  travelClass: string | null;
  railDataStatus: string | null;
  availablityStatus: string | null;
  predictionPercentage: string | null;
  availabilityDisplayName: string | null;
  fare: number | null;
  confirmedClassOptions?: MockAlternateClassOption[];
  departureTime?: string | null;
  arrivalTime?: string | null;
  durationMinutes?: number | null;
};

export type MockRemainderMergedSchedule = {
  from: string;
  to: string;
  departureTime: string | null;
  arrivalTime: string | null;
  durationMinutes: number | null;
};

export type MockAlternatePathsResponse = {
  trainNumber: string;
  legs: MockAlternateLeg[];
  totalFare: number | null;
  legCount: number;
  isComplete: boolean;
  stationCodesOnRoute: string[];
  remainderMergedSchedule?: MockRemainderMergedSchedule | null;
  debugLog?: string[];
};

export type MockStationMeta = {
  stationCode: string;
  trainArrivalTime?: string | null;
  trainDepartureTime?: string | null;
  chartOneTime?: string | null;
  chartTwoTime?: string | null;
  chartTwoIsNextDay?: boolean;
  chartRemoteStation?: string | null;
};

function emptyLegSegment(
  from: string,
  to: string,
  kind: "confirmed" | "check_realtime",
  extras: Partial<MockAlternateLeg> = {},
): MockAlternateLeg {
  return {
    from,
    to,
    segmentKind: kind,
    travelClass: kind === "confirmed" ? "SL" : "SL",
    railDataStatus: kind === "confirmed" ? null : "REGRET / No seats",
    availablityStatus: null,
    predictionPercentage: null,
    availabilityDisplayName: kind === "confirmed" ? "AVAILABLE-0123" : "WL 42",
    fare: kind === "confirmed" ? 450 : null,
    departureTime: null,
    arrivalTime: null,
    durationMinutes: null,
    ...extras,
  };
}

/** Two confirmed hops (positive “short” path). */

/**
 * Middle segment unavailable: one confirmed leg, then 4 chained check_realtime
 * hops (NZM-style — should collapse to a single no-tickets card), then
 * one confirmed leg at the end.
 */
export function alternatePathMiddleChainUnavailable(trainNumber: string): MockAlternatePathsResponse {
  const legs: MockAlternateLeg[] = [
    emptyLegSegment("ORIG", "A", "confirmed", { fare: 100 }),
    emptyLegSegment("A", "B", "check_realtime"),
    emptyLegSegment("B", "C", "check_realtime"),
    emptyLegSegment("C", "D", "check_realtime"),
    emptyLegSegment("D", "MID", "check_realtime"),
    emptyLegSegment("MID", "DEST", "confirmed", { fare: 200 }),
  ];
  return {
    trainNumber,
    legs,
    totalFare: 300,
    legCount: legs.length,
    isComplete: false,
    stationCodesOnRoute: ["ORIG", "A", "B", "C", "D", "MID", "DEST"],
    remainderMergedSchedule: null,
  };
}

export function alternatePathTwoConfirmed(trainNumber: string): MockAlternatePathsResponse {
  const legs: MockAlternateLeg[] = [
    emptyLegSegment("ORIG", "MID", "confirmed", { fare: 200 }),
    emptyLegSegment("MID", "DEST", "confirmed", { fare: 250 }),
  ];
  return {
    trainNumber,
    legs,
    totalFare: 450,
    legCount: 2,
    isComplete: true,
    stationCodesOnRoute: ["ORIG", "MID", "DEST"],
    remainderMergedSchedule: null,
  };
}

/**
 * One confirmed leg where two classes (SL and 3A) are both available.
 * The leg carries confirmedClassOptions with both classes so the UI can
 * show two sub-cards.
 */
export function alternatePathMultiClassConfirmed(trainNumber: string): MockAlternatePathsResponse {
  const legs: MockAlternateLeg[] = [
    {
      ...emptyLegSegment("ORIG", "DEST", "confirmed", { travelClass: "SL", fare: 655 }),
      availabilityDisplayName: "AVAILABLE-0020",
      confirmedClassOptions: [
        {
          travelClass: "SL",
          railDataStatus: null,
          availablityStatus: null,
          predictionPercentage: null,
          availabilityDisplayName: "AVAILABLE-0020",
          fare: 655,
        },
        {
          travelClass: "3A",
          railDataStatus: null,
          availablityStatus: null,
          predictionPercentage: null,
          availabilityDisplayName: "AVAILABLE-0005",
          fare: 1270,
        },
      ],
    },
  ];
  return {
    trainNumber,
    legs,
    totalFare: 655,
    legCount: 1,
    isComplete: true,
    stationCodesOnRoute: ["ORIG", "DEST"],
    remainderMergedSchedule: null,
  };
}

/** Three confirmed hops: two intermediate stations between origin and destination. */
export function alternatePathTwoIntermediatesConfirmed(trainNumber: string): MockAlternatePathsResponse {
  const legs: MockAlternateLeg[] = [
    emptyLegSegment("ORIG", "S1", "confirmed", { fare: 100 }),
    emptyLegSegment("S1", "S2", "confirmed", { fare: 150 }),
    emptyLegSegment("S2", "DEST", "confirmed", { fare: 200 }),
  ];
  return {
    trainNumber,
    legs,
    totalFare: 450,
    legCount: 3,
    isComplete: true,
    stationCodesOnRoute: ["ORIG", "S1", "S2", "DEST"],
    remainderMergedSchedule: null,
  };
}

/**
 * One confirmed leg then a realtime tail that collapses in the modal (subscribe UI).
 * Example: ORIG→MID confirmed, then MID→PEN→DEST as check_realtime (collapsed to MID→DEST).
 */
export function alternatePathWithCollapsedRemainder(trainNumber: string): MockAlternatePathsResponse {
  const legs: MockAlternateLeg[] = [
    emptyLegSegment("ORIG", "MID", "confirmed", { fare: 200 }),
    emptyLegSegment("MID", "PEN", "check_realtime"),
    emptyLegSegment("PEN", "DEST", "check_realtime"),
  ];
  return {
    trainNumber,
    legs,
    totalFare: 200,
    legCount: 3,
    isComplete: false,
    stationCodesOnRoute: ["ORIG", "MID", "PEN", "DEST"],
    remainderMergedSchedule: {
      from: "MID",
      to: "DEST",
      departureTime: "09:15",
      arrivalTime: "21:40",
      durationMinutes: 745,
    },
  };
}

/** `segmentCount` check_realtime legs in a chain from `first` to `last` (inclusive endpoints). */
export function alternatePathLongRealtimeChain(
  trainNumber: string,
  segmentCount: number,
  first = "ORIG",
  last = "DEST",
): MockAlternatePathsResponse {
  const codes: string[] = [first];
  for (let i = 1; i < segmentCount; i++) {
    codes.push(`H${String(i).padStart(2, "0")}`);
  }
  codes.push(last);

  const legs: MockAlternateLeg[] = [];
  for (let i = 0; i < codes.length - 1; i++) {
    legs.push(emptyLegSegment(codes[i], codes[i + 1], "check_realtime"));
  }

  return {
    trainNumber,
    legs,
    totalFare: null,
    legCount: legs.length,
    isComplete: false,
    stationCodesOnRoute: codes,
    remainderMergedSchedule: {
      from: first,
      to: last,
      departureTime: "08:00",
      arrivalTime: "22:00",
      durationMinutes: 840,
    },
  };
}

export type BookingV2MockConfig = {
  stations: MockStation[];
  trains: MockTrain[];
  alternatePaths: MockAlternatePathsResponse | ((body: Record<string, unknown>) => MockAlternatePathsResponse);
  alternatePathsError: { status: number; body: unknown } | null;
  stationsMetaBySource: Record<string, MockStationMeta> | null;
  stationsMetaError: { status: number; body: unknown } | null;
  journeyValidate: { valid: boolean; errors?: Array<{ code: string; message: string }> };
  journeyValidateError: { status: number; body: unknown } | null;
  journeyPostError: { status: number; body: unknown } | null;
  suggestError: { status: number; body: unknown } | null;
  trainSearchError: { status: number; body: unknown } | null;
};

export const DEFAULT_STATIONS: MockStation[] = [
  { stationCode: "ORIG", stationName: "Origin City" },
  { stationCode: "DEST", stationName: "Destination Town" },
  { stationCode: "MID", stationName: "Midway Junction" },
];

export const DEFAULT_TRAIN: MockTrain = {
  trainNumber: "12345",
  trainName: "Mock Express",
  departureTime: "08:00",
  arrivalTime: "18:00",
  duration: 600,
  fromStnCode: "ORIG",
  toStnCode: "DEST",
  avlClasses: ["SL", "3A"],
  availabilityCache: {
    SL: {
      availabilityDisplayName: "WL 15",
      railDataStatus: "WL 15",
      fare: "1200",
    },
    "3A": {
      availabilityDisplayName: "AVAILABLE-0001",
      railDataStatus: "AVAILABLE-0001",
      fare: "2800",
    },
  },
};

const defaultMeta = (code: string): MockStationMeta => ({
  stationCode: code,
  chartOneTime: "10:00",
  chartTwoTime: "22:00",
  chartTwoIsNextDay: false,
});

export const DEFAULT_MOCK_CONFIG: BookingV2MockConfig = {
  stations: DEFAULT_STATIONS,
  trains: [DEFAULT_TRAIN],
  alternatePaths: (body) => {
    const num = String(body.trainNumber ?? "12345");
    return alternatePathWithCollapsedRemainder(num);
  },
  alternatePathsError: null,
  stationsMetaBySource: null,
  stationsMetaError: null,
  journeyValidate: { valid: true },
  journeyValidateError: null,
  journeyPostError: null,
  suggestError: null,
  trainSearchError: null,
};

function jsonFulfill(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

export async function installBookingV2Mocks(
  page: Page,
  overrides: Partial<BookingV2MockConfig> = {},
): Promise<void> {
  const cfg: BookingV2MockConfig = {
    ...DEFAULT_MOCK_CONFIG,
    ...overrides,
    stations: overrides.stations ?? DEFAULT_MOCK_CONFIG.stations,
    trains: overrides.trains ?? DEFAULT_MOCK_CONFIG.trains,
  };

  await page.route(isMockApiRequest, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();

    if (path === "/api/booking-v2/stations/suggest" && method === "GET") {
      if (cfg.suggestError) {
        await jsonFulfill(route, cfg.suggestError.status, cfg.suggestError.body);
        return;
      }
      await jsonFulfill(route, 200, {
        data: { stationList: cfg.stations },
      });
      return;
    }

    if (path === "/api/booking-v2/trains/search" && method === "GET") {
      if (cfg.trainSearchError) {
        await jsonFulfill(route, cfg.trainSearchError.status, cfg.trainSearchError.body);
        return;
      }
      await jsonFulfill(route, 200, {
        data: { trainList: cfg.trains },
      });
      return;
    }

    if (path === "/api/booking-v2/alternate-paths" && method === "POST") {
      if (cfg.alternatePathsError) {
        await jsonFulfill(route, cfg.alternatePathsError.status, cfg.alternatePathsError.body);
        return;
      }
      let body: Record<string, unknown> = {};
      try {
        body = req.postDataJSON() as Record<string, unknown>;
      } catch {
        body = {};
      }
      const alt =
        typeof cfg.alternatePaths === "function" ? cfg.alternatePaths(body) : cfg.alternatePaths;
      await jsonFulfill(route, 200, alt);
      return;
    }

    if (path === "/api/booking-v2/alternate-paths/stream" && method === "POST") {
      if (cfg.alternatePathsError) {
        await jsonFulfill(route, cfg.alternatePathsError.status, cfg.alternatePathsError.body);
        return;
      }
      let body: Record<string, unknown> = {};
      try {
        body = req.postDataJSON() as Record<string, unknown>;
      } catch {
        body = {};
      }
      const alt =
        typeof cfg.alternatePaths === "function" ? cfg.alternatePaths(body) : cfg.alternatePaths;

      // Emit a few representative progress lines then the final result as NDJSON
      const ndjson = [
        JSON.stringify({ type: "progress", event: { type: "schedule_ok", trainName: "Mock Express", stopCount: 10 } }),
        JSON.stringify({ type: "progress", event: { type: "route_ok", from: String(body.from ?? "ORIG"), to: String(body.to ?? "DEST"), stopCount: 5 } }),
        JSON.stringify({ type: "result", data: alt }),
      ].join("\n") + "\n";

      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: ndjson,
      });
      return;
    }

    if (path === "/api/train-composition/stations-meta" && method === "POST") {
      if (cfg.stationsMetaError) {
        await jsonFulfill(route, cfg.stationsMetaError.status, cfg.stationsMetaError.body);
        return;
      }
      let body: { sourceStation?: string } = {};
      try {
        body = req.postDataJSON() as { sourceStation?: string };
      } catch {
        body = {};
      }
      const code = String(body.sourceStation ?? "").toUpperCase();
      const row =
        cfg.stationsMetaBySource?.[code] ??
        defaultMeta(code || "UNK");
      await jsonFulfill(route, 200, { stations: [row] });
      return;
    }

    if (path === "/api/availability/journey/validate" && method === "POST") {
      if (cfg.journeyValidateError) {
        await jsonFulfill(route, cfg.journeyValidateError.status, cfg.journeyValidateError.body);
        return;
      }
      await jsonFulfill(route, 200, cfg.journeyValidate);
      return;
    }

    if (path === "/api/availability/journey" && method === "POST") {
      if (cfg.journeyPostError) {
        await jsonFulfill(route, cfg.journeyPostError.status, cfg.journeyPostError.body);
        return;
      }
      await jsonFulfill(route, 202, { ok: true });
      return;
    }

    await jsonFulfill(route, 404, {
      message: `E2E: unmocked ${method} ${path}`,
    });
  });
}
