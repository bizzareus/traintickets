const { createRequire } = require('node:module');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const projectRequire = createRequire(join(process.cwd(), 'package.json'));
const sharp = projectRequire('sharp');
const { chromium } = projectRequire('playwright');

async function render() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
    const svgUrl = pathToFileURL(join(__dirname, '01-comparison.svg')).href;
    console.log('Loading SVG:', svgUrl);
    await page.goto(svgUrl);

    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.querySelectorAll('image')].map((element) => {
        const image = new Image();
        image.src = new URL(element.getAttribute('href'), document.baseURI).href;
        return image.decode();
      }));
    });

    const overflow = await page.locator('text').evaluateAll((texts) => texts.flatMap((text) => {
      const box = text.getBoundingClientRect();
      return box.left < 0 || box.right > 1080 || box.top < 0 || box.bottom > 1350
        ? [{ text: text.textContent, left: box.left, right: box.right, top: box.top, bottom: box.bottom }] : [];
    }));

    if (overflow.length) {
      throw new Error(`01-comparison.svg: text overflow ${JSON.stringify(overflow)}`);
    }

    const pngPath = join(__dirname, '01-comparison.png');
    await page.screenshot({ path: pngPath });
    console.log(`Rendered ${pngPath} successfully (1080x1350, zero text overflow, crops loaded)`);
  } finally {
    await browser.close();
  }
}

render().catch(err => {
  console.error('Rendering failed:', err);
  process.exit(1);
});
