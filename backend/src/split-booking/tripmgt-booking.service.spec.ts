import { ConfigService } from '@nestjs/config';
import { BookingV2Service } from '../booking-v2/booking-v2.service';
import { ComputerUseBrowser } from '../common/computer-use-browser';
import { runComputerUse } from '../common/openai-computer-use';
import {
  TripmgtBookingService,
  type TripmgtBookingParams,
} from './tripmgt-booking.service';

jest.mock('../common/computer-use-browser');
jest.mock('../common/openai-computer-use');
jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
}));

describe('TripMgt AI reservation fulfillment', () => {
  const computer = {
    screenshot: jest.fn(),
    navigate: jest.fn(),
    visibleText: jest.fn(),
    close: jest.fn(),
  };
  const bookingV2 = {
    getPnrStatus: jest.fn(),
    normalizeToRailApiDate: jest.fn((date: string) => date),
  };
  const run = jest.mocked(runComputerUse);
  const openBrowser = jest.spyOn(ComputerUseBrowser, 'open');
  let params: TripmgtBookingParams;
  let service: TripmgtBookingService;

  beforeEach(() => {
    jest.clearAllMocks();
    params = {
      bookingRef: 'LB-SB-TEST',
      trainNumber: '12216',
      fromStationCode: 'AII',
      toStationCode: 'GGN',
      journeyDate: '2026-10-01',
      travelClass: '3A',
      quota: 'GN',
      totalFare: 810,
      legs: [
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
      passengers: [
        {
          name: 'Test Passenger',
          age: 30,
          gender: 'Male',
          berthPreference: 'Side Lower',
        },
      ],
      childPassengers: [{ name: 'Test Child', age: 3, gender: 'Female' }],
      contactMobile: '9876543210',
      contactEmail: 'test@example.com',
      autoUpgrade: false,
    };
    service = new TripmgtBookingService(
      new ConfigService({ OPENAI_API_KEY: 'test-key' }),
      bookingV2 as unknown as BookingV2Service,
    );
    computer.screenshot.mockResolvedValue(Buffer.from('image'));
    computer.close.mockResolvedValue(undefined);
    openBrowser.mockResolvedValue(computer as unknown as ComputerUseBrowser);
    run.mockImplementation(async (_client, _computer, options) => {
      const task = JSON.parse(options.task) as { leg: { from: string } };
      const index = task.leg.from === 'AII' ? 0 : 1;
      const pnr = index === 0 ? '1234567890' : '2345678901';
      computer.visibleText.mockResolvedValue(
        `Reservation confirmed. PNR Number: ${pnr}`,
      );
      const leg = params.legs[index];
      bookingV2.getPnrStatus.mockResolvedValue({
        status: true,
        data: {
          Pnr: pnr,
          TrainNo: '12216',
          From: leg.from,
          To: leg.to,
          Class: leg.travelClass,
          Doj: leg.boardingDate,
          PassengerStatus: [{ CurrentStatus: 'CNF' }],
        },
      });
      await options.onTurn(1, ['click'], Buffer.from('image'));
      return JSON.stringify({ status: 'confirmed', pnr, reason: 'none' });
    });
  });

  it('books both legs with their own dates and persists PNRs before independent verification', async () => {
    const onPnr = jest.fn().mockResolvedValue(undefined);
    const onLog = jest.fn().mockResolvedValue(undefined);
    const result = await service.executeBooking(params, { onPnr, onLog });
    expect(result).toMatchObject({
      success: true,
      pnrLeg1: '1234567890',
      pnrLeg2: '2345678901',
    });
    expect(onPnr.mock.calls).toEqual([
      [0, '1234567890'],
      [1, '2345678901'],
    ]);
    expect(onPnr.mock.invocationCallOrder[0]).toBeLessThan(
      bookingV2.getPnrStatus.mock.invocationCallOrder[0],
    );
    const task: unknown = JSON.parse(run.mock.calls[1][2].task);
    expect(task).toMatchObject({
      leg: { boardingDate: '2026-10-02' },
      maxFareRupees: 470,
      autoUpgrade: false,
      childPassengers: params.childPassengers,
      alreadyReservedPnrs: ['1234567890'],
    });
    expect(JSON.stringify(result.logs)).not.toContain('Test Passenger');
    expect(computer.close).toHaveBeenCalledTimes(1);
  });

  it('does not mistake the contact phone number for a PNR', async () => {
    run.mockResolvedValueOnce(
      JSON.stringify({
        status: 'confirmed',
        pnr: '9876543210',
        reason: 'none',
      }),
    );
    computer.visibleText.mockResolvedValue('Mobile: 9876543210');
    const result = await service.executeBooking(params);
    expect(result.success).toBe(false);
    expect(result.pnrLeg1).toBeUndefined();
    expect(bookingV2.getPnrStatus).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('retains the first PNR when the second leg encounters an OTP', async () => {
    const original = run.getMockImplementation()!;
    run.mockImplementationOnce(original).mockResolvedValueOnce(
      JSON.stringify({
        status: 'blocked',
        pnr: null,
        reason: 'otp_required',
      }),
    );
    const result = await service.executeBooking(params);
    expect(result).toMatchObject({ success: false, pnrLeg1: '1234567890' });
    expect(result.pnrLeg2).toBeUndefined();
    expect(result.error).toContain('OTP');
  });

  it('retains the issued PNR but fails when provider verification is unavailable', async () => {
    run.mockResolvedValueOnce(
      JSON.stringify({
        status: 'confirmed',
        pnr: '1234567890',
        reason: 'none',
      }),
    );
    computer.visibleText.mockResolvedValue('PNR: 1234567890');
    bookingV2.getPnrStatus.mockResolvedValue({ status: false });
    const onPnr = jest.fn().mockResolvedValue(undefined);
    const result = await service.executeBooking(params, { onPnr });
    expect(result).toMatchObject({ success: false, pnrLeg1: '1234567890' });
    expect(result.error).toContain('could not be verified');
    expect(onPnr).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it.each([
    { TrainNo: '99999' },
    { From: 'NDLS' },
    { Doj: '2026-10-02' },
    { Class: 'SL' },
    { PassengerStatus: [{ CurrentStatus: 'RAC' }] },
    { PassengerStatus: [] },
  ])('rejects an unrelated or unconfirmed PNR: %j', async (mismatch) => {
    run.mockResolvedValueOnce(
      JSON.stringify({
        status: 'confirmed',
        pnr: '1234567890',
        reason: 'none',
      }),
    );
    computer.visibleText.mockResolvedValue('PNR: 1234567890');
    bookingV2.getPnrStatus.mockResolvedValue({
      status: true,
      data: {
        Pnr: '1234567890',
        TrainNo: '12216',
        From: 'AII',
        To: 'JP',
        Class: '3A',
        Doj: '2026-10-01',
        PassengerStatus: [{ CurrentStatus: 'CNF' }],
        ...mismatch,
      },
    });
    expect((await service.executeBooking(params)).success).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('requires explicit boarding dates before launching a browser', async () => {
    params.legs[1].boardingDate = '';
    expect((await service.executeBooking(params)).error).toContain(
      'boardingDate',
    );
    expect(openBrowser).not.toHaveBeenCalled();
  });

  it('fails clearly if OpenAI is not configured', async () => {
    service = new TripmgtBookingService(
      new ConfigService({ OPENAI_API_KEY: '' }),
      bookingV2 as unknown as BookingV2Service,
    );
    expect((await service.executeBooking(params)).error).toContain(
      'OPENAI_API_KEY',
    );
    expect(openBrowser).not.toHaveBeenCalled();
  });
});
