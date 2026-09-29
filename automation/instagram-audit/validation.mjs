import { createHash } from 'node:crypto';
import moment from 'moment';
import { z } from 'zod';

const station = z.string().regex(/^[A-Z0-9]{2,6}$/);
const trainNumber = z.string().regex(/^\d{5}$/);
const ymd = z.string().refine((value) => moment(value, 'YYYY-MM-DD', true).isValid(), 'Invalid journey date');
const timestamp = z.string().datetime({ offset: true });
const travelClass = z.enum(['SL', '3E', '3A', '2A', '1A', 'CC', 'EC', '2S', 'EA', 'FC']);

export const candidateSchema = z.object({
  trainNumber,
  trainName: z.string().min(1),
  from: station,
  to: station,
  journeyDate: ymd,
  confirmedAt: timestamp,
  baseline: z.object({
    trainNumber,
    from: station,
    to: station,
    journeyDate: ymd,
    quota: z.literal('GN'),
    capturedAt: timestamp,
    offeredClasses: z.array(travelClass).min(1),
    classes: z.array(z.object({ classCode: travelClass, status: z.string().min(1) })).min(1),
    screenshot: z.string().min(1),
  }),
  lastberthScreenshot: z.string().min(1),
  scanComplete: z.literal(true),
  legs: z.array(z.object({
    trainNumber,
    from: station,
    to: station,
    classCode: travelClass,
    quota: z.literal('GN'),
    status: z.string().min(1),
    departure: timestamp,
    arrival: timestamp,
    fare: z.number().nonnegative(),
  })).min(2).max(4),
  totalFare: z.number().nonnegative(),
});

export const auditSchema = z.object({
  status: z.enum(['verified', 'no_match', 'blocked']),
  reason: z.string(),
  candidate: candidateSchema.nullable(),
  images: z.array(z.string()).max(4),
  caption: z.string(),
  report: z.string(),
});

export function validateCandidate(input, now = new Date(), maxAgeMinutes = 20) {
  const candidate = candidateSchema.parse(input);
  const baseline = candidate.baseline;
  for (const field of ['trainNumber', 'from', 'to', 'journeyDate']) {
    if (candidate[field] !== baseline[field]) throw new Error(`Baseline ${field} mismatch`);
  }
  for (const value of [baseline.capturedAt, candidate.confirmedAt]) {
    const age = now.getTime() - Date.parse(value);
    if (age < -60_000 || age > maxAgeMinutes * 60_000) throw new Error('Evidence is stale or future-dated');
  }
  const classStates = new Map(baseline.classes.map((row) => [row.classCode, row.status]));
  if (classStates.size !== baseline.classes.length) throw new Error('Duplicate baseline classes');
  if (new Set(baseline.offeredClasses).size !== baseline.offeredClasses.length) throw new Error('Duplicate offered classes');
  if (baseline.offeredClasses.length !== classStates.size) throw new Error('Incomplete baseline classes');
  for (const cls of baseline.offeredClasses) {
    if (!/^(?:WL\s*\d+|REGRET)$/i.test(classStates.get(cls) ?? '')) {
      throw new Error(`General quota not waitlisted/regret for ${cls}`);
    }
  }
  if (candidate.legs[0].from !== candidate.from || candidate.legs.at(-1).to !== candidate.to) {
    throw new Error('Split route does not cover the exact requested endpoints');
  }
  for (const [index, leg] of candidate.legs.entries()) {
    if (leg.trainNumber !== candidate.trainNumber) throw new Error('Train changes are not allowed');
    if (!classStates.has(leg.classCode)) throw new Error('Split class not checked on baseline');
    if (!/^(?:AVL|AVAILABLE|CURR_AVBL|CURR_AVL)[ -]*0*[1-9]\d*$/i.test(leg.status)) {
      throw new Error('Each leg must have a positive available seat count');
    }
    if (leg.from === leg.to || Date.parse(leg.arrival) <= Date.parse(leg.departure)) {
      throw new Error('Invalid leg endpoints or times');
    }
    const previous = candidate.legs[index - 1];
    if (previous && (previous.to !== leg.from || Date.parse(previous.arrival) > Date.parse(leg.departure))) {
      throw new Error('Split legs are not contiguous or have conflicting times');
    }
  }
  if (moment.parseZone(candidate.legs[0].departure).utcOffset(330).format('YYYY-MM-DD') !== candidate.journeyDate) {
    throw new Error('Departure does not match the India journey date');
  }
  if (Math.abs(candidate.legs.reduce((sum, leg) => sum + leg.fare, 0) - candidate.totalFare) > 0.01) {
    throw new Error('Displayed total does not equal the selected leg fares');
  }
  return candidate;
}

export function postKey(candidate) {
  // One post per train/route/journey date, even when prices or classes change.
  return createHash('sha256').update([
    candidate.trainNumber, candidate.from, candidate.to, candidate.journeyDate,
  ].join(':')).digest('hex');
}

export function auditTargets(config, now = new Date()) {
  const india = moment(now).utcOffset(330).startOf('day');
  const offset = india.dayOfYear() % config.routes.length;
  const routes = [...config.routes.slice(offset), ...config.routes.slice(0, offset)];
  return routes.flatMap((route) => config.daysAhead.map((days) => {
    const date = india.clone().add(days, 'days');
    return { ...route, journeyDate: date.format('YYYY-MM-DD'), confirmtktDate: date.format('DD-MM-YYYY') };
  }));
}
