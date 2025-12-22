/**
 * Musée d'Orsay Collection Scraper - 전체 스크래핑 버전
 * 
 * 342 페이지 × 15개 = ~5,100 작품
 * - 고화질 이미지: 상세 페이지의 figure.main-image에서 추출 (~200KB)
 * - 디멘션: 상세 페이지에서 정확한 셀렉터로 추출
 * - 이미지 없는 항목 제외
 * - 중간 저장 및 재개 지원
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.musee-orsay.fr';
const SEARCH_URL = 'https://www.musee-orsay.fr/en/collections/search?search=&domain_kind_checkboxes%5B276575%5D=276575&sort_by=search_api_relevance&items_per_page=15&search_type=simple_search&display_type=grid';

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'orsay-collection.json');
const PROGRESS_DIR = path.join(__dirname, '../downloads/orsay');
const PROGRESS_FILE = path.join(PROGRESS_DIR, 'scrape-progress.json');

// 전체 스크래핑 설정
const MAX_PAGES = 350; // 342페이지 + 여유
const DELAY_BETWEEN_PAGES = 2000;
const DELAY_BETWEEN_DETAILS = 1000;
const SAVE_INTERVAL = 5; // 5페이지마다 저장

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanText(str) {
  return str?.replace(/\s+/g, ' ').trim() || '';
}

function formatDimensions(raw) {
  if (!raw) return '';
  const match = raw.match(/H\.?\s*([\d,.]+)\s*[;,]?\s*L\.?\s*([\d,.]+)\s*cm/i);
  if (match) {
    const height = match[1].replace(',', '.');
    const width = match[2].replace(',', '.');
    return `${height} x ${width} cm`;
  }
  return raw.replace(/\s+/g, ' ').trim();
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { lastPage: 0, artworks: [] };
}

function saveProgress(pageNum, artworks) {
  ensureDir(PROGRESS_DIR);
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ lastPage: pageNum, artworks }, null, 2));
}

function saveFinal(artworks) {
  ensureDir(OUTPUT_DIR);
  const collection = {
    museum: 'Musée d\'Orsay',
    museumId: 'musee-orsay',
    collectionName: 'Musée d\'Orsay Collection',
    scrapedAt: new Date().toISOString(),
    totalObjects: artworks.length,
    coverImage: artworks[0]?.image || '',
    objects: artworks
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2));
}

async function scrapeOrsayFull() {
  console.log('🎨 Musée d\'Orsay Full Collection Scraper\n');
  console.log('📊 Target: ~5,100 paintings (342 pages)\n');
  
  // Load progress
  const progress = loadProgress();
  let artworks = progress.artworks || [];
  const startPage = progress.lastPage || 0;
  
  if (startPage > 0) {
    console.log(`📌 Resuming from page ${startPage + 1}, ${artworks.length} artworks already collected\n`);
  }
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  let totalSuccess = artworks.length;
  let totalSkip = 0;
  
  try {
    // Scrape all pages
    for (let pageNum = startPage; pageNum < MAX_PAGES; pageNum++) {
      const pageUrl = pageNum === 0 
        ? SEARCH_URL 
        : `${SEARCH_URL}&page=${pageNum}`;
      
      console.log(`\n📄 Page ${pageNum + 1}/${MAX_PAGES}`);
      console.log(`   URL: ...&page=${pageNum}`);
      
      try {
        await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
      } catch (e) {
        console.log(`   ⚠️ Page load timeout, retrying...`);
        await delay(5000);
        try {
          await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (e2) {
          console.log(`   ❌ Page load failed, skipping`);
          continue;
        }
      }
      
      // Cookie banner (first page only)
      if (pageNum === 0) {
        try {
          const cookieBtn = await page.$('#onetrust-accept-btn-handler');
          if (cookieBtn) {
            await cookieBtn.click();
            await delay(1000);
          }
        } catch (e) {}
      }
      
      // Extract list items
      const listItems = await page.$$eval('article.artwork-masonry', articles => {
        return articles.map(article => {
          const link = article.querySelector('a');
          const h2 = article.querySelector('h2');
          const dateDiv = article.querySelector('.date');
          
          let artist = '';
          let title = '';
          
          if (h2) {
            const h2Html = h2.innerHTML;
            const italicMatch = h2Html.match(/<i[^>]*>([^<]+)<\/i>/);
            if (italicMatch) {
              title = italicMatch[1].trim();
              const textContent = h2.textContent || '';
              const commaIdx = textContent.indexOf(',');
              if (commaIdx > 0) {
                artist = textContent.substring(0, commaIdx).trim();
              }
            }
          }
          
          return {
            href: link?.getAttribute('href') || '',
            artist,
            title,
            year: dateDiv?.textContent?.trim() || ''
          };
        });
      });
      
      // Check if we've reached the end (no items)
      if (listItems.length === 0) {
        console.log(`   ✅ No more items, reached end of collection`);
        break;
      }
      
      console.log(`   Found ${listItems.length} artworks`);
      
      // Process each item
      let pageSuccess = 0;
      let pageSkip = 0;
      
      for (let i = 0; i < listItems.length; i++) {
        const item = listItems[i];
        if (!item.href) {
          pageSkip++;
          continue;
        }
        
        const detailUrl = item.href.startsWith('http') ? item.href : `${BASE_URL}${item.href}`;
        const urlParts = item.href.split('/');
        const slug = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
        
        // Check if already scraped
        if (artworks.some(a => a.id === `orsay-${slug}`)) {
          continue;
        }
        
        process.stdout.write(`   [${i + 1}/${listItems.length}] ${cleanText(item.title).substring(0, 30)}...`);
        
        try {
          await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await delay(300);
          
          const details = await page.evaluate(() => {
            const mainFigure = document.querySelector('figure.main-image');
            let imageUrl = '';
            if (mainFigure) {
              const img = mainFigure.querySelector('img');
              if (img && img.src && img.src.includes('cdn.mediatheque')) {
                imageUrl = img.src;
              }
            }
            
            const bodyText = document.body.innerText;
            const dimMatch = bodyText.match(/H\.?\s*[\d,.]+\s*[;,]?\s*L\.?\s*[\d,.]+\s*cm/i);
            
            let medium = '';
            const descEl = document.querySelector('.field--name-field-description, .artwork-description');
            if (descEl) {
              medium = descEl.textContent?.trim() || '';
            }
            if (!medium && mainFigure) {
              const ariaLabel = mainFigure.getAttribute('aria-label') || '';
              const parts = ariaLabel.split(/\d{4}/);
              if (parts.length > 1) {
                medium = parts[parts.length - 1].trim();
              }
            }
            
            const accMatch = bodyText.match(/(?:RF|DO|INV|MI|OAO|LUX)\s*\d+[\s\d]*/i);
            
            return {
              imageUrl,
              dimensionsRaw: dimMatch ? dimMatch[0] : '',
              medium: medium.substring(0, 100),
              accessionNumber: accMatch ? accMatch[0].trim() : ''
            };
          });
          
          if (!details.imageUrl) {
            console.log(' ⚠️ no image');
            pageSkip++;
            continue;
          }
          
          const dimensions = formatDimensions(details.dimensionsRaw);
          
          artworks.push({
            id: `orsay-${slug}`,
            title: cleanText(item.title) || 'Untitled',
            artist: cleanText(item.artist) || 'Unknown',
            year: cleanText(item.year),
            image: details.imageUrl,
            dimensions,
            medium: details.medium,
            accessionNumber: details.accessionNumber,
            source: 'Musée d\'Orsay'
          });
          
          console.log(` ✓ ${dimensions || '-'}`);
          pageSuccess++;
          
        } catch (error) {
          console.log(` ⚠️ error`);
          pageSkip++;
        }
        
        await delay(DELAY_BETWEEN_DETAILS);
      }
      
      totalSuccess += pageSuccess;
      totalSkip += pageSkip;
      
      console.log(`   📊 Page result: +${pageSuccess} artworks (${pageSkip} skipped)`);
      console.log(`   📈 Total: ${artworks.length} artworks`);
      
      // Save progress periodically
      if ((pageNum + 1) % SAVE_INTERVAL === 0) {
        saveProgress(pageNum + 1, artworks);
        saveFinal(artworks);
        console.log(`   💾 Progress saved`);
      }
      
      await delay(DELAY_BETWEEN_PAGES);
    }
    
    // Final save
    saveFinal(artworks);
    
    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ Scraping complete!`);
    console.log(`📊 Total: ${artworks.length} artworks`);
    console.log(`⏭️  Skipped: ${totalSkip} (no image or error)`);
    console.log(`💾 Saved to: ${OUTPUT_FILE}`);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    // Save progress on error
    saveProgress(progress.lastPage || 0, artworks);
    saveFinal(artworks);
    console.log('💾 Progress saved before exit');
  } finally {
    await browser.close();
  }
}

scrapeOrsayFull().catch(console.error);
