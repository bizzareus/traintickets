#!/usr/bin/env node
/**
 * Fetch the last N Reddit comments from a thread JSON URL.
 *
 * Usage:
 *   node .cursor/skills/reddit-travel-query-automation/scripts/fetch-reddit-comments.mjs [thread-url] [count]
 *
 * Examples:
 *   node .cursor/skills/reddit-travel-query-automation/scripts/fetch-reddit-comments.mjs 10
 *   node .cursor/skills/reddit-travel-query-automation/scripts/fetch-reddit-comments.mjs \
 *     "https://www.reddit.com/r/indianrailways/comments/1lovrfq/.../" 10
 */

import { chromium } from '@playwright/test';

const DEFAULT_THREAD =
  'https://www.reddit.com/r/indianrailways/comments/1lovrfq/travel_queries_thread_for_all_questions_related/';

function toJsonUrl(threadUrl, count) {
  const base = threadUrl.replace(/\/?$/, '').replace(/\.json$/, '');
  const oldBase = base.replace('://www.reddit.com', '://old.reddit.com');
  return `${oldBase}/.json?limit=${Math.max(count, 100)}&sort=new`;
}

function flattenComments(children) {
  const out = [];
  for (const child of children ?? []) {
    if (child?.kind !== 't1') continue;
    const c = child.data ?? {};
    out.push({
      id: c.id,
      author: c.author,
      body: c.body,
      created_utc: c.created_utc,
      score: c.score,
      parent_id: c.parent_id,
      permalink: `https://www.reddit.com${c.permalink ?? ''}`,
      imageUrls: extractImageUrls(c.body ?? ''),
    });
    const replies = c.replies;
    if (replies && typeof replies === 'object' && replies.data?.children) {
      out.push(...flattenComments(replies.data.children));
    }
  }
  return out;
}

function extractImageUrls(body) {
  const urls = [];
  const preview = [...body.matchAll(/preview\.redd\.it\/([a-z0-9]+)\.(png|jpe?g)/gi)];
  for (const m of preview) {
    urls.push(`https://i.redd.it/${m[1]}.${m[2].replace('jpg', 'jpeg')}`);
  }
  const direct = [...body.matchAll(/i\.redd\.it\/([^\s)]+)/gi)];
  for (const m of direct) urls.push(`https://i.redd.it/${m[1]}`);
  return [...new Set(urls)];
}

async function main() {
  const arg0 = process.argv[2];
  const arg1 = process.argv[3];
  let threadUrl = DEFAULT_THREAD;
  let count = 10;

  if (arg0 && /^\d+$/.test(arg0)) {
    count = Number(arg0);
  } else if (arg0) {
    threadUrl = arg0;
    if (arg1) count = Number(arg1);
  }

  const jsonUrl = toJsonUrl(threadUrl, count);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    const response = await page.goto(jsonUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (!response?.ok()) {
      throw new Error(`HTTP ${response?.status()} for ${jsonUrl}`);
    }
    const text = await page.evaluate(() => document.body?.innerText ?? '');
    const data = JSON.parse(text);
    const all = flattenComments(data[1]?.data?.children).sort(
      (a, b) => a.created_utc - b.created_utc,
    );
    const lastN = all.slice(-count);
    console.log(JSON.stringify({ total: all.length, count: lastN.length, comments: lastN }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
