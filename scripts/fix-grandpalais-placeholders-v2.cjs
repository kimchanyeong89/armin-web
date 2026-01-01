#!/usr/bin/env node
/**
 * Grand Palais Placeholder Image Fixer
 * 
 * Scans JSON files for placeholder images and re-fetches high-res versions
 * 
 * Usage:
 *   node scripts/fix-grandpalais-placeholders-v2.cjs vatican-collection.json
 *   node scripts/fix-grandpalais-placeholders-v2.cjs --all  # Fix all grandpalais files
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../public/data');
const LOG_FILE = path.join(__dirname, '../logs/placeholder-fix.log');
const MAX_RETRY = 3;

// Placeholder image patterns to detect
const PLACEHOLDER_PATTERNS = [
  'placeholder',
  'no-image',
  'default-image',
  'blank.gif',
  'spacer.gif',
  '1x1',
  'data:image/gif',
  'eJx', // Base64 encoded tiny placeholder from Grand Palais
  '/assets/img/default',
  'missing',
  'no_image',
  'empty'
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
  if (typeof url !== 'string') return true;
  const lowerUrl = url.toLowerCase();
  return PLACEHOLDER_PATTERNS.some(pattern => lowerUrl.includes(pattern.toLowerCase()));
}

async function fetchNewImage(page, mediaNumber) {
  const previewUrl = `https://images.grandpalaisrmn.fr/preview?MEDIANUMBER=${mediaNumber}`;
  
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    try {
      await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await delay(2000);
      
      const imageUrl = await page.evaluate(() => {
        // Try og:image first (usually high quality)
        const ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage && ogImage.content) return ogImage.content;
        
        // Try preview image
        const previewImg = document.querySelector('.preview-image img, img[src*="thumb.php"]');
        if (previewImg && previewImg.src) return previewImg.src;
        
        // Try any image with media number
        const anyImg = document.querySelector('img[src*="grandpalais"]');
        if (anyImg && anyImg.src) return anyImg.src;
        
        return null;
      });
      
      if (imageUrl && !isPlaceholderImage(imageUrl)) {
        return imageUrl;
      }
      
      await delay(2000);
    } catch (e) {
      await delay(3000);
    }
  }
  
  return null;
}

async function processFile(filename) {
  const filePath = path.join(DATA_DIR, filename);
  
  if (!fs.existsSync(filePath)) {
    log(`❌ File not found: ${filename}`);
    return;
  }
  
  log(`\n📂 Processing: ${filename}`);
  
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const artworks = data.objects || data.artworks || [];
  
  // Find placeholders
  const placeholders = [];
  artworks.forEach((artwork, idx) => {
    const imageField = artwork.image || artwork.imageUrl;
    if (isPlaceholderImage(imageField)) {
      placeholders.push({
        index: idx,
        id: artwork.id || artwork.mediaNumber,
        mediaNumber: artwork.mediaNumber || artwork.id
      });
    }
  });
  
  log(`📊 Found ${placeholders.length} placeholder images out of ${artworks.length} total`);
  
  if (placeholders.length === 0) {
    log(`✅ No placeholders to fix!`);
    return;
  }
  
  // Launch browser to fix placeholders
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  let fixed = 0;
  let failed = 0;
  
  for (let i = 0; i < placeholders.length; i++) {
    const item = placeholders[i];
    log(`  [${i + 1}/${placeholders.length}] Fixing ${item.mediaNumber}...`);
    
    const newImage = await fetchNewImage(page, item.mediaNumber);
    
    if (newImage) {
      // Update the artwork
      if (artworks[item.index].image !== undefined) {
        artworks[item.index].image = newImage;
      }
      if (artworks[item.index].imageUrl !== undefined) {
        artworks[item.index].imageUrl = newImage;
      }
      fixed++;
      log(`    ✓ Fixed!`);
    } else {
      failed++;
      log(`    ⚠️ Still placeholder`);
    }
    
    // Save progress every 20 items
    if ((i + 1) % 20 === 0) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      log(`  💾 Progress saved: ${fixed} fixed`);
    }
    
    await delay(500);
  }
  
  await browser.close();
  
  // Final save
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  
  log(`\n=== ${filename} 완료 ===`);
  log(`수정됨: ${fixed}`);
  log(`실패: ${failed}`);
  log(`남은 플레이스홀더: ${failed}`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node fix-grandpalais-placeholders-v2.cjs <file.json>');
    console.log('       node fix-grandpalais-placeholders-v2.cjs --all');
    process.exit(1);
  }
  
  // Ensure log directory
  const logDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  
  log('🔧 Grand Palais Placeholder Image Fixer');
  
  if (args[0] === '--all') {
    // Find all grandpalais-related JSON files
    const files = fs.readdirSync(DATA_DIR).filter(f => 
      f.endsWith('.json') && 
      (f.includes('vatican') || f.includes('conde') || f.includes('versailles') || 
       f.includes('guimet') || f.includes('mucem') || f.includes('fabre') ||
       f.includes('chagall') || f.includes('piscine') || f.includes('macval') ||
       f.includes('petit-palais') || f.includes('carnavalet') || f.includes('lille') ||
       f.includes('rouen') || f.includes('grandpalais'))
    );
    
    log(`📋 Found ${files.length} files to check`);
    
    for (const file of files) {
      await processFile(file);
    }
  } else {
    await processFile(args[0]);
  }
  
  log('\n✅ All done!');
}

main().catch(e => {
  log(`❌ Error: ${e.message}`);
  process.exit(1);
});
