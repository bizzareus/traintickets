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
    [1120, ['2A'], 35.4, 40, 35.86, 1231],
    [1120, ['SL'], 17.7, 40, 35.33, 1213],
    [810, ['3A', '3A'], 70.8, 80, 28.82, 990],
    [810, ['SL', '3A'], 53.1, 80, 28.29, 971],
    [1110, ['3A', '3A', '3A'], 106.2, 120, 40.09, 1376],
  ])(
    'prices fare ₹%s and classes %j with a whole-rupee total',
    (fare, classes, irctc, service, gateway, total) => {
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
        amount: total,
      });
      // Muzobox rejects fractional rupee amounts: the chargeable total must
      // always be an integer even though the components keep paise precision.
      expect(Number.isInteger(price.amount)).toBe(true);
    },
  );

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

  it('rounds the combined gateway fee once rather than rounding each leg', () => {
    const saved = calculateBookingCharges(5, [
      { travelClass: 'SL' },
      { travelClass: 'SL' },
    ]);
    expect(saved.paymentGatewayFeePaise).toBe(361);
    expect(bookingAmountPaise(saved)).toBe(12401);
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

  it('includes the saved four-component breakdown in HTML and plain-text receipts', () => {
    const saved = calculateBookingCharges(1120, [{ travelClass: '2A' }]);
    const html = bookingPriceHtml(saved);
    const text = bookingPriceText(saved);
    for (const label of [
      'Ticket Fare',
      'IRCTC Service Charge',
      'LastBerth Service Charge',
      'Payment Gateway Fees (3%)',
    ]) {
      expect(html).toContain(label);
      expect(text).toContain(label);
    }
    expect(html).toContain('₹1,231.00');
    expect(text).toContain('INR 35.86');
  });
});
