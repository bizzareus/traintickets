import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SplitBookingService } from './split-booking.service';
import { PrismaService } from '../prisma/prisma.service';
import { RazorpayClient } from '../chart-alert-payments/razorpay.client';
import { TripmgtBookingService } from './tripmgt-booking.service';
import { ConfigService } from '@nestjs/config';
import { ManualBookingService } from './manual-booking.service';
import type { CreateSplitBookingDto } from './split-booking.types';

describe('SplitBookingService', () => {
  let service: SplitBookingService;
  let config: ConfigService;
  let manualBooking: { notify: jest.Mock };
  let prisma: {
    splitTicketBooking: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let razorpay: {
    isConfigured: boolean;
    createOrder: jest.Mock;
    createUpiQr: jest.Mock;
    resolveQrIntents: jest.Mock;
  };
  let tripmgt: {
    executeBooking: jest.Mock;
  };

  beforeEach(async () => {
    config = new ConfigService({ SPLIT_BOOKING_MODE: 'ai' });
    manualBooking = {
      notify: jest
        .fn()
        .mockResolvedValue({ emailSent: true, whatsappSent: true }),
    };
    prisma = {
      splitTicketBooking: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    razorpay = {
      isConfigured: false,
      createOrder: jest.fn(),
      createUpiQr: jest.fn(),
      resolveQrIntents: jest.fn(),
    };

    tripmgt = {
      executeBooking: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SplitBookingService,
        { provide: PrismaService, useValue: prisma },
        { provide: RazorpayClient, useValue: razorpay },
        { provide: TripmgtBookingService, useValue: tripmgt },
        { provide: ConfigService, useValue: config },
        { provide: ManualBookingService, useValue: manualBooking },
      ],
    }).compile();

    service = module.get<SplitBookingService>(SplitBookingService);
  });

  it('throws BadRequestException if missing mandatory fields', async () => {
    await expect(
      service.createBooking({
        trainNumber: '',
        fromStationCode: '',
        toStationCode: '',
        journeyDate: '2026-09-20',
        travelClass: '3A',
        totalFare: 810,
        legs: [],
        passengers: [],
        contactMobile: '',
        contactEmail: '',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it.each(['ai', 'manual'])(
    'persists %s mode when creating the booking',
    async (mode) => {
      config.set('SPLIT_BOOKING_MODE', mode);
      prisma.splitTicketBooking.create.mockResolvedValue({
        id: 'test-booking-id',
        bookingRef: 'LB-SB-TEST',
        totalFare: 810,
      });

      const result = await service.createBooking({
        trainNumber: '12216',
        trainName: 'DEE GARIBRATH',
        fromStationCode: 'AII',
        toStationCode: 'GGN',
        journeyDate: '2026-09-20',
        travelClass: '3A',
        totalFare: 810,
        legs: [
          {
            from: 'AII',
            to: 'JP',
            travelClass: '3A',
            fare: 340,
            boardingDate: '2026-09-20',
          },
          {
            from: 'JP',
            to: 'GGN',
            travelClass: '3A',
            fare: 470,
            boardingDate: '2026-09-20',
          },
        ],
        passengers: [
          {
            name: 'Rahul Sharma',
            age: 32,
            gender: 'Male',
            berthPreference: 'Lower',
          },
        ],
        contactMobile: '9876543210',
        contactEmail: 'rahul@example.com',
        autoUpgrade: true,
      });

      expect(result).toMatchObject({
        totalFare: 810,
        serviceFee: 50,
        amount: 860,
      });
      expect(result.bookingRef).toBeDefined();
      expect(result.upiIntent).toContain('upi://pay');
      expect(result.bookingMode).toBe(mode.toUpperCase());
      const [created] = prisma.splitTicketBooking.create.mock.calls[0] as [
        { data: { bookingMode: string; paymentStatus: string } },
      ];
      expect(created.data).toMatchObject({
        bookingMode: mode.toUpperCase(),
        paymentStatus: 'PENDING',
      });
      expect(manualBooking.notify).not.toHaveBeenCalled();
    },
  );

  it('retrieves booking status by bookingRef', async () => {
    prisma.splitTicketBooking.findUnique.mockResolvedValue({
      id: 'test-booking-id',
      bookingRef: 'LB-SB-1234',
      trainNumber: '12216',
      fromStationCode: 'AII',
      toStationCode: 'GGN',
      journeyDate: new Date('2026-09-20'),
      travelClass: '3A',
      totalFare: 810,
      serviceFee: 50,
      contactMobile: '9876543210',
      contactEmail: 'rahul@example.com',
      paymentStatus: 'PAID',
      bookingStatus: 'IN_PROGRESS',
      pnrLeg1: null,
      pnrLeg2: null,
      pnrs: [],
      automationLogs: [
        {
          timestamp: '2026-09-18T18:00:00.000Z',
          step: 'CREATED',
          message: 'Ready',
        },
      ],
      paidAt: new Date('2026-09-18T18:05:00.000Z'),
      completedAt: null,
    });

    const status = await service.getStatus('LB-SB-1234');
    expect(status.bookingRef).toBe('LB-SB-1234');
    expect(status.paymentStatus).toBe('PAID');
    expect(status.bookingStatus).toBe('IN_PROGRESS');
  });

  it('throws NotFoundException if booking reference does not exist', async () => {
    prisma.splitTicketBooking.findUnique.mockResolvedValue(null);
    await expect(service.getStatus('LB-SB-NONEXISTENT')).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('multi-leg checkout pricing', () => {
    const request: CreateSplitBookingDto = {
      trainNumber: '12215',
      trainName: 'BDTS GARIB RATH',
      fromStationCode: 'NDLS',
      toStationCode: 'AII',
      journeyDate: '2026-10-01',
      travelClass: '3A',
      quota: 'GN',
      totalFare: 1110,
      legs: [
        {
          from: 'DEE',
          to: 'AWR',
          travelClass: '3A',
          fare: 385,
          boardingDate: '2026-10-01',
        },
        {
          from: 'AWR',
          to: 'JP',
          travelClass: '3A',
          fare: 385,
          boardingDate: '2026-10-01',
        },
        {
          from: 'JP',
          to: 'AII',
          travelClass: '3A',
          fare: 340,
          boardingDate: '2026-10-01',
        },
      ],
      passengers: [{ name: 'Test Passenger', age: 30, gender: 'Female' }],
      childPassengers: [],
      autoUpgrade: true,
      contactMobile: '9876543210',
      contactEmail: 'test@example.com',
    };

    beforeEach(() => {
      prisma.splitTicketBooking.create.mockResolvedValue({
        id: 'three-leg-booking',
      });
    });

    it.each(['ai', 'manual'])(
      'accepts the reported route in %s mode and adds the service fee once',
      async (mode) => {
        config.set('SPLIT_BOOKING_MODE', mode);
        const result = await service.createBooking(request);
        expect(result).toMatchObject({
          totalFare: 1110,
          serviceFee: 50,
          amount: 1160,
        });
        expect(new URL(result.upiIntent).searchParams.get('am')).toBe('1160');
        const qrPayload = new URL(result.qrImageUrl).searchParams.get('data')!;
        expect(new URL(qrPayload).searchParams.get('am')).toBe('1160');
        const [created] = prisma.splitTicketBooking.create.mock.calls[0] as [
          { data: Record<string, unknown> },
        ];
        expect(created.data).toMatchObject({
          fromStationCode: 'DEE',
          toStationCode: 'AII',
          totalFare: 1110,
          serviceFee: 50,
          legsPayload: request.legs,
        });
      },
    );

    it('charges the fee in both the Razorpay order and QR', async () => {
      razorpay.isConfigured = true;
      razorpay.createOrder.mockResolvedValue({ id: 'order-live' });
      razorpay.createUpiQr.mockResolvedValue({
        imageUrl: 'https://example.test/qr.png',
      });
      razorpay.resolveQrIntents.mockResolvedValue({});
      await service.createBooking(request);
      expect(razorpay.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({ amountPaise: 116000 }),
      );
      expect(razorpay.createUpiQr).toHaveBeenCalledWith(
        expect.objectContaining({ amountPaise: 116000 }),
      );
    });

    it('does not accept a client-supplied service fee override', async () => {
      const tampered = { ...request, serviceFee: 0 };
      expect(await service.createBooking(tampered)).toMatchObject({
        serviceFee: 50,
        amount: 1160,
      });
    });

    it('calculates ₹11,100 + ₹50 as ₹11,150', async () => {
      expect(
        await service.createBooking({ ...request, totalFare: 11100 }),
      ).toMatchObject({
        totalFare: 11100,
        serviceFee: 50,
        amount: 11150,
      });
    });
  });

  describe('paid fulfillment', () => {
    const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
    const booking = {
      id: 'booking1',
      bookingRef: 'LB-SB-TEST',
      trainNumber: '12216',
      fromStationCode: 'AII',
      toStationCode: 'GGN',
      journeyDate: new Date('2026-10-01'),
      travelClass: '3A',
      totalFare: 810,
      serviceFee: 50,
      quota: 'GN',
      autoUpgrade: false,
      contactMobile: '9876543210',
      contactEmail: 'test@example.com',
      paymentStatus: 'PENDING',
      bookingStatus: 'IDLE',
      bookingMode: 'AI',
      pnrLeg1: null,
      pnrLeg2: null,
      pnrs: [],
      passengers: {
        adults: [{ name: 'Test', age: 30, gender: 'Male' }],
        children: [],
      },
      legsPayload: [
        {
          from: 'AII',
          to: 'JP',
          travelClass: '3A',
          fare: 340,
          boardingDate: '2026-10-01',
        },
        {
          from: 'JP',
          to: 'GGN',
          travelClass: '3A',
          fare: 470,
          boardingDate: '2026-10-02',
        },
      ],
      automationLogs: [
        {
          timestamp: '2026-09-30T00:00:00Z',
          step: 'CREATED',
          message: 'Created',
        },
      ],
    };

    it('dispatches only once for concurrent payment confirmations', async () => {
      config.set('SPLIT_BOOKING_MODE', 'manual'); // Existing AI requests keep their saved mode.
      prisma.splitTicketBooking.findUnique.mockResolvedValue(booking);
      let paymentClaimed = false;
      prisma.splitTicketBooking.updateMany.mockImplementation(
        ({ data }: { data: { bookingStatus: string } }) => {
          if (data.bookingStatus === 'IN_PROGRESS') return { count: 1 };
          const count = paymentClaimed ? 0 : 1;
          paymentClaimed = true;
          return { count };
        },
      );
      tripmgt.executeBooking.mockResolvedValue({
        success: false,
        pnrs: [],
        error: 'blocked',
        logs: [],
      });
      await Promise.all([
        service.confirmPayment(booking.bookingRef),
        service.confirmPayment(booking.bookingRef),
      ]);
      await flush();
      expect(tripmgt.executeBooking).toHaveBeenCalledTimes(1);
      expect(manualBooking.notify).not.toHaveBeenCalled();
      const [params, callbacks] = tripmgt.executeBooking.mock
        .calls[0] as Parameters<TripmgtBookingService['executeBooking']>;
      expect(params).toMatchObject({
        totalFare: 810,
        legs: booking.legsPayload,
      });
      expect(typeof callbacks?.onPnr).toBe('function');
    });

    it('persists each PNR immediately and keeps creation/payment logs after partial failure', async () => {
      const state = structuredClone(booking);
      prisma.splitTicketBooking.findUnique.mockImplementation(() => state);
      prisma.splitTicketBooking.updateMany.mockImplementation(
        ({ data }: { data: object }) => {
          Object.assign(state, data);
          return { count: 1 };
        },
      );
      type Callbacks = NonNullable<
        Parameters<TripmgtBookingService['executeBooking']>[1]
      >;
      tripmgt.executeBooking.mockImplementation(
        async (_params: unknown, callbacks: Callbacks) => {
          await callbacks.onPnr?.(0, '1234567890');
          await callbacks.onLog?.({
            timestamp: 'now',
            step: 'LEG_CONFIRMED',
            message: 'Leg 1 verified',
          });
          return {
            success: false,
            pnrs: ['1234567890'],
            error: 'OTP required',
            logs: [],
          };
        },
      );
      await service.confirmPayment(booking.bookingRef);
      await flush();
      expect(prisma.splitTicketBooking.update).toHaveBeenCalledWith({
        where: { id: 'booking1' },
        data: { pnrs: ['1234567890'], pnrLeg1: '1234567890', pnrLeg2: null },
      });
      const [finalUpdate] = prisma.splitTicketBooking.update.mock.calls.at(
        -1,
      ) as [
        {
          data: {
            bookingStatus: string;
            pnrLeg1: string;
            pnrLeg2: string | null;
            automationLogs: Array<{ step: string }>;
          };
        },
      ];
      expect(finalUpdate.data).toMatchObject({
        bookingStatus: 'FAILED',
        pnrLeg1: '1234567890',
        pnrLeg2: null,
      });
      expect(
        finalUpdate.data.automationLogs.map((entry) => entry.step),
      ).toEqual(['CREATED', 'PAYMENT_RECEIVED', 'LEG_CONFIRMED']);
    });

    it('does not launch if another runner already claimed fulfillment', async () => {
      prisma.splitTicketBooking.findUnique.mockResolvedValue(booking);
      prisma.splitTicketBooking.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      await service.confirmPayment(booking.bookingRef);
      await flush();
      expect(tripmgt.executeBooking).not.toHaveBeenCalled();
    });

    it('does not launch for an underpaid captured payment', async () => {
      prisma.splitTicketBooking.findUnique.mockResolvedValue(booking);
      await expect(
        service.confirmPayment(booking.bookingRef, 'pay1', {
          amount: 100,
          currency: 'INR',
        }),
      ).rejects.toThrow('does not match');
      expect(prisma.splitTicketBooking.updateMany).not.toHaveBeenCalled();
    });

    it('rejects payment of only the ticket fare when the booking includes a service fee', async () => {
      prisma.splitTicketBooking.findUnique.mockResolvedValue(booking);
      await expect(
        service.confirmPayment(booking.bookingRef, 'pay1', {
          amount: 81000,
          currency: 'INR',
        }),
      ).rejects.toThrow('does not match');
      expect(prisma.splitTicketBooking.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      [50, 86000],
      [0, 81000],
    ])(
      'validates the stored fee %i instead of repricing existing orders',
      async (serviceFee, amount) => {
        prisma.splitTicketBooking.findUnique.mockResolvedValue({
          ...booking,
          serviceFee,
        });
        prisma.splitTicketBooking.updateMany.mockResolvedValue({ count: 0 });
        const status = await service.confirmPayment(
          booking.bookingRef,
          'pay1',
          { amount, currency: 'INR' },
        );
        expect(status).toMatchObject({
          totalFare: 810,
          serviceFee,
          amount: amount / 100,
        });
        expect(prisma.splitTicketBooking.updateMany).toHaveBeenCalledTimes(1);
      },
    );

    it('persists a third PNR without overwriting either legacy PNR alias', async () => {
      const pnrs = ['1234567890', '2345678901', '3456789012'];
      const state = {
        ...structuredClone(booking),
        toStationCode: 'DEE',
        totalFare: 910,
        legsPayload: [
          ...booking.legsPayload,
          {
            from: 'GGN',
            to: 'DEE',
            fare: 100,
            travelClass: '3A',
            boardingDate: '2026-10-02',
          },
        ],
      };
      prisma.splitTicketBooking.findUnique.mockImplementation(() => state);
      prisma.splitTicketBooking.updateMany.mockImplementation(
        ({ data }: { data: object }) => {
          Object.assign(state, data);
          return { count: 1 };
        },
      );
      type Callbacks = NonNullable<
        Parameters<TripmgtBookingService['executeBooking']>[1]
      >;
      tripmgt.executeBooking.mockImplementation(
        async (_params: unknown, callbacks: Callbacks) => {
          for (const [index, pnr] of pnrs.entries())
            await callbacks.onPnr?.(index, pnr);
          return { success: true, pnrs, logs: [] };
        },
      );
      await service.confirmPayment(booking.bookingRef);
      await flush();
      const data = { pnrs, pnrLeg1: pnrs[0], pnrLeg2: pnrs[1] };
      expect(prisma.splitTicketBooking.update).toHaveBeenCalledWith({
        where: { id: booking.id },
        data,
      });
      const [finalUpdate] = prisma.splitTicketBooking.update.mock.calls.at(
        -1,
      ) as [{ data: Record<string, unknown> }];
      expect(finalUpdate.data).toMatchObject({
        ...data,
        bookingStatus: 'CONFIRMED',
      });
    });

    it('hands a manual booking to the owner without starting AI or confirming a ticket', async () => {
      const state = { ...structuredClone(booking), bookingMode: 'MANUAL' };
      prisma.splitTicketBooking.findUnique.mockImplementation(() => state);
      prisma.splitTicketBooking.updateMany.mockImplementation(
        ({ data }: { data: object }) => {
          Object.assign(state, data);
          return { count: 1 };
        },
      );
      await service.confirmPayment(booking.bookingRef, 'pay-manual');
      await flush();
      expect(manualBooking.notify).toHaveBeenCalledWith(state);
      expect(tripmgt.executeBooking).not.toHaveBeenCalled();
      expect(prisma.splitTicketBooking.update).toHaveBeenLastCalledWith({
        where: { id: booking.id },
        data: { bookingStatus: 'MANUAL_PENDING', bookingError: null },
      });
    });

    it('keeps a partially delivered manual request pending with an explicit error', async () => {
      prisma.splitTicketBooking.findUnique.mockResolvedValue({
        ...booking,
        bookingMode: 'MANUAL',
      });
      prisma.splitTicketBooking.updateMany.mockResolvedValue({ count: 1 });
      manualBooking.notify.mockResolvedValue({
        emailSent: false,
        whatsappSent: true,
      });
      await service.confirmPayment(booking.bookingRef);
      await flush();
      const [update] = prisma.splitTicketBooking.update.mock.calls.at(-1) as [
        { data: { bookingStatus: string; bookingError: string } },
      ];
      expect(update.data.bookingStatus).toBe('MANUAL_PENDING');
      expect(update.data.bookingError).toContain(
        'notification could not be delivered',
      );
      expect(tripmgt.executeBooking).not.toHaveBeenCalled();
    });

    it('does not resend a successfully handed-off manual request on duplicate payment callbacks', async () => {
      prisma.splitTicketBooking.findUnique.mockResolvedValue({
        ...booking,
        bookingMode: 'MANUAL',
        paymentStatus: 'PAID',
        bookingStatus: 'MANUAL_PENDING',
        manualEmailSentAt: new Date(),
        manualWhatsappSentAt: new Date(),
      });
      await service.confirmPayment(booking.bookingRef);
      await flush();
      expect(manualBooking.notify).not.toHaveBeenCalled();
      expect(prisma.splitTicketBooking.updateMany).not.toHaveBeenCalled();
    });

    it('refreshes manual delivery receipts after a late claim to avoid duplicate sends', async () => {
      const stale = {
        ...booking,
        bookingMode: 'MANUAL',
        paymentStatus: 'PAID',
        bookingStatus: 'MANUAL_PENDING',
        manualEmailSentAt: null,
        manualWhatsappSentAt: null,
      };
      const fresh = {
        ...stale,
        manualEmailSentAt: new Date(),
        manualWhatsappSentAt: new Date(),
      };
      prisma.splitTicketBooking.findUnique
        .mockResolvedValue(fresh)
        .mockResolvedValueOnce(stale)
        .mockResolvedValueOnce(stale);
      prisma.splitTicketBooking.updateMany.mockResolvedValue({ count: 1 });
      await service.confirmPayment(booking.bookingRef);
      await flush();
      expect(manualBooking.notify).toHaveBeenCalledWith(fresh);
      expect(tripmgt.executeBooking).not.toHaveBeenCalled();
    });
  });
});
