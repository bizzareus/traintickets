import test from "node:test";
import assert from "node:assert/strict";
import { safeCompareStrings } from "./security";

test("safeCompareStrings - matches identical strings", () => {
  assert.equal(safeCompareStrings("super-secret-key", "super-secret-key"), true);
});

test("safeCompareStrings - rejects mismatched strings of same length", () => {
  assert.equal(safeCompareStrings("super-secret-key", "super-secret-kex"), false);
});

test("safeCompareStrings - rejects mismatched strings of different length", () => {
  assert.equal(safeCompareStrings("super-secret-key", "short"), false);
});

test("safeCompareStrings - returns false for empty, null, or undefined values", () => {
  assert.equal(safeCompareStrings("", "secret"), false);
  assert.equal(safeCompareStrings("secret", ""), false);
  assert.equal(safeCompareStrings(null, "secret"), false);
  assert.equal(safeCompareStrings("secret", undefined), false);
  assert.equal(safeCompareStrings(null, undefined), false);
});
