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
    };
  };
  let razorpay: {
    isConfigured: boolean;
    createOrder: jest.Mock;
    createUpiQr: jest.Mock;
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
      },
    };

    razorpay = {
      isConfigured: false,
      createOrder: jest.fn(),
      createUpiQr: jest.fn(),
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
        { from: 'AII', to: 'JP', travelClass: '3A', fare: 340 },
        { from: 'JP', to: 'GGN', travelClass: '3A', fare: 470 },
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
});
