#!/usr/bin/env node
// Scrape Orangerie artwork detail pages to get objectType
// Then update orangerie-collection.json:
//   - adds category field from artwork_kind
//   - removes items where category is 'archives' or 'photographie'

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '../public/data/orangerie-collection.json');
const CONCURRENCY = 4;
const DELAY_MS = 300; // between batches

const REMOVE_CATEGORIES = ['archives', 'photographie', 'photograph', 'photography'];

async function fetchObjectType(detailUrl) {
  try {
    const res = await fetch(detailUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Find "Object type" section
    const objTypeIdx = html.indexOf('Object type</div>');
    if (objTypeIdx === -1) return null;

    // Find the value div after it
    const valueStart = html.indexOf('<div class="value">', objTypeIdx);
    if (valueStart === -1) return null;
    const valueEnd = html.indexOf('</div>', valueStart + 10);
    if (valueEnd === -1) return null;
    const valueHtml = html.slice(valueStart, valueEnd);

    // Extract href to get artwork_kind
    const kindMatch = valueHtml.match(/artwork_kind%3A([^&"]+)/);
    if (kindMatch) {
      return decodeURIComponent(kindMatch[1]).trim();
    }

    // Fall back: extract text from first <a> tag
    const textMatch = valueHtml.match(/<a[^>]*>\s*([^<\s][^<]*?)\s*<\/a>/);
    if (textMatch) {
      return textMatch[1].trim().toLowerCase();
    }

    return null;
  } catch (e) {
    return null;
  }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  const data = JSON.parse(raw);
  const objects = data.objects || [];
  
  console.log(`Total items: ${objects.length}`);
  
  // Check if any already have category (resume support)
  const alreadyDone = objects.filter(o => o.category !== undefined && o.category !== '').length;
  console.log(`Already have category: ${alreadyDone}`);
  
  const totalBatches = Math.ceil(objects.length / CONCURRENCY);
  let savedCount = 0;
  
  for (let i = 0; i < objects.length; i += CONCURRENCY) {
    const batch = objects.slice(i, i + CONCURRENCY);
    const batchNum = Math.floor(i / CONCURRENCY) + 1;
    
    // Skip if all in batch already have categories
    if (batch.every(o => o.category !== undefined && o.category !== '')) {
      if (batchNum % 50 === 0) {
        process.stdout.write(`\rSkipped to ${i + batch.length}/${objects.length}`);
      }
      continue;
    }
    
    // Fetch types for items that need it
    await Promise.all(batch.map(async (item, batchIdx) => {
      if (item.category !== undefined && item.category !== '') return; // already done
      if (!item.detailUrl) { objects[i + batchIdx].category = ''; return; }
      const objectType = await fetchObjectType(item.detailUrl);
      objects[i + batchIdx].category = objectType || '';
    }));
    
    const doneCount = objects.filter(o => o.category !== undefined).length;
    process.stdout.write(`\rProgress: ${i + batch.length}/${objects.length} | With category: ${doneCount}`);
    
    // Auto-save every 100 items: save ALL objects (preserving unprocessed ones)
    savedCount += batch.length;
    if (savedCount >= 100) {
      savedCount = 0;
      const saveData = { ...data, objects }; // saves ALL objects, including unprocessed
      fs.writeFileSync(DATA_FILE, JSON.stringify(saveData, null, 2));
      process.stdout.write(' [saved]');
    }
    
    await sleep(DELAY_MS);
  }
  
  console.log(`\nDone scraping. Total with category: ${objects.filter(o => o.category).length}`);
  
  // Show category distribution
  const catDist = {};
  for (const o of objects) {
    const cat = o.category || '(none)';
    catDist[cat] = (catDist[cat] || 0) + 1;
  }
  const sorted = Object.entries(catDist).sort((a, b) => b[1] - a[1]);
  console.log('\nCategory distribution:');
  for (const [cat, count] of sorted.slice(0, 20)) {
    console.log(`  ${cat}: ${count}`);
  }
  
  // Remove archives and photography
  const toRemove = REMOVE_CATEGORIES;
  const filtered = objects.filter(o => {
    const cat = (o.category || '').toLowerCase();
    return !toRemove.some(r => cat.includes(r));
  });
  const removedCount = objects.length - filtered.length;
  console.log(`\nRemoving ${removedCount} items (${toRemove.join(', ')})`);
  console.log(`Remaining: ${filtered.length} items`);
  
  // Save final
  const finalData = { ...data, objects: filtered };
  fs.writeFileSync(DATA_FILE, JSON.stringify(finalData, null, 2));
  console.log('Saved to', DATA_FILE);
}

main().catch(console.error);
