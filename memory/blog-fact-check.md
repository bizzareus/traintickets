# LastBerth Blog Fact-Audit & Correction — Workflow

Daily agent that AUDITS LastBerth blog posts for factual errors and CORRECTS the confirmed ones against official Indian Railways / IRCTC sources. Companion to the daily-blog-writing task (that writes/optimizes for SEO; this keeps facts true). Project: /Users/kartikarora/Documents/personal/traintickets. Memory dir: /Users/kartikarora/.claude/projects/-Users-kartikarora-Documents-personal-traintickets/memory/.

Core idea: the corpus is ~79 English posts × 7 languages (hi mr bn ta te ml) = ~553 files under content/blog/ — too much to verify daily. Each run audits a BOUNDED, ROTATING batch (default 4–6 English slugs) so the whole corpus is covered over a ~2–3 week cycle, prioritising high-traffic and time-sensitive pages. Read real claims, verify each against an official source, and correct ONLY the CONFIRMED-wrong ones. A wrong "correction" is worse than a missed error — when a claim can't be verified against an official source, REPORT it, do NOT edit.

## Official-source allow-list (verify ONLY against these)

IRCTC (irctc.co.in, contents.irctc.co.in official PDFs), Indian Railways / Ministry of Railways (indianrailways.gov.in, pib.gov.in), NTES (enquiry.indianrail.gov.in), CRIS, official Rail Madad / RailOne / UTS pages. Reputable PIB-sourced news may confirm the DATE/EXISTENCE of a change, but the VALUE you write must trace to an official source. Never correct a fact on the authority of a blog, aggregator, or another LastBerth page. Cite URL + verification date for every correction.

## Step 0 — Build the batch (rotation + signal)

1. Read memory/blog-fact-audit-log.md (rotation state; create if missing). Candidates = never-audited or least-recently-audited English slugs; never re-audit a slug from the last ~10 days unless a signal forces it.
2. Signal overlay bumps priority: (a) Traffic — highest-impression pages from the latest GSC export ~/Downloads/lastberth.com-Performance-on-Search-\*.xlsx (Pages sheet); skip if unavailable. (b) Fact density/volatility — pages heavy in fees/timings/quotas/dates or an explicit "2026", or whose `updated` is old. (c) Recent rule changes — if a real change landed, pull EVERY page stating the old value regardless of rotation.
3. Pick top 4–6 English slugs. State the batch + why before auditing.

## Step 1 — Extract checkable claims (per slug)

Read the English file. Pull objectively checkable facts (ignore opinion/tone): money (fares, clerkage, cancellation fees, GST, catering/bedroll, refund ₹); timings/windows (Tatkal open, ARP open 8AM, chart prep, current-availability open/close, TDR/refund deadlines); durations/counts (ARP length, monthly booking limit, passengers/PNR, WL/RAC mechanics); percentages (concession %, dynamic-fare caps); dates (effective-from, launch); quota/eligibility rules (FTQ, ladies, senior, Divyaang, lower-berth, Tatkal); named specifics (train numbers, routes, station codes, coach composition — verify via NTES).

## Step 2 — Verify each claim

For each claim, web_fetch/web_search an allow-list source. Verdict: CORRECT (no action) / WRONG (record correct value+source+date) / STALE (was true, superseded — record new value+effective date+source) / UNVERIFIABLE (no official source — do NOT edit, report it). Cross-check memory/lastberth-railway-canonical-facts.md first (fast path) but spot-verify against source if the page predates a fact's last-confirmed date. Keep that memory file current.

## Step 3 — Correct CONFIRMED errors only (never UNVERIFIABLE)

Minimal surgical edit to the English file (fix the number/date/rule; keep voice). Fix every instance in the file (intro + table + FAQ). Keep the page internally consistent. Bump `updated:` to today (leave `date:`). Propagate the identical correction to all 6 translations (hi mr bn ta te ml); bump their `updated:`. Keep technical tokens in Latin (IRCTC, PNR, RAC, WL, ARP, NTES, TTE, FTQ, Tatkal). A page with zero confirmed errors gets ONLY an audit-log row update (no file change, no `updated` bump).
Correction safety (hard): never invent/"improve" an unverified fact; never change a fact just because it "sounds old" (verify first); on conflicting sources prefer the most recent official notice, else mark UNVERIFIABLE. OUT OF SCOPE (recommend to user, do NOT edit): React components, routes like app/irctc-train-food-menu/\*\* and their generateMetadata titles, backend, config, redirects.

## Step 4 — Update memory

memory/blog-fact-audit-log.md — append/refresh a row per audited slug: date, verdict (CLEAN/CORRECTED/REPORTED), one-line note, commit hash (rotation state). memory/lastberth-railway-canonical-facts.md — living ground-truth table (fact → current value → official source URL → last-confirmed date): add verified facts, update last-confirmed dates, record superseded values with change dates. Add a one-line pointer in MEMORY.md for any new memory file.

## Step 5 — Verify edits

Valid YAML frontmatter; `updated` bumped; only intended spans changed (git diff eyeball); FAQ/JSON-LD intact; no broken links.

## Step 6 — Version control

Stage only affected markdown + the two memory files. One commit per batch:
git -c user.email="me@kartikarora.in" -c user.name="Kartik Arora" commit -m "fix(facts): <slug> — <what was corrected> (official source)"
git push origin main
If no network, leave commit local and tell the user to push. If a stale .git/index.lock blocks commit and can't be removed, use the low-level git commit-tree path.

## Step 7 — Summary

Report: batch + why each slug (rotation vs signal); a FINDINGS TABLE (slug → claim → verdict → official value → source URL); corrections applied (EN + n langs) vs reported-only (UNVERIFIABLE/out-of-scope); files changed; push status; any rule change that should feed back into the daily-blog-writing task.

## Constraints

Verify against the official allow-list ONLY; cite source+date per correction. Correct CONFIRMED errors only — report, never guess. Bounded rotating batch (default 4–6 slugs/run). Markdown blog files + the two memory files only — never components, routes, backend, config. Do not run content through AI-content detectors.

This is an automated run; the user is not present. Execute autonomously, make reasonable choices, and note them in the summary. Only take write actions (edits, commit, push) as this workflow specifies.
