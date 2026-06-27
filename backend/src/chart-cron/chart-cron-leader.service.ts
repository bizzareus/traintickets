import { Injectable, Logger } from '@nestjs/common';
import { hostname } from 'os';
import { PrismaService } from '../prisma/prisma.service';

const CHART_CRON_LEASE_NAME = 'chart-cron';
const DEFAULT_CHART_CRON_LEASE_SECONDS = 90;

function envFlagDisabled(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return (
    normalized === '0' ||
    normalized === 'false' ||
    normalized === 'no' ||
    normalized === 'off'
  );
}

function envFlagEnabled(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'on'
  );
}

function chartCronLeaseSeconds(): number {
  const parsed = Number.parseInt(
    process.env.CHART_CRON_LEASE_SECONDS ?? '',
    10,
  );
  if (Number.isFinite(parsed) && parsed >= 30 && parsed <= 600) {
    return parsed;
  }
  return DEFAULT_CHART_CRON_LEASE_SECONDS;
}

@Injectable()
export class ChartCronLeaderService {
  private readonly logger = new Logger(ChartCronLeaderService.name);
  private readonly ownerId =
    process.env.RAILWAY_REPLICA_ID?.trim() ||
    `${process.env.RAILWAY_DEPLOYMENT_ID?.trim() || hostname()}:${process.pid}`;
  private ensureTablePromise: Promise<void> | null = null;
  private wasLeader = false;

  constructor(private prisma: PrismaService) {}

  async isLeader(): Promise<boolean> {
    if (
      envFlagEnabled(process.env.CHART_CRON_DISABLED) ||
      envFlagDisabled(process.env.CHART_CRON_ENABLED)
    ) {
      return false;
    }

    try {
      await this.ensureCronLeaseTable();
      const leaseSeconds = chartCronLeaseSeconds();

      // Cheap read first. Every instance polls leadership every minute; if a
      // different instance already holds an unexpired lease, return early
      // without writing. This avoids non-leaders issuing a lease upsert every
      // minute (which was a top DB write cost, ~58k writes to a single row).
      const current = await this.prisma.$queryRaw<
        Array<{ owner_id: string; expired: boolean }>
      >`
        SELECT "owner_id", ("expires_at" <= NOW()) AS expired
        FROM "CronLease"
        WHERE "name" = ${CHART_CRON_LEASE_NAME}
      `;
      const lease = current[0];
      if (lease && !lease.expired && lease.owner_id !== this.ownerId) {
        if (this.wasLeader) {
          this.logger.warn(`chart cron leadership lost owner=${this.ownerId}`);
          this.wasLeader = false;
        }
        return false;
      }

      // We hold it (needs renewal) or it is missing/expired (acquire). Only
      // these cases reach the atomic write below.
      const rows = await this.prisma.$queryRaw<Array<{ name: string }>>`
        INSERT INTO "CronLease" ("name", "owner_id", "expires_at", "updated_at", "created_at")
        VALUES (
          ${CHART_CRON_LEASE_NAME},
          ${this.ownerId},
          NOW() + (${leaseSeconds} * INTERVAL '1 second'),
          NOW(),
          NOW()
        )
        ON CONFLICT ("name") DO UPDATE
          SET "owner_id" = EXCLUDED."owner_id",
              "expires_at" = EXCLUDED."expires_at",
              "updated_at" = NOW()
        WHERE "CronLease"."owner_id" = ${this.ownerId}
           OR "CronLease"."expires_at" <= NOW()
        RETURNING "name"
      `;
      const isLeader = rows.length > 0;
      if (isLeader && !this.wasLeader) {
        this.logger.log(
          `chart cron leadership acquired owner=${this.ownerId} leaseSeconds=${leaseSeconds}`,
        );
      }
      if (!isLeader && this.wasLeader) {
        this.logger.warn(`chart cron leadership lost owner=${this.ownerId}`);
      }
      this.wasLeader = isLeader;
      return isLeader;
    } catch (err) {
      this.wasLeader = false;
      this.logger.warn(
        `chart cron leadership check failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  private async ensureCronLeaseTable(): Promise<void> {
    this.ensureTablePromise ??= this.prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "CronLease" (
        "name" TEXT NOT NULL,
        "owner_id" TEXT NOT NULL,
        "expires_at" TIMESTAMP(3) NOT NULL,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CronLease_pkey" PRIMARY KEY ("name")
      )
    `.then(() => undefined);
    return this.ensureTablePromise;
  }
}
