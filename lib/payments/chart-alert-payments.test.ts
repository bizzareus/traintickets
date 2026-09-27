import test from "node:test";
import assert from "node:assert/strict";
import {
  chartAlertClassPriceLabel,
  chartAlertListPriceForClass,
  chartAlertPriceForClass,
} from "../chart-alert-payments";

test("chart alert pricing charges ₹50 for ANY and preserves other tiers", () => {
  assert.equal(chartAlertPriceForClass("ANY"), 50);
  assert.equal(chartAlertPriceForClass(" any "), 50);
  assert.equal(chartAlertPriceForClass("3A"), 25);
  assert.equal(chartAlertPriceForClass("SL"), 10);
});

test("chart alert list prices are twice the charged price", () => {
  assert.equal(chartAlertListPriceForClass("ANY"), 100);
  assert.equal(chartAlertListPriceForClass("3A"), 50);
  assert.equal(chartAlertListPriceForClass("SL"), 20);
  assert.equal(
    chartAlertClassPriceLabel("ANY (Any Available Class)", "ANY"),
    "ANY (Any Available Class) — ₹100 → ₹50 (50% off)",
  );
});
