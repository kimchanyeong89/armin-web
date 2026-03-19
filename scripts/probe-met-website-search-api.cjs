/*
  Probe Met website collection search page network requests to discover
  the internal JSON endpoint used for pagination.

  Usage:
    node scripts/probe-met-website-search-api.cjs

  Env:
    URL=<met search url>
*/

const fs = require('node:fs/promises');

const { chromium } = require('playwright');

const URL_TO_PROBE = process.env.URL ||
  'https://www.metmuseum.org/art/collection/search?material=Paintings&offset=0&showOnly=withImage&showOnly=onDisplay';

const isInterestingUrl = (url) => {
  const u = String(url || '');
  if (!/^https?:\/\//i.test(u)) return false;
  if (!u.includes('metmuseum.org')) return false;
  if (/\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|woff2?|ttf)(?:\?|$)/i.test(u)) return false;
  // keep JS because sometimes it reveals the API base, but deprioritize it
  if (/(?:\bapi\b|\/api\/|graphql|search|collection|listing|results|solr|elastic|_next\/data)/i.test(u)) return true;
  return false;
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    locale: 'en-US',
  });

  const page = await context.newPage();

  const hits = [];

  page.on('request', (req) => {
    const url = req.url();
    if (!isInterestingUrl(url)) return;
    hits.push({
      type: 'request',
      method: req.method(),
      url,
      resourceType: req.resourceType(),
    });
  });

  page.on('response', async (res) => {
    const url = res.url();
    if (!isInterestingUrl(url)) return;

    const ct = (res.headers()['content-type'] || '').toLowerCase();
    const status = res.status();

    const entry = { type: 'response', status, url, contentType: ct };

    // If JSON, try to parse a small snippet for quick identification
    if (ct.includes('application/json')) {
      try {
        const text = await res.text();
        const snip = text.slice(0, 2000);
        entry.bodySnippet = snip;
        try {
          const j = JSON.parse(text);
          entry.jsonTopKeys = j && typeof j === 'object' && !Array.isArray(j) ? Object.keys(j).slice(0, 30) : null;
          entry.jsonType = Array.isArray(j) ? 'array' : typeof j;
          entry.jsonArrayLen = Array.isArray(j) ? j.length : null;
        } catch {
          // ignore
        }
      } catch {
        // ignore
      }
    }

    hits.push(entry);
  });

  console.log('probing:', URL_TO_PROBE);
  await page.goto(URL_TO_PROBE, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // wait a bit for XHR/fetch calls
  await page.waitForTimeout(8000);

  // Some pages load additional data on scroll; do a small scroll
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(3000);

  await browser.close();

  const out = {
    url: URL_TO_PROBE,
    captured: hits,
    interestingUrls: Array.from(new Set(hits.map((h) => h.url))).slice(0, 200),
  };

  await fs.writeFile('debug-met-search-api.json', JSON.stringify(out, null, 2));
  console.log('wrote debug-met-search-api.json');

  // Also print the first few interesting urls for quick glance
  const urls = out.interestingUrls;
  console.log('urls (sample):');
  for (const u of urls.slice(0, 40)) console.log(' -', u);
})();
