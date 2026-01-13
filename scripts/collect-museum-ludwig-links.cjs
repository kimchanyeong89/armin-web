/**
 * Collect Museum Ludwig artwork links using Playwright
 * Run once per collection to gather all artwork URLs
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://museum-ludwig.kulturelles-erbe-koeln.de';

const COLLECTIONS = {
  malerei: {
    name: 'Malerei',
    filterUrl: `${BASE_URL}/ete?action=hinzufuegenFilter&filter=filter_subsammlungen_ml&term=001%5CMalerei`,
  },
  skulptur: {
    name: 'Skulptur',
    filterUrl: `${BASE_URL}/ete?action=hinzufuegenFilter&filter=filter_subsammlungen_ml&term=002%5CSkulptur`,
  },
  fotografie: {
    name: 'Fotografie',
    filterUrl: `${BASE_URL}/ete?action=hinzufuegenFilter&filter=filter_subsammlungen_ml&term=005%5CFotografie`,
  },
  grafik: {
    name: 'Grafik',
    filterUrl: `${BASE_URL}/ete?action=hinzufuegenFilter&filter=filter_subsammlungen_ml&term=006%5CGrafik`,
  }
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function collectLinks(collectionKey) {
  const collection = COLLECTIONS[collectionKey];
  console.log(`\nCollecting links for ${collection.name}...`);
  
  const progressFile = path.join(__dirname, '..', 'downloads', `museum-ludwig-links-${collectionKey}.json`);
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto(collection.filterUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await delay(2000);
  
  let html = await page.content();
  const totalMatch = html.match(/\((\d+(?:[\.,]\d+)?)\s*Dokumente?\)/i);
  const totalCount = totalMatch ? parseInt(totalMatch[1].replace(/[\.,]/g, ''), 10) : 0;
  console.log(`Total: ${totalCount} artworks`);
  
  const links = new Set();
  const RESULTS_PER_PAGE = 30;
  let resultOffset = 1;
  let pageNum = 1;
  
  while (links.size < totalCount && pageNum < 700) {
    // Extract links
    const regex = /documents\/obj\/(\d+)/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      links.add(`${BASE_URL}/documents/obj/${match[1]}`);
    }
    
    console.log(`Page ${pageNum}: ${links.size}/${totalCount} links`);
    
    // Save progress every 10 pages
    if (pageNum % 10 === 0) {
      fs.writeFileSync(progressFile, JSON.stringify({
        artworkLinks: Array.from(links),
        processedIds: [],
        totalCount
      }, null, 2));
    }
    
    if (links.size >= totalCount) break;
    
    // Navigate to next
    pageNum++;
    resultOffset += RESULTS_PER_PAGE;
    
    try {
      const nextLink = await page.$(`a[href*="action=displayResult/${resultOffset}"]`);
      if (nextLink) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
          nextLink.click()
        ]);
        await delay(1000);
        html = await page.content();
      } else {
        break;
      }
    } catch (e) {
      console.log(`Done or error: ${e.message}`);
      break;
    }
  }
  
  await browser.close();
  
  // Save final
  const linkArray = Array.from(links);
  fs.writeFileSync(progressFile, JSON.stringify({
    artworkLinks: linkArray,
    processedIds: [],
    totalCount: linkArray.length
  }, null, 2));
  
  console.log(`Saved ${linkArray.length} links to ${progressFile}`);
  return linkArray.length;
}

async function main() {
  console.log('Museum Ludwig Link Collector');
  console.log('============================');
  
  const args = process.argv.slice(2);
  const keys = args.length > 0 ? args.filter(k => COLLECTIONS[k]) : Object.keys(COLLECTIONS);
  
  for (const key of keys) {
    await collectLinks(key);
  }
}

main().catch(console.error);
