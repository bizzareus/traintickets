# LastBerth Weekly SEO Routine

An automated weekly SEO management routine for **lastberth.com**, adapted from the
*Claude Fable SEO Playbook* (originally written for e-commerce PDP/collection sites)
to this content-plus-tools site: multilingual blog guides + tools (Smart Seats,
`/chart-vacancy`, `/pnr-status`, `/chart-times`, `/irctc-train-food-menu`, `/routes/*`).

The playbook's principle: **the output is the action, not a dashboard.** Each run
produces a CTR-title diff, an internal-link plan, a tech-debt ticket, and a
prioritized top-3 — and applies the safe, high-confidence wins itself.

## How it runs

- **Mechanism:** a local scheduled task (same system as `daily-blog-writing`,
  `blog-fact-audit`), stored at `~/.claude/scheduled-tasks/lastberth-seo-weekly/SKILL.md`.
- **Cadence:** every **Monday 08:00** local time (`0 8 * * 1`). Runs while the app is
  open; if closed at fire time, it runs on next launch.
- **Data access:** **Claude-in-Chrome**, using your already-logged-in Google session —
  *not* the Google Cloud service-account MCP the playbook describes. No credentials to
  manage. (We skip Ahrefs / backlink work — no account.)
- **Output:** a dated report at `seo/runs/weekly/YYYY-MM-DD.md` (gitignored — local
  artifact). Actual code/content fixes are committed to `main` normally.

## One-time setup (you)

1. **Google Search Console access in Chrome.** Open Chrome (the one Claude-in-Chrome
   drives) and sign in to the Google account that owns the **lastberth.com** GSC
   property. Confirm you can load the Performance report. That's the only hard
   requirement — the routine reads GSC through this logged-in session.
2. *(Optional)* **GA4** — if you want engagement data in the tech-debt ranking, make sure
   the same Google account can open GA4 for the site. Note: your funnel events live in
   **PostHog**, not GA4 (see memory `lastberth-seo-ctr-vs-content`).
3. *(Optional)* **PageSpeed** — the routine uses the PageSpeed Insights web UI via Chrome
   by default; no API key needed. Add a key later only if you want faster/batch runs.

Nothing else to install — no `claude mcp add`, no service account JSON.

## What each run does

1. **Orient** — reads the SEO memory (CTR experiment log, canonical facts, translation
   gate) and avoids duplicating the daily blog + fact-audit tasks.
2. **Pull data** — GSC Performance (last 7d vs prior 7d, by query + page) and the
   Indexing/Pages report, via Chrome.
3. **Quick Wins** — pages at position 5–15 with real impressions and below-curve CTR →
   sharper title/meta hooks (within the CTR guardrails: effective SERP title ≤ ~60 chars
   incl. `| LastBerth`, don't lose position).
4. **Tech Debt** — sitemap crawl for redirect chains / broken canonicals / stray noindex /
   4xx, cross-checked with the Indexing report; top pages through PageSpeed. Ranked by
   traffic-at-risk.
5. **Internal Links** — orphans, tool/money pages with few inbound blog links, and blog
   posts ranking for tool-intent queries that don't link to the matching tool → a concrete
   link plan.
6. **Monday movement** — week-over-week by page type (blog / tools / route+chart+food),
   risers and droppers, with any CTR-title change that lost position flagged for revert.
7. **Act (capped)** — applies the top 3–5 CTR quick wins + 1–2 unambiguous internal links,
   typechecks, commits (explicit paths — this repo has concurrent automated committers),
   and logs the actions to the CTR-experiment memory. Everything uncertain stays a
   recommendation in the report.

## Running it manually / changing cadence

- **Run now / edit schedule:** manage it via the scheduled-tasks system (the same place the
  other routines live); its prompt is at the `SKILL.md` path above.
- **Adjust cadence:** change the cron (`0 8 * * 1`) — e.g. `0 7 * * 1` for the playbook's
  Monday 7am.

## Not included (deliberately)

- **Backlink cleanup** — no Ahrefs account.
- **Content drafting** — owned by `daily-blog-writing`; this routine optimizes what exists.
- **Standalone HTML dashboard** — the actionable report replaces it; can be added later.
