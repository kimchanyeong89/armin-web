/**
 * Musée d'Orsay Collection Scraper - 병렬 5개 버전
 * 
 * 342 페이지 × 15개 = ~5,100 작품
 * - 병렬 5개 동시 처리로 ~5배 빠름
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

// 설정
const MAX_PAGES = 350;
const PARALLEL_COUNT = 5; // 동시 처리 수
const DELAY_BETWEEN_BATCHES = 500;
const SAVE_INTERVAL = 5;

// Placeholder images to skip (these appear on 404/error pages)
const PLACEHOLDER_IMAGES = [
  'jfk1bvf3diwyuww', // 404 page placeholder
];

function isPlaceholderImage(url) {
  return PLACEHOLDER_IMAGES.some(p => url.includes(p));
}

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
  return { lastPage: 0, artworks: [], failedItems: [] };
}

function saveProgress(pageNum, artworks, failedItems = []) {
  ensureDir(PROGRESS_DIR);
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ lastPage: pageNum, artworks, failedItems }, null, 2));
}

// Save failed items for retry
const FAILED_FILE = path.join(PROGRESS_DIR, 'failed-items.json');

function saveFailedItems(items) {
  ensureDir(PROGRESS_DIR);
  fs.writeFileSync(FAILED_FILE, JSON.stringify(items, null, 2));
}

function loadFailedItems() {
  try {
    if (fs.existsSync(FAILED_FILE)) {
      return JSON.parse(fs.readFileSync(FAILED_FILE, 'utf-8'));
    }
  } catch (e) {}
  return [];
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

// 단일 작품 상세 페이지 스크래핑
async function scrapeDetailPage(page, item) {
  const detailUrl = item.href.startsWith('http') ? item.href : `${BASE_URL}${item.href}`;
  const urlParts = item.href.split('/');
  const slug = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
  
  try {
    await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(500); // Wait for images to load
    
    const details = await page.evaluate(() => {
      // Check if page is 404/not found
      const pageTitle = document.querySelector('h1')?.textContent?.trim() || '';
      if (pageTitle.toLowerCase().includes('page non trouvée') || 
          pageTitle.toLowerCase().includes('not found') ||
          pageTitle.toLowerCase().includes('404')) {
        return { imageUrl: '', is404: true };
      }
      
      // Try multiple selectors for the main artwork image
      let imageUrl = '';
      
      // Method 1: First CDN image (main artwork image is usually first)
      const cdnImgs = document.querySelectorAll('img[src*="cdn.mediatheque"]');
      for (const img of cdnImgs) {
        if (img.src && img.src.includes('cdn.mediatheque.epmoo.fr')) {
          imageUrl = img.src;
          break;
        }
      }
      
      // Method 2: figure.main-image fallback
      if (!imageUrl) {
        const mainFigure = document.querySelector('figure.main-image');
        if (mainFigure) {
          const img = mainFigure.querySelector('img');
          if (img && img.src && img.src.includes('cdn.mediatheque')) {
            imageUrl = img.src;
          }
        }
      }
      
      const bodyText = document.body.innerText;
      const dimMatch = bodyText.match(/H\.?\s*[\d,.]+\s*[;,]?\s*L\.?\s*[\d,.]+\s*cm/i);
      
      // Get medium from aria-label or page content
      let medium = '';
      const mainFigure = document.querySelector('figure.main-image');
      if (mainFigure) {
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
    
    if (!details.imageUrl || details.is404) {
      return null;
    }
    
    return {
      id: `orsay-${slug}`,
      title: cleanText(item.title) || 'Untitled',
      artist: cleanText(item.artist) || 'Unknown',
      year: cleanText(item.year),
      image: details.imageUrl,
      dimensions: formatDimensions(details.dimensionsRaw),
      medium: details.medium,
      accessionNumber: details.accessionNumber,
      source: 'Musée d\'Orsay'
    };
  } catch (error) {
    return null;
  }
}

async function scrapeOrsayParallel() {
  console.log('🎨 Musée d\'Orsay Parallel Scraper (5x speed)\n');
  console.log('📊 Target: ~5,100 paintings (342 pages)\n');
  
  const progress = loadProgress();
  let artworks = progress.artworks || [];
  let failedItems = progress.failedItems || []; // Track failed items for retry
  const startPage = progress.lastPage || 0;
  const existingIds = new Set(artworks.map(a => a.id));
  const existingImages = new Set(artworks.map(a => a.image)); // Track unique images
  
  // Remove duplicates from existing data (but save them for retry)
  const uniqueArtworks = [];
  const seenImages = new Set();
  const duplicateItems = [];
  for (const a of artworks) {
    if (!seenImages.has(a.image)) {
      seenImages.add(a.image);
      uniqueArtworks.push(a);
    } else {
      // This was a duplicate - save for potential retry
      duplicateItems.push({ id: a.id, title: a.title, reason: 'duplicate_image', image: a.image });
    }
  }
  if (uniqueArtworks.length < artworks.length) {
    console.log(`🧹 Found ${artworks.length - uniqueArtworks.length} duplicate images - saved for retry\n`);
    artworks = uniqueArtworks;
    failedItems = [...failedItems, ...duplicateItems];
  }
  
  if (startPage > 0) {
    console.log(`📌 Resuming from page ${startPage + 1}, ${artworks.length} artworks already collected\n`);
  }
  if (failedItems.length > 0) {
    console.log(`⚠️ ${failedItems.length} items pending retry\n`);
  }
  
  const browser = await chromium.launch({ headless: true });
  
  // 병렬 처리를 위한 여러 페이지 생성
  const contexts = await Promise.all(
    Array(PARALLEL_COUNT).fill().map(() => 
      browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        viewport: { width: 1920, height: 1080 }
      })
    )
  );
  const pages = await Promise.all(contexts.map(ctx => ctx.newPage()));
  
  // 리스트 페이지용 별도 페이지
  const listContext = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  const listPage = await listContext.newPage();
  
  let totalSuccess = artworks.length;
  let totalSkip = 0;
  
  try {
    for (let pageNum = startPage; pageNum < MAX_PAGES; pageNum++) {
      const pageUrl = pageNum === 0 ? SEARCH_URL : `${SEARCH_URL}&page=${pageNum}`;
      
      console.log(`\n📄 Page ${pageNum + 1}/${MAX_PAGES}`);
      
      try {
        await listPage.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
      } catch (e) {
        console.log(`   ⚠️ Page load timeout, retrying...`);
        await delay(3000);
        try {
          await listPage.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (e2) {
          console.log(`   ❌ Page load failed, skipping`);
          continue;
        }
      }
      
      // 쿠키 배너 (첫 페이지만)
      if (pageNum === startPage) {
        try {
          const cookieBtn = await listPage.$('#onetrust-accept-btn-handler');
          if (cookieBtn) {
            await cookieBtn.click();
            await delay(1000);
          }
        } catch (e) {}
      }
      
      // 리스트 추출
      const listItems = await listPage.$$eval('article.artwork-masonry', articles => {
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
      
      if (listItems.length === 0) {
        console.log(`   ✅ No more items, reached end of collection`);
        break;
      }
      
      // 이미 스크래핑된 것 제외
      const itemsToScrape = listItems.filter(item => {
        if (!item.href) return false;
        const urlParts = item.href.split('/');
        const slug = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
        return !existingIds.has(`orsay-${slug}`);
      });
      
      console.log(`   Found ${listItems.length} artworks (${itemsToScrape.length} new)`);
      
      if (itemsToScrape.length === 0) {
        continue;
      }
      
      // 병렬 처리: 5개씩 배치로 처리
      let pageSuccess = 0;
      let pageSkip = 0;
      
      for (let i = 0; i < itemsToScrape.length; i += PARALLEL_COUNT) {
        const batch = itemsToScrape.slice(i, i + PARALLEL_COUNT);
        
        const results = await Promise.all(
          batch.map((item, idx) => scrapeDetailPage(pages[idx], item))
        );
        
        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          const item = batch[j];
          
          if (result && !existingImages.has(result.image) && !isPlaceholderImage(result.image)) {
            artworks.push(result);
            existingIds.add(result.id);
            existingImages.add(result.image);
            pageSuccess++;
            process.stdout.write('✓');
          } else if (result && existingImages.has(result.image)) {
            // Duplicate image - save for retry
            failedItems.push({
              href: item.href,
              title: item.title,
              artist: item.artist,
              reason: 'duplicate_image',
              duplicateOf: result.image
            });
            pageSkip++;
            process.stdout.write('⚠');
          } else if (result && isPlaceholderImage(result.image)) {
            // Placeholder/404 - save for retry
            failedItems.push({
              href: item.href,
              title: item.title,
              artist: item.artist,
              reason: 'placeholder_or_404',
              image: result.image
            });
            pageSkip++;
            process.stdout.write('⚠');
          } else {
            // Failed to scrape - save for retry
            failedItems.push({
              href: item.href,
              title: item.title,
              artist: item.artist,
              reason: 'scrape_failed'
            });
            pageSkip++;
            process.stdout.write('✗');
          }
        }
        
        await delay(DELAY_BETWEEN_BATCHES);
      }
      
      totalSuccess += pageSuccess;
      totalSkip += pageSkip;
      
      console.log(`\n   📊 +${pageSuccess} artworks | Total: ${artworks.length} | Failed: ${failedItems.length}`);
      
      // 중간 저장
      if ((pageNum + 1) % SAVE_INTERVAL === 0) {
        saveProgress(pageNum + 1, artworks, failedItems);
        saveFinal(artworks);
        saveFailedItems(failedItems);
        console.log(`   💾 Progress saved`);
      }
    }
    
    // 최종 저장
    saveFinal(artworks);
    saveFailedItems(failedItems);
    
    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ First pass complete!`);
    console.log(`📊 Total: ${artworks.length} artworks`);
    console.log(`⏭️  Skipped: ${totalSkip}`);
    console.log(`⚠️  Failed items for retry: ${failedItems.length}`);
    
    // Retry failed items
    if (failedItems.length > 0) {
      console.log(`\n🔄 Retrying ${failedItems.length} failed items...\n`);
      
      const retryPage = pages[0]; // Use first page for retries
      let retrySuccess = 0;
      const stillFailed = [];
      
      for (const failed of failedItems) {
        if (!failed.href) {
          stillFailed.push(failed);
          continue;
        }
        
        try {
          const detailUrl = failed.href.startsWith('http') ? failed.href : `${BASE_URL}${failed.href}`;
          await retryPage.goto(detailUrl, { waitUntil: 'networkidle', timeout: 30000 });
          await delay(1000); // Extra wait for retry
          
          const details = await retryPage.evaluate(() => {
            const pageTitle = document.querySelector('h1')?.textContent?.trim() || '';
            if (pageTitle.toLowerCase().includes('page non trouvée') || pageTitle.toLowerCase().includes('not found')) {
              return { imageUrl: '', is404: true };
            }
            const cdnImgs = document.querySelectorAll('img[src*="cdn.mediatheque"]');
            for (const img of cdnImgs) {
              if (img.src && img.src.includes('cdn.mediatheque.epmoo.fr')) {
                return { imageUrl: img.src };
              }
            }
            return { imageUrl: '' };
          });
          
          if (details.imageUrl && !existingImages.has(details.imageUrl) && !isPlaceholderImage(details.imageUrl)) {
            const urlParts = failed.href.split('/');
            const slug = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
            
            artworks.push({
              id: `orsay-${slug}`,
              title: cleanText(failed.title) || 'Untitled',
              artist: cleanText(failed.artist) || 'Unknown',
              year: '',
              image: details.imageUrl,
              dimensions: '',
              medium: '',
              source: 'Musée d\'Orsay'
            });
            existingImages.add(details.imageUrl);
            retrySuccess++;
            process.stdout.write('✓');
          } else {
            stillFailed.push({ ...failed, retryReason: details.is404 ? '404' : 'still_duplicate' });
            process.stdout.write('✗');
          }
        } catch (e) {
          stillFailed.push({ ...failed, retryReason: 'error', error: e.message });
          process.stdout.write('✗');
        }
        
        await delay(300);
      }
      
      console.log(`\n\n🔄 Retry complete: ${retrySuccess} recovered, ${stillFailed.length} still failed`);
      saveFailedItems(stillFailed);
      saveFinal(artworks);
    }
    
    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ Scraping complete!`);
    console.log(`📊 Final total: ${artworks.length} artworks`);
    console.log(`💾 Saved to: ${OUTPUT_FILE}`);
    if (failedItems.length > 0) {
      console.log(`⚠️  Failed items log: ${FAILED_FILE}`);
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    saveProgress(progress.lastPage || 0, artworks, failedItems);
    saveFinal(artworks);
    saveFailedItems(failedItems);
    console.log('💾 Progress saved before exit');
  } finally {
    await browser.close();
  }
}

scrapeOrsayParallel().catch(console.error);
