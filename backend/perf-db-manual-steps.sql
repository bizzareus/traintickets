-- ============================================================================
-- Backend performance optimization — MANUAL DB STEPS (review before running)
-- Run against the Supabase Postgres. Grouped by tier. All are safe + reversible.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TIER 1: Backstop against stuck transactions pinning a pooled connection.
-- USERSET GUC scoped to the app's role only (not PostgREST/authenticator or
-- other Supabase internals). New sessions pick it up. Reverse with RESET.
-- ----------------------------------------------------------------------------
ALTER ROLE postgres SET idle_in_transaction_session_timeout = '120s';
-- verify:  SHOW idle_in_transaction_session_timeout;  (in a fresh app session)
-- revert:  ALTER ROLE postgres RESET idle_in_transaction_session_timeout;


-- ----------------------------------------------------------------------------
-- TIER 7: Index changes.
--
-- PREFERRED: these are already reflected in prisma/schema.prisma, so apply them
-- via Prisma so migration history stays in sync:
--     cd backend && npx prisma migrate dev --name perf_indexes      (local/dev)
--     npx prisma migrate deploy                                     (prod)
--
-- The raw SQL below is the equivalent, if you prefer to apply by hand. Use the
-- CONCURRENTLY variants in production to avoid table locks (cannot run inside a
-- transaction block; run each on its own).
-- ----------------------------------------------------------------------------

-- Add: covers the previously-unindexed ChartRule.train_id FK and the hot
-- `WHERE train_id IN (...) ORDER BY sequence_number` lookup.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ChartRule_train_id_sequence_number_idx"
  ON "ChartRule" ("train_id", "sequence_number");

-- Drop: station_name index is never used (searches use ILIKE '%term%', a
-- leading wildcard a B-tree can't serve); it only added write cost.
DROP INDEX CONCURRENTLY IF EXISTS "station_cache_station_name_idx";


-- ----------------------------------------------------------------------------
-- TIER 7 (OPTIONAL): cache_entry.expires_at index is reported unused. Only drop
-- if you have no sweep job that deletes by expires_at. Low impact (cache_entry
-- is low-write), so optional.
-- ----------------------------------------------------------------------------
-- DROP INDEX CONCURRENTLY IF EXISTS "cache_entry_expires_at_idx";


-- ============================================================================
-- MEASUREMENT: reset stats, let traffic run, then re-check.
-- ============================================================================
-- Reset the counters to start a clean measurement window:
--     SELECT extensions.pg_stat_statements_reset();
--
-- After some traffic, re-run the top-cost query to confirm get_auth +
-- DISCARD ALL and the CronLease/station_cache write counts have dropped:
--     SELECT round(total_exec_time/1000)::int AS total_s, calls,
--            round(mean_exec_time)::int AS mean_ms,
--            round((100*total_exec_time/sum(total_exec_time) OVER ())::numeric,1) AS pct,
--            left(regexp_replace(query,'\s+',' ','g'),120) AS query
--     FROM extensions.pg_stat_statements
--     ORDER BY total_exec_time DESC LIMIT 20;
