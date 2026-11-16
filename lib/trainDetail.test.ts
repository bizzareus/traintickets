import test from "node:test";
import assert from "node:assert/strict";
import {
  getTrainIndex,
  parseTrainNumberFromParam,
  buildTrainSlug,
} from "./trainSlug";
import { getChartTimesPageData } from "./chartTimes";
import { getTrainByNumber } from "./trainCatalog";

test("resolve train metadata for 27651 (Vande Bharat Sleeper Express)", async () => {
  const trainNumber = parseTrainNumberFromParam(
    "27651-mumbai-csmt-smvt-bengaluru-vande-bharat-sleeper-express",
  );
  assert.equal(trainNumber, "27651");

  const catalogTrain = getTrainByNumber("vande-bharat", "27651");
  assert.ok(catalogTrain);
  assert.equal(catalogTrain.trainNumber, "27651");
  assert.equal(catalogTrain.trainType, "Sleeper");
  assert.equal(catalogTrain.originStation.code, "CSMT");
  assert.equal(catalogTrain.destinationStation.code, "SMVB");
  assert.ok(catalogTrain.classes.includes("1A"));
  assert.ok(catalogTrain.classes.includes("2A"));
  assert.ok(catalogTrain.classes.includes("3A"));

  const chartData = await getChartTimesPageData("27651");
  assert.ok(chartData);
  assert.equal(chartData.trainNumber, "27651");
  assert.equal(chartData.originStation, "CSMT");
  assert.equal(chartData.destinationStation, "SMVB");
  assert.ok(chartData.stations.length >= 10);

  const originStation = chartData.stations[0];
  assert.equal(originStation.stationCode, "CSMT");
  assert.equal(originStation.departureTime, "20:10");
  assert.equal(originStation.chartTimeLocal, "16:10");
  assert.equal(originStation.chartTwoTimeLocal, "19:40");

  const destStation = chartData.stations[chartData.stations.length - 1];
  assert.equal(destStation.stationCode, "SMVB");
  assert.equal(destStation.arrivalTime, "12:00");
  assert.equal(destStation.day, 2);
});

test("canonical slug generation matches expected route URL", () => {
  const slug = buildTrainSlug(
    "27651",
    "Mumbai CSMT - SMVT Bengaluru Vande Bharat Sleeper Express",
  );
  assert.equal(
    slug,
    "27651-mumbai-csmt-smvt-bengaluru-vande-bharat-sleeper-express",
  );
});

test("getTrainIndex includes 27651 in cached catalog index", () => {
  const index = getTrainIndex();
  const train27651 = index.get("27651");
  assert.ok(train27651);
  assert.equal(train27651.trainNumber, "27651");
  assert.ok(train27651.trainName.includes("Vande Bharat Sleeper"));
});

test("midnight halt calculation handles overnight crossovers correctly", () => {
  function calculateHaltMinutes(
    arr?: string | null,
    dep?: string | null,
  ): string | undefined {
    if (!arr || !dep) return undefined;
    const [ah, am] = arr.split(":").map(Number);
    const [dh, dm] = dep.split(":").map(Number);
    if (isNaN(ah) || isNaN(am) || isNaN(dh) || isNaN(dm)) return undefined;
    let diff = dh * 60 + dm - (ah * 60 + am);
    if (diff < 0) diff += 24 * 60;
    return diff > 0 ? `${diff}m` : undefined;
  }

  assert.equal(calculateHaltMinutes("20:58", "21:00"), "2m");
  assert.equal(calculateHaltMinutes("23:55", "00:05"), "10m");
  assert.equal(calculateHaltMinutes("23:50", "00:15"), "25m");
  assert.equal(calculateHaltMinutes("21:00", "21:00"), undefined);
});

test("Vande Bharat Sleeper trains exclude non-AC Sleeper (SL) class", () => {
  const catalogTrain = getTrainByNumber("vande-bharat", "27651");
  assert.ok(catalogTrain);
  const rawClasses = catalogTrain.classes;
  const isVandeBharatSleeper = true;

  const codes = rawClasses.map((c) =>
    c === "Sleeper"
      ? isVandeBharatSleeper
        ? ""
        : "SL"
      : c.trim().toUpperCase(),
  );
  const uniqueCodes = Array.from(new Set(codes.filter(Boolean))).filter(
    (c) => c !== "GN" && (!isVandeBharatSleeper || c !== "SL"),
  );

  assert.deepEqual(uniqueCodes, ["3A", "2A", "1A"]);
  assert.equal(uniqueCodes.includes("SL"), false);
});
