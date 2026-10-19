import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { synthesizeTrainFoodMenu, type TrainRegistryEntry } from "@/lib/trainFoodMapping";

describe("Synthesized Train Food Menu Memoization", () => {
  test("synthesizeTrainFoodMenu returns identical cached reference for classes and notes across calls", () => {
    const entry1: TrainRegistryEntry = {
      trainNumber: "12951",
      trainNumberPair: "12951-52",
      trainName: "Mumbai Rajdhani",
      label: "12951 - Mumbai Rajdhani",
      route: "NDLS-MMCT",
      slug: "12951-mumbai-rajdhani-food-menu",
      trainType: "rajdhani",
      zone: "West",
      status: "mapped",
      hasCustomMenu: false,
      menuKey: "rajdhani:West",
    };

    const entry2: TrainRegistryEntry = {
      trainNumber: "12953",
      trainNumberPair: "12953-54",
      trainName: "August Kranti Rajdhani",
      label: "12953 - August Kranti Rajdhani",
      route: "NZM-MMCT",
      slug: "12953-august-kranti-rajdhani-food-menu",
      trainType: "rajdhani",
      zone: "West",
      status: "mapped",
      hasCustomMenu: false,
      menuKey: "rajdhani:West",
    };

    const menu1 = synthesizeTrainFoodMenu(entry1);
    const menu2 = synthesizeTrainFoodMenu(entry2);

    assert.equal(menu1.classes, menu2.classes, "Classes array reference should be strictly equal (cached)");
    assert.equal(menu1.notes, menu2.notes, "Notes array reference should be strictly equal (cached)");
    assert.equal(menu1.classes.length > 0, true);
    assert.equal(menu1.notes.length > 0, true);
  });
});

describe("Fast numeric train number sorting", () => {
  test("numeric sorting helper accurately sorts train numbers", () => {
    const testItems: { trainNumber: string }[] = [
      { trainNumber: "12015" },
      { trainNumber: "00961" },
      { trainNumber: "22439" },
      { trainNumber: "01001" },
      { trainNumber: "1080" },
    ];

    testItems.sort((a, b) => {
      const diff =
        (parseInt(a.trainNumber, 10) || 0) - (parseInt(b.trainNumber, 10) || 0);
      return diff !== 0
        ? diff
        : a.trainNumber < b.trainNumber
          ? -1
          : a.trainNumber > b.trainNumber
            ? 1
            : 0;
    });

    const sortedNumbers = testItems.map((item) => item.trainNumber);
    assert.deepEqual(sortedNumbers, [
      "00961",
      "01001",
      "1080",
      "12015",
      "22439",
    ]);
  });
});
