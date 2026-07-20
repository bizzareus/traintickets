---
name: lastberth-seo-weekly-routine
description: "The lastberth-seo-weekly scheduled task — what it does, how it gets data (Claude-in-Chrome, no MCP/Ahrefs), and its guardrails"
metadata: 
  node_type: memory
  type: project
  originSessionId: ccf1bdeb-5519-4f01-aaf5-09ba2220eca1
---

A weekly SEO management routine for lastberth.com, built 2026-07-13 from the *Claude Fable SEO Playbook* (a Google Doc; e-commerce-oriented, adapted to this content+tools site). Created via the scheduled-tasks system, NOT a repo skill.

- **Task:** `lastberth-seo-weekly` — `~/.claude/scheduled-tasks/lastberth-seo-weekly/SKILL.md`. Cron `0 8 * * 1` (Mon 08:00 local). Sits alongside `daily-blog-writing`, `blog-fact-audit`, and the reeltripper tasks.
- **Data:** via **Claude-in-Chrome** using the user's logged-in Google session — deliberately NOT the playbook's Google Cloud service-account + `mcp-server-gsc` MCP (user chose "keep using claude computer"). **No Ahrefs** (no account → backlink workflow dropped). PageSpeed via web UI, no key.
- **Does:** GSC last-7d-vs-prior-7d (pages+queries) + Indexing report → four workflows adapted from the playbook: Quick Wins (CTR titles, pos 5–15), Tech Debt (sitemap crawl + PageSpeed), Internal Links (orphans / tool-page inlinks / blog→tool), Monday movement by page type. **Output is the action** (title diff / link plan / ticket), not a dashboard.
- **Acts:** writes a report to `seo/runs/weekly/YYYY-MM-DD.md` (gitignored, local); applies ≤3–5 CTR quick wins + 1–2 internal links per week within the [[seo-ctr-cta-experiment-2026-07]] guardrails (SERP title ≤~60ch incl. `| LastBerth`, no position loss); commits explicit paths (concurrent-committer hazard — never `git add -A`); logs actions back to the experiment memory.
- **Setup doc:** `docs/seo-weekly-routine.md` (committed, `db958dc1`).
- **Prereq the user owns:** Chrome must be logged into the Google account owning the lastberth.com GSC property, else the run writes a BLOCKER note and does repo-side analysis only. First run should be triggered via **"Run now"** to pre-approve the browser tools.
- Does NOT duplicate content drafting (`daily-blog-writing`) or fact-checking (`blog-fact-audit`). Related: [[lastberth-seo-ctr-vs-content]], [[blog-topics-written]].
