# Vande Bharat Sleeper verification, November 3, 2026

## Scope and editorial decision

- User requested the SEO skill, latest operating sleeper-train coverage and matching food-menu updates.
- Refresh the existing sleeper guide and food guide; preserve their slugs and original publication dates, and set `updated` to `2026-11-03`.
- Reader: someone choosing an overnight train and checking terminals, departures, fare and meals before booking.
- Blog workflow changes stay in `content/blog/` and `memory/`. The separately requested menu maintenance updates only content JSON and its existing registry; no application source, database schema or infrastructure changes are needed.

## Fresh signals

GSC extraction succeeded with `npm run gsc:fetch` for October 3–30, 2026. Ran `python3 scripts/seo-weekly-intent-matcher.py --min-imp 150`.

| Signal | Observed value |
| --- | --- |
| Sleeper English page | 7,463 impressions, 66 clicks, 0.88% CTR, average position 6.65 |
| Sleeper pages, seven locales combined | 20,529 impressions, 124 clicks |
| Food English page | 66,155 impressions, 623 clicks, 0.94% CTR, average position 5.24 |
| Food pages, seven locales combined | 79,676 impressions, 678 clicks |
| `vande bharat sleeper trains list` | 569 impressions, one click, position 9.23 |
| `vande bharat sleeper train route list` | 187 impressions, no clicks, position 9.10 |
| `vande bharat food menu` | 836 impressions, one click, position 10.87 |
| `vande bharat food menu price` | 196 impressions, no clicks, position 7.18 |

Modeled CTR headroom for the two route-list queries is approximately 18 additional clicks using the skill's 2.5% position-8–10 benchmark. The intent matcher estimates about 41 additional clicks for the food-menu query using a 5% target CTR; these are opportunity estimates, not forecasts.

PostHog schema discovery confirmed `$pageview`, `$pathname` and `blog_route_cta_clicked`. Ordered 30-day funnels returned:

- All `/blog/` readers to route CTA: 24,766 unique people at step one, 541 converters, 2.18%; median time 49 seconds.
- Sleeper guide readers across locale paths to route CTA: 272 unique people, one converter, 0.37%; median time two seconds. This does not meet the skill's 500-visitor conversion-overhaul threshold.

Google Trends returned a dynamic shell without usable trend statistics; no growth percentage was inferred. Google News was checked, and dated October 30–November 2 coverage supplies the news hook. The normal web-search integration returned no results; Bing exposed the relevant news URL.

## Primary food sources

