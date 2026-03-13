import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { BrowserUse } from 'browser-use-sdk';

/** Structured output: chart preparation details + longest path available (no booking). */
export const ChartPreparationResultSchema = z.object({
  chartPreparationDetails: z.object({
    firstChartCreationTime: z
      .string()
      .describe('HH:MM 24h when chart is prepared for boarding station'),
    chartingStationCode: z.string(),
    chartingStationName: z.string(),
    journeyDate: z.string(),
  }),
  fullRouteStations: z
    .array(
      z.object({
        stationCode: z.string(),
        stationName: z.string(),
        sequenceOrder: z.number().optional(),
      }),
    )
    .describe('Stations in order from origin to destination on this train'),
  longestPathAvailable: z
    .object({
      fromStationCode: z.string(),
      fromStationName: z.string(),
      toStationCode: z.string(),
      toStationName: z.string(),
      available: z
        .boolean()
        .describe(
          'True if at least one class has confirmed availability on this segment',
        ),
      availabilityByClass: z
        .record(z.string(), z.string())
        .optional()
        .describe('e.g. { "3A": "available", "2A": "waitlist" }'),
    })
    .describe('Longest path from origin toward destination with availability'),
});

export type ChartPreparationResult = z.infer<
  typeof ChartPreparationResultSchema
>;

/**
 * Prompt: extract chart preparation details and longest available path from origin to destination.
 * Do NOT book tickets; only read and return the structured data.
 */
function buildChartPreparationPrompt(params: {
  trainNumber: string;
  trainName: string;
  originStationCode: string;
  originStationName: string;
  destinationStationCode: string;
  destinationStationName: string;
  journeyDate: string;
  classCode: string;
}): string {
  const origin = `${params.originStationName} (${params.originStationCode})`;
  const destination = `${params.destinationStationName} (${params.destinationStationCode})`;
  const travelDate = params.journeyDate.trim().slice(0, 10);
  const classLabel = params.classCode || '3A';

  return `You are an automation agent. Your task is ONLY to open the IRCTC reservation chart page, fill in the train/date/station, load the chart, and extract chart preparation details plus the longest path with availability from the user's origin to their destination. Do NOT book any ticket. Do NOT proceed to payment or booking flow. Only read and return the requested data.

## STRICT RULE – STAY ON START URL
You must strictly stay on the start URL provided (https://www.irctc.co.in/online-charts/). Do not navigate to other domains or external URLs. Perform all steps only on this page or on pages within the same IRCTC online-charts flow (same site). If a link would take you elsewhere, do not follow it.

## USER INPUTS
- Train number: ${params.trainNumber}${params.trainName ? ` (${params.trainName})` : ''}
- Origin (boarding) station: ${origin}
- Destination station: ${destination}
- Travel date: ${travelDate}
- Class of interest: ${classLabel}

## STEPS (NO BOOKING – EXTRACTION ONLY)
1. Open the start URL and wait for the Reservation Chart form.
2. Enter train number ${params.trainNumber}: (1) Click the "Train Number / Name" input. (2) Type using send_keys key-by-key. (3) Wait at least 2 seconds. (4) Click the matching train suggestion from the dropdown.
3. Select journey date: ${travelDate}. Use the date picker.
4. Select boarding station: ${params.originStationName} / ${params.originStationCode}. Same pattern: click input, send_keys, wait 2 seconds, click the matching station from dropdown.
5. Click "Get Train Chart" (or equivalent). Wait for the chart to load.

6. Extract chart preparation details and full route from the chart page (do not book anything):
   - Chart preparation details: "First Chart Creation" time (HH:MM 24h), "Charting Station" code and name, journey date.
   - Full route: list of stations in order from origin (${params.originStationCode}) to destination (${params.destinationStationCode}) as shown on the chart.

7. For each class that has a "Berth Details" button (e.g. 3A, 2A, 1A, SL, CC), click that class's "Berth Details" button. On the berth details view, use the from-station and to-station (or segment) information for each berth to determine the longest route/segment that has at least one confirmed or vacant berth for that class. Example: if berths show segments like NDLS→JP, NDLS→AII, NDLS→SBIB, the longest segment with a berth is the one that reaches farthest toward the user's destination. Do this for every class (open Berth Details, analyse segments, then go back or switch to the next class). Build availabilityByClass (e.g. "3A": "available" with longest segment from→to, "2A": "available" or "waitlist", etc.) and overall longest path: the single longest segment found across all classes (from/to station code and name, available true if any class has a berth on that segment).

8. Return the data in the exact JSON structure required by the schema: chartPreparationDetails, fullRouteStations, longestPathAvailable (with fromStationCode, fromStationName, toStationCode, toStationName, available, and availabilityByClass). Do not book.`;
}

