const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const BASE_URL = 'https://egyptianmuseumcairo.eg';
const LIST_URL = `${BASE_URL}/artefacts/`;
const OUTPUT_JSON = path.join(__dirname, '../public/data/egyptian-museum-cairo-collection.json');
const OUTPUT_CSV = path.join(__dirname, '../public/data/egyptian-museum-cairo-collection.csv');

const MAX_PAGES = Number(process.env.MAX_PAGES || 30);
const HEADLESS = process.env.HEADLESS ? process.env.HEADLESS !== '0' : true;

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function toAbsoluteUrl(url) {
  const u = cleanText(url);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/')) return `${BASE_URL}${u}`;
  return `${BASE_URL}/${u.replace(/^\/+/, '')}`;
}

function toCsvValue(value) {
  return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
}

function writeCsv(rows) {
  const headers = [
    'id',
    'museum',
    'museumId',
    'title',
    'artist',
    'year',
    'category',
    'medium',
    'description',
    'onDisplay',
    'image',
    'sourceUrl',
  ];
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push([
      row.id,
      row.museum,
      row.museumId,
      row.title,
      row.artist,
      row.year,
      row.category,
      row.medium,
      row.description,
      row.onDisplay,
      row.image,
      row.sourceUrl,
    ].map(toCsvValue).join(','));
  }
  fs.writeFileSync(OUTPUT_CSV, lines.join('\n'));
}

function backupIfExists(filePath) {
  if (!fs.existsSync(filePath)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.bak-${stamp}`;
  fs.copyFileSync(filePath, backupPath);
}

async function collectListingLinks(page) {
  return page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/artefacts/"]'))
      .map((a) => a.getAttribute('href'))
      .filter(Boolean);
    return links;
  });
}

async function extractDetail(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const data = await page.evaluate(() => {
    const text = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const og = (key) => document.querySelector(`meta[property="${key}"]`)?.getAttribute('content') || '';
    const tw = (key) => document.querySelector(`meta[name="${key}"]`)?.getAttribute('content') || '';

    const title = text(og('og:title')) || text(document.querySelector('h1')?.innerText);
    const image = text(og('og:image')) || text(tw('twitter:image'));

    let description = '';
    const content = document.querySelector('.entry-content, .elementor-widget-theme-post-content, article');
    if (content) {
      const p = content.querySelector('p');
      if (p) description = text(p.innerText);
    }

    let fallbackImage = '';
    if (!image) {
      const img = document.querySelector('img[class*="wp-image-"]') || 
                  document.querySelector('.elementor-widget-image img') ||
                  (content ? content.querySelector('img') : null);
      if (img) {
          const src = img.getAttribute('src');
          if (src && !src.includes('logo') && !src.includes('WhatsApp')) {
              fallbackImage = text(src);
          }
      }
    }

    return {
      title,
      image: image || fallbackImage,
      description,
    };
  });

  const slug = cleanText(url.split('/').filter(Boolean).pop() || 'item');
  const imageUrl = toAbsoluteUrl(data.image);
  if (!data.title || !imageUrl) return null;

  return {
    id: `egyptian-cairo-${slug}`,
    museum: 'The Egyptian Museum in Cairo',
    museumId: 'egyptian-museum-cairo',
    title: cleanText(data.title).replace(/\s*\|\s*The Egyptian Museum.*$/i, ''),
    artist: 'Unknown',
    year: '',
    category: 'Artefact',
    medium: '',
    description: cleanText(data.description),
    onDisplay: true,
    image: imageUrl,
    sourceUrl: url,
  };
}

async function scrape() {
  console.log('[egyptian-cairo] Launching browser...');
  const browser = await puppeteer.launch({
    headless: HEADLESS ? 'new' : false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const listPage = await browser.newPage();
  await listPage.setViewport({ width: 1400, height: 900 });
  await listPage.setRequestInterception(true);
  listPage.on('request', (req) => {
    if (['image', 'media', 'font'].includes(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });

  const detailUrls = new Set();
  let lastCount = 0;

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum += 1) {
    const url = pageNum === 1 ? LIST_URL : `${LIST_URL}page/${pageNum}/`;
    console.log(`[egyptian-cairo] Listing ${pageNum}: ${url}`);
    await listPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const links = await collectListingLinks(listPage);

    let added = 0;
    for (const link of links) {
      const absolute = toAbsoluteUrl(link);
      if (!/\/artefacts\//i.test(absolute)) continue;
      if (/\/artefacts\/page\//i.test(absolute)) continue;
      if (detailUrls.has(absolute)) continue;
      detailUrls.add(absolute);
      added += 1;
    }

    if (added === 0 && detailUrls.size === lastCount) {
      console.log('[egyptian-cairo] No new links, stopping pagination.');
      break;
    }
    lastCount = detailUrls.size;
  }

  await listPage.close();

  const list = Array.from(detailUrls);
  console.log(`[egyptian-cairo] Detail URLs: ${list.length}`);

  const items = [];
  for (let i = 0; i < list.length; i += 1) {
    const url = list[i];
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'media', 'font'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    try {
      const item = await extractDetail(page, url);
      if (item) items.push(item);
    } catch (err) {
      console.warn(`[egyptian-cairo] Failed ${url}: ${err.message}`);
    } finally {
      await page.close();
    }

    if ((i + 1) % 10 === 0) {
      console.log(`[egyptian-cairo] Progress ${i + 1}/${list.length} (items ${items.length})`);
    }
  }

  await browser.close();

  const deduped = [];
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.sourceUrl)) continue;
    seen.add(item.sourceUrl);
    deduped.push(item);
  }

  if (deduped.length === 0) {
    throw new Error('No items scraped. Aborting write.');
  }

  backupIfExists(OUTPUT_JSON);
  backupIfExists(OUTPUT_CSV);

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(deduped, null, 2));
  writeCsv(deduped);

  console.log(`[egyptian-cairo] Done. ${deduped.length} items`);
  console.log(`[egyptian-cairo] JSON: ${OUTPUT_JSON}`);
  console.log(`[egyptian-cairo] CSV: ${OUTPUT_CSV}`);
}

scrape().catch((err) => {
  console.error('[egyptian-cairo] Fatal:', err);
  process.exitCode = 1;
});
