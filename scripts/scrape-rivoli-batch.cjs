/**
 * Castello di Rivoli Batch Scraper
 * Uses existing URLs from progress file, scrapes in batches with browser restart
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const PROGRESS_FILE = path.join(__dirname, '../downloads/rivoli-v2-progress.json');
const OUTPUT_FILE = path.join(__dirname, '../public/data/castello-di-rivoli-collection.json');
const BATCH_SIZE = 50;

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch (e) {
    return { urls: [], artworks: [], completed: [] };
  }
}

function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

function saveOutput(artworks) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
}

function parseArtworkData(data, index) {
  let artist = '';
  let year = '';
  let medium = '';
  
  const artistMatch = data.rawText.match(/Artist\s+([A-Za-zÀ-ÿ\s\-\.\']+?)(?:\s+(\d{4})|\s+\d|$)/i);
  if (artistMatch) {
    artist = artistMatch[1].trim().replace(/\s+/g, ' ');
    if (artistMatch[2]) year = artistMatch[2];
  }
  
  if (!year) {
    const yearMatch = data.rawText.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch) year = yearMatch[1];
  }
  
  const mediumPatterns = [
    /oil on canvas/i, /acrylic/i, /bronze/i, /video/i, /installation/i,
    /photograph/i, /mixed media/i, /sculpture/i, /neon/i, /steel/i
  ];
  
  for (const pattern of mediumPatterns) {
    const match = data.rawText.match(pattern);
    if (match) { medium = match[0]; break; }
  }
  
  return {
    id: `rivoli-${String(index).padStart(4, '0')}`,
    title: data.title || 'Untitled',
    artist, date: year, medium, dimensions: '',
    type: 'Contemporary Art',
    imageUrl: data.imageUrl,
    sourceUrl: data.url,
    museum: 'Castello di Rivoli',
    museumShortName: 'Rivoli'
  };
}

async function scrapeBatch(urls, completed, artworks) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(30000);
  
  let scraped = 0;
  let artworkIndex = artworks.length + 1;
  
  for (const url of urls) {
    if (completed.has(url)) continue;
    if (scraped >= BATCH_SIZE) break;
    
    const slug = url.split('/').slice(-2, -1)[0];
    process.stdout.write(`  ${slug.substring(0, 40)}... `);
    
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(r => setTimeout(r, 500));
      
      const data = await page.evaluate(() => {
        const img = document.querySelector('article img, .entry-content img');
        const titleEl = document.querySelector('h1');
        const content = document.querySelector('.entry-content');
        return {
          title: titleEl?.textContent?.trim() || '',
          imageUrl: img?.src || img?.dataset?.src || '',
          rawText: content?.textContent?.replace(/\s+/g, ' ').trim() || '',
          url: window.location.href
        };
      });
      
      if (!data.imageUrl || data.imageUrl.length < 10) {
        console.log('skip (no image)');
        completed.add(url);
        scraped++;
        continue;
      }
      
      const artwork = parseArtworkData(data, artworkIndex);
      artworks.push(artwork);
      completed.add(url);
      artworkIndex++;
      scraped++;
      console.log('OK');
      
    } catch (error) {
      console.log('error');
      completed.add(url);
      scraped++;
    }
  }
  
  await browser.close();
  return scraped;
}

async function main() {
  console.log('=== Rivoli Batch Scraper ===\n');
  
  const progress = loadProgress();
  const urls = progress.urls || [];
  const artworks = progress.artworks || [];
  const completed = new Set(progress.completed || []);
  
  console.log(`URLs: ${urls.length}, Completed: ${completed.size}, Artworks: ${artworks.length}\n`);
  
  const remaining = urls.filter(u => !completed.has(u));
  console.log(`Remaining: ${remaining.length}\n`);
  
  if (remaining.length === 0) {
    console.log('All done!');
    saveOutput(artworks);
    return;
  }
  
  let batchNum = 1;
  while (true) {
    const toScrape = urls.filter(u => !completed.has(u));
    if (toScrape.length === 0) break;
    
    console.log(`\nBatch ${batchNum}: ${Math.min(BATCH_SIZE, toScrape.length)} items`);
    
    try {
      const scraped = await scrapeBatch(toScrape, completed, artworks);
      
      progress.artworks = artworks;
      progress.completed = Array.from(completed);
      saveProgress(progress);
      
      console.log(`Batch done. Total artworks: ${artworks.length}`);
      
      if (scraped === 0) break;
      batchNum++;
      
      // Small delay between batches
      await new Promise(r => setTimeout(r, 2000));
      
    } catch (error) {
      console.error('Batch error:', error.message);
      break;
    }
  }
  
  saveOutput(artworks);
  console.log(`\n=== Final: ${artworks.length} artworks ===`);
}

main().catch(console.error);
