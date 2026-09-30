import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';

@Controller('api/health')
@SkipThrottle({ global: true })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicator: HealthIndicatorService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      async () => {
        const database = this.indicator.check('database');
        try {
          await this.prisma.$transaction(
            async (transaction) => {
              await transaction.$executeRawUnsafe(
                "SET LOCAL statement_timeout = '1500ms'",
              );
              await transaction.$queryRawUnsafe('SELECT 1');
            },
            { maxWait: 1_000, timeout: 2_000 },
          );
          return database.up();
        } catch (error) {
          return database.down({
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
    ]);
  }
}
