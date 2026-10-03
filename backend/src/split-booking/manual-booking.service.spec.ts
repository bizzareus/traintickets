import { ConfigService } from '@nestjs/config';
import type { SplitTicketBooking } from '@prisma/client';
import type { NotificationService } from '../notification/notification.service';
import type { WasenderProvider } from '../notification/whatsapp-providers/wasender.provider';
import type { PrismaService } from '../prisma/prisma.service';
import { ManualBookingService } from './manual-booking.service';

describe('Manual booking owner notifications', () => {
  const sendEmail = jest.fn();
  const sendWhatsApp = jest.fn();
  const update = jest.fn();
  let booking: SplitTicketBooking;
  let service: ManualBookingService;

  beforeEach(() => {
    jest.resetAllMocks();
    sendEmail.mockResolvedValue(true);
    sendWhatsApp.mockResolvedValue(true);
    update.mockResolvedValue({});
    service = new ManualBookingService(
      new ConfigService({ WHATSAPP_PROVIDER: 'msg91' }),
      { sendEmail } as unknown as NotificationService,
      { sendWhatsApp } as unknown as WasenderProvider,
      { splitTicketBooking: { update } } as unknown as PrismaService,
    );
    booking = {
      id: 'manual1',
      bookingRef: 'LB-SB-MANUAL',
      bookingMode: 'MANUAL',
      trainNumber: '12216',
      trainName: 'DEE GARIBRATH',
      fromStationCode: 'AII',
      toStationCode: 'GGN',
      journeyDate: new Date('2026-10-02'),
      travelClass: '3A',
      quota: 'GN',
      totalFare: 810,
      serviceFee: 50,
      legsPayload: [
        {
          from: 'AII',
          to: 'JP',
          boardingDate: '2026-10-02',
          travelClass: '3A',
          fare: 340,
          departureTime: '22:00',
          arrivalTime: '01:00',
          durationMinutes: 180,
        },
        {
          from: 'JP',
          to: 'GGN',
          boardingDate: '2026-10-03',
          travelClass: '3A',
          fare: 470,
        },
      ],
      passengers: {
        adults: [
          {
            name: 'A <script>alert(1)</script>',
            age: 62,
            gender: 'Male',
            berthPreference: 'Side Lower',
            seniorCitizen: true,
          },
        ],
        children: [{ name: 'Infant', age: 2, gender: 'Female' }],
      },
      contactMobile: '9876543210',
      contactEmail: 'customer@example.com',
      autoUpgrade: false,
      paymentStatus: 'PAID',
      razorpayOrderId: 'order1',
      razorpayPaymentId: 'pay1',
      paidAt: new Date('2026-10-01T10:00:00Z'),
      bookingStatus: 'IN_PROGRESS',
      automationLogs: [],
      pnrLeg1: null,
      pnrLeg2: null,
      pnrs: [],
      bookingError: null,
      completedAt: null,
      manualEmailSentAt: null,
      manualWhatsappSentAt: null,
      createdAt: new Date('2026-10-01T09:00:00Z'),
      updatedAt: new Date('2026-10-01T10:00:00Z'),
    };
  });

  it('emails all customer details and uses Wasender directly for the owner number', async () => {
    await expect(service.notify(booking)).resolves.toEqual({
      emailSent: true,
      whatsappSent: true,
    });
    const [to, subject, html] = sendEmail.mock.calls[0] as [
      string,
      string,
      string,
    ];
    const [whatsapp] = sendWhatsApp.mock.calls[0] as [
      { mobile: string; text: string },
    ];
    expect(to).toBe('me@kartikarora.in');
    expect(subject).toContain('LB-SB-MANUAL');
    expect(whatsapp.mobile).toBe('+919999224767');
    for (const detail of [
      '12216',
      'DEE GARIBRATH',
      'AII',
      'JP',
      'GGN',
      '2026-10-03',
      '22:00',
      '01:00',
      '180',
      '3A',
      'GN',
      '340',
      '470',
      '810',
      'Payment service charge: INR 50',
      'Total collected: INR 860',
      '62',
      'Side Lower',
      'Senior citizen: Yes',
      'Infant',
      'Age: 2',
      'Female',
      'Auto-upgrade: No',
      '9876543210',
      'customer@example.com',
      'pay1',
      'order1',
      'PAID',
    ]) {
      expect(html).toContain(detail);
      expect(whatsapp.text).toContain(detail);
    }
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(update).toHaveBeenCalledTimes(2);
    const updates = update.mock.calls as [
      { where: { id: string }; data: Partial<SplitTicketBooking> },
    ][];
    expect(updates.every(([call]) => call.where.id === booking.id)).toBe(true);
    expect(
      updates.find(([call]) => call.data.manualEmailSentAt)?.[0].data
        .manualEmailSentAt,
    ).toBeInstanceOf(Date);
    expect(
      updates.find(([call]) => call.data.manualWhatsappSentAt)?.[0].data
        .manualWhatsappSentAt,
    ).toBeInstanceOf(Date);
  });

  it('still attempts WhatsApp if email throws and persists only successful delivery', async () => {
    sendEmail.mockRejectedValue(new Error('Email unavailable'));
    await expect(service.notify(booking)).resolves.toEqual({
      emailSent: false,
      whatsappSent: true,
    });
    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('includes every leg and a single fee in the manual handoff', async () => {
    booking.legsPayload = [
      {
        from: 'DEE',
        to: 'AWR',
        fare: 385,
        travelClass: '3A',
        boardingDate: '2026-10-01',
      },
      {
        from: 'AWR',
        to: 'JP',
        fare: 385,
        travelClass: '3A',
        boardingDate: '2026-10-01',
      },
      {
        from: 'JP',
        to: 'AII',
        fare: 340,
        travelClass: '3A',
        boardingDate: '2026-10-01',
      },
    ];
    booking.fromStationCode = 'DEE';
    booking.toStationCode = 'AII';
    booking.totalFare = 1110;
    await service.notify(booking);
    const [, , html] = sendEmail.mock.calls[0] as [string, string, string];
    const [whatsapp] = sendWhatsApp.mock.calls[0] as [{ text: string }];
    for (const detail of [
      '1. DEE → AWR',
      '2. AWR → JP',
      '3. JP → AII',
      'Ticket fare: INR 1110 + Payment service charge: INR 50',
      'Total collected: INR 1160',
    ]) {
      expect(html).toContain(detail);
      expect(whatsapp.text).toContain(detail);
    }
  });

  it('does not report provider rejection as a successful handoff', async () => {
    sendEmail.mockResolvedValue(false);
    sendWhatsApp.mockResolvedValue(false);
    await expect(service.notify(booking)).resolves.toEqual({
      emailSent: false,
      whatsappSent: false,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('retries only the missing channel', async () => {
    booking.manualEmailSentAt = new Date();
    await expect(service.notify(booking)).resolves.toEqual({
      emailSent: true,
      whatsappSent: true,
    });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when both channel receipts already exist', async () => {
    booking.manualEmailSentAt = new Date();
    booking.manualWhatsappSentAt = new Date();
    await service.notify(booking);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  it('requires payment before sending passenger data to the owner', async () => {
    booking.paymentStatus = 'PENDING';
    await expect(service.notify(booking)).rejects.toThrow(
      'paid manual booking',
    );
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });
});
