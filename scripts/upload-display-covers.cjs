/**
 * Upload display exhibition cover images to R2
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const R2_ACCOUNT_ID = '6ce5ae60b244951ac36ffd277fd6ef76';
const R2_BUCKET = 'armin-gallery-images';
const R2_API_TOKEN = 'EnnxTANrr9O6m6mCeEh303c0C723HERSQWq049Wx';
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : require('http');
    client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'image/*,*/*;q=0.8',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
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
  } catch (err) {
    // If sips fails, return original
    console.log('  Warning: Could not convert to WebP, using original format');
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

  const displays = data.items.filter(i => i.id.startsWith('tate-britain-display-'));

  console.log('Uploading display cover images to R2...\n');

  for (const display of displays) {
    console.log(`=== ${display.name} ===`);
    
    if (!display.coverImage) {
      console.log('  No cover image, skipping');
      continue;
    }

    // Skip if already on R2
    if (display.coverImage.includes('r2.dev')) {
      console.log('  Already on R2');
      continue;
    }

    try {
      console.log('  Downloading...');
      const imageBuffer = await downloadImage(display.coverImage);
      console.log(`  Downloaded ${(imageBuffer.length / 1024).toFixed(1)} KB`);

      console.log('  Converting to WebP...');
      const webpBuffer = convertToWebP(imageBuffer);
      console.log(`  Converted to ${(webpBuffer.length / 1024).toFixed(1)} KB`);

      // Create filename from display ID
      const filename = `tate-britain/${display.id.replace('tate-britain-', '')}-cover.webp`;
      
      console.log(`  Uploading to R2: ${filename}`);
      const r2Url = await uploadToR2(webpBuffer, filename);
      
      display.coverImage = r2Url;
      console.log(`  ✓ Uploaded: ${r2Url}`);
    } catch (err) {
      console.error(`  Error: ${err.message}`);
    }
  }

  // Save updated data
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  console.log('\n✓ Saved to tate-britain.json');
}

main().catch(console.error);
