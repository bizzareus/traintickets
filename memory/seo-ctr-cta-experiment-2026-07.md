---
name: seo-ctr-cta-experiment-2026-07
description: Open experiment — CTR title rewrites + blog→tool CTAs shipped 2026-07-06; baselines + expected lift + check-back dates to verify
metadata: 
  node_type: memory
  type: project
  originSessionId: e8e25eda-71b2-44d1-8b22-bde733f97dfc
---

**OPEN EXPERIMENT — check back on the dates below and compare against fresh GSC + PostHog.** Shipped 2026-07-06. Two changes; two hypotheses. See [[lastberth-seo-ctr-vs-content]] for the analysis and [[blog-topics-written]] for the change log.

## Baseline (GSC 28-day export, ending 2026-07-05)
Site-wide: **0.75% CTR**, 490 clicks / 64,983 impr. Almost everything ranks pos 4–10 (CTR problem, not ranking). Modeled ~2,000 lost clicks/28d vs a normal position-CTR curve.

Per-page baseline (impr / clicks / CTR / avg position):

| Slug | Impr | Clicks | CTR | Pos |
|---|---|---|---|---|
| irctc-current-availability-explained | 13,303 | 122 | 0.92% | 6.9 |
| irctc-ticket-booking-limits-aadhaar-verification | 7,065 | 30 | 0.42% | 6.0 |
| wl-waiting-list-meaning-indian-railway | 5,676 | 6 | 0.11% | 7.1 |
| irctc-retiring-room-booking-rules-dormitory | 3,062 | 7 | 0.23% | 8.8 |
| travel-sleeper-ac-class-general-platform-ticket | 2,282 | 8 | 0.35% | 6.7 |
| irctc-vikalp-scheme-explained | 2,037 | 2 | 0.10% | 8.6 |

## Change 1 — title/meta rewrites (CTR lever)
Rewrote `title` + `description` on the 6 pages above (EN + 6 langs), frontmatter-only. Commits `eddc3cf6` (5 pages) + the travel-sleeper retitle. Hooks that AI Overviews can't satisfy (e.g. WL→"Will Yours Confirm? Chances by WL Number"; limits→"12 Tickets/Month, 24 With Aadhaar").

**Hypothesis H1:** after Google re-crawls (~1–3 wks) and CTR stabilizes (~3–4 wks), CTR on these pages rises materially **without losing position**.
**Targets (CTR):** current-availability →≥1.5%; booking-limits →≥1.0%; wl →≥0.4%; retiring-room →≥0.6%; travel-sleeper →≥0.8%; vikalp →≥0.4%. Site-wide 0.75% →≥1.1%.
**Success = majority of the 6 pages at ≥1.5× baseline CTR with average position within ±1.5 of baseline.**
**Guardrail:** if any page's avg position worsens by >2 OR clicks fall below baseline, REVERT that title. Definitional pages (wl, vikalp) may be capped by AI Overviews — watch impressions too.

## Change 2 — top-of-page blog→tool CTAs (funnel lever, measured in PostHog NOT GSC)
Added a high-visibility CTA blockquote (PNR status `/` + **Chart Vacancy `/chart-vacancy`**) near the top of 6 waitlist/availability posts: current-availability, wl, vikalp, gnwl-vs-rlwl-vs-pqwl, rac-vs-wl, partial-confirmation (EN + 6 langs). Baseline: `/chart-vacancy` was linked from **0** blog posts, yet is the 2nd-stickiest tool (GA 2m25s engagement).

**Hypothesis H2:** these CTAs drive measurable blog→tool clickthrough; `/chart-vacancy` starts getting blog-referred sessions (from ~0).
**Success = non-trivial CTA click events in PostHog + chart-vacancy sessions with a blog referrer > 0.** (Events live in PostHog — check there, not GA.)

## Addendum — CTR batches riding along (same lever, re-check on the same dates)
- **2026-07-07 meta-snippet defect fix (REFRESH-CTR):** 9 pages whose `description:` opened with the junk "WL full form is Waiting List." prefix — rajdhani, shatabdi, vande-bharat-last-minute-15min, vande-bharat-routes-manufacturing, vande-bharat-train-rules, bullet-train, delhi-to-goa, toy-train, ttr-full-form (EN+6 langs). Baselines (28d GSC ending 07-06): vande-bharat-15min 1166 impr/**2.1%**/4.6; rajdhani 811/**0.6%**/7.2; shatabdi 718/**1.0%**/6.0; vb-routes-mfg 217/0.9%/7.5; bullet-train, delhi-goa, toy-train, ttr, vb-rules lower impr. **Expect:** snippet now reads on-topic → CTR up without position loss. Guardrail: same as H1.
- **2026-07-07 cancellation-tdr retitle (CTR):** irctc-cancellation-refund-rules-tdr-guide baseline 528 impr/**0.2%**/9.1. New 54-char title + "how much refund?" hook. Target ≥0.6% CTR, position within ±1.5.

