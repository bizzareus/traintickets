---
name: lastberth-daily-audit
description: Runs the scheduled ConfirmTkt-versus-LastBerth General-quota discrepancy audit, captures original screenshots, creates a readable carousel, and publishes one verified post to @lastberth.in. Use for the daily OpenCode social-media job, audit-only runs, or login checks.
---

# LastBerth daily audit — OpenCode only

## Approved configuration

- This Mac, using OpenCode's scheduler plugin and OpenAI `openai/gpt-6-astra` with OpenCode's existing stored API credential.
- Daily 11am UK local time. The Mac is configured for Europe/London; the scheduler uses the Mac's calendar and follows BST/GMT. It catches up after sleep. The Mac must be logged in and online. Do not change the system timezone.
- @lastberth.in only, at most one daily post. No match means no post.
- Rotate NDLS→PNBE, ANVT→PPTA, CSMT→PNBE, HWH→PURI; journey dates 1–5 days ahead using India time. `control.mjs begin` provides the exact rotated targets.

## Start

Run commands from the current OpenCode working directory. Scheduled runs use the self-contained workspace at `/Users/kartikarora/.local/share/opencode/lastberth-social/workspace`, outside macOS's protected Documents folder.

1. `node automation/instagram-audit/control.mjs ensure-browser` opens/reuses dedicated local Chrome at port 19444. Use ONLY `lastberth-browser` MCP tools. This profile retains Instagram sign-in. Never control unrelated Chrome windows.
2. For `login-check`: list ALL existing Instagram tabs and reuse the authenticated tab. An old tab may still show a stale login form after another tab signed in; reload it or inspect the other Instagram tab before concluding authentication is missing. Verify the account via its own profile controls, not a public profile. Return AUTH_REQUIRED only after checking the current session. Leave any challenge open for the human. Do not ask for passwords, read cookies or post. Stop here.
   Minimize private data: extract only sidebar/profile-control account labels or the account-switch dialog. Do not dump the personal feed, stories, suggestions, notifications or login-field values. Prefer a small evaluate_script result over a whole-page verbose snapshot for account checks.
3. For `audit-only`: `node automation/instagram-audit/control.mjs begin --draft`. Otherwise `node automation/instagram-audit/control.mjs begin`. If it returns `already_started`, stop. Record the returned runDir and targets. All reports/scripts/images go there; no app/source edits.
4. Read `references/audit.md` beside this skill and execute the audit. Use the MCP's list_pages/new_page/navigate_page/take_snapshot/evaluate_script/click/resize_page/take_screenshot tools. Keep at most three working tabs open and reuse them. Preserve the Instagram login tab.

## Browser and rendering

Set both sites to 1280×800 using resize_page. Identify target train cards from the DOM, not guessed CSS selectors. Wait for real results and for every LastBerth scan to finish. Prefer native MCP tool interactions.

For image generation, installed packages are in `automation/instagram-audit/node_modules`. An artifact script can import modules using:

```js
import { createRequire } from 'node:module';
import { join } from 'node:path';
const require = createRequire(join(process.cwd(), 'automation/instagram-audit/package.json'));
const sharp = require('sharp');
const { chromium } = require('playwright');
```

Run generated scripts only with `node <absolute-runDir>/script.mjs`. Use apply_patch to create those scripts using absolute artifact paths; do not try to write application files. To use Playwright, connectOverCDP('http://127.0.0.1:19444'), reuse the existing context, then disconnect. Do not launch or close the user's other browser. On this Retina Mac, use Playwright screenshot option `scale: 'css'` to get exact 1280px evidence and 1080×1350 exports; the physical devicePixelRatio may otherwise double dimensions.

Render a static SVG/HTML image with a Node script. NEVER build or photograph an interactive renderer with file inputs, upload controls or slide-switch buttons. Do not take screenshots of a screenshot-preview tool. Show only the target train card, not surrounding trains, and never crop off a train number or status. Do not duplicate the same modal merely to fill space. Headings may use DIN Condensed; body text Arial. Read every exported PNG and explicitly check for editor controls, incorrect crops, low contrast, missing class-change text, and wrong dimensions before accepting it. An approved layout reference is available at `/Users/kartikarora/.gstack/projects/bizzareus-traintickets/designs/split-ticket-comparison-2026/`; reuse its editorial design, never its historical numbers/screenshots.

## Mandatory final comparison and booking slide

Every carousel must include an additional closing slide showing BOTH original screenshots together: **ConfirmTkt — end-to-end waitlisted** and **LastBerth — available split-ticket options**. This is required in addition to the detailed proof slides, even when the opening slide already compares the results. Keep the complete carousel to 3–4 slides.

- Use readable crops of the actual target train card and the LastBerth breakdown. Place them side by side, or stack them if that makes the statuses easier to read. Preserve the train number, route, journey date, selected classes and availability; never recreate the screenshot UI.
- Headline: **“End-to-end waitlisted?”**
- Prominent booking CTA: **“Find & book confirmed tickets with LastBerth”**, followed by **lastberth.com · Link in bio**.
- Keep a readable qualification on this same slide: **“Split tickets · Subject to live availability”**. Explicitly disclose the class/berth changes required by the demonstrated path. Present the verified example, not a guarantee for every search.
- Open the final exported PNG and verify both screenshots, their platform labels and the booking CTA are visible and legible at phone size. Record its position in report.md and include it last in audit.json's images array.

## Required output

Write `audit.json` in runDir, matching `automation/instagram-audit/validation.mjs`'s auditSchema. Read that file to get exact fields. Use status verified only after completing all checks; otherwise use blocked/no_match, candidate=null and images=[]. The report field is an absolute `report.md` path. Fares are rupees. Every timestamp has an explicit offset. Use actual extracted values, never infer a missing class/quota or substitute nearby stations.

The report includes corridor, date, train, per-class baseline table, contiguous selected legs/times/fares, capture timestamps and both original screenshots. Clearly distinguish mixed-class options from same-class comparisons.

Run `node automation/instagram-audit/control.mjs validate <runDir>`. If it rejects the evidence, correct it using fresh browser evidence or record blocked and stop. Never bypass the validator.

## Publish

For audit-only, record draft_ready and stop without opening Create or Share.

For daily mode, read `references/publish.md` and follow it in the dedicated local browser. Before final Share:

1. Verify the signed-in account is lastberth.in, not merely a public profile page.
2. Recheck both sites and every selected leg. Update screenshots/JSON/images if any data changed, then rerun validation.
3. `node automation/instagram-audit/control.mjs reserve <runDir>` MUST succeed. It validates freshness again, rejects drafts, and atomically prevents the same train/route/date or daily post from being attempted twice.
4. Click Share at most once. Verify the resulting account/post/caption/carousel and permalink.
5. `node automation/instagram-audit/control.mjs finish <runDir> <instagram-permalink>` records success. For an ambiguous result, `node automation/instagram-audit/control.mjs record <runDir> uncertain "reason"`; never retry that candidate automatically.

For login/challenge/no-match/other blockers use `control.mjs record <runDir> auth_required|blocked|no_match "reason"`, then stop. No paid boosts, DMs, likes, follows, ticket purchases or subscription actions.

Finish the OpenCode session with: run status, route/date/train, verification summary, output paths, and Instagram permalink only when verified published. Report blockers plainly. No human approval question should be raised inside an unattended run.
