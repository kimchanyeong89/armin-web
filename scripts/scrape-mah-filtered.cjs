const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

const OUTPUT_FILE = path.resolve(__dirname, '../public/data/mah-collection.json');
const BACKUP_FILE = path.resolve(__dirname, `../public/data/mah-collection-${Date.now()}.json`);

const BASE_URLS = [
  'https://www.mahmah.ch/collection/recherche?f%5B0%5D=artwork_property%3A%C5%92uvres%20avec%20images&f%5B1%5D=collections%3A57484',
  'https://www.mahmah.ch/collection/recherche?f%5B0%5D=artwork_property%3A%C5%92uvres%20avec%20images&f%5B1%5D=collections%3A57499'
];

const PROGRESS_FILE = path.resolve(__dirname, '../downloads/mah-progress.json');
const MAX_PAGES = Number(process.env.MAX_PAGES || 2000);
const DELAY_MS = Number(process.env.DELAY_MS || 800);

const RETRY_LIMIT = Number(process.env.RETRY_LIMIT || 3);
const HEADLESS = process.env.HEADLESS ? process.env.HEADLESS !== '0' : true;
const DEBUG = process.env.DEBUG === '1';

const ITEMS_PER_PAGE = Number(process.env.ITEMS_PER_PAGE || 20);
const LOAD_MORE_TIMEOUT_MS = Number(process.env.LOAD_MORE_TIMEOUT_MS || 25000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toAbsoluteUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `https://www.mahmah.ch${url}`;
}

async function fetchAjaxPage(page, meta, category = 'Painting') {
  return page.evaluate(async (payload) => {
    const params = new URLSearchParams({
      view_name: payload.viewName,
      view_display_id: payload.viewDisplayId,
      view_dom_id: payload.viewDomId,
      view_args: payload.viewArgs || '',
      view_path: payload.viewPath || 'collection/recherche',
      page: String(payload.pageIndex),
      _drupal_ajax: '1'
    });

    const res = await fetch('https://www.mahmah.ch/views/ajax', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: params.toString(),
      credentials: 'same-origin'
    });

    if (!res.ok) {
      return { ok: false, status: res.status };
    }

    const data = await res.json();
    return { ok: true, data };
  }, meta);
}

async function extractItemsFromPage(page) {
  return page.evaluate(() => {
    const toAbsolute = (value) => {
      if (!value) return '';
      if (/^https?:\/\//i.test(value)) return value;
      return `https://www.mahmah.ch${value}`;
    };

    const rows = Array.from(document.querySelectorAll('.mah-artwork'));
    return rows
      .map((el) => {
        const id = (el.getAttribute('data-id') || '').trim();
        const anchor = el.querySelector('.artwork-title a');
        const imageEl = el.querySelector('img.mah-picture__image');
        const title = (anchor?.textContent || '').trim();
        const link = toAbsolute(anchor?.getAttribute('href') || '');
        const image = toAbsolute(imageEl?.getAttribute('src') || imageEl?.getAttribute('data-src') || '');
        const artist = (el.querySelector('.author')?.textContent || '').trim();
        const date = (el.querySelector('.date .field--name-field-ph-date-display')?.textContent || '').trim();

        if (!id || !title || !link || !image) return null;
        return {
          id,
          title,
          artist,
          date,
          image,
          link,
          source: "Musee d'Art et d'Histoire Geneve",
          category: payload.category || 'Painting'
        };
      })
      .filter(Boolean);
  }, { ...meta, category });
}

async function loadBasePageWithRetry(page, baseUrl, attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    const title = await page.title();
    if (!title.includes('Erreur 500')) return true;
    await sleep(1500 + i * 500);
  }
  return false;
}

