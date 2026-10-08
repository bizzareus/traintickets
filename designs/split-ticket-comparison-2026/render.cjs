// Run from the traintickets workspace. Exports use the supplied screenshot pixels.
const { createRequire } = require('node:module');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const projectRequire = createRequire(join(process.cwd(), 'package.json'));
const sharp = projectRequire('sharp');
const { chromium } = projectRequire('playwright');

const sources = {
  lastberth: '/Users/kartikarora/Desktop/Screenshot 2026-09-28 at 7.56.49 PM.png',
  confirmtkt: '/Users/kartikarora/Desktop/Screenshot 2026-09-28 at 7.56.54 PM.png',
};
const crops = [
  ['confirmtkt-logo', 'confirmtkt', 48, 28, 243, 68],
  ['confirmtkt-status', 'confirmtkt', 620, 750, 266, 83],
  ['confirmtkt-card', 'confirmtkt', 594, 308, 1154, 548],
  ['lastberth-modal', 'lastberth', 338, 84, 1300, 1400],
  ['lastberth-leg-1', 'lastberth', 494, 373, 308, 59],
  ['lastberth-leg-2', 'lastberth', 494, 829, 294, 59],
  ['lastberth-leg-3', 'lastberth', 494, 1193, 294, 59],
  ['lastberth-total', 'lastberth', 380, 1354, 350, 67],
];
const slides = ['01-comparison', '02-confirmtkt-proof', '03-lastberth-proof', '04-how-to-book'];

async function render() {
  // Crop coordinates use the 2000px-wide attachment preview; originals are larger.
  const sizes = Object.fromEntries(await Promise.all(Object.entries(sources).map(async ([name, path]) =>
    [name, (await sharp(path).metadata()).width / 2000])));
  await Promise.all(crops.map(([name, source, left, top, width, height]) => {
    const scale = sizes[source];
    const region = Object.fromEntries(Object.entries({ left, top, width, height }).map(([key, value]) =>
      [key, Math.round(value * scale)]));
    return sharp(sources[source]).extract(region).png().toFile(join(__dirname, 'crops', `${name}.png`));
  }));

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
    for (const slide of slides) {
      await page.goto(pathToFileURL(join(__dirname, `${slide}.svg`)).href);
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
          ? [{ text: text.textContent, right: box.right }] : [];
      }));
      if (overflow.length) throw new Error(`${slide}: text overflow ${JSON.stringify(overflow)}`);
      await page.screenshot({ path: join(__dirname, `${slide}.png`) });
      console.log(`${slide}.png: 1080 × 1350; source crops loaded; text within canvas`);
    }
  } finally {
    await browser.close();
  }

  const thumbnails = await Promise.all(slides.map(async (slide, i) => ({
    input: await sharp(join(__dirname, `${slide}.png`)).resize(432, 540).toBuffer(),
    left: 28 + (i % 2) * 460,
    top: 84 + Math.floor(i / 2) * 568,
  })));
  const heading = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="948" height="1220">
    <text x="28" y="38" font-family="Arial, sans-serif" font-size="23" font-weight="700" fill="#101B2C">LASTBERTH / THE SPLIT-TICKET DIFFERENCE</text>
    <text x="28" y="63" font-family="Arial, sans-serif" font-size="16" fill="#536071">Your actual screenshots. Read left to right.</text>
  </svg>`);
  await sharp({ create: { width: 948, height: 1220, channels: 3, background: '#E5EAF1' } })
    .composite([{ input: heading }, ...thumbnails])
    .png().toFile(join(__dirname, 'carousel-preview.png'));
}

render().catch((error) => { console.error(error); process.exitCode = 1; });
