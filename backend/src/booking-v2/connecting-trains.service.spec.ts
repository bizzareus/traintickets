import { Test, TestingModule } from '@nestjs/testing';
import { ConnectingTrainsService } from './connecting-trains.service';
import { ConnectingRouteGraphService } from './connecting-route-graph.service';
import { BookingV2Service } from './booking-v2.service';

const TEST_SCHEDULES = [
  {
    stationList: [
      { stationCode: 'NDLS', stationName: 'New Delhi', distance: '0' },
      { stationCode: 'CNB', stationName: 'Kanpur Central', distance: '441' },
      { stationCode: 'PNBE', stationName: 'Patna Jn', distance: '998' },
    ],
  },
  {
    stationList: [
      { stationCode: 'NDLS', stationName: 'New Delhi', distance: '0' },
      { stationCode: 'BRC', stationName: 'Vadodara Jn', distance: '993' },
      { stationCode: 'MMCT', stationName: 'Mumbai Central', distance: '1384' },
    ],
  },
  {
    stationList: [
      { stationCode: 'SBC', stationName: 'KSR Bengaluru', distance: '0' },
      { stationCode: 'ET', stationName: 'Itarsi Jn', distance: '1491' },
      { stationCode: 'BSB', stationName: 'Varanasi Jn', distance: '2226' },
    ],
  },
];

