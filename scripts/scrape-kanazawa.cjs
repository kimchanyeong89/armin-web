const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

// Try to use global fetch (Node 18+), fast-fail if not present
if (!global.fetch) {
  throw new Error('This script requires Node.js 18+ with global fetch.');
}

const BASE_URL = 'https://jmapps.ne.jp/kanazawa21_2/';
const OUTPUT_FILE = path.join(__dirname, '../public/data/kanazawa-all.json');

// We'll trust the user about ~209 pages, but we perform checks.
// Max concurrency for detail pages
const CONCURRENCY = 10;

// Helper to delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  // Use p-limit if available, else simple chunking. 
  // Since we want to be safe with CJS/ESM issues, let's just dynamic import p-limit.
  const { default: pLimit } = await import('p-limit');
  const limit = pLimit(CONCURRENCY);

  let allItems = [];
  let page = 1;
  let hasNext = true;
  const detailUrls = [];

  console.log(`Starting scraper for Kanazawa 21st Century Museum...`);

  // --- PHASE 1: Crawl List Pages ---
  while (hasNext) {
    const url = `${BASE_URL}list.html?page=${page}&list_count=20`;
    console.log(`Fetching list page ${page}: ${url}`);

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`Page ${page} failed: ${res.status}`);
        break;
      }
      const html = await res.text();
      const $ = cheerio.load(html);
      
      const items = $('.type-mix li.menu');
      if (items.length === 0) {
        console.log(`No items on page ${page}. Stopping.`);
        hasNext = false;
        break;
      }
      
      let newUrls = 0;
      items.each((i, el) => {
        const link = $(el).find('dl dt a').attr('href');
        if (link) {
          const abs = new URL(link, BASE_URL).href;
          detailUrls.push(abs);
          newUrls++;
        }
      });

      // Pagination check
      // Text like: "1/209" in #nowPage
      const pagerText = $('#nowPage').text().trim(); // "1/209"
      if (pagerText.includes('/')) {
        const [curr, total] = pagerText.split('/').map(x => parseInt(x.trim()));
        if (!isNaN(curr) && !isNaN(total) && curr >= total) {
          hasNext = false;
        }
      } else {
        // Fallback: stopping if newUrls is 0, but we ALREADY checked items.length=0.
        // Safety limit
        if (page > 300) hasNext = false; 
      }

      page++;
      await delay(200); // polite delay between list pages

    } catch (err) {
      console.error(`Error on page ${page}:`, err);
      break; // Stop on critical network error
    }
  }

  console.log(`\nFound ${detailUrls.length} total items. Starting detail fetch...`);

  // --- PHASE 2: Fetch Details ---
  let processedCount = 0;
  
  const tasks = detailUrls.map(url => limit(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const html = await res.text();
      const $ = cheerio.load(html);
      
      // Metadata
      const metadata = {};
      $('#blockData table tr').each((i, el) => {
        const key = $(el).find('th').text().trim();
        const val = $(el).find('td').text().trim();
        if(key) metadata[key] = val;
      });

      const title = $('#blockData h1').first().text().trim();
      
      // Image
      // Check og:image first
      let imageUrl = $('meta[property="og:image"]').attr('content');
      if (imageUrl && imageUrl.includes('copy_guard')) imageUrl = null; // unlikely, but safety

      // Fallback: try to construct from JS pict_array if og:image fails or is generic
      // The JS snippet: var pict_array = ...
      if (!imageUrl || imageUrl.endsWith('no_image.png')) {
         const scriptContent = $('script:contains("pict_array")').html();
         if (scriptContent) {
            const match = scriptContent.match(/'file_nm'\s*:\s*'([^']+)'/);
            if (match && match[1]) {
               // Construct typical URL: https://ibmuseum.mapps.ne.jp/files/kanazawa21_2/media_files/large/7720.jpg
               // But wait, the og:image URL in my probe was:
               // https://ibmuseum.mapps.ne.jp/files/kanazawa21_2/media_files/large/7720.jpg?dt=20260205
               // I can try to guess the path. Safest is just stick to og:image unless it's missing.
            }
         }
      }

      const urlObj = new URL(url);
      const dataId = urlObj.searchParams.get('data_id') || 'unknown';

      processedCount++;
      if (processedCount % 50 === 0) {
        process.stdout.write(`\rProcessed ${processedCount}/${detailUrls.length}`);
      }

      return {
        id: `kanazawa-${dataId}`,
        source_id: dataId,
        url,
        title,
        artist: metadata['Artist'] || '',
        date: metadata['Year'] || '',
        medium: metadata['Material/ Technique'] || '',
        dimensions: metadata['Size/ Duration'] || '',
        creditLine: metadata['Year of acquisition/ donation'] || '',
        copyright: metadata['Copyright Notice'] || '',
        imageUrl: imageUrl || null
      };

    } catch (e) {
      console.error(`\nError fetching ${url}: ${e.message}`);
      return null;
    }
  }));

  const results = (await Promise.all(tasks)).filter(Boolean);
  
  // Save
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\n\nSuccess! Saved ${results.length} items to ${OUTPUT_FILE}`);
}

main().catch(console.error);
