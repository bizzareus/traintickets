import 'dotenv/config';
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString =
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/railchart';
    const poolMax = parsePositiveInt(process.env.DATABASE_POOL_MAX, 5, 1, 15);

    // DEBUG LOG - Look for this in your terminal!
    console.log('--------------------------------------------------');
    console.log(
      'PRISMA CONNECTING TO:',
      connectionString.split('@')[1] || connectionString,
      `poolMax=${poolMax}`,
    );
    console.log('--------------------------------------------------');

    const adapter = new PrismaPg({
      connectionString,
      max: poolMax,
      idleTimeoutMillis: parsePositiveInt(
        process.env.DATABASE_POOL_IDLE_TIMEOUT_MS,
        10_000,
        1_000,
        60_000,
      ),
      connectionTimeoutMillis: parsePositiveInt(
        process.env.DATABASE_POOL_CONNECTION_TIMEOUT_MS,
        5_000,
        1_000,
        30_000,
      ),
    });
    super({
      adapter,
      log:
        process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();

    // Self-healing database check: ensure all modified columns from migration 20260602020237 exist
    try {
      await this.$executeRawUnsafe(`
        ALTER TABLE "CronLease" ALTER COLUMN "updated_at" DROP DEFAULT;
      `);
      await this.$executeRawUnsafe(`
        ALTER TABLE "reddit_analyzed_comments" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING';
      `);
      await this.$executeRawUnsafe(`
        ALTER TABLE "reddit_analyzed_comments" ALTER COLUMN "analyzed_at" DROP NOT NULL;
      `);
      await this.$executeRawUnsafe(`
        ALTER TABLE "reddit_analyzed_comments" ALTER COLUMN "analyzed_at" DROP DEFAULT;
      `);
      console.log('Self-healing database check: cron/reddit columns verified/created.');
    } catch (e) {
      console.error('Error during self-healing database check:', e);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
