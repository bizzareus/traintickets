import {
  Controller,
  Delete,
  Get,
  Logger,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { IncomingMessage, ServerResponse } from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { BookingV2Service } from '../booking-v2/booking-v2.service';
import type { CachedBestTrain } from '../booking-v2/best-trains-cache';

/** Hard cap on a live scan triggered from MCP so a tool call never exceeds the
 * client's (ChatGPT/Claude) tool timeout. The scan keeps running in the
 * background on timeout (in-memory cache, no DB writes) but we stop awaiting it. */
const LIVE_SCAN_TIMEOUT_MS = 25_000;
/** Cap concurrent live scans per replica so a public, un-authed endpoint can't be
 * used to pile up expensive IRCTC scans. Cached lookups are unaffected. */
const MAX_CONCURRENT_LIVE_SCANS = 3;

type StationList = {
  data?: { stationList?: Array<{ stationCode: string; stationName: string }> };
};

const SERVER_INSTRUCTIONS = `Look up Indian Railways trains with the best chance of a confirmed seat between two stations, powered by LastBerth.

Typical flow:
1. If you only have place names, call \`search_stations\` to turn each into an IRCTC station code (e.g. "Mumbai" -> BCT/MMCT). \`find_best_train\` also accepts names directly.
2. Call \`find_best_train\` with origin, destination and the journey date to get the recommended train, its booking path (direct or split-ticket legs), fare and reasoning.

Data is IRCTC/Indian Railways. Availability changes constantly, so treat results as guidance and confirm on IRCTC before booking.`;

@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);
  private liveScansInFlight = 0;

  constructor(private readonly bookingV2: BookingV2Service) {}

  /** JSON-RPC over Streamable HTTP (stateless: a fresh server+transport per POST). */
  @Post()
  async handlePost(@Req() req: Request, @Res() res: Response): Promise<void> {
    const server = this.buildServer();
    const transport = new StreamableHTTPServerTransport({
      // Stateless mode — no sessions to track across our two Railway replicas.
      sessionIdGenerator: undefined,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(
        req as unknown as IncomingMessage,
        res as unknown as ServerResponse,
        req.body,
      );
    } catch (err) {
      this.logger.error(
        `[mcp] request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  }

  // Stateless server: no server-initiated SSE stream and no session to delete.
  @Get()
  handleGet(@Res() res: Response): void {
    this.methodNotAllowed(res);
  }

  @Delete()
  handleDelete(@Res() res: Response): void {
    this.methodNotAllowed(res);
  }

  private methodNotAllowed(res: Response): void {
    res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed. This MCP server is stateless; use POST.',
      },
      id: null,
    });
  }

  private buildServer(): McpServer {
    const server = new McpServer(
      { name: 'lastberth-trains', version: '1.0.0' },
      { instructions: SERVER_INSTRUCTIONS },
    );

    server.registerTool(
      'search_stations',
      {
        title: 'Search Indian Railway stations',
        description:
          'Resolve a city or station name (or a partial code) to IRCTC station codes. Use this to turn a place like "Mumbai" into a code like BCT/MMCT before calling find_best_train.',
        inputSchema: {
          query: z
            .string()
            .min(2)
            .describe(
              'Station name, city, or partial code, e.g. "Mumbai" or "NDLS"',
            ),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ query }) => {
        const res = (await this.bookingV2.searchStations(query)) as StationList;
        const list = res?.data?.stationList ?? [];
        const stations = list.map((s) => ({
          code: s.stationCode,
          name: s.stationName,
        }));
        const text = stations.length
          ? `Stations matching "${query}":\n` +
            stations.map((s) => `- ${s.code} — ${s.name}`).join('\n')
          : `No stations found for "${query}".`;
        return { content: [{ type: 'text', text }] };
      },
    );

    server.registerTool(
      'find_best_train',
      {
        title: 'Find the best confirmed-seat train',
        description:
          'Given an origin, destination (station codes or names) and a journey date, returns the train with the best chance of a confirmed seat — including the booking path (direct, or split-ticket legs), fare, and the reason it ranks first. Returns an instant cached answer when available, otherwise runs a short live scan.',
        inputSchema: {
          from: z
            .string()
            .describe(
              'Origin station code (e.g. NDLS) or name (e.g. New Delhi)',
            ),
          to: z
            .string()
            .describe(
              'Destination station code (e.g. MMCT) or name (e.g. Mumbai)',
            ),
          date: z
            .string()
            .describe(
              'Journey date, YYYY-MM-DD or DD-MM-YYYY (e.g. 2026-07-15)',
            ),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ from, to, date }) => {
        const norm = this.bookingV2.normalizeToRailApiDate(date);
        if (!norm) {
          return this.errorText(
            `"${date}" is not a valid date. Use YYYY-MM-DD or DD-MM-YYYY.`,
          );
        }
        const [origin, dest] = await Promise.all([
          this.resolveStation(from),
          this.resolveStation(to),
        ]);
        if (!origin)
          return this.errorText(
            `Could not resolve origin "${from}" to a station.`,
          );
        if (!dest)
          return this.errorText(
            `Could not resolve destination "${to}" to a station.`,
          );
        if (origin.code === dest.code) {
          return this.errorText(
            'Origin and destination resolve to the same station.',
          );
        }

        // 1) Instant cached answer.
        const record = await this.bookingV2.getCachedBestTrain(
          origin.code,
          dest.code,
          date,
        );
        if (record) {
          return {
            content: [
              {
                type: 'text',
                text: this.formatBestTrain(record.value, origin, dest, norm, {
                  source: 'cache',
                  cachedAt: record.cachedAt.toISOString(),
                }),
              },
            ],
          };
        }

        // 2) Bounded live scan (capped concurrency + hard timeout).
        if (this.liveScansInFlight >= MAX_CONCURRENT_LIVE_SCANS) {
          return this.errorText(
            `${origin.code} → ${dest.code} on ${norm} isn't pre-computed yet and the live-scan queue is busy right now. Try again shortly, or a popular route which is cached.`,
          );
        }
        this.liveScansInFlight += 1;
        const scan = this.bookingV2
          .computeBestTrainPayload(origin.code, dest.code, date)
          .finally(() => {
            this.liveScansInFlight -= 1;
          });
        try {
          const computed = await this.withTimeout(scan, LIVE_SCAN_TIMEOUT_MS);
          if (!computed) {
            return this.errorText(
              `Could not compute a result for ${origin.code} → ${dest.code} on ${norm}.`,
            );
          }
          return {
            content: [
              {
                type: 'text',
                text: this.formatBestTrain(
                  computed.payload,
                  origin,
                  dest,
                  norm,
                  {
                    source: 'live',
                  },
                ),
              },
            ],
          };
        } catch {
          return this.errorText(
            `${origin.code} → ${dest.code} on ${norm} isn't pre-computed yet, and a live scan didn't finish in time. Popular routes return instantly; please retry in a moment.`,
          );
        }
      },
    );

    return server;
  }

  /** Best-effort name/code -> station. Uses the same autocomplete the site uses. */
  private async resolveStation(
    input: string,
  ): Promise<{ code: string; name: string } | null> {
    const q = (input ?? '').trim();
    if (q.length < 2) return null;
    try {
      const res = (await this.bookingV2.searchStations(q)) as StationList;
      const first = res?.data?.stationList?.[0];
      if (first?.stationCode) {
        return {
          code: first.stationCode.toUpperCase(),
          name: first.stationName || first.stationCode.toUpperCase(),
        };
      }
    } catch {
      /* fall through to the raw-code guess */
    }
    const up = q.toUpperCase();
    return /^[A-Z0-9]{2,6}$/.test(up) ? { code: up, name: up } : null;
  }

  private formatBestTrain(
    payload: CachedBestTrain,
    origin: { code: string; name: string },
    dest: { code: string; name: string },
    normalizedDate: string,
    meta: { source: 'cache' | 'live'; cachedAt?: string },
  ): string {
    const head = `${origin.code} (${origin.name}) → ${dest.code} (${dest.name}) on ${normalizedDate}`;
    if (!payload.found) {
      return `No confirmed direct or split-ticket path found for ${head}. There may be no running train with bookable availability for this date.`;
    }
    const names = payload.stationNames ?? {};
    const nm = (code: string): string => names[code] || code;
    const t = payload.train;
    const lines: string[] = [];
    const sourceNote =
      meta.source === 'cache'
        ? `cached${meta.cachedAt ? ` (updated ${meta.cachedAt})` : ''}`
        : 'computed live';
    lines.push(`Best option for ${head} — ${sourceNote}:`);
    lines.push(
      `Train ${t.trainNumber}${t.trainName ? ` ${t.trainName}` : ''}` +
        `${t.departureTime ? ` · dep ${t.departureTime}` : ''}` +
        `${t.arrivalTime ? ` · arr ${t.arrivalTime}` : ''}`,
    );
    lines.push(
      `${payload.isComplete ? 'Confirmed end-to-end' : 'Partly confirmed (some legs need a live check on IRCTC)'}` +
        `${payload.totalFare != null ? ` · approx ₹${payload.totalFare}` : ''}`,
    );
    if (payload.rankReason) lines.push(`Why this train: ${payload.rankReason}`);
    if (payload.legs?.length) {
      lines.push('Booking path:');
      payload.legs.forEach((leg, i) => {
        const seg =
          leg.segmentKind === 'confirmed'
            ? `${leg.travelClass ?? 'confirmed'}${leg.availabilityDisplayName ? ` — ${leg.availabilityDisplayName}` : ''}${leg.fare != null ? ` (₹${leg.fare})` : ''}`
            : 'check availability live on IRCTC';
        lines.push(`  ${i + 1}. ${nm(leg.from)} → ${nm(leg.to)}: ${seg}`);
      });
    }
    lines.push(
      'Availability changes constantly — confirm on IRCTC before booking.',
    );
    return lines.join('\n');
  }

  private errorText(message: string) {
    return {
      content: [{ type: 'text' as const, text: message }],
      isError: true,
    };
  }

  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), ms);
      p.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e instanceof Error ? e : new Error(String(e)));
        },
      );
    });
  }
}