function extractItems(html, itemCategory = 'Painting') {
  const $ = cheerio.load(html);
  const items = [];

  $('.mah-artwork').each((_, el) => {
    const $el = $(el);
    const id = $el.attr('data-id') || '';
    const title = $el.find('.artwork-title a').text().trim();
    const link = $el.find('.artwork-title a').attr('href') || '';
    const image = $el.find('img.mah-picture__image').attr('src') || '';
    const artist = $el.find('.author').text().trim();
    const date = $el.find('.date .field--name-field-ph-date-display').first().text().trim();

    if (!id || !title || !image || !link) return;

    items.push({
      id,
      title,
      artist,
      date,
      image: toAbsoluteUrl(image),
      link: toAbsoluteUrl(link),
      source: "Musee d'Art et d'Histoire Geneve",
      category: itemCategory
    });
  });

  return items;
}

async function scrapeBase(browserPage, baseUrl, sharedSeen = null, sharedAll = null, category = 'Painting') {
  const collected = [];
  const seen = sharedSeen || new Set();
  const allRef = sharedAll || collected;

  console.log(`Starting base URL: ${baseUrl}`);

  const loaded = await loadBasePageWithRetry(browserPage, baseUrl);
  if (!loaded) {
    const html = await browserPage.content();
    const debugFile = path.resolve(__dirname, '../debug-mah-filtered.html');
    fs.writeFileSync(debugFile, html);
    throw new Error(`Failed to load filtered page after retries. Debug saved to ${debugFile}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const meta = await browserPage.evaluate(() => {
    const fromWindow = window.drupalSettings || null;
    const settingsEl = document.querySelector('[data-drupal-selector="drupal-settings-json"]');
    let settings = fromWindow;
    if (!settings && settingsEl) {
      try {
        settings = JSON.parse(settingsEl.textContent);
      } catch {
        settings = null;
      }
    }
    if (!settings) return null;

    const views = settings?.views?.ajaxViews || {};
    const entries = Object.values(views);
    const target = entries.find((entry) => entry?.view_base_path === 'collection/recherche') || entries[0];
    if (!target) return null;

    return {
      viewDomId: target.view_dom_id || '',
      viewName: target.view_name || '',
      viewDisplayId: target.view_display_id || '',
      viewArgs: target.view_args || '',
      viewPath: target.view_path || '',
      debugViews: views
    };
  });

  if (!meta || !meta.viewDomId || !meta.viewName || !meta.viewDisplayId) {
    const html = await browserPage.content();
    const debugFile = path.resolve(__dirname, '../debug-mah-filtered.html');
    fs.writeFileSync(debugFile, html);
    throw new Error(`Failed to extract Drupal view metadata from page. Debug saved to ${debugFile}`);
  }

  if (DEBUG) {
    const debugSettings = path.resolve(__dirname, '../debug-mah-filtered-settings.json');
    fs.writeFileSync(debugSettings, JSON.stringify(meta.debugViews, null, 2));
  }

  const totalCount = await browserPage.evaluate(() => {
    const title = document.querySelector('.search-artworks-title')?.textContent || '';
    const m = title.match(/\((\d+)\)/);
    return m ? Number(m[1]) : 0;
  });

  const estimatedPages = Math.max(1, Math.ceil((totalCount || 0) / ITEMS_PER_PAGE));
  console.log(`Detected total_count=${totalCount}, estimated_pages=${estimatedPages}`);

  const mergeFromDom = async () => {
    const items = await extractItemsFromPage(browserPage);
    for (const item of items) {
      const key = item.link || item.id;
      if (seen.has(key)) continue;
      item.category = category;
      seen.add(key);
      collected.push(item);
      // Also add to shared allRef so interim checkpoint saves include new items
      if (allRef !== collected) allRef.push(item);
    }
  };

  await mergeFromDom();
  let stallCount = 0;

  for (let clickIndex = 0; clickIndex < MAX_PAGES; clickIndex += 1) {
    if (totalCount > 0 && seen.size >= totalCount) break;

    try {
      const beforeCount = await browserPage.evaluate(() => document.querySelectorAll('.mah-artwork').length);
      const clicked = await browserPage.evaluate(() => {
        const btn = document.querySelector('a.mah-button--load-more, [data-drupal-views-infinite-scroll-pager] a');
        if (!btn) return false;
        btn.click();
        return true;
      });

      if (!clicked) break;

      try {
        await browserPage.waitForFunction(
          (prev) => document.querySelectorAll('.mah-artwork').length > prev,
          { timeout: LOAD_MORE_TIMEOUT_MS },
          beforeCount
        );
      } catch {
        stallCount += 1;
        if (stallCount <= 5 || stallCount % 5 === 0) {
          console.log(`  stall detected (count=${stallCount}) at click=${clickIndex + 1}`);
        }
        if (stallCount >= 3) {
          const reloaded = await loadBasePageWithRetry(browserPage, baseUrl, 3);
          if (!reloaded) break;
        }
        continue;
      }

      const beforeUnique = seen.size;
      await mergeFromDom();
      if (seen.size === beforeUnique) {
        stallCount += 1;
        if (stallCount >= 5) break;
      } else {
        stallCount = 0;
      }

      if ((clickIndex + 1) % 10 === 0 || (totalCount > 0 && seen.size >= totalCount)) {
        console.log(`  clicks=${clickIndex + 1}, unique_items=${allRef.length}/${totalCount || '?'}`);
        // Save progress checkpoint
        const dir = path.resolve(__dirname, '../downloads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ items: allRef, savedAt: new Date().toISOString() }, null, 2));
        // Also interim output save
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allRef, null, 2));
      }

      if (DELAY_MS) await sleep(DELAY_MS);
    } catch (err) {
      const message = String(err && err.message ? err.message : err);
      if (/Execution context was destroyed|Cannot find context with specified id|Target closed/i.test(message)) {
        console.log(`  transient browser context reset detected at click=${clickIndex + 1}; reloading...`);
        const reloaded = await loadBasePageWithRetry(browserPage, baseUrl, 3);
        if (!reloaded) break;
        await mergeFromDom();
        continue;
      }
      throw err;
    }
  }

  console.log(`Completed base URL with ${collected.length} items`);

  return collected;
}

async function main() {
  // Load existing progress for resume
  let existingItems = [];
  const existingIds = new Set();
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const p = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      existingItems = p.items || [];
      existingItems.forEach(it => existingIds.add(it.link || it.id));
      console.log(`Resuming from ${existingItems.length} saved items`);
    } catch (e) { console.log('Could not load progress, starting fresh'); }
  } else if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const prev = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      existingItems = Array.isArray(prev) ? prev : [];
      existingItems.forEach(it => existingIds.add(it.link || it.id));
      console.log(`Loaded ${existingItems.length} items from existing output for resume`);
    } catch (e) { console.log('Could not load existing output'); }
  }

  const browser = await puppeteer.launch({
    headless: HEADLESS ? 'new' : false,
    protocolTimeout: 120000,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (['image', 'media', 'font'].includes(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });

  const all = [];
  const seen = new Set();

  // Pre-seed from existing progress
  for (const it of existingItems) {
    const key = it.link || it.id;
    if (!seen.has(key)) { seen.add(key); all.push(it); }
  }
  console.log(`Starting with ${all.length} pre-loaded items`);

  const CATEGORY_MAP = [
    { url: BASE_URLS[0], category: 'Painting' },
    { url: BASE_URLS[1], category: 'Drawing' }
  ];

  for (const { url, category } of CATEGORY_MAP) {
    const items = await scrapeBase(page, url, seen, all, category);
    for (const item of items) {
      const key = item.link || item.id;
      if (seen.has(key)) continue;
      item.category = category;
      seen.add(key);
      all.push(item);
    }
  }

  await page.close();
  await browser.close();

  if (all.length === 0) {
    console.error('No items scraped. Aborting write.');
    process.exitCode = 1;
    return;
  }

  if (fs.existsSync(OUTPUT_FILE)) {
    fs.copyFileSync(OUTPUT_FILE, BACKUP_FILE);
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(all, null, 2));
  console.log(`Saved ${all.length} items to ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exitCode = 1;
});
