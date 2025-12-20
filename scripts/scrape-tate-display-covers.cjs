/**
 * Scrape cover images directly from Tate what's on page
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');
const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const DATA_PATH = path.join(__dirname, '../public/data/tate-modern.json');
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = 'armin-gallery-images';
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY }
});

async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : require('http');
    const makeRequest = (reqUrl, redirects = 0) => {
      if (redirects > 5) return reject(new Error('Too many redirects'));
      protocol.get(reqUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return makeRequest(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    };
    makeRequest(url);
  });
}

async function uploadToR2(buffer, key) {
  const webp = await sharp(buffer).resize(800, 800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: webp, ContentType: 'image/webp' }));
  return `${R2_PUBLIC_URL}/${key}`;
}

async function main() {
  console.log('=== Scraping Tate Modern display covers ===\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' });
  const page = await context.newPage();
  
  // Go to Tate Modern what's on page with displays/exhibitions filter
  await page.goto('https://www.tate.org.uk/whats-on?date_range=from_now&event_type=display&gallery_group=tate-modern', { waitUntil: 'networkidle', timeout: 60000 });
  
  // Accept cookies if present
  try {
    const acceptBtn = await page.$('button:has-text("Accept")');
    if (acceptBtn) await acceptBtn.click();
    await page.waitForTimeout(1000);
  } catch {}
  
  await page.waitForTimeout(3000);
  
  // Get all display cards with their images
  const cards = await page.$$eval('a[href*="/display/"]', anchors => {
    return anchors.map(a => {
      const href = a.getAttribute('href') || '';
      const img = a.querySelector('img');
      const imgSrc = img ? (img.getAttribute('src') || img.getAttribute('data-src') || '') : '';
      return { href, imgSrc };
    }).filter(c => c.href && c.imgSrc);
  });
  
  console.log(`Found ${cards.length} display cards with images\n`);
  
  // Map href to display ID
  const hrefToId = {
    '/visit/tate-modern/display/artist-and-society': 'display-artist-and-society',
    '/visit/tate-modern/display/in-the-studio': 'display-in-the-studio',
    '/visit/tate-modern/display/materials-and-objects': 'display-materials-and-objects',
    '/visit/tate-modern/display/media-networks': 'display-media-networks',
    '/visit/tate-modern/display/performer-and-participant': 'display-performer-and-participant',
    '/visit/tate-modern/display/tanks': 'display-tanks',
    '/visit/tate-modern/display/artist-rooms-richard-long': 'display-artist-rooms-richard-long'
  };
  
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  
  for (const card of cards) {
    const displayId = hrefToId[card.href];
    if (!displayId) {
      console.log(`Skipping unknown href: ${card.href}`);
      continue;
    }
    
    const display = data.items.find(it => it.id === displayId);
    if (!display) {
      console.log(`Display not found in data: ${displayId}`);
      continue;
    }
    
    console.log(`Processing: ${display.title}`);
    console.log(`  Source: ${card.imgSrc.substring(0, 80)}...`);
    
    try {
      // Get higher resolution version
      let imgUrl = card.imgSrc
        .replace(/\.width-\d+/, '.width-1200')
        .replace(/\.max-\d+x\d+/, '.max-1200x1200')
        .replace(/fill-\d+x\d+/, 'fill-1200x1200');
      
      if (!imgUrl.startsWith('http')) {
        imgUrl = 'https://www.tate.org.uk' + imgUrl;
      }
      
      const buf = await downloadImage(imgUrl);
      const key = `tate-modern/${displayId}/cover.webp`;
      const r2Url = await uploadToR2(buf, key);
      
      display.image = r2Url;
      display.coverImage = r2Url;
      console.log(`  Uploaded: ${r2Url}\n`);
    } catch (e) {
      console.log(`  Error: ${e.message}\n`);
    }
  }
  
  await browser.close();
  
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  console.log('Saved to tate-modern.json');
}

main().catch(console.error);
