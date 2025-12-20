/**
 * Fix Hayward Gallery Collection Images
 * Re-download images from Google Arts & Culture using sourceUrl
 */

const { chromium } = require('playwright');
const sharp = require('sharp');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// S3 Client for R2
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || 'armin-gallery-images';
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
}

const JSON_PATH = path.join(__dirname, '../public/data/hayward-gallery-collection.json');

// 이미지 다운로드
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const request = client.get(url, { 
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
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
    request.setTimeout(15000, () => {
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

async function main() {
  console.log('============================================');
  console.log('🔧 Hayward Gallery Collection Image Fixer');
  console.log('============================================\n');

  // 기존 JSON 로드
  let existingData;
  try {
    existingData = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
    console.log(`📂 기존 데이터 로드: ${existingData.objects?.length || 0}개 항목\n`);
  } catch (e) {
    console.error('❌ JSON 파일을 찾을 수 없습니다');
    process.exit(1);
  }

  const objects = existingData.objects || [];
  if (objects.length === 0) {
    console.error('❌ 처리할 객체가 없습니다');
    process.exit(1);
  }

  // Playwright 브라우저 시작
  const browser = await chromium.launch({ headless: true });
  const results = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    const sourceUrl = obj.sourceUrl;
    
    if (!sourceUrl) {
      console.log(`[${i + 1}/${objects.length}] ⏭️ sourceUrl 없음: ${obj.title}`);
      failCount++;
      continue;
    }

    console.log(`[${i + 1}/${objects.length}] ${obj.title}...`);
    
    const page = await browser.newPage();
    
    try {
      await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      
      // 이미지 로드 대기
      await page.waitForTimeout(3000);
      
      // 스크롤해서 lazy loading 트리거
      await page.evaluate(() => window.scrollTo(0, 500));
      await page.waitForTimeout(1500);

      // 이미지 URL 찾기
      const imageUrl = await page.evaluate(() => {
        // 여러 선택자로 이미지 찾기
        const candidates = [
          ...document.querySelectorAll('img[src*="googleusercontent.com"]'),
          ...document.querySelectorAll('img[src*="lh3."]'),
          ...document.querySelectorAll('img[src*="lh4."]'),
          ...document.querySelectorAll('img[src*="lh5."]'),
          ...document.querySelectorAll('img[data-src*="googleusercontent"]'),
        ];
        
        for (const img of candidates) {
          const src = img.src || img.dataset?.src;
          if (!src) continue;
          // 작은 아이콘 제외
          if (img.naturalWidth && img.naturalWidth < 100) continue;
          if (img.width && img.width < 100) continue;
          // 로고/아바타 제외
          if (src.includes('avatar') || src.includes('logo') || src.includes('icon')) continue;
          
          // 고해상도 버전으로 변환
          let finalSrc = src;
          if (finalSrc.includes('=')) {
            finalSrc = finalSrc.replace(/=w\d+.*/, '=w1200');
          }
          return finalSrc;
        }
        return null;
      });

      if (!imageUrl) {
        console.log(`    ❌ 이미지 URL을 찾을 수 없음`);
        failCount++;
        await page.close();
        continue;
      }

      // 이미지 다운로드 및 R2 업로드
      const imageBuffer = await downloadImage(imageUrl);
      const r2Key = `hayward-gallery/collection/${obj.id}.webp`;
      const r2Url = await uploadToR2(imageBuffer, r2Key);

      if (r2Url) {
        results.push({
          ...obj,
          image: r2Url
        });
        successCount++;
        console.log(`    ✅ 성공`);
      } else {
        failCount++;
        console.log(`    ❌ R2 업로드 실패`);
      }

    } catch (error) {
      console.log(`    ❌ 오류: ${error.message}`);
      failCount++;
    }

    await page.close();
    
    // 진행상황 표시 (10개마다)
    if ((i + 1) % 10 === 0) {
      console.log(`\n📊 진행: ${i + 1}/${objects.length} (성공: ${successCount}, 실패: ${failCount})\n`);
    }
  }

  await browser.close();

  // JSON 업데이트
  const updatedData = {
    ...existingData,
    objects: results,
    totalObjects: results.length,
    scrapedAt: new Date().toISOString(),
    coverImage: results[0]?.image || existingData.coverImage
  };

  fs.writeFileSync(JSON_PATH, JSON.stringify(updatedData, null, 2));

  console.log('\n============================================');
  console.log(`✅ 완료: ${successCount}개 성공, ${failCount}개 실패`);
  console.log(`📁 저장: ${JSON_PATH}`);
  console.log('============================================');
}

main().catch(console.error);
