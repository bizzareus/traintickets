import {
  bookingAmountPaise,
  bookingPrice,
  calculateBookingCharges,
} from './split-booking.pricing';
import {
  bookingPriceHtml,
  bookingPriceText,
} from './split-booking.price-summary';

describe('Itemized booking pricing', () => {
  it.each([
    [1120, ['2A'], 35.4, 40, 13.64, 0.45, 1209],
    [1120, ['SL'], 17.7, 40, 13.43, 0.45, 1192],
    [810, ['3A', '3A'], 70.8, 80, 10.4, 0.9, 972],
    [810, ['SL', '3A'], 53.1, 80, 10.2, 0.9, 954],
    [1110, ['3A', '3A', '3A'], 106.2, 120, 14.37, 1.35, 1352],
    [2500, ['3A', '3A', '3A', '3A', '3A'], 177, 200, 31.62, 2.25, 2911],
    [265, ['SL'], 17.7, 40, 3.34, 0.45, 326],
  ])(
    'prices fare ₹%s and classes %j with a whole-rupee total',
    (fare, classes, irctc, service, gateway, insurance, total) => {
      const stored = calculateBookingCharges(
        fare,
        classes.map((travelClass) => ({ travelClass })),
      );
      const price = bookingPrice(stored);
      expect(price).toEqual({
        totalFare: fare,
        irctcServiceFee: irctc,
        serviceFee: service,
        paymentGatewayFee: gateway,
        travelInsuranceFee: insurance,
        amount: total,
      });
      // Muzobox rejects fractional rupee amounts: the chargeable total must
      // always be an integer even though the components keep paise precision.
      expect(Number.isInteger(price.amount)).toBe(true);
    },
  );

  it('multiplies insurance by the number of legs (e.g. 5 legs = 5 * 0.45 = 2.25)', () => {
    const fiveLegs = calculateBookingCharges(
      1500,
      [
        { travelClass: 'SL' },
        { travelClass: 'SL' },
        { travelClass: 'SL' },
        { travelClass: 'SL' },
        { travelClass: 'SL' },
      ],
      { travelInsurance: true },
    );
    expect(fiveLegs.travelInsurancePaise).toBe(225);
    const price = bookingPrice(fiveLegs);
    expect(price.travelInsuranceFee).toBe(2.25);
  });

  it('supports opting out of travel insurance', () => {
    const stored = calculateBookingCharges(1120, [{ travelClass: '2A' }], {
      travelInsurance: false,
    });
    const price = bookingPrice(stored);
    expect(price).toEqual({
      totalFare: 1120,
      irctcServiceFee: 35.4,
      serviceFee: 40,
      paymentGatewayFee: 13.63,
      travelInsuranceFee: 0,
      amount: 1209,
    });
  });

  it.each(['SL', '2S', '1A', '2A', '3A', '3E', 'CC', 'EC'])(
    'supports the advertised %s class',
    (travelClass) => {
      expect(() =>
        calculateBookingCharges(1000, [{ travelClass }]),
      ).not.toThrow();
    },
  );

  it('normalizes class codes and rejects unknown classes', () => {
    expect(
      calculateBookingCharges(1000, [{ travelClass: ' sl ' }])
        .irctcServiceFeePaise,
    ).toBe(1770);
    expect(() =>
      calculateBookingCharges(1000, [{ travelClass: 'INVALID' }]),
    ).toThrow('Unsupported travel class');
  });

  it('calculates gateway fee on IRCTC ticket charges', () => {
    const saved = calculateBookingCharges(5, [
      { travelClass: 'SL' },
      { travelClass: 'SL' },
    ]);
    expect(saved.paymentGatewayFeePaise).toBe(49);
    expect(bookingAmountPaise(saved)).toBe(12179);
  });

  it('rounds half rupees up to the next whole rupee', () => {
    // 100 + 40 + 17.70 + 6.80 = 164.50 exact.
    const half = {
      totalFare: 100,
      serviceFee: 40,
      irctcServiceFeePaise: 1770,
      paymentGatewayFeePaise: 680,
    };
    expect(bookingAmountPaise(half)).toBe(16450);
    expect(bookingPrice(half).amount).toBe(165);
  });

  it('preserves legacy bookings and reads saved charges instead of current rates', () => {
    const legacy = {
      totalFare: 810,
      serviceFee: 50,
      irctcServiceFeePaise: 0,
      paymentGatewayFeePaise: 0,
    };
    expect(bookingPrice(legacy).amount).toBe(860);
    const saved = {
      ...legacy,
      irctcServiceFeePaise: 1234,
      paymentGatewayFeePaise: 4321,
    };
    expect(bookingAmountPaise(saved)).toBe(91555);
  });

  it.each([0, -1, NaN, 10.5, Number.MAX_SAFE_INTEGER])(
    'rejects unsupported fare %s',
    (fare) => {
      expect(() =>
        calculateBookingCharges(fare, [{ travelClass: 'SL' }]),
      ).toThrow();
    },
  );

  it('includes the itemized breakdown in HTML and plain-text receipts with IRCTC gateway fees', () => {
    const saved = calculateBookingCharges(1120, [{ travelClass: '2A' }]);
    const html = bookingPriceHtml(saved);
    const text = bookingPriceText(saved);
    for (const label of [
      'Ticket Fare',
      'IRCTC Service Charge',
      'IRCTC Payment Gateway Fee',
      'LastBerth Service Charge',
      'Travel Insurance',
    ]) {
      expect(html).toContain(label);
      expect(text).toContain(label);
    }
    expect(html).toContain('₹1,209.00');
    expect(text).toContain('INR 13.64');
  });

  it('includes payment gateway fees for bookings that have it saved', () => {
    const legacy = {
      totalFare: 1120,
      serviceFee: 40,
      irctcServiceFeePaise: 3540,
      paymentGatewayFeePaise: 3586,
    };
    const html = bookingPriceHtml(legacy);
    const text = bookingPriceText(legacy);
    expect(html).toContain('IRCTC Payment Gateway Fee');
    expect(text).toContain('IRCTC Payment Gateway Fee');
    expect(html).toContain('₹1,231.00');
    expect(text).toContain('INR 35.86');
  });
});
