import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bookingPriceItems,
  calculatePayableTotal,
  formatBookingAmount,
} from "./bookingPrice";
import type { SplitBookingPrice } from "./split-booking";

describe("bookingPrice utilities", () => {
  const samplePrice: SplitBookingPrice = {
    totalFare: 620,
    irctcServiceFee: 35.4,
    serviceFee: 40,
    paymentGatewayFee: 20.86,
    amount: 716,
  };

  it("calculates payable total without insurance and includes IRCTC payment gateway fees", () => {
    const totalWithoutInsurance = calculatePayableTotal(samplePrice, {
      travelInsurance: false,
    });
    // 620 + 35.40 + 20.86 + 40 = 716.26
    assert.equal(totalWithoutInsurance, 716.26);
  });

  it("calculates payable total with insurance added (₹0.45 per passenger)", () => {
    const totalWithInsurance = calculatePayableTotal(samplePrice, {
      travelInsurance: true,
    });
    // 620 + 35.40 + 20.86 + 40 + 0.45 = 716.71
    assert.equal(totalWithInsurance, 716.71);
  });

  it("calculates payable total with multi-leg insurance (e.g. 5 legs = 5 * 0.45 = 2.25)", () => {
    const totalWith5Legs = calculatePayableTotal(samplePrice, {
      travelInsurance: true,
      legCount: 5,
    });
    // 620 + 35.40 + 20.86 + 40 + 2.25 = 718.51
    assert.equal(totalWith5Legs, 718.51);

    const items = bookingPriceItems(samplePrice, {
      travelInsurance: true,
      legCount: 5,
    });
    const insuranceItem = items.find(([label]) => label === "Travel Insurance");
    assert.deepEqual(insuranceItem, ["Travel Insurance", 2.25]);
  });

  it("includes IRCTC Payment Gateway Fee in calculation items and adds Travel Insurance when selected", () => {
    const items = bookingPriceItems(samplePrice, { travelInsurance: true });
    const labels = items.map(([label]) => label);

    assert.ok(labels.includes("Ticket Fare"));
    assert.ok(labels.includes("IRCTC Service Charge"));
    assert.ok(labels.includes("IRCTC Payment Gateway Fee"));
    assert.ok(labels.includes("LastBerth Service Charge"));
    assert.ok(labels.includes("Travel Insurance"));

    const pgItem = items.find(([label]) => label === "IRCTC Payment Gateway Fee");
    assert.deepEqual(pgItem, ["IRCTC Payment Gateway Fee", 20.86]);

    const insuranceItem = items.find(([label]) => label === "Travel Insurance");
    assert.deepEqual(insuranceItem, ["Travel Insurance", 0.45]);
  });

  it("omits Travel Insurance when not selected", () => {
    const items = bookingPriceItems(samplePrice, { travelInsurance: false });
    const labels = items.map(([label]) => label);

    assert.ok(!labels.includes("Travel Insurance"));
  });

  it("formats INR currency correctly", () => {
    const formatted = formatBookingAmount(695.85);
    assert.ok(formatted.includes("695.85"));
  });
});
