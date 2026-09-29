import test from "node:test";
import assert from "node:assert/strict";
import { trainStartYmdForBoarding } from "../chartTimeDisplay";

test("trainStartYmdForBoarding keeps a Day-1 boarding date unchanged", () => {
  assert.equal(trainStartYmdForBoarding("2026-09-30", 1), "2026-09-30");
});

test("trainStartYmdForBoarding derives the run date for a later station", () => {
  assert.equal(trainStartYmdForBoarding("2026-09-30", 2), "2026-09-29");
});

test("trainStartYmdForBoarding handles month boundaries", () => {
  assert.equal(trainStartYmdForBoarding("2026-10-01", 3), "2026-09-29");
});
