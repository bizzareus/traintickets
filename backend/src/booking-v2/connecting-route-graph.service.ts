import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeScheduleStationCode } from './booking-v2.utils';
import { hubMembers } from './station-hubs';

export interface IntermediateHubCandidate {
  code: string;
  name: string;
  score: number;
  leg1Count: number;
  leg2Count: number;
  estimatedDistanceKm: number | null;
}

export interface ScheduleRowInput {
  stationList: unknown;
}

interface PairStat {
  count: number;
  minDist: number;
}

interface ScheduleStopLite {
  stationCode?: unknown;
  stationName?: unknown;
  distance?: unknown;
}

const MIN_DIRECT_KM_FOR_CONNECTING = 120;
const LONG_ROUTE_THRESHOLD_KM = 250;
const LONG_ROUTE_MIN_LEG_KM = 60;
const SHORT_ROUTE_MIN_LEG_KM = 25;
const MAX_DETOUR_RATIO = 1.35;
const DETOUR_BUFFER_KM = 40;
const GRAPH_TTL_MS = 6 * 60 * 60 * 1000;

function parseDistanceKm(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? raw : null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

function normalizeStationName(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
}

function preferStationName(
  existing: string | undefined,
  candidate: string,
): string {
  if (!existing) return candidate;
  if (
    existing === existing.toUpperCase() &&
    candidate !== candidate.toUpperCase()
  ) {
    return candidate;
  }
  return existing;
}

@Injectable()
export class ConnectingRouteGraphService implements OnModuleInit {
  private readonly logger = new Logger(ConnectingRouteGraphService.name);
  private pairStats = new Map<string, PairStat>();
  private outgoing = new Map<string, Set<string>>();
  private stationNames = new Map<string, string>();
  private loaded = false;
  private loadedAt = 0;
  private loadingPromise: Promise<void> | null = null;

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  /** Ensures the in-memory graph is loaded (lazy-loads or refreshes after TTL). */
  async ensureLoaded(): Promise<void> {
    if (this.loaded && Date.now() - this.loadedAt < GRAPH_TTL_MS) {
      return;
    }
    if (!this.loadingPromise) {
      this.loadingPromise = this.refresh().finally(() => {
        this.loadingPromise = null;
      });
    }
    await this.loadingPromise;
  }

  /** Reloads all cached train schedules from PostgreSQL into the topology graph. */
  async refresh(): Promise<void> {
    if (!this.prisma) return;
    try {
      const rows = await this.prisma.trainScheduleCache.findMany({
        select: { stationList: true },
      });
      this.buildFromSchedules(rows);
      this.loadedAt = Date.now();
    } catch (err) {
      this.logger.warn(
        `Failed to load route graph from TrainScheduleCache: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Builds the directed station-pair graph from schedule records. */
  buildFromSchedules(rows: readonly ScheduleRowInput[]): void {
    const pairStats = new Map<string, PairStat>();
    const outgoing = new Map<string, Set<string>>();
    const stationNames = new Map<string, string>();

    for (const row of rows) {
      if (!Array.isArray(row.stationList)) continue;
      const list = row.stationList as ScheduleStopLite[];

      const stops: Array<{ code: string; dist: number | null }> = [];
      for (const stop of list) {
        if (!stop || typeof stop !== 'object') continue;
        const code = normalizeScheduleStationCode(
          typeof stop.stationCode === 'string' ? stop.stationCode : '',
        );
        if (!code) continue;
        const name = normalizeStationName(stop.stationName);
        if (name) {
          stationNames.set(
            code,
            preferStationName(stationNames.get(code), name),
          );
        }
        stops.push({ code, dist: parseDistanceKm(stop.distance) });
      }

      for (let i = 0; i < stops.length; i++) {
        const origin = stops[i];
        let out = outgoing.get(origin.code);
        for (let j = i + 1; j < stops.length; j++) {
          const dest = stops[j];
          if (origin.code === dest.code) continue;
          const dist =
            origin.dist !== null &&
            dest.dist !== null &&
            dest.dist > origin.dist
              ? dest.dist - origin.dist
              : Infinity;
          const key = `${origin.code}#${dest.code}`;
          const prev = pairStats.get(key);
          if (prev) {
            prev.count += 1;
            if (dist < prev.minDist) prev.minDist = dist;
          } else {
            pairStats.set(key, { count: 1, minDist: dist });
            if (!out) {
              out = new Set<string>();
              outgoing.set(origin.code, out);
            }
            out.add(dest.code);
          }
        }
      }
    }

    this.pairStats = pairStats;
    this.outgoing = outgoing;
    this.stationNames = stationNames;
    this.loaded = true;
    this.loadedAt = Date.now();
  }

  getStationName(code: string): string {
    const normalized = normalizeScheduleStationCode(code);
    return this.stationNames.get(normalized) ?? normalized;
  }

  /**
   * Finds top intermediate transfer junctions connecting `from` -> `X` -> `to`.
   * Expands metro city hubs, filters suburban micro-hops and excessive detours,
   * and ranks candidates by harmonic frequency weighted by route efficiency.
   */
  findIntermediateHubs(
    from: string,
    to: string,
    maxHubs = 2,
  ): IntermediateHubCandidate[] {
    const fromCode = normalizeScheduleStationCode(from);
    const toCode = normalizeScheduleStationCode(to);
    if (!fromCode || !toCode || fromCode === toCode || maxHubs <= 0) {
      return [];
    }

    const fromSet = new Set(hubMembers(fromCode));
    const toSet = new Set(hubMembers(toCode));
    for (const f of fromSet) {
      if (toSet.has(f)) return [];
    }

    let directDist = Infinity;
    for (const f of fromSet) {
      for (const t of toSet) {
        const st = this.pairStats.get(`${f}#${t}`);
        if (st && st.minDist < directDist) directDist = st.minDist;
      }
    }

    const leg1ByHub = new Map<string, PairStat>();
    for (const f of fromSet) {
      const targets = this.outgoing.get(f);
      if (!targets) continue;
      for (const x of targets) {
        if (fromSet.has(x) || toSet.has(x)) continue;
        const st = this.pairStats.get(`${f}#${x}`);
        if (!st) continue;
        const prev = leg1ByHub.get(x);
        if (prev) {
          prev.count += st.count;
          if (st.minDist < prev.minDist) prev.minDist = st.minDist;
        } else {
          leg1ByHub.set(x, { count: st.count, minDist: st.minDist });
        }
      }
    }

    const rawCandidates: Array<{
      code: string;
      c1: number;
      c2: number;
      d1: number;
      d2: number;
      totalDist: number;
      harmonic: number;
    }> = [];
    let minCandidateDist = Infinity;

    for (const [x, l1] of leg1ByHub.entries()) {
      let c2 = 0;
      let d2 = Infinity;
      for (const t of toSet) {
        const st = this.pairStats.get(`${x}#${t}`);
        if (!st) continue;
        c2 += st.count;
        if (st.minDist < d2) d2 = st.minDist;
      }
      if (c2 === 0) continue;

      const totalDist =
        Number.isFinite(l1.minDist) && Number.isFinite(d2)
          ? l1.minDist + d2
          : Infinity;
      if (totalDist < minCandidateDist) minCandidateDist = totalDist;

      rawCandidates.push({
        code: x,
        c1: l1.count,
        c2,
        d1: l1.minDist,
        d2,
        totalDist,
        harmonic: (2 * l1.count * c2) / (l1.count + c2),
      });
    }

    const baselineDist = Math.min(directDist, minCandidateDist);
    if (
      Number.isFinite(baselineDist) &&
      baselineDist < MIN_DIRECT_KM_FOR_CONNECTING
    ) {
      return [];
    }

    const minLegKm =
      Number.isFinite(baselineDist) && baselineDist > LONG_ROUTE_THRESHOLD_KM
        ? LONG_ROUTE_MIN_LEG_KM
        : SHORT_ROUTE_MIN_LEG_KM;

    const ranked: IntermediateHubCandidate[] = [];
    for (const c of rawCandidates) {
      if (Number.isFinite(c.d1) && c.d1 < minLegKm) continue;
      if (Number.isFinite(c.d2) && c.d2 < minLegKm) continue;
      if (
        Number.isFinite(baselineDist) &&
        Number.isFinite(c.totalDist) &&
        c.totalDist > baselineDist * MAX_DETOUR_RATIO + DETOUR_BUFFER_KM
      ) {
        continue;
      }

      const efficiency =
        Number.isFinite(baselineDist) &&
        Number.isFinite(c.totalDist) &&
        c.totalDist > 0
          ? Math.min(1, baselineDist / c.totalDist)
          : 1;

      ranked.push({
        code: c.code,
        name: this.getStationName(c.code),
        score: Math.round(c.harmonic * efficiency * efficiency * 10) / 10,
        leg1Count: c.c1,
        leg2Count: c.c2,
        estimatedDistanceKm: Number.isFinite(c.totalDist)
          ? Math.round(c.totalDist)
          : null,
      });
    }

    ranked.sort((a, b) => b.score - a.score);
    return ranked.slice(0, maxHubs);
  }
}
