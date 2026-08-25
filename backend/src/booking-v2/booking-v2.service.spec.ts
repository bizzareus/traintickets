import { BookingV2Service } from './booking-v2.service';
import type { FindAlternatePathsResult } from './booking-v2.service';
import type { IrctcService } from '../irctc/irctc.service';
import type { CacheService } from '../cache/cache.service';
import type { StationCacheService } from '../cache/station-cache.service';
import type { BestTrainsRouteCache } from './best-trains-cache';
import type { AlternatePathsRouteCache } from './alternate-paths-cache';
import axios from 'axios';

const mockCache: jest.Mocked<
  Pick<CacheService, 'get' | 'set' | 'del' | 'getOrSet'>
> = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  getOrSet: jest
    .fn()
    .mockImplementation((_key: string, factory: () => Promise<unknown>) =>
      factory(),
    ),
};

const mockStationCache: jest.Mocked<
  Pick<StationCacheService, 'search' | 'upsertMany'>
> = {
  search: jest.fn().mockResolvedValue([]),
  upsertMany: jest.fn().mockResolvedValue(undefined),
};

const mockBestTrainsCache: jest.Mocked<
  Pick<BestTrainsRouteCache, 'get' | 'getRecord' | 'set'>
> = {
  get: jest.fn().mockResolvedValue(null),
  getRecord: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
};

const mockAltPathsCache: jest.Mocked<
  Pick<AlternatePathsRouteCache, 'get' | 'getRecord' | 'set'>
> = {
  get: jest.fn().mockResolvedValue(null),
  getRecord: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
};

const mockIrctc: jest.Mocked<
  Pick<IrctcService, 'searchStationsViaRapidApi' | 'getTrainClasses'>
> = {
  searchStationsViaRapidApi: jest.fn().mockResolvedValue([]),
  getTrainClasses: jest.fn().mockResolvedValue([]),
};

function altResult(
  trainNumber: string,
  legs: FindAlternatePathsResult['legs'],
): FindAlternatePathsResult {
  return {
    trainNumber,
    legs,
    totalFare: legs
      .filter((l) => l.segmentKind === 'confirmed')
      .reduce<number | null>((sum, l) => {
        if (sum == null || l.fare == null) return null;
        return sum + l.fare;
      }, 0),
    legCount: legs.length,
    isComplete:
      legs.length > 0 &&
      legs.every((l) => l.segmentKind === 'confirmed') &&
      legs[legs.length - 1].to === 'D',
    stationCodesOnRoute: ['A', 'B', 'C', 'D'],
    stationNameMap: {},
    remainderMergedSchedule: null,
    trainOriginCode: 'A',
    trainOriginDepartureTime: '08:00',
    debugLog: [],
  };
}

function confirmedLeg(
  from: string,
  to: string,
  durationMinutes: number,
  fare = 100,
): FindAlternatePathsResult['legs'][number] {
  return {
    from,
    to,
    segmentKind: 'confirmed',
    travelClass: 'SL',
    railDataStatus: 'Confirm',
    availablityStatus: 'AVAILABLE',
    predictionPercentage: null,
    availabilityDisplayName: 'Available',
    fare,
    confirmedClassOptions: [],
    departureTime: '08:00',
    arrivalTime: '09:00',
    durationMinutes,
  };
}

function realtimeLeg(
  from: string,
  to: string,
): FindAlternatePathsResult['legs'][number] {
  return {
    from,
    to,
    segmentKind: 'check_realtime',
    travelClass: null,
    railDataStatus: null,
    availablityStatus: null,
    predictionPercentage: null,
    availabilityDisplayName: null,
    fare: null,
    confirmedClassOptions: [],
    departureTime: '08:00',
    arrivalTime: '09:00',
    durationMinutes: 60,
  };
}

