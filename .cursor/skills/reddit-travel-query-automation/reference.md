# Reference — Reddit fetch, images, LastBerth UI

## Cowork / Claude-in-Chrome working snippets (verified)

In Cowork the in-page JS executor returns the **last expression synchronously** and does **not** await Promises. So use **synchronous XHR** inside an already-open tab on the correct origin. `reddit.com`, `preview.redd.it`, `i.redd.it` are blocked for WebFetch and Chrome navigation — only the tab-XHR / canvas paths below work.

**1. Fetch newest comments (run in an open `reddit.com` tab):**
```javascript
(function(){
  var x=new XMLHttpRequest();
  x.open('GET','https://www.reddit.com/r/indianrailways/comments/1lovrfq/travel_queries_thread_for_all_questions_related/.json?sort=new&limit=50',false);
  x.setRequestHeader('Accept','application/json'); x.send();
  var j=JSON.parse(x.responseText);
  var c=j[1].data.children.map(function(ch){return ch.data;}).filter(function(d){return d.body;});
  return JSON.stringify(c.map(function(d){return {id:d.id,author:d.author,created:d.created_utc,body:d.body,
    media:d.media_metadata?Object.values(d.media_metadata).map(function(m){return m.s&&m.s.u;}).filter(Boolean):[]};}));
})()
```

**2. Pull a ticket image as base64 (run in the reddit tab; async stored on window, polled):**
```javascript
// call 1 — start
window.__d=false;window.__b=null;
(async function(){var r=await fetch(IMG_URL);var bl=await r.blob();var bm=await createImageBitmap(bl);
 var sc=Math.min(1,620/bm.width),w=Math.round(bm.width*sc),h=Math.round(bm.height*sc);
 var c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(bm,0,0,w,h);
 window.__b=c.toDataURL('image/jpeg',0.5).split(',')[1];window.__d=true;})();'started'
// call 2 — poll: JSON.stringify({d:window.__d,len:window.__b&&window.__b.length})
// call 3 — return window.__b  (if it exceeds the token cap it auto-saves to a tool-result .txt)
```
Then decode the saved/returned base64 to a real file with a local process and read it:
```python
import base64; open('out.jpg','wb').write(base64.b64decode(open('b64.txt').read().strip().strip('"')))
```

**3. LastBerth backend, all classes for a route (run in an open `lastberth.com` tab):**
```javascript
(function(){
  var B='https://backend-production-11a50.up.railway.app';
  function g(u){var x=new XMLHttpRequest();x.open('GET',u,false);x.send();return JSON.parse(x.responseText);}
  var routes=[{from:'ADI',to:'BZA',date:'2026-06-29',tn:'20804'}]; // add more
  return JSON.stringify(routes.map(function(r){
    var j=g(B+'/api/booking-v2/trains/search?from='+r.from+'&to='+r.to+'&date='+r.date);
    var t=(j.data.trainList||[]).find(function(x){return String(x.trainNumber)===r.tn;});
    if(!t) return {tn:r.tn,found:false,onRoute:(j.data.trainList||[]).map(function(x){return x.trainNumber+' '+x.trainName;})};
    var av={};Object.keys(t.availabilityCache||{}).forEach(function(c){var a=t.availabilityCache[c];av[c]={a:a.availability,p:a.prediction,fare:a.fare};});
    return {tn:r.tn,name:t.trainName,avail:av,alternates:t.newAlternates||{}};
  }));
})()
```
Station codes: `GET {B}/api/booking-v2/stations/suggest?q={name}` (first result is usually the Jn).

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
