import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectingRouteGraphService } from './connecting-route-graph.service';

const SAMPLE_SCHEDULES = [
  // NDLS -> CNB -> PRYJ -> DDU -> PNBE (via Rajdhani/express corridor)
  {
    stationList: [
      { stationCode: 'NDLS', stationName: 'NEW DELHI', distance: '0' },
      { stationCode: 'CNB', stationName: 'KANPUR CENTRAL', distance: '441' },
      { stationCode: 'PRYJ', stationName: 'Prayagraj  Jn.', distance: '636' },
      { stationCode: 'DDU', stationName: 'Dd Upadhyaya Jn', distance: '788' },
      { stationCode: 'PNBE', stationName: 'Patna Jn', distance: '998' },
    ],
  },
  // Extra trains terminating at CNB / starting from CNB
  {
    stationList: [
      { stationCode: 'NDLS', stationName: 'New Delhi', distance: '0' },
      { stationCode: 'ALJN', stationName: 'Aligarh Jn', distance: '126' },
      { stationCode: 'CNB', stationName: 'Kanpur Central', distance: '441' },
    ],
  },
  {
    stationList: [
      { stationCode: 'CNB', stationName: 'Kanpur Central', distance: '0' },
      { stationCode: 'PRYJ', stationName: 'Prayagraj Jn.', distance: '195' },
      { stationCode: 'DDU', stationName: 'Dd Upadhyaya Jn', distance: '347' },
      { stationCode: 'PNBE', stationName: 'Patna Jn', distance: '557' },
    ],
  },
  // Mumbai (CSMT) -> Bhusawal (BSL) -> Nagpur (NGP) -> Howrah (HWH)
  {
    stationList: [
      { stationCode: 'CSMT', stationName: 'C Shivaji Mah T', distance: '0' },
      { stationCode: 'KYN', stationName: 'Kalyan Jn', distance: '54' },
      { stationCode: 'BSL', stationName: 'Bhusaval Jn', distance: '444' },
      { stationCode: 'NGP', stationName: 'Nagpur', distance: '837' },
      { stationCode: 'HWH', stationName: 'Howrah Jn', distance: '1968' },
    ],
  },
  {
    stationList: [
      { stationCode: 'LTT', stationName: 'Lokmanya Tilak Term', distance: '0' },
      { stationCode: 'BSL', stationName: 'Bhusaval Jn', distance: '428' },
      { stationCode: 'NGP', stationName: 'Nagpur', distance: '821' },
    ],
  },
  // Detour test: NDLS -> BRC -> PNBE (long detour via Gujarat!)
  {
    stationList: [
      { stationCode: 'NDLS', stationName: 'New Delhi', distance: '0' },
      { stationCode: 'BRC', stationName: 'Vadodara Jn', distance: '993' },
      { stationCode: 'MMCT', stationName: 'Mumbai Central', distance: '1384' },
    ],
  },
  {
    stationList: [
      { stationCode: 'BRC', stationName: 'Vadodara Jn', distance: '0' },
      { stationCode: 'PNBE', stationName: 'Patna Jn', distance: '1750' },
    ],
  },
  // Short distance test (< 120 km): NDLS -> GZB -> KRJ
  {
    stationList: [
      { stationCode: 'NDLS', stationName: 'New Delhi', distance: '0' },
      { stationCode: 'GZB', stationName: 'Ghaziabad', distance: '25' },
      { stationCode: 'KRJ', stationName: 'Khurja Jn', distance: '85' },
    ],
  },
  // Route with no direct train: KOTA -> CNB -> GHY
  {
    stationList: [
      { stationCode: 'KOTA', stationName: 'Kota Jn', distance: '0' },
      { stationCode: 'CNB', stationName: 'Kanpur Central', distance: '585' },
    ],
  },
  {
    stationList: [
      { stationCode: 'CNB', stationName: 'Kanpur Central', distance: '0' },
      { stationCode: 'GHY', stationName: 'Guwahati', distance: '1435' },
    ],
  },
];

describe('ConnectingRouteGraphService', () => {
  let service: ConnectingRouteGraphService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConnectingRouteGraphService],
    }).compile();

    service = module.get(ConnectingRouteGraphService);
    service.buildFromSchedules(SAMPLE_SCHEDULES);
  });

  it('normalizes station names (collapses whitespace, prefers mixed case)', () => {
    expect(service.getStationName('NDLS')).toBe('New Delhi');
    expect(service.getStationName('CNB')).toBe('Kanpur Central');
    expect(service.getStationName('PRYJ')).toBe('Prayagraj Jn.');
    expect(service.getStationName('UNKNOWN')).toBe('UNKNOWN');
  });

  it('discovers intermediate hubs for NDLS -> PNBE and rejects massive Gujarat detour', () => {
    const hubs = service.findIntermediateHubs('NDLS', 'PNBE', 5);
    const codes = hubs.map((h) => h.code);
    expect(codes).toContain('CNB');
    expect(codes).toContain('PRYJ');
    expect(codes).toContain('DDU');
    // BRC detour (993 + 1750 = 2743km vs 998km direct) must be rejected
    expect(codes).not.toContain('BRC');
    // CNB has 2 Leg 1 trains and 2 Leg 2 trains, so it ranks highest
    expect(codes[0]).toBe('CNB');
  });

  it('expands city hubs (MMCT -> HWH discovers BSL via CSMT/LTT while skipping KYN micro-hop)', () => {
    const hubs = service.findIntermediateHubs('MMCT', 'HWH', 2);
    const codes = hubs.map((h) => h.code);
    expect(codes[0]).toBe('BSL');
    expect(codes).toContain('NGP');
    // KYN is only 54km from CSMT (< 60km min leg threshold on long routes)
    expect(codes).not.toContain('KYN');
  });

  it('discovers intermediate hubs even when no direct train exists (KOTA -> GHY)', () => {
    const hubs = service.findIntermediateHubs('KOTA', 'GHY', 2);
    expect(hubs).toHaveLength(1);
    expect(hubs[0].code).toBe('CNB');
    expect(hubs[0].estimatedDistanceKm).toBe(2020);
  });

  it('returns empty for same station, same city hub, or short trips < 120km', () => {
    expect(service.findIntermediateHubs('NDLS', 'NDLS')).toEqual([]);
    expect(service.findIntermediateHubs('NDLS', 'DLI')).toEqual([]);
    expect(service.findIntermediateHubs('NDLS', 'KRJ')).toEqual([]);
    expect(service.findIntermediateHubs('XXX', 'YYY')).toEqual([]);
  });

  it('loads schedules lazily from PrismaService once via ensureLoaded()', async () => {
    const findMany = jest.fn().mockResolvedValue(SAMPLE_SCHEDULES);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectingRouteGraphService,
        {
          provide: PrismaService,
          useValue: { trainScheduleCache: { findMany } },
        },
      ],
    }).compile();

    const freshService = module.get(ConnectingRouteGraphService);
    await Promise.all([
      freshService.ensureLoaded(),
      freshService.ensureLoaded(),
    ]);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(freshService.findIntermediateHubs('KOTA', 'GHY', 2)[0]?.code).toBe(
      'CNB',
    );
  });
});
