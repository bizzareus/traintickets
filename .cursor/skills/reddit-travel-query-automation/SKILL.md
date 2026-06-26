---
name: reddit-travel-query-automation
description: >-
  Fetches recent Reddit travel-query comments from r/indianrailways threads,
  classifies confirmation intent, extracts origin/destination/date/class/train from
  text and ticket screenshots, runs LastBerth segment searches (UI screenshot OR
  direct backend API) for WL/RAC/PQWL confirmation questions, and drafts short
  tone-matched replies pointing users to last-minute berths + chart-prep alerts.
  Use when automating Reddit travel queries, LastBerth replies, reddit-gtm, or
  indianrailways megathread comment triage.
---

# Reddit travel query automation

Automate triage of **r/indianrailways** travel-query comments (especially the megathread). Only run **LastBerth** for comments asking whether a ticket will **confirm** (WL/RAC/PQWL/CNF).

## Quick start

```
Task progress:
- [ ] 1. Fetch last N comments from thread URL
- [ ] 2. For each comment: classify intent
- [ ] 3. Extract travel fields (text + images)
- [ ] 4. If confirmation intent → LastBerth check (API fast-path or UI screenshot)
- [ ] 5. Draft short tone-matched reply per comment
- [ ] 6. Emit per-comment report (template below)
```

> **Environment note (Cowork / Claude in Chrome):** `WebFetch` is blocked for
> `reddit.com`, `preview.redd.it`, and `i.redd.it`, and Claude-in-Chrome refuses
> to *navigate* to those domains. The reliable paths are the same-origin XHR
> snippets below (run inside an already-open tab on the right origin). See
> [reference.md](reference.md) for the copy-paste snippets.

**Inputs (defaults):**
- Thread: `https://www.reddit.com/r/indianrailways/comments/1lovrfq/travel_queries_thread_for_all_questions_related/`
- `N` comments: user-specified (e.g. 10), sorted **newest last** in output unless user asks otherwise
- LastBerth: `https://lastberth.com/`
- Today’s date: use runtime date for “tomorrow” / “today” resolution

**Fetch comments (preferred order):**
1. **Same-origin XHR from an open reddit.com tab** (most reliable in Cowork). With a `reddit.com` tab open, run a *synchronous* XHR (the in-page JS executor does not await Promises) against `…/.json?sort=new&limit=50` and map out `id, author, created_utc, body, media_metadata`. Snippet in [reference.md](reference.md).
2. Run `node .cursor/skills/reddit-travel-query-automation/scripts/fetch-reddit-comments.mjs <thread-url> <count>`
3. Backend sync (when API is up): `POST /api/admin/reddit-gtm/sync` then read DB entries

Do **not** retry `WebFetch`/curl on reddit — it is blocklisted; go straight to the tab-XHR path.

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

**Image extraction:** Read ticket screenshots for route, date, class, passenger statuses. Train number is often absent — match by **departure time + origin** on LastBerth results. PNR screenshots usually DO show the train name + number (e.g. "SADBHAVANA EXP (14015)"), origin/dest with codes, date, class ("AC 3 Economy (3E)"), and per-passenger booking status (RLWL/9 → current RLWL/4).

> **Getting the image bytes** (reddit image domains are blocked for navigation/WebFetch): in the open reddit.com tab, `fetch()` the `preview.redd.it` URL → draw to a `<canvas>` → `toDataURL('image/jpeg', 0.5)` → return the base64. If the return is large it auto-saves to a tool-result file; decode it to a real image with a local process (`python3 base64.b64decode`) and then read it. Downscale to ~620px wide to keep it legible but small. Snippet in [reference.md](reference.md).

Reuse project GPT schemas when backend is available: `RedditGptService.parseGTMDetails` / `parseTravelQuery` in `backend/src/reddit-automation/reddit-gpt.service.ts`.

## Step 4 — LastBerth (confirmation intent only)

You have two paths. **Use the API fast-path to get availability/chance data; use the UI only when the user explicitly wants the live popup screenshot.**

### 4a — API fast-path (preferred for data, batch-friendly)

From an open `lastberth.com` tab, call the backend (CORS allows the lastberth origin) with a synchronous XHR:

- Station codes: `GET {BACKEND}/api/booking-v2/stations/suggest?q={name}`
- Train + availability: `GET {BACKEND}/api/booking-v2/trains/search?from={CODE}&to={CODE}&date={YYYY-MM-DD}`
- Segment popup detail (optional): `GET {BACKEND}/api/booking-v2/alternate-paths/stream`

`{BACKEND}` = `https://backend-production-11a50.up.railway.app` (read it live from `performance.getEntriesByType('resource')` if it changes).

`trains/search` → `data.trainList[]`. Match your train by `trainNumber`. Per train read:
- `availabilityCache[CLASS]` → `.availability` (e.g. `RLWL5/WL4`), `.prediction` (e.g. `"72% Chance"`), `.fare`
- `newAlternates[CLASS]` → the **last-minute / split-trip** strategy (`altText1` = chance, `altText2` = fare, `segments[]` = per-leg AVL/WL). This is the "last-minute berths" angle for the reply.

One XHR per route returns every class at once — far faster than the UI. See [reference.md](reference.md) for the batch loop snippet.

### 4b — UI screenshot path

Use when the user wants the actual lastberth.com popup image. See [reference.md](reference.md) for UI steps. Summary:

1. Open `https://lastberth.com/`
2. **From** / **To**: type station code, select from autocomplete
3. **Departure date**: open picker, select day
4. **Search trains**
5. **Match train**: by train number if known; else match departure time + origin from screenshot
6. Click **Find in {class}** for stated class; if missing use **Search all classes**
7. Wait for dialog (up to ~20s), **screenshot the popup** (alternate-path legs)
8. Attach screenshot to that comment in the report

**Interpret results briefly:** note direct WL/Regret vs segment AVL, any waitlisted middle legs, total fare if shown.

> **Screenshot persistence caveat (Cowork):** `save_to_disk` on the Claude-in-Chrome screenshot does **not** persist in this environment, and `html2canvas` is **CSP-blocked** on lastberth.com. To produce a shareable image, rebuild the availability as a self-contained styled HTML card (data from the API) and deliver that — see the report file this skill emits. Don't burn time trying to file-save the live popup.

## Step 5 — Draft reply (per intentful comment)

Write a reply the user can paste under the comment. Rules:
- **1–2 lines, short and crisp.** No preamble, no sign-off.
- **Match the commenter's tone** (terse "will it cnf??" → casual; structured form post → concise/factual; polite "pls help" → warm).
- **State the chance** from LastBerth (e.g. "2A ~72%") and, if relevant, a safer class (e.g. "3A's safer at ~73%").
- **Mention last-minute berths** available on **lastberth.com** (the segment/split `newAlternates`).
- **Mention chart-prep alerts** they can subscribe to ("set an alert" / "you'll get pinged when one frees up").
- Never invent numbers — only use the LastBerth values pulled in Step 4.

Example (casual): *"Decent shot — LastBerth has 3E ~60% and you're ahead of the queue (3A's safer at ~73%). Last-minute berths open near chart prep; grab those or set an alert on lastberth.com."*

## Step 6 — Output template

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
**LastBerth:** {train matched} / {class searched} / {key finding + chance %} / {last-minute (alternate) option}
**Reply (paste-ready):** {1–2 line tone-matched reply}
[Screenshot or styled availability card attached]
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
