import assert from 'node:assert/strict';
import test from 'node:test';
import { Cron } from 'croner';
import { auditSchema, auditTargets, parseAgentResult, postKey, validateCandidate } from './validation.mjs';

const now = new Date('2026-09-28T10:10:00Z');
const fixture = () => ({
  trainNumber: '12506', trainName: 'NORTH EAST EXP', from: 'ANVT', to: 'PPTA', journeyDate: '2026-09-30',
  confirmedAt: '2026-09-28T10:08:00Z', scanComplete: true,
  baseline: {
    trainNumber: '12506', from: 'ANVT', to: 'PPTA', journeyDate: '2026-09-30', quota: 'GN',
    capturedAt: '2026-09-28T10:07:00Z', offeredClasses: ['3A', '2A'],
    classes: [{ classCode: '3A', status: 'WL 44' }, { classCode: '2A', status: 'WL 13' }],
    screenshot: 'confirmtkt.png',
  },
  lastberthScreenshot: 'lastberth.png', totalFare: 2370,
  legs: [
    { trainNumber: '12506', from: 'ANVT', to: 'PRYJ', quota: 'GN', classCode: '3A', status: 'AVL 17', departure: '2026-09-30T07:40:00+05:30', arrival: '2026-09-30T16:05:00+05:30', fare: 1035 },
    { trainNumber: '12506', from: 'PRYJ', to: 'DDU', quota: 'GN', classCode: '3A', status: 'AVL 12', departure: '2026-09-30T16:15:00+05:30', arrival: '2026-09-30T18:38:00+05:30', fare: 565 },
    { trainNumber: '12506', from: 'DDU', to: 'PPTA', quota: 'GN', classCode: '2A', status: 'AVL 1', departure: '2026-09-30T18:45:00+05:30', arrival: '2026-09-30T21:45:00+05:30', fare: 770 },
  ],
});

test('accepts a fresh, fully available mixed-class same-train path', () => {
  assert.equal(validateCandidate(fixture(), now).totalFare, 2370);
});

test('reads Railway NDJSON structured_output envelopes, ignoring progress and trailing diagnostics', () => {
  const result = { status: 'no_match', reason: 'No verified match', candidate: null, images: [], caption: '', report: '' };
  const log = ['{"kind":"agent_end"}', JSON.stringify({ kind: 'structured_output', value: result }), '[done]'].join('\n');
  assert.deepEqual(parseAgentResult(log, auditSchema), result);
  assert.throws(() => parseAgentResult('{"kind":"agent_end"}', auditSchema));
});

for (const [name, change] of [
  ['Tatkal', (c) => { c.baseline.quota = 'TQ'; }],
  ['different route', (c) => { c.baseline.from = 'NDLS'; }],
  ['expanded endpoint', (c) => { c.legs[0].from = 'NDLS'; }],
  ['a gap', (c) => { c.legs[1].from = 'CNB'; }],
  ['a train change', (c) => { c.legs[1].trainNumber = '12310'; }],
  ['overlapping times', (c) => { c.legs[1].departure = '2026-09-30T15:00:00+05:30'; }],
  ['wrong boarding day', (c) => { c.journeyDate = c.baseline.journeyDate = '2026-10-01'; }],
  ['zero seats', (c) => { c.legs[2].status = 'AVL 0'; }],
  ['RAC', (c) => { c.legs[2].status = 'RAC 1'; }],
  ['unloaded baseline', (c) => { c.baseline.classes[0].status = ''; }],
  ['an available direct class', (c) => { c.baseline.classes[0].status = 'AVL 1'; }],
  ['missing class', (c) => { c.baseline.classes.pop(); }],
  ['stale evidence', (c) => { c.confirmedAt = '2026-09-28T09:00:00Z'; }],
  ['invented total', (c) => { c.totalFare = 1380; }],
]) {
  test(`rejects ${name}`, () => {
    const candidate = fixture();
    change(candidate);
    assert.throws(() => validateCandidate(candidate, now));
  });
}

test('deduplication survives changes in price and class', () => {
  const changed = fixture();
  changed.totalFare += 10;
  changed.legs[0].classCode = '2A';
  assert.equal(postKey(fixture()), postKey(changed));
});

test('the 11am London schedule follows BST and GMT', () => {
  const cron = new Cron('0 11 * * *', { timezone: 'Europe/London', paused: true });
  assert.equal(cron.nextRun(new Date('2026-07-01T00:00:00Z')).toISOString(), '2026-07-01T10:00:00.000Z');
  assert.equal(cron.nextRun(new Date('2026-12-01T00:00:00Z')).toISOString(), '2026-12-01T11:00:00.000Z');
  cron.stop();
});

test('target dates follow India midnight and preserve date formats', () => {
  const targets = auditTargets({ routes: [{ from: 'ANVT', to: 'PPTA' }], daysAhead: [1, 5] }, new Date('2026-09-28T20:00:00Z'));
  assert.deepEqual(targets.map((t) => [t.journeyDate, t.confirmtktDate]), [['2026-09-30', '30-09-2026'], ['2026-10-04', '04-10-2026']]);
});
