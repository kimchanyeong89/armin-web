/**
 * Musée d'Orsay Collection Scraper
 * 
 * 1단계: 메타데이터 + 원본 이미지 URL 수집
 * 결과: JSON 파일 (나중에 R2 업로드용)
 * 
 * 구조:
 * - article.artwork-masonry → 각 작품
 * - a[href] → 상세 페이지 링크
 * - img src → CDN 이미지 URL
 * - h2 → 작가 + 제목 (<i> 태그)
 * - div.date → 연도
 * 
 * 페이지네이션: ?page=0, 1, 2, ... (최대 341)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.musee-orsay.fr';
// Painting domain filter: domain_kind_checkboxes[276575]=276575
const SEARCH_URL = 'https://www.musee-orsay.fr/en/collections/search?search=&domain_kind_checkboxes%5B276575%5D=276575&sort_by=search_api_relevance&items_per_page=15&search_type=simple_search&display_type=grid';

const OUTPUT_DIR = path.join(__dirname, '../downloads/orsay');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'orsay-collection.json');
const PROGRESS_FILE = path.join(OUTPUT_DIR, 'orsay-scrape-progress.json');

// How many pages to scrape (set lower for testing)
const MAX_PAGES = 342; // 0-341
const ITEMS_PER_PAGE = 15;

// Rate limiting
const DELAY_BETWEEN_PAGES = 1500; // ms

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  return { lastPage: -1, artworks: [] };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeOrsayCollection() {
  console.log('🎨 Starting Musée d\'Orsay Collection Scraper\n');
  
  ensureDir(OUTPUT_DIR);
  
  // Load progress (resume support)
  const progress = loadProgress();
  const startPage = progress.lastPage + 1;
  const artworks = progress.artworks;
  
  console.log(`📊 Starting from page ${startPage}`);
  console.log(`📦 Already collected: ${artworks.length} artworks\n`);
  
  const browser = await chromium.launch({ 
    headless: true
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  try {
    // Cookie banner handling
    console.log('📄 Loading initial page...');
    await page.goto(SEARCH_URL, { waitUntil: 'networkidle', timeout: 60000 });
    
    try {
      const cookieBtn = await page.$('#onetrust-accept-btn-handler, button[id*="cookie"], .cookie-accept');
      if (cookieBtn) {
        await cookieBtn.click();
        console.log('🍪 Cookie banner dismissed');
        await delay(1000);
      }
    } catch (e) {}
    
    // Scrape pages
    for (let pageNum = startPage; pageNum < MAX_PAGES; pageNum++) {
      const pageUrl = pageNum === 0 
        ? SEARCH_URL 
        : `${SEARCH_URL}&page=${pageNum}`;
      
      console.log(`\n📄 Page ${pageNum + 1}/${MAX_PAGES} - ${pageUrl.substring(0, 80)}...`);
      
      try {
        await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
        await delay(500);
        
        // Extract artworks from current page
        const pageArtworks = await page.$$eval('article.artwork-masonry', articles => {
          return articles.map(article => {
            const link = article.querySelector('a');
            const img = article.querySelector('img');
            const h2 = article.querySelector('h2');
            const dateDiv = article.querySelector('.date');
            
            // Parse artist and title from h2
            // Format: "Artist Name, <i>Title</i>"
            let artist = '';
            let title = '';
            
            if (h2) {
              const h2Html = h2.innerHTML;
              const italicMatch = h2Html.match(/<i[^>]*>([^<]+)<\/i>/);
              if (italicMatch) {
                title = italicMatch[1].trim();
                // Artist is the text before the comma
                const textContent = h2.textContent || '';
                const commaIdx = textContent.indexOf(',');
                if (commaIdx > 0) {
                  artist = textContent.substring(0, commaIdx).trim();
                }
              } else {
                // Fallback: just use full text
                const textContent = h2.textContent || '';
                const commaIdx = textContent.indexOf(',');
                if (commaIdx > 0) {
                  artist = textContent.substring(0, commaIdx).trim();
                  title = textContent.substring(commaIdx + 1).trim();
                } else {
                  title = textContent.trim();
                }
              }
            }
            
            // Get figure aria-label as backup
            const figure = article.querySelector('figure');
            const ariaLabel = figure?.getAttribute('aria-label') || '';
            
            return {
              href: link?.getAttribute('href') || '',
              imageUrl: img?.getAttribute('src') || '',
              artist: artist,
              title: title,
              year: dateDiv?.textContent?.trim() || '',
              ariaLabel: ariaLabel
            };
          });
        });
        
        console.log(`   Found ${pageArtworks.length} artworks`);
        
        // Helper to clean text (remove extra whitespace, newlines)
        const cleanText = (str) => str?.replace(/\s+/g, ' ').trim() || '';
        
        // Process and add to collection
        for (const artwork of pageArtworks) {
          if (!artwork.href || !artwork.imageUrl) continue;
          
          // Generate unique ID from URL
          const urlParts = artwork.href.split('/');
          const slug = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
          
          artworks.push({
            id: `orsay-${slug}`,
            title: cleanText(artwork.title) || cleanText(artwork.ariaLabel.split(',').pop()) || 'Untitled',
            artist: cleanText(artwork.artist) || cleanText(artwork.ariaLabel.split(',')[0]) || 'Unknown',
            year: cleanText(artwork.year),
            imageUrl: artwork.imageUrl,
            detailUrl: artwork.href.startsWith('http') ? artwork.href : `${BASE_URL}${artwork.href}`,
            source: 'Musée d\'Orsay',
            scraped: new Date().toISOString()
          });
        }
        
        // Save progress
        progress.lastPage = pageNum;
        progress.artworks = artworks;
        saveProgress(progress);
        
        console.log(`   Total: ${artworks.length} artworks collected`);
        
        // Rate limiting
        await delay(DELAY_BETWEEN_PAGES);
        
      } catch (error) {
        console.error(`   ❌ Error on page ${pageNum}: ${error.message}`);
        // Save progress and continue
        saveProgress(progress);
        await delay(3000);
      }
    }
    
    // Save final results
    console.log('\n✅ Scraping complete!');
    console.log(`📊 Total artworks: ${artworks.length}`);
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
    console.log(`💾 Saved to: ${OUTPUT_FILE}`);
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    saveProgress(progress);
  } finally {
    await browser.close();
  }
}

// Run
scrapeOrsayCollection().catch(console.error);
