/**
 * Fix Hamburger Kunsthalle Video Collection
 * 1. Replace placeholder images with actual images from detail pages
 * 2. Normalize duration format (always end with "min")
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '..', 'public', 'data', 'hamburger-kunsthalle-video.json');
const OUTPUT_FILE = INPUT_FILE;
const DELAY_MS = 300;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

function extractImageFromPage(html) {
  // Look for actual image in the page (not logo, not JS)
  // Format: src="/sites/default/files/multimedia-files/75669.jpg"
  const imgMatch = html.match(/src="(\/sites\/default\/files\/multimedia-files\/\d+\.jpg)"/);
  if (imgMatch) {
    return 'https://online-sammlung.hamburger-kunsthalle.de' + imgMatch[1];
  }
  return null;
}

function normalizeDuration(duration) {
  if (!duration) return null;
  
  let normalized = duration.toString().trim();
  
  // Remove existing "min" suffix if present
  normalized = normalized.replace(/\s*min\.?$/i, '');
  
  // If it's just a number, add "min"
  // If it's a time format like "8:53", add "min"
  if (/^\d+$/.test(normalized) || /^\d+:\d+(?::\d+)?$/.test(normalized)) {
    return normalized + ' min';
  }
  
  return normalized + ' min';
}

async function fixVideos() {
  console.log('🎬 Fixing Hamburger Kunsthalle Video Collection');
  console.log('='.repeat(50));

  // Load current data
  const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  console.log(`📊 Total videos: ${data.artworks.length}`);

  // Find videos with placeholder images
  const needsImageFix = data.artworks.filter(a => 
    !a.imageUrl || 
    a.imageUrl.includes('placeholder') ||
    !a.imageUrl.includes('/sites/default/files/')
  );
  console.log(`🖼️ Videos needing image fix: ${needsImageFix.length}`);

  // Fix images from detail pages
  let fixed = 0;
  let failed = 0;
  
  for (let i = 0; i < needsImageFix.length; i++) {
    const artwork = needsImageFix[i];
    const pct = ((i + 1) / needsImageFix.length * 100).toFixed(1);
    process.stdout.write(`\r  Fetching ${i + 1}/${needsImageFix.length} (${pct}%)...`);
    
    try {
      const html = await fetchPage(artwork.detailUrl);
      const imageUrl = extractImageFromPage(html);
      
      if (imageUrl) {
        // Find and update the artwork in the main array
        const idx = data.artworks.findIndex(a => a.id === artwork.id);
        if (idx !== -1) {
          data.artworks[idx].imageUrl = imageUrl;
          // Also update thumbnail
          const resultId = imageUrl.match(/\/(\d+)\.jpg$/)?.[1];
          if (resultId) {
            data.artworks[idx].thumbnailUrl = `https://online-sammlung.hamburger-kunsthalle.de/sites/default/files/styles/tile/public/multimedia-files/${resultId}.jpg`;
          }
          fixed++;
        }
      } else {
        failed++;
      }
      
      await sleep(DELAY_MS);
    } catch (err) {
      failed++;
    }
  }
  
  console.log(`\n  ✅ Fixed: ${fixed}, ❌ No image found: ${failed}`);

  // Normalize all durations
  console.log('\n⏱️ Normalizing durations...');
  let durationsFixed = 0;
  
  for (const artwork of data.artworks) {
    if (artwork.duration) {
      const normalized = normalizeDuration(artwork.duration);
      if (normalized !== artwork.duration) {
        artwork.duration = normalized;
        durationsFixed++;
      }
    }
  }
  
  console.log(`  ✅ Durations normalized: ${durationsFixed}`);

  // Count final stats
  const withDuration = data.artworks.filter(a => a.duration).length;
  const withImage = data.artworks.filter(a => a.imageUrl && a.imageUrl.includes('/sites/default/files/')).length;

  // Update metadata
  data.scraped_date = new Date().toISOString();
  data.total_count = data.artworks.length;

  // Save
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
  
  console.log('\n📊 Final Stats:');
  console.log(`  Total videos: ${data.artworks.length}`);
  console.log(`  With real image: ${withImage}`);
  console.log(`  With duration: ${withDuration}`);
  console.log(`  📁 Saved to: ${OUTPUT_FILE}`);
}

fixVideos().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
