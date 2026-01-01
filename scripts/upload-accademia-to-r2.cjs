#!/usr/bin/env node
/**
 * Upload Accademia images to R2 (bypassing SSL certificate issues)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA_FILE = path.join(__dirname, '../public/data/accademia-collection.json');
const R2_BUCKET = 'armin-gallery-images';
const R2_PATH = 'accademia';
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

const CONCURRENCY = 5;

async function main() {
  console.log('=== Uploading Accademia images to R2 ===\n');
  
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const items = data.objects || [];
  
  console.log(`Total items: ${items.length}\n`);
  
  let uploaded = 0;
  let failed = 0;
  let skipped = 0;
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const originalUrl = item.image;
    
    if (!originalUrl) {
      console.log(`[${i + 1}/${items.length}] ${item.id}: No image URL`);
      skipped++;
      continue;
    }
    
    // Skip if already using R2
    if (originalUrl.includes('r2.dev')) {
      console.log(`[${i + 1}/${items.length}] ${item.id}: Already on R2`);
      skipped++;
      continue;
    }
    
    // Generate R2 filename
    const ext = path.extname(originalUrl.split('?')[0]) || '.jpg';
    const filename = `${item.id}${ext}`;
    const r2Key = `${R2_PATH}/${filename}`;
    const r2Url = `${R2_PUBLIC_URL}/${r2Key}`;
    
    try {
      // Download with curl (bypassing SSL issues)
      const tempFile = `/tmp/accademia-${item.id}${ext}`;
      execSync(`curl -sk "${originalUrl}" -o "${tempFile}"`, { stdio: 'pipe' });
      
      // Check if file was downloaded
      if (!fs.existsSync(tempFile) || fs.statSync(tempFile).size < 1000) {
        console.log(`[${i + 1}/${items.length}] ${item.id}: Download failed (too small)`);
        failed++;
        continue;
      }
      
      // Upload to R2
      execSync(`npx wrangler r2 object put "${R2_BUCKET}/${r2Key}" --file="${tempFile}" --content-type="image/jpeg" --remote`, { 
        stdio: 'pipe',
        cwd: path.join(__dirname, '..')
      });
      
      // Update JSON
      item.originalImage = originalUrl;
      item.image = r2Url;
      
      // Clean up temp file
      fs.unlinkSync(tempFile);
      
      console.log(`[${i + 1}/${items.length}] ${item.id}: ✓ Uploaded`);
      uploaded++;
      
      // Save progress every 10 items
      if (uploaded % 10 === 0) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
      }
    } catch (err) {
      console.log(`[${i + 1}/${items.length}] ${item.id}: ✗ ${err.message}`);
      failed++;
    }
  }
  
  // Final save
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  
  console.log('\n=== Complete ===');
  console.log(`Uploaded: ${uploaded}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

main().catch(console.error);
