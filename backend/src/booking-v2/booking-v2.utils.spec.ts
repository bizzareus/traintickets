import {
  avlDayMatchesJourneyDate,
  isLegConfirmed,
  normalizeAndDedupeClassCodes,
  orderedDestinationIndices,
  parseConfirmTktAvailablityType,
  pickFarthestConfirmedStationIndex,
  stationCodesBetweenStops,
  ymdToConfirmTktDate,
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

describe('ymdToConfirmTktDate', () => {
  it('maps YYYY-MM-DD to DD-MM-YYYY', () => {
    expect(ymdToConfirmTktDate('2026-04-05')).toBe('05-04-2026');
  });
  it('returns null for invalid', () => {
    expect(ymdToConfirmTktDate('5-4-2026')).toBeNull();
    expect(ymdToConfirmTktDate('')).toBeNull();
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

describe('parseConfirmTktAvailablityType', () => {
  it('parses number and numeric string', () => {
    expect(parseConfirmTktAvailablityType(3)).toBe(3);
    expect(parseConfirmTktAvailablityType('1')).toBe(1);
  });
  it('returns null for invalid', () => {
    expect(parseConfirmTktAvailablityType(null)).toBeNull();
    expect(parseConfirmTktAvailablityType('')).toBeNull();
  });
});

describe('isLegConfirmed', () => {
  it('accepts Confirm and Probable', () => {
    expect(isLegConfirmed({ confirmTktStatus: 'Confirm' })).toBe(true);
    expect(isLegConfirmed({ confirmTktStatus: 'Probable' })).toBe(true);
  });
  it('accepts AVAILABLE*', () => {
    expect(
      isLegConfirmed({
        confirmTktStatus: 'No Chance',
        availablityStatus: 'AVAILABLE-0080#',
      }),
    ).toBe(true);
  });
  it('rejects REGRET', () => {
    expect(
      isLegConfirmed({
        confirmTktStatus: 'No Chance',
        availablityStatus: 'REGRET',
      }),
    ).toBe(false);
  });
  it('availablityType 3 forces waiting (not confirmed) even if strings look good', () => {
    expect(
      isLegConfirmed({
        availablityType: 3,
        confirmTktStatus: 'Confirm',
        availablityStatus: 'AVAILABLE-0080#',
      }),
    ).toBe(false);
  });
  it('availablityType 1 forces confirmed ticket per ConfirmTkt', () => {
    expect(
      isLegConfirmed({
        availablityType: 1,
        confirmTktStatus: 'No Chance',
        availablityStatus: 'REGRET',
      }),
    ).toBe(true);
  });
});

describe('pickFarthestConfirmedStationIndex', () => {
  it('picks farthest confirmed', () => {
    const idx = pickFarthestConfirmedStationIndex(
      [
        { confirmTktStatus: 'Confirm' },
        { confirmTktStatus: 'No Chance', availablityStatus: 'REGRET' },
        { confirmTktStatus: 'Probable' },
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
  it('matches ConfirmTkt day string to DD-MM-YYYY', () => {
    expect(avlDayMatchesJourneyDate('5-4-2026', '05-04-2026')).toBe(true);
    expect(avlDayMatchesJourneyDate('05-04-2026', '05-04-2026')).toBe(true);
  });
});
