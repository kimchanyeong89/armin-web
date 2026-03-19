const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

// Configuration
const BASE_URL = 'https://collections.lacma.org';
const OUTPUT_FILE = path.join(__dirname, '../public/data/lacma-combined-onview.json');
const CONCURRENCY = 8;
const DELAY = 100; // ms

// Classifications to scrape
// 22: Paintings (Total ~1614)
// 26: Sculpture (Total ~2686)
const CLASSIFICATIONS = [22, 26];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchHtml(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0 Safari/537.36' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    console.error(`Failed to fetch ${url}:`, e);
    return null;
  }
}

async function scrapeList() {
  console.log('--- Phase 1: Scraping Lists ---');
  const allItems = new Map(); // Use Map for dedup

  for (const cid of CLASSIFICATIONS) {
    console.log(`Scraping Classification ${cid}...`);
    let page = 0;
    while (true) {
      // Note: on_view_only=1 might not work on search results, but adding it doesn't hurt.
      const url = `${BASE_URL}/search/site?page=${page}&f[0]=bm_field_has_image:true&f[1]=im_field_classification:${cid}`;
      console.log(`  Fetching page ${page}: ${url}`);
      const html = await fetchHtml(url);
      if (!html) break;
      const $ = cheerio.load(html);
      
      const results = $('.search-results .search-result');
      if (results.length === 0) {
        console.log(`  No results on page ${page}, moving to next class.`);
        break;
      }
      
      results.each((i, el) => {
        const link = $(el).find('.search-result-data a').first();
        const thumb = $(el).find('.media-asset-image img').attr('src');
        const href = link.attr('href');
        const title = link.text();
        const id = href ? href.split('/').pop() : null;
        
        if (id && !allItems.has(id)) {
          allItems.set(id, { id, title, href: BASE_URL + href, thumb, classificationId: cid });
        }
      });
      console.log(`  Found ${results.length} items. Total unique: ${allItems.size}`);
      
      if ($('.pager-next').length === 0) {
        break;
      }
      page++;
      await sleep(DELAY);
    }
  }
  return Array.from(allItems.values());
}

async function scrapeDetails(items) {
  console.log('--- Phase 2: Scraping Details & Filtering On View ---');
  
  const finalItems = [];
  const queue = items;
  console.log(`Total items to check: ${queue.length}`);
  
  let index = 0;
  let savedCount = 0;
  let counts = { 22: 0, 26: 0, other: 0 };

  const processItem = async (item) => {
    try {
      const html = await fetchHtml(item.href);
      if (!html) return;
      const $ = cheerio.load(html);
      
      const title = $('h1').first().text().trim();
      const artistBlock = $('.artist-name').first();
      const artistName = artistBlock.text().trim() || "Unknown";
      const image = $('.media-asset-image img').attr('src');
      
      const rightGroup = $('.group-right');
      let isOnView = false;
      let onViewLocation = "";

      // Check text content for "On view"
      const textContent = rightGroup.text();
      // Expanded regex to catch various formats
      if (/currently on view/i.test(textContent) || /on view/i.test(textContent) || /location:/i.test(textContent)) {
           // Double check context
           if (/currently on view/i.test(textContent) || (/on view/i.test(textContent) && !/not on view/i.test(textContent))) {
                isOnView = true;
                const m = textContent.match(/(?:Currently on view|On view)[^:]*:?\s*([^.\n<]+)/i);
                if (m) onViewLocation = m[1].trim();
           }
      }

      if (!isOnView) {
          // console.log(`Skipping ${item.id} (Not On View)`);
          return;
      }

      // Extract metadata
      let date = null;
      let classification = null;
      let medium = null;
      let dimensions = null;
      let credit = null;
      let department = null;

      const lines = [];
      rightGroup.contents().each((i, el) => {
        const t = $(el).text().trim();
        if (t) lines.push(t);
      });

      for (const text of lines) {
        if (text === title || text.includes(artistName) || /on view/i.test(text)) continue;
        if (text.startsWith("Alternate Title:")) continue;
        
        if ((text.includes('cm)') || text.includes('in.)')) && !dimensions) { 
            dimensions = text.replace(/^Image:\s*/i, '');
        } else if (/^Gift of|^Purchased with|^Bequest of|^Coll|^Funds provided/i.test(text)) {
            credit = text;
        } else if (/Art$/.test(text) && !department) {
            department = text;
        } else if (/paintings|drawings|prints|sculpture/i.test(text) && !classification) {
            classification = text;
        } else if (!date && (/\d{4}/.test(text) || /century/i.test(text)) && text.length < 80) {
            date = text;
        } else if (!medium && text.length < 100 && !/Art$/.test(text) && !credit && !/Dimensions/i.test(text)) {
            medium = text;
        }
      }

      const record = {
          id: item.id,
          title,
          artist: artistName,
          date,
          medium,
          dimensions,
          credit,
          classification: classification || (item.classificationId === 22 ? 'Paintings' : 'Sculpture'),
          category: (item.classificationId === 22 ? 'Paintings' : 'Sculpture'),
          image: image || item.thumb,
          detailUrl: item.href,
          isOnView, 
          onViewLocation
      };
      
      finalItems.push(record);
      savedCount++;
      if (item.classificationId === 22) counts[22]++;
      else if (item.classificationId === 26) counts[26]++;
      else counts.other++;
      
    } catch (e) {
      console.error(`Error processing ${item.id}:`, e.message);
    }
  };

  const workers = [];
  for (let w = 0; w < CONCURRENCY; w++) {
      workers.push((async () => {
          while (index < queue.length) {
              const i = index++;
              await processItem(queue[i]);
              if (i % 20 === 0) console.log(`Processed ${i}/${queue.length}, Saved: ${savedCount} (22: ${counts[22]}, 26: ${counts[26]})`);
              await sleep(DELAY);
          }
      })());
  }
  
  await Promise.all(workers);
  
  console.log(`Writing combined list to ${OUTPUT_FILE}`);
  console.log(`Final Counts: 22(Paintings)=${counts[22]}, 26(Sculpture)=${counts[26]}, Other=${counts.other}, Total=${finalItems.length}`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalItems, null, 2));
}

(async () => {
  const items = await scrapeList();
  await scrapeDetails(items);
})();
