import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  sortTrainSearchV2,
  calculateConfirmedDurationMinutes,
  extractScanMetaFromResult,
  type TrainScanMeta,
} from "./trainSearchV2Sort";
import type { TrainListItem, AlternateLeg, AlternatePathsResponse } from "@/components/booking-v2/alternatePathsTypes";

describe("Train Search V2 - Prioritized Multi-Tier Sorting Logic", () => {
  // Helper to create mock train items
  const createMockTrain = (
    trainNumber: string,
    departureTime: string,
    isDirectAvailable = false,
  ): TrainListItem => ({
    trainNumber,
    trainName: `Express ${trainNumber}`,
    departureTime,
    arrivalTime: "23:00",
    duration: 600,
    fromStnCode: "NDLS",
    toStnCode: "BPL",
    avlClasses: ["3A", "SL"],
    availabilityCache: isDirectAvailable
      ? {
          "3A": {
            availablityType: 1,
            availablityStatus: "AVAILABLE 10",
            fare: "1200",
          },
        }
      : {
          "3A": {
            availablityType: 3,
            availablityStatus: "WL 25",
            fare: "1200",
          },
        },
  });

  // TEST 1: Direct available trains on IRCTC
  test("Test Case 1: Prioritizes directly available trains at the top, sorted chronologically by departure time", () => {
    const trains: TrainListItem[] = [
      createMockTrain("12003", "19:30", true), // Direct Avail (Evening)
      createMockTrain("12001", "06:15", true), // Direct Avail (Morning)
      createMockTrain("12002", "14:00", true), // Direct Avail (Afternoon)
      createMockTrain("12004", "05:00", false), // Waitlisted
    ];

    const sorted = sortTrainSearchV2(trains);
    const sortedNumbers = sorted.map((t) => t.trainNumber);

    assert.deepEqual(sortedNumbers, ["12001", "12002", "12003", "12004"]);
  });

  // TEST 2: When there are 1 or 2 trains with split tickets full journey (100% complete)
  test("Test Case 2: Places full 100% complete split journeys above partial/waitlisted, sorted chronologically", () => {
    const trains: TrainListItem[] = [
      createMockTrain("12010", "05:00", false), // Waitlist Only
      createMockTrain("12011", "20:00", false), // Full Split Journey (Evening)
      createMockTrain("12012", "08:30", false), // Full Split Journey (Morning)
      createMockTrain("12013", "23:00", false), // Waitlist Only
    ];

    const scanMetaMap = new Map<string, TrainScanMeta>([
      ["12011", { isComplete: true, confirmedDurationMinutes: 600, legCount: 2 }],
      ["12012", { isComplete: true, confirmedDurationMinutes: 580, legCount: 2 }],
      ["12010", { isComplete: false, confirmedDurationMinutes: 0, legCount: 0 }],
      ["12013", { isComplete: false, confirmedDurationMinutes: 0, legCount: 0 }],
    ]);

    const sorted = sortTrainSearchV2(trains, { scanMetaMap });
    const sortedNumbers = sorted.map((t) => t.trainNumber);

    // Tier 2 full split journeys first (08:30 then 20:00), then Tier 4 waitlisted (05:00 then 23:00)
    assert.deepEqual(sortedNumbers, ["12012", "12011", "12010", "12013"]);
  });

  // TEST 3: Partial journeys with different hours availability -> LONGEST HOURS FIRST
  test("Test Case 3: Ranks partial journeys by longest confirmed hours/duration first, using departure time as tie-breaker", () => {
    const trains: TrainListItem[] = [
      createMockTrain("T-2HR", "06:00", false), // 2 hours (120 mins)
      createMockTrain("T-8HR", "14:00", false), // 8 hours (480 mins)
      createMockTrain("T-5HR-LATE", "16:00", false), // 5 hours (300 mins) - Dep 16:00
      createMockTrain("T-5HR-EARLY", "09:00", false), // 5 hours (300 mins) - Dep 09:00
      createMockTrain("T-10HR", "22:00", false), // 10 hours (600 mins)
      createMockTrain("T-WL", "04:00", false), // 0 hours (Waitlist only)
    ];

    const scanMetaMap = new Map<string, TrainScanMeta>([
      ["T-2HR", { isComplete: false, confirmedDurationMinutes: 120 }],
      ["T-8HR", { isComplete: false, confirmedDurationMinutes: 480 }],
      ["T-5HR-LATE", { isComplete: false, confirmedDurationMinutes: 300 }],
      ["T-5HR-EARLY", { isComplete: false, confirmedDurationMinutes: 300 }],
      ["T-10HR", { isComplete: false, confirmedDurationMinutes: 600 }],
      ["T-WL", { isComplete: false, confirmedDurationMinutes: 0 }],
    ]);

    const sorted = sortTrainSearchV2(trains, { scanMetaMap });
    const sortedNumbers = sorted.map((t) => t.trainNumber);

    assert.deepEqual(sortedNumbers, [
      "T-10HR", // 10 hours confirmed (Longest coverage)
      "T-8HR", // 8 hours confirmed
      "T-5HR-EARLY", // 5 hours confirmed (dep 09:00 earlier than 16:00)
      "T-5HR-LATE", // 5 hours confirmed (dep 16:00)
      "T-2HR", // 2 hours confirmed
      "T-WL", // 0 hours confirmed (Waitlist only)
    ]);
  });

  // TEST 4: Combination of all tiers together
  test("Test Case 4: Correctly ranks combined mix of Direct Available, Full Split, Partial (by longest duration), and Waitlisted", () => {
    const trains: TrainListItem[] = [
      createMockTrain("DIRECT-EVENING", "18:00", true),
      createMockTrain("DIRECT-MORNING", "09:00", true),
      createMockTrain("SPLIT-FULL-NIGHT", "21:00", false),
      createMockTrain("SPLIT-FULL-MORNING", "07:00", false),
      createMockTrain("PARTIAL-10HR", "12:00", false),
      createMockTrain("PARTIAL-3HR", "08:00", false),
      createMockTrain("WAITLIST-EARLY", "06:00", false),
      createMockTrain("WAITLIST-LATE", "23:00", false),
    ];

    const scanMetaMap = new Map<string, TrainScanMeta>([
      ["SPLIT-FULL-NIGHT", { isComplete: true, confirmedDurationMinutes: 500 }],
      ["SPLIT-FULL-MORNING", { isComplete: true, confirmedDurationMinutes: 450 }],
      ["PARTIAL-10HR", { isComplete: false, confirmedDurationMinutes: 600 }],
      ["PARTIAL-3HR", { isComplete: false, confirmedDurationMinutes: 180 }],
      ["WAITLIST-EARLY", { isComplete: false, confirmedDurationMinutes: 0 }],
      ["WAITLIST-LATE", { isComplete: false, confirmedDurationMinutes: 0 }],
    ]);

    const sorted = sortTrainSearchV2(trains, { scanMetaMap });
    const sortedNumbers = sorted.map((t) => t.trainNumber);

    assert.deepEqual(sortedNumbers, [
      // Tier 1: Direct Available (sorted by time: 09:00, 18:00)
      "DIRECT-MORNING",
      "DIRECT-EVENING",
      // Tier 2: 100% Full Split Journeys (sorted by time: 07:00, 21:00)
      "SPLIT-FULL-MORNING",
      "SPLIT-FULL-NIGHT",
      // Tier 3: Partial Journeys (sorted by longest hours: 600 mins / 10hr then 180 mins / 3hr)
      "PARTIAL-10HR",
      "PARTIAL-3HR",
      // Tier 4: Waitlisted Only (sorted by time: 06:00, 23:00)
      "WAITLIST-EARLY",
      "WAITLIST-LATE",
    ]);
  });

  // TEST 5: Duration calculation accuracy
  test("Test Case 5: Accurately calculates confirmed duration from legs (including explicit minutes & midnight crossover)", () => {
    const legs: AlternateLeg[] = [
      {
        from: "NDLS",
        to: "GWL",
        segmentKind: "confirmed",
        travelClass: "3A",
        railDataStatus: "AVL",
        availablityStatus: "AVAILABLE 5",
        predictionPercentage: null,
        availabilityDisplayName: "AVL",
        fare: 650,
        durationMinutes: 240, // 4 hours
      },
      {
        from: "GWL",
        to: "BPL",
        segmentKind: "confirmed",
        travelClass: "2A",
        railDataStatus: "AVL",
        availablityStatus: "AVAILABLE 2",
        predictionPercentage: null,
        availabilityDisplayName: "AVL",
        fare: 950,
        departureTime: "22:00",
        arrivalTime: "02:00", // Crosses midnight = 4 hours (240 mins)
      },
      {
        from: "BPL",
        to: "ET",
        segmentKind: "check_realtime", // Not confirmed
        travelClass: null,
        railDataStatus: null,
        availablityStatus: null,
        predictionPercentage: null,
        availabilityDisplayName: null,
        fare: null,
        durationMinutes: 120,
      },
    ];

    const totalMinutes = calculateConfirmedDurationMinutes(legs);
    assert.equal(totalMinutes, 480); // 240 + 240 = 480 minutes (8 hours)

    const response: AlternatePathsResponse = {
      trainNumber: "12001",
      legs,
      totalFare: 1600,
      legCount: 3,
      isComplete: false,
      stationCodesOnRoute: ["NDLS", "GWL", "BPL", "ET"],
    };

    const meta = extractScanMetaFromResult(response);
    assert.equal(meta.isComplete, false);
    assert.equal(meta.confirmedDurationMinutes, 480);
    assert.equal(meta.legCount, 3);
  });
});
