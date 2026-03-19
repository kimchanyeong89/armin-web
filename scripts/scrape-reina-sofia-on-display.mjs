/**
 * Scrape Reina Sofia "on display" artwork slugs via Playwright.
 * The search page is JS-rendered (Gatsby/React), uses click-based pagination.
 *
 * URL: https://www.museoreinasofia.es/en/search/?q=&bundle=artwork&exposed=exposed&hasImage=true
 * Expected: ~818 on-display artworks (24 per page, ~35-67 pages)
 * Output: public/data/reina-sofia-on-display.json  — array of slug strings
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(__dirname, '..', 'public', 'data', 'reina-sofia-on-display.json');

const SEARCH_URL = 'https://www.museoreinasofia.es/en/search/?q=&bundle=artwork&exposed=exposed&hasImage=true';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function extractCurrentPageSlugs(page) {
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll('a[href*="/collections/artwork/"]')]
      .map(a => a.getAttribute('href'))
  );
  const slugs = [];
  for (const href of hrefs) {
    const m = href && href.match(/\/collections\/artwork\/([^/?#"']+)/);
    if (m) slugs.push(m[1].replace(/\/+$/, ''));
  }
  return slugs;
}

async function dismissCookieBanner(page) {
  try {
    // Accept/close the OneTrust cookie consent banner
    const acceptBtn = await page.$('#onetrust-accept-btn-handler, button[id*="accept"], #accept-recommended-btn-handler');
    if (acceptBtn) {
      await acceptBtn.click();
      await sleep(1000);
    } else {
      // Try clicking "Reject all" or "X" close if available
      const rejectBtn = await page.$('#onetrust-reject-all-handler, .onetrust-close-btn, #close-pc-btn-handler');
      if (rejectBtn) {
        await rejectBtn.click();
        await sleep(1000);
      } else {
        // Dismiss by removing the overlay via JS
        await page.evaluate(() => {
          const sdk = document.querySelector('#onetrust-consent-sdk');
          if (sdk) sdk.remove();
          const filter = document.querySelector('.onetrust-pc-dark-filter');
          if (filter) filter.remove();
        });
        await sleep(500);
      }
    }
  } catch (e) {
    // Best-effort — ignore dismissal errors
  }
}

async function main() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
  });
  const page = await ctx.newPage();

  const allIds = new Set();
  let pageNum = 1;

  try {
    console.log('Loading search page...');
    await page.goto(SEARCH_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(2000);

    // Dismiss cookie consent popup if present
    await dismissCookieBanner(page);
    await sleep(500);

    while (true) {
      // Wait for artwork cards
      await page.waitForSelector('a[href*="/collections/artwork/"]', { timeout: 15000 }).catch(() => null);
      await sleep(1000);

      // Extract slugs from current page
      const slugs = await extractCurrentPageSlugs(page);
      let newCount = 0;
      for (const slug of slugs) {
        if (!allIds.has(slug)) { allIds.add(slug); newCount++; }
      }
      const currentUrl = page.url();
      console.log(`Page ${pageNum} [${currentUrl.slice(-30)}]: ${slugs.length} artworks, ${newCount} new. Total: ${allIds.size}`);

      // Look for "next page" link (rel="next" in the Pagination component)
      const hasNext = await page.evaluate(() => {
        const nextLink = document.querySelector('a[rel="next"]');
        return nextLink !== null;
      });

      if (!hasNext) {
        console.log('No more pages, done.');
        break;
      }

      // Click the next page link - use evaluate to trigger the click event properly on React element
      await page.evaluate(() => {
        const nextLink = document.querySelector('a[rel="next"]');
        if (nextLink) nextLink.click();
      });

      // Wait for page content to change (URL changes or new network requests complete)
      const prevUrl = page.url();
      let urlChanged = false;
      for (let i = 0; i < 15; i++) {
        await sleep(1000);
        const newUrl = page.url();
        if (newUrl !== prevUrl) {
          urlChanged = true;
          console.log(`URL changed: ${newUrl.slice(-50)}`);
          break;
        }
      }
      if (!urlChanged) {
        console.log('URL did not change after click, stopping');
        break;
      }

      // Wait for network to settle after navigation
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
      await sleep(1000);

      pageNum++;
      if (pageNum > 100) {
        console.log('Hit max pages (100), stopping');
        break;
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }

  const ids = [...allIds];
  console.log(`\nTotal unique on-display IDs: ${ids.length}`);

  fs.writeFileSync(OUT_FILE, JSON.stringify(ids, null, 2));
  console.log(`Saved to ${OUT_FILE}`);
}

main().catch(console.error);
