/**
 * Re-fetch correct hero images for Tate Britain display exhibitions
 * Extract the actual hero image shown at the top of each page
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const R2_ACCOUNT_ID = '6ce5ae60b244951ac36ffd277fd6ef76';
const R2_BUCKET = 'armin-gallery-images';
const R2_API_TOKEN = 'EnnxTANrr9O6m6mCeEh303c0C723HERSQWq049Wx';
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

// Display exhibition URLs and their IDs
const DISPLAYS = [
  {
    id: 'tate-britain-display-jmw-turner',
    url: 'https://www.tate.org.uk/visit/tate-britain/display/jmw-turner',
    name: 'JMW Turner',
    // Known hero image: Norham Castle, Sunrise
    heroKeyword: 'norham'
  },
  {
    id: 'tate-britain-display-historic-early-modern',
    url: 'https://www.tate.org.uk/visit/tate-britain/display/historic-early-modern-british-art',
    name: 'Historic and Early Modern British Art',
    // Known hero image: Ophelia by Millais
    heroKeyword: 'ophelia'
  },
  {
    id: 'tate-britain-display-modern-contemporary',
    url: 'https://www.tate.org.uk/visit/tate-britain/display/modern-and-contemporary-british-art',
    name: 'Modern and Contemporary British Art',
    // Known hero image: The Only Blonde in the World by Pauline Boty
    heroKeyword: 'blonde|boty'
  },
  {
    id: 'tate-britain-display-art-around-building',
    url: 'https://www.tate.org.uk/visit/tate-britain/display/art-around-the-building',
    name: 'Art Around the Building',
    // Known hero image: France-Lise McGurn Skypark
    heroKeyword: 'mcgurn|skypark|cafe'
  }
];

function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchHTML(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function extractHeroImage(html, keyword) {
  // Find all media.tate.org.uk image URLs
  const allImages = html.match(/https:\/\/media\.tate\.org\.uk[^"'\s]+\.(?:jpg|jpeg|png|webp)/gi) || [];
  
  // First, try to find an image matching the keyword
  if (keyword) {
    const keywordPattern = new RegExp(keyword, 'i');
    const matchingImages = allImages.filter(url => keywordPattern.test(url));
    
    if (matchingImages.length > 0) {
      // Get the largest version (prefer width-2560 or similar)
      const sorted = matchingImages.sort((a, b) => {
        const widthA = parseInt(a.match(/width-(\d+)/)?.[1] || '0');
        const widthB = parseInt(b.match(/width-(\d+)/)?.[1] || '0');
        return widthB - widthA;
      });
      
      // Get the best quality version
      let best = sorted[0];
      // Try to upgrade to larger width if possible
      if (best.includes('width-')) {
        best = best.replace(/width-\d+/, 'width-2560');
      }
      return best;
    }
  }
  
  // Fallback: get the first large image (likely the hero)
  const heroPatterns = [
    /aztate-prd-ew-dg-wgtail-st1-ctr-data\/images\/[^"'\s]+\.width-2560[^"'\s]*/i,
    /aztate-prd-ew-dg-wgtail-st1-ctr-data\/images\/[^"'\s]+\.width-1200[^"'\s]*/i,
  ];
  
  for (const pattern of heroPatterns) {
    const match = html.match(pattern);
    if (match) return 'https://media.tate.org.uk/' + match[0];
  }
  
  // Last resort: first media.tate.org.uk image
  if (allImages.length > 0) {
    return allImages[0];
  }
  
  return null;
}

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'image/*',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function convertToWebP(inputBuffer) {
  const tempInput = `/tmp/temp-input-${Date.now()}.jpg`;
  const tempOutput = `/tmp/temp-output-${Date.now()}.webp`;
  
  fs.writeFileSync(tempInput, inputBuffer);
  
  try {
    execSync(`sips -s format webp -s formatOptions 80 "${tempInput}" --out "${tempOutput}" 2>/dev/null`);
    const result = fs.readFileSync(tempOutput);
    fs.unlinkSync(tempInput);
    fs.unlinkSync(tempOutput);
    return result;
  } catch {
    fs.unlinkSync(tempInput);
    return inputBuffer;
  }
}

function uploadToR2(buffer, key, contentType = 'image/webp') {
  return new Promise((resolve, reject) => {
    const url = `https://api.cloudflare.com/client/v4/accounts/${R2_ACCOUNT_ID}/r2/buckets/${R2_BUCKET}/objects/${encodeURIComponent(key)}`;
    
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${R2_API_TOKEN}`,
        'Content-Type': contentType,
        'Content-Length': buffer.length
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(`${R2_PUBLIC_URL}/${key}`);
        } else {
          reject(new Error(`R2 upload failed: ${res.statusCode} - ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

async function main() {
  const dataPath = path.join(__dirname, '../public/data/tate-britain.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  console.log('Fetching correct hero images for display exhibitions...\n');

  for (const display of DISPLAYS) {
    console.log(`\n=== ${display.name} ===`);
    
    try {
      const html = await fetchHTML(display.url);
      const heroImage = extractHeroImage(html, display.heroKeyword);
      
      if (!heroImage) {
        console.log('  No hero image found');
        continue;
      }
      
      console.log(`  Found: ${heroImage.substring(0, 80)}...`);
      
      // Download
      console.log('  Downloading...');
      const imageBuffer = await downloadImage(heroImage);
      console.log(`  Downloaded ${(imageBuffer.length / 1024).toFixed(1)} KB`);
      
      // Convert
      console.log('  Converting to WebP...');
      const webpBuffer = convertToWebP(imageBuffer);
      console.log(`  Converted to ${(webpBuffer.length / 1024).toFixed(1)} KB`);
      
      // Upload
      const filename = `tate-britain/${display.id.replace('tate-britain-', '')}-cover.webp`;
      console.log(`  Uploading: ${filename}`);
      const r2Url = await uploadToR2(webpBuffer, filename);
      console.log(`  ✓ ${r2Url}`);
      
      // Update data
      const exhibition = data.items.find(i => i.id === display.id);
      if (exhibition) {
        exhibition.coverImage = r2Url;
        exhibition.dateRange = 'Ongoing';
      }
    } catch (err) {
      console.error(`  Error: ${err.message}`);
    }
  }

  // Save
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  console.log('\n✓ Saved to tate-britain.json');
}

main().catch(console.error);
