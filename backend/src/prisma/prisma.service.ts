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

/** Remove any `sslmode` query param so it can't override the explicit ssl config. */
function stripSslmode(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete('sslmode');
    return u.toString();
  } catch {
    return url;
  }
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const rawConnectionString =
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/railchart';
    // Supabase's pooler presents a cert chain Node's default CAs don't trust
    // ("self-signed certificate in certificate chain"), which crashes the pg
    // adapter. Connect over TLS without verifying the server cert, and strip any
    // sslmode= from the URL so it can't fight the explicit ssl option below.
    const connectionString = stripSslmode(rawConnectionString);
    const poolMax = parsePositiveInt(process.env.DATABASE_POOL_MAX, 10, 1, 30);
    // Keep pooled connections warm while avoiding dead sockets dropped by remote firewalls.
    const idleTimeoutMillis = parsePositiveInt(
      process.env.DATABASE_POOL_IDLE_TIMEOUT_MS,
      30_000,
      1_000,
      600_000,
    );
    const connectionTimeoutMillis = parsePositiveInt(
      process.env.DATABASE_POOL_CONNECTION_TIMEOUT_MS,
      20_000,
      1_000,
      60_000,
    );

    // Remote Postgres (Supabase/prod) requires SSL; a plain local dev Postgres
    // doesn't speak it and errors with "server does not support SSL connections".
    // Enable SSL for everything except localhost (override with DATABASE_SSL).
    const isLocalDb = /@(localhost|127\.0\.0\.1|\[::1\]|db|postgres)[:/]/.test(
      connectionString,
    );
    const useSsl =
      process.env.DATABASE_SSL != null
        ? process.env.DATABASE_SSL === 'true'
        : !isLocalDb;

    console.log(
      'PRISMA CONNECTING TO:',
      connectionString.split('@')[1] || connectionString,
      `poolMax=${poolMax} idleTimeoutMs=${idleTimeoutMillis} connTimeoutMs=${connectionTimeoutMillis} ssl=${useSsl}`,
    );

    const adapter = new PrismaPg(
      {
        connectionString,
        max: poolMax,
        idleTimeoutMillis,
        connectionTimeoutMillis,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10_000,
        maxLifetimeSeconds: 1_800,
        ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
      },
      {
        onPoolError: (err) => {
          console.warn(
            '[PrismaService] pg pool idle client notice:',
            err.message,
          );
        },
      },
    );
    super({
      adapter,
      log:
        process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    await this.selfHealSchema();
  }

  /**
   * Defensive check for schema state that can drift in deployed databases.
   * Each ALTER is a DDL event that makes PostgREST reload its schema cache, so
   * we only issue one when the current state actually differs.
   */
  private async selfHealSchema() {
    try {
      const [state] = await this.$queryRawUnsafe<
        Array<{
          cronlease_updated_default: string | null;
          cache_expires_idx_exists: bigint;
        }>
      >(`
        SELECT
          (SELECT column_default FROM information_schema.columns
             WHERE table_name = 'CronLease' AND column_name = 'updated_at') AS cronlease_updated_default,
          (SELECT count(*) FROM pg_indexes
             WHERE tablename = 'cache_entry' AND indexname = 'cache_entry_expires_at_idx') AS cache_expires_idx_exists
      `);

      const stmts: string[] = [];
      if (Number(state?.cache_expires_idx_exists ?? 1) === 0) {
        // The @@index([expiresAt]) on cache_entry can go missing; without it,
        // expiry sweeps full-scan a huge table. Recreate it if absent.
        stmts.push(
          'CREATE INDEX IF NOT EXISTS "cache_entry_expires_at_idx" ON "cache_entry" ("expires_at")',
        );
      }
      if (state?.cronlease_updated_default != null) {
        stmts.push(
          'ALTER TABLE "CronLease" ALTER COLUMN "updated_at" DROP DEFAULT',
        );
      }

      if (stmts.length === 0) return;
      for (const sql of stmts) await this.$executeRawUnsafe(sql);
      console.log(
        `Self-healing database check: applied ${stmts.length} fix(es).`,
      );
    } catch (e) {
      console.error('Error during self-healing database check:', e);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
