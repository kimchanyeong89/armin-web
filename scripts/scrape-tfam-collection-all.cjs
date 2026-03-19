/*
  Taipei Fine Arts Museum (tfam.museum) — All Collections (6108 items)

  Features:
  - Fetches ALL items (approx 6108).
  - Identifies "Highlights" via MTheme=15,16,17 (verified to match ~118 items, close to user's 119).
  - Supports RESUME (skips detail fetch for existing items).
  - Saves progress to public/data/tfam-collection-all.json

  Usage:
    node ./scripts/scrape-tfam-collection-all.cjs

  Env:
    RESUME=1 (default 0)
    CONCURRENCY=8
    LIMIT=10000
    HIGHLIGHT_THEMES="15,16,17"
*/

const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');
const pLimitImport = require('p-limit');
const pLimit = pLimitImport?.default || pLimitImport;

const BASE = 'https://www.tfam.museum';
const API = `${BASE}/ashx/Collection.ashx?ddlLang=en-us`;
const DETAIL_BASE = `${BASE}/Collection/CollectionDetail.aspx?ddlLang=en-us&CID=`;

const OUT_FILE = path.join(__dirname, '../public/data/tfam-collection-all.json');

const LIMIT = Number(process.env.LIMIT || '10000');
const CONCURRENCY = Number(process.env.CONCURRENCY || '8');
const RESUME = !!process.env.RESUME;
const HIGHLIGHT_THEMES = process.env.HIGHLIGHT_THEMES || '21'; // Collection Highlights (Theme 21) -> 173 items (filtered)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normalizeSpace = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const toAbs = (href, baseUrl) => {
  if (!href) return '';
  try { return new URL(href, baseUrl).toString(); } catch { return ''; }
};

const fetchJsonPost = async (url, obj, { referer } = {}) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; armin-web scraper)',
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/json; charset=utf-8',
      'Origin': BASE,
      ...(referer ? { Referer: referer } : {}),
    },
    body: JSON.stringify(obj),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
};

const fetchText = async (url) => {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (macOS)' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
};

const userMTypes = "Oil Painting,Mixed Media,Sketch,Print,Photography,Design,Watercolor,Ink Painting";

const getCollectionListPage = async ({ pgNum, pgSize, mTheme, keyWord, mType } = {}) => {
  const payload = {
    JJMethod: 'GetCollectionList',
    pg_num: pgNum,
    pg_size: pgSize,
  };
  if (mTheme) payload.MTheme = String(mTheme);
  if (keyWord) payload.KeyWord = String(keyWord);
  if (mType) payload.MType = String(mType);

  const json = await fetchJsonPost(API, payload, { referer: `${BASE}/Collection/CollectionList.aspx?ddlLang=en-us` });
  if (!json || json.Status !== '1') return { data: [], raw: json };
  return { data: Array.isArray(json.Data) ? json.Data : [], raw: json };
};

const getHighlightIds = async () => {
  console.log(`Fetching highlight IDs for themes: ${HIGHLIGHT_THEMES}...`);
  const ids = new Set();
  let page = 1;
  const pageSize = 200;
  while (true) {
    const { data } = await getCollectionListPage({ pgNum: page, pgSize: pageSize, mTheme: HIGHLIGHT_THEMES });
    if (data.length === 0) break;
    data.forEach(d => ids.add(String(d.CID)));
    if (data.length < pageSize) break;
    page++;
  }
  console.log(`Found ${ids.size} highlight IDs.`);
  return ids;
};

const parseArtistName = (display) => {
  const s = normalizeSpace(display);
  const m = s.match(/^(.*?)(\s*\([^)]*\))\s*$/);
  return normalizeSpace(m ? m[1] : s);
};

