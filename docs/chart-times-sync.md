# Chart-times bulk sync (Railway cron → GitHub)

Generates the `/chart-times` static pages on the live site in batches and commits
the resulting `content/chart-times/*.json` files back to GitHub, so they ship as
build-time static SEO pages.

## How it works

1. **Endpoint** `GET /api/chart-times-data/:n` returns the exact `ChartTimesPageData`
   for a train (the same code that backs the pages — no generation drift).
2. **Cron script** [`scripts/sync-chart-times.mjs`](../scripts/sync-chart-times.mjs):
   - clones the repo fresh (token auth),
   - reads `scripts/chart-times-trains.json`, takes a batch of pending trains,
   - fetches each train's JSON from the endpoint and writes `content/chart-times/<slug>.json`,
   - marks progress (`completed`, `slug`, `canonicalNumber`, `httpStatus`),
   - commits, `git pull --rebase`, and pushes (retries on races with the blog bot).

Re-runs are resumable (skip `completed` trains). Nothing reaches GitHub except by
this committed flow — runtime page generation on the web server is ephemeral.

## One-time setup

### 1. GitHub token (a secret — never commit it)
Create a **fine-grained PAT** scoped to **only `bizzareus/traintickets`** with
**Repository permissions → Contents: Read and write**. Copy the token.

### 2. Railway service
Create a new service in the existing project from this repo (a third service
alongside `web` and `api`), then:

- **Start command:** `node scripts/sync-chart-times.mjs`
- **Cron schedule:** avoid the blog bot's 00:00 / 08:00 / 16:00 UTC slots, e.g.
  `0 3,9,15,21 * * *` (every 6h, offset).
- **Variables:**
  | Variable | Value |
  |---|---|
  | `GITHUB_TOKEN` | *(the fine-grained PAT — secret)* |
  | `SITE_URL` | `https://lastberth.com` |
  | `CHART_TIMES_SYNC_SECRET` | a random string (also set on the **web** service so the endpoint is protected) |
  | `SYNC_BATCH` | `200` (trains per run; tune for IRCTC load) |
  | `GIT_BRANCH` | `main` |

  Optional: `SYNC_RETRIES` (default 2), `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`,
  `GITHUB_REPO` (default `bizzareus/traintickets`).

### 3. Protect the endpoint (recommended)
Set the **same** `CHART_TIMES_SYNC_SECRET` on the **web** service. The endpoint
then requires an `x-sync-secret` header, which the cron script sends automatically.
Without it set, the endpoint is open (it only exposes public chart data, but it
does hit IRCTC, so protecting it prevents abuse).

## Test / operate

- **Dry run** (no push): set `DRY_RUN=1` — it generates, writes, and commits
  locally in the throwaway clone, then exits without pushing.
- **Pace it:** `SYNC_BATCH` × number of daily runs sets throughput; the full
  ~6.3k list completes over several days. Progress is tracked per train.
- **Sitemap / llms.txt** pick up new pages automatically on the next deploy
  (they read the committed `content/chart-times/*.json`).