## Addendum — 2026-07-09 batch (same levers, re-check on the same dates)
- **CTR title/meta rewrites (frontmatter, EN+6 langs).** Baselines (28d GSC Pages, ending 07-07):
  - irctc-acceptable-id-proofs-train-travel — 581 impr / **0.2%** / pos 6.3 → new title "Which ID Proofs Are Valid for Train Travel? (2026)". Target ≥0.6% CTR, pos within ±1.5.
  - irctc-booking-failed-money-deducted-refund-rules — 626 impr / 0.6% / 6.2 (old title 71 ch, truncating) → "IRCTC Booking Failed, Money Deducted? Refund Timeline" (52 ch). Target ≥1.0%.
  - tatkal-vs-current-availability-last-minute-train-ticket — 494 impr / **0.2%** / 7.6 → "Tatkal or Current Availability: Which Confirms Faster?" + 10–11 AM/~4 hr meta. Target ≥0.6%.
  - irctc-child-ticket-booking-rules-fares — 984 impr / 0.9% / 6.2 → "Child Train Ticket Rules 2026: Free Under 5, Half Fare". Target ≥1.3%.
  Guardrail: same as H1 (revert title if pos worsens >2 or clicks fall below baseline).
- **CTA (funnel, PostHog):** added top-of-page CTAs to tatkal-vs-current-availability (Chart Vacancy + Coach Journey Lookup) and irctc-auto-upgradation-rules-secrets (PNR Smart Seats + Chart Vacancy, 3,914 impr, previously no top CTA). Same H2 as the 07-06 CTA batch: expect blog→tool click events in PostHog.

## Addendum — 2026-07-09 batch #2 (scheduled 09:00 run; same CTR lever, re-check on the same dates)
CTR title/meta rewrites (frontmatter, EN+6 langs) on 4 UNTOUCHED bleeders. Baselines (28d GSC Pages, ending 07-07):
- connecting-train-bookings-irctc-link-pnr-guide — 355 impr / **0.3%** / pos 7.2 (old title 69 ch, truncating) → "Connecting Train on IRCTC: Link PNR & Refund If You Miss It" (58 ch). Target ≥0.7% CTR, pos within ±1.5.
- vande-bharat-food-booking-opt-out-refund-rules — 993 impr / 0.7% / 5.7 → "Is Vande Bharat Food Mandatory? Opt-Out Price & Refunds". Target ≥1.1%.
- tejas-express-timings-routes-booking-rules — 601 impr / 1.0% / 5.1 → "Tejas Express: India's Private Train — Fares & Booking" ("private train" curiosity hook; delay-compensation angle deliberately avoided — discontinued 2024-02-15). Target ≥1.4%.
- how-to-book-train-tickets-in-india-for-foreigners-ultimate-guide — 468 impr / 0.9% / 7.8 (old title 68 ch w/ "Ultimate Guide" fluff) → "How Foreigners Book Indian Train Tickets: IRCTC & FTQ". Target ≥1.3%.
Guardrail: same as H1 (revert title if pos worsens >2 or clicks fall below baseline).

