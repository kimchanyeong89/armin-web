/**
 * Hayward Gallery Collection - Screenshot Mode (Fast Parallel)
 * Takes screenshots of artwork images instead of downloading
 * Uses multiple browser tabs for parallel processing
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
require('dotenv').config({ path: '.env.local' });

puppeteer.use(StealthPlugin());

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || 'armin-gallery-images';
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const MUSEUM_SLUG = 'hayward-gallery';

let s3Client = null;
if (R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_ACCOUNT_ID) {
  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
  console.log('✅ R2 credentials loaded');
}

const BASE_URL = 'https://artsandculture.google.com';
const JSON_PATH = path.join(__dirname, '../public/data/hayward-gallery-collection.json');

// 병렬 처리 설정
const CONCURRENCY = 5; // 동시 탭 수
const MAX_ITEMS = 300; // 최대 처리 수 (선택사항)

async function uploadToR2(imageBuffer, key) {
  if (!s3Client) return null;
  try {
    const webpBuffer = await sharp(imageBuffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    await s3Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET, Key: key, Body: webpBuffer, ContentType: 'image/webp',
    }));
    return `${R2_PUBLIC_URL}/${key}`;
  } catch (error) {
    return null;
  }
}

function parseYear(yearStr) {
  if (!yearStr) return null;
  const match = yearStr.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}

function waitForEnter(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => { rl.question(prompt, () => { rl.close(); resolve(); }); });
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function processArtwork(browser, url, index, total) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    await delay(1500);
    
    // 스크롤해서 이미지 로드
    await page.evaluate(() => window.scrollTo(0, 300));
    await delay(1000);

    // 작품 정보 추출
    const artworkData = await page.evaluate(() => {
      const titleEl = document.querySelector('h1');
      const title = titleEl ? titleEl.textContent.trim() : null;
      
      let artist = null, year = null;
      const h2Elements = document.querySelectorAll('h2');
      for (const h2 of h2Elements) {
        const text = h2.textContent.trim();
        if (text.includes('Get the app') || text.includes('Hayward Gallery') || text.length > 100) continue;
        const yearMatch = text.match(/(\d{4})$/);
        if (yearMatch) { year = yearMatch[1]; artist = text.replace(/\d{4}$/, '').trim(); }
        else { artist = text; }
        if (artist) break;
      }
      return { title, artist, year };
    });

    if (!artworkData.title) {
      await page.close();
      return null;
    }

    // 이미지 요소 찾아서 스크린샷
    const imgElement = await page.$('img[src*="googleusercontent"], img[src*="lh3."], img[src*="lh4."], img[src*="lh5."]');
    
    if (!imgElement) {
      await page.close();
      return null;
    }

    // 이미지 요소의 스크린샷 캡처
    const screenshotBuffer = await imgElement.screenshot({ type: 'png' });
    
    // 너무 작은 이미지 제외 (로고 등)
    const metadata = await sharp(screenshotBuffer).metadata();
    if (metadata.width < 150 || metadata.height < 150) {
      await page.close();
      return null;
    }

    const artworkId = `hayward-gac-${index + 1}`;
    const r2Key = `${MUSEUM_SLUG}/collection/${artworkId}.webp`;
    const r2Url = await uploadToR2(screenshotBuffer, r2Key);

    await page.close();

    if (r2Url) {
      return {
        id: artworkId,
        title: artworkData.title,
        artist: artworkData.artist || 'Unknown Artist',
        year: parseYear(artworkData.year),
        image: r2Url,
        sourceUrl: url
      };
    }
    return null;

  } catch (error) {
    await page.close();
    return null;
  }
}

async function main() {
  console.log('============================================');
  console.log('🎨 Hayward Gallery - Fast Parallel Screenshot Mode');
  console.log(`📊 동시 처리: ${CONCURRENCY}개 탭`);
  console.log('============================================\n');

  const browser = await puppeteer.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1400,900'],
    defaultViewport: null
  });

  const page = await browser.newPage();
  const artworks = [];

  try {
    console.log('📡 Google Arts & Culture 페이지 로드 중...');
    await page.goto(`${BASE_URL}/partner/hayward-gallery`, { waitUntil: 'networkidle2', timeout: 60000 });

    if (page.url().includes('/sorry/')) {
      console.log('\n🔐 캡차가 감지되었습니다! 브라우저에서 해결해주세요.');
      await waitForEnter('✅ 캡차 해결 후 Enter... ');
    }

    console.log('📡 컬렉션 페이지로 이동...');
    await page.goto(`${BASE_URL}/explore/collections/hayward-gallery?c=assets`, { waitUntil: 'networkidle2', timeout: 60000 });
    
    if (page.url().includes('/sorry/')) {
      await waitForEnter('✅ 캡차 해결 후 Enter... ');
    }

    await delay(3000);

    // 스크롤
    console.log('\n📜 스크롤 중...');
    let previousHeight = 0, scrollAttempts = 0;
    while (scrollAttempts < 100) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(1000);
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      const itemCount = await page.evaluate(() => document.querySelectorAll('a[href*="/asset/"]').length);
      if (scrollAttempts % 10 === 0) console.log(`    ${itemCount}개 로드됨...`);
      if (currentHeight === previousHeight && scrollAttempts > 10) break;
      previousHeight = currentHeight;
      scrollAttempts++;
    }

    // 링크 수집
    let artworkUrls = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="/asset/"]');
      return [...new Set(Array.from(links).map(a => a.href))];
    });

    // 최대 개수 제한
    if (MAX_ITEMS && artworkUrls.length > MAX_ITEMS) {
      artworkUrls = artworkUrls.slice(0, MAX_ITEMS);
    }

    console.log(`\n✅ ${artworkUrls.length}개 작품 처리 시작 (병렬 ${CONCURRENCY}개)\n`);

    // 병렬 처리
    let completed = 0;
    let successful = 0;
    const startTime = Date.now();

    for (let i = 0; i < artworkUrls.length; i += CONCURRENCY) {
      const batch = artworkUrls.slice(i, i + CONCURRENCY);
      const promises = batch.map((url, batchIdx) => 
        processArtwork(browser, url, i + batchIdx, artworkUrls.length)
      );
      
      const results = await Promise.all(promises);
      
      for (const result of results) {
        completed++;
        if (result) {
          artworks.push(result);
          successful++;
        }
      }

      // 진행상황 (20개마다)
      if (completed % 20 === 0 || completed === artworkUrls.length) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const rate = (completed / elapsed * 60).toFixed(1);
        console.log(`📊 ${completed}/${artworkUrls.length} (성공: ${successful}) - ${rate}개/분`);
      }
    }

    await page.close();

  } catch (error) {
    console.error('❌ 오류:', error.message);
  }

  await browser.close();

  // JSON 저장
  const result = {
    museum: 'Hayward Gallery',
    museumId: 'hayward-gallery',
    collectionName: 'The Collection',
    scrapedAt: new Date().toISOString(),
    totalObjects: artworks.length,
    coverImage: artworks[0]?.image || '',
    objects: artworks
  };

  fs.writeFileSync(JSON_PATH, JSON.stringify(result, null, 2));

  console.log('\n============================================');
  console.log(`✅ 완료! ${artworks.length}개 작품 저장`);
  console.log(`📁 ${JSON_PATH}`);
  console.log('============================================');
}

main().catch(console.error);
