const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
// const PQueue = require('p-queue').default || require('p-queue'); // Removed unused import

// Configuration
const BASE_URL = 'https://collections.lacma.org';
const LIST_FILE = path.join(__dirname, '../public/data/lacma-list.json');
const DATA_FILE = path.join(__dirname, '../public/data/lacma-classification-22.json');
const CONCURRENCY = 5;
const DELAY = 200; // ms

// Helper to delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchHtml(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    console.error(`Failed to fetch ${url}:`, e);
    return null;
  }
}

async function scrapeList() {
  console.log('--- Phase 1: Scraping List ---');
  let page = 0;
  const allItems = [];
  const seenIds = new Set();
  
  if (fs.existsSync(LIST_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(LIST_FILE, 'utf8'));
      existing.forEach(i => {
        if (!seenIds.has(i.id)) {
          seenIds.add(i.id);
          allItems.push(i);
        }
      });
      console.log(`Resuming with ${allItems.length} existing items.`);
      // Heuristic to resume page?
      page = Math.floor(allItems.length / 20); 
    } catch (e) { console.log('Error reading existing list, starting fresh.'); }
  }

  while (true) {
    const url = `${BASE_URL}/search/site?page=${page}&f[0]=bm_field_has_image:true&f[1]=im_field_classification:22`;
    console.log(`Fetching page ${page}: ${url}`);
    const html = await fetchHtml(url);
    if (!html) break;

    const $ = cheerio.load(html);
    const results = $('.search-result');
    if (results.length === 0) {
      console.log('No more results found.');
      break;
    }

    let newCount = 0;
    results.each((i, el) => {
      const link = $(el).find('.search-result-data a').first();
      const href = link.attr('href');
      const title = link.text().trim();
      const thumb = $(el).find('.media-asset-image img').attr('src');
      
      if (href) {
        // Extract ID from /node/123456
        const idMatch = href.match(/\/node\/(\d+)/);
        const id = idMatch ? idMatch[1] : href;
        
        if (!seenIds.has(id)) {
          seenIds.add(id);
          allItems.push({
            id,
            href: href.startsWith('http') ? href : `${BASE_URL}${href}`,
            title,
            thumbnail: thumb
          });
          newCount++;
        }
      }
    });

    console.log(`Page ${page}: found ${results.length} items, ${newCount} new.`);
    if (results.length < 5) {
      // Small page usually means end
    }

    // Save intermediate
    fs.writeFileSync(LIST_FILE, JSON.stringify(allItems, null, 2));
    
    // Check if we reached the text "last" or "next" disabled?
    const next = $('.pager-next');
    if (next.length === 0 && $('.pager').length > 0) {
      console.log('No next link.');
      break;
    }

    page++;
    await sleep(DELAY);
  }
  return allItems;
}

async function scrapeDetails(items) {
  console.log('--- Phase 2: Scraping Details ---');
  
  // Load existing details to skip
  let finishedCount = 0;
  const finalItems = [];
  const processedIds = new Set();
  
  if (fs.existsSync(DATA_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      existing.forEach(i => {
        processedIds.add(String(i.id));
        finalItems.push(i);
      });
      console.log(`Loaded ${finalItems.length} processed items.`);
    } catch (e) {}
  }

  // Use PQueue for concurrency
  // Dynamically import p-queue if needed, but for now assuming it works or using a simple batcher.
  // Since import p-queue is ESM, using a simple semaphore/batch approach in CJS is safer if dependencies are mixed.
  // We'll implementing a simple batch runner.
  
  const queue = items.filter(i => !processedIds.has(String(i.id)));
  console.log(`Queue size: ${queue.length}`);
  
  let active = 0;
  let index = 0;
  
  // Custom simple queue loop
  const work = async () => {
    while (index < queue.length) {
      const item = queue[index++];
      try {
        await processItem(item);
        finishedCount++;
        if (finishedCount % 10 === 0) {
          console.log(`Processed ${finishedCount}/${queue.length}`);
          fs.writeFileSync(DATA_FILE, JSON.stringify(finalItems, null, 2));
        }
      } catch (e) {
        console.error(`Error processing ${item.id}:`, e.message);
      }
      await sleep(DELAY);
    }
  };
  
  const processItem = async (item) => {
      const html = await fetchHtml(item.href);
      if (!html) return;
      const $ = cheerio.load(html);
      
      const title = $('h1').first().text().trim();
      const artistBlock = $('.artist-name').first();
      const artistName = artistBlock.text().trim() || "Unknown";
      
      // Metadata logic
      const rightGroup = $('.group-right');
      let date = null;
      let classification = null;
      let medium = null;
      let dimensions = null;
      let credit = null;
      let department = null;
      let alternateTitle = null;
      
      const contents = rightGroup.contents();
      const lines = [];
      contents.each((i, el) => {
        const text = $(el).text().trim();
        if (text) lines.push({ text, el });
      });
      
      lines.forEach((lineObj) => {
        const text = lineObj.text;
        // Skip obvious ones
        if (text === title || text.includes(artistName)) return;

        if (text.startsWith("Alternate Title:")) {
            alternateTitle = text.replace("Alternate Title:", "").trim();
        } else if (text.includes('cm)') || text.includes('in.)')) {
            dimensions = text.replace(/^Image:\s*/i, '');
        } else if (/^Gift of|^Purchased with|^Bequest of|^Coll|^Funds provided/i.test(text)) {
            credit = text;
        } else if (/Art$/.test(text) && $(lineObj.el).find('a').length > 0) {
            department = text;
        } else if (/paintings|drawings|prints|sculpture|scrolls/i.test(text) && !classification) {
            classification = text;
        } else if (!date && (/\d{4}/.test(text) || /century/i.test(text)) && text.length < 80) {
            date = text;
        } else if (!medium && !classification && !credit && !dimensions && !department && text.length < 100) {
            medium = text;
        } else if (!medium && classification && !credit && !dimensions && !department) {
             medium = text; // fallback
        }
      });
      
      const image = $('.group-left img').attr('src');
      const hasDownload = $('.download-options').length > 0 || /Download/i.test($('.group-right').text()); // Check if download text
      
      const record = {
          id: item.id,
          title: title || item.title,
          artist: artistName,
          date,
          medium,
          dimensions,
          credit,
          classification,
          image,
          thumbnail: item.thumbnail,
          url: item.href,
          isUnrestricted: hasDownload
      };
      
      finalItems.push(record);
  };

  const workers = Array(CONCURRENCY).fill(null).map(work);
  await Promise.all(workers);
  
  // Final save
  fs.writeFileSync(DATA_FILE, JSON.stringify(finalItems, null, 2));
  console.log('Done!');
}

(async () => {
  const items = await scrapeList();
  await scrapeDetails(items);
})();
