#!/usr/bin/env node
/**
 * Retry failed National Gallery images with improved pattern matching
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_FILE = path.join(__dirname, '../public/data/national-gallery-permanent.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/ng-image-fix-progress.json');

const CONCURRENCY = 5;
const BATCH_SIZE = 50;

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
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 15000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let loc = res.headers.location;
        if (!loc.startsWith('http')) {
          loc = 'https://www.nationalgallery.org.uk' + loc;
        }
        fetchUrl(loc, retries).then(resolve).catch(reject);
        return;
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, data }));
      res.on('error', (err) => {
        if (retries > 0) {
          setTimeout(() => fetchUrl(url, retries - 1).then(resolve).catch(reject), 1000);
        } else {
          reject(err);
        }
      });
    });
    req.on('error', (err) => {
      if (retries > 0) {
        setTimeout(() => fetchUrl(url, retries - 1).then(resolve).catch(reject), 1000);
      } else {
        reject(err);
      }
    });
    req.on('timeout', () => { 
      req.destroy(); 
      if (retries > 0) {
        setTimeout(() => fetchUrl(url, retries - 1).then(resolve).catch(reject), 1000);
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
      console.log(`  HTTP ${statusCode}`);
      return null;
    }
    
    // Pattern 1: og:image meta tag
    let match = html.match(/property="og:image"\s+content="([^"]+)"/i) ||
                html.match(/content="([^"]+)"\s+property="og:image"/i);
    if (match && match[1] && match[1].includes('media')) {
      let url = match[1];
      // Remove crop parameters to get full image
      url = url.split('?')[0];
      if (!url.startsWith('http')) {
        url = 'https://www.nationalgallery.org.uk' + url;
      }
      return url;
    }
    
    // Pattern 2: thumbnail meta tag (for pages without og:image)
    match = html.match(/name="thumbnail"\s+content="([^"]+)"/i) ||
            html.match(/content="([^"]+)"\s+name="thumbnail"/i);
    if (match && match[1] && match[1].includes('media')) {
      let url = match[1].split('?')[0]; // Remove crop params
      if (!url.startsWith('http')) {
        url = 'https://www.nationalgallery.org.uk' + url;
      }
      return url;
    }
    
    // Pattern 3: thumbnailUrl in JSON-LD
    match = html.match(/"thumbnailUrl":\s*"([^"]+)"/i);
    if (match && match[1]) {
      let url = match[1].split('?')[0].replace(/&amp;/g, '&');
      if (!url.startsWith('http')) {
        url = 'https://www.nationalgallery.org.uk' + url;
      }
      return url;
    }
    
    // Pattern 4: Look for /media/ URLs with -xl-hd or similar high-res patterns
    match = html.match(/\/media\/[a-z0-9]+\/[^"'\s?]+\.(jpg|png|webp)/i);
    if (match) {
      let url = match[0];
      if (!url.startsWith('http')) {
        url = 'https://www.nationalgallery.org.uk' + url;
      }
      return url;
    }
    
    console.log(`  No image pattern matched`);
    return null;
  } catch (err) {
    console.log(`  Error: ${err.message}`);
    return null;
  }
}

async function processArtwork(artwork, progress, dataMap) {
  const { id, url } = artwork;
  
  if (!url) {
    console.log(`  No source URL for ${id}`);
    return false;
  }
  
  // Already fixed in previous run
  if (progress.fixed.includes(id)) {
    return true;
  }
  
  try {
    const imageUrl = await getArtworkImageUrl(url);
    if (!imageUrl) {
      return false;
    }
    
    // Update artwork data with original image URL
    const artworkData = dataMap.get(id);
    if (artworkData) {
      artworkData.originalImage = imageUrl;
    }
    
    console.log(`  ✓ Found: ${imageUrl.slice(-50)}`);
    return true;
  } catch (err) {
    console.log(`  Error: ${err.message}`);
    return false;
  }
}

async function processBatch(batch, progress, dataMap) {
  const results = await Promise.allSettled(
    batch.map(artwork => processArtwork(artwork, progress, dataMap))
  );
  
  results.forEach((result, idx) => {
    const artwork = batch[idx];
    if (result.status === 'fulfilled' && result.value) {
      if (!progress.fixed.includes(artwork.id)) {
        progress.fixed.push(artwork.id);
      }
      // Remove from failed list
      progress.failed = progress.failed.filter(f => f.id !== artwork.id);
    } else if (result.status === 'rejected' || !result.value) {
      // Keep in failed if not already there
      if (!progress.failed.some(f => f.id === artwork.id)) {
        progress.failed.push({ id: artwork.id, reason: 'Could not find image URL' });
      }
    }
  });
  
  return results;
}

async function main() {
  console.log('=== Retrying Failed National Gallery Images ===\n');
  
  const progress = loadProgress();
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  
  // Create a map for quick lookups
  const dataMap = new Map();
  const items = data.items || data.artworks || [];
  items.forEach(a => dataMap.set(a.id, a));
  
  // Get unique failed IDs
  const failedIds = [...new Set(progress.failed.map(f => f.id))];
  console.log(`Found ${failedIds.length} unique failed items to retry\n`);
  
  // Get artworks to retry
  const toRetry = failedIds.map(id => dataMap.get(id)).filter(Boolean);
  
  // Clear old failed entries for items we're retrying
  progress.failed = progress.failed.filter(f => !failedIds.includes(f.id));
  
  progress.inProgress = true;
  saveProgress(progress);
  
  let processed = 0;
  const total = toRetry.length;
  
  // Process in batches
  for (let i = 0; i < toRetry.length; i += BATCH_SIZE) {
    const batch = toRetry.slice(i, i + BATCH_SIZE);
    
    // Process batch in parallel chunks
    for (let j = 0; j < batch.length; j += CONCURRENCY) {
      const chunk = batch.slice(j, j + CONCURRENCY);
      console.log(`Processing ${processed + 1}-${processed + chunk.length} of ${total}...`);
      
      await processBatch(chunk, progress, dataMap);
      processed += chunk.length;
      
      // Save progress every chunk
      saveProgress(progress);
      
      // Small delay between chunks
      await new Promise(r => setTimeout(r, 300));
    }
    
    console.log(`  Progress: ${progress.fixed.length} fixed, ${progress.failed.length} still failed\n`);
  }
  
  // Save final data
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  
  progress.inProgress = false;
  saveProgress(progress);
  
  console.log('\n=== Retry Complete ===');
  console.log(`Fixed: ${progress.fixed.length}`);
  console.log(`Still failed: ${progress.failed.length}`);
  
  // List remaining failures
  if (progress.failed.length > 0) {
    console.log('\nRemaining failures:');
    const uniqueRemaining = [...new Set(progress.failed.map(f => f.id))];
    uniqueRemaining.slice(0, 20).forEach(id => console.log(`  - ${id}`));
    if (uniqueRemaining.length > 20) {
      console.log(`  ... and ${uniqueRemaining.length - 20} more`);
    }
  }
}

main().catch(console.error);
