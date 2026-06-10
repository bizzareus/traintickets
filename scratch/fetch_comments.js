const { chromium } = require('@playwright/test');
const fs = require('fs');

(async () => {
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  const url = 'https://www.reddit.com/r/indianrailways/comments/1lovrfq/travel_queries_thread_for_all_questions_related/.json';
  console.log(`Navigating to ${url}...`);
  
  try {
    const response = await page.goto(url, { waitUntil: 'networkidle' });
    console.log("Response Status:", response.status());
    
    const text = await page.evaluate(() => document.body.innerText);
    console.log("Fetched raw content length:", text.length);
    
    // Save raw content to a temp file for verification
    fs.writeFileSync('/Users/kartikarora/Documents/personal/traintickets/scratch/raw_reddit.json', text);
    
    const data = JSON.parse(text);
    const comments = [];
    
    function extractComments(commentData) {
      if (!commentData) return;
      if (typeof commentData === 'object') {
        if (commentData.kind === 't1') {
          const dataDict = commentData.data || {};
          comments.push({
            author: dataDict.author,
            body: dataDict.body,
            created_utc: dataDict.created_utc,
            permalink: dataDict.permalink
          });
          extractComments(dataDict.replies);
        } else {
          for (let key in commentData) {
            extractComments(commentData[key]);
          }
        }
      } else if (Array.isArray(commentData)) {
        for (let item of commentData) {
          extractComments(item);
        }
      }
    }
    
    if (Array.isArray(data) && data.length > 1) {
      extractComments(data[1]);
    }
    
    console.log(`Total comments extracted: ${comments.length}`);
    
    // Sort comments by created_utc descending (most recent first)
    comments.sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0));
    
    const latest = comments.slice(0, 2);
    console.log("--- LATEST COMMENTS ---");
    latest.forEach((c, i) => {
      const dt = new Date((c.created_utc || 0) * 1000).toISOString();
      console.log(`Comment #${i+1}:`);
      console.log(`Author: ${c.author}`);
      console.log(`Date: ${dt}`);
      console.log(`Link: https://www.reddit.com${c.permalink}`);
      console.log(`Body:\n${c.body}`);
      console.log("-".repeat(40));
    });
    
  } catch (err) {
    console.error("Error occurred:", err);
  } finally {
    await browser.close();
  }
})();
