# Bing IndexNow Integration Guide

[IndexNow](https://www.indexnow.org/) is an open protocol used by Bing, Yandex, Seznam, Naver, and other search engines to instantly index new or updated content without waiting for periodic sitemap crawls.

---

## 1. Key Configuration & Hosting

- **API Key:** `b65fef859e24499bb96c752a23b4dfec`
- **Verification File:** `public/b65fef859e24499bb96c752a23b4dfec.txt`
- **Public URL:** `https://lastberth.com/b65fef859e24499bb96c752a23b4dfec.txt`

Search engines fetch this file to verify domain ownership when processing IndexNow submissions for `lastberth.com`.

---

## 2. CLI Submission Tool

You can submit individual URLs or your entire sitemap using the CLI script:

```bash
# Submit specific URLs
npx tsx scripts/submit-indexnow.ts https://lastberth.com/blog/my-new-post

# Submit all URLs from sitemaps
npx tsx scripts/submit-indexnow.ts --sitemap

# Dry-run mode (preview URLs without submitting)
npx tsx scripts/submit-indexnow.ts --sitemap --dry-run
```

---

## 3. Next.js API Route Endpoint

The application provides an API route at `POST /api/indexnow`.

### Submit specific URLs
```json
POST /api/indexnow
Content-Type: application/json

{
  "urls": [
    "https://lastberth.com/blog/pnr-status-guide",
    "https://lastberth.com/chart-vacancy"
  ]
}
```

### Submit all sitemap URLs
```json
POST /api/indexnow
Content-Type: application/json

{
  "sitemap": true
}
```

### Optional Security Secret
If the environment variable `INDEXNOW_SECRET` is set in your environment, send the secret in header:
`x-indexnow-secret: <your-secret>` or `Authorization: Bearer <your-secret>`.

---

## 4. Response Codes Reference

| HTTP Code | Reason | Meaning |
|---|---|---|
| `200` | OK | URL submitted successfully |
| `202` | Accepted | URL received, key location validated |
| `400` | Bad Request | Invalid format |
| `403` | Forbidden | Key not valid or key file missing |
| `422` | Unprocessable Entity | URLs do not match domain host |
| `429` | Too Many Requests | Rate limit reached (potential spam) |

---

## 5. Verification

Check URL indexing status and crawl statistics in [Bing Webmaster Tools](https://www.bing.com/webmasters/).
