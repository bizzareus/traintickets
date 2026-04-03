import {
  avlDayMatchesJourneyDate,
  isLegConfirmed,
  pickFarthestConfirmedStationIndex,
  stationCodesBetweenStops,
  ymdToConfirmTktDate,
} from './booking-v2.utils';

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

describe('avlDayMatchesJourneyDate', () => {
  it('matches ConfirmTkt day string to DD-MM-YYYY', () => {
    expect(avlDayMatchesJourneyDate('5-4-2026', '05-04-2026')).toBe(true);
    expect(avlDayMatchesJourneyDate('05-04-2026', '05-04-2026')).toBe(true);
  });
});
