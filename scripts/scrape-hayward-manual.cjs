/**
 * Hayward Gallery - Manual Captcha Bypass
 * Opens a real browser window for manual captcha solving
 * After solving, press Enter in terminal to continue scraping
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const sharp = require('sharp');
const https = require('https');
const http = require('http');
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
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  console.log('✅ R2 credentials loaded');
}

const BASE_URL = 'https://artsandculture.google.com';
const JSON_PATH = path.join(__dirname, '../public/data/hayward-gallery-collection.json');

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const request = client.get(url, { 
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
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

async function uploadToR2(imageBuffer, key) {
  if (!s3Client) return null;
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

function waitForEnter(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('============================================');
  console.log('🎨 Hayward Gallery - Manual Captcha Mode');
  console.log('============================================\n');
  console.log('⚠️  브라우저가 열리면 캡차를 수동으로 해결하세요.');
  console.log('    해결 후 터미널에서 Enter를 누르세요.\n');

  const browser = await puppeteer.launch({ 
    headless: false,  // 실제 브라우저 창 열기
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1400,900'
    ],
    defaultViewport: null
  });

  const page = await browser.newPage();
  const artworks = [];

  try {
    // 파트너 페이지로 이동
    console.log('📡 Google Arts & Culture 페이지 로드 중...');
    await page.goto(`${BASE_URL}/partner/hayward-gallery`, { 
      waitUntil: 'networkidle2', 
      timeout: 60000 
    });

    // 캡차 페이지인지 확인
    const currentUrl = page.url();
    if (currentUrl.includes('/sorry/') || currentUrl.includes('captcha')) {
      console.log('\n🔐 캡차가 감지되었습니다!');
      console.log('   브라우저에서 캡차를 해결해주세요.');
      await waitForEnter('\n✅ 캡차 해결 후 Enter를 누르세요... ');
    }

    // 컬렉션 페이지로 이동
    console.log('\n📡 컬렉션 페이지로 이동...');
    await page.goto(`${BASE_URL}/explore/collections/hayward-gallery?c=assets`, { 
      waitUntil: 'networkidle2', 
      timeout: 60000 
    });

    // 다시 캡차 확인
    if (page.url().includes('/sorry/')) {
      console.log('\n🔐 다시 캡차가 감지되었습니다!');
      await waitForEnter('✅ 캡차 해결 후 Enter를 누르세요... ');
    }

    await delay(3000);

    // 스크롤해서 모든 작품 로드
    console.log('\n📜 작품 목록 스크롤 중...');
    let previousHeight = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 100;

    while (scrollAttempts < maxScrollAttempts) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(1500);
      
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      const itemCount = await page.evaluate(() => document.querySelectorAll('a[href*="/asset/"]').length);
      
      if (scrollAttempts % 10 === 0) {
        console.log(`    스크롤 ${scrollAttempts + 1}: ${itemCount}개 작품 로드됨`);
      }
      
      if (currentHeight === previousHeight && scrollAttempts > 10) {
        console.log(`    스크롤 완료: 총 ${itemCount}개 작품 발견`);
        break;
      }
      
      previousHeight = currentHeight;
      scrollAttempts++;
    }

    // 모든 작품 링크 수집
    const artworkUrls = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="/asset/"]');
      return [...new Set(Array.from(links).map(a => a.href))];
    });

    console.log(`\n✅ 총 ${artworkUrls.length}개 고유 작품 링크 발견\n`);

    if (artworkUrls.length === 0) {
      console.log('⚠️  작품 링크를 찾지 못했습니다.');
      console.log('    브라우저에서 페이지를 확인하고 Enter를 누르세요.');
      await waitForEnter('');
      
      // 다시 시도
      const retryUrls = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href*="/asset/"]');
        return [...new Set(Array.from(links).map(a => a.href))];
      });
      artworkUrls.push(...retryUrls);
    }

    // 각 작품 페이지 방문
    for (let i = 0; i < artworkUrls.length; i++) {
      const url = artworkUrls[i];
      
      try {
        process.stdout.write(`[${i + 1}/${artworkUrls.length}] 처리 중...`);
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await delay(2500);
        
        // 스크롤해서 이미지 로드
        await page.evaluate(() => window.scrollTo(0, 400));
        await delay(1500);

        // 작품 정보 추출
        const artworkData = await page.evaluate(() => {
          const titleEl = document.querySelector('h1');
          const title = titleEl ? titleEl.textContent.trim() : null;
          
          let artist = null;
          let year = null;
          
          const h2Elements = document.querySelectorAll('h2');
          for (const h2 of h2Elements) {
            const text = h2.textContent.trim();
            if (text.includes('Get the app') || text.includes('Hayward Gallery') || text.length > 100) continue;
            
            const yearMatch = text.match(/(\d{4})$/);
            if (yearMatch) {
              year = yearMatch[1];
              artist = text.replace(/\d{4}$/, '').trim();
            } else {
              artist = text;
            }
            if (artist) break;
          }
          
          // 이미지 찾기
          let image = null;
          const imgs = document.querySelectorAll('img');
          for (const img of imgs) {
            const src = img.src || img.dataset?.src || '';
            if (!src.includes('googleusercontent') && !src.includes('lh3.') && !src.includes('lh4.') && !src.includes('lh5.')) continue;
            if (img.naturalWidth && img.naturalWidth < 100) continue;
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
          console.log(` ⏭️ 정보 부족`);
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
          console.log(` ✅ ${artworkData.title.substring(0, 25)}...`);
        } else {
          console.log(` ❌ 업로드 실패`);
        }

      } catch (error) {
        console.log(` ❌ ${error.message}`);
      }

      // 20개마다 진행상황 표시
      if ((i + 1) % 20 === 0) {
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