## Addendum — 2026-07-10 (first CODE-ROUTE retitle; same CTR lever, re-check on the same dates)
- **irctc-train-food-menu** — the highest-impression untouched bleeder, but a **Next.js route** (`app/irctc-train-food-menu/page.tsx`, `metadata` export), NOT a markdown post — blog automation can't touch it; retitle is a code change. Baseline (per user's GSC read): **2,142 impr / 0.7% CTR / pos 7.4**. Old title "IRCTC Train Food Menu & Prices (Vande Bharat)" → new **"IRCTC Train Food Menu & Prices: Is Food Free?"** (45 ch; keeps ranking keyword, adds question hook matching the page's top FAQ; 57 ch incl. `%s | LastBerth` root template). Description now leads with free/price hook + ₹120 breakfast / ₹220 lunch figures. Commit `44828ba5`. Target ≥1.2% CTR, pos within ±1.5. Guardrail: same as H1.
- **irctc-train-food-menu SUB-pages** (commit `8fc87b44`) — same code-route CTR treatment extended to the whole tree: (a) 3 class pages via `standardMenuMetadata` in `lib/standardMenu.ts` — new per-page `metaTitle` field: rajdhani→"Rajdhani Food Menu & Price: What's Included?", ac-2a-3a-cc→"AC 2A/3A/Chair Car Food Menu & Meal Prices", duronto→"Duronto Food Menu & Price: What's Included?"; (b) `mail-express-humsafar/page.tsx` static → "Mail & Express Train Food Menu: Full Price List"; (c) the `[slug]/page.tsx` `title()` template driving **81 Vande Bharat train pages** — dropped the double brand ("| IRCTC Catering" + root "| LastBerth") and added "…Food Menu & Price: What's Included?" (all 81 are Vande Bharat, so hook is universal; truncates tail on long names, keyword leads). All static titles ≤59 ch incl. brand. No per-page baselines captured — treat as a batch; re-check the tree's aggregate CTR on the same dates.
- **Still OPEN (ranking problems, NOT CTR — need body expansion, not retitle):** irctc-ecatering-food-delivery-in-train-guide (625 impr / 0.6% / pos 8.8) and how-to-travel-with-dog-cat-pet-rules (632 / 0.8% / 8.1) — both stuck on page 2; markdown pages, so EXPAND via blog automation. CTR backlog on markdown pages otherwise essentially cleared.

## Addendum — 2026-07-10 batch #2 (scheduled 09:00 run; 2 CTR retitles + the 2 open EXPANDs closed)
CTR title/meta rewrites (frontmatter, EN+6 langs) on 2 UNTOUCHED bleeders that rank but got **0 clicks/28d** (GSC ending 07-07):
- how-to-transfer-confirmed-train-ticket-another-person — 179 impr / **0.0%** / pos 6.5 (page 1!), old title 91 ch → "Can You Transfer a Confirmed Train Ticket? IRCTC Rules" (54 ch). Target ≥1.0% CTR, pos within ±1.5.
- irctc-special-quotas-senior-citizen-ladies-disability-lower-berth — 186 impr / **0.0%** / pos 9.6, old title 102 ch → "Lower Berth Quota for Seniors: How to Book It in 2026" (52 ch). Target ≥0.6% CTR (also a page-2 ranking issue; retitle is the cheap lever). Guardrail: same as H1.
**The 2 "Still OPEN" ranking problems (07-10 addendum above) are now ACTIONED via body EXPAND** (not retitle): irctc-ecatering-food-delivery-in-train-guide (pos 8.8, +5 fan-out H2s) and how-to-travel-with-dog-cat-indian-railways-pet-rules (pos 8.1, +4 fan-out H2s). Success = each moves from page 2 (pos ~8) onto page 1 (pos ≤ ~6) after re-crawl; watch impressions/clicks. Markdown-page CTR + ranking backlog is now essentially cleared.

## Addendum — 2026-07-11 (scheduled run; re-check on the same dates)
Site context: impressions surged 88K→**143K**/28d between 07-07 and 07-11 exports; CTR still 0.7%, pos 6.9.
- **CTR retitle:** irctc-master-list-add-passenger-tatkal-speed-guide — baseline (28d GSC ending 07-11) **1,212 impr / 0.3% / pos 6.1** (was a 07-06 NEW post; surged from 31 impr). New title "IRCTC Master List: Save 20 Passengers for Faster Tatkal" (concrete-number hook), EN+6 langs, frontmatter only. Target ≥0.8% CTR, pos within ±1.5. Guardrail: same as H1.
- **EXPAND (ranking, not CTR):** train-classes-explained-1a-2a-3a-3e-sleeper-chair-car — baseline **6,054 impr / 0.3% / pos 8.3**. +2 fan-out H2s (2A vs 3A; families & solo women) + 2 FAQs, EN+6 langs. Success = pos ≤ ~6 (page 1) after re-crawl; title unchanged.

## Addendum — 2026-07-12 (scheduled run; re-check on the same dates)
Site context: 1K clk / **143K impr** / 0.70% CTR / pos 6.9 (28d ending 07-11). Markdown CTR backlog cleared; this run worked the page-2 ranking backlog + one untouched CTR bleeder.
- **EXPAND(ranking):** irctc-retiring-room-booking-rules-dormitory — baseline **5,002 impr / 0.2% / pos 8.6**. Was thin (4 content H2s); +5 fan-out H2s + 2 FAQs (title already CTR-fixed 07-06, so ranking play only). EN+6 langs, `updated`→07-12. Success = pos 8.6 → ≤ ~6 (page 1) after re-crawl; watch impressions/clicks. Commit 0abd35f2.
- **CTR retitle:** gnwl-vs-rlwl-vs-pqwl-waitlist-confirmation-chances — baseline **1,212 impr / 0.2% / pos 8.7**. Title tightened 71→53 ch ("…Which Waitlist Confirms Fastest?"); body saturated so title-only. Target ≥0.6% CTR, pos within ±1.5. (Also a page-2 ranking issue — retitle is the cheap lever; watch position too.) EN+6 langs, frontmatter only. Commit bbd00eab.

## Addendum — 2026-07-22 batch #2 (signal-driven triage; re-check on the same dates)
- **EXPAND(ranking)+CTA(funnel):** irctc-current-availability-explained (25,071 impr / 0.79% CTR / pos 6.7, +2 H2s + 2 FAQs), irctc-ticket-booking-limits-aadhaar-verification (11,804 impr / 0.40% CTR / pos 5.9, +2 H2s + 2 FAQs), jan-shatabdi-express-timings-routes-tatkal-rules (2,868 impr / 0.66% CTR / pos 5.0, +2 H2s + 2 FAQs), amrit-bharat-express-routes-booking-rules-fares (1,333 impr / 0.90% CTR / pos 5.5, +2 H2s + 2 FAQs).
- **CTR retitle + EXPAND + CTA:** irctc-vikalp-scheme-explained (2,383 impr / 0.08% CTR severe bleeder / pos 8.4 → title "IRCTC Vikalp Scheme 2026: Rules, Alternate Train Allocation & Refund" + 2 H2s + 2 FAQs). Target ≥0.5% CTR, pos within ±1.5.


## Addendum — 2026-07-23 batch (signal-driven triage; re-check on the same dates)
- **CTR retitle + EXPAND + CTA:**
  - irctc-auto-upgradation-rules-secrets (8,367 impr / 1.34% CTR / pos 7.3 → title "IRCTC Auto Upgradation Rules 2026: Free Upgrades & Meaning" + 2 H2s + 2 FAQs). Target ≥1.8% CTR, pos within ±1.5.
  - travel-sleeper-ac-class-general-platform-ticket (6,854 impr / 0.82% CTR / pos 5.6 → title "Sleeper Travel with General Ticket: Fines & Rules 2026" + 2 H2s + 2 FAQs). Target ≥1.4% CTR, pos within ±1.5.
  - train-classes-explained-1a-2a-3a-3e-sleeper-chair-car (6,054 impr / 0.26% CTR / pos 8.3 → title "Train Classes Explained 2026: 1A, 2A, 3A, 3E, SL & CC Fares" + 2 H2s + 2 FAQs). Target ≥0.8% CTR, pos within ±1.5.
  - irctc-retiring-room-booking-rules-dormitory (5,002 impr / 0.22% CTR severe bleeder / pos 8.6 → title "IRCTC Retiring Room & Dormitory Rules 2026: Booking & Rates" + top CTA blockquote + 2 H2s + 2 FAQs). Target ≥0.7% CTR, pos within ±1.5.
  - irctc-app-vs-website-tatkal-booking (5,339 impr / 1.16% CTR / pos 6.1 → title "IRCTC App vs Website Tatkal Booking: Speed & OTP Rules 2026" + 2 H2s + 2 FAQs). Target ≥1.6% CTR, pos within ±1.5.


## Addendum — 2026-07-27 batch #2 (signal-driven triage; re-check on the same dates)
- **EXPAND(ranking)+CTA(funnel):** irctc-current-availability-explained (25,071 impr / 0.79% CTR / pos 6.7, #1 impr post, + top CTA + 2 H2s + 2 FAQs), irctc-ticket-booking-limits-aadhaar-verification (11,804 impr / 0.40% CTR / pos 5.9, #2 impr post, + top CTA + 2 H2s + 2 FAQs), irctc-vikalp-scheme-explained (2,383 impr / 0.08% CTR severe bleeder / pos 8.4, + top CTA + 2 H2s + 2 FAQs), gnwl-vs-rlwl-vs-pqwl-waitlist-confirmation-chances (1,252 impr / 0.16% CTR severe bleeder / pos 8.7, + top CTA + 2 H2s + 2 FAQs).
- **CTR retitle + REFRESH + CTA:** irctc-cancellation-refund-rules-tdr-guide (748 impr / 0.13% CTR / pos 9.0 → frontmatter title fix "IRCTC Cancellation & Refund Rules 2026: TDR & Refund Timelines" + top CTA + 2 H2s + 2 FAQs). Target ≥0.5% CTR, pos within ±1.5.
- **CTR retitle + EXPAND + CTA:** ultimate-tatkal-booking-guide-speed-hacks (78 impr / 0.00% CTR / pos 7.7 → title "Tatkal Booking Speed Hacks 2026: AC & Non-AC Master List Rules" + top CTA + 2 H2s + 2 FAQs). Target ≥0.8% CTR, pos ≤ 5.5.

## Check-back dates
- **2026-08-03 (~4 wks):** early read. Confirm new titles are live in SERP (spot-check). First CTR/position movement in GSC. PostHog: CTA clicks flowing?
- **2026-09-01 (~8 wks):** full read. CTR delta per page vs baseline table above; decide keep / iterate / revert per guardrail. PostHog funnel numbers for the 6 CTA pages.

To re-measure: get a fresh GSC 28-day Pages export (or live GSC via connected Chrome) and diff CTR/position against the baseline table; pull PostHog for CTA-link and /chart-vacancy referral events.

