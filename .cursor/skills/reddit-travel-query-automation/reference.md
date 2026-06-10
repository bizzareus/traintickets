# Reference — Reddit fetch, images, LastBerth UI

## Reddit JSON fetch

**Thread JSON URL pattern:**
```
https://old.reddit.com/r/{sub}/comments/{id}/{slug}/.json?limit=500&sort=new
```

**Browser CDP (when curl returns HTML):**
```javascript
fetch('https://old.reddit.com/r/indianrailways/comments/1lovrfq/travel_queries_thread_for_all_questions_related/.json?limit=500&sort=new')
  .then(r => r.json())
  .then(data => {
    function flat(children) {
      let r = [];
      for (const ch of children) {
        if (ch.kind === 't1') {
          const c = ch.data;
          r.push({ id: c.id, author: c.author, body: c.body, created_utc: c.created_utc,
            permalink: 'https://www.reddit.com' + c.permalink, parent_id: c.parent_id });
          if (c.replies?.data) r = r.concat(flat(c.replies.data.children));
        }
      }
      return r;
    }
    const all = flat(data[1].data.children).sort((a,b) => a.created_utc - b.created_utc);
    return JSON.stringify({ total: all.length, lastN: all.slice(-10) });
  });
```

**Image URLs in comment body:** `preview.redd.it/...` → download via `https://i.redd.it/{basename}.png` or `.jpeg`.

**Ticket screenshot fields to read:**
- Origin / destination station names and codes
- Departure date and time (match train when number missing)
- Class (2A, SL, etc.)
- Per-passenger booking/current status (CNF, PQWL/n, RAC n, WL n)
- PNR if visible (do not echo full PNR in public replies)

## LastBerth UI (cursor-ide-browser)

| Step | Action |
|------|--------|
| Stations | Click combobox → type code slowly → wait for listbox → click option |
| Date | Click departure field → click day cell (CDP: find leaf text node `=== '20'`) |
| Search | Click **Search trains**, wait until button leaves "Searching" state |
| Class | Per train row: **Find in 2A** (or stated class) or **Search all classes** |
| Screenshot | `browser_take_screenshot` when dialog shows leg cards |

**Click correct train row via CDP** (avoids wrong ref after scroll):
```javascript
(() => {
  const h = [...document.querySelectorAll('h2')].find(x => x.textContent.includes('12566'));
  if (!h) return 'no heading';
  let card = h.closest('li') || h.parentElement;
  const btn = [...card.querySelectorAll('button')].find(b => b.textContent.trim() === 'Find in 2A');
  if (btn) { btn.scrollIntoView({ block: 'center' }); btn.click(); return 'ok'; }
  return 'btn not found';
})()
```

Replace `12566` and `Find in 2A` as needed.

## Station code hints

| Spoken / written | Code |
|------------------|------|
| Mumbai CST / CSMT | CSMT |
| New Delhi | NDLS |
| Nizamuddin | NZM |
| Gorakhpur | GKP |
| Anand Vihar | ANVT |

## Confirmation vs non-confirmation (edge cases)

- **Partially confirmed group ticket** (1 CNF + 2 PQWL) → confirmation intent → LastBerth
- **“Can 3 travel on one seat if not confirmed?”** → confirmation + travel-rules (LastBerth + note partial-WL boarding policy)
- **Reply linking lastberth.com with screenshot** → advice only, skip LastBerth
- **Train delay / missed connection / TDR** → not confirmation

## Repo integration points

| File | Role |
|------|------|
| `backend/src/reddit-automation/reddit-automation.service.ts` | Sync, AI process, cron |
| `backend/src/reddit-automation/reddit-gpt.service.ts` | GPT extraction schemas |
| `backend/src/browser-use/browser-use.service.ts` | `performLastBerthSearch` (BrowserUse SDK) |
| `backend/src/reddit-automation/screenshot.service.ts` | Puppeteer modal screenshot |
| `app/admin/reddit-gtm/page.tsx` | Manual sync/process UI |
