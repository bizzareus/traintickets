---
name: reddit-travel-query-automation
description: >-
  Fetches recent Reddit travel-query comments from r/indianrailways threads,
  classifies confirmation intent, extracts origin/destination/date/class/train from
  text and ticket screenshots, and runs LastBerth.com segment searches with
  screenshots for WL/RAC/PQWL confirmation questions. Use when automating Reddit
  travel queries, LastBerth replies, reddit-gtm, or indianrailways megathread
  comment triage.
---

# Reddit travel query automation

Automate triage of **r/indianrailways** travel-query comments (especially the megathread). Only run **LastBerth** for comments asking whether a ticket will **confirm** (WL/RAC/PQWL/CNF).

## Quick start

```
Task progress:
- [ ] 1. Fetch last N comments from thread URL
- [ ] 2. For each comment: classify intent
- [ ] 3. Extract travel fields (text + images)
- [ ] 4. If confirmation intent → LastBerth search + screenshot
- [ ] 5. Emit per-comment report (template below)
```

**Inputs (defaults):**
- Thread: `https://www.reddit.com/r/indianrailways/comments/1lovrfq/travel_queries_thread_for_all_questions_related/`
- `N` comments: user-specified (e.g. 10), sorted **newest last** in output unless user asks otherwise
- LastBerth: `https://lastberth.com/`
- Today’s date: use runtime date for “tomorrow” / “today” resolution

**Fetch comments (preferred order):**
1. Run `node .cursor/skills/reddit-travel-query-automation/scripts/fetch-reddit-comments.mjs <thread-url> <count>`
2. If shell Reddit JSON is blocked (HTML/403), use **browser CDP** `fetch()` on `https://old.reddit.com/.../thread/.json?limit=500&sort=new` from an open tab
3. Backend sync (when API is up): `POST /api/admin/reddit-gtm/sync` then read DB entries

## Step 1 — Fetch comments

Flatten all `t1` comments recursively, sort by `created_utc`, take last `N`.

Keep per comment: `id`, `author`, `body`, `created_utc`, `permalink`, `parent_id`, image URLs (`preview.redd.it` / `i.redd.it`).

Download ticket images via `https://i.redd.it/<filename>` when preview URLs fail.

## Step 2 — Classify intent

| Intent | Run LastBerth? | Signals |
|--------|----------------|---------|
| **confirmation** | **Yes** | WL/RAC/PQWL/CNF/regret, “will it confirm”, “chances”, ticket screenshot, “can we travel” with waitlist |
| compensation / delay | No | missed connection, TDR, reimbursement, train delayed |
| advice / reply | No | moderator reply, “try lastberth.com”, thank-you, follow-up in same sub-thread |
| general booking | No | how to book tatkal, refund rules, no status question |

Skip LastBerth when the comment **already embeds a LastBerth screenshot** (advice, not a new query).

## Step 3 — Extract travel fields

Fill this table for every comment (use `—` when unknown):

| Field | Notes |
|-------|-------|
| **origin** | Station code preferred (NDLS, CSMT, NZM). Resolve city names to IRCTC codes. |
| **destination** | Station code preferred |
| **travel date** | `YYYY-MM-DD`. Resolve “tomorrow” from runtime date. |
| **seat class** | SL, 3A, 2A, 1A, 3E, CC, etc. |
| **train number** | 5-digit number when stated |
| **current status** | e.g. RAC 25, PQWL/1, WL 16 (from text or screenshot) |

**Image extraction:** Read ticket screenshots for route, date, class, passenger statuses. Train number is often absent — match by **departure time + origin** on LastBerth results.

Reuse project GPT schemas when backend is available: `RedditGptService.parseGTMDetails` / `parseTravelQuery` in `backend/src/reddit-automation/reddit-gpt.service.ts`.

## Step 4 — LastBerth (confirmation intent only)

See [reference.md](reference.md) for UI steps. Summary:

1. Open `https://lastberth.com/`
2. **From** / **To**: type station code, select from autocomplete
3. **Departure date**: open picker, select day
4. **Search trains**
5. **Match train**: by train number if known; else match departure time + origin from screenshot
6. Click **Find in {class}** for stated class; if missing use **Search all classes**
7. Wait for dialog (up to ~20s), **screenshot the popup** (alternate-path legs)
8. Attach screenshot to that comment in the report

**Interpret results briefly:** note direct WL/Regret vs segment AVL, any waitlisted middle legs, total fare if shown.

## Step 5 — Output template

For each comment:

```markdown
### {n}. u/{author} — {ISO timestamp}
**Intent:** {confirmation | compensation | advice | other}
**Link:** {permalink}

| Field | Value |
|-------|-------|
| Origin | … |
| Destination | … |
| Travel date | … |
| Seat class | … |
| Train number | … |
| Current status | … |

**Summary:** 1–2 sentences on what they want.

{If confirmation intent:}
**LastBerth:** {train matched} / {class searched} / {key finding}
[Screenshot attached]
```

End with a summary table: which comments got LastBerth vs skipped (and why).

## Automation paths in this repo

| Path | When |
|------|------|
| **Cursor agent + browser MCP** | Interactive/automation runs, screenshots in chat |
| **Admin UI** | `/admin/reddit-gtm` — sync thread, process per comment |
| **API** | `POST /api/admin/reddit-gtm/sync`, `POST /api/admin/reddit-gtm/process/:id` |
| **Cron** | `RedditAutomationService.handleCron()` (commented `@Cron` in service) |

Backend screenshot path uses Puppeteer + injected alt-path data (`screenshot.service.ts`). Agent path uses live LastBerth UI — preferred when user wants the **popup screenshot** exactly as shown on lastberth.com.

## Additional resources

- UI details & CDP snippets: [reference.md](reference.md)
- Worked example (10 comments): [examples.md](examples.md)
