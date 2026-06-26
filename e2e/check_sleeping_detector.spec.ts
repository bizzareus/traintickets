import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test('scan sleeping hours blog post', async ({ page }) => {
  test.setTimeout(180000);

  const blogPath = '/Users/kartikarora/Documents/personal/traintickets/content/blog/indian-railways-sleeping-hours-middle-berth-rules.md';
  if (!fs.existsSync(blogPath)) {
    throw new Error(`Blog file not found at ${blogPath}`);
  }

  const rawContent = fs.readFileSync(blogPath, 'utf-8');
  const lines = rawContent.split('\n');

  // Strip frontmatter if present
  let fmCount = 0;
  let proseLines = [];
  for (const line of lines) {
    if (line.trim() === '---') {
      fmCount++;
      continue;
    }
    if (fmCount < 2) {
      // Still inside frontmatter
      continue;
    }
    proseLines.push(line);
  }

  // Clean the markdown to get pure prose
  const cleanProseLines = proseLines.map(line => {
    const trimmed = line.trim();
    // Exclude headers
    if (trimmed.startsWith('#')) return '';
    // Strip bold/italic formatting, links, and bullet points
    return trimmed
      .replace(/^[\s\-*\d\.]+\s+/, '') // Remove bullet points or numbers at start
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Strip bold
      .replace(/\*([^*]+)\*/g, '$1') // Strip italic
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1'); // Strip links
  }).filter(line => line.trim().length > 0);

  const cleanText = cleanProseLines.join('\n').trim();
  const words = cleanText.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  console.log(`Total prose words for scanning: ${wordCount}`);

  // Split into 2 halves
  const midIndex = Math.floor(wordCount / 2);
  const firstHalf = words.slice(0, midIndex).join(' ');
  const secondHalf = words.slice(midIndex).join(' ');

  const halves = [firstHalf, secondHalf];

  // Save the text halves for debugging/inspection
  const scratchDir = '/Users/kartikarora/.gemini/antigravity/brain/e054a9f7-8950-4d7d-b9b2-06c27a4f2399/scratch';
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }
  fs.writeFileSync(path.join(scratchDir, 'blog_text_half_1.txt'), firstHalf);
  fs.writeFileSync(path.join(scratchDir, 'blog_text_half_2.txt'), secondHalf);

  const results = [];

  for (let i = 0; i < halves.length; i++) {
    console.log(`Scanning Half ${i + 1} (${halves[i].split(/\s+/).length} words)...`);

    await page.goto('https://quillbot.com/ai-content-detector', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    try {
      const acceptCookies = page.locator('#onetrust-accept-btn-handler');
      await acceptCookies.waitFor({ state: 'visible', timeout: 6000 });
      console.log('Accepting cookies...');
      await acceptCookies.click({ force: true });
      await page.waitForTimeout(1500);
    } catch (e) {
      console.log('Cookie banner not found or click timed out. Continuing...');
    }

    // Double check if cookie consent is still there and remove it manually if needed
    await page.evaluate(() => {
      document.getElementById('onetrust-consent-sdk')?.remove();
      const darkFilter = document.querySelector('.onetrust-pc-dark-filter');
      darkFilter?.remove();
      const banner = document.querySelector('.ot-sdk-container');
      banner?.remove();
    });

    const editor = page.locator('#aidr-input-editor');
    await editor.waitFor({ state: 'visible' });

    // Paste text
    await page.evaluate((text) => {
      const el = document.getElementById('aidr-input-editor');
      if (el) {
        el.focus();
        el.innerText = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
      }
    }, halves[i]);
    await page.waitForTimeout(2000);

    // Click detect
    const detectBtn = page.locator('[data-testid="aidr-primary-cta"], [data-testid="aidr-lite-redirect-cta"]').first();
    await detectBtn.click({ force: true });
    
    console.log('Clicked Detect AI. Waiting for analysis (30s)...');
    await page.waitForTimeout(30000);

    const screenshotName = `blog_half_${i + 1}.png`;
    const screenshotPath = path.join(scratchDir, screenshotName);
    await page.screenshot({ path: screenshotPath });
    console.log(`Screenshot saved to: ${screenshotPath}`);

    // Copy to the main artifacts folder
    const artifactPath = path.join('/Users/kartikarora/.gemini/antigravity/brain/e054a9f7-8950-4d7d-b9b2-06c27a4f2399', `sleeping_validation_half_${i + 1}.png`);
    fs.copyFileSync(screenshotPath, artifactPath);

    const pageText = await page.innerText('body');
    let aiPercent = 'Unknown';
    const match = pageText.match(/(\d+)%\s*of text is likely AI/i);
    if (match) {
      aiPercent = match[1];
    } else {
      const lines = pageText.split('\n');
      for (let j = 0; j < lines.length; j++) {
        if (lines[j].includes('of text is likely AI') && j > 0) {
          aiPercent = lines[j-1].trim().replace('%', '');
          if (aiPercent === '') {
            aiPercent = lines[j-2].trim().replace('%', '');
          }
          break;
        }
      }
    }
    console.log(`Half ${i + 1} AI Score: ${aiPercent}%`);
    results.push(aiPercent);
  }

  fs.writeFileSync(
    path.join(scratchDir, 'blog_results.json'),
    JSON.stringify({ results, wordCount }, null, 2)
  );
});