describe('ConnectingTrainsService', () => {
  let service: ConnectingTrainsService;
  let routeGraph: ConnectingRouteGraphService;
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
        ConnectingRouteGraphService,
        {
          provide: BookingV2Service,
          useValue: mockBookingV2,
        },
      ],
    }).compile();

    service = module.get<ConnectingTrainsService>(ConnectingTrainsService);
    routeGraph = module.get<ConnectingRouteGraphService>(
      ConnectingRouteGraphService,
    );
    routeGraph.buildFromSchedules(TEST_SCHEDULES);
  });

  describe('searchConnectingTrains', () => {
    it('returns isSupportedCorridor=false when no graph path exists', async () => {
      const result = await service.searchConnectingTrains({
        from: 'XXX',
        to: 'YYY',
        date: '2026-11-10',
      });
      expect(result.isSupportedCorridor).toBe(false);
      expect(result.journeys).toHaveLength(0);
    });

    it('finds and pairs valid connecting trains with >= 30m layover', async () => {
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
                    departureTime: '12:20', // Layover = 60 mins
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
                    departureTime: '11:35', // Layover = 15 mins (< 30m) -> excluded
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
      expect(journey.intermediateStationName).toBe('Kanpur Central');
      expect(journey.layoverMinutes).toBe(60);
      expect(journey.isFullyConfirmed).toBe(true);
      expect(journey.preferredClass).toBe('3A');
      expect(journey.totalFare).toBe(2000);
      expect(journey.legs[0].trainNumber).toBe('12004');
      expect(journey.legs[1].trainNumber).toBe('12394');

      const excluded = res.journeys.find(
        (j) => j.legs[1].trainNumber === '12306',
      );
      expect(excluded).toBeUndefined();
    });

    it('expands 1-stop searches dynamically to arbitrary routes (NDLS -> MMCT via BRC)', async () => {
      (mockBookingV2.searchTrains as jest.Mock).mockImplementation(
        (from: string, to: string, date: string) => {
          if (from === 'NDLS' && to === 'BRC') {
            return Promise.resolve({
              data: {
                trainList: [
                  {
                    trainNumber: '12952',
                    trainName: 'Mumbai Rajdhani',
                    fromStnCode: 'NDLS',
                    toStnCode: 'BRC',
                    departureTime: '16:55',
                    arrivalTime: '03:40',
                    duration: 645,
                    avlClasses: ['3A'],
                    availabilityCache: {
                      '3A': {
                        fare: 2100,
                        availabilityDisplayName: 'AVAILABLE 18',
                        availablityType: 1,
                      },
                    },
                  },
                ],
              },
            });
          }
          if (from === 'BRC' && to === 'MMCT' && date === '2026-11-11') {
            return Promise.resolve({
              data: {
                trainList: [
                  {
                    trainNumber: '12010',
                    trainName: 'Shatabdi Express',
                    fromStnCode: 'BRC',
                    toStnCode: 'MMCT',
                    departureTime: '05:10', // 90 mins after 03:40 arrival
                    arrivalTime: '10:30',
                    duration: 320,
                    avlClasses: ['3A'],
                    availabilityCache: {
                      '3A': {
                        fare: 750,
                        availabilityDisplayName: 'AVAILABLE 42',
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
        to: 'MMCT',
        date: '2026-11-10',
      });

      expect(res.isSupportedCorridor).toBe(true);
      expect(res.journeys).toHaveLength(1);
      expect(res.journeys[0].intermediateStation).toBe('BRC');
      expect(res.journeys[0].intermediateStationName).toBe('Vadodara Jn');
      expect(res.journeys[0].layoverMinutes).toBe(90);
      expect(res.journeys[0].totalFare).toBe(2850);
    });

    it('handles multi-day Leg 1 arrivals (Day 0 -> Day 1 -> Day 2 Leg 2)', async () => {
      (mockBookingV2.searchTrains as jest.Mock).mockImplementation(
        (from: string, to: string, date: string) => {
          if (from === 'SBC' && to === 'ET') {
            return Promise.resolve({
              data: {
                trainList: [
                  {
                    trainNumber: '12627',
                    trainName: 'Karnataka Express',
                    fromStnCode: 'SBC',
                    toStnCode: 'ET',
                    departureTime: '19:20',
                    duration: 1660, // 27h 40m -> arrives Day 1 at 23:00
                    avlClasses: ['3A'],
                    availabilityCache: {
                      '3A': {
                        fare: 1650,
                        availabilityDisplayName: 'AVAILABLE 8',
                        availablityType: 1,
                      },
                    },
                  },
                ],
              },
            });
          }
          if (from === 'ET' && to === 'BSB' && date === '2026-11-12') {
            return Promise.resolve({
              data: {
                trainList: [
                  {
                    trainNumber: '12167',
                    trainName: 'LTT BSB SF Exp',
                    fromStnCode: 'ET',
                    toStnCode: 'BSB',
                    departureTime: '01:00', // 2h after Day 1 23:00 arrival -> Day 2!
                    duration: 840,
                    avlClasses: ['3A'],
                    availabilityCache: {
                      '3A': {
                        fare: 1100,
                        availabilityDisplayName: 'AVAILABLE 14',
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
        from: 'SBC',
        to: 'BSB',
        date: '2026-11-10',
      });

      expect(res.isSupportedCorridor).toBe(true);
      expect(res.journeys).toHaveLength(1);
      expect(res.journeys[0].layoverMinutes).toBe(120);
      expect(res.journeys[0].legs[0].boardingDate).toBe('2026-11-10');
      expect(res.journeys[0].legs[1].boardingDate).toBe('2026-11-12');
    });

    it('rejects connections across different physical stations at the transfer city', async () => {
      (mockBookingV2.searchTrains as jest.Mock).mockImplementation(
        (from: string, to: string, date: string) => {
          if (from === 'NDLS' && to === 'CNB') {
            return Promise.resolve({
              data: {
                trainList: [
                  {
                    trainNumber: '12004',
                    fromStnCode: 'NDLS',
                    toStnCode: 'CPA', // Kanpur Anwarganj (different station!)
                    departureTime: '06:10',
                    duration: 300,
                    avlClasses: ['3A'],
                    availabilityCache: {
                      '3A': { fare: 900, availablityType: 1 },
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
                    fromStnCode: 'CNB', // Kanpur Central
                    toStnCode: 'PNBE',
                    departureTime: '12:00',
                    duration: 420,
                    avlClasses: ['3A'],
                    availabilityCache: {
                      '3A': { fare: 1000, availablityType: 1 },
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
      expect(res.journeys).toHaveLength(0);
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
