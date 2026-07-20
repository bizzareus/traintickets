---
name: lastberth-posthog-conversion
description: "PostHog MCP is now wired into the daily-blog routine — project id, real conversion event names, and the blog→tool funnel to measure"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 91fef4b8-ff34-4160-a194-5ae2008a643b
---

**PostHog MCP is connected** (org **LastBerth**, project **Default project** id **359354**), so blog behaviour + conversion data is pulled **directly over MCP — no Chrome needed** (Chrome is still required only for GSC + Trends). Analytics live in **PostHog, NOT Google Analytics** — never recommend GA key events. Always `read-data-schema` to confirm names before querying (they drift; captured 2026-07-15).

**The second objective of the blog is conversion:** turn readers into platform users who **search for tickets** on the LastBerth tools. Rank Playbook E (CTA) opportunities by `human_pageviews × (1 − conversion_rate)`.

**Traffic:** `$pageview` broken down by `$pathname`, filtered to `/blog/*`; exclude bots (`$virt_is_bot = false` / `$virt_traffic_type` ≠ Bot/AI Agent) — SEO/AI crawlers inflate blog views. `$referrer`/`$referring_domain` confirm blog-originated tool sessions.

**Conversion / tool events (the funnel step-2 targets):**
- `search_tickets_clicked` — **primary conversion** (core "search for tickets").
- `best_train_search_clicked`; builder steps `search_from_selected` / `search_to_selected` / `search_date_selected`.
- `search_pnr_feature_clicked` / `search_pnr_status_checked` — PNR status (**Smart Seats `/`**).
- `seat_status_feature_clicked` / `seat_status_checked` — **Coach Journey Lookup `/seat-status`**.
- `chart_times_search_submitted` / `chart_times_train_selected` — **`/chart-times`**.
- `chart_alert_opened` / `chart_alert_submitted`, `alternate_paths_*` — secondary.
- Tool-error events = app bugs to flag, not content: `station_suggestion_failed`, `chart_time_load_failed_booking_popup`.

**Blog→tool funnel:** `query-funnel` step1 = `$pageview` on `/blog/*` → step2 = any tool event above, same session; run **per landing `$pathname`** for a per-post conversion rate. `query-paths` from blog pages shows where readers go next. Record pre-change conversion in the experiment tracker so a later run verifies a CTA moved real events (not just that it exists). See [[lastberth-seo-weekly-routine]], [[seo-ctr-cta-experiment-2026-07]], [[lastberth-seo-ctr-vs-content]]. Routine updated 2026-07-15 (Step 0C).