Downloaded all three PDFs from the current [IRCTC menu index](https://menurates.irctc.co.in/) and extracted them using `pdftotext -layout`.

| Train pair | Source | Verified content boundary |
| --- | --- | --- |
| 27421/27422 | https://menurates.irctc.co.in/PDFFiles/VandeBharat/27421.pdf | Dinner only; no breakfast, meal prices, clock times or class-specific menus |
| 27651/27652 | https://menurates.irctc.co.in/PDFFiles/VandeBharat/27651.pdf | Morning tea, breakfast alternatives and dinner; no prices, clock times or class-specific menus |
| 27575/27576 | https://menurates.irctc.co.in/PDFFiles/VandeBharat/27575.pdf | Morning tea 06:30–08:00; dinner 20:00–22:00, separately labelled Bengali-style outbound and Assamese-style return choices; no prices or weekly rotation schedule |

The 27651 PDF heading prints SMVB–CSMT for the pair, but the operating directions are **27651 CSMT→SMVB** and **27652 SMVB→CSMT**. Do not use header order to reverse the train numbers.

Use one explicitly labelled common-menu grouping for AC sleeper classes, not the earlier non-AC `SL` classification. Do not manufacture premium 1A dishes or convert null prices into zero-priced offers. Shared pair menus are represented in the existing per-train JSON format for each direction so train-number searches work without duplicate registry slugs/React keys; no new alias framework or application changes were introduced.

The [Railway Board onboard-charge circular](https://menurates.irctc.co.in/source/Onboard_charges_Catering_Services_prepaid_trains.pdf) differentiates morning tea from major meal/snack services. Do not call every purchase a flat ₹50 penalty, and do not transfer older chair-car tariffs to the new sleeper menus.

## Timetable, launch and rule provenance

These are **secondary reports quoting Railway Board/railway officials**, not directly retrieved official circulars; the articles say so and direct readers to verify current IRCTC/NTES information.

- [November 2 commercial starts and passenger rules](https://indianexpress.com/article/india/vande-bharat-sleeper-trains-varanasi-delhi-bengaluru-mumbai-10946342/): Varanasi commercial start November 2, Mumbai-origin start November 2, Bengaluru-origin start November 3; integral catering; confirmed-only boarding; reported voluntary cancellation slabs of 25% more than 72h, 50% from 72h to 8h, no fare refund below 8h.
- [Varanasi terminal timetable](https://indianexpress.com/article/india/varanasi-new-delhi-vande-bharat-sleeper-regular-service-ticket-booking-10945126/): 27421 20:50→06:10 next day, no Friday departure; 27422 21:40→07:10 next day, no Saturday departure. Its embedded intermediate timetable has internally inconsistent entries, so only coherent terminal times and stop names were used.
- [Mumbai–Bengaluru timetable](https://indianexpress.com/article/india/bengaluru-mumbai-vande-bharat-sleeper-train-route-stops-timings-10942430/): 27651 20:10→12:00 next day, no Tuesday departure; 27652 19:45→11:55 next day, no Monday departure.
- [Varanasi launch fares](https://indianexpress.com/article/india/varanasi-new-delhi-vande-bharat-sleeper-ticket-booking-begins-check-station-wise-fare-10945246/): 3A ₹1,915; 2A ₹2,470; 1A ₹3,030.
- [Bengaluru launch fares and observed waiting lists](https://indianexpress.com/article/india/bengaluru-mumbai-vande-bharat-sleeper-ticket-booking-waiting-list-10944710/): 3A ₹2,810; 2A ₹3,630; 1A ₹4,450; actual waiting-list bookings reported. Do not claim that confirmed-only boarding means no waiting-list sales.
- [First Howrah–Kamakhya launch](https://indianexpress.com/article/business/vande-bharat-sleeper-pm-modi-flags-first-train-howrah-to-guwahati-10479315/): first sleeper corridor launched in January 2026.

Launch fares are labelled dated reference figures, not live all-inclusive quotes. No universal Tatkal availability, sleeper opt-out saving, speculative operating corridor or blanket late-running meal/refund entitlement is claimed.

## Checks

- Both English articles pass the skill validator with zero errors and warnings, 9 and 8 FAQs respectively; all H2 lead paragraphs contain 40–60 whitespace-delimited words and bold text.
- All 12 regional files were overwritten using the existing targeted `translate_single_file.ts` script, so no stale-file skipping occurred. All 14 articles pass the skill validator without warnings; localised metadata fits 60/160-character budgets, links and tags match English, original dates are preserved, and FAQ parsing/indexability checks pass. Shortened overlong Tamil/Malayalam metadata and corrected Bengali brand spelling and the IRCTC `No Food` label during review.
- Existing blog and menu unit tests: 15 passed.
- Direct loader assertions pass for all six train numbers, route direction, published service counts, AC-only class labels, null unpublished prices, registry inclusion and static-generation inclusion. Registry slugs remain unique, and the existing `vande-bharat-sl-27576` URL still works.
- English article links resolve to existing blog/menu content, all corridor CTAs contain the required station/name/source parameters, and `git diff --check` passes.
- Full backend test run: 78 suites passed, 3 failed, 2 skipped; 955 tests passed, 3 failed, 23 skipped. Failures are in unchanged journey-task retry expectations, split-booking admin-number expectation and the worker-module Jest/ESM import of `@nestjs/observe`.
- Root lint: fails on unchanged source/generated files, 541 errors and 8,372 warnings. No application source files are modified by this content task.
- Changes are local working-tree content updates, not a production deployment.
