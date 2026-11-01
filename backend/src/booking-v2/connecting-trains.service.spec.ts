import { Test, TestingModule } from '@nestjs/testing';
import { ConnectingTrainsService } from './connecting-trains.service';
import { BookingV2Service } from './booking-v2.service';

describe('ConnectingTrainsService', () => {
  let service: ConnectingTrainsService;
  let mockBookingV2: Partial<BookingV2Service>;

  beforeEach(async () => {
    mockBookingV2 = {
      normalizeToRailApiDate: jest.fn((d: string) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          const [y, m, day] = d.split('-');
          return `${day}-${m}-${y}`;
        }
        if (/^\d{2}-\d{2}-\d{4}$/.test(d)) return d;
        return null;
      }),
      searchTrains: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectingTrainsService,
        {
          provide: BookingV2Service,
          useValue: mockBookingV2,
        },
      ],
    }).compile();

    service = module.get<ConnectingTrainsService>(ConnectingTrainsService);
  });

  describe('findCorridor', () => {
    it('identifies NDLS to PNBE as a supported corridor', () => {
      const corridor = service.findCorridor('NDLS', 'PNBE');
      expect(corridor).not.toBeNull();
      expect(corridor?.intermediateHubs).toEqual(['CNB', 'PRYJ', 'DDU']);
    });

    it('matches hub aliases like DLI to PPTA', () => {
      const corridor = service.findCorridor('DLI', 'PPTA');
      expect(corridor).not.toBeNull();
      expect(corridor?.fromHub).toBe('NDLS');
      expect(corridor?.toHub).toBe('PNBE');
    });

    it('returns null for unsupported corridors', () => {
      const corridor = service.findCorridor('SBC', 'MAS');
      expect(corridor).toBeNull();
    });
  });

  describe('searchConnectingTrains', () => {
    it('returns isSupportedCorridor=false for non-matching route', async () => {
      const result = await service.searchConnectingTrains({
        from: 'SBC',
        to: 'MAS',
        date: '2026-11-10',
      });
      expect(result.isSupportedCorridor).toBe(false);
      expect(result.journeys).toHaveLength(0);
    });

    it('finds and pairs valid connecting trains with >= 30m layover', async () => {
      // Mock Leg 1 trains: NDLS -> CNB
      (mockBookingV2.searchTrains as jest.Mock).mockImplementation(
        (from: string, to: string, date: string) => {
          if (from === 'NDLS' && to === 'CNB') {
            return Promise.resolve({
              data: {
                trainList: [
                  {
                    trainNumber: '12004',
                    trainName: 'Lucknow Shatabdi',
                    fromStnCode: 'NDLS',
                    toStnCode: 'CNB',
                    departureTime: '06:10',
                    arrivalTime: '11:20',
                    duration: 310,
                    avlClasses: ['3A', '2A'],
                    availabilityCache: {
                      '3A': {
                        fare: 950,
                        availabilityDisplayName: 'AVAILABLE 45',
                        availablityType: 1,
                      },
                      '2A': {
                        fare: 1400,
                        availabilityDisplayName: 'AVAILABLE 12',
                        availablityType: 1,
                      },
                    },
                  },
                ],
              },
            });
          }
          if (from === 'CNB' && to === 'PNBE' && date === '2026-11-10') {
            return Promise.resolve({
              data: {
                trainList: [
                  {
                    trainNumber: '12394',
                    trainName: 'Sampoorna Kranti Express',
                    fromStnCode: 'CNB',
                    toStnCode: 'PNBE',
                    departureTime: '12:20', // Layover = 12:20 - 11:20 = 60 mins
                    arrivalTime: '19:30',
                    duration: 430,
                    avlClasses: ['3A', '2A'],
                    availabilityCache: {
                      '3A': {
                        fare: 1050,
                        availabilityDisplayName: 'AVAILABLE 20',
                        availablityType: 1,
                      },
                      '2A': {
                        fare: 1550,
                        availabilityDisplayName: 'GNWL 5',
                        availablityType: 3,
                      },
                    },
                  },
                  {
                    trainNumber: '12306',
                    trainName: 'Too Short Layover Express',
                    fromStnCode: 'CNB',
                    toStnCode: 'PNBE',
                    departureTime: '11:35', // Layover = 15 mins (< 30m) -> should be excluded!
                    arrivalTime: '18:00',
                    duration: 385,
                    avlClasses: ['3A'],
                    availabilityCache: {
                      '3A': {
                        fare: 1000,
                        availabilityDisplayName: 'AVAILABLE 10',
                        availablityType: 1,
                      },
                    },
                  },
                ],
              },
            });
          }
          return Promise.resolve({ data: { trainList: [] } });
        },
      );

      const res = await service.searchConnectingTrains({
        from: 'NDLS',
        to: 'PNBE',
        date: '2026-11-10',
      });

      expect(res.isSupportedCorridor).toBe(true);
      expect(res.journeys.length).toBeGreaterThan(0);

      const journey = res.journeys[0];
      expect(journey.intermediateStation).toBe('CNB');
      expect(journey.layoverMinutes).toBe(60);
      expect(journey.isFullyConfirmed).toBe(true);
      expect(journey.preferredClass).toBe('3A');
      expect(journey.totalFare).toBe(2000); // 950 + 1050
      expect(journey.legs[0].trainNumber).toBe('12004');
      expect(journey.legs[1].trainNumber).toBe('12394');

      // Verify the 15m layover train was rejected
      const excluded = res.journeys.find(
        (j) => j.legs[1].trainNumber === '12306',
      );
      expect(excluded).toBeUndefined();
    });

    it('correctly handles overnight arrival and day rollover for Leg 2', async () => {
      (mockBookingV2.searchTrains as jest.Mock).mockImplementation(
        (from: string, to: string, date: string) => {
          if (from === 'NDLS' && to === 'CNB') {
            return Promise.resolve({
              data: {
                trainList: [
                  {
                    trainNumber: '12560',
                    trainName: 'Shiv Ganga Express',
                    departureTime: '20:05',
                    arrivalTime: '01:00', // Arrives next day 01:00
                    duration: 295,
                    avlClasses: ['3A'],
                    availabilityCache: {
                      '3A': {
                        fare: 800,
                        availabilityDisplayName: 'AVAILABLE 10',
                        availablityType: 1,
                      },
                    },
                  },
                ],
              },
            });
          }
          if (from === 'CNB' && to === 'PNBE' && date === '2026-11-11') {
            // Next day Leg 2
            return Promise.resolve({
              data: {
                trainList: [
                  {
                    trainNumber: '12402',
                    trainName: 'Magadh Express Early Morning',
                    departureTime: '02:00', // 60 mins layover from 01:00 arrival
                    arrivalTime: '09:00',
                    duration: 420,
                    avlClasses: ['3A'],
                    availabilityCache: {
                      '3A': {
                        fare: 900,
                        availabilityDisplayName: 'AVAILABLE 15',
                        availablityType: 1,
                      },
                    },
                  },
                ],
              },
            });
          }
          return Promise.resolve({ data: { trainList: [] } });
        },
      );

      const res = await service.searchConnectingTrains({
        from: 'NDLS',
        to: 'PNBE',
        date: '2026-11-10',
      });

      expect(res.journeys.length).toBeGreaterThan(0);
      const j = res.journeys[0];
      expect(j.layoverMinutes).toBe(60);
      expect(j.legs[0].boardingDate).toBe('2026-11-10');
      expect(j.legs[1].boardingDate).toBe('2026-11-11');
      expect(j.isFullyConfirmed).toBe(true);
    });
  });
});
