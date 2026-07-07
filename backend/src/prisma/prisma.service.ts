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
    // Keep pooled connections warm. The previous 10s idle timeout closed
    // connections between traffic bursts; reopening them re-runs pgbouncer
    // get_auth + DISCARD ALL on every reconnect, which was ~37% of all DB time.
    // A long idle timeout lets a small, stable set of connections be reused.
    const idleTimeoutMillis = parsePositiveInt(
      process.env.DATABASE_POOL_IDLE_TIMEOUT_MS,
      120_000,
      1_000,
      600_000,
    );
    const connectionTimeoutMillis = parsePositiveInt(
      process.env.DATABASE_POOL_CONNECTION_TIMEOUT_MS,
      10_000,
      1_000,
      30_000,
    );

    // Remote Postgres (Supabase/prod) requires SSL; a plain local dev Postgres
    // doesn't speak it and errors with "server does not support SSL connections".
    // Enable SSL for everything except localhost (override with DATABASE_SSL).
    const isLocalDb = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(
      connectionString,
    );
    const useSsl =
      process.env.DATABASE_SSL != null
        ? process.env.DATABASE_SSL === 'true'
        : !isLocalDb;

    console.log(
      'PRISMA CONNECTING TO:',
      connectionString.split('@')[1] || connectionString,
      `poolMax=${poolMax} idleTimeoutMs=${idleTimeoutMillis} ssl=${useSsl}`,
    );

    const adapter = new PrismaPg({
      connectionString,
      max: poolMax,
      idleTimeoutMillis,
      connectionTimeoutMillis,
      ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    });
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
   * Defensive check that columns from migration 20260602020237 are in the
   * expected state. Each ALTER is a DDL event that makes PostgREST reload its
   * schema cache (which runs an expensive pg_timezone_names scan), so we only
   * issue an ALTER when the current state actually differs. On a healthy DB
   * this fires zero DDL.
   */
  private async selfHealSchema() {
    try {
      const [state] = await this.$queryRawUnsafe<
        Array<{
          cronlease_updated_default: string | null;
          reddit_status_exists: bigint;
          reddit_analyzed_nullable: string | null;
          reddit_analyzed_default: string | null;
          cache_expires_idx_exists: bigint;
        }>
      >(`
        SELECT
          (SELECT column_default FROM information_schema.columns
             WHERE table_name = 'CronLease' AND column_name = 'updated_at') AS cronlease_updated_default,
          (SELECT count(*) FROM information_schema.columns
             WHERE table_name = 'reddit_analyzed_comments' AND column_name = 'status') AS reddit_status_exists,
          (SELECT is_nullable FROM information_schema.columns
             WHERE table_name = 'reddit_analyzed_comments' AND column_name = 'analyzed_at') AS reddit_analyzed_nullable,
          (SELECT column_default FROM information_schema.columns
             WHERE table_name = 'reddit_analyzed_comments' AND column_name = 'analyzed_at') AS reddit_analyzed_default,
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
        stmts.push('ALTER TABLE "CronLease" ALTER COLUMN "updated_at" DROP DEFAULT');
      }
      if (Number(state?.reddit_status_exists ?? 0) === 0) {
        stmts.push(
          `ALTER TABLE "reddit_analyzed_comments" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING'`,
        );
      }
      if (state?.reddit_analyzed_nullable === 'NO') {
        stmts.push('ALTER TABLE "reddit_analyzed_comments" ALTER COLUMN "analyzed_at" DROP NOT NULL');
      }
      if (state?.reddit_analyzed_default != null) {
        stmts.push('ALTER TABLE "reddit_analyzed_comments" ALTER COLUMN "analyzed_at" DROP DEFAULT');
      }

      if (stmts.length === 0) return;
      for (const sql of stmts) await this.$executeRawUnsafe(sql);
      console.log(`Self-healing database check: applied ${stmts.length} fix(es).`);
    } catch (e) {
      console.error('Error during self-healing database check:', e);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
