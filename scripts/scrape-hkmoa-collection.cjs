#!/usr/bin/env node
/**
 * Hong Kong Museum of Art (HKMoA) collection scraper via LCSD MCMS portal.
 *
 * Strategy
 * - Use Puppeteer (with stealth) to load the public search portal.
 * - Apply filters:
 *   - Museum = "Hong Kong Museum of Art".
 *   - Show = "Only Record(s) with Images".
 * - Paginate through all result pages and extract row-level metadata.
 * - Optionally, follow each detail link to enrich medium/dimensions, etc. (disabled by default).
 * - Write output JSON to public/data/hkmoa-collection.json.
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const OUT_DIR = path.join(process.cwd(), 'public', 'data');
const OUT_JSON = path.join(OUT_DIR, 'hkmoa-collection.json');

const HEADLESS = String(process.env.HEADLESS || '1') !== '0';
const MAX_PAGES = Math.max(0, Number(process.env.MAX_PAGES || '0') || 0); // 0 = no cap
const FETCH_DETAILS = String(process.env.FETCH_DETAILS || '0') === '1';

const BASE_URL = 'https://mcms.lcsd.gov.hk';
const SEARCH_URL = `${BASE_URL}/Search/search/enquire?&request_locale=en`;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const strip = (s) => String(s || '').replace(/\s+/g, ' ').trim();

async function applyFilters(page) {
  await delay(2000);

  await page.evaluate(() => {
    const doc = document;

    const findLabelFor = (el) => {
      if (!el) return '';
      const id = el.id;
      if (id) {
        const byFor = doc.querySelector(`label[for="${id}"]`);
        if (byFor) return byFor.textContent || '';
      }
      const wrap = el.closest('label');
      if (wrap) return wrap.textContent || '';
      const group = el.closest('.form-group, .field, .row, .col');
      if (group) return group.textContent || '';
      return '';
    };

    const lower = (s) => String(s || '').toLowerCase();

    let museumSelect = null;
    const selects = Array.from(doc.querySelectorAll('select'));
    for (const sel of selects) {
      const labelText = lower(findLabelFor(sel));
      if (labelText.includes('museum')) {
        museumSelect = sel;
        break;
      }
    }

    if (museumSelect) {
      const opts = Array.from(museumSelect.options || []);
      const target = opts.find((o) => lower(o.textContent || '').includes('hong kong museum of art'));
      if (target) {
        museumSelect.value = target.value;
        museumSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    const inputs = Array.from(doc.querySelectorAll('input'));
    for (const input of inputs) {
      const labelText = lower(findLabelFor(input));
      if (labelText.includes('only record') && labelText.includes('image')) {
        if (!input.checked) {
          input.click();
        }
      }
    }

    const clickable = Array.from(doc.querySelectorAll('button, input[type="button"], input[type="submit"], a'));
    const searchBtn = clickable.find((el) => lower(el.textContent || el.value || '').includes('search'));
    if (searchBtn) searchBtn.click();
  });
}

async function extractRows(page) {
  return page.evaluate(() => {
    const out = [];
    const tables = Array.from(document.querySelectorAll('table'));

    const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim();

    for (const table of tables) {
      const rows = Array.from(table.querySelectorAll('tr'));
      if (!rows.length) continue;
      const headerCells = Array.from(rows[0].querySelectorAll('th,td')).map((c) => normalize(c.textContent || ''));
      const headerText = headerCells.join(' ').toLowerCase();
      if (!headerText.includes('object') && !headerText.includes('museum')) continue;

      for (let i = 1; i < rows.length; i++) {
        const tr = rows[i];
        const cells = Array.from(tr.querySelectorAll('td'));
        if (cells.length < 5) continue;

        const thumbCell = cells[0];
        const thumbImg = thumbCell.querySelector('img');
        const thumb = thumbImg ? thumbImg.getAttribute('src') || thumbImg.getAttribute('data-src') : '';

        const titleCell = cells[2] || cells[1] || null;
        const titleLink = titleCell ? titleCell.querySelector('a') : null;
        const title = normalize(titleCell ? titleCell.textContent || '' : '');
        const detailUrl = titleLink ? titleLink.href : '';

        const artist = normalize(cells[3] ? cells[3].textContent || '' : '');
        const period = normalize(cells[4] ? cells[4].textContent || '' : '');
        const museum = normalize(cells[5] ? cells[5].textContent || '' : '');
        const ref = normalize(cells[6] ? cells[6].textContent || '' : '');

        if (!title && !ref) continue;

        out.push({
          thumb,
          title,
          artist,
          period,
          museum,
          ref,
          detailUrl,
        });
      }
    }

    return out;
  });
}

async function extractDetails(page, url) {
  if (!url) return { medium: '', dimensions: '', objectType: '', description: '' };

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
    await delay(1500);
  } catch {
    return { medium: '', dimensions: '', objectType: '', description: '' };
  }

  return page.evaluate(() => {
    const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const out = { medium: '', dimensions: '', objectType: '', description: '' };

    const dlItems = Array.from(document.querySelectorAll('dl, table'));
    for (const block of dlItems) {
      const text = normalize(block.textContent || '');
      if (!text) continue;
      if (!out.medium && /medium|material|technique/i.test(text)) {
        out.medium = text;
      }
      if (!out.dimensions && /dimension|size/i.test(text)) {
        out.dimensions = text;
      }
      if (!out.objectType && /object type|object name/i.test(text)) {
        out.objectType = text;
      }
    }

    const p = document.querySelector('p, .description, .objectDescription');
    if (p) out.description = normalize(p.textContent || '');

    return out;
  });
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: HEADLESS ? 'new' : false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    defaultViewport: { width: 1400, height: 900 },
  });

  const artworks = [];

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );

    console.log('Loading MCMS search portal...');
    await page.goto(SEARCH_URL, { waitUntil: 'networkidle2', timeout: 120000 });

    console.log('Applying filters (Museum = Hong Kong Museum of Art, Only records with images)...');
    await applyFilters(page);

    await delay(5000);

    let pageIndex = 1;

    while (true) {
      await delay(2000);
      const rows = await extractRows(page);
      const hkmoaRows = rows;

      console.log(`Page ${pageIndex}: found ${hkmoaRows.length}/${rows.length} rows`);

      for (const row of hkmoaRows) {
        const id = row.ref || row.title || `hkmoa-${artworks.length + 1}`;

        const rawThumb = row.thumb || '';
        const imageUrl = rawThumb && !/^https?:\/\//i.test(rawThumb)
          ? `${BASE_URL}${rawThumb.replace(/^\.\./, '')}`
          : rawThumb;

        const rawDetail = row.detailUrl || '';
        const detailUrl = rawDetail && !/^https?:\/\//i.test(rawDetail)
          ? `${BASE_URL}${rawDetail.replace(/^\.\./, '')}`
          : rawDetail;

        let details = { medium: '', dimensions: '', objectType: '', description: '' };
        if (FETCH_DETAILS) {
          details = await extractDetails(page, detailUrl);
          await delay(500);
        }

        artworks.push({
          id,
          title: strip(row.title) || 'Untitled',
          artist: strip(row.artist) || 'Unknown',
          period: strip(row.period),
          accessionNumber: strip(row.ref),
          image: imageUrl,
          images: imageUrl ? [imageUrl] : [],
          detailUrl,
          medium: strip(details.medium),
          dimensions: strip(details.dimensions),
          objectType: strip(details.objectType),
          description: strip(details.description),
        });
      }

      if (MAX_PAGES > 0 && pageIndex >= MAX_PAGES) break;

      const hasNext = await page.evaluate(() => {
        const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const links = Array.from(document.querySelectorAll('a'));
        const nextByText = links.find((a) => /^next$|^>$/.test(normalize(a.textContent || '')));
        if (nextByText) {
          nextByText.click();
          return true;
        }
        const pager = links.find((a) => /page|page no|page number/i.test(a.getAttribute('title') || ''));
        if (pager) {
          pager.click();
          return true;
        }
        return false;
      });

      if (!hasNext) break;
      pageIndex += 1;
      await delay(4000);
    }

    artworks.sort((a, b) => String(a.title).localeCompare(String(b.title)));

    await fs.writeFile(OUT_JSON, JSON.stringify(artworks, null, 2) + '\n', 'utf8');
    console.log(`Wrote ${artworks.length} artworks -> ${OUT_JSON}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
