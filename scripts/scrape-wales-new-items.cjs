#!/usr/bin/env node
/**
 * Wales Museum - Scrape NEW art items (Fine Art works on paper + Drawings)
 * 
 * PHASE 1: Scan grid pages to find UUIDs not already in museum-wales-paintings.json
 * PHASE 2: Visit detail pages for new items - get categories + metadata
 * PHASE 3: Add items with matching categories to the JSON file
 * 
 * Target categories (in addition to existing Painting/Drawing/Watercolour):
 * - "Works on paper" → Fine Art - works on paper
 * - "Print", "Etching", "Engraving", "Lithograph", "Pastel", "Gouache"
 * - "Sketch", "Collage"
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/museum-wales-paintings.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/wales-new-items-progress.json');
const LOG_FILE = path.join(__dirname, '../logs/wales-new-items.log');

const CONCURRENCY = 6;
const DELAY_MS = 300;

const TARGET_CATEGORIES = [
  'Works on paper', 'Fine Art', 'Print', 'Etching', 'Engraving', 'Lithograph',
  'Pastel', 'Gouache', 'Collage', 'Sketch', 'Drawing', 'Watercolour', 'Painting',
  'Aquatint', 'Mezzotint', 'Woodcut', 'Screenprint', 'Monotype', 'Woodblock print'
];

const GRID_BASE_URL = 'https://museum.wales/collections/online/?field0=with_images&value0=1&field1=database&value1=art&view=grid&page=';

const ts = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = msg => {
  const line = '[' + ts() + '] ' + msg;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch(e) {}
};

function fetchHtml(url, retries = 3) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const attempt = (n) => {
      const req = lib.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-GB,en;q=0.9',
        }
      }, res => {
        if (res.statusCode === 429 || res.statusCode === 503) {
          res.resume();
          if (n > 0) { setTimeout(() => attempt(n-1), 5000); return; }
          reject(new Error(`HTTP ${res.statusCode}`)); return;
        }
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      });
      req.on('error', e => { if (n > 0) setTimeout(() => attempt(n-1), 2000); else reject(e); });
      req.setTimeout(25000, () => { req.destroy(); if (n > 0) setTimeout(() => attempt(n-1), 2000); else reject(new Error('timeout')); });
    };
    attempt(retries);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Parse grid page HTML to extract items */
function parseGridPage(html) {
  const items = [];
  // Find all search_result blocks
  const blockRe = /class="search_result[^"]*"[\s\S]*?(?=class="search_result|$)/g;
  // Simpler: find all result_box_image hrefs
  const hrefRe = /href="(\/collections\/online\/object\/([a-f0-9-]{8,})[^"]*)"/g;
  const seen = new Set();
  let m;
  while ((m = hrefRe.exec(html)) !== null) {
    const uuid = m[2];
    if (seen.has(uuid)) continue;
    seen.add(uuid);
    const sourceUrl = `https://museum.wales/collections/online/object/${uuid}/`;
    // Find image URL near this match
    const segment = html.slice(Math.max(0, m.index - 100), m.index + 500);
    const imgMatch = segment.match(/<img[^>]+src="([^"]*museum\.wales[^"]*|\/sites[^"]*|https?:\/\/[^"]*(?:jpg|jpeg|png|gif)[^"]*)"/i);
    let imageUrl = imgMatch ? imgMatch[1] : '';
    if (imageUrl && !imageUrl.startsWith('http')) imageUrl = 'https://museum.wales' + imageUrl;
    // Find title near this match
    const titleMatch = segment.match(/<h3[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
    const title = titleMatch ? titleMatch[1].trim() : '';
    items.push({ id: uuid, title, image: imageUrl, sourceUrl });
  }
  return items;
}