const parseDetailPage = (html, url) => {
  const $ = cheerio.load(html);
  const title = normalizeSpace($('h2').first().text()) || normalizeSpace($('title').first().text()).replace(/\|.*$/, '').trim();
  const artistDisplay = normalizeSpace($('.titleTheme').first().text());
  const artist = parseArtistName(artistDisplay);
  
  const pairs = {};
  $('li').each((_, li) => {
    const $li = $(li);
    const label = normalizeSpace($li.find('span.h6').first().text());
    if (!label) return;
    $li.find('span.h6').remove();
    const val = normalizeSpace($li.text());
    if (val) pairs[label] = val;
  });

  // Images
  const imgs = $('img').map((_, el) => $(el).attr('src')).get()
    .map(s => toAbs(s, BASE))
    .filter(u => /\/File\/Collection\/Image\//i.test(u) || /\/File\/Collection\//i.test(u));
  const mainImage = imgs[0] || '';
  
  // Dimensions / Medium
  const dimensions = pairs['Dimensions'] || '';
  const medium = pairs['Media Technology'] || pairs['Medium'] || '';
  const category = pairs['Type'] || '';
  const date = pairs['Year'] || pairs['Date'] || '';

  return {
    title,
    artist,
    date,
    category,
    medium,
    dimensions,
    image: mainImage,
    images: imgs,
    sourceUrl: url,
    metadata: { tfam: pairs }
  };
};

(async () => {
  // 1. Load existing
  const existingMap = new Map();
  if (RESUME && fs.existsSync(OUT_FILE)) {
    try {
      const old = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
      if (Array.isArray(old)) {
        old.forEach(i => existingMap.set(String(i.id), i));
      }
      console.log(`Resuming: Loaded ${existingMap.size} existing items.`);
    } catch (e) { console.warn('Failed to load existing file:', e.message); }
  }

  // 2. Highlights
  const highlightIds = await getHighlightIds();

  // 3. Fetch Full List
  console.log('Fetching list with user MType filter...');
  const allCollection = [];
  let page = 1;
  while (true) {
    if (allCollection.length >= LIMIT) break;
    process.stdout.write(`List Page ${page}... `);
    const { data } = await getCollectionListPage({ pgNum: page, pgSize: 200, mType: userMTypes });
    if (data.length === 0) { console.log('Done.'); break; }
    
    data.forEach(d => allCollection.push(d));
    console.log(`Got ${data.length} items. Total: ${allCollection.length}`);
    if (data.length < 200) break;
    page++;
  }

  // 4. Process Details
  console.log(`Processing ${allCollection.length} items with concurrency ${CONCURRENCY}...`);
  const limit = pLimit(CONCURRENCY);
  const results = [];
  let processed = 0;
  let savedCount = 0;

  const tasks = allCollection.slice(0, LIMIT).map((item) => limit(async () => {
    const cid = String(item.CID);
    const detailUrl = `${DETAIL_BASE}${cid}`;
    const isHighlight = highlightIds.has(cid);

    // Reuse existing if available and valid
    if (existingMap.has(cid)) {
      const ex = existingMap.get(cid);
      // Update highlight flag just in case
      ex.isHighlight = isHighlight;
      results.push(ex);
      processed++;
      return;
    }

    // Fetch fresh
    try {
      const html = await fetchText(detailUrl);
      const details = parseDetailPage(html, detailUrl);
      
      const out = {
        id: cid,
        title: details.title || item.Title,
        artist: details.artist || parseArtistName(item.Artist),
        date: details.date || item['年代'] || '',
        category: details.category || item.Type || '',
        medium: details.medium,
        dimensions: details.dimensions,
        image: details.image,
        images: details.images,
        detailUrl,
        sourceUrl: detailUrl,
        isHighlight,
        metadata: {
          tfam: {
            listRow: item,
            ...details.metadata.tfam
          }
        },
        createdAt: new Date().toISOString()
      };
      
      results.push(out);
    } catch (e) {
      console.error(`Error ${cid}: ${e.message}`);
      // Fallback: minimal valid item
      results.push({
        id: cid,
        title: item.Title,
        artist: parseArtistName(item.Artist),
        image: '',
        processed: false,
        isHighlight
      });
    }

    processed++;
    if (processed % 50 === 0) {
      process.stdout.write(`\r[${processed}/${allCollection.length}] `);
      // Save checkpoint
      fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
      savedCount = results.length;
    }
  }));

  await Promise.all(tasks);

  // Final Save
  fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\n\nDone! Saved ${results.length} items to ${OUT_FILE}`);
  console.log(`Highlights count: ${results.filter(r => r.isHighlight).length}`);

})();
