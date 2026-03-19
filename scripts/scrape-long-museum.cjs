const fs = require('fs');
const path = require('path');
const pLimitImport = require('p-limit');
const pLimit = pLimitImport.default || pLimitImport; // Fix for ESM/CJS interop
const cheerio = require('cheerio');

const BASE_URL = 'http://www.thelongmuseum.org';
const CATEGORIES = [
  { id: '318', name: 'Revolutionary Art' },
  { id: '317', name: 'Chinese Traditional Art' },
  { id: '319', name: 'Modern & Contemporary Chinese Art' },
  { id: '402', name: 'Modern & Contemporary Foreign Art' },
];

const ALLOWED_CONCURRENCY = 5;

// Helper to fetch text
async function fetchText(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.88 Safari/537.36',
      },
    });
    if (!res.ok) {
      console.warn(`Failed to fetch ${url}: ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.warn(`Error fetching ${url}: ${err.message}`);
    return null;
  }
}

async function scrapeCategory(catId, catName) {
  let allLinks = [];
  let page = 1;
  const MAX_PAGES = 10;

  while (page <= MAX_PAGES) {
    const url = `${BASE_URL}/en/list-${catId}.html?curpage=${page}`;
    console.log(`Scraping category: ${catName} - Page ${page} (${url})`);
    const html = await fetchText(url);
    if (!html) break;

    const $ = cheerio.load(html);
    const links = [];

    $('.page-list-style ul li a').each((i, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('detail-')) {
        links.push({
          url: href.startsWith('http') ? href : BASE_URL + href,
          category: catName,
        });
      }
    });

    if (links.length === 0) {
      console.log(`  No more items found on page ${page}.`);
      break;
    }

    // Check for duplicates (if page N returns same as page N-1)
    const newLinks = links.filter(l => !allLinks.find(existing => existing.url === l.url));
    if (newLinks.length === 0) {
      console.log(`  No new items found on page ${page}. Stopping.`);
      break;
    }

    console.log(`  Found ${newLinks.length} items on page ${page}`);
    allLinks = allLinks.concat(newLinks);
    page++;

    // Small delay to be polite
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`  Total items for ${catName}: ${allLinks.length}`);
  return allLinks;
}

async function scrapeDetail(item) {
  const html = await fetchText(item.url);
  if (!html) return null;

  const $ = cheerio.load(html);

  // ID from URL
  const idMatch = item.url.match(/detail-(\d+)/);
  const id = idMatch ? `lm-${idMatch[1]}` : `lm-${Date.now()}`;

  // Title
  // The title is in .page-info-cp-top-title p
  const title = $('.page-info-cp-top-title p').text().trim();

  // Artist
  // <font>Artist：Jin Shangyi</font>
  let artist = $('.page-info-cp-top-title font').text().trim();
  artist = artist.replace(/^Artist[：:]\s*/i, '');

  // Metadata block
  // <span>Oil on canvas\n132×251.5cm\n1969</span>
  const metaText = $('.page-info-cp-top-title span').text().trim();
  const metaLines = metaText.split('\n').map((l) => l.trim()).filter(Boolean);

  let medium = '';
  let dimensions = '';
  let date = '';

  // Heuristic:
  // Usually order is Medium -> Dimensions -> Date, but not guaranteed.
  // Dimensions match /\d+(\.\d+)?\s*[x××]\s*\d+/
  // Date matches /\d{4}/

  for (const line of metaLines) {
    if (/^\d{4}/.test(line) || /^\d{2}th/.test(line)) {
      date = line;
    } else if (/\d+\s*[x××]\s*\d+/.test(line)) {
      dimensions = line;
    } else {
      // Assuming leftover is medium if not assigned
      if (!medium) medium = line;
      else medium += ' ' + line; // Append distinct lines?
    }
  }

  // Image
  let imageUrl = $('.page-info-cp-top-img img').attr('src');
  if (imageUrl) {
    if (!imageUrl.startsWith('http')) {
      imageUrl = BASE_URL + imageUrl;
    }
  }

  // Description
  const description = $('.page-info-cp-content').text().trim().replace(/\s+/g, ' ');

  if (!title || !imageUrl) return null;

  return {
    id,
    title,
    artist,
    date,
    medium,
    dimensions,
    imageUrl,
    description,
    category: item.category,
    sourceUrl: item.url,
  };
}

async function main() {
  const limit = pLimit(ALLOWED_CONCURRENCY);
  let allItems = [];

  for (const cat of CATEGORIES) {
    const links = await scrapeCategory(cat.id, cat.name);
    
    // Concurrently fetch details
    const tasks = links.map((link) => limit(() => scrapeDetail(link)));
    const results = await Promise.all(tasks);
    
    const valid = results.filter((r) => r !== null);
    console.log(`  Parsed ${valid.length} items for ${cat.name}`);
    allItems = allItems.concat(valid);
  }

  // Save
  const outPath = path.join(__dirname, '../public/data/long-museum-collection.json');
  fs.writeFileSync(outPath, JSON.stringify(allItems, null, 2));
  console.log(`\nWritten ${allItems.length} items to ${outPath}`);
}

main().catch(console.error);