/**
 * Prompt to fetch the "First Chart Creation" time from the IRCTC reservation chart page.
 * The page shows e.g. "First Chart Creation: 13/03/2026 11:57 Hrs." and "Charting Station: NEW DELHI (NDLS)".
 * We need the time part (HH:MM) only, since it is constant per train/station.
 */
function buildFetchChartTimePrompt(params: {
  trainNumber: string;
  stationCode: string;
  stationName?: string;
  journeyDate: string;
}): string {
  const dateStr = params.journeyDate.trim().slice(0, 10);
  const stationLabel = params.stationName
    ? `${params.stationName} (${params.stationCode})`
    : params.stationCode;

  return `Open the IRCTC reservation chart page and extract the First Chart Creation time for a train/station.

## STRICT RULE – STAY ON START URL
You must strictly stay on the start URL provided (https://www.irctc.co.in/online-charts/). Do not navigate to other domains or external URLs. Perform all steps only on this page or within the same IRCTC online-charts flow.

## Steps
1. Go to https://www.irctc.co.in/online-charts/
2. Wait for the page to load. Enter train number: ${params.trainNumber}. Select the train from the dropdown.
3. Select journey date: ${dateStr} (use the date picker).
4. Select boarding/charting station: ${stationLabel}. Type the station name or code and select from the dropdown.
5. Click "Get Train Chart" (or "Get Chart") and wait for the RESERVATION CHART page to load.
6. On the loaded page you will see a blue header bar with lines like:
   - "Train No: ..."
   - "Journey Date: ..."
   - "Boarding Station: ..."
   - "Charting Station: ..."  (e.g. "NEW DELHI (NDLS)")
   - "First Chart Creation: DD/MM/YYYY HH:MM Hrs."  (e.g. "13/03/2026 11:57 Hrs.")
7. Extract the time part from "First Chart Creation" (only HH:MM in 24-hour format, e.g. "11:57").
8. Extract the station code from "Charting Station" (the code in parentheses, e.g. "NDLS").

## Output
Return a single JSON object with exactly these keys (no other text):
{
  "chartingStationCode": "<station code from Charting Station>",
  "firstChartCreationTime": "<HH:MM from First Chart Creation>"
}

Example: { "chartingStationCode": "NDLS", "firstChartCreationTime": "11:57" }
Return only this JSON.`;
}

export type RunTaskResult = {
  jobId: string;
  output: string | null;
  status: string;
  steps?: unknown[];
  /** Structured chart + longest-path result when schema is used and task succeeded. */
  resultPayload?: ChartPreparationResult;
};

export type JobStatusResult = {
  jobId: string;
  status: 'running' | 'success' | 'failed';
  output: string | null;
  steps?: unknown[];
  resultPayload?: ChartPreparationResult;
};

@Injectable()
export class BrowserUseService {
  /**
   * Start a chart-preparation extraction task (no booking). Returns immediately with jobId.
   * Use getJobStatus(jobId) to poll for status and output.
   */
  async startAvailabilityCheck(params: {
    trainNumber: string;
    trainName?: string;
    fromStationCode: string;
    fromStationName?: string;
    toStationCode?: string;
    toStationName?: string;
    classCode: string;
    journeyDate: string;
    passengerDetails?: string;
    callbackUrl?: string;
  }): Promise<{ jobId: string }> {
    const originName = params.fromStationName ?? params.fromStationCode;
    const destCode = params.toStationCode ?? params.fromStationCode;
    const destName = params.toStationName ?? destCode;

    const task = buildChartPreparationPrompt({
      trainNumber: params.trainNumber,
      trainName: params.trainName ?? '',
      originStationCode: params.fromStationCode,
      originStationName: originName,
      destinationStationCode: destCode,
      destinationStationName: destName,
      journeyDate: params.journeyDate,
      classCode: params.classCode,
    });

    const apiKey = process.env.BROWSER_USE_API_KEY;
    const client = new BrowserUse(apiKey ? { apiKey } : undefined);
    const body: Record<string, unknown> = {
      task,
      startUrl: 'https://www.irctc.co.in/online-charts/',
      llm: 'gemini-flash-latest',
    };
    try {
      body.structuredOutput = JSON.stringify(
        z.toJSONSchema(ChartPreparationResultSchema),
      );
    } catch {
      // omit structuredOutput if schema serialization fails
    }
    const created = await client.tasks.create(
      body as Parameters<BrowserUse['tasks']['create']>[0],
    );
    return { jobId: String(created?.id ?? '') };
  }

