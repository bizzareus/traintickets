import { ConfigService } from '@nestjs/config';
import type { SplitTicketBooking } from '@prisma/client';
import Retell from 'retell-sdk';
import {
  RetellCallService,
  DEFAULT_ADMIN_CALL_PHONE,
  DEFAULT_RETELL_FROM_NUMBER,
  DEFAULT_RETELL_AGENT_ID,
} from './retell-call.service';

jest.mock('retell-sdk');

describe('RetellCallService', () => {
  let service: RetellCallService;
  let configService: ConfigService;
  let mockCreatePhoneCall: jest.Mock;

  const mockBooking = {
    id: 'sb_123',
    bookingRef: 'LB-ABC12',
    trainNumber: '12951',
    trainName: 'MUMBAI RAJDHANI',
    fromStationCode: 'MMCT',
    toStationCode: 'NDLS',
    journeyDate: new Date('2026-10-15T00:00:00.000Z'),
    travelClass: '3A',
    quota: 'GN',
    totalFare: 3000,
    serviceFee: 120,
    bookingMode: 'MANUAL',
    contactMobile: '+919876543210',
    contactEmail: 'user@example.com',
    passengers: {
      adults: [{ name: 'Test Passenger', age: 30, gender: 'M' }],
    },
    legsPayload: [],
    paymentStatus: 'PAID',
    bookingStatus: 'QUEUED',
  } as unknown as SplitTicketBooking;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreatePhoneCall = jest.fn();
    (Retell as unknown as jest.Mock).mockImplementation(() => ({
      call: {
        createPhoneCall: mockCreatePhoneCall,
      },
    }));
  });

  it('skips call when RETELL_API_KEY is not configured', async () => {
    configService = new ConfigService({});
    service = new RetellCallService(configService);

    const callId = await service.triggerBookingReceivedCall(mockBooking);
    expect(callId).toBeNull();
    expect(Retell).not.toHaveBeenCalled();
    expect(mockCreatePhoneCall).not.toHaveBeenCalled();
  });

  it('uses hardcoded defaults when RETELL_FROM_NUMBER and RETELL_AGENT_ID are not set in env', async () => {
    configService = new ConfigService({
      RETELL_API_KEY: 'test_retell_key',
    });
    service = new RetellCallService(configService);

    mockCreatePhoneCall.mockResolvedValueOnce({
      call_id: 'call_defaults_123',
    });

    const callId = await service.triggerBookingReceivedCall(mockBooking);
    expect(callId).toBe('call_defaults_123');
    expect(mockCreatePhoneCall).toHaveBeenCalledWith(
      expect.objectContaining({
        from_number: DEFAULT_RETELL_FROM_NUMBER,
        override_agent_id: DEFAULT_RETELL_AGENT_ID,
        to_number: DEFAULT_ADMIN_CALL_PHONE,
      }),
    );
  });

  it('triggers outbound phone call with correct parameters and dynamic variables', async () => {
    configService = new ConfigService({
      RETELL_API_KEY: 'test_retell_key',
      RETELL_FROM_NUMBER: '+14157774444',
      RETELL_AGENT_ID: 'agent_test_123',
      RETELL_ADMIN_PHONE_NUMBER: '+447343092978',
    });
    service = new RetellCallService(configService);

    mockCreatePhoneCall.mockResolvedValueOnce({
      call_id: 'call_abc_xyz',
      call_status: 'registered',
    });

    const callId = await service.triggerBookingReceivedCall(mockBooking);

    expect(callId).toBe('call_abc_xyz');
    expect(mockCreatePhoneCall).toHaveBeenCalledTimes(1);
    expect(mockCreatePhoneCall).toHaveBeenCalledWith({
      from_number: '+14157774444',
      to_number: '+447343092978',
      override_agent_id: 'agent_test_123',
      override_agent_version: 1,
      retell_llm_dynamic_variables: {
        booking_ref: 'LB-ABC12',
        train_number: '12951',
        train_name: 'MUMBAI RAJDHANI',
        route: 'MMCT to NDLS',
        journey_date: '2026-10-15',
        amount: '3120',
        total_fare: '3000',
        service_fee: '120',
        booking_mode: 'MANUAL',
        contact_mobile: '+919876543210',
        passenger_name: 'Test Passenger',
      },
    });
  });

  it('falls back to default admin phone number if RETELL_ADMIN_PHONE_NUMBER is not set', async () => {
    configService = new ConfigService({
      RETELL_API_KEY: 'test_retell_key',
      RETELL_FROM_NUMBER: '+14157774444',
    });
    service = new RetellCallService(configService);

    mockCreatePhoneCall.mockResolvedValueOnce({
      call_id: 'call_default_phone',
    });

    const callId = await service.triggerBookingReceivedCall(mockBooking);

    expect(callId).toBe('call_default_phone');
    expect(mockCreatePhoneCall).toHaveBeenCalledWith(
      expect.objectContaining({
        to_number: DEFAULT_ADMIN_CALL_PHONE,
      }),
    );
  });

  it('catches and logs errors without throwing if createPhoneCall rejects', async () => {
    configService = new ConfigService({
      RETELL_API_KEY: 'test_retell_key',
      RETELL_FROM_NUMBER: '+14157774444',
    });
    service = new RetellCallService(configService);

    mockCreatePhoneCall.mockRejectedValueOnce(
      new Error('Retell API connection failed'),
    );

    const callId = await service.triggerBookingReceivedCall(mockBooking);
    expect(callId).toBeNull();
  });
});