/** Get total pages from the first grid page */
function getTotalPages(html) {
  // Try to find "Page X of Y" or last page link
  const m = html.match(/\/page=(\d+)[^"]*"[^>]*title="Go to last page"/);
  if (m) return parseInt(m[1], 10);
  const m2 = html.match(/page=(\d+)"[^>]*class="[^"]*last/);
  if (m2) return parseInt(m2[1], 10);
  // Count from pager items
  let max = 1;
  const re = /page=(\d+)/g;
  let pm;
  while ((pm = re.exec(html)) !== null) {
    max = Math.max(max, parseInt(pm[1], 10));
  }
  return max;
}

/** Parse detail page for metadata and categories */
function parseDetailPage(html) {
  const result = { artist: '', artistDates: '', year: '', medium: '', dimensions: '', categories: [], accessionNumber: '' };
  
  // Artist from creation_name
  const creatorMatch = html.match(/class="creation_name"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
  if (creatorMatch) {
    const raw = creatorMatch[1].trim();
    if (raw.includes(',')) {
      const parts = raw.split(',');
      const surname = parts[0].trim();
      const forenames = parts.slice(1).join(',').trim();
      result.artist = forenames.replace(/\b[A-Z][a-z]+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
        + ' ' + surname.charAt(0).toUpperCase() + surname.slice(1).toLowerCase();
    } else {
      result.artist = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    }
  }
  
  // Born-died dates
  const bibMatch = html.match(/class="bibliography"[^>]*>([^<]{3,20})<\/div>/);
  if (bibMatch && /\d{4}/.test(bibMatch[1])) result.artistDates = bibMatch[1].trim();
  
  // Techniques (medium)
  const techMatches = html.match(/class="technique"[^>]*>([^<]+)<\/div>/g) || [];
  const skipPatterns = /^(oil painting|watercolour painting|oil on canvas|acrylic painting|gouache painting|fine art|works on paper|drawings|painting|drawing|watercolour|prints|photograph)$/i;
  for (const t of techMatches) {
    const val = (t.match(/class="technique"[^>]*>([^<]+)<\/div>/) || [])[1]?.trim();
    if (val && !skipPatterns.test(val)) { result.medium = val; break; }
  }
  if (!result.medium && techMatches.length > 0) {
    const val = (techMatches[0].match(/class="technique"[^>]*>([^<]+)<\/div>/) || [])[1]?.trim();
    if (val) result.medium = val;
  }
  
  // Dimensions
  const dims = [];
  const measRe = /<strong>([^<]+):<\/strong>\s*([\d.]+)/g;
  let mm;
  while ((mm = measRe.exec(html)) !== null) {
    const label = mm[1].toLowerCase();
    const val = mm[2];
    if (label.includes('height')) dims.push('H: ' + val + ' cm');
    else if (label.includes('width')) dims.push('W: ' + val + ' cm');
    else if (label.includes('depth')) dims.push('D: ' + val + ' cm');
  }
  if (dims.length) result.dimensions = dims.join(', ');
  
  // Accession number
  const accMatch = html.match(/Item Number[\s\S]*?class="object_field_value"[^>]*>([^<]+)<\/div>/);
  if (accMatch) result.accessionNumber = accMatch[1].trim();
  
  // Categories from .object_categories links
  const catSectionIdx = html.indexOf('class="object_categories"');
  if (catSectionIdx >= 0) {
    const catEnd = html.indexOf('</div>', catSectionIdx);
    const catSection = html.slice(catSectionIdx, catEnd > 0 ? catEnd + 6 : catSectionIdx + 2000);
    const linkRe = /<a[^>]*>([^<]+)<\/a>/g;
    let cm;
    while ((cm = linkRe.exec(catSection)) !== null) {
      const cat = cm[1].trim();
      if (cat && cat.length < 80) result.categories.push(cat);
    }
  }
  // Fallback: look for technique/category divs
  if (result.categories.length === 0) {
    const techAll = html.match(/class="technique"[^>]*>([^<]+)<\/div>/g) || [];
    techAll.forEach(t => {
      const val = (t.match(/class="technique"[^>]*>([^<]+)<\/div>/) || [])[1]?.trim();
      if (val) result.categories.push(val);
    });
  }
  
  // Year from Date field
  const dateMatch = html.match(/Item Date[\s\S]*?class="object_field_value"[^>]*>([^<]+)<\/div>/) ||
    html.match(/Date[\s\S]{0,50}class="object_field_value"[^>]*>([^<]{3,20})<\/div>/);
  if (dateMatch) {
    const dateStr = dateMatch[1].trim();
    const yearMatch = dateStr.match(/\b(\d{4})\b/);
    if (yearMatch) result.year = yearMatch[1];
  }
  
  return result;
}

async function withRetry(fn, delay = 400) {
  try { return await fn(); } catch(e) {
    await sleep(delay);
    return await fn();
  }
}

async function runConcurrent(items, worker, concurrency) {
  const q = [...items];
  let active = 0;
  return new Promise((resolve, reject) => {
    const results = [];
    let done = 0;
    const next = () => {
      while (active < concurrency && q.length > 0) {
        const item = q.shift();
        active++;
        worker(item).then(r => {
          results.push(r);
          active--;
          done++;
          next();
          if (done === items.length) resolve(results);
        }).catch(e => {
          results.push({ error: e.message, id: item.id });
          active--;
          done++;
          next();
          if (done === items.length) resolve(results);
        });
      }
    };
    next();
    if (items.length === 0) resolve([]);
  });
}

async function main() {
  log('=== Wales New Items Scraper ===');
  
  // Create log dir
  const logDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  
  // Load existing items
  const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
  const existingIds = new Set(existing.objects.map(o => o.id));
  log(`Existing items: ${existingIds.size}`);
  
  // Load progress
  let progress = { scannedPages: 0, totalPages: 0, newUUIDs: [], processedUUIDs: [] };
  try {
    if (fs.existsSync(PROGRESS_FILE)) progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch(e) {}
  
  const processedIds = new Set(progress.processedUUIDs || []);
  let newUUIDs = progress.newUUIDs || [];
  
  // PHASE 1: Scan grid pages for new UUIDs
  if (progress.scannedPages < (progress.totalPages || 999)) {
    log('PHASE 1: Scanning grid pages...');
    
    if (!progress.totalPages) {
      log('Fetching page 1 to get total pages...');
      const r = await fetchHtml(GRID_BASE_URL + '1');
      const firstItems = parseGridPage(r.body);
      const total = getTotalPages(r.body);
      log(`Total pages: ${total}, Items on first page: ${firstItems.length}`);
      progress.totalPages = total;
      
      // Add new items from first page
      firstItems.forEach(item => {
        if (!existingIds.has(item.id) && !newUUIDs.find(u => u.id === item.id)) {
          newUUIDs.push(item);
        }
      });
      progress.scannedPages = 1;
    }
    
    const startPage = progress.scannedPages + 1;
    for (let pg = startPage; pg <= progress.totalPages; pg++) {
      if (pg % 50 === 0) log(`  Scanning page ${pg}/${progress.totalPages} | new so far: ${newUUIDs.length}`);
      try {
        const r = await fetchHtml(GRID_BASE_URL + pg);
        const items = parseGridPage(r.body);
        items.forEach(item => {
          if (!existingIds.has(item.id) && !newUUIDs.find(u => u.id === item.id)) {
            newUUIDs.push(item);
          }
        });
      } catch(e) {
        log(`  Error page ${pg}: ${e.message}`);
      }
      progress.scannedPages = pg;
      progress.newUUIDs = newUUIDs;
      
      if (pg % 100 === 0) {
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
      }
      await sleep(DELAY_MS);
    }
    
    progress.newUUIDs = newUUIDs;
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    log(`PHASE 1 complete. Found ${newUUIDs.length} new UUIDs`);
  } else {
    log(`PHASE 1 already complete. ${newUUIDs.length} new UUIDs to process`);
  }
  
  // PHASE 2: Visit detail pages for new items
  const toProcess = newUUIDs.filter(item => !processedIds.has(item.id));
  log(`PHASE 2: Processing ${toProcess.length} new items (${processedIds.size} already done)...`);
  
  let addedCount = 0;
  const BATCH = 50;
  
  for (let i = 0; i < toProcess.length; i += BATCH) {
    const batch = toProcess.slice(i, i + BATCH);
    
    const results = await runConcurrent(batch, async (item) => {
      await sleep(Math.random() * DELAY_MS);
      try {
        const r = await withRetry(() => fetchHtml(item.sourceUrl));
        if (r.status !== 200) return { id: item.id, skip: true };
        const meta = parseDetailPage(r.body);
        return { ...item, ...meta };
      } catch(e) {
        return { id: item.id, error: e.message };
      }
    }, CONCURRENCY);
    
    // Filter by target categories and add to existing
    for (const result of results) {
      if (result.error || result.skip) continue;
      processedIds.add(result.id);
      
      const cats = result.categories || [];
      const hasTarget = cats.some(c => TARGET_CATEGORIES.some(t => t.toLowerCase() === c.toLowerCase()));
      
      if (hasTarget) {
        existing.objects.push(result);
        addedCount++;
      }
    }
    
    progress.processedUUIDs = Array.from(processedIds);
    
    if ((i / BATCH) % 5 === 0 || i + BATCH >= toProcess.length) {
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(existing, null, 2));
      log(`  Processed ${Math.min(i + BATCH, toProcess.length)}/${toProcess.length} | added: ${addedCount} | total: ${existing.objects.length}`);
    }
    
    await sleep(DELAY_MS);
  }
  
  // Final save
  existing.totalArtworks = existing.objects.length;
  existing.scrapedAt = new Date().toISOString();
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(existing, null, 2));
  log(`\n=== DONE! ===`);
  log(`New items added: ${addedCount}`);
  log(`Total items now: ${existing.objects.length}`);
}

main().catch(e => {
  log('FATAL: ' + e.message);
  console.error(e);
  process.exitCode = 1;
});
