import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SplitBookingService } from './split-booking.service';
import { PrismaService } from '../prisma/prisma.service';
import { RazorpayClient } from '../chart-alert-payments/razorpay.client';
import { TripmgtBookingService } from './tripmgt-booking.service';

describe('SplitBookingService', () => {
  let service: SplitBookingService;
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

  it('creates booking record with PENDING status and returns payment payload', async () => {
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

    expect(result.amount).toBe(810);
    expect(result.bookingRef).toBeDefined();
    expect(result.upiIntent).toContain('upi://pay');
    expect(prisma.splitTicketBooking.create).toHaveBeenCalled();
  });

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
      contactMobile: '9876543210',
      contactEmail: 'rahul@example.com',
      paymentStatus: 'PAID',
      bookingStatus: 'IN_PROGRESS',
      pnrLeg1: null,
      pnrLeg2: null,
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

  describe('paid AI fulfillment', () => {
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
      quota: 'GN',
      autoUpgrade: false,
      contactMobile: '9876543210',
      contactEmail: 'test@example.com',
      paymentStatus: 'PENDING',
      bookingStatus: 'IDLE',
      pnrLeg1: null,
      pnrLeg2: null,
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
        error: 'blocked',
        logs: [],
      });
      await Promise.all([
        service.confirmPayment(booking.bookingRef),
        service.confirmPayment(booking.bookingRef),
      ]);
      await flush();
      expect(tripmgt.executeBooking).toHaveBeenCalledTimes(1);
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
            pnrLeg1: '1234567890',
            error: 'OTP required',
            logs: [],
          };
        },
      );
      await service.confirmPayment(booking.bookingRef);
      await flush();
      expect(prisma.splitTicketBooking.update).toHaveBeenCalledWith({
        where: { id: 'booking1' },
        data: { pnrLeg1: '1234567890' },
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
  });
});
