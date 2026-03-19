/*
  Local AIC image cache builder (Playwright)

  Why:
  - AIC IIIF image URLs are frequently blocked by Cloudflare challenge (403) when proxied.
  - In some regions/browsers, embedding directly also fails.
  - For local development, it's often simplest to download a small set of thumbnails once
    and serve them from /public/aic-cache/.

  Usage:
    node scripts/cache-aic-images-playwright.cjs

  Options via env:
    LIMIT=50          number of items to cache (default 50)
    WIDTH=900         IIIF width to request (default 900)
    HEADLESS=0        show browser (default 0)
    DATA=public/data/aic-collection.json
    OUT=public/aic-cache

  Notes:
  - If a Cloudflare challenge page appears, solve it in the opened browser window.
    Then the script should continue caching.
*/

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const LIMIT = Number(process.env.LIMIT || 50);
const WIDTH = Number(process.env.WIDTH || 900);
const HEADLESS = String(process.env.HEADLESS || '0') === '1';
const DATA = process.env.DATA || 'public/data/aic-collection.json';
const OUT = process.env.OUT || 'public/aic-cache';

function extractImageId(iiifUrl) {
  if (!iiifUrl || typeof iiifUrl !== 'string') return '';
  const m = iiifUrl.match(/\/iiif\/2\/([^/]+)\//);
  return m ? m[1] : '';
}

function buildIiifThumbUrl(imageId) {
  return `https://www.artic.edu/iiif/2/${imageId}/full/${WIDTH},/0/default.jpg`;
}

async function main() {
  if (!fs.existsSync(DATA)) {
    throw new Error(`Missing DATA file: ${DATA}`);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const items = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const targets = [];

  for (const it of items) {
    const imageId = extractImageId(it.imageUrl || it.image || '');
    if (!imageId) continue;
    const url = buildIiifThumbUrl(imageId);
    const outFile = path.join(OUT, `${imageId}_${WIDTH}.jpg`);
    targets.push({ imageId, url, outFile });
    if (targets.length >= LIMIT) break;
  }

  console.log(`[AIC cache] targets=${targets.length} width=${WIDTH} headless=${HEADLESS ? '1' : '0'}`);

  const userDataDir = path.join('.cache', 'playwright-aic');
  fs.mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: HEADLESS,
    viewport: { width: 1200, height: 800 },
  });

  const page = await context.newPage();
  await page.goto('https://www.artic.edu/', { waitUntil: 'domcontentloaded' });
  console.log('[AIC cache] Opened https://www.artic.edu/');
  console.log('[AIC cache] If you see a Cloudflare check, complete it in the browser.');

  let okCount = 0;
  let failCount = 0;

  for (const t of targets) {
    if (fs.existsSync(t.outFile) && fs.statSync(t.outFile).size > 10_000) {
      continue;
    }

    try {
      const res = await context.request.get(t.url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          Referer: 'https://www.artic.edu/',
        },
      });

      if (!res.ok()) {
        failCount++;
        const ct = res.headers()['content-type'] || '';
        console.warn(`[AIC cache] FAIL ${res.status()} ${ct} ${t.url}`);
        // If we hit a challenge, give the user a moment to solve it.
        if (res.status() === 403) {
          console.warn('[AIC cache] 403 detected. If a challenge is shown, solve it; retrying after short delay...');
          await page.waitForTimeout(3000);
        }
        continue;
      }

      const buf = await res.body();
      if (!buf || buf.length < 10_000) {
        failCount++;
        console.warn(`[AIC cache] Small body (${buf ? buf.length : 0}) ${t.url}`);
        continue;
      }

      fs.writeFileSync(t.outFile, buf);
      okCount++;
      if ((okCount + failCount) % 10 === 0) {
        console.log(`[AIC cache] progress ok=${okCount} fail=${failCount}`);
      }
    } catch (e) {
      failCount++;
      console.warn(`[AIC cache] ERROR ${t.url}:`, e && e.message ? e.message : e);
    }
  }

  console.log(`[AIC cache] done ok=${okCount} fail=${failCount} out=${OUT}`);
  await context.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
