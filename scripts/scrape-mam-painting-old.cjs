/**
 * MAM Paris - Painting Collection Full Scraper
 * Scrapes list pages then fetches detail pages for accurate data
 * Total: ~2,167 paintings with images
 */

const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'https://www.navigart.fr/mamparis/artworks/checkbox:withimage/Avec%20image/tree_domain_all/Peinture';
const PROGRESS_FILE = '/Users/kietzsche/armin-web-main/downloads/mam/painting-scrape-progress.json';
const OUTPUT_FILE = '/Users/kietzsche/armin-web-main/public/data/mam-painting-collection.json';

// Ensure directory exists
if (!fs.existsSync('/Users/kietzsche/armin-web-main/downloads/mam')) {
  fs.mkdirSync('/Users/kietzsche/armin-web-main/downloads/mam', { recursive: true });
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  return { processedUrls: [], artworks: [], lastPage: 0 };
}

function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
  // Also save to output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ artworks: data.artworks }, null, 2));
}

async function scrapeDetailPage(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    const data = await page.evaluate(() => {
      // Get high-res image
      const imgEl = document.querySelector('.notice-image img, .artwork-image img, img.main-image');
      let image = imgEl?.src || null;
      // Try to get higher resolution
      if (image && image.includes('/400/')) {
        image = image.replace('/400/', '/800/');
      }
      
      // Artist name - usually at the top
      const artistEl = document.querySelector('.notice-author, .artist-name, h2, .author');
      let artist = artistEl?.textContent?.trim() || null;
      
      // Title - in italics or specific class
      const titleEl = document.querySelector('.notice-title, em, i, h1, .title');
      let title = titleEl?.textContent?.trim() || null;
      
      // Year/date
      const dateEl = document.querySelector('.notice-date, .date, .year');
      let year = dateEl?.textContent?.trim() || null;
      
      // Try to parse from page text if structured selectors fail
      const textContent = document.body.innerText;
      
      // Look for patterns in the sidebar/left column
      const leftCol = document.querySelector('.notice-details, .artwork-info, aside, .sidebar');
      if (leftCol) {
        const lines = leftCol.innerText.split('\n').map(l => l.trim()).filter(Boolean);
        
        // First line often has artist attribution
        if (!artist && lines[0]) {
          // Check if it looks like an artist name (contains name patterns)
          if (lines[0].match(/^[-–—]?\s*[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][a-zàâäéèêëïîôùûüç]+/)) {
            artist = lines[0].replace(/^[-–—]\s*/, '');
          }
        }
        
        // Look for title in italics or bold
        if (!title) {
          const italicEl = leftCol.querySelector('em, i');
          if (italicEl) title = italicEl.textContent.trim();
        }
        
        // Find year pattern (vers YYYY or just YYYY)
        for (const line of lines) {
          const yearMatch = line.match(/\b(vers\s+)?(\d{4})\b/i);
          if (yearMatch && !year) {
            year = yearMatch[0];
            break;
          }
        }
        
        // Find medium (Peinture, Huile, etc.)
        let medium = null;
        for (const line of lines) {
          if (line.match(/^(Peinture|Huile|Acrylique|Tempera|Gouache|Aquarelle)/i)) {
            medium = line;
            break;
          }
        }
        
        // Find dimensions
        let dimensions = null;
        for (const line of lines) {
          if (line.match(/\d+\s*[x×]\s*\d+\s*cm/i)) {
            dimensions = line;
            break;
          }
        }
        
        return { image, artist, title, year, medium, dimensions };
      }
      
      return { image, artist, title, year, medium: null, dimensions: null };
    });
    
    return data;
  } catch (e) {
    console.log(`  Error scraping ${url}: ${e.message}`);
    return null;
  }
}

async function scrape() {
  console.log('🎨 MAM Paris - Painting Collection Scraper');
  console.log('================================================\n');
  
  const progress = loadProgress();
  console.log(`Resuming: ${progress.artworks.length} artworks, last page: ${progress.lastPage}`);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  const processedSet = new Set(progress.processedUrls);
  let totalPages = 145; // ~2167 / 15 per page
  
  try {
    // First, get total count
    await page.goto(`${BASE_URL}?page=1&layout=box`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    
    const totalText = await page.$eval('.pagination-info, .total, [class*="total"]', el => el.textContent).catch(() => null);
    if (totalText) {
      const match = totalText.match(/(\d[\d\s]*)\s*\//);
      if (match) {
        const total = parseInt(match[1].replace(/\s/g, ''), 10);
        totalPages = Math.ceil(total / 15);
        console.log(`Total paintings: ${total}, Pages: ${totalPages}`);
      }
    }
    
    for (let pageNum = progress.lastPage + 1; pageNum <= totalPages; pageNum++) {
      console.log(`\n📄 Page ${pageNum}/${totalPages}`);
      
      const url = `${BASE_URL}?page=${pageNum}&layout=box`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(2000);
      
      // Get all artwork links from list
      const items = await page.$$eval('a.box-item, a[class*="box-item"]', elements => {
        return elements.map(el => {
          const img = el.querySelector('img');
          return {
            detailUrl: el.href,
            listImage: img?.src || null
          };
        });
      });
      
      console.log(`  Found ${items.length} items on page`);
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        if (processedSet.has(item.detailUrl)) {
          continue;
        }
        
        console.log(`  [${i + 1}/${items.length}] Fetching detail...`);
        
        const detail = await scrapeDetailPage(page, item.detailUrl);
        
        if (detail) {
          const artwork = {
            artist: detail.artist || 'Unknown',
            title: detail.title || 'Untitled',
            year: detail.year || null,
            image: detail.image || item.listImage,
            medium: detail.medium || null,
            dimensions: detail.dimensions || null,
            detailUrl: item.detailUrl
          };
          
          progress.artworks.push(artwork);
          processedSet.add(item.detailUrl);
          progress.processedUrls.push(item.detailUrl);
          
          console.log(`    ✓ ${artwork.artist} - ${artwork.title}`);
        }
        
        // Small delay between detail page requests
        await page.waitForTimeout(500);
      }
      
      progress.lastPage = pageNum;
      saveProgress(progress);
      console.log(`  Saved: ${progress.artworks.length} total artworks`);
      
      // Delay between pages
      await page.waitForTimeout(1000);
    }
    
    console.log(`\n✅ Completed! Total: ${progress.artworks.length} artworks`);
    
  } catch (e) {
    console.error('Error:', e.message);
    saveProgress(progress);
  }
  
  await browser.close();
}

scrape();
