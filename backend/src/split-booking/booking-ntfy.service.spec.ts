import type { SplitTicketBooking } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { createRetryingAxiosClient } from '../common/retrying-axios';
import { BookingNtfyService, BOOKING_NTFY_URL } from './booking-ntfy.service';

jest.mock('../common/retrying-axios', () => ({
  createRetryingAxiosClient: jest.fn(),
}));

describe('Paid booking ntfy notifications', () => {
  const post = jest.fn();
  const updateMany = jest.fn();
  let service: BookingNtfyService;
  let booking: SplitTicketBooking;

  beforeEach(() => {
    jest.clearAllMocks();
    post.mockReset().mockResolvedValue({ data: { id: 'ntfy-message' } });
    updateMany.mockReset().mockResolvedValue({ count: 1 });
    jest
      .mocked(createRetryingAxiosClient)
      .mockReturnValue({ post } as unknown as ReturnType<
        typeof createRetryingAxiosClient
      >);
    service = new BookingNtfyService({
      splitTicketBooking: { updateMany },
    } as unknown as PrismaService);
    booking = {
      id: 'booking-1',
      bookingRef: 'LB-D93CI',
      trainNumber: '20961',
      trainName: 'TEST EXPRESS',
      fromStationCode: 'NDLS',
      toStationCode: 'AII',
      journeyDate: new Date('2026-11-10'),
      travelClass: '2A',
      quota: 'GN',
      totalFare: 1120,
      serviceFee: 40,
      irctcServiceFeePaise: 3540,
      paymentGatewayFeePaise: 3586,
      bookingMode: 'MANUAL',
      paymentStatus: 'PAID',
      bookingStatus: 'QUEUED',
      contactMobile: '9876543210',
      contactEmail: 'passenger@example.com',
      paidAt: new Date('2026-10-12T08:00:00Z'),
      razorpayPaymentId: 'pay-test',
      razorpayOrderId: 'order-test',
      passengers: {
        adults: [
          {
            name: 'Test **Passenger**',
            age: 30,
            gender: 'Male',
            berthPreference: 'Lower',
          },
        ],
        children: [],
        travelInsurance: true,
      },
      legsPayload: [
        {
          from: 'NDLS',
          to: 'AII',
          boardingDate: '2026-11-10',
          travelClass: '2A',
          fare: 1120,
          availability: 'AVAILABLE 12',
        },
      ],
      autoUpgrade: true,
      ntfyNotifiedAt: null,
      ntfyLockedAt: null,
    } as SplitTicketBooking;
  });

  it.each(['AI', 'MANUAL'] as const)(
    'posts complete Markdown details for %s bookings',
    async (bookingMode) => {
      booking.bookingMode = bookingMode;
      await expect(service.publish(booking)).resolves.toBe(true);
      expect(post).toHaveBeenCalledTimes(1);
      const [url, body, config] = post.mock.calls[0] as [
        string,
        string,
        { headers: Record<string, string> },
      ];
      expect(url).toBe(BOOKING_NTFY_URL);
      expect(config.headers['Content-Type']).toBe(
        'text/markdown; charset=utf-8',
      );
      expect(config.headers['X-Markdown']).toBe('true');
      expect(config.headers['X-Sequence-ID']).toBe(booking.id);
      const title = Buffer.from(
        config.headers['X-Title'].slice(10, -2),
        'base64',
      ).toString('utf8');
      expect(title).toBe('[Manual Booking] LB-D93CI — Train 20961');
      for (const text of [
        '# Paid booking request',
        '## Journey legs',
        '## Passengers',
        '## Contact',
        '## Payment',
        'LB-D93CI',
        '20961',
        'AVAILABLE 12',
        '9876543210',
        'passenger@example.com',
        'IRCTC Service Charge',
        'LastBerth Service Charge',
        'Travel Insurance',
        'IRCTC Payment Gateway Fee',
        '1232.00',
        'pay-test',
        'order-test',
      ]) {
        expect(body).toContain(text);
      }
      expect(body).toContain('Test \\*\\*Passenger\\*\\*');
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { ntfyNotifiedAt: expect.any(Date), ntfyLockedAt: null },
        }),
      );
    },
  );

  it('does not publish pending/unverified payments', async () => {
    booking.paymentStatus = 'PENDING';
    await expect(service.publish(booking)).resolves.toBe(false);
    expect(post).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('does not repost a delivered booking', async () => {
    booking.ntfyNotifiedAt = new Date();
    await expect(service.publish(booking)).resolves.toBe(true);
    expect(post).not.toHaveBeenCalled();
  });

  it('allows only one concurrent publisher to acquire the database lease', async () => {
    updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    await Promise.all([service.publish(booking), service.publish(booking)]);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it.each([new Error('ntfy unavailable'), null])(
    'releases failed delivery for a later retry: %s',
    async (error) => {
      if (error) post.mockRejectedValueOnce(error);
      else post.mockResolvedValueOnce({ data: {} });
      await expect(service.publish(booking)).resolves.toBe(false);
      expect(updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ntfyNotifiedAt: expect.any(Date) }),
        }),
      );
      expect(updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: { ntfyLockedAt: null } }),
      );
      post.mockResolvedValueOnce({ data: { id: 'retry-message' } });
      await expect(service.publish(booking)).resolves.toBe(true);
      expect(post.mock.calls[1][2].headers['X-Sequence-ID']).toBe(booking.id);
    },
  );
});
