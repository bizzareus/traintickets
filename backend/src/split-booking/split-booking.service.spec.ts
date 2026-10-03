import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AxiosInstance } from 'axios';
import { SplitBookingService } from './split-booking.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMuzoboxClient } from '../common/muzobox-client';
import { TripmgtBookingService } from './tripmgt-booking.service';
import { ConfigService } from '@nestjs/config';
import { ManualBookingService } from './manual-booking.service';
import type { CreateSplitBookingDto } from './split-booking.types';

jest.mock('../common/muzobox-client', () => ({
  ...jest.requireActual<object>('../common/muzobox-client'),
  createMuzoboxClient: jest.fn(),
}));

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
  let muzobox: { post: jest.Mock; get: jest.Mock };
  let tripmgt: {
    executeBooking: jest.Mock;
  };

  beforeEach(async () => {
    config = new ConfigService({
      SPLIT_BOOKING_MODE: 'ai',
      API_URL: 'https://api-v2.lastberth.com',
      MUZOBOX_PROXY_API_KEY: 'test-key',
    });
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

    muzobox = {
      post: jest
        .fn()
        .mockImplementation(
          (
            _path: string,
            payload: { amount: number; referenceId: string },
          ) => ({
            data: {
              id: 'mb_test',
              amount: payload.amount,
              referenceId: payload.referenceId,
              payUrl: 'https://muzobox.com/pay/mb_test',
              razorpayOrderId: 'order_test',
            },
          }),
        ),
      get: jest.fn(),
    };
    jest
      .mocked(createMuzoboxClient)
      .mockReturnValue(muzobox as unknown as AxiosInstance);

    tripmgt = {
      executeBooking: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SplitBookingService,
        { provide: PrismaService, useValue: prisma },
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

  it('throws ServiceUnavailableException when booking is disabled via mode', async () => {
    config.set('SPLIT_BOOKING_MODE', 'disabled');
    await expect(
      service.createBooking({
        trainNumber: '12216',
        fromStationCode: 'AII',
        toStationCode: 'GGN',
        journeyDate: '2026-09-20',
        travelClass: '3A',
        totalFare: 810,
        legs: [],
        passengers: [],
        contactMobile: '9876543210',
        contactEmail: 'rahul@example.com',
      }),
    ).rejects.toThrow(ServiceUnavailableException);
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
      expect(result.payUrl).toBe('https://muzobox.com/pay/mb_test');
      expect(result.bookingMode).toBe(mode.toUpperCase());
      const [created] = prisma.splitTicketBooking.create.mock.calls[0] as [
        {
          data: {
            bookingMode: string;
            paymentStatus: string;
            bookingRef: string;
          };
        },
      ];
      expect(created.data.bookingRef).toMatch(/^LB-[A-Z0-9]{5}$/);
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
        expect(muzobox.post).toHaveBeenCalledWith(
          'proxy-payments/create-link',
          expect.objectContaining({ amount: 1160 }),
          { headers: { 'x-api-key': 'test-key' } },
        );
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

    it('creates and persists a real Muzobox link with contact prefill and callback', async () => {
      const result = await service.createBooking(request);
      expect(muzobox.post).toHaveBeenCalledWith(
        'proxy-payments/create-link',
        expect.objectContaining({
          amount: 1160,
          referenceId: result.bookingRef,
          redirectUri: `split-booking/payment-complete?ref=${result.bookingRef}`,
          callbackUrl:
            'https://api-v2.lastberth.com/api/split-booking/muzobox-callback',
          customerName: 'Test Passenger',
          customerMobile: '9876543210',
          customerEmail: 'test@example.com',
        }),
        { headers: { 'x-api-key': 'test-key' } },
      );
      expect(prisma.splitTicketBooking.update).toHaveBeenCalledWith({
        where: { id: 'three-leg-booking' },
        data: {
          muzoboxPaymentId: 'mb_test',
          payUrl: 'https://muzobox.com/pay/mb_test',
          razorpayOrderId: 'order_test',
        },
      });
    });

    it.each([
      null,
      {
        id: 'mb_test',
        amount: 1160,
        referenceId: 'wrong',
        payUrl: 'https://muzobox.com/pay/mb_test',
      },
      { id: 'mb_test', amount: 100, payUrl: 'https://muzobox.com/pay/mb_test' },
      { id: 'mb_test', amount: 1160 },
    ])(
      'rejects malformed checkout responses instead of returning a placeholder QR: %j',
      async (data) => {
        muzobox.post.mockResolvedValue({ data });
        await expect(service.createBooking(request)).rejects.toThrow(
          ServiceUnavailableException,
        );
        expect(prisma.splitTicketBooking.update).toHaveBeenCalledWith({
          where: { id: 'three-leg-booking' },
          data: { paymentStatus: 'FAILED' },
        });
        expect(tripmgt.executeBooking).not.toHaveBeenCalled();
      },
    );

    it('fails checkout when Muzobox is unavailable', async () => {
      muzobox.post.mockRejectedValue(new Error('Gateway unavailable'));
      await expect(service.createBooking(request)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(muzobox.post).toHaveBeenCalledTimes(1);
    });

    it('omits an unreachable localhost callback for local checkout', async () => {
      config.set('API_URL', 'http://localhost:3009');
      await service.createBooking(request);
      expect(muzobox.post).toHaveBeenCalledWith(
        'proxy-payments/create-link',
        expect.objectContaining({ callbackUrl: undefined }),
        expect.any(Object),
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

    describe('Muzobox verification', () => {
      const remote = {
        status: 'paid',
        amount: 860,
        referenceId: booking.bookingRef,
        razorpayPaymentId: 'pay_muzobox',
        razorpayOrderId: 'order_test',
      };
      beforeEach(() => {
        const state = {
          ...structuredClone(booking),
          muzoboxPaymentId: 'mb_test',
          razorpayOrderId: 'order_test',
        };
        prisma.splitTicketBooking.findUnique.mockImplementation(() => state);
        prisma.splitTicketBooking.updateMany.mockImplementation(
          ({
            where,
            data,
          }: {
            where: { paymentStatus: string };
            data: object;
          }) => {
            if (where.paymentStatus !== state.paymentStatus)
              return { count: 0 };
            Object.assign(state, data);
            return { count: 1 };
          },
        );
        muzobox.get.mockResolvedValue({ data: remote });
        tripmgt.executeBooking.mockResolvedValue({
          success: true,
          pnrs: ['1234567890'],
          logs: [],
        });
      });

      it('confirms a matching payment and starts fulfillment only once across polling and callbacks', async () => {
        await Promise.all([
          service.getStatus(booking.bookingRef),
          service.handleMuzoboxCallback('mb_test', booking.bookingRef),
        ]);
        await flush();
        expect(muzobox.get).toHaveBeenCalledWith(
          'proxy-payments/mb_test/status',
          { headers: { 'x-api-key': 'test-key' } },
        );
        expect(tripmgt.executeBooking).toHaveBeenCalledTimes(1);
        expect(await service.getStatus(booking.bookingRef)).toMatchObject({
          paymentStatus: 'PAID',
        });
      });

      it.each([
        { status: 'created' },
        { status: 'authorized' },
        { amount: 810 },
        { amount: 86000 },
        { referenceId: 'another-booking' },
        { razorpayOrderId: 'another-order' },
        { razorpayPaymentId: null },
      ])(
        'does not fulfill an unverified or mismatched payment: %j',
        async (override) => {
          muzobox.get.mockResolvedValue({ data: { ...remote, ...override } });
          expect(await service.getStatus(booking.bookingRef)).toMatchObject({
            paymentStatus: 'PENDING',
          });
          expect(prisma.splitTicketBooking.updateMany).not.toHaveBeenCalled();
          expect(tripmgt.executeBooking).not.toHaveBeenCalled();
        },
      );

      it('keeps transient status failures pending for the next poll', async () => {
        muzobox.get.mockRejectedValue(new Error('Timeout'));
        expect(await service.getStatus(booking.bookingRef)).toMatchObject({
          paymentStatus: 'PENDING',
        });
        expect(prisma.splitTicketBooking.updateMany).not.toHaveBeenCalled();
      });

      it('records failed payments without starting fulfillment', async () => {
        muzobox.get.mockResolvedValue({
          data: { ...remote, status: 'failed' },
        });
        expect(await service.getStatus(booking.bookingRef)).toMatchObject({
          paymentStatus: 'FAILED',
        });
        expect(tripmgt.executeBooking).not.toHaveBeenCalled();
      });

      it('rejects a callback for a different Muzobox payment', async () => {
        await expect(
          service.handleMuzoboxCallback('another-payment', booking.bookingRef),
        ).rejects.toThrow(BadRequestException);
        expect(muzobox.get).not.toHaveBeenCalled();
      });
    });

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

  describe('adminNotifyCustomer', () => {
    it('updates PNRs and uploads PDF when provided before notifying', async () => {
      const mockBooking = {
        id: 'b-123',
        bookingRef: 'LB-TEST1',
        trainNumber: '12066',
        trainName: 'JANSHATABDI',
        fromStationCode: 'DEE',
        toStationCode: 'AII',
        journeyDate: new Date('2026-10-03'),
        travelClass: 'CC',
        quota: 'GN',
        bookingStatus: 'MANUAL_PENDING',
        paymentStatus: 'PAID',
        legsPayload: [
          {
            from: 'DEE',
            to: 'RE',
            travelClass: 'CC',
            boardingDate: '2026-10-03',
          },
          {
            from: 'NMK',
            to: 'AII',
            travelClass: 'CC',
            boardingDate: '2026-10-03',
          },
        ],
        passengers: {
          adults: [{ name: 'Kartik', age: 30, gender: 'Male' }],
          children: [],
        },
        contactMobile: '9999224767',
        contactEmail: 'kartik@example.com',
        pnrs: [],
        pnrLeg1: null,
        pnrLeg2: null,
        ticketPdfUploadedAt: null,
      };

      prisma.splitTicketBooking.findUnique.mockResolvedValue(mockBooking);
      prisma.splitTicketBooking.update.mockResolvedValue({
        ...mockBooking,
        pnrLeg1: '1111111111',
        pnrLeg2: '2222222222',
        pnrs: ['1111111111', '2222222222'],
        bookingStatus: 'CONFIRMED',
      });

      const res = await service.adminNotifyCustomer('b-123', {
        channel: 'email',
        pnrLeg1: '1111111111',
        pnrLeg2: '2222222222',
        pnrs: ['1111111111', '2222222222'],
      });

      expect(res.ok).toBe(true);
      expect(prisma.splitTicketBooking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b-123' },
          data: expect.objectContaining({
            pnrLeg1: '1111111111',
            pnrLeg2: '2222222222',
            bookingStatus: 'CONFIRMED',
          }) as unknown,
        }),
      );
    });
  });
});
