#!/usr/bin/env node
/**
 * Add originalImage to ALL National Gallery artworks
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_FILE = path.join(__dirname, '../public/data/national-gallery-permanent.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/ng-add-original-progress.json');

const CONCURRENCY = 10;
const BATCH_SIZE = 100;

// Load progress
function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch {
    return { processed: [], failed: [], inProgress: false };
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
      return null;
    }
    
    // Pattern 1: og:image meta tag
    let match = html.match(/property="og:image"\s+content="([^"]+)"/i) ||
                html.match(/content="([^"]+)"\s+property="og:image"/i);
    if (match && match[1] && match[1].includes('media')) {
      let url = match[1];
      url = url.split('?')[0];
      if (!url.startsWith('http')) {
        url = 'https://www.nationalgallery.org.uk' + url;
      }
      return url;
    }
    
    // Pattern 2: thumbnail meta tag
    match = html.match(/name="thumbnail"\s+content="([^"]+)"/i) ||
            html.match(/content="([^"]+)"\s+name="thumbnail"/i);
    if (match && match[1] && match[1].includes('media')) {
      let url = match[1].split('?')[0];
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
    
    // Pattern 4: Look for /media/ URLs
    match = html.match(/\/media\/[a-z0-9]+\/[^"'\s?]+\.(jpg|png|webp)/i);
    if (match) {
      let url = match[0];
      if (!url.startsWith('http')) {
        url = 'https://www.nationalgallery.org.uk' + url;
      }
      return url;
    }
    
    return null;
  } catch (err) {
    return null;
  }
}

async function processArtwork(artwork, progress) {
  const { id, url } = artwork;
  
  // Already has originalImage
  if (artwork.originalImage) {
    return { success: true, url: artwork.originalImage };
  }
  
  if (!url) {
    return { success: false, reason: 'No source URL' };
  }
  
  // Already processed
  if (progress.processed.includes(id)) {
    return { success: true, cached: true };
  }
  
  try {
    const imageUrl = await getArtworkImageUrl(url);
    if (!imageUrl) {
      return { success: false, reason: 'Could not find image URL' };
    }
    
    artwork.originalImage = imageUrl;
    return { success: true, url: imageUrl };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

async function processBatch(batch, progress) {
  const results = await Promise.allSettled(
    batch.map(artwork => processArtwork(artwork, progress))
  );
  
  results.forEach((result, idx) => {
    const artwork = batch[idx];
    if (result.status === 'fulfilled' && result.value.success) {
      if (!progress.processed.includes(artwork.id)) {
        progress.processed.push(artwork.id);
      }
    } else {
      const reason = result.status === 'rejected' ? result.reason?.message : result.value?.reason;
      if (!progress.failed.some(f => f.id === artwork.id)) {
        progress.failed.push({ id: artwork.id, reason: reason || 'Unknown error' });
      }
    }
  });
  
  return results;
}

async function main() {
  console.log('=== Adding originalImage to ALL National Gallery artworks ===\n');
  
  const progress = loadProgress();
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const items = data.items || data.artworks || [];
  
  // Find items that don't have originalImage yet
  const toProcess = items.filter(a => !a.originalImage && a.url);
  
  console.log(`Total items: ${items.length}`);
  console.log(`Already have originalImage: ${items.filter(a => a.originalImage).length}`);
  console.log(`Need to process: ${toProcess.length}\n`);
  
  if (toProcess.length === 0) {
    console.log('All items already have originalImage!');
    return;
  }
  
  progress.inProgress = true;
  saveProgress(progress);
  
  let processed = 0;
  const total = toProcess.length;
  
  // Process in batches
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    
    // Process batch in parallel chunks
    for (let j = 0; j < batch.length; j += CONCURRENCY) {
      const chunk = batch.slice(j, j + CONCURRENCY);
      console.log(`Processing ${processed + 1}-${processed + chunk.length} of ${total}...`);
      
      await processBatch(chunk, progress);
      processed += chunk.length;
      
      // Save progress and data every chunk
      saveProgress(progress);
      
      // Small delay between chunks
      await new Promise(r => setTimeout(r, 200));
    }
    
    // Save data file after each batch
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    
    const withOriginal = items.filter(a => a.originalImage).length;
    console.log(`  Progress: ${withOriginal}/${items.length} have originalImage\n`);
  }
  
  // Final save
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  
  progress.inProgress = false;
  saveProgress(progress);
  
  const finalCount = items.filter(a => a.originalImage).length;
  console.log('\n=== Complete ===');
  console.log(`Items with originalImage: ${finalCount}/${items.length}`);
  console.log(`Failed: ${progress.failed.length}`);
}

main().catch(console.error);
