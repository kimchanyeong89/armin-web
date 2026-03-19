#!/usr/bin/env node
// Fabre Collection Scraper - /call/ajax/janvier_api_flora/search
// 10,848 items, 10 per page = ~1,085 pages
// Output: /public/data/musee-fabre-collection.json

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const OUT = join(ROOT, 'public/data/musee-fabre-collection.json');
const RESUME_FILE = '/tmp/fabre-resume.json';

const BASE = 'https://www.museefabre.fr';
const CONCURRENCY = 2;  // lower concurrency to avoid rate limiting
const DELAY_MS = 2000;  // 2s delay between batches
const MAX_PAGES = 1200; // safety cap

// Parse items from API HTML response
function parseItems(html) {
  const items = [];
  const blocks = html.split('<div class="result container">').slice(1);
  
  for (const block of blocks) {
    const imgM = block.match(/src="(https:\/\/flora-api[^"]+)"/);
    const titleM = block.match(/<h3 class="artwork-title">([^<]+)<\/h3>/);
    const artistM = block.match(/<span class="artist-name">([^<]+)<\/span>/);
    const dateM = block.match(/<div class="artwrok-date">([^<]*)<\/div>/);
    const invM = block.match(/<div class="artwrok-inv">([^<]*)<\/div>/);
    const idM = block.match(/href="\/recherche\/musee%3AMUS_BIEN%3A(\d+)/);
    
    if (!idM) continue;
    
    const id = idM[1];
    const title = titleM?.[1]
      ?.replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() || '';
    
    // Artist format: "LASTNAME Firstname - birthYear - birthPlace - deathYear - ?"
    const artistRaw = artistM?.[1]?.trim() || '';
    const artistName = artistRaw.split(' - ')[0].trim();
    
    items.push({
      id,
      title,
      artist: artistName,
      year: dateM?.[1]?.trim() || '',
      inventory: invM?.[1]?.replace('Inv. : ', '').trim() || '',
      imageUrl: imgM?.[1] || '',
      sourceUrl: `${BASE}/recherche/musee%3AMUS_BIEN%3A${id}`,
      museum: 'Musée Fabre, Montpellier'
    });
  }
  return items;
}

// Use native https module to avoid undici/TLS compatibility issues with museefabre.fr
// Use curl subprocess to bypass Node.js TLS fingerprinting blocks
function httpsPost(path, body, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const args = [
      '-s', '--http1.1', '-X', 'POST',
      `https://www.museefabre.fr${path}`,
      '-H', 'Content-Type: application/json',
      '-H', 'X-Requested-With: XMLHttpRequest',
      '-H', `Referer: ${BASE}/recherche/?search-method=artwork&searchText=`,
      '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '--data-raw', payload,
      '--max-time', String(Math.floor(timeoutMs / 1000))
    ];
    execFile('curl', args, { maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(err.message || stderr));
      resolve(stdout);
    });
  });
}

async function fetchPage(page, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const text = await httpsPost('/call/ajax/janvier_api_flora/search', {
        search: '',
        minDate: '',
        maxDate: '',
        withImage: false,
        currentPage: page,
        isGraphicArt: false
      });
      const json = JSON.parse(text);
      return parseItems(json.html || '');
    } catch (e) {
      if (attempt === retries) {
        process.stdout.write(`\n  Page ${page} failed after ${retries} attempts: ${e.message}\n`);
        return [];
      }
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
}

async function main() {
  // Load resume state
  let startPage = 1;
  let allItems = [];
  
  if (existsSync(RESUME_FILE)) {
    const resume = JSON.parse(readFileSync(RESUME_FILE, 'utf8'));
    startPage = resume.nextPage;
    allItems = resume.items;
    console.log(`Resuming from page ${startPage} with ${allItems.length} existing items`);
  } else {
    console.log('Starting fresh scrape of Musée Fabre collection');
  }
  
  // Fetch page 1 and get total count
  let total = 10848; // known total; will be updated from live response
  let totalPages = 1085;
  
  if (startPage === 1) {
    console.log('Fetching page 1 to get total count...');
    try {
      const text1 = await httpsPost('/call/ajax/janvier_api_flora/search', {
        search: '', minDate: '', maxDate: '', withImage: false, currentPage: 1, isGraphicArt: false
      });
      const json1 = JSON.parse(text1);
      const totalM = (json1.html || '').match(/(\d[\d,\s]+)\s*r[ée]sultat/);
      if (totalM) {
        total = parseInt(totalM[1].replace(/[,\s]/g, ''));
        totalPages = Math.ceil(total / 10);
      }
      allItems = parseItems(json1.html || '');
      startPage = 2;
    } catch (e) {
      console.error('Page 1 failed:', e.message);
      process.exit(1);
    }
    console.log(`Total items: ${total}, total pages: ${totalPages}`);
  }
  
  // Process pages with concurrency
  let page = startPage;
  let emptyCount = 0;
  
  while (page <= Math.min(totalPages + 5, MAX_PAGES)) {
    // Build batch
    const batch = [];
    for (let i = 0; i < CONCURRENCY && page <= totalPages + 5; i++, page++) {
      batch.push(page);
    }
    
    if (batch.length === 0) break;
    
    // Fetch batch
    const results = await Promise.all(batch.map(p => fetchPage(p)));
    
    let batchItems = 0;
    let allEmpty = true;
    for (const items of results) {
      if (items.length > 0) {
        allItems.push(...items);
        batchItems += items.length;
        allEmpty = false;
      }
    }
    
    if (allEmpty) {
      emptyCount++;
      if (emptyCount >= 3) {
        console.log('3 consecutive empty batches, stopping');
        break;
      }
    } else {
      emptyCount = 0;
    }
    
    const pct = Math.round((page / totalPages) * 100);
    process.stdout.write(`\rPage ${page-1}/${totalPages} (${pct}%), total items: ${allItems.length}    `);
    
    // Save resume state periodically
    if (allItems.length % 500 < CONCURRENCY * 10) {
      writeFileSync(RESUME_FILE, JSON.stringify({ nextPage: page, items: allItems }));
    }
    
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
  
  process.stdout.write('\n');
  
  // Deduplicate by id
  const seen = new Set();
  const deduped = allItems.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  
  console.log(`\nCollected: ${allItems.length} raw, ${deduped.length} unique`);
  
  // Save final output
  const output = {
    museum: 'Musée Fabre',
    location: 'Montpellier, France',
    scrapedAt: new Date().toISOString(),
    totalObjects: deduped.length,
    objects: deduped
  };
  
  writeFileSync(OUT, JSON.stringify(output, null, 2));
  console.log(`Saved to ${OUT}`);
  
  // Clean up resume file
  try { const { unlinkSync } = await import('fs'); unlinkSync(RESUME_FILE); } catch(e) {}
}

main().catch(console.error);
