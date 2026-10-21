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
    [1120, ['2A'], 35.4, 40, 0, 0.45, 1196],
    [1120, ['SL'], 17.7, 40, 0, 0.45, 1178],
    [810, ['3A', '3A'], 70.8, 80, 0, 0.45, 961],
    [810, ['SL', '3A'], 53.1, 80, 0, 0.45, 944],
    [1110, ['3A', '3A', '3A'], 106.2, 120, 0, 0.45, 1337],
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

  it('supports opting out of travel insurance', () => {
    const stored = calculateBookingCharges(1120, [{ travelClass: '2A' }], {
      travelInsurance: false,
    });
    const price = bookingPrice(stored);
    expect(price).toEqual({
      totalFare: 1120,
      irctcServiceFee: 35.4,
      serviceFee: 40,
      paymentGatewayFee: 0,
      travelInsuranceFee: 0,
      amount: 1195,
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

  it('does not calculate gateway fee when paymentGatewayPercent is 0', () => {
    const saved = calculateBookingCharges(5, [
      { travelClass: 'SL' },
      { travelClass: 'SL' },
    ]);
    expect(saved.paymentGatewayFeePaise).toBe(0);
    expect(bookingAmountPaise(saved)).toBe(12085);
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

  it('includes the itemized breakdown in HTML and plain-text receipts without gateway fees', () => {
    const saved = calculateBookingCharges(1120, [{ travelClass: '2A' }]);
    const html = bookingPriceHtml(saved);
    const text = bookingPriceText(saved);
    for (const label of [
      'Ticket Fare',
      'IRCTC Service Charge',
      'LastBerth Service Charge',
      'Travel Insurance',
    ]) {
      expect(html).toContain(label);
      expect(text).toContain(label);
    }
    expect(html).not.toContain('Payment Gateway Fees');
    expect(text).not.toContain('Payment Gateway Fees');
    expect(html).toContain('₹1,196.00');
    expect(text).toContain('INR 35.40');
  });

  it('includes payment gateway fees for legacy bookings that have it saved', () => {
    const legacy = {
      totalFare: 1120,
      serviceFee: 40,
      irctcServiceFeePaise: 3540,
      paymentGatewayFeePaise: 3586,
    };
    const html = bookingPriceHtml(legacy);
    const text = bookingPriceText(legacy);
    expect(html).toContain('Payment Gateway Fees (3%)');
    expect(text).toContain('Payment Gateway Fees (3%)');
    expect(html).toContain('₹1,231.00');
    expect(text).toContain('INR 35.86');
  });
});
