import { test, describe } from "node:test";
import assert from "node:assert/strict";

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
      const diff = (parseInt(a.trainNumber, 10) || 0) - (parseInt(b.trainNumber, 10) || 0);
      return diff !== 0 ? diff : (a.trainNumber < b.trainNumber ? -1 : a.trainNumber > b.trainNumber ? 1 : 0);
    });

    const sortedNumbers = testItems.map((item) => item.trainNumber);
    assert.deepEqual(sortedNumbers, ["00961", "01001", "1080", "12015", "22439"]);
  });
});
