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
import { RetellCallService } from './retell-call.service';
import { S3StorageService } from '../common/s3-storage.service';
import { NotificationService } from '../notification/notification.service';
import { WasenderProvider } from '../notification/whatsapp-providers/wasender.provider';
import type { CreateSplitBookingDto } from './split-booking.types';

jest.mock('../common/muzobox-client', () => ({
  ...jest.requireActual<object>('../common/muzobox-client'),
  createMuzoboxClient: jest.fn(),
}));

describe('SplitBookingService', () => {
  let service: SplitBookingService;
  let config: ConfigService;
  let manualBooking: { notify: jest.Mock };
  let retellCall: { triggerBookingReceivedCall: jest.Mock };
  let notifications: { sendEmail: jest.Mock };
  let wasender: { sendWhatsApp: jest.Mock };
  let prisma: {
    splitTicketBooking: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    bookingCancellationRequest: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };
  let muzobox: { post: jest.Mock; get: jest.Mock };
  let tripmgt: {
    executeBooking: jest.Mock;
  };
  let s3Storage: {
    uploadTicketPdf: jest.Mock;
    getSignedTicketPdfUrl: jest.Mock;
    deleteTicketPdf: jest.Mock;
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
    retellCall = {
      triggerBookingReceivedCall: jest.fn().mockResolvedValue('call_mock_123'),
    };
    notifications = {
      sendEmail: jest.fn().mockResolvedValue(true),
    };
    wasender = {
      sendWhatsApp: jest.fn().mockResolvedValue(true),
    };
    prisma = {
      splitTicketBooking: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      bookingCancellationRequest: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
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

    s3Storage = {
      uploadTicketPdf: jest
        .fn()
        .mockResolvedValue('tickets/LB-TEST/ticket.pdf'),
      getSignedTicketPdfUrl: jest
        .fn()
        .mockResolvedValue(
          'https://lastberth-ticket-storage.s3.ap-south-1.amazonaws.com/tickets/LB-TEST/ticket.pdf?signed=1',
        ),
      deleteTicketPdf: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SplitBookingService,
        { provide: PrismaService, useValue: prisma },
        { provide: TripmgtBookingService, useValue: tripmgt },
        { provide: ConfigService, useValue: config },
        { provide: ManualBookingService, useValue: manualBooking },
        { provide: RetellCallService, useValue: retellCall },
        { provide: S3StorageService, useValue: s3Storage },
        { provide: NotificationService, useValue: notifications },
        { provide: WasenderProvider, useValue: wasender },
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

  it('throws BadRequestException if more than 1 passenger is provided', async () => {
    await expect(
      service.createBooking({
        trainNumber: '12216',
        fromStationCode: 'AII',
        toStationCode: 'GGN',
        journeyDate: '2026-09-20',
        travelClass: '3A',
        totalFare: 810,
        legs: [
          {
            from: 'AII',
            to: 'GGN',
            travelClass: '3A',
            fare: 810,
            boardingDate: '2026-09-20',
          },
        ],
        passengers: [
          { name: 'Passenger 1', age: 30, gender: 'Male' },
          { name: 'Passenger 2', age: 28, gender: 'Female' },
        ],
        contactMobile: '9876543210',
        contactEmail: 'user@example.com',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'The booking engine currently supports only 1 passenger per booking',
      ),
    );
  });

  it('throws BadRequestException if child passengers are provided', async () => {
    await expect(
      service.createBooking({
        trainNumber: '12216',
        fromStationCode: 'AII',
        toStationCode: 'GGN',
        journeyDate: '2026-09-20',
        travelClass: '3A',
        totalFare: 810,
        legs: [
          {
            from: 'AII',
            to: 'GGN',
            travelClass: '3A',
            fare: 810,
            boardingDate: '2026-09-20',
          },
        ],
        passengers: [{ name: 'Passenger 1', age: 30, gender: 'Male' }],
        childPassengers: [{ name: 'Child 1', age: 3, gender: 'Male' }],
        contactMobile: '9876543210',
        contactEmail: 'user@example.com',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'The booking engine currently supports only 1 passenger per booking',
      ),
    );
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
        serviceFee: 32,
        amount: 842,
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
          serviceFee: 44,
          amount: 1154,
        });
        expect(muzobox.post).toHaveBeenCalledWith(
          'proxy-payments/create-link',
          expect.objectContaining({ amount: 1154 }),
          { headers: { 'x-api-key': 'test-key' } },
        );
        const [created] = prisma.splitTicketBooking.create.mock.calls[0] as [
          { data: Record<string, unknown> },
        ];
        expect(created.data).toMatchObject({
          fromStationCode: 'DEE',
          toStationCode: 'AII',
          totalFare: 1110,
          serviceFee: 44,
          legsPayload: request.legs,
        });
      },
    );

    it('creates and persists a real Muzobox link with contact prefill and callback', async () => {
      const result = await service.createBooking(request);
      expect(muzobox.post).toHaveBeenCalledWith(
        'proxy-payments/create-link',
        expect.objectContaining({
          amount: 1154,
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
        serviceFee: 44,
        amount: 1154,
      });
    });

    it('calculates 4% payment service charge on ₹11,100', async () => {
      expect(
        await service.createBooking({ ...request, totalFare: 11100 }),
      ).toMatchObject({
        totalFare: 11100,
        serviceFee: 444,
        amount: 11544,
      });
    });

    it('uses configured SPLIT_BOOKING_SERVICE_FEE_RATE from environment', async () => {
      config.set('SPLIT_BOOKING_SERVICE_FEE_RATE', '0.05');
      try {
        expect(
          await service.createBooking({ ...request, totalFare: 1110 }),
        ).toMatchObject({
          totalFare: 1110,
          serviceFee: 56,
          amount: 1166,
        });
      } finally {
        config.set('SPLIT_BOOKING_SERVICE_FEE_RATE', undefined);
      }
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
      expect(retellCall.triggerBookingReceivedCall).toHaveBeenCalledTimes(1);
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
      const state = {
        ...structuredClone(booking),
        bookingMode: 'MANUAL',
        // Payment comms already delivered: keeps the fire-and-forget
        // payment notification from racing this test's final update.
        customerPaymentEmailSentAt: new Date('2026-10-01T00:00:00Z'),
        customerPaymentWhatsappSentAt: new Date('2026-10-01T00:00:00Z'),
      };
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

  describe('ticket pdf handling with S3', () => {
    it('uploads ticket pdf to S3 and updates database with S3 key', async () => {
      prisma.splitTicketBooking.findUnique.mockResolvedValue({
        id: 'b-123',
        bookingRef: 'LB-TEST',
      });
      prisma.splitTicketBooking.update.mockResolvedValue({
        id: 'b-123',
        bookingRef: 'LB-TEST',
        ticketPdfS3Key: 'tickets/LB-TEST/my-ticket.pdf',
      });

      const res = await service.adminUploadTicketPdf('b-123', undefined, {
        base64: 'JVBERi0xLjQK...',
        filename: 'my-ticket.pdf',
        contentType: 'application/pdf',
      });

      expect(res.ok).toBe(true);
      expect(res.s3Key).toBe('tickets/LB-TEST/ticket.pdf');
      expect(s3Storage.uploadTicketPdf).toHaveBeenCalledWith(
        'LB-TEST',
        expect.any(Buffer),
        'my-ticket.pdf',
        'application/pdf',
      );
      expect(prisma.splitTicketBooking.update).toHaveBeenCalledWith({
        where: { id: 'b-123' },
        data: expect.objectContaining({
          ticketPdfS3Key: 'tickets/LB-TEST/ticket.pdf',
          ticketPdf: null,
        }) as unknown,
      });
    });

    it('returns signed redirect URL when ticketPdfS3Key is present', async () => {
      prisma.splitTicketBooking.findFirst.mockResolvedValue({
        bookingRef: 'LB-TEST',
        ticketPdfS3Key: 'tickets/LB-TEST/ticket.pdf',
        ticketPdfFilename: 'ticket.pdf',
        ticketPdf: null,
      });

      const res = await service.getTicketPdf('LB-TEST');
      expect(res).toEqual(
        expect.objectContaining({
          redirectUrl:
            'https://lastberth-ticket-storage.s3.ap-south-1.amazonaws.com/tickets/LB-TEST/ticket.pdf?signed=1',
          s3Key: 'tickets/LB-TEST/ticket.pdf',
        }),
      );
    });

    it('falls back to binary buffer for legacy records without S3 key', async () => {
      prisma.splitTicketBooking.findFirst.mockResolvedValue({
        bookingRef: 'LB-LEGACY',
        ticketPdfS3Key: null,
        ticketPdf: Buffer.from('%PDF-1.4'),
        ticketPdfFilename: 'legacy.pdf',
        ticketPdfContentType: 'application/pdf',
      });

      const res = await service.getTicketPdf('LB-LEGACY');
      expect('buffer' in res && res.buffer).toBeTruthy();
    });

    it('throws NotFoundException if booking or PDF does not exist', async () => {
      prisma.splitTicketBooking.findFirst.mockResolvedValue(null);
      await expect(service.getTicketPdf('LB-NONE')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('customer payment notifications', () => {
    it('sends email and whatsapp when payment is confirmed and marks timestamps', async () => {
      prisma.splitTicketBooking.findUnique.mockResolvedValue({
        id: 'b-100',
        bookingRef: 'LB-PAID1',
        trainNumber: '12782',
        fromStationCode: 'NZM',
        toStationCode: 'KOP',
        journeyDate: new Date('2026-10-10'),
        totalFare: 2000,
        serviceFee: 50,
        paymentStatus: 'PAID',
        contactEmail: 'passenger@example.com',
        contactMobile: '9876543210',
        customerPaymentEmailSentAt: null,
        customerPaymentWhatsappSentAt: null,
      });

      const res =
        await service.sendCustomerPaymentReceivedNotification('b-100');

      expect(res.emailSent).toBe(true);
      expect(res.whatsappSent).toBe(true);
      expect(notifications.sendEmail).toHaveBeenCalledWith(
        'passenger@example.com',
        expect.stringContaining('Payment Received — Booking Ref: LB-PAID1'),
        expect.stringContaining('LB-PAID1'),
        expect.any(Object),
      );
      expect(wasender.sendWhatsApp).toHaveBeenCalledWith({
        mobile: '9876543210',
        text: expect.stringContaining('LB-PAID1'),
      });
      expect(prisma.splitTicketBooking.update).toHaveBeenCalledWith({
        where: { id: 'b-100' },
        data: {
          customerPaymentEmailSentAt: expect.any(Date),
          customerPaymentWhatsappSentAt: expect.any(Date),
        },
      });
    });

    it('skips sending if notifications were already sent', async () => {
      prisma.splitTicketBooking.findUnique.mockResolvedValue({
        id: 'b-100',
        bookingRef: 'LB-PAID1',
        paymentStatus: 'PAID',
        contactEmail: 'passenger@example.com',
        contactMobile: '9876543210',
        customerPaymentEmailSentAt: new Date(),
        customerPaymentWhatsappSentAt: new Date(),
      });

      const res =
        await service.sendCustomerPaymentReceivedNotification('b-100');
      expect(res.emailSent).toBe(false);
      expect(res.whatsappSent).toBe(false);
      expect(notifications.sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('cancellation flow', () => {
    it('looks up booking by ref and matching mobile number', async () => {
      prisma.splitTicketBooking.findUnique.mockResolvedValue({
        id: 'b-200',
        bookingRef: 'LB-CANCEL',
        trainNumber: '12782',
        trainName: 'Swarna Jayanti',
        fromStationCode: 'NZM',
        toStationCode: 'KOP',
        journeyDate: new Date('2026-10-10'),
        travelClass: '3A',
        quota: 'GN',
        totalFare: 2000,
        serviceFee: 50,
        passengers: { adults: [{ name: 'John Doe', age: 30, gender: 'Male' }] },
        legsPayload: [],
        bookingStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        pnrs: ['1234567890'],
        pnrLeg1: '1234567890',
        pnrLeg2: null,
        contactMobile: '+919876543210',
        createdAt: new Date(),
      });
      prisma.bookingCancellationRequest.findFirst.mockResolvedValue(null);

      const res = await service.lookupBookingForCancellation(
        'lb-cancel',
        '9876543210',
      );

      expect(res.bookingRef).toBe('LB-CANCEL');
      expect(res.trainNumber).toBe('12782');
      expect(res.amount).toBe(2050);
      expect(res.existingCancellation).toBeNull();
    });

    it('throws BadRequestException if mobile does not match booking', async () => {
      prisma.splitTicketBooking.findUnique.mockResolvedValue({
        id: 'b-200',
        bookingRef: 'LB-CANCEL',
        contactMobile: '+919876543210',
      });

      await expect(
        service.lookupBookingForCancellation('LB-CANCEL', '9999999999'),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates cancellation request and notifies admin via email and whatsapp', async () => {
      prisma.splitTicketBooking.findUnique.mockResolvedValue({
        id: 'b-200',
        bookingRef: 'LB-CANCEL',
        trainNumber: '12782',
        fromStationCode: 'NZM',
        toStationCode: 'KOP',
        journeyDate: new Date('2026-10-10'),
        totalFare: 2000,
        serviceFee: 50,
        contactMobile: '9876543210',
        contactEmail: 'user@test.com',
        bookingStatus: 'CONFIRMED',
        pnrs: ['1234567890'],
      });
      prisma.bookingCancellationRequest.findFirst.mockResolvedValue(null);
      prisma.bookingCancellationRequest.create.mockResolvedValue({
        id: 'cr-1',
        bookingId: 'b-200',
        bookingRef: 'LB-CANCEL',
        mobile: '9876543210',
        status: 'PENDING',
      });

      const res = await service.createCancellationRequest(
        'LB-CANCEL',
        '9876543210',
        'Change of plan',
      );

      expect(res.success).toBe(true);
      expect(res.requestId).toBe('cr-1');
      expect(notifications.sendEmail).toHaveBeenCalledWith(
        'me@kartikarora.in',
        expect.stringContaining(
          '[CANCELLATION REQUEST] Booking Ref: LB-CANCEL',
        ),
        expect.stringContaining('Change of plan'),
        expect.any(Object),
      );
      expect(wasender.sendWhatsApp).toHaveBeenCalledWith({
        mobile: '+919999224767',
        text: expect.stringContaining('LB-CANCEL'),
      });
    });

    it('prevents duplicate pending cancellation requests', async () => {
      prisma.splitTicketBooking.findUnique.mockResolvedValue({
        id: 'b-200',
        bookingRef: 'LB-CANCEL',
        contactMobile: '9876543210',
      });
      prisma.bookingCancellationRequest.findFirst.mockResolvedValue({
        id: 'cr-existing',
        status: 'PENDING',
      });

      await expect(
        service.createCancellationRequest('LB-CANCEL', '9876543210'),
      ).rejects.toThrow(BadRequestException);
    });

    it('lists cancellations for admin', async () => {
      prisma.bookingCancellationRequest.findMany.mockResolvedValue([
        {
          id: 'cr-1',
          bookingId: 'b-200',
          bookingRef: 'LB-CANCEL',
          mobile: '9876543210',
          reason: 'Test',
          status: 'PENDING',
          adminNotes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          booking: {
            id: 'b-200',
            bookingRef: 'LB-CANCEL',
            trainNumber: '12782',
            trainName: null,
            fromStationCode: 'NZM',
            toStationCode: 'KOP',
            journeyDate: new Date('2026-10-10'),
            travelClass: '3A',
            totalFare: 2000,
            serviceFee: 50,
            contactMobile: '9876543210',
            contactEmail: 'user@test.com',
            bookingStatus: 'CONFIRMED',
            paymentStatus: 'PAID',
            pnrs: [],
            pnrLeg1: null,
            pnrLeg2: null,
            passengers: { adults: [] },
          },
        },
      ]);

      const items = await service.adminListCancellations();
      expect(items).toHaveLength(1);
      expect(items[0].bookingRef).toBe('LB-CANCEL');
      expect(items[0].booking?.amount).toBe(2050);
    });

    it('updates cancellation request status and admin notes', async () => {
      prisma.bookingCancellationRequest.findUnique.mockResolvedValue({
        id: 'cr-1',
        status: 'PENDING',
      });
      prisma.bookingCancellationRequest.update.mockResolvedValue({
        id: 'cr-1',
        status: 'PROCESSED',
        adminNotes: 'Refunded ₹1800',
        processedAt: new Date(),
      });

      const res = await service.adminUpdateCancellation('cr-1', {
        status: 'PROCESSED',
        adminNotes: 'Refunded ₹1800',
      });

      expect(res.ok).toBe(true);
      expect(res.cancellation.status).toBe('PROCESSED');
    });

    it('cancels booking, refunds via Muzobox, and emails customer with refund ID', async () => {
      const mockBooking = {
        id: 'b-refund-1',
        bookingRef: 'LB-REF1',
        trainNumber: '12782',
        trainName: 'Swarna Jayanti',
        fromStationCode: 'NZM',
        toStationCode: 'KOP',
        journeyDate: new Date('2026-10-15'),
        totalFare: 2000,
        serviceFee: 80,
        contactMobile: '9876543210',
        contactEmail: 'passenger@example.com',
        bookingStatus: 'MANUAL_PENDING',
        paymentStatus: 'PAID',
        muzoboxPaymentId: 'mb_pay_123',
        razorpayPaymentId: null,
      };

      prisma.splitTicketBooking.findFirst.mockResolvedValue(mockBooking);
      prisma.splitTicketBooking.update.mockResolvedValue({
        ...mockBooking,
        bookingStatus: 'CANCELLED',
      });
      prisma.bookingCancellationRequest.findFirst.mockResolvedValue(null);
      prisma.bookingCancellationRequest.create.mockResolvedValue({
        id: 'cr-new',
        bookingId: mockBooking.id,
        status: 'PROCESSED',
      });

      muzobox.post.mockResolvedValue({
        data: {
          status: 'refunded',
          amount: 2080,
          razorpayRefundId: 'rfnd_custom_999',
        },
      });

      const res = await service.adminCancelAndRefundBooking('LB-REF1', {
        reason: 'Customer requested full refund',
      });

      expect(res.success).toBe(true);
      expect(res.refundAmount).toBe(2080);
      expect(res.refundId).toBe('rfnd_custom_999');
      expect(res.emailSent).toBe(true);

      // Verify Muzobox refund payload
      expect(muzobox.post).toHaveBeenCalledWith(
        'proxy-payments/mb_pay_123/refund',
        expect.objectContaining({
          amount: 2080,
          referenceId: 'LB-REF1',
        }),
        expect.any(Object),
      );

      // Verify booking updated to CANCELLED
      expect(prisma.splitTicketBooking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b-refund-1' },
          data: expect.objectContaining({
            bookingStatus: 'CANCELLED',
          }),
        }),
      );

      // Verify notification email sent with refund ID and amount
      expect(notifications.sendEmail).toHaveBeenCalledWith(
        'passenger@example.com',
        expect.stringContaining('LB-REF1'),
        expect.stringContaining('rfnd_custom_999'),
        expect.any(Object),
      );
    });

    it('rejects refund if booking is already CANCELLED', async () => {
      prisma.splitTicketBooking.findFirst.mockResolvedValue({
        id: 'b-cancelled',
        bookingRef: 'LB-ALREADY',
        bookingStatus: 'CANCELLED',
        paymentStatus: 'PAID',
      });

      await expect(
        service.adminCancelAndRefundBooking('LB-ALREADY'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects refund if paymentStatus is not PAID', async () => {
      prisma.splitTicketBooking.findFirst.mockResolvedValue({
        id: 'b-pending',
        bookingRef: 'LB-UNPAID',
        bookingStatus: 'IDLE',
        paymentStatus: 'PENDING',
      });

      await expect(
        service.adminCancelAndRefundBooking('LB-UNPAID'),
      ).rejects.toThrow(BadRequestException);
    });

    it('cancels booking and refunds via proxy endpoint using razorpayPaymentId when muzoboxPaymentId is null', async () => {
      const mockBooking = {
        id: 'b-refund-rzp-proxy',
        bookingRef: 'LB-RZP1',
        trainNumber: '12951',
        trainName: 'Rajdhani Express',
        fromStationCode: 'MMCT',
        toStationCode: 'NDLS',
        journeyDate: new Date('2026-10-15'),
        totalFare: 2000,
        serviceFee: 80,
        contactMobile: '9876543210',
        contactEmail: 'passenger@example.com',
        bookingStatus: 'MANUAL_PENDING',
        paymentStatus: 'PAID',
        muzoboxPaymentId: null,
        razorpayPaymentId: 'pay_xyz_proxy_987',
      };

      prisma.splitTicketBooking.findFirst.mockResolvedValue(mockBooking);
      prisma.splitTicketBooking.update.mockResolvedValue({
        ...mockBooking,
        bookingStatus: 'CANCELLED',
      });
      prisma.bookingCancellationRequest.findFirst.mockResolvedValue(null);
      prisma.bookingCancellationRequest.create.mockResolvedValue({
        id: 'cr-new',
        bookingId: mockBooking.id,
        status: 'PROCESSED',
      });

      muzobox.post.mockResolvedValue({
        data: {
          status: 'refunded',
          amount: 2080,
          razorpayRefundId: 'rfnd_proxy_rzp_111',
        },
      });

      const res = await service.adminCancelAndRefundBooking('LB-RZP1', {
        reason: 'Proxy refund with razorpayPaymentId',
      });

      expect(res.success).toBe(true);
      expect(res.refundAmount).toBe(2080);
      expect(res.refundId).toBe('rfnd_proxy_rzp_111');
      expect(muzobox.post).toHaveBeenCalledWith(
        'proxy-payments/pay_xyz_proxy_987/refund',
        expect.objectContaining({
          amount: 2080,
          referenceId: 'LB-RZP1',
        }),
        expect.any(Object),
      );
    });
  });
});
