import { Module } from '@nestjs/common';
import { BookingV2Module } from '../booking-v2/booking-v2.module';
import { McpController } from './mcp.controller';

/**
 * Public Model Context Protocol server (Streamable HTTP at POST /mcp). Exposes
 * LastBerth's station search + best-confirmed-seat lookup as MCP tools so it can
 * be added as a connector in ChatGPT, Claude, Cursor, etc. Wraps BookingV2Service.
 */
@Module({
  imports: [BookingV2Module],
  controllers: [McpController],
})
export class McpModule {}
