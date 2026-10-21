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

  it("calculates payable total without insurance and excludes payment gateway fees", () => {
    const totalWithoutInsurance = calculatePayableTotal(samplePrice, {
      travelInsurance: false,
    });
    // 620 + 35.40 + 40 = 695.40
    assert.equal(totalWithoutInsurance, 695.4);
  });

  it("calculates payable total with insurance added (₹0.45 per passenger)", () => {
    const totalWithInsurance = calculatePayableTotal(samplePrice, {
      travelInsurance: true,
    });
    // 620 + 35.40 + 40 + 0.45 = 695.85
    assert.equal(Math.round(totalWithInsurance * 100) / 100, 695.85);
  });

  it("omits Payment Gateway Fees from calculation items and adds Travel Insurance when selected", () => {
    const items = bookingPriceItems(samplePrice, { travelInsurance: true });
    const labels = items.map(([label]) => label);

    assert.ok(labels.includes("Ticket Fare"));
    assert.ok(labels.includes("IRCTC Service Charge"));
    assert.ok(labels.includes("LastBerth Service Charge"));
    assert.ok(labels.includes("Travel Insurance"));
    assert.ok(!labels.some((l) => l.toLowerCase().includes("gateway")));

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
