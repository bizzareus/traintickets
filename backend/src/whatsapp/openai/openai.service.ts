import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

const TicketQuerySchema = z.object({
  isTicketRequest: z
    .boolean()
    .describe(
      'True if the user is asking to find or check train tickets. False if the user is just saying hi or chatting.',
    ),
  origin: z
    .string()
    .nullable()
    .describe('The origin station name or code. Null if not specified.'),
  destination: z
    .string()
    .nullable()
    .describe('The destination station name or code. Null if not specified.'),
  date: z
    .string()
    .nullable()
    .describe(
      "The travel date in YYYY-MM-DD format. Determine this relative to current date if they say 'tomorrow' or 'today'. Null if not specified.",
    ),
});

@Injectable()
export class OpenaiService {
  private openai: OpenAI | null = null;
  private readonly logger = new Logger(OpenaiService.name);

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }

  async parseTicketRequest(
    text: string,
    currentDate: Date,
  ): Promise<z.infer<typeof TicketQuerySchema>> {
    if (!this.openai) {
      this.logger.warn('OpenAI API key not configured. Bypassing extraction.');
      return {
        isTicketRequest: false,
        origin: null,
        destination: null,
        date: null,
      };
    }

    try {
      const response = await this.openai.chat.completions.parse({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an AI train ticket booking assistant reading WhatsApp group messages. 
Today's date is ${currentDate.toISOString().split('T')[0]}. 
Extract ticket request details from the user's message.
If they mention 'tomorrow', calculate the correct YYYY-MM-DD date.
Translate conversational city names to their English equivalent. (e.g. Bombay -> Mumbai)`,
          },
          { role: 'user', content: text },
        ],
        response_format: zodResponseFormat(TicketQuerySchema, 'ticket_query'),
      });

      if (!response.choices[0].message.parsed) {
        throw new Error('No parsed message returned');
      }
      return response.choices[0].message.parsed;
    } catch (e) {
      this.logger.error('Failed to parse openai schema', e);
      return {
        isTicketRequest: false,
        origin: null,
        destination: null,
        date: null,
      };
    }
  }
}
