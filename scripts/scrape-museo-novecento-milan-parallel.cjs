/**
 * Museo del Novecento (Milan) - 병렬 스크래퍼
 * 동시에 5개씩 처리
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const MUSEUM_URL = 'https://artsandculture.google.com/explore/collections/museo-del-novecento?c=assets&hl=en';
const OUTPUT_FILE = path.join(__dirname, '../public/data/museo-del-novecento-milan-collection.json');
const CONCURRENCY = 5;

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function collectArtworkUrls(page) {
  console.log('📋 작품 URL 수집 중...');
  
  const urls = new Set();
  let stableCount = 0;
  let lastCount = 0;
  
  while (stableCount < 8) {
    const newUrls = await page.evaluate(() => {
      const links = [];
      document.querySelectorAll('a[href*="/asset/"]').forEach(a => {
        if (a.href && !a.href.includes('/story/')) {
          links.push(a.href);
        }
      });
      return links;
    });
    
    newUrls.forEach(u => urls.add(u));
    
    if (urls.size === lastCount) {
      stableCount++;
    } else {
      stableCount = 0;
      lastCount = urls.size;
      if (urls.size % 100 === 0) console.log(`  ${urls.size}개...`);
    }
    
    await page.evaluate(() => window.scrollBy(0, 1500));
    await delay(200);
  }
  
  console.log(`  총 ${urls.size}개 발견\n`);
  return Array.from(urls);
}

async function scrapeArtwork(context, url, index) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await delay(1500);
    
    const data = await page.evaluate(() => {
      const titleEl = document.querySelector('h1');
      const title = titleEl?.textContent?.trim() || 'Untitled';
      
      let artist = 'Unknown';
      const artistEl = document.querySelector('a[href*="/entity/"]');
      if (artistEl) artist = artistEl.textContent?.trim() || 'Unknown';
      
      let year = '', medium = '', dimensions = '';
      
      // 메타데이터 추출
      document.querySelectorAll('[class*="detail"], dd, [role="listitem"]').forEach(el => {
        const text = el.textContent?.trim() || '';
        const yearMatch = text.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
        if (yearMatch && !year) year = yearMatch[1];
        if ((text.includes('cm') || text.includes('×')) && !dimensions) dimensions = text;
        if ((text.includes('oil') || text.includes('canvas') || text.includes('bronze')) && !medium) medium = text;
      });
      
      let image = '';
      const imgEl = document.querySelector('img[src*="googleusercontent"]');
      if (imgEl) image = imgEl.src.replace(/=w\d+/, '=w800').replace(/=h\d+/, '');
      
      return { title, artist, year, medium, dimensions, image };
    });
    
    await page.close();
    return { ...data, url, index };
  } catch (e) {
    await page.close();
    return { title: 'Error', artist: 'Unknown', url, index, error: e.message };
  }
}

async function main() {
  console.log('🎨 Museo del Novecento (Milan) - 병렬 스크래핑\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  // URL 수집
  await page.goto(MUSEUM_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await delay(2000);
  const artworkUrls = await collectArtworkUrls(page);
  await page.close();
  
  const objects = [];
  let completed = 0;
  
  // 병렬 처리
  for (let i = 0; i < artworkUrls.length; i += CONCURRENCY) {
    const batch = artworkUrls.slice(i, i + CONCURRENCY);
    const promises = batch.map((url, idx) => scrapeArtwork(context, url, i + idx));
    const results = await Promise.all(promises);
    
    for (const data of results) {
      if (data.error) {
        console.log(`[${data.index + 1}] ⚠ 오류`);
        continue;
      }
      
      // 필터링: 비작품 제외
      if (data.title.startsWith('Permanent Collection') ||
          data.title.startsWith('Room ') ||
          data.title.startsWith('Diario -')) {
        continue;
      }
      
      objects.push({
        id: `museo-novecento-milan-${objects.length}`,
        title: data.title,
        artist: data.artist,
        year: data.year || '',
        medium: data.medium || '',
        dimensions: data.dimensions || '',
        type: 'painting',
        room: '',
        image: data.image || '',
        url: data.url
      });
      
      completed++;
    }
    
    console.log(`[${Math.min(i + CONCURRENCY, artworkUrls.length)}/${artworkUrls.length}] ${objects.length}개 작품 수집`);
    
    // 주기적 저장
    if (objects.length % 50 === 0 && objects.length > 0) {
      const collection = {
        id: 'museo-del-novecento-milan',
        title: 'Museo del Novecento',
        museum: 'Museo del Novecento',
        location: 'Milan, Italy',
        description: 'Museum dedicated to 20th-century Italian art, housing works by Boccioni, Modigliani, De Chirico, and other modern masters.',
        coverImage: objects[0]?.image || '',
        website: 'https://www.museodelnovecento.org/',
        objects: objects
      };
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2));
    }
  }
  
  await browser.close();
  
  // 최종 저장
  const collection = {
    id: 'museo-del-novecento-milan',
    title: 'Museo del Novecento',
    museum: 'Museo del Novecento',
    location: 'Milan, Italy',
    description: 'Museum dedicated to 20th-century Italian art, housing works by Boccioni, Modigliani, De Chirico, and other modern masters.',
    coverImage: objects[0]?.image || '',
    website: 'https://www.museodelnovecento.org/',
    objects: objects
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2));
  
  console.log(`\n✅ 완료: ${objects.length}개 작품`);
  console.log(`📁 저장: ${OUTPUT_FILE}`);
}

main().catch(console.error);