  /**
   * Fetch status and output of a Browser Use job by jobId. Use for polling after startAvailabilityCheck.
   */
  async getJobStatus(jobId: string): Promise<JobStatusResult> {
    const apiKey = process.env.BROWSER_USE_API_KEY;
    const client = new BrowserUse(apiKey ? { apiKey } : undefined);
    const task = await client.tasks.get(jobId);
    const status =
      task.status === 'finished'
        ? 'success'
        : task.status === 'stopped'
          ? 'failed'
          : 'running';
    let resultPayload: ChartPreparationResult | undefined;
    if (task.output != null && task.output !== '' && status === 'success') {
      try {
        const raw =
          typeof task.output === 'string'
            ? (JSON.parse(task.output) as unknown)
            : (task.output as unknown);
        resultPayload = ChartPreparationResultSchema.parse(raw);
      } catch {
        // leave undefined if parse fails
      }
    }
    return {
      jobId: String(task.id ?? jobId),
      status,
      output: task.output ?? null,
      steps: task.steps,
      resultPayload,
    };
  }

  /**
   * Runs chart-preparation extraction via Browser Use SDK (no booking).
   * Waits for completion. Prefer startAvailabilityCheck + getJobStatus for async UI.
   */
  async executeAvailabilityCheck(params: {
    trainNumber: string;
    trainName?: string;
    fromStationCode: string;
    fromStationName?: string;
    toStationCode?: string;
    toStationName?: string;
    classCode: string;
    journeyDate: string;
    passengerDetails?: string;
    callbackUrl?: string;
  }): Promise<RunTaskResult> {
    const originName = params.fromStationName ?? params.fromStationCode;
    const destCode = params.toStationCode ?? params.fromStationCode;
    const destName = params.toStationName ?? destCode;

    const task = buildChartPreparationPrompt({
      trainNumber: params.trainNumber,
      trainName: params.trainName ?? '',
      originStationCode: params.fromStationCode,
      originStationName: originName,
      destinationStationCode: destCode,
      destinationStationName: destName,
      journeyDate: params.journeyDate,
      classCode: params.classCode,
    });

    const apiKey = process.env.BROWSER_USE_API_KEY;
    const client = new BrowserUse(apiKey ? { apiKey } : undefined);
    const result = await client.run(task, {
      startUrl: 'https://www.irctc.co.in/online-charts/',
      llm: 'gemini-flash-latest',
      schema: ChartPreparationResultSchema,
    });

    const status = result.status === 'finished' ? 'success' : 'failed';
    const resultPayload =
      status === 'success' && result.output != null ? result.output : undefined;

    return {
      jobId: String(result.id ?? ''),
      output:
        typeof result.output === 'string'
          ? result.output
          : result.output != null
            ? JSON.stringify(result.output)
            : null,
      status,
      steps: result.steps,
      resultPayload,
    };
  }

  /**
   * Fetch "First Chart Creation" time from IRCTC reservation chart page for a train/station.
   * Returns the time as HH:MM (24h). The charting time per train/station is constant, so this
   * can be stored and reused.
   */
  async executeFetchChartTime(params: {
    trainNumber: string;
    stationCode: string;
    stationName?: string;
    journeyDate: string;
  }): Promise<
    RunTaskResult & { chartTimeLocal?: string; chartingStationCode?: string }
  > {
    const task = buildFetchChartTimePrompt({
      trainNumber: params.trainNumber.trim(),
      stationCode: params.stationCode.trim().toUpperCase(),
      stationName: params.stationName?.trim(),
      journeyDate: params.journeyDate.trim().slice(0, 10),
    });

    const apiKey = process.env.BROWSER_USE_API_KEY;
    const client = new BrowserUse(apiKey ? { apiKey } : undefined);
    const result = await client.run(task, {
      startUrl: 'https://www.irctc.co.in/online-charts/',
    });

    const status = result.status === 'finished' ? 'success' : 'failed';
    let chartTimeLocal: string | undefined;
    let chartingStationCode: string | undefined;

    if (result.output && typeof result.output === 'string') {
      try {
        const parsed = JSON.parse(result.output) as {
          chartingStationCode?: string;
          firstChartCreationTime?: string;
        };
        chartingStationCode = parsed.chartingStationCode;
        const raw = parsed.firstChartCreationTime ?? '';
        const match = raw.match(/^(\d{1,2}):?(\d{2})/);
        chartTimeLocal = match
          ? `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}`
          : raw.trim() || undefined;
      } catch {
        // leave undefined if parse fails
      }
    }

    return {
      jobId: String(result.id ?? ''),
      output: result.output ?? null,
      status,
      steps: result.steps,
      chartTimeLocal,
      chartingStationCode,
    };
  }
}
