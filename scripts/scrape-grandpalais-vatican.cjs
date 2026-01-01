#!/usr/bin/env node
/**
 * Grand Palais RMN - Vatican Museums Scraper
 * 
 * URL: https://images.grandpalaisrmn.fr/search-result?EVENT=WEBSHOP_SEARCH&SEARCHMODE=DEEP&CATEGORY[]=281634
 * Total: ~1797 artworks
 * 
 * Features:
 * - Placeholder image detection and retry
 * - Medium/category collection
 * - Batch processing with browser restart
 * 
 * Usage:
 *   node scripts/scrape-grandpalais-vatican.cjs --test    # Test with first 30 items
 *   node scripts/scrape-grandpalais-vatican.cjs           # Full scrape
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/vatican-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/vatican-progress.json');
const LOG_FILE = path.join(__dirname, '../logs/vatican-scrape.log');

const TEST_MODE = process.argv.includes('--test');
const BASE_URL = 'https://images.grandpalaisrmn.fr/search-result?EVENT=WEBSHOP_SEARCH&SEARCHMODE=DEEP&CATEGORY[]=281634';
const BATCH_SIZE = 50;
const MAX_RETRY = 3;

// Placeholder image patterns to detect and reject
const PLACEHOLDER_PATTERNS = [
  'placeholder',
  'no-image',
  'default-image',
  'blank.gif',
  'spacer.gif',
  '1x1',
  'data:image/gif',
  'eJx', // Base64 encoded tiny placeholder
  '/assets/img/default',
  'missing',
  'no_image'
];

const delay = ms => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });

function log(msg) {
  const line = `[${timestamp()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function isPlaceholderImage(url) {
  if (!url) return true;
  const lowerUrl = url.toLowerCase();
  return PLACEHOLDER_PATTERNS.some(pattern => lowerUrl.includes(pattern.toLowerCase()));
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
      data.scrapedIds = new Set(data.scrapedIds || []);
      return data;
    }
  } catch (e) {}
  return { artworks: [], scrapedIds: new Set(), lastPage: 1, placeholderRetryQueue: [] };
}

function saveProgress(data) {
  const toSave = {
    artworks: data.artworks,
    scrapedIds: [...data.scrapedIds],
    lastPage: data.lastPage,
    placeholderRetryQueue: data.placeholderRetryQueue || []
  };
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(toSave, null, 2));
}

async function getHighResImage(page, detailUrl, retryCount = 0) {
  try {
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(2000);
    
    // Try multiple image selectors
    const imageUrl = await page.evaluate(() => {
      // Priority order for image sources
      const selectors = [
        'meta[property="og:image"]',
        '.media-preview img',
        '.asset-image img',
        '.zoomable-image img',
        '.main-image img',
        'img.preview',
        'img[src*="asset"]'
      ];
      
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const src = el.content || el.src || el.getAttribute('data-src');
          if (src && src.startsWith('http')) return src;
        }
      }
      
      // Fallback: find largest image
      const imgs = [...document.querySelectorAll('img')];
      const validImgs = imgs.filter(img => {
        const src = img.src || '';
        return src.startsWith('http') && 
               !src.includes('logo') && 
               !src.includes('icon') &&
               !src.includes('placeholder') &&
               img.naturalWidth > 100;
      });
      
      if (validImgs.length > 0) {
        validImgs.sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight));
        return validImgs[0].src;
      }
      
      return null;
    });
    
    // Validate image is not placeholder
    if (isPlaceholderImage(imageUrl) && retryCount < MAX_RETRY) {
      log(`    ⚠️ Placeholder detected, retry ${retryCount + 1}/${MAX_RETRY}...`);
      await delay(3000);
      return getHighResImage(page, detailUrl, retryCount + 1);
    }
    
    return imageUrl;
  } catch (e) {
    if (retryCount < MAX_RETRY) {
      await delay(2000);
      return getHighResImage(page, detailUrl, retryCount + 1);
    }
    return null;
  }
}

async function scrapeDetailPage(page, mediaNumber) {
  // Use preview URL for metadata - this is where Grand Palais stores artwork info
  const previewUrl = `https://images.grandpalaisrmn.fr/preview?MEDIANUMBER=${mediaNumber}`;
  
  try {
    await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(2000);
    
    const details = await page.evaluate(() => {
      let title = '';
      let artist = '';
      let date = '';
      let dimensions = '';
      let medium = '';
      let category = '';
      let imageUrl = '';
      
      // Helper: Check if value looks like copyright info (NOT an artist)
      const isCopyrightInfo = (val) => {
        if (!val) return true;
        const lower = val.toLowerCase();
        return (
          val.includes('©') ||
          lower.includes('all rights reserved') ||
          lower.includes('adagp') ||
          lower.includes('scala') ||
          lower.includes('grandpalaisrmn') ||
          lower.includes('rights') ||
          lower.includes('droits') ||
          lower.includes('copyright') ||
          lower.includes('credit') ||
          lower.includes('photo ')
        );
      };
      
      // Grand Palais RMN uses .previewmeta blocks with .previewmeta-legend and .previewmeta-content
      const previewMetas = document.querySelectorAll('.previewmeta');
      previewMetas.forEach(meta => {
        const legend = meta.querySelector('.previewmeta-legend')?.textContent?.trim()?.toLowerCase() || '';
        const contentEl = meta.querySelector('.previewmeta-content');
        const value = contentEl?.textContent?.trim() || '';
        
        if (!value) return;
        
        // Skip credits/copyright blocks entirely
        if (legend.includes('credit') || legend.includes('crédit') || legend.includes('copyright') || legend.includes('droit') || legend.includes('price')) {
          return;
        }
        
        // Title (Series title)
        if (legend.includes('series title') || legend.includes('titre')) {
          if (!title) title = value;
        }
        // Author/Artist
        if (legend.includes('author') || legend.includes('auteur') || legend.includes('artist')) {
          if (!isCopyrightInfo(value)) {
            artist = value;
          }
        }
        // Period/Date  
        if (legend.includes('period') || legend.includes('période') || legend.includes('date') || legend.includes('dating')) {
          if (!date) date = value;
        }
        // Technique/Material
        if (legend.includes('technic') || legend.includes('technique') || legend.includes('medium') || legend.includes('material') || legend.includes('matériau')) {
          if (!medium) medium = value;
        }
        // Dimensions/Size (physical, not image pixels)
        if (legend.includes('dimension') && !legend.includes('image') && !legend.includes('size')) {
          if (!dimensions) dimensions = value;
        }
        // Category
        if (legend.includes('category') || legend.includes('catégorie')) {
          if (!category) category = value;
        }
      });
      
      // Get image from og:image meta tag
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage && ogImage.content) {
        imageUrl = ogImage.content;
      }
      
      // Fallback: get main preview image
      if (!imageUrl) {
        const mainImg = document.querySelector('.preview-image img, .media-preview img, img[src*="thumb.php"]');
        if (mainImg) imageUrl = mainImg.src;
      }
      
      return { title, artist, date, dimensions, medium, category, imageUrl };
    });
    
    // Validate and retry for placeholder
    if (isPlaceholderImage(details.imageUrl)) {
      const betterImage = await getHighResImage(page, previewUrl);
      if (betterImage) details.imageUrl = betterImage;
    }
    
    return details;
  } catch (e) {
    log(`  ⚠️ Detail error: ${e.message.substring(0, 50)}`);
    return null;
  }
}

async function scrapeListPage(page, pageNum) {
  const url = pageNum === 1 ? BASE_URL : `${BASE_URL}&PAGE=${pageNum}`;
  
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await delay(3000);
    
    // Accept cookies if present
    try {
      const acceptBtn = await page.$('button:has-text("Accept"), button:has-text("Accepter")');
      if (acceptBtn) {
        await acceptBtn.click();
        await delay(1000);
      }
    } catch (e) {}
    
    // Extract items from grid - Grand Palais specific selectors
    const items = await page.evaluate(() => {
      const results = [];
      // Grand Palais uses .media-item-medium with data-medianumber
      const mediaItems = document.querySelectorAll('.media-item-medium[data-medianumber]');
      
      mediaItems.forEach(item => {
        try {
          const mediaNumber = item.getAttribute('data-medianumber');
          if (!mediaNumber) return;
          
          // Find image in parent container
          const parent = item.closest('.media-item') || item.parentElement;
          const img = parent?.querySelector('img') || item.querySelector('img');
          
          results.push({
            id: mediaNumber,
            title: img?.alt || '',
            detailUrl: `https://images.grandpalaisrmn.fr/preview?MEDIANUMBER=${mediaNumber}`,
            thumbnail: img?.src || ''
          });
        } catch (e) {}
      });
      
      return results;
    });
    
    return items;
  } catch (e) {
    log(`  ⚠️ List page error: ${e.message.substring(0, 50)}`);
    return [];
  }
}

async function scrapeBatch(startPage, endPage, progress, maxItems) {
  log(`\n🔄 Starting batch: pages ${startPage}-${endPage}`);
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  try {
    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      if (progress.artworks.length >= maxItems) break;
      
      log(`\n📄 Page ${pageNum}: Fetching list...`);
      const items = await scrapeListPage(page, pageNum);
      log(`  Found ${items.length} items`);
      
      if (items.length === 0) {
        log('  No items found, might be end of results');
        break;
      }
      
      for (const item of items) {
        if (progress.artworks.length >= maxItems) break;
        if (progress.scrapedIds.has(item.id)) continue;
        
        log(`  [${progress.artworks.length + 1}/${maxItems}] ${item.title?.substring(0, 35) || item.id}...`);
        
        // Use mediaNumber for preview page
        const details = await scrapeDetailPage(page, item.id);
        
        const artwork = {
          id: item.id,
          title: details?.title || item.title,
          artist: details?.artist || '',
          year: details?.date || '',
          medium: details?.medium || '',
          category: details?.category || '',
          dimensions: details?.dimensions || '',
          image: details?.imageUrl || item.thumbnail,
          sourceUrl: `https://images.grandpalaisrmn.fr/preview?MEDIANUMBER=${item.id}`
        };
        
        // Check for placeholder
        const hasPlaceholder = isPlaceholderImage(artwork.image);
        if (hasPlaceholder) {
          progress.placeholderRetryQueue = progress.placeholderRetryQueue || [];
          progress.placeholderRetryQueue.push({
            id: item.id,
            detailUrl: item.detailUrl,
            retries: 0
          });
          log(`    ⚠️ Placeholder image - queued for retry`);
        }
        
        progress.artworks.push(artwork);
        progress.scrapedIds.add(item.id);
        
        const artistShort = artwork.artist?.substring(0, 25) || 'Unknown';
        const mediumShort = artwork.medium?.substring(0, 20) || '';
        log(`    ✓ ${artistShort} | ${artwork.year || 'No date'} | ${mediumShort}`);
        
        // Save progress every 10 items
        if (progress.artworks.length % 10 === 0) {
          progress.lastPage = pageNum;
          saveProgress(progress);
          log(`  💾 Progress: ${progress.artworks.length} items`);
        }
        
        await delay(800);
      }
      
      progress.lastPage = pageNum;
    }
  } finally {
    await browser.close();
    log(`✅ Batch complete`);
  }
}

async function retryPlaceholders(progress) {
  if (!progress.placeholderRetryQueue || progress.placeholderRetryQueue.length === 0) {
    return;
  }
  
  log(`\n🔄 Retrying ${progress.placeholderRetryQueue.length} placeholder images...`);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  const stillPlaceholder = [];
  
  for (const item of progress.placeholderRetryQueue) {
    if (item.retries >= MAX_RETRY) {
      log(`  ❌ Max retries for ${item.id}`);
      continue;
    }
    
    log(`  Retrying ${item.id} (attempt ${item.retries + 1})...`);
    
    const newImage = await getHighResImage(page, item.detailUrl);
    
    if (newImage && !isPlaceholderImage(newImage)) {
      // Update artwork in array
      const idx = progress.artworks.findIndex(a => a.id === item.id);
      if (idx !== -1) {
        progress.artworks[idx].image = newImage;
        log(`    ✓ Fixed!`);
      }
    } else {
      item.retries++;
      stillPlaceholder.push(item);
      log(`    ⚠️ Still placeholder`);
    }
    
    await delay(1000);
  }
  
  progress.placeholderRetryQueue = stillPlaceholder;
  await browser.close();
  
  // Recursive retry if still have placeholders
  if (stillPlaceholder.length > 0 && stillPlaceholder.some(i => i.retries < MAX_RETRY)) {
    await delay(5000);
    await retryPlaceholders(progress);
  }
}

async function main() {
  // Ensure log directory exists
  const logDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  
  log('🏛️ Grand Palais RMN - Vatican Museums Scraper');
  log(`📍 URL: ${BASE_URL}`);
  log(TEST_MODE ? '🧪 테스트 모드 (30개)\n' : '📍 전체 모드 (1797개)\n');
  
  const progress = loadProgress();
  const maxItems = TEST_MODE ? 30 : 2000; // Slightly over to catch all
  
  // First, get total count
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await ctx.newPage();
  
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await delay(3000);
  
  // Accept cookies
  try {
    const btn = await page.$('button:has-text("Accept"), button:has-text("Accepter")');
    if (btn) { await btn.click(); await delay(1000); }
  } catch (e) {}
  
  // Get total count
  let totalCount = 0;
  try {
    const countText = await page.$eval('.count-search-results, .result-count, .total-results', el => el.textContent);
    const match = countText.match(/(\d[\d\s,]*)/);
    if (match) totalCount = parseInt(match[0].replace(/[\s,]/g, ''));
  } catch (e) {
    // Try alternative
    totalCount = await page.$$eval('.media-item, .asset-item', items => items.length) * 50; // Estimate
  }
  
  log(`📊 Total results: ${totalCount || 'unknown (estimating ~1797)'}`);
  await browser.close();
  
  // Calculate pages (48 items per page typical)
  const itemsPerPage = 48;
  const totalPages = Math.ceil((totalCount || 1797) / itemsPerPage);
  const startPage = progress.lastPage || 1;
  
  log(`📄 Pages: ${startPage} to ~${totalPages}`);
  log(`📦 Already scraped: ${progress.artworks.length} items\n`);
  
  // Scrape in batches
  const pagesPerBatch = 5;
  
  for (let batchStart = startPage; batchStart <= totalPages && progress.artworks.length < maxItems; batchStart += pagesPerBatch) {
    const batchEnd = Math.min(batchStart + pagesPerBatch - 1, totalPages);
    await scrapeBatch(batchStart, batchEnd, progress, maxItems);
    saveProgress(progress);
    
    // Browser restart between batches
    if (batchEnd < totalPages && progress.artworks.length < maxItems) {
      log(`\n⏳ Batch 휴식 5초...`);
      await delay(5000);
    }
  }
  
  // Retry placeholders
  await retryPlaceholders(progress);
  
  // Final placeholder check
  const placeholderCount = progress.artworks.filter(a => isPlaceholderImage(a.image)).length;
  const withImages = progress.artworks.filter(a => a.image && !isPlaceholderImage(a.image)).length;
  
  // Save final results
  const results = {
    museum: "Vatican Museums",
    museumId: 'vatican-museums',
    location: 'Vatican City',
    collection: 'Vatican Collection via Grand Palais RMN',
    type: 'permanent',
    scrapedAt: new Date().toISOString(),
    totalArtworks: progress.artworks.length,
    artworksWithImages: withImages,
    placeholderImages: placeholderCount,
    artworks: progress.artworks
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  
  log('\n' + '='.repeat(50));
  log('=== 완료 ===');
  log(`작품: ${results.totalArtworks}`);
  log(`이미지: ${results.artworksWithImages}`);
  log(`플레이스홀더: ${placeholderCount}`);
  log(`저장: ${OUTPUT_FILE}`);
  
  if (placeholderCount > 0) {
    log(`\n⚠️ ${placeholderCount}개 플레이스홀더 남음 - 재실행 권장`);
  }
}

main().catch(e => {
  log(`❌ Fatal error: ${e.message}`);
  process.exit(1);
});
