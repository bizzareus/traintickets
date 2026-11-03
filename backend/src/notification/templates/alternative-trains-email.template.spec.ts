import type {
  AlternatePathLeg,
  BestTrainCandidateResult,
} from '../../booking-v2/booking-v2.service';
import { buildIrctcUrl, escapeHtml } from '../notification.helpers';
import { renderAlternativeTrainsEmailHtml } from './no-seats.template';

function leg(
  from = 'RJY',
  to = 'HWH',
  travelClass = 'SL',
  fare: number | null = 150,
): AlternatePathLeg {
  return {
    from,
    to,
    travelClass,
    fare,
    segmentKind: 'confirmed',
    availabilityDisplayName: 'AVL 4',
    railDataStatus: 'AVAILABLE',
    availablityStatus: null,
    predictionPercentage: null,
    confirmedClassOptions: [],
    departureTime: null,
    arrivalTime: null,
    durationMinutes: null,
  };
}

function alternative(
  trainNumber: string,
  legs: AlternatePathLeg[] = [leg()],
  trainName = 'MAS SHM EXPRESS',
): BestTrainCandidateResult {
  return {
    train: { trainNumber, trainName },
    alternatePath: {
      trainNumber,
      legs,
      totalFare: null,
      legCount: legs.length,
      isComplete: true,
      stationCodesOnRoute: [],
      stationNameMap: {},
      remainderMergedSchedule: null,
      trainOriginCode: null,
      trainOriginDepartureTime: null,
      debugLog: [],
    },
    score: {
      originConfirmed: true,
      confirmedContiguousStationsFromOrigin: 0,
      confirmedContiguousMinutesFromOrigin: 0,
      totalConfirmedStations: 0,
      totalConfirmedMinutes: 0,
      longestConfirmedLegStations: 0,
      longestConfirmedLegMinutes: 0,
      isComplete: true,
      totalFare: null,
    },
    rankReason: 'Confirmed journey',
  };
}

const params = {
  originalTrainLabel: '12842 COROMANDEL EXP',
  routeDisplay: 'RJY - Rajahmundry → HWH - Howrah Jn',
  journeyDateReadable: 'Wed, 4th November',
  journeyDateStr: '2026-11-04',
  fromStationCode: 'RJY',
  toStationCode: 'HWH',
  stationNameMap: new Map([
    ['RJY', 'Rajahmundry'],
    ['SLO', 'Samalkot Jn'],
    ['HWH', 'Howrah Jn'],
  ]),
  unsubscribeUrl: 'https://lastberth.com/s/unsubscribe',
};

describe('grouped alternative-train email', () => {
  it('shows one train section for multiple tickets and retains each booking URL', () => {
    const legs = [leg('RJY', 'SLO'), leg('SLO', 'HWH', '3A', 520)];
    const html = renderAlternativeTrainsEmailHtml({
      ...params,
      alternativeTrains: [alternative('18042', legs)],
    });
    expect(html.match(/18042 MAS SHM EXPRESS/g)).toHaveLength(1);
    expect(html.match(/Option 1/g)).toHaveLength(1);
    expect(html).toContain('Ticket 1');
    expect(html).toContain('Ticket 2');
    expect(html).toContain('Book all 2 tickets below');
    expect(html).toContain('RJY - Rajahmundry → SLO - Samalkot Jn');
    expect(html).toContain('SLO - Samalkot Jn → HWH - Howrah Jn');
    expect(html).toContain('Class SL | AVL 4 (₹150)');
    expect(html).toContain('Class 3A | AVL 4 (₹520)');
    for (const ticket of legs) {
      expect(html).toContain(
        escapeHtml(
          buildIrctcUrl({
            fromStationCode: ticket.from,
            toStationCode: ticket.to,
            trainNumber: '18042',
            classCode: ticket.travelClass,
          }),
        ),
      );
    }
    expect(html).toContain(params.unsubscribeUrl);
  });

  it('combines separate results for the same train while keeping route options distinct', () => {
    const html = renderAlternativeTrainsEmailHtml({
      ...params,
      alternativeTrains: [
        alternative('18042', [leg('RJY', 'HWH', 'SL', 150)]),
        alternative('12840', [leg()], 'HOWRAH MAIL'),
        alternative(' 18042 ', [leg('RJY', 'HWH', '3A', 520)]),
      ],
    });
    expect(html.match(/18042 MAS SHM EXPRESS/g)).toHaveLength(1);
    expect(html.match(/12840 HOWRAH MAIL/g)).toHaveLength(1);
    expect(html.match(/<h3 /g)).toHaveLength(2);
    expect(html).toContain('Option 2');
    expect(html.indexOf('Option 2')).toBeLessThan(
      html.indexOf('12840 HOWRAH MAIL'),
    );
    expect(html).toContain('Class SL | AVL 4 (₹150)');
    expect(html).toContain('Class 3A | AVL 4 (₹520)');
  });

  it('does not render unbookable segments or empty train sections', () => {
    const unavailable = { ...leg(), segmentKind: 'check_realtime' as const };
    const html = renderAlternativeTrainsEmailHtml({
      ...params,
      alternativeTrains: [
        alternative('18042', [leg('RJY', 'SLO'), unavailable]),
        alternative('12840', [unavailable], 'UNAVAILABLE TRAIN'),
      ],
    });
    expect(html).not.toContain('12840 UNAVAILABLE TRAIN');
    expect(html).not.toContain('Ticket 2');
    expect(html.match(/Book on IRCTC/g)).toHaveLength(1);
    expect(html).not.toContain('Book all');
  });

  it('preserves the five-result limit and handles missing fares and station names', () => {
    const html = renderAlternativeTrainsEmailHtml({
      ...params,
      stationNameMap: new Map(),
      alternativeTrains: Array.from({ length: 6 }, (_, index) =>
        alternative(String(18040 + index), [leg('RJY', 'HWH', 'SL', null)]),
      ),
    });
    expect(html.match(/<h3 /g)).toHaveLength(5);
    expect(html).not.toContain('18045 MAS SHM EXPRESS');
    expect(html).not.toContain('₹null');
    expect(html).toContain('RJY - RJY → HWH - HWH');
  });

  it('escapes dynamic text in train headings, stations, classes and availability', () => {
    const ticket = {
      ...leg('RJY', 'HWH', 'SL<script>'),
      availabilityDisplayName: '<b>AVL 4</b>',
    };
    const html = renderAlternativeTrainsEmailHtml({
      ...params,
      stationNameMap: new Map([['RJY', '<img src=x>']]),
      alternativeTrains: [
        alternative('18042', [ticket], '<script>train</script>'),
      ],
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x>');
    expect(html).not.toContain('<b>AVL 4</b>');
    expect(html).toContain('&lt;script&gt;train&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).toContain('SL&lt;script&gt;');
  });
});
