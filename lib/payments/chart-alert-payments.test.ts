import test from "node:test";
import assert from "node:assert/strict";
import {
  chartAlertClassPriceLabel,
  chartAlertListPriceForClass,
  chartAlertPriceForClass,
  getChartAlertErrorMessage,
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

import { createRequire } from "node:module";

test("getChartAlertErrorMessage triggers Sentry when payment system unavailable error is returned", () => {
  const req = createRequire(process.cwd() + "/index.js")("@sentry/nextjs");
  const original = req.captureException;
  const captured: unknown[] = [];
  req.captureException = (err: unknown) => {
    captured.push(err);
    return "mock-event-id";
  };

  try {
    const errorObj = {
      response: {
        data: {
          message:
            "Payment system is currently unavailable. Please try again later.",
        },
      },
    };

    const msg = getChartAlertErrorMessage(errorObj, "Fallback error");
    assert.equal(
      msg,
      "Payment system is currently unavailable. Please try again later.",
    );
    assert.equal(captured.length, 1);

    // Calling it again on the same object should not trigger Sentry twice
    getChartAlertErrorMessage(errorObj, "Fallback error");
    assert.equal(captured.length, 1);

    // Other errors do not trigger Sentry
    const regularErr = {
      response: {
        data: {
          message: "Invalid train number",
        },
      },
    };
    getChartAlertErrorMessage(regularErr, "Fallback error");
    assert.equal(captured.length, 1);
  } finally {
    req.captureException = original;
  }
});

test("chart alert pricing handles all common PNR travel classes", () => {
  // AC classes
  assert.equal(chartAlertPriceForClass("1A"), 25);
  assert.equal(chartAlertPriceForClass("2A"), 25);
  assert.equal(chartAlertPriceForClass("3A"), 25);
  // Standard sleeper & chair classes
  assert.equal(chartAlertPriceForClass("SL"), 10);
  assert.equal(chartAlertPriceForClass("3E"), 10);
  assert.equal(chartAlertPriceForClass("CC"), 10);
  assert.equal(chartAlertPriceForClass("2S"), 10);
  // Case & whitespace insensitive
  assert.equal(chartAlertPriceForClass(" 3a "), 25);
  assert.equal(chartAlertPriceForClass(" sl "), 10);
  assert.equal(chartAlertPriceForClass(""), 10);
  assert.equal(chartAlertPriceForClass(undefined), 10);
});

