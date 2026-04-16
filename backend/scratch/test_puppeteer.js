const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching Puppeteer...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  try {
    const page = await browser.newPage();
    console.log('Navigating to IRCTC Online Charts...');
    await page.goto('https://www.irctc.co.in/online-charts/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    console.log('Page loaded!');
    const title = await page.title();
    console.log('Title:', title);
    await page.screenshot({ path: 'irctc_puppeteer_test.png' });
    console.log('Screenshot taken!');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
})();
