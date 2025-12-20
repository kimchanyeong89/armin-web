/**
 * Hayward Gallery Collection Scraper
 * 
 * Source: Google Arts & Culture
 * https://artsandculture.google.com/explore/collections/hayward-gallery?c=assets
 * 
 * 아카이브 규칙 (ARCHIVE_RULES.md):
 * - 이미지: WebP 형식, R2 업로드
 * - 작가: 풀네임 (약칭 X)
 * - 작품명, 제작년도 필수
 * - 빈 이미지 제외
 * - 중복 작품 제거
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// .env.local에서 환경변수 로드
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key.trim()] = value.trim();
    }
  });
}

// R2 설정
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

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
} else {
  console.log('⚠️ R2 credentials not found in .env.local');
}

// 설정
const MUSEUM_SLUG = 'hayward-gallery';
const COLLECTION_NAME = 'The Collection';
const BASE_URL = 'https://artsandculture.google.com';
const COLLECTION_URL = `${BASE_URL}/explore/collections/hayward-gallery?c=assets`;
const OUTPUT_JSON = path.join(__dirname, '../public/data/hayward-gallery-collection.json');

// 이미지 다운로드
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadImage(response.headers.location).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
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

// 년도 파싱 (숫자만 추출)
function parseYear(yearStr) {
  if (!yearStr) return null;
  // "1964", "c. 1960", "1960-1970", "circa 1980" 등에서 첫 번째 4자리 숫자 추출
  const match = yearStr.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}

// 중복 제거
function removeDuplicates(artworks) {
  const seen = new Set();
  return artworks.filter(artwork => {
    const key = `${artwork.artist}|${artwork.title}`.toLowerCase();
    if (seen.has(key)) {
      console.log(`    ⚠️ 중복 제거: ${artwork.title} by ${artwork.artist}`);
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function scrapeCollection() {
  console.log('============================================');
  console.log('🎨 Hayward Gallery Collection Scraper');
  console.log('============================================\n');

  const browser = await chromium.launch({ 
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();
  const artworks = [];
  
  try {
    console.log('📡 컬렉션 페이지 로드 중...');
    await page.goto(COLLECTION_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);

    // 스크롤해서 모든 작품 로드
    console.log('📜 작품 목록 스크롤 중...');
    let previousHeight = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 100;

    while (scrollAttempts < maxScrollAttempts) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
      
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      const itemCount = await page.locator('a[href*="/asset/"]').count();
      
      console.log(`    스크롤 ${scrollAttempts + 1}: ${itemCount}개 작품 로드됨`);
      
      if (currentHeight === previousHeight) {
        // 더 이상 새 콘텐츠가 로드되지 않음
        break;
      }
      
      previousHeight = currentHeight;
      scrollAttempts++;
    }

    // 모든 작품 링크 수집
    const artworkLinks = await page.locator('a[href*="/asset/"]').all();
    const allUrls = [];
    for (const link of artworkLinks) {
      const href = await link.getAttribute('href');
      const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      allUrls.push(fullUrl);
    }
    console.log(`\n✅ 총 ${allUrls.length}개 작품 링크 발견\n`);

    // 브라우저 닫고 병렬 처리
    await browser.close();

    // 병렬 처리 설정
    const CONCURRENCY = 5; // 동시 처리 수
    const results = [];
    
    // 작품 처리 함수
    async function processArtwork(url, index) {
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      
      try {
        console.log(`[${index + 1}/${allUrls.length}] ${url.substring(0, 60)}...`);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        
        // 이미지가 로드될 때까지 대기 (최대 5초)
        await page.waitForTimeout(2000);
        
        // 스크롤해서 lazy loading 이미지 트리거
        await page.evaluate(() => window.scrollTo(0, 300));
        await page.waitForTimeout(1000);

        // 작품 정보 추출
        const artworkData = await page.evaluate(() => {
          const titleEl = document.querySelector('h1');
          const title = titleEl ? titleEl.textContent.trim() : null;
          
          let artist = null;
          let year = null;
          
          const h2Elements = document.querySelectorAll('h2');
          for (const h2 of h2Elements) {
            const text = h2.textContent.trim();
            if (text.includes('Get the app') || text.includes('Hayward Gallery')) continue;
            
            const yearMatch = text.match(/(\d{4})$/);
            if (yearMatch) {
              year = yearMatch[1];
              artist = text.replace(/\d{4}$/, '').trim();
            } else {
              artist = text;
            }
            
            if (artist) break;
          }
          
          if (!artist) {
            const allText = document.body.innerText;
            const creatorMatch = allText.match(/(?:Creator|Artist)[:\s]+([^\n]+)/i);
            if (creatorMatch) artist = creatorMatch[1].trim();
          }
          
          if (!year) {
            const allText = document.body.innerText;
            const match = allText.match(/\b(1[89][0-9]{2}|20[0-2][0-9])\b/);
            if (match) year = match[1];
          }
          
          // 여러 선택자로 이미지 찾기 (Google Arts & Culture 패턴)
          let image = null;
          const imgCandidates = [
            ...document.querySelectorAll('img[src*="googleusercontent.com"]'),
            ...document.querySelectorAll('img[src*="lh3."]'),
            ...document.querySelectorAll('img[src*="lh4."]'),
            ...document.querySelectorAll('img[src*="lh5."]'),
            ...document.querySelectorAll('img[data-src*="googleusercontent"]'),
          ];
          
          // 가장 큰 이미지 선택 (로고나 아이콘 제외)
          for (const img of imgCandidates) {
            const src = img.src || img.dataset.src;
            if (!src) continue;
            // 작은 아이콘 제외 (100px 이하)
            if (img.naturalWidth && img.naturalWidth < 100) continue;
            if (img.width && img.width < 100) continue;
            // 로고/아바타 제외
            if (src.includes('avatar') || src.includes('logo') || src.includes('icon')) continue;
            image = src;
            break;
          }
          
          if (image && image.includes('=')) {
            image = image.replace(/=w\d+.*/, '=w1200');
          }
          
          return { title, artist, year, image };
        });

        if (!artworkData.title || !artworkData.image) {
          await browser.close();
          return null;
        }

        const artworkId = `hayward-gac-${index + 1}`;
        const imageBuffer = await downloadImage(artworkData.image);
        const r2Key = `${MUSEUM_SLUG}/collection/${artworkId}.webp`;
        const r2Url = await uploadToR2(imageBuffer, r2Key);

        if (!r2Url) {
          await browser.close();
          return null;
        }

        console.log(`    ✅ ${artworkData.title.substring(0, 40)}... by ${artworkData.artist || 'Unknown'}`);
        
        await browser.close();
        
        return {
          id: artworkId,
          title: artworkData.title,
          artist: artworkData.artist || 'Unknown Artist',
          year: parseYear(artworkData.year),
          image: r2Url,
          sourceUrl: url
        };
        
      } catch (error) {
        console.log(`    ❌ [${index + 1}] 오류: ${error.message}`);
        await browser.close();
        return null;
      }
    }

    // 병렬 처리 실행
    for (let i = 0; i < allUrls.length; i += CONCURRENCY) {
      const batch = allUrls.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((url, batchIndex) => processArtwork(url, i + batchIndex))
      );
      results.push(...batchResults.filter(r => r !== null));
      
      // 중간 저장 (100개마다)
      if (results.length % 100 === 0) {
        console.log(`\n📊 중간 저장: ${results.length}개 완료\n`);
      }
    }
    
    artworks.push(...results);

  } catch (error) {
    console.error('❌ 스크랩 오류:', error);
  }

  // 중복 제거
  console.log('\n🔍 중복 검사 중...');
  const uniqueArtworks = removeDuplicates(artworks);
  console.log(`    ${artworks.length}개 → ${uniqueArtworks.length}개 (${artworks.length - uniqueArtworks.length}개 중복 제거)`);

  // 표지 이미지 (첫 번째 작품)
  const coverImage = uniqueArtworks.length > 0 ? uniqueArtworks[0].image : '';

  // JSON 저장
  const result = {
    museum: 'Hayward Gallery',
    museumId: MUSEUM_SLUG,
    collectionName: COLLECTION_NAME,
    scrapedAt: new Date().toISOString(),
    totalObjects: uniqueArtworks.length,
    coverImage: coverImage,
    objects: uniqueArtworks
  };

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(result, null, 2));
  console.log(`\n✅ 저장 완료: ${OUTPUT_JSON}`);
  console.log(`📊 총 ${uniqueArtworks.length}개 작품 아카이브됨`);

  return result;
}

// 실행
scrapeCollection().catch(console.error);
