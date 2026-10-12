import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import satori from "satori";
import {
  JOURNEY_SHARE_WIDTH,
  JourneyShareCard,
  formatShareDateLabel,
  formatShareFare,
  journeyShareHeight,
  toJourneyShareData,
  type JourneyShareInput,
} from "./journeyShareCard";

function input(): JourneyShareInput {
  return {
    trainNumber: "09065",
    trainName: "ST CPR SPL",
    journeyDate: "2026-11-10",
    legs: [
      {
        from: "CYI",
        to: "VGLJ",
        segmentKind: "confirmed",
        travelClass: "SL",
        railDataStatus: "AVL 42",
        availablityStatus: null,
        predictionPercentage: null,
        availabilityDisplayName: "AVL 42",
        fare: 580,
        boardingDate: "2026-11-10",
      },
      {
        from: "VGLJ",
        to: "GOY",
        segmentKind: "confirmed",
        travelClass: "SL",
        railDataStatus: "AVL 18",
        availablityStatus: null,
        predictionPercentage: null,
        availabilityDisplayName: "AVL 18",
        fare: 400,
        boardingDate: "2026-11-10",
      },
      {
        from: "GOY",
        to: "DEST",
        segmentKind: "check_realtime",
        travelClass: null,
        railDataStatus: null,
        availablityStatus: null,
        predictionPercentage: null,
        availabilityDisplayName: "REGRET",
        fare: null,
        boardingDate: "2026-11-10",
      },
    ],
    stationNameMap: { CYI: "Chittorgarh", VGLJ: "VGLJ", GOY: "GOY" },
    totalFare: 980,
  };
}

async function shareFonts() {
  const dir = path.join(process.cwd(), "public", "fonts");
  const load = async (file: string, weight: 400 | 700) => {
    const buf = await readFile(path.join(dir, file));
    return {
      name: "Inter",
      data: buf.buffer.slice(
        buf.byteOffset,
        buf.byteOffset + buf.byteLength,
      ) as ArrayBuffer,
      weight,
      style: "normal" as const,
    };
  };
  return [await load("inter-latin-400-normal.woff", 400)];
}

test("journeyShareHeight grows by one row per leg", () => {
  assert.equal(journeyShareHeight(1), 776);
  assert.equal(journeyShareHeight(2), 908);
  assert.equal(journeyShareHeight(3), 1040);
});

test("formatShareDateLabel formats ISO dates for the card header", () => {
  assert.equal(formatShareDateLabel("2026-11-10"), "10 Nov 2026");
  assert.equal(formatShareDateLabel(""), "—");
  assert.equal(formatShareDateLabel("not-a-date"), "—");
});

test("formatShareFare uses Indian grouping", () => {
  assert.equal(formatShareFare(980), "₹980");
  assert.equal(formatShareFare(1505), "₹1,505");
});

test("toJourneyShareData keeps confirmed legs only", () => {
  const data = toJourneyShareData(input());
  assert.equal(data.title, "09065 ST CPR SPL");
  assert.equal(data.dateLabel, "10 Nov 2026");
  assert.equal(data.legs.length, 2);
  assert.equal(data.legs[0].segmentLabel, "Chittorgarh (CYI) → VGLJ (VGLJ)");
  assert.equal(data.legs[0].detailLabel, "SL · AVL 42");
  assert.equal(data.legs[0].fareLabel, "₹580");
  assert.equal(data.totalLabel, "₹980");
});

test("toJourneyShareData falls back when names and fares are missing", () => {
  const data = toJourneyShareData({
    ...input(),
    trainName: null,
    stationNameMap: undefined,
    totalFare: null,
    legs: [
      {
        ...input().legs[0],
        availabilityDisplayName: null,
        railDataStatus: null,
        fare: null,
      },
    ],
  });
  assert.equal(data.title, "Train 09065");
  assert.equal(data.legs[0].segmentLabel, "CYI → VGLJ");
  assert.equal(data.legs[0].detailLabel, "SL · Available");
  assert.equal(data.legs[0].fareLabel, "—");
  assert.equal(data.totalLabel, null);
});

test("JourneyShareCard renders SVG at the card dimensions", async () => {
  const fonts = await shareFonts();
  const data = toJourneyShareData(input());
  const svg = await satori(JourneyShareCard({ data }), {
    width: JOURNEY_SHARE_WIDTH,
    height: journeyShareHeight(data.legs.length),
    fonts,
  });
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.includes(`width="${JOURNEY_SHARE_WIDTH}"`));
  assert.ok(svg.includes(`height="${journeyShareHeight(2)}"`));
});
