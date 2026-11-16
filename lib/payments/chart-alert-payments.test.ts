import test from "node:test";
import assert from "node:assert/strict";
import {
  chartAlertClassPriceLabel,
  chartAlertListPriceForClass,
  chartAlertPriceForClass,
  getChartAlertErrorMessage,
  parseChartAlertPriceOverrides,
} from "../chart-alert-payments";

test("chart alert pricing defaults to ₹100 for every class", () => {
  assert.equal(chartAlertPriceForClass("ANY"), 100);
  assert.equal(chartAlertPriceForClass(" any "), 100);
  assert.equal(chartAlertPriceForClass("3A"), 100);
  assert.equal(chartAlertPriceForClass("SL"), 100);
  assert.equal(chartAlertPriceForClass(""), 100);
  assert.equal(chartAlertPriceForClass(undefined), 100);
});

test("posthog payload overrides price per class with ANY catch-all", () => {
  const overrides = parseChartAlertPriceOverrides({ ANY: 100, "3A": 50 });
  assert.ok(overrides);
  assert.equal(chartAlertPriceForClass("3A", overrides), 50);
  assert.equal(chartAlertPriceForClass(" sl ", overrides), 100);
  assert.equal(chartAlertPriceForClass(undefined, overrides), 100);
  assert.equal(
    chartAlertPriceForClass("SL", parseChartAlertPriceOverrides({ sl: 30 })),
    30,
  );
  assert.equal(
    chartAlertPriceForClass(
      "1A",
      parseChartAlertPriceOverrides('{"1A": 150, "ANY": 100}'),
    ),
    150,
  );
  // Malformed/empty payloads fall back to the default
  assert.equal(
    chartAlertPriceForClass("3A", parseChartAlertPriceOverrides({})),
    100,
  );
  assert.equal(
    chartAlertPriceForClass("3A", parseChartAlertPriceOverrides(null)),
    100,
  );
});

test("chart alert list prices are twice the charged price", () => {
  assert.equal(chartAlertListPriceForClass("ANY"), 200);
  assert.equal(chartAlertListPriceForClass("3A"), 200);
  assert.equal(
    chartAlertListPriceForClass(
      "3A",
      parseChartAlertPriceOverrides({ "3A": 50 }),
    ),
    100,
  );
  assert.equal(
    chartAlertClassPriceLabel("ANY (Any Available Class)", "ANY"),
    "ANY (Any Available Class) — ₹200 → ₹100 (50% off)",
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
  assert.equal(chartAlertPriceForClass("1A"), 100);
  assert.equal(chartAlertPriceForClass("2A"), 100);
  assert.equal(chartAlertPriceForClass("3A"), 100);
  // Standard sleeper & chair classes
  assert.equal(chartAlertPriceForClass("SL"), 100);
  assert.equal(chartAlertPriceForClass("3E"), 100);
  assert.equal(chartAlertPriceForClass("CC"), 100);
  assert.equal(chartAlertPriceForClass("2S"), 100);
  // Case & whitespace insensitive
  assert.equal(chartAlertPriceForClass(" 3a "), 100);
  assert.equal(chartAlertPriceForClass(" sl "), 100);
});
