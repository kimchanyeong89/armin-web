/**
 * Hayward Gallery Collection - URL Reference Mode (Super Fast)
 * Just collects image URLs without downloading - 10x faster
 * Uses Google's image URLs directly
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
require('dotenv').config({ path: '.env.local' });

puppeteer.use(StealthPlugin());

const BASE_URL = 'https://artsandculture.google.com';
const JSON_PATH = path.join(__dirname, '../public/data/hayward-gallery-collection.json');

const CONCURRENCY = 10; // URL 수집만 하므로 더 많이 가능

function waitForEnter(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => { rl.question(prompt, () => { rl.close(); resolve(); }); });
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function parseYear(yearStr) {
  if (!yearStr) return null;
  const match = yearStr.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}

async function processArtwork(browser, url, index) {
  const page = await browser.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await delay(1000);

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
      
      // 이미지 URL 찾기 - 고해상도 버전으로 변환
      let image = null;
      const imgs = document.querySelectorAll('img');
      for (const img of imgs) {
        const src = img.src || '';
        if (!src.includes('googleusercontent') && !src.includes('lh3.') && !src.includes('lh4.') && !src.includes('lh5.')) continue;
        if (src.includes('avatar') || src.includes('logo') || src.includes('icon')) continue;
        // 고해상도 버전으로 변환
        image = src.replace(/=w\d+.*/, '=w800');
        break;
      }
      
      return { title, artist, year, image };
    });

    await page.close();

    if (!artworkData.title || !artworkData.image) return null;

    return {
      id: `hayward-gac-${index + 1}`,
      title: artworkData.title,
      artist: artworkData.artist || 'Unknown Artist',
      year: parseYear(artworkData.year),
      image: artworkData.image,
      sourceUrl: url
    };

  } catch (error) {
    await page.close();
    return null;
  }
}

async function main() {
  console.log('============================================');
  console.log('🚀 Hayward Gallery - Super Fast URL Mode');
  console.log(`📊 동시 처리: ${CONCURRENCY}개 탭 (URL만 수집)`);
  console.log('============================================\n');

  const browser = await puppeteer.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    defaultViewport: { width: 1400, height: 900 }
  });

  const page = await browser.newPage();
  const artworks = [];

  try {
    console.log('📡 페이지 로드 중...');
    await page.goto(`${BASE_URL}/partner/hayward-gallery`, { waitUntil: 'networkidle2', timeout: 60000 });

    if (page.url().includes('/sorry/')) {
      console.log('\n🔐 캡차 해결 필요!');
      await waitForEnter('✅ Enter... ');
    }

    await page.goto(`${BASE_URL}/explore/collections/hayward-gallery?c=assets`, { waitUntil: 'networkidle2', timeout: 60000 });
    if (page.url().includes('/sorry/')) await waitForEnter('✅ Enter... ');
    
    await delay(2000);

    // 빠른 스크롤
    console.log('\n📜 스크롤 중...');
    let prevH = 0, attempts = 0;
    while (attempts < 100) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(800);
      const h = await page.evaluate(() => document.body.scrollHeight);
      const cnt = await page.evaluate(() => document.querySelectorAll('a[href*="/asset/"]').length);
      if (attempts % 15 === 0) console.log(`    ${cnt}개...`);
      if (h === prevH && attempts > 10) break;
      prevH = h;
      attempts++;
    }

    const artworkUrls = await page.evaluate(() => 
      [...new Set([...document.querySelectorAll('a[href*="/asset/"]')].map(a => a.href))]
    );

    // 100개만 테스트
    const testUrls = artworkUrls.slice(0, 100);

    console.log(`\n✅ ${testUrls.length}개 처리 시작 (전체: ${artworkUrls.length}개)\n`);

    const startTime = Date.now();
    let completed = 0, successful = 0;

    // 병렬 처리
    for (let i = 0; i < testUrls.length; i += CONCURRENCY) {
      const batch = testUrls.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map((url, idx) => processArtwork(browser, url, i + idx))
      );
      
      for (const r of results) {
        completed++;
        if (r) { artworks.push(r); successful++; }
      }

      if (completed % 50 === 0 || completed === testUrls.length) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = (completed / elapsed * 60).toFixed(0);
        const eta = ((testUrls.length - completed) / (completed / elapsed) / 60).toFixed(1);
        console.log(`📊 ${completed}/${testUrls.length} | 성공: ${successful} | ${rate}개/분 | 남은시간: ~${eta}분`);
      }
    }

    await page.close();

  } catch (error) {
    console.error('❌ 오류:', error.message);
  }

  await browser.close();

  // 저장
  fs.writeFileSync(JSON_PATH, JSON.stringify({
    museum: 'Hayward Gallery',
    museumId: 'hayward-gallery',
    collectionName: 'The Collection',
    scrapedAt: new Date().toISOString(),
    totalObjects: artworks.length,
    coverImage: artworks[0]?.image || '',
    objects: artworks
  }, null, 2));

  console.log('\n============================================');
  console.log(`✅ 완료! ${artworks.length}개 저장`);
  console.log('============================================');
}

main().catch(console.error);
