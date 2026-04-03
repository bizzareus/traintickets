import {
  avlDayMatchesJourneyDate,
  filterDepartedTrainsFromSearchResponse,
  isLegConfirmed,
  normalizeAndDedupeClassCodes,
  orderedDestinationIndices,
  parseUpstreamAvailablityType,
  pickFarthestConfirmedStationIndex,
  stationCodesBetweenStops,
  trainSearchRowIndicatesDeparted,
  ymdToRailApiDdMmYyyy,
} from './booking-v2.utils';

describe('normalizeAndDedupeClassCodes', () => {
  it('trims, uppercases, dedupes in order', () => {
    expect(normalizeAndDedupeClassCodes(['sl', ' 3a ', 'SL', '2A'])).toEqual([
      'SL',
      '3A',
      '2A',
    ]);
  });
});

describe('ymdToRailApiDdMmYyyy', () => {
  it('maps YYYY-MM-DD to DD-MM-YYYY', () => {
    expect(ymdToRailApiDdMmYyyy('2026-04-05')).toBe('05-04-2026');
  });
  it('returns null for invalid', () => {
    expect(ymdToRailApiDdMmYyyy('5-4-2026')).toBeNull();
    expect(ymdToRailApiDdMmYyyy('')).toBeNull();
  });
});

describe('stationCodesBetweenStops', () => {
  const list = [
    { stationCode: 'AAA' },
    { stationCode: 'bbb' },
    { stationCode: 'CC' },
    { stationCode: 'dd' },
  ];
  it('returns inclusive slice when order matches', () => {
    expect(stationCodesBetweenStops(list, 'AAA', 'CC')).toEqual([
      'AAA',
      'BBB',
      'CC',
    ]);
  });
  it('returns null when from after to', () => {
    expect(stationCodesBetweenStops(list, 'CC', 'AAA')).toBeNull();
  });
  it('returns null when code missing', () => {
    expect(stationCodesBetweenStops(list, 'AAA', 'ZZ')).toBeNull();
  });
});

describe('parseUpstreamAvailablityType', () => {
  it('parses number and numeric string', () => {
    expect(parseUpstreamAvailablityType(3)).toBe(3);
    expect(parseUpstreamAvailablityType('1')).toBe(1);
  });
  it('returns null for invalid', () => {
    expect(parseUpstreamAvailablityType(null)).toBeNull();
    expect(parseUpstreamAvailablityType('')).toBeNull();
  });
});

describe('isLegConfirmed', () => {
  it('accepts Confirm and Probable', () => {
    expect(isLegConfirmed({ vendorPredictionStatus: 'Confirm' })).toBe(true);
    expect(isLegConfirmed({ vendorPredictionStatus: 'Probable' })).toBe(true);
  });
  it('accepts AVAILABLE*', () => {
    expect(
      isLegConfirmed({
        vendorPredictionStatus: 'No Chance',
        availablityStatus: 'AVAILABLE-0080#',
      }),
    ).toBe(true);
  });
  it('rejects REGRET', () => {
    expect(
      isLegConfirmed({
        vendorPredictionStatus: 'No Chance',
        availablityStatus: 'REGRET',
      }),
    ).toBe(false);
  });
  it('availablityType 3 forces waiting (not confirmed) even if strings look good', () => {
    expect(
      isLegConfirmed({
        availablityType: 3,
        vendorPredictionStatus: 'Confirm',
        availablityStatus: 'AVAILABLE-0080#',
      }),
    ).toBe(false);
  });
  it('availablityType 1 forces confirmed ticket even when other strings disagree', () => {
    expect(
      isLegConfirmed({
        availablityType: 1,
        vendorPredictionStatus: 'No Chance',
        availablityStatus: 'REGRET',
      }),
    ).toBe(true);
  });
});

describe('pickFarthestConfirmedStationIndex', () => {
  it('picks farthest confirmed', () => {
    const idx = pickFarthestConfirmedStationIndex(
      [
        { vendorPredictionStatus: 'Confirm' },
        { vendorPredictionStatus: 'No Chance', availablityStatus: 'REGRET' },
        { vendorPredictionStatus: 'Probable' },
      ],
      [1, 2, 3],
    );
    expect(idx).toBe(3);
  });
  it('returns null when none confirmed', () => {
    expect(
      pickFarthestConfirmedStationIndex(
        [{ availablityStatus: 'REGRET' }, { availablityStatus: 'REGRET' }],
        [1, 2],
      ),
    ).toBeNull();
  });
});

describe('orderedDestinationIndices', () => {
  it('full journey first, then shorter hops (manual Surat-style order)', () => {
    expect(orderedDestinationIndices(0, 5)).toEqual([5, 4, 3, 2, 1]);
  });
  it('from intermediate board: same priority toward final stop', () => {
    expect(orderedDestinationIndices(1, 5)).toEqual([5, 4, 3, 2]);
  });
  it('two-stop slice', () => {
    expect(orderedDestinationIndices(0, 1)).toEqual([1]);
  });
});

describe('avlDayMatchesJourneyDate', () => {
  it('matches upstream day string to DD-MM-YYYY', () => {
    expect(avlDayMatchesJourneyDate('5-4-2026', '05-04-2026')).toBe(true);
    expect(avlDayMatchesJourneyDate('05-04-2026', '05-04-2026')).toBe(true);
  });
});

describe('trainSearchRowIndicatesDeparted', () => {
  it('is true when any cache class has Train Departed', () => {
    expect(
      trainSearchRowIndicatesDeparted({
        trainNumber: '1',
        availabilityCache: {
          SL: { railDataStatus: 'Train Departed', fare: '655' },
        },
      }),
    ).toBe(true);
  });
  it('is false for WL / available rows', () => {
    expect(
      trainSearchRowIndicatesDeparted({
        trainNumber: '1',
        availabilityCache: {
          SL: { railDataStatus: 'WL 10' },
        },
      }),
    ).toBe(false);
  });
  it('is false when cache missing', () => {
    expect(trainSearchRowIndicatesDeparted({ trainNumber: '1' })).toBe(false);
  });
});

describe('filterDepartedTrainsFromSearchResponse', () => {
  it('drops departed trains from data.trainList', () => {
    const out = filterDepartedTrainsFromSearchResponse({
      data: {
        trainList: [
          {
            trainNumber: 'gone',
            availabilityCache: { SL: { railDataStatus: 'Train Departed' } },
          },
          { trainNumber: 'ok', availabilityCache: { SL: { railDataStatus: 'AVAILABLE-1' } } },
        ],
      },
    }) as { data: { trainList: { trainNumber: string }[] } };
    expect(out.data.trainList).toHaveLength(1);
    expect(out.data.trainList[0].trainNumber).toBe('ok');
  });
});
