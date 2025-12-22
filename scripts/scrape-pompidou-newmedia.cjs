/**
 * Centre Pompidou Collection Scraper - New Media Section
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SEARCH_URL = 'https://www.centrepompidou.fr/en/recherche/oeuvres?domaineCollection%5B%5D=Nouveaux%20m%C3%A9dias&display=Grid';
const OUTPUT_DIR = path.join(__dirname, '../public/data');
const PROGRESS_DIR = path.join(__dirname, '../downloads/pompidou');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'pompidou-newmedia-collection.json');
const PROGRESS_FILE = path.join(PROGRESS_DIR, 'newmedia-scrape-progress.json');

// Scraping settings - BALANCED
const MAX_ARTWORKS = 20000;
const SCROLL_DELAY = 2000;
const DETAIL_DELAY = 500;
const PARALLEL_DETAILS = 3;
const SAVE_INTERVAL = 50;
const MAX_SCROLL_ATTEMPTS = 500;
const MAX_RETRIES = 3;

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      return { processedUrls: new Set(data.processedUrls || []), artworks: data.artworks || [] };
    }
  } catch (e) {}
  return { processedUrls: new Set(), artworks: [] };
}

function saveProgress(processedUrls, artworks) {
  if (!fs.existsSync(PROGRESS_DIR)) fs.mkdirSync(PROGRESS_DIR, { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ 
    processedUrls: [...processedUrls], artworks, savedAt: new Date().toISOString() 
  }, null, 2));
}

async function scrapeDetail(browser, detailUrl, retries = MAX_RETRIES) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  });
  const page = await context.newPage();
  
  try {
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(800);
    
    const data = await page.evaluate(() => {
      const title = document.querySelector('h1')?.textContent?.trim() || '';
      let artist = document.querySelector('a[href*="/ressources/personne/"]')?.textContent?.trim() || '';
      let image = '';
      for (const sel of ['figure img[src*="/media/picture/"]', 'img[src*="/media/picture/"]', 'main img']) {
        const img = document.querySelector(sel);
        if (img?.src) { image = img.src; break; }
      }
      const tableData = {};
      document.querySelectorAll('table tr').forEach(row => {
        const cells = row.querySelectorAll('td, th');
        if (cells.length >= 2) {
          tableData[cells[0].textContent?.trim().toLowerCase().replace(/\s+/g, ' ') || ''] = cells[1].textContent?.trim() || '';
        }
      });
      if (!artist) artist = tableData['artist'] || tableData['artists'] || '';
      const clean = (s) => s?.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim() || '';
      return {
        title, artist, image,
        year: clean(tableData['creation date'] || tableData['date'] || ''),
        techniques: clean(tableData['techniques'] || ''),
        dimensions: clean(tableData['dimensions'] || ''),
        duration: clean(tableData['duration'] || tableData['durée'] || ''),
        inventoryNo: clean(tableData['inventory no.'] || '')
      };
    });
    await context.close();
    return data;
  } catch (err) {
    await context.close();
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 1000));
      return scrapeDetail(browser, detailUrl, retries - 1);
    }
    throw err;
  }
}

async function main() {
  console.log('💻 Centre Pompidou New Media Collection Scraper\n');
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(PROGRESS_DIR)) fs.mkdirSync(PROGRESS_DIR, { recursive: true });

  const progress = loadProgress();
  const processedUrls = progress.processedUrls;
  const allArtworks = progress.artworks;
  if (allArtworks.length > 0) console.log(`📌 Resuming with ${allArtworks.length} artworks\n`);

  console.log('🚀 Launching browser...');
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0', viewport: { width: 1920, height: 1080 } });
    const listPage = await context.newPage();
    console.log('📡 Navigating...');
    await listPage.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await listPage.waitForTimeout(5000);
    try { await listPage.click('#onetrust-accept-btn-handler'); } catch {}

    let allLinks = new Set(), lastCount = 0, noChangeCount = 0, scrollCount = 0;
    console.log('📜 Scrolling...\n');
    while (allLinks.size < MAX_ARTWORKS && noChangeCount < 10 && scrollCount < MAX_SCROLL_ATTEMPTS) {
      const links = await listPage.$$eval('a[href*="/ressources/oeuvre/"]', els => [...new Set(els.map(e => e.href))]);
      links.forEach(l => allLinks.add(l));
      if (scrollCount % 20 === 0) console.log(`   📊 Scroll ${scrollCount}: ${allLinks.size} links`);
      noChangeCount = allLinks.size === lastCount ? noChangeCount + 1 : 0;
      lastCount = allLinks.size;
      scrollCount++;
      await listPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await listPage.waitForTimeout(SCROLL_DELAY);
    }
    await context.close();
    console.log(`\n✅ Collected ${allLinks.size} links\n`);

    const newLinks = [...allLinks].filter(u => !processedUrls.has(u));
    console.log(`📝 ${newLinks.length} to process\n`);

    for (let i = 0; i < newLinks.length; i += PARALLEL_DETAILS) {
      const batch = newLinks.slice(i, i + PARALLEL_DETAILS);
      const results = await Promise.allSettled(batch.map(u => scrapeDetail(browser, u)));
      for (let j = 0; j < batch.length; j++) {
        if (results[j].status === 'fulfilled' && results[j].value.title && results[j].value.image) {
          const d = results[j].value;
          processedUrls.add(batch[j]);  // Only add on success
          allArtworks.push({
            id: `pompidou-newmedia-${batch[j].split('/').pop()}`,
            title: d.title, artist: d.artist || 'Unknown', year: d.year, image: d.image,
            dimensions: d.dimensions, duration: d.duration, medium: d.techniques, type: 'video',
            inventoryNo: d.inventoryNo, source: 'Centre Pompidou', collectionArea: 'New Media', detailUrl: batch[j]
          });
          process.stdout.write('✓');
        } else process.stdout.write('✗');
      }
      if (allArtworks.length % SAVE_INTERVAL < PARALLEL_DETAILS) {
        saveProgress(processedUrls, allArtworks);
        console.log(`\n   💾 Saved (${allArtworks.length})`);
      }
      await new Promise(r => setTimeout(r, DETAIL_DELAY));
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
      museum: 'Centre Pompidou', museumId: 'centre-pompidou', collectionName: 'New Media Collection',
      scrapedAt: new Date().toISOString(), totalObjects: allArtworks.length,
      coverImage: allArtworks[0]?.image || '', objects: allArtworks
    }, null, 2));
    saveProgress(processedUrls, allArtworks);
    console.log(`\n\n✅ Complete! ${allArtworks.length} artworks saved`);
  } finally { await browser.close(); }
}

main().catch(e => { console.error('Error:', e); process.exit(1); });
