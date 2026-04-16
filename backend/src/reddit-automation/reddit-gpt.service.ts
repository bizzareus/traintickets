import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

const RedditTravelQuerySchema = z.object({
  isTravelQuery: z
    .boolean()
    .describe(
      'True if the user is asking to find trains, tickets, booking, or travel advice between cities/stations. False if unrelated.',
    ),
  origin: z
    .string()
    .nullable()
    .describe(
      'The origin station name or 3-letter code. Null if not specified.',
    ),
  destination: z
    .string()
    .nullable()
    .describe(
      'The destination station name or 3-letter code. Null if not specified.',
    ),
  date: z
    .string()
    .nullable()
    .describe(
      "The travel date in YYYY-MM-DD format. Determine this relative to current date if they say 'tomorrow' or 'today'. Null if not specified.",
    ),
  travelClass: z
    .string()
    .nullable()
    .describe(
      'The class of travel if specified (e.g. 1A, 2A, 3A, SL). Null otherwise.',
    ),
});

const RedditGTMEngineSchema = z.object({
  trainNumber: z.string().nullable().describe('The train number mentioned.'),
  origin: z.string().nullable().describe('The origin station.'),
  destination: z.string().nullable().describe('The destination station.'),
  pnr: z
    .string()
    .nullable()
    .describe('The PNR number if mentioned (usually 10 digits).'),
  dateOfTravel: z.string().nullable().describe('The date of travel.'),
  currentStatus: z
    .string()
    .nullable()
    .describe('The current status of ticket mentioned (e.g. WL 5, RAC 2).'),
});

@Injectable()
export class RedditGptService {
  private openai: OpenAI | null = null;
  private readonly logger = new Logger(RedditGptService.name);

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }

  async parseTravelQuery(
    text: string,
    currentDate: Date,
  ): Promise<z.infer<typeof RedditTravelQuerySchema>> {
    const model = process.env.GPT_MODEL || 'gpt-4o-mini';
    if (!this.openai) {
      this.logger.warn(
        'OpenAI API key not configured. Bypassing GPT extraction.',
      );
      return {
        isTravelQuery: false,
        origin: null,
        destination: null,
        date: null,
        travelClass: null,
      };
    }

    try {
      const response = await this.openai.chat.completions.parse({
        model,
        messages: [
          {
            role: 'system',
            content: `You are an AI train ticket booking assistant reading Reddit comments. 
Today's date is ${currentDate.toISOString().split('T')[0]}. 
Extract travel query details from the user's message.
Translate conversational city names to IRCTC station codes if possible, or leave as city names.`,
          },
          { role: 'user', content: text },
        ],
        response_format: zodResponseFormat(
          RedditTravelQuerySchema,
          'travel_query',
        ),
      });

      if (!response.choices[0].message.parsed) {
        throw new Error('No parsed message returned');
      }
      return response.choices[0].message.parsed;
    } catch (e) {
      this.logger.error('Failed to parse openai schema', e);
      return {
        isTravelQuery: false,
        origin: null,
        destination: null,
        date: null,
        travelClass: null,
      };
    }
  }

  async parseGTMDetails(
    text: string,
    currentDate: Date,
  ): Promise<z.infer<typeof RedditGTMEngineSchema>> {
    const model = process.env.GPT_MODEL || 'gpt-4o-mini';
    if (!this.openai) {
      return {
        trainNumber: null,
        origin: null,
        destination: null,
        pnr: null,
        dateOfTravel: null,
        currentStatus: null,
      };
    }

    try {
      const response = await this.openai.chat.completions.parse({
        model,
        messages: [
          {
            role: 'system',
            content: `You are an expert at extracting train travel details from Reddit comments. 
Today's date is ${currentDate.toISOString().split('T')[0]}. 
Extract the requested fields accurately.`,
          },
          { role: 'user', content: text },
        ],
        response_format: zodResponseFormat(
          RedditGTMEngineSchema,
          'gtm_extraction',
        ),
      });

      if (!response.choices[0].message.parsed) {
        throw new Error('No parsed message returned');
      }
      return response.choices[0].message.parsed;
    } catch (e) {
      this.logger.error('Failed to parse GTM schema', e);
      return {
        trainNumber: null,
        origin: null,
        destination: null,
        pnr: null,
        dateOfTravel: null,
        currentStatus: null,
      };
    }
  }
}
