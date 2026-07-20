---
name: railway-supabase-migrations
description: "Why `prisma migrate deploy` can't run from Railway for traintickets, and how prod deploys/migrations actually work now."
metadata: 
  node_type: memory
  type: project
  originSessionId: 763704c5-3b57-4464-a071-104d97dadd34
---

For the traintickets backend on Railway ([[railway-project]]), **Prisma
migrations cannot run from Railway against Supabase.** Root cause (diagnosed
2026-07-05): the only DB endpoint reachable from Railway is Supabase's
**transaction pooler** `aws-1-ap-northeast-1.pooler.supabase.com:6543`, and the
migrate/schema engine can't use it (advisory locks + "prepared statement s1
already exists"). The migrate-compatible endpoints are NOT reachable from
Railway: session pooler `:5432` → `P1001 can't reach`; direct
`db.<ref>.supabase.co:5432` (IPv6-only) → `P1001`. `<ref>` = `pfeulehklfuwmqeuuibf`.
It worked earlier when `DATABASE_URL` was the 5432 session pooler, but that host
stopped accepting 5432, and DATABASE_URL was switched to 6543.

**Runtime is fine on 6543** — the app uses `PrismaPg` (node-postgres adapter),
which handles the transaction pooler; health returns 200. Only the migrate CLI
breaks.

**What was changed to unblock deploys (commit 4923f69c):**
`backend/railway.json` preDeployCommand is now
`timeout 90 npx prisma migrate deploy || true` (was `npx prisma migrate deploy`).
So a doomed migrate no longer fails the whole deploy. `prisma.config.ts` already
uses `DIRECT_URL ?? DATABASE_URL`; `DIRECT_URL` is set to 6543+`pgbouncer=true`
(still can't truly migrate, but harmless with `|| true`).

**Migrations are now MANUAL.** Apply new migrations via the **Supabase SQL
editor** (browser reaches the DB fine): run the migration.sql, then insert a
`_prisma_migrations` row with the file's sha256 checksum
(`shasum -a 256 <migration.sql>`), `applied_steps_count=1`, `finished_at=now()`,
`ON CONFLICT DO NOTHING`. The Supabase MCP and local Bash also time out against
the DB from this sandbox, so don't rely on them for prod SQL.

**Proper long-term fix (revert the stopgap after):** make a migrate-compatible
endpoint reachable from Railway — either enable Supabase's **IPv4 add-on** so the
direct connection resolves to IPv4 and set `DIRECT_URL` to it, or restore a
reachable **session pooler**. Then set preDeployCommand back to a plain
`npx prisma migrate deploy`.

Also fixed same session (commit 20841540): backend build failed with
`nest: not found` because Railway's prod install omitted devDeps
(`NODE_ENV=production`); buildCommand is now
`npm install --include=dev && npm run build`.

Related: [[railway-project]]
