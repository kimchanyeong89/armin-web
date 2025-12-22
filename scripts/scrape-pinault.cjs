/**
 * Pinault Collection Scraper - Full with Progress Saving
 * URL: https://lesoeuvres.pinaultcollection.com/en
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://lesoeuvres.pinaultcollection.com/en';
const OUTPUT_DIR = path.join(__dirname, '../public/data');
const PROGRESS_DIR = path.join(__dirname, '../downloads/pinault');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'pinault-collection.json');
const PROGRESS_FILE = path.join(PROGRESS_DIR, 'scrape-progress.json');

// Full: 132 pages (0-131)
const MAX_PAGES = 132;
const DELAY_BETWEEN_ITEMS = 500;
const SAVE_INTERVAL = 5; // Save every 5 pages

// 2D/3D classification
const TYPE_2D = ['painting', 'drawing', 'oil', 'canvas', 'paper', 'acrylic', 'watercolor', 'print', 'photograph', 'photography', 'gelatin', 'ink', 'linen'];
const TYPE_3D = ['sculpture', 'installation', 'bronze', 'marble', 'wood', 'stone', 'ceramic', 'glass', 'metal', 'resin', 'plaster'];
const TYPE_VIDEO = ['video', 'film', 'movie', 'projection', 'monitor'];

function classifyType(medium, title) {
  const text = (medium + ' ' + title).toLowerCase();
  if (TYPE_VIDEO.some(k => text.includes(k))) return 'video';
  if (TYPE_3D.some(k => text.includes(k))) return '3D';
  if (TYPE_2D.some(k => text.includes(k))) return '2D';
  return 'unknown';
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 50);
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      return { lastPage: data.lastPage || 0, artworks: data.artworks || [] };
    }
  } catch (e) {}
  return { lastPage: 0, artworks: [] };
}

function saveProgress(lastPage, artworks) {
  if (!fs.existsSync(PROGRESS_DIR)) fs.mkdirSync(PROGRESS_DIR, { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ lastPage, artworks, savedAt: new Date().toISOString() }, null, 2));
}

async function main() {
  console.log('🎨 Pinault Collection Scraper (Full with Progress)\n');
  
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  // Load progress
  const progress = loadProgress();
  const startPage = progress.lastPage;
  const allArtworks = progress.artworks;
  
  if (startPage > 0) {
    console.log(`📌 Resuming from page ${startPage + 1}, ${allArtworks.length} artworks already collected\n`);
  }
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  try {
    for (let pageNum = startPage; pageNum < MAX_PAGES; pageNum++) {
      console.log(`📄 Page ${pageNum + 1}/${MAX_PAGES}`);
      
      const listUrl = `${BASE_URL}?page=${pageNum}`;
      await page.goto(listUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1500);
      
      const links = await page.$$eval('a[href*="/artwork/"]', els => 
        [...new Set(els.map(el => el.href).filter(h => h.includes('/artwork/')))]
      );
      
      console.log(`   Found ${links.length} artworks`);
      
      for (const detailUrl of links) {
        // Skip if already scraped
        if (allArtworks.some(a => a.detailUrl === detailUrl)) {
          process.stdout.write('○');
          continue;
        }
        
        try {
          await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(600);
          
          const title = await page.$eval('h1', el => el.textContent?.trim().replace(/,$/, '') || '').catch(() => '');
          
          let image = '';
          const imgEl = await page.$('img.image-style-ex-v');
          if (imgEl) {
            let src = await imgEl.getAttribute('src') || '';
            if (src && !src.startsWith('http')) src = 'https://lesoeuvres.pinaultcollection.com' + src;
            image = src;
          }
          if (!image) {
            const allImgs = await page.$$eval('img', imgs => 
              imgs.map(i => i.src || '').filter(s => s.includes('/art/') && !s.includes('logo'))
            );
            if (allImgs.length > 0) {
              image = allImgs[0];
              if (!image.startsWith('http')) image = 'https://lesoeuvres.pinaultcollection.com' + image;
            }
          }
          
          const data = await page.evaluate(() => {
            const text = document.body.innerText;
            const yearMatch = text.match(/\b(19\d{2}|20\d{2})(?:\s*[-–]\s*(19\d{2}|20\d{2}))?\b/);
            const dimMatch = text.match(/(\d+(?:[,\.]\d+)?\s*[×x]\s*\d+(?:[,\.]\d+)?(?:\s*[×x]\s*\d+(?:[,\.]\d+)?)?)\s*CM/i);
            const artistEl = document.querySelector('a[href*="/artist/"]');
            const artist = artistEl?.textContent?.trim() || '';
            
            const lines = text.split('\n').map(l => l.trim()).filter(l => l);
            let medium = '';
            for (const line of lines) {
              if (line.match(/^[A-Z\s,\-\.0-9]+$/) && line.length > 5 && line.length < 150) {
                if (line.match(/OIL|CANVAS|PAPER|BRONZE|WOOD|PRINT|PHOTOGRAPH|ACRYLIC|INK|GELATIN|VIDEO|FILM|INSTALLATION|SCULPTURE|PAINTING|DRAWING|LINEN/i)) {
                  medium = line;
                  break;
                }
              }
            }
            return { year: yearMatch?.[0] || '', dimensions: dimMatch ? dimMatch[1].replace(/,/g, '.') + ' cm' : '', medium, artist };
          });
          
          if (title && image) {
            allArtworks.push({
              id: `pinault-${slugify(title)}-${Date.now().toString(36).slice(-4)}`,
              title, artist: data.artist, year: data.year, image,
              dimensions: data.dimensions, medium: data.medium,
              type: classifyType(data.medium, title),
              source: 'Pinault Collection', detailUrl
            });
            process.stdout.write(`[${classifyType(data.medium, title)}]`);
          } else {
            process.stdout.write('⚠');
          }
          
          await page.waitForTimeout(DELAY_BETWEEN_ITEMS);
        } catch (err) {
          process.stdout.write('✗');
        }
      }
      
      console.log(`\n   📊 Total: ${allArtworks.length} artworks`);
      
      // Save progress every SAVE_INTERVAL pages
      if ((pageNum + 1) % SAVE_INTERVAL === 0) {
        saveProgress(pageNum + 1, allArtworks);
        console.log(`   💾 Progress saved (page ${pageNum + 1})`);
      }
    }
    
    // Final save
    const output = {
      museum: 'Pinault Collection',
      museumId: 'pinault-collection',
      collectionName: 'Pinault Collection',
      scrapedAt: new Date().toISOString(),
      totalObjects: allArtworks.length,
      coverImage: allArtworks[0]?.image || '',
      objects: allArtworks
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    saveProgress(MAX_PAGES, allArtworks);
    console.log(`\n✅ Complete! Saved ${allArtworks.length} artworks to ${OUTPUT_FILE}`);
    
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
