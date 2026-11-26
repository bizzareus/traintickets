import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildConnectingAlternateResult,
  mapScannedConnectingLeg,
  sumConfirmedConnectingFare,
  type ConnectingJourneyDto,
} from "./connectingTrains";
import type { AlternatePathsResponse } from "@/components/booking-v2/alternatePathsTypes";

const sampleJourney: ConnectingJourneyDto = {
  id: "conn-12561-05585",
  from: "NDLS",
  to: "PNBE",
  intermediateStation: "BSB",
  intermediateStationName: "Varanasi Jn",
  journeyDate: "2026-11-10",
  departureTime: "16:50",
  arrivalTime: "05:30",
  arrivalDate: "2026-11-11",
  totalDurationMinutes: 760,
  layoverMinutes: 45,
  totalFare: 2705,
  preferredClass: "3A",
  isFullyConfirmed: false,
  legs: [
    {
      trainNumber: "12561",
      trainName: "SWATANTRTA S EXP",
      from: "NDLS",
      to: "BSB",
      boardingDate: "2026-11-10",
      departureTime: "16:50",
      arrivalTime: "01:15",
      durationMinutes: 505,
      travelClass: "3A",
      fare: 2140,
      availabilityDisplayName: "WL 22",
      availablityStatus: "WL",
      isConfirmed: false,
      confirmedClassOptions: [],
    },
    {
      trainNumber: "05585",
      trainName: "KASHI EXPRESS",
      from: "BSB",
      to: "PNBE",
      boardingDate: "2026-11-11",
      departureTime: "02:00",
      arrivalTime: "05:30",
      durationMinutes: 210,
      travelClass: "3A",
      fare: 565,
      availabilityDisplayName: "AVL 12",
      availablityStatus: "AVAILABLE",
      isConfirmed: true,
      confirmedClassOptions: [
        {
          travelClass: "3A",
          fare: 565,
          availabilityDisplayName: "AVL 12",
          isConfirmed: true,
        },
      ],
    },
  ],
};

describe("connectingTrains scan mapping helpers", () => {
  test("preserves waitlisted Train 1 and confirmed Train 2 legs for popup display", () => {
    const res1: AlternatePathsResponse = {
      trainNumber: "12561",
      legs: [
        {
          from: "NDLS",
          to: "BSB",
          segmentKind: "check_realtime",
          travelClass: null,
          railDataStatus: "WL",
          availablityStatus: "WL 22",
          predictionPercentage: null,
          availabilityDisplayName: "WL 22",
          fare: null,
          boardingDate: "2026-11-10",
        },
      ],
      totalFare: null,
      legCount: 0,
      isComplete: false,
      stationCodesOnRoute: ["NDLS", "BSB"],
      stationNameMap: { NDLS: "New Delhi", BSB: "Varanasi Jn" },
    };

    const res2: AlternatePathsResponse = {
      trainNumber: "05585",
      legs: [
        {
          from: "BSB",
          to: "PNBE",
          segmentKind: "confirmed",
          travelClass: "3A",
          railDataStatus: "AVAILABLE",
          availablityStatus: "AVL 12",
          predictionPercentage: null,
          availabilityDisplayName: "AVL 12",
          fare: 565,
          boardingDate: "2026-11-11",
        },
      ],
      totalFare: 565,
      legCount: 1,
      isComplete: true,
      stationCodesOnRoute: ["BSB", "PNBE"],
      stationNameMap: { BSB: "Varanasi Jn", PNBE: "Patna Jn" },
    };

    const mapped1 = mapScannedConnectingLeg(
      sampleJourney.legs[0],
      res1,
      "3A",
      undefined,
      2140,
    );
    const mapped2 = mapScannedConnectingLeg(
      sampleJourney.legs[1],
      res2,
      "3A",
      sampleJourney.legs[1].confirmedClassOptions[0],
      565,
    );

    assert.equal(mapped1.hasSeats, false);
    assert.equal(mapped1.legs[0].trainNumber, "12561");
    assert.equal(mapped1.legs[0].segmentKind, "check_realtime");

    assert.equal(mapped2.hasSeats, true);
    assert.equal(mapped2.legs[0].trainNumber, "05585");
    assert.equal(mapped2.legs[0].segmentKind, "confirmed");

    const combinedLegs = [...mapped1.legs, ...mapped2.legs];
    const totalFare = sumConfirmedConnectingFare(combinedLegs);
    assert.equal(totalFare, 565);

    const popupResult = buildConnectingAlternateResult({
      journey: sampleJourney,
      res1,
      res2,
      legs: combinedLegs,
      totalFare,
      fromName: "New Delhi",
      toName: "Patna Jn",
    });

    assert.equal(popupResult.trainNumber, "12561 / 05585");
    assert.equal(popupResult.isComplete, false);
    assert.equal(popupResult.legCount, 1);
    assert.equal(popupResult.totalFare, 565);
    assert.equal(popupResult.legs.length, 2);
  });

  test("builds fallback check_realtime leg when stream returns empty legs for waitlisted train", () => {
    const emptyRes: AlternatePathsResponse = {
      trainNumber: "12561",
      legs: [],
      totalFare: null,
      legCount: 0,
      isComplete: false,
      stationCodesOnRoute: [],
    };

    const mapped1 = mapScannedConnectingLeg(
      sampleJourney.legs[0],
      emptyRes,
      "3A",
      undefined,
      2140,
    );

    assert.equal(mapped1.hasSeats, false);
    assert.equal(mapped1.legs.length, 1);
    assert.equal(mapped1.legs[0].segmentKind, "check_realtime");
    assert.equal(mapped1.legs[0].trainNumber, "12561");
    assert.equal(mapped1.legs[0].from, "NDLS");
    assert.equal(mapped1.legs[0].to, "BSB");
    assert.equal(mapped1.legs[0].fare, null);
  });

  test("returns null totalFare when all legs are waitlisted", () => {
    const mapped1 = mapScannedConnectingLeg(
      sampleJourney.legs[0],
      null,
      "3A",
      undefined,
      2140,
    );
    const mapped2 = mapScannedConnectingLeg(
      {
        ...sampleJourney.legs[1],
        isConfirmed: false,
        confirmedClassOptions: [],
      },
      null,
      "3A",
      undefined,
      565,
    );

    assert.equal(
      sumConfirmedConnectingFare([...mapped1.legs, ...mapped2.legs]),
      null,
    );
  });
});
