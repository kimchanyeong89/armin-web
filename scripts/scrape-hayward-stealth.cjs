/**
 * Hayward Gallery Collection Scraper - Stealth Mode
 * Using puppeteer-extra with stealth plugin to bypass bot detection
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const sharp = require('sharp');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// Stealth 플러그인 적용
puppeteer.use(StealthPlugin());

// S3 Client for R2
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
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  console.log('✅ R2 credentials loaded');
}

const BASE_URL = 'https://artsandculture.google.com';
const COLLECTION_URL = `${BASE_URL}/partner/hayward-gallery`;
const JSON_PATH = path.join(__dirname, '../public/data/hayward-gallery-collection.json');

// 이미지 다운로드
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const request = client.get(url, { 
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://artsandculture.google.com/'
      }
    }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadImage(response.headers.location).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        return reject(new Error(`HTTP ${response.statusCode}`));
      }
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
    request.setTimeout(20000, () => {
      request.destroy();
      reject(new Error('Timeout'));
    });
  });
}

// R2에 WebP로 업로드
async function uploadToR2(imageBuffer, key) {
  if (!s3Client) {
    console.log('    ⚠️ R2 client not initialized');
    return null;
  }
  
  try {
    const webpBuffer = await sharp(imageBuffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    await s3Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: webpBuffer,
      ContentType: 'image/webp',
    }));

    return `${R2_PUBLIC_URL}/${key}`;
  } catch (error) {
    console.error(`    ❌ R2 업로드 실패: ${error.message}`);
    return null;
  }
}

function parseYear(yearStr) {
  if (!yearStr) return null;
  const match = yearStr.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}

async function main() {
  console.log('============================================');
  console.log('🎨 Hayward Gallery Collection - Stealth Mode');
  console.log('============================================\n');

  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-infobars',
      '--window-position=0,0',
      '--ignore-certifcate-errors',
      '--ignore-certifcate-errors-spki-list',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const page = await browser.newPage();
  
  // 추가 stealth 설정
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9'
  });

  const artworks = [];
  
  try {
    console.log('📡 파트너 페이지 로드 중...');
    await page.goto(COLLECTION_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // 현재 URL 확인 (리다이렉트 체크)
    const currentUrl = page.url();
    console.log('📍 현재 URL:', currentUrl);
    
    if (currentUrl.includes('/sorry/') || currentUrl.includes('captcha')) {
      console.log('⚠️ 캡차 감지됨. 5초 대기 후 재시도...');
      await page.waitForTimeout(5000);
      await page.goto(COLLECTION_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    }
    
    await page.waitForTimeout(3000);
    
    // 스크린샷 저장 (디버깅용)
    await page.screenshot({ path: '/tmp/gac-stealth.png' });
    console.log('📸 스크린샷 저장: /tmp/gac-stealth.png');

    // 컬렉션 링크 찾기
    console.log('\n🔍 컬렉션 페이지로 이동 시도...');
    
    // "Artworks" 또는 "Collection" 링크 찾기
    const collectionLink = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      for (const link of links) {
        const text = link.textContent.toLowerCase();
        const href = link.href;
        if ((text.includes('artwork') || text.includes('collection') || text.includes('item')) && href.includes('hayward')) {
          return href;
        }
      }
      // 또는 explore/collections 패턴
      for (const link of links) {
        if (link.href.includes('/explore/') || link.href.includes('/asset/')) {
          return link.href;
        }
      }
      return null;
    });

    if (collectionLink) {
      console.log('📎 컬렉션 링크 발견:', collectionLink);
      await page.goto(collectionLink, { waitUntil: 'networkidle2', timeout: 60000 });
      await page.waitForTimeout(3000);
    }

    // 스크롤해서 모든 작품 로드
    console.log('\n📜 작품 목록 스크롤 중...');
    let previousHeight = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 50;

    while (scrollAttempts < maxScrollAttempts) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
      
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      const itemCount = await page.evaluate(() => document.querySelectorAll('a[href*="/asset/"]').length);
      
      if (scrollAttempts % 5 === 0) {
        console.log(`    스크롤 ${scrollAttempts + 1}: ${itemCount}개 작품 로드됨`);
      }
      
      if (currentHeight === previousHeight && scrollAttempts > 5) {
        break;
      }
      
      previousHeight = currentHeight;
      scrollAttempts++;
    }

    // 모든 작품 링크 수집
    const artworkUrls = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="/asset/"]');
      return Array.from(links).map(a => a.href);
    });

    console.log(`\n✅ 총 ${artworkUrls.length}개 작품 링크 발견\n`);

    if (artworkUrls.length === 0) {
      // 페이지 HTML 일부 저장 (디버깅)
      const html = await page.content();
      fs.writeFileSync('/tmp/gac-page.html', html.substring(0, 50000));
      console.log('📄 페이지 HTML 저장: /tmp/gac-page.html');
    }

    // 각 작품 페이지 방문하여 상세 정보 및 이미지 수집
    for (let i = 0; i < artworkUrls.length; i++) {
      const url = artworkUrls[i];
      
      try {
        console.log(`[${i + 1}/${artworkUrls.length}] ${url.substring(0, 60)}...`);
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForTimeout(2000);
        
        // 스크롤해서 이미지 로드
        await page.evaluate(() => window.scrollTo(0, 300));
        await page.waitForTimeout(1500);

        // 작품 정보 추출
        const artworkData = await page.evaluate(() => {
          const titleEl = document.querySelector('h1');
          const title = titleEl ? titleEl.textContent.trim() : null;
          
          let artist = null;
          let year = null;
          
          // h2에서 아티스트 정보 찾기
          const h2Elements = document.querySelectorAll('h2');
          for (const h2 of h2Elements) {
            const text = h2.textContent.trim();
            if (text.includes('Get the app') || text.includes('Hayward Gallery')) continue;
            
            const yearMatch = text.match(/(\d{4})$/);
            if (yearMatch) {
              year = yearMatch[1];
              artist = text.replace(/\d{4}$/, '').trim();
            } else if (text.length < 100) {
              artist = text;
            }
            
            if (artist) break;
          }
          
          // 이미지 찾기 - 여러 패턴 시도
          let image = null;
          const imgCandidates = [
            ...document.querySelectorAll('img[src*="googleusercontent.com"]'),
            ...document.querySelectorAll('img[src*="lh3."]'),
            ...document.querySelectorAll('img[src*="lh4."]'),
            ...document.querySelectorAll('img[src*="lh5."]'),
            ...document.querySelectorAll('img[data-src*="googleusercontent"]'),
          ];
          
          for (const img of imgCandidates) {
            const src = img.src || img.dataset?.src;
            if (!src) continue;
            if (img.naturalWidth && img.naturalWidth < 100) continue;
            if (img.width && img.width < 100) continue;
            if (src.includes('avatar') || src.includes('logo') || src.includes('icon')) continue;
            
            image = src;
            break;
          }
          
          // 고해상도 버전으로 변환
          if (image && image.includes('=')) {
            image = image.replace(/=w\d+.*/, '=w1200');
          }
          
          return { title, artist, year, image };
        });

        if (!artworkData.title || !artworkData.image) {
          console.log(`    ⏭️ 정보 부족`);
          continue;
        }

        // 이미지 다운로드 및 R2 업로드
        const artworkId = `hayward-gac-${i + 1}`;
        const imageBuffer = await downloadImage(artworkData.image);
        const r2Key = `${MUSEUM_SLUG}/collection/${artworkId}.webp`;
        const r2Url = await uploadToR2(imageBuffer, r2Key);

        if (r2Url) {
          artworks.push({
            id: artworkId,
            title: artworkData.title,
            artist: artworkData.artist || 'Unknown Artist',
            year: parseYear(artworkData.year),
            image: r2Url,
            sourceUrl: url
          });
          console.log(`    ✅ ${artworkData.title.substring(0, 30)}... by ${artworkData.artist || 'Unknown'}`);
        }

      } catch (error) {
        console.log(`    ❌ 오류: ${error.message}`);
      }

      // 10개마다 진행상황 표시
      if ((i + 1) % 10 === 0) {
        console.log(`\n📊 진행: ${i + 1}/${artworkUrls.length} (수집: ${artworks.length}개)\n`);
      }
    }

  } catch (error) {
    console.error('❌ 스크래핑 오류:', error.message);
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
  console.log(`✅ 저장 완료: ${JSON_PATH}`);
  console.log(`📊 총 ${artworks.length}개 작품 아카이브됨`);
  console.log('============================================');
}

main().catch(console.error);
