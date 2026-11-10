import test from "node:test";
import assert from "node:assert/strict";
import {
  getTopTrainSlugs,
  buildTrainSlug,
  parseTrainNumberFromParam,
  getTrainIndex,
  CORE_TRAIN_NUMBERS,
} from "./trainSlug";

test("buildTrainSlug constructs correct slugs", () => {
  assert.equal(
    buildTrainSlug("12015", "Ajmer Shatabdi"),
    "12015-ajmer-shatabdi",
  );
  assert.equal(buildTrainSlug("12015"), "12015");
  assert.equal(buildTrainSlug(" 12015 ", null), "12015");
});

test("parseTrainNumberFromParam extracts leading train number", () => {
  assert.equal(
    parseTrainNumberFromParam("12015-ajmer-shatabdi"),
    "12015",
  );
  assert.equal(parseTrainNumberFromParam("12015"), "12015");
  assert.equal(parseTrainNumberFromParam(""), null);
});

test("getTopTrainSlugs returns stable core trains first and respects limit", () => {
  const slugs = getTopTrainSlugs(100);
  assert.equal(slugs.length, 100);
  // Ensure the core trains are in the first CORE_TRAIN_NUMBERS.length entries
  for (let i = 0; i < CORE_TRAIN_NUMBERS.length; i++) {
    const num = CORE_TRAIN_NUMBERS[i];
    assert.ok(
      slugs[i].startsWith(num),
      `Expected ${slugs[i]} to start with core train number ${num}`,
    );
  }
});

test("getTopTrainSlugs returns cached results on subsequent calls", () => {
  const first = getTopTrainSlugs(500);
  const second = getTopTrainSlugs(500);
  assert.equal(first, second);
  assert.equal(first.length, 500);
});

test("getTrainIndex caches and returns the exact same Map instance across invocations", () => {
  const index1 = getTrainIndex();
  const index2 = getTrainIndex();
  assert.equal(index1, index2);
  assert.ok(index1.size > 0);
  assert.ok(index1.has("12015"));
  const ajmer = index1.get("12015");
  assert.equal(ajmer?.trainNumber, "12015");
  assert.ok(ajmer?.trainName.includes("Shatabdi"));
});