describe('BookingV2Service', () => {
  let service: BookingV2Service;

  beforeEach(() => {
    jest.clearAllMocks();
    const irctc = mockIrctc as unknown as IrctcService;
    service = new BookingV2Service(
      irctc,
      mockCache as unknown as CacheService,
      mockStationCache as unknown as StationCacheService,
      mockBestTrainsCache as unknown as BestTrainsRouteCache,
      mockAltPathsCache as unknown as AlternatePathsRouteCache,
    );
  });

  describe('normalizeToRailApiDate', () => {
    it('converts YYYY-MM-DD to DD-MM-YYYY', () => {
      expect(service.normalizeToRailApiDate('2026-04-05')).toBe('05-04-2026');
    });
    it('converts YYYY-M-D and YYYY-MM-D to DD-MM-YYYY with zero padding', () => {
      expect(service.normalizeToRailApiDate('2026-6-2')).toBe('02-06-2026');
      expect(service.normalizeToRailApiDate('2026-12-5')).toBe('05-12-2026');
      expect(service.normalizeToRailApiDate('2026-5-18')).toBe('18-05-2026');
    });
    it('pads DD-MM-YYYY input', () => {
      expect(service.normalizeToRailApiDate('5-4-2026')).toBe('05-04-2026');
    });
    it('returns null for garbage', () => {
      expect(service.normalizeToRailApiDate('not-a-date')).toBeNull();
    });
    it('converts slash-separated dates correctly', () => {
      expect(service.normalizeToRailApiDate('2026/04/05')).toBe('05-04-2026');
      expect(service.normalizeToRailApiDate('05/04/2026')).toBe('05-04-2026');
      expect(service.normalizeToRailApiDate('2026/6/2')).toBe('02-06-2026');
      expect(service.normalizeToRailApiDate('5/4/2026')).toBe('05-04-2026');
    });
    it('returns null for invalid calendar dates', () => {
      expect(service.normalizeToRailApiDate('2026-02-30')).toBeNull();
      expect(service.normalizeToRailApiDate('2026-13-05')).toBeNull();
      expect(service.normalizeToRailApiDate('32-05-2026')).toBeNull();
    });
    it('handles descriptive dates with moment fallback', () => {
      expect(service.normalizeToRailApiDate('2 Jun 2026')).toBe('02-06-2026');
      expect(service.normalizeToRailApiDate('June 2, 2026')).toBe('02-06-2026');
    });
  });

  describe('searchStations (cache integration)', () => {
    it('returns cached stations when cache has sufficient results', async () => {
      const cached = Array.from({ length: 6 }, (_, i) => ({
        stationCode: `ST${i}`,
        stationName: `Station ${i}`,
      }));
      mockStationCache.search.mockResolvedValueOnce(cached);

      const result = await service.searchStations('mum');

      expect(mockStationCache.search).toHaveBeenCalledWith('mum');
      expect(result).toEqual({ data: { stationList: cached } });
    });

    it('falls back to RapidAPI when the cache misses, and backfills the cache', async () => {
      mockStationCache.search.mockResolvedValueOnce([]);
      const apiRows = [{ stationCode: 'CSTM', stationName: 'MUMBAI CST' }];
      mockIrctc.searchStationsViaRapidApi.mockResolvedValueOnce(apiRows);

      const result = await service.searchStations('mum');

      expect(mockIrctc.searchStationsViaRapidApi).toHaveBeenCalledWith('mum');
      expect(result).toEqual({ data: { stationList: apiRows } });
      expect(mockStationCache.upsertMany).toHaveBeenCalledWith(apiRows);
    });

    it('returns an empty list when both cache and RapidAPI miss', async () => {
      mockStationCache.search.mockResolvedValueOnce([]);
      mockIrctc.searchStationsViaRapidApi.mockResolvedValueOnce([]);

      await expect(service.searchStations('zzzz')).resolves.toEqual({
        data: { stationList: [] },
      });
      expect(mockStationCache.upsertMany).not.toHaveBeenCalled();
    });
  });

  describe('searchTrains (cache integration)', () => {
    it('delegates to cache.getOrSet with a 24h TTL key', async () => {
      const fakeResult = { data: { trainList: [] } };
      mockCache.getOrSet.mockResolvedValueOnce(fakeResult);

      const result = await service.searchTrains('NDLS', 'CSTM', '2026-04-05');

      expect(mockCache.getOrSet).toHaveBeenCalledWith(
        'trains:NDLS:CSTM:05-04-2026',
        expect.any(Function),
        24 * 60 * 60 * 1000,
      );
      expect(result).toBe(fakeResult);
    });

    it('throws for an invalid date', async () => {
      await expect(
        service.searchTrains('NDLS', 'CSTM', 'bad-date'),
      ).rejects.toThrow('Invalid journey date');
      expect(mockCache.getOrSet).not.toHaveBeenCalled();
    });
  });

  describe('findBestTrains', () => {
    it('evaluates the supplied train rows instead of running a second search', async () => {
      const searchSpy = jest.spyOn(service, 'searchTrains');
      const findSpy = jest
        .spyOn(service, 'findAlternatePaths')
        .mockResolvedValue(altResult('1', [confirmedLeg('A', 'D', 240)]));

      const result = await service.findBestTrains({
        from: 'A',
        to: 'D',
        date: '2026-05-09',
        trains: [
          {
            trainNumber: '1',
            trainName: 'Listed Train',
            departureTime: '07:30',
            arrivalTime: '10:00',
            fromStnCode: 'A',
            toStnCode: 'D',
            avlClasses: ['SL'],
          },
        ],
      });

      expect(searchSpy).not.toHaveBeenCalled();
      expect(findSpy).toHaveBeenCalledTimes(1);
      expect(findSpy).toHaveBeenCalledWith(
        expect.objectContaining({ trainNumber: '1' }),
        undefined,
        undefined,
      );
      expect(result.results).toHaveLength(1);
      expect(result.results[0].train.trainNumber).toBe('1');
    });

    it('keeps only trains with confirmed tickets from origin and ranks by confirmed hours before station hops', async () => {
      jest.spyOn(service, 'findAlternatePaths').mockImplementation((input) => {
        if (input.trainNumber === '101') {
          return Promise.resolve(
            altResult('101', [confirmedLeg('A', 'D', 100)]),
          );
        }
        if (input.trainNumber === '102') {
          return Promise.resolve(
            altResult('102', [
              realtimeLeg('A', 'B'),
              confirmedLeg('B', 'D', 180),
            ]),
          );
        }
        return Promise.resolve(
          altResult('103', [
            confirmedLeg('A', 'B', 240),
            realtimeLeg('B', 'D'),
          ]),
        );
      });

      const result = await service.findBestTrains({
        from: 'A',
        to: 'D',
        date: '2026-05-09',
        trains: [
          {
            trainNumber: '101',
            trainName: 'Short Confirm',
            departureTime: '08:00',
            arrivalTime: '12:00',
            fromStnCode: 'A',
            toStnCode: 'D',
            duration: 240,
            avlClasses: ['SL'],
          },
          {
            trainNumber: '102',
            trainName: 'No Origin Confirm',
            departureTime: '09:00',
            arrivalTime: '13:00',
            fromStnCode: 'A',
            toStnCode: 'D',
            duration: 240,
            avlClasses: ['SL'],
          },
          {
            trainNumber: '103',
            trainName: 'Long Confirm',
            departureTime: '10:00',
            arrivalTime: '14:00',
            fromStnCode: 'A',
            toStnCode: 'D',
            duration: 240,
            avlClasses: ['SL'],
          },
        ],
      });

      expect(result.results.map((r) => r.train.trainNumber)).toEqual([
        '103',
        '101',
      ]);
      expect(result.results[0].score.originConfirmed).toBe(true);
      expect(
        result.results[0].score.confirmedContiguousStationsFromOrigin,
      ).toBe(1);
      expect(result.candidatesSkipped).toBe(1);
    });

    it('breaks confirmed-hour ties by fastest train, then price, then longest leg', async () => {
      jest.spyOn(service, 'findAlternatePaths').mockImplementation((input) => {
        if (input.trainNumber === '201') {
          return Promise.resolve(
            altResult('201', [confirmedLeg('A', 'D', 240, 800)]),
          );
        }
        if (input.trainNumber === '202') {
          return Promise.resolve(
            altResult('202', [confirmedLeg('A', 'D', 240, 700)]),
          );
        }
        if (input.trainNumber === '203') {
          return Promise.resolve(
            altResult('203', [confirmedLeg('A', 'D', 240, 600)]),
          );
        }
        return Promise.resolve(
          altResult('204', [
            confirmedLeg('A', 'B', 120, 600),
            confirmedLeg('B', 'D', 120, 0),
          ]),
        );
      });

      const result = await service.findBestTrains({
        from: 'A',
        to: 'D',
        date: '2026-05-09',
        trains: [
          {
            trainNumber: '201',
            trainName: 'Fast Pricey',
            departureTime: '08:00',
            arrivalTime: '11:00',
            fromStnCode: 'A',
            toStnCode: 'D',
            duration: 180,
            avlClasses: ['SL'],
          },
          {
            trainNumber: '202',
            trainName: 'Slow Cheap',
            departureTime: '09:00',
            arrivalTime: '14:00',
            fromStnCode: 'A',
            toStnCode: 'D',
            duration: 300,
            avlClasses: ['SL'],
          },
          {
            trainNumber: '203',
            trainName: 'Same Speed Cheapest',
            departureTime: '10:00',
            arrivalTime: '13:00',
            fromStnCode: 'A',
            toStnCode: 'D',
            duration: 180,
            avlClasses: ['SL'],
          },
          {
            trainNumber: '204',
            trainName: 'Same Fare Split Leg',
            departureTime: '11:00',
            arrivalTime: '14:00',
            fromStnCode: 'A',
            toStnCode: 'D',
            duration: 180,
            avlClasses: ['SL'],
          },
        ],
      });

      expect(result.results.map((r) => r.train.trainNumber)).toEqual([
        '203',
        '204',
        '201',
        '202',
      ]);
    });

    it('enforces acOnly when train avlClasses is empty or undefined by defaulting to AC-only fallback classes', async () => {
      const findSpy = jest
        .spyOn(service, 'findAlternatePaths')
        .mockResolvedValue(altResult('301', [confirmedLeg('A', 'D', 240)]));

      await service.findBestTrains({
        from: 'A',
        to: 'D',
        date: '2026-05-09',
        acOnly: true,
        trains: [
          {
            trainNumber: '301',
            trainName: 'Undefined Class Train',
            departureTime: '07:30',
            arrivalTime: '10:00',
            fromStnCode: 'A',
            toStnCode: 'D',
            avlClasses: undefined,
          },
        ],
      });

      expect(findSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          trainNumber: '301',
          avlClasses: expect.arrayContaining(['3A', '2A', '1A']),
        }),
        undefined,
        undefined,
      );
      const calledArgs = findSpy.mock.calls[0][0];
      expect(calledArgs.avlClasses).not.toContain('SL');
      expect(calledArgs.avlClasses).not.toContain('2S');
    });
  });

  describe('getPnrStatus', () => {
    const origKey = process.env.RAPIDAPI_IRCTC_KEY;
    beforeEach(() => {
      process.env.RAPIDAPI_IRCTC_KEY = 'test-rapidapi-key';
    });
    afterEach(() => {
      if (origKey) process.env.RAPIDAPI_IRCTC_KEY = origKey;
      else delete process.env.RAPIDAPI_IRCTC_KEY;
    });

    it('calls getPNRStatus endpoint with correct options and returns normalized data', async () => {
      const rawApiData = {
        success: true,
        data: {
          pnrNumber: '4441017627',
          dateOfJourney: 'Aug 30, 2026 3:15:00 PM',
          trainNumber: '17377',
          trainName: 'BJP MAQ EXP',
          sourceStation: 'BJP',
          destinationStation: 'HAS',
          reservationUpto: 'HAS',
          boardingPoint: 'BJP',
          journeyClass: 'SL',
          numberOfpassenger: 1,
          chartStatus: 'Chart Not Prepared',
          quota: 'GN',
          arrivalDate: 'Aug 31, 2026 2:35:00 AM',
          passengerList: [
            {
              passengerSerialNumber: 1,
              bookingStatus: 'CNF',
              bookingCoachId: 'S3',
              bookingBerthNo: 7,
              bookingBerthCode: 'SL',
              bookingStatusDetails: 'CNF/S3/7/SL',
              currentStatus: 'CNF',
              currentCoachId: 'S3',
              currentBerthNo: 7,
              currentBerthCode: 'SL',
              currentStatusDetails: 'CNF/S3/7/SL',
            },
          ],
        },
      };
      const getSpy = jest
        .spyOn(axios, 'get')
        .mockResolvedValueOnce({ data: rawApiData });

      const result = await service.getPnrStatus('4441017627');

      expect(getSpy).toHaveBeenCalledWith(
        'https://irctc-indian-railway-pnr-status.p.rapidapi.com/getPNRStatus/4441017627',
        {
          headers: {
            'x-rapidapi-key': 'test-rapidapi-key',
            'x-rapidapi-host': 'irctc-indian-railway-pnr-status.p.rapidapi.com',
            'Content-Type': 'application/json',
          },
          timeout: 10_000,
        },
      );
      expect(result.status).toBe(true);
      expect(result.data?.Pnr).toBe('4441017627');
      expect(result.data?.TrainNo).toBe('17377');
      expect(result.data?.TrainName).toBe('BJP MAQ EXP');
      expect(result.data?.Doj).toBe('30-08-2026');
      expect(result.data?.DepartureTime).toBe('15:15');
      expect(result.data?.ArrivalTime).toBe('02:35');
      expect(result.data?.From).toBe('BJP');
      expect(result.data?.To).toBe('HAS');
      expect(result.data?.Quota).toBe('GN');
      expect(result.data?.Class).toBe('SL');
      expect(result.data?.PassengerStatus).toEqual([
        expect.objectContaining({
          Number: 1,
          CurrentStatus: 'CNF/S3/7/SL',
          BookingStatus: 'CNF/S3/7/SL',
        }),
      ]);
      getSpy.mockRestore();
    });

    it('handles flushed or not generated PNR response gracefully', async () => {
      const getSpy = jest.spyOn(axios, 'get').mockResolvedValueOnce({
        data: {
          success: false,
          message: 'Flushed Pnr Or Pnr Not Yet Generated',
        },
      });

      const result = await service.getPnrStatus('1234567890');
      expect(result.status).toBe(false);
      expect(result.message).toBe('Flushed Pnr Or Pnr Not Yet Generated');
      getSpy.mockRestore();
    });

    it('throws error when axios request fails', async () => {
      const getSpy = jest
        .spyOn(axios, 'get')
        .mockRejectedValueOnce(new Error('Network Error'));

      await expect(service.getPnrStatus('1234567890')).rejects.toThrow(
        'Failed to fetch PNR status: Network Error',
      );
      getSpy.mockRestore();
    });
  });

  describe('findAlternatePaths with station offsets', () => {
    const input = {
      trainNumber: '12951',
      from: 'NZM', // Boarding NZM
      to: 'BPL', // Destination BPL
      date: '2026-06-02',
    };

    beforeEach(() => {
      service['irctc'].getTrainSchedule = jest.fn().mockResolvedValue({
        ok: true,
        schedule: {
          trainName: 'Test Express',
          stationList: [
            { stationCode: 'NDLS' }, // NZM - 1
            { stationCode: 'NZM' }, // Boarding X
            { stationCode: 'AGC' },
            { stationCode: 'BPL' }, // Destination Y
            { stationCode: 'BCT' }, // BPL + 1
          ],
        },
      });
    });

    it('returns direct route immediately if it is fully confirmed', async () => {
      // Mock probeSegmentAllClasses to return confirmed segment for NZM -> BPL
      const probeSpy = jest
        .spyOn(service as any, 'probeSegmentAllClasses')
        .mockResolvedValue({
          bestConfirmedClassIndex: 0,
          perClass: [
            {
              fare: 100,
              day: {
                availablityStatus: 'AVAILABLE 10',
                vendorPredictionStatus: 'Confirm',
              },
            },
          ],
        });

      const result = await service.findAlternatePaths(input);

      // Verify it successfully found direct confirmed route NZM -> BPL
      expect(result.legs).toHaveLength(1);
      expect(result.legs[0].from).toBe('NZM');
      expect(result.legs[0].to).toBe('BPL');
      expect(result.legs[0].segmentKind).toBe('confirmed');
      expect(probeSpy).toHaveBeenCalledTimes(2); // Probed NZM -> BPL and NZM -> AGC in parallel wave
      probeSpy.mockRestore();
    });

    it('tries offset combinations and returns the first fully confirmed offset result if direct is waitlisted', async () => {
      const probeSpy = jest
        .spyOn(service as any, 'probeSegmentAllClasses')
        .mockImplementation((trainNumber, fromStn, toStn) => {
          // Direct NZM -> BPL is waitlisted
          if (fromStn === 'NZM' && toStn === 'BPL') {
            return Promise.resolve({
              bestConfirmedClassIndex: null,
              perClass: [],
              displayRow: { availablityStatus: 'RLWL 1' },
            });
          }
          // Offset NDLS -> BPL is confirmed
          if (fromStn === 'NDLS' && toStn === 'BPL') {
            return Promise.resolve({
              bestConfirmedClassIndex: 0,
              perClass: [
                {
                  fare: 120,
                  day: {
                    availablityStatus: 'AVAILABLE 5',
                    vendorPredictionStatus: 'Confirm',
                  },
                },
              ],
            });
          }
          return Promise.resolve({
            bestConfirmedClassIndex: null,
            perClass: [],
          });
        });

      const result = await service.findAlternatePaths(input);

      // NZM -> BPL (failed) -> offsets tried
      // Combination 1: before=1, after=0 -> NDLS -> BPL (succeeds!)
      expect(result.legs).toHaveLength(1);
      expect(result.legs[0].from).toBe('NDLS');
      expect(result.legs[0].to).toBe('BPL');
      expect(result.legs[0].segmentKind).toBe('confirmed');
      probeSpy.mockRestore();
    });

    it('successfully processes input dates formatted as DD-MM-YYYY without producing invalid dates', async () => {
      const probeSpy = jest
        .spyOn(service as any, 'probeSegmentAllClasses')
        .mockResolvedValue({
          bestConfirmedClassIndex: 0,
          perClass: [
            {
              fare: 100,
              day: {
                availablityStatus: 'AVAILABLE 10',
                vendorPredictionStatus: 'Confirm',
              },
            },
          ],
        });

      const result = await service.findAlternatePaths({
        ...input,
        date: '02-06-2026',
      });

      expect(result.legs).toHaveLength(1);
      expect(result.legs[0].from).toBe('NZM');
      expect(result.legs[0].to).toBe('BPL');
      expect(result.legs[0].segmentKind).toBe('confirmed');
      expect(probeSpy).toHaveBeenCalledWith(
        expect.any(String),
        'NZM',
        expect.any(String),
        '02-06-2026',
        expect.any(Array),
        expect.any(String),
        undefined,
      );
      probeSpy.mockRestore();
    });

    it('correctly adjusts segment probe dates based on station dayCount when using offsets', async () => {
      service['irctc'].getTrainSchedule = jest.fn().mockResolvedValue({
        ok: true,
        schedule: {
          trainName: 'Test Express MultiDay',
          stationList: [
            { stationCode: 'NDLS', dayCount: 1 },
            { stationCode: 'NZM', dayCount: 2 },
            { stationCode: 'AGC', dayCount: 2 },
            { stationCode: 'BPL', dayCount: 3 },
            { stationCode: 'BCT', dayCount: 4 },
          ],
        },
      });

      const probeSpy = jest
        .spyOn(service as any, 'probeSegmentAllClasses')
        .mockImplementation((trainNumber, fromStn, toStn, date) => {
          // Direct NZM -> BPL on 02-06-2026 is waitlisted
          if (fromStn === 'NZM' && toStn === 'BPL' && date === '02-06-2026') {
            return Promise.resolve({
              bestConfirmedClassIndex: null,
              perClass: [],
              displayRow: { availablityStatus: 'RLWL 1' },
            });
          }
          // Offset NDLS -> BPL on 01-06-2026 is confirmed
          if (fromStn === 'NDLS' && toStn === 'BPL' && date === '01-06-2026') {
            return Promise.resolve({
              bestConfirmedClassIndex: 0,
              perClass: [
                {
                  fare: 120,
                  day: {
                    availablityStatus: 'AVAILABLE 5',
                    vendorPredictionStatus: 'Confirm',
                  },
                },
              ],
            });
          }
          return Promise.resolve({
            bestConfirmedClassIndex: null,
            perClass: [],
          });
        });

      const result = await service.findAlternatePaths({
        trainNumber: '12951',
        from: 'NZM',
        to: 'BPL',
        date: '02-06-2026',
      });

      // Assert that it found the offset route starting at NDLS on the correct day (01-06-2026)
      expect(result.legs).toHaveLength(1);
      expect(result.legs[0].from).toBe('NDLS');
      expect(result.legs[0].to).toBe('BPL');
      expect(result.legs[0].segmentKind).toBe('confirmed');

      // Verify that the probe dates were called correctly:
      // NZM -> BPL direct should be queried on 02-06-2026
      expect(probeSpy).toHaveBeenCalledWith(
        expect.any(String),
        'NZM',
        'BPL',
        '02-06-2026',
        expect.any(Array),
        expect.any(String),
        undefined,
      );

      // NDLS -> BPL offset should be queried on 01-06-2026 (Day 1 departure for Day 2 NZM boarding)
      expect(probeSpy).toHaveBeenCalledWith(
        expect.any(String),
        'NDLS',
        'BPL',
        '01-06-2026',
        expect.any(Array),
        expect.any(String),
        undefined,
      );

      expect(result.trainStartDate).toBe('2026-06-01');

      probeSpy.mockRestore();
    });

    it('handles circular/loop station routes without throwing errors or failing to find paths', async () => {
      service['irctc'].getTrainSchedule = jest.fn().mockResolvedValue({
        ok: true,
        schedule: {
          trainName: 'Test Circular Express',
          stationList: [
            { stationCode: 'NDLS', dayCount: 1 },
            { stationCode: 'NZM', dayCount: 1 },
            { stationCode: 'AGC', dayCount: 1 },
            { stationCode: 'NZM', dayCount: 2 },
            { stationCode: 'BPL', dayCount: 2 },
          ],
        },
      });

      const probeSpy = jest
        .spyOn(service as any, 'probeSegmentAllClasses')
        .mockResolvedValue({
          bestConfirmedClassIndex: 0,
          perClass: [
            {
              fare: 100,
              day: {
                availablityStatus: 'AVAILABLE 10',
                vendorPredictionStatus: 'Confirm',
              },
            },
          ],
        });

      const result = await service.findAlternatePaths({
        trainNumber: '12345',
        from: 'AGC',
        to: 'NZM',
        date: '02-06-2026',
      });

      expect(result.legs).toHaveLength(1);
      expect(result.legs[0].from).toBe('AGC');
      expect(result.legs[0].to).toBe('NZM');
      expect(result.legs[0].segmentKind).toBe('confirmed');

      expect(probeSpy).toHaveBeenCalledWith(
        '12345',
        'AGC',
        'NZM',
        '02-06-2026',
        expect.any(Array),
        expect.any(String),
        undefined,
      );

      probeSpy.mockRestore();
    });

    it('correctly maps repeated station codes to their exact route dayCount indices during hop traversal', async () => {
      service['irctc'].getTrainSchedule = jest.fn().mockResolvedValue({
        ok: true,
        schedule: {
          trainName: 'Test Circular MultiLeg',
          stationList: [
            { stationCode: 'NDLS', dayCount: 1 },
            { stationCode: 'NZM', dayCount: 1 },
            { stationCode: 'AGC', dayCount: 2 },
            { stationCode: 'NZM', dayCount: 3 },
            { stationCode: 'BPL', dayCount: 3 },
          ],
        },
      });

      const probeSpy = jest
        .spyOn(service as any, 'probeSegmentAllClasses')
        .mockImplementation((_trainNumber, fromStn, toStn, _date) => {
          if (fromStn === 'NDLS' && toStn === 'BPL') {
            return Promise.resolve({
              bestConfirmedClassIndex: null,
              perClass: [],
              displayRow: { availablityStatus: 'WL 1' },
            });
          }
          return Promise.resolve({
            bestConfirmedClassIndex: 0,
            perClass: [
              {
                fare: 100,
                day: {
                  availablityStatus: 'AVAILABLE 10',
                  vendorPredictionStatus: 'Confirm',
                },
              },
            ],
          });
        });

      const result = await service.findAlternatePaths({
        trainNumber: '99999',
        from: 'NDLS',
        to: 'BPL',
        date: '03-06-2026',
      });

      expect(result.trainStartDate).toBe('2026-06-03');
      expect(probeSpy).toHaveBeenCalledWith(
        '99999',
        'NZM',
        'BPL',
        '05-06-2026',
        expect.any(Array),
        expect.any(String),
        undefined,
      );

      probeSpy.mockRestore();
    });
  });
});
