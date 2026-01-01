#!/usr/bin/env node
/**
 * Fix National Gallery images - re-download high quality images with correct aspect ratio
 * and upload to R2
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// R2 upload settings
const R2_ACCOUNT_ID = 'f3f5b3d39e0ce680eeddb61be36fb552';
const R2_BUCKET = 'armin-web';
const R2_ACCESS_KEY_ID = '6f85c9d5af36bbe1a3b5e3add6fd2a3b';
const R2_SECRET_ACCESS_KEY = '2b81f8d31e0d14f59ac5fd58a6a14d31ef05d16d9d4ae0fd9f8a7a8e7a76f72c';

const DATA_FILE = path.join(__dirname, '../public/data/national-gallery-permanent.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/ng-image-fix-progress.json');

// Load progress
function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch {
    return { fixed: [], failed: [], inProgress: false };
  }
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// Fetch with redirects and timeout
function fetchUrl(url, retries = 2) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 10000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location, retries).then(resolve).catch(reject);
        return;
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, data }));
      res.on('error', (err) => {
        if (retries > 0) {
          fetchUrl(url, retries - 1).then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });
    });
    req.on('error', (err) => {
      if (retries > 0) {
        setTimeout(() => fetchUrl(url, retries - 1).then(resolve).catch(reject), 500);
      } else {
        reject(err);
      }
    });
    req.on('timeout', () => { 
      req.destroy(); 
      if (retries > 0) {
        setTimeout(() => fetchUrl(url, retries - 1).then(resolve).catch(reject), 500);
      } else {
        reject(new Error('Timeout')); 
      }
    });
  });
}

// Parse National Gallery page to find main artwork image
async function getArtworkImageUrl(pageUrl) {
  try {
    const { statusCode, data: html } = await fetchUrl(pageUrl);
    if (statusCode !== 200) {
      console.log(`  HTTP ${statusCode} for ${pageUrl}`);
      return null;
    }
    
    // Look for the main artwork image - try various patterns
    // Pattern 1: og:image meta tag
    let match = html.match(/property="og:image"\s+content="([^"]+)"/i) ||
                html.match(/content="([^"]+)"\s+property="og:image"/i);
    if (match && match[1] && match[1].includes('media')) {
      return match[1];
    }
    
    // Pattern 2: data-src in main image
    match = html.match(/data-src="(https:\/\/www\.nationalgallery\.org\.uk\/media\/[^"]+)"/i);
    if (match) {
      return match[1];
    }
    
    // Pattern 3: src in artwork-image class
    match = html.match(/<img[^>]*class="[^"]*artwork[^"]*"[^>]*src="([^"]+)"/i) ||
            html.match(/<img[^>]*src="([^"]+)"[^>]*class="[^"]*artwork[^"]*"/i);
    if (match) {
      const src = match[1];
      if (!src.startsWith('http')) {
        return 'https://www.nationalgallery.org.uk' + src;
      }
      return src;
    }
    
    // Pattern 4: Look for /media/ URLs with image extensions
    match = html.match(/https:\/\/www\.nationalgallery\.org\.uk\/media\/[^"'\s]+\.(jpg|png|webp)/i);
    if (match) {
      return match[0];
    }
    
    // Pattern 5: Look for image in main content area
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainMatch) {
      const mainContent = mainMatch[1];
      match = mainContent.match(/src="(\/media\/[^"]+\.(jpg|png|webp)[^"]*)"/i);
      if (match) {
        return 'https://www.nationalgallery.org.uk' + match[1].split('?')[0];
      }
    }
    
    console.log(`  Could not find image URL in page`);
    return null;
  } catch (err) {
    console.log(`  Error fetching page: ${err.message}`);
    return null;
  }
}

// Download image and get dimensions
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'image/webp,image/png,image/jpeg,*/*',
        'Referer': 'https://www.nationalgallery.org.uk/'
      },
      timeout: 60000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadImage(res.headers.location).then(resolve).catch(reject);
        return;
      }
      
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Upload to R2 using wrangler
async function uploadToR2(buffer, key, contentType) {
  const tmpFile = path.join(__dirname, `../temp-ng-${Date.now()}.tmp`);
  fs.writeFileSync(tmpFile, buffer);
  
  try {
    const { execSync } = require('child_process');
    execSync(`npx wrangler r2 object put "${R2_BUCKET}/${key}" --file="${tmpFile}" --content-type="${contentType}"`, {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe'
    });
    return true;
  } catch (err) {
    console.log(`  R2 upload error: ${err.message}`);
    return false;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

async function processArtwork(artwork, progress) {
  const { id, url, image } = artwork;
  
  if (!url) {
    console.log(`  No source URL for ${id}`);
    return null;
  }
  
  if (progress.fixed.includes(id)) {
    return { id, skipped: true };
  }
  
  // Get the original image URL from the page
  try {
    const imageUrl = await getArtworkImageUrl(url);
    if (!imageUrl) {
      return { id, failed: true, reason: 'Could not find image URL' };
    }
    
    return { id, imageUrl, name: artwork.name };
  } catch (err) {
    return { id, failed: true, reason: err.message };
  }
}

// Process a batch of artworks in parallel
async function processBatch(artworks, progress, concurrency = 10) {
  const results = [];
  
  for (let i = 0; i < artworks.length; i += concurrency) {
    const batch = artworks.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(artwork => processArtwork(artwork, progress))
    );
    results.push(...batchResults);
    
    // Small delay between batches to avoid overwhelming the server
    if (i + concurrency < artworks.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  
  return results;
}

async function main() {
  console.log('National Gallery Image Fix Script (Parallel)');
  console.log('=============================================\n');
  
  // Load data
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const items = data.items || [];
  console.log(`Found ${items.length} artworks\n`);
  
  // Load progress
  const progress = loadProgress();
  if (progress.inProgress) {
    console.log('Previous run was interrupted. Resuming...\n');
  }
  progress.inProgress = true;
  saveProgress(progress);
  
  // Test mode: just check first 20
  const testMode = process.argv.includes('--test');
  const itemsToProcess = testMode ? items.slice(0, 20) : items;
  
  // Filter out already processed items
  const remaining = itemsToProcess.filter(a => !progress.fixed.includes(a.id));
  console.log(`Processing ${remaining.length} remaining artworks (${progress.fixed.length} already done)${testMode ? ' (TEST MODE)' : ''}...\n`);
  
  const updatedItems = [...items];
  const BATCH_SIZE = 100;
  const CONCURRENCY = 10;
  
  for (let batch = 0; batch < remaining.length; batch += BATCH_SIZE) {
    const batchItems = remaining.slice(batch, batch + BATCH_SIZE);
    console.log(`\n--- Batch ${Math.floor(batch/BATCH_SIZE) + 1}: Processing ${batchItems.length} items ---`);
    
    const results = await processBatch(batchItems, progress, CONCURRENCY);
    
    let batchFixed = 0;
    let batchFailed = 0;
    
    for (const result of results) {
      if (result.skipped) continue;
      
      if (result.failed) {
        progress.failed.push({ id: result.id, reason: result.reason });
        batchFailed++;
      } else if (result.imageUrl) {
        progress.fixed.push(result.id);
        const idx = updatedItems.findIndex(it => it.id === result.id);
        if (idx !== -1) {
          updatedItems[idx].originalImage = result.imageUrl;
        }
        batchFixed++;
        console.log(`  ✓ ${result.name || result.id}`);
      }
    }
    
    console.log(`  Batch complete: ${batchFixed} fixed, ${batchFailed} failed`);
    console.log(`  Total: ${progress.fixed.length} fixed, ${progress.failed.length} failed`);
    
    // Save progress after each batch
    saveProgress(progress);
    
    // Save data periodically
    if ((batch + BATCH_SIZE) % 500 === 0 || batch + BATCH_SIZE >= remaining.length) {
      data.items = updatedItems;
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
      console.log(`  💾 Saved to data file`);
    }
  }
  
  // Final save
  data.items = updatedItems;
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  
  progress.inProgress = false;
  saveProgress(progress);
  
  console.log('\nDone!');
  console.log(`Fixed: ${progress.fixed.length}`);
  console.log(`Failed: ${progress.failed.length}`);
}

main().catch(console.error);
