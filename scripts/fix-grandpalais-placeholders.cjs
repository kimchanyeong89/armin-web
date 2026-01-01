/**
 * Fix Grand Palais RMN Placeholder Images
 * 
 * Scans collections for placeholder images (?eJx... URLs that return 403)
 * and re-fetches the correct image URLs from source pages.
 * 
 * Items where no real image exists on the source page will be removed.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../public/data');
const PROGRESS_FILE = path.join(__dirname, '../downloads/grandpalais-fix-progress.json');

const delay = ms => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = (prefix, msg) => console.log(`[${timestamp()}] [${prefix}] ${msg}`);

// Collections to check (Grand Palais RMN sourced)
const COLLECTIONS_TO_CHECK = [
  'musee-chagall-collection.json',
  'versailles-collection.json',
  'macval-collection.json',
  'mucem-collection.json',
  'musee-conde-drawings.json',
  'lille-paintings-new.json',
  'carnavalet-prints.json',
  'carnavalet-paintings.json',
  'musee-fabre-collection.json',
];

// ═══════════════════════════════════════════════════════════════
// Identify placeholder images
// ═══════════════════════════════════════════════════════════════
function isPlaceholderUrl(imageUrl) {
  if (!imageUrl) return true;
  // Placeholder URLs have obfuscated parameters starting with ?eJx
  if (imageUrl.includes('?eJx')) return true;
  // Valid URLs have ?ID=number format
  return false;
}

// ═══════════════════════════════════════════════════════════════
// Fetch real image URL from source page (with retry logic)
// ═══════════════════════════════════════════════════════════════
async function fetchRealImageUrl(page, sourceUrl, retries = 3) {
  if (!sourceUrl) return null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await delay(1500); // Increased delay to avoid rate limiting
      
      // Get image URL from meta tags (most reliable)
      const imageUrl = await page.evaluate(() => {
        // Priority 1: og:image meta tag
        const ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage?.content && ogImage.content.includes('?ID=')) {
          return ogImage.content;
        }
        
        // Priority 2: twitter:image meta tag
        const twitterImage = document.querySelector('meta[name="twitter:image"]');
        if (twitterImage?.content && twitterImage.content.includes('?ID=')) {
          return twitterImage.content;
        }
        
        // Priority 3: Look for the main preview image with ID parameter
        const previewImgs = document.querySelectorAll('img.medium[src*="?ID="]');
        for (const img of previewImgs) {
          if (img.src && img.src.includes('?ID=')) {
            return img.src;
          }
        }
        
        // Priority 4: Any image with proper ID format in src
        const allImgs = document.querySelectorAll('img[src*="thumb.php"][src*="?ID="]');
        if (allImgs.length > 0) {
          return allImgs[0].src;
        }
        
        // Return special marker if page loaded but no image found (vs failed to load)
        const pageTitle = document.querySelector('title')?.textContent || '';
        if (pageTitle.includes('GrandPalais')) {
          return 'NO_IMAGE_ON_PAGE';
        }
        
        return null;
      });
      
      if (imageUrl === 'NO_IMAGE_ON_PAGE') {
        return null; // Confirmed no image on page
      }
      
      if (imageUrl) {
        return imageUrl; // Success
      }
      
      // If no image found, wait and retry
      if (attempt < retries) {
        await delay(2000 * attempt);
      }
    } catch (e) {
      if (attempt < retries) {
        await delay(3000 * attempt); // Longer delay on error
      }
    }
  }
  
  return 'FETCH_FAILED'; // Special marker for failed fetches
}

// ═══════════════════════════════════════════════════════════════
// Process a single collection
// ═══════════════════════════════════════════════════════════════
async function processCollection(browser, filename) {
  const filePath = path.join(DATA_DIR, filename);
  
  if (!fs.existsSync(filePath)) {
    log(filename, '❌ File not found');
    return { fixed: 0, removed: 0, total: 0 };
  }
  
  log(filename, '📂 Loading collection...');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const objects = data.objects || [];
  
  log(filename, `📊 Total objects: ${objects.length}`);
  
  // Find items with placeholder images
  const placeholderItems = objects.filter(obj => isPlaceholderUrl(obj.image));
  log(filename, `🔍 Found ${placeholderItems.length} placeholder images`);
  
  if (placeholderItems.length === 0) {
    log(filename, '✅ No placeholders to fix');
    return { fixed: 0, removed: 0, total: objects.length };
  }
  
  // Load progress if exists
  let progress = {};
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    } catch (e) {}
  }
  
  const collectionProgress = progress[filename] || { 
    processed: {},
    fixed: 0,
    noImage: 0 
  };
  
  // Create browser context
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const PARALLEL_PAGES = 3; // Reduced to avoid rate limiting
  log(filename, `🌐 Creating ${PARALLEL_PAGES} browser pages...`);
  const pages = await Promise.all(
    Array.from({ length: PARALLEL_PAGES }, () => context.newPage())
  );
  log(filename, `✅ Browser pages ready`);
  
  let fixed = 0;
  let noImage = 0;
  const toRemove = [];
  
  // Process items that haven't been processed yet
  const itemsToProcess = placeholderItems.filter(
    item => !collectionProgress.processed[item.id]
  );
  
  log(filename, `📝 Items to process: ${itemsToProcess.length} (${Object.keys(collectionProgress.processed).length} already done)`);
  
  if (itemsToProcess.length === 0) {
    await Promise.all(pages.map(p => p.close()));
    await context.close();
    return { fixed: 0, removed: 0, total: objects.length };
  }
  
  log(filename, `🔄 Starting processing loop...`);
  
  for (let i = 0; i < itemsToProcess.length; i += PARALLEL_PAGES) {
    const batch = itemsToProcess.slice(i, i + PARALLEL_PAGES);
    
    await Promise.all(batch.map(async (item, batchIdx) => {
      const page = pages[batchIdx % PARALLEL_PAGES];
      
      try {
        const realImageUrl = await fetchRealImageUrl(page, item.sourceUrl);
        
        if (realImageUrl === 'FETCH_FAILED') {
          // Fetch failed - skip for now, will retry later
          // Don't mark as processed so it can be retried
          return;
        } else if (realImageUrl && realImageUrl.includes('?ID=')) {
          // Found real image - update it
          item.image = realImageUrl;
          collectionProgress.processed[item.id] = { status: 'fixed', url: realImageUrl };
          fixed++;
        } else {
          // No real image found on page - mark for removal
          collectionProgress.processed[item.id] = { status: 'noImage' };
          toRemove.push(item.id);
          noImage++;
        }
      } catch (e) {
        // Don't mark as processed on error so it can be retried
        log(filename, `   ⚠️ Error on ${item.id}: ${e.message}`);
      }
    }));
    
    // Progress logging
    const processed = Math.min(i + PARALLEL_PAGES, itemsToProcess.length);
    if (processed % 50 === 0 || processed === itemsToProcess.length) {
      log(filename, `   Progress: ${processed}/${itemsToProcess.length} | Fixed: ${fixed} | No Image: ${noImage}`);
      
      // Save progress
      collectionProgress.fixed = fixed;
      collectionProgress.noImage = noImage;
      progress[filename] = collectionProgress;
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    }
    
    // Longer delay between batches to avoid rate limiting
    await delay(500);
  }
  
  await Promise.all(pages.map(p => p.close()));
  await context.close();
  
  // Apply fixes to the data
  log(filename, `🔧 Applying fixes...`);
  
  // Update image URLs for fixed items
  let updateCount = 0;
  for (const obj of objects) {
    const processedInfo = collectionProgress.processed[obj.id];
    if (processedInfo?.status === 'fixed' && processedInfo.url) {
      obj.image = processedInfo.url;
      updateCount++;
    }
  }
  
  // Remove items with no real images
  const idsToRemove = new Set(
    Object.entries(collectionProgress.processed)
      .filter(([_, info]) => info.status === 'noImage')
      .map(([id, _]) => id)
  );
  
  const originalCount = objects.length;
  const filteredObjects = objects.filter(obj => !idsToRemove.has(obj.id));
  const removedCount = originalCount - filteredObjects.length;
  
  // Update data
  data.objects = filteredObjects;
  data.totalItems = filteredObjects.length;
  data.fixedAt = new Date().toISOString();
  data.fixStats = {
    originalCount,
    fixedImages: updateCount,
    removedNoImage: removedCount,
    finalCount: filteredObjects.length
  };
  
  // Save updated file
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  log(filename, `✅ Saved: ${updateCount} images fixed, ${removedCount} items removed`);
  log(filename, `   Final count: ${filteredObjects.length} objects`);
  
  return { fixed: updateCount, removed: removedCount, total: filteredObjects.length };
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════
async function main() {
  const args = process.argv.slice(2);
  const testMode = args.includes('--test');
  
  log('MAIN', '🚀 Grand Palais Placeholder Image Fixer');
  log('MAIN', `   Mode: ${testMode ? 'TEST (first 10 items only)' : 'FULL'}`);
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox']
  });
  
  try {
    const results = {};
    
    for (const filename of COLLECTIONS_TO_CHECK) {
      log('MAIN', `\n${'═'.repeat(60)}`);
      log('MAIN', `Processing: ${filename}`);
      log('MAIN', `${'═'.repeat(60)}`);
      
      if (testMode) {
        // In test mode, just analyze without fixing
        const filePath = path.join(DATA_DIR, filename);
        if (fs.existsSync(filePath)) {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          const objects = data.objects || [];
          const placeholders = objects.filter(obj => isPlaceholderUrl(obj.image));
          
          log(filename, `📊 Total: ${objects.length}, Placeholders: ${placeholders.length}`);
          
          // Test fetch a few
          const context = await browser.newContext();
          const page = await context.newPage();
          
          log(filename, '🔍 Testing first 5 placeholder items...');
          for (let i = 0; i < Math.min(5, placeholders.length); i++) {
            const item = placeholders[i];
            const realUrl = await fetchRealImageUrl(page, item.sourceUrl);
            log(filename, `   ${i + 1}. ${item.title?.substring(0, 40) || 'Unknown'}`);
            log(filename, `      Source: ${item.sourceUrl}`);
            log(filename, `      Original: ${item.image?.substring(0, 60)}...`);
            log(filename, `      Fixed: ${realUrl ? realUrl.substring(0, 60) + '...' : '❌ NO IMAGE'}`);
          }
          
          await context.close();
        }
      } else {
        results[filename] = await processCollection(browser, filename);
      }
    }
    
    if (!testMode) {
      log('MAIN', '\n📋 Summary:');
      for (const [file, result] of Object.entries(results)) {
        log('MAIN', `   ${file}: ${result.fixed} fixed, ${result.removed} removed, ${result.total} final`);
      }
    }
    
  } finally {
    await browser.close();
  }
  
  log('MAIN', '\n✅ Done!');
}

main().catch(console.error);
