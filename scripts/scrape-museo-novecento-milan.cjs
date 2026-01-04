/**
 * Museo del Novecento (Milan) - Google Arts & Culture 스크래퍼
 * 
 * URL: https://artsandculture.google.com/partner/museo-del-novecento
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const MUSEUM_URL = 'https://artsandculture.google.com/explore/collections/museo-del-novecento?c=assets&hl=en';
const OUTPUT_FILE = path.join(__dirname, '../public/data/museo-del-novecento-milan-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/museo-novecento-milan-progress.json');

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  } catch {
    return { completed: [], artworkUrls: [] };
  }
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function collectArtworkUrls(page) {
  console.log('📋 작품 URL 수집 중...');
  
  const urls = new Set();
  let lastCount = 0;
  let stableCount = 0;
  
  while (stableCount < 10) {
    // 현재 페이지의 작품 링크 수집
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
      if (urls.size % 50 === 0) {
        console.log(`  ${urls.size}개 발견...`);
      }
    }
    
    // 스크롤
    await page.evaluate(() => window.scrollBy(0, 1000));
    await delay(300);
  }
  
  console.log(`  ${urls.size}개 발견 완료`);
  return Array.from(urls);
}

async function scrapeArtwork(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await delay(2000);
  
  const data = await page.evaluate(() => {
    // 제목
    const titleEl = document.querySelector('h1');
    const title = titleEl?.textContent?.trim() || 'Untitled';
    
    // 아티스트
    let artist = 'Unknown';
    const artistEl = document.querySelector('[data-gaaction="artist"]') 
      || document.querySelector('a[href*="/entity/"]');
    if (artistEl) {
      artist = artistEl.textContent?.trim() || 'Unknown';
    }
    
    // 메타데이터 (년도, 재료 등)
    const details = {};
    document.querySelectorAll('[class*="detail"]').forEach(el => {
      const text = el.textContent?.trim();
      if (text) {
        // 년도 패턴
        const yearMatch = text.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
        if (yearMatch && !details.year) {
          details.year = yearMatch[1];
        }
        // 크기 패턴
        if (text.includes('cm') || text.includes('×')) {
          details.dimensions = text;
        }
        // 재료
        if (text.includes('oil') || text.includes('canvas') || text.includes('olio') || 
            text.includes('carta') || text.includes('bronzo')) {
          details.medium = text;
        }
      }
    });
    
    // 구조화된 정보 테이블
    document.querySelectorAll('dl, [role="list"]').forEach(dl => {
      const items = dl.querySelectorAll('dt, dd, [role="listitem"]');
      for (let i = 0; i < items.length - 1; i += 2) {
        const key = items[i]?.textContent?.trim().toLowerCase();
        const value = items[i + 1]?.textContent?.trim();
        if (key && value) {
          if (key.includes('date') || key.includes('anno') || key.includes('created')) {
            details.year = value.match(/\d{4}/)?.[0] || value;
          } else if (key.includes('medium') || key.includes('material') || key.includes('tecnica')) {
            details.medium = value;
          } else if (key.includes('dimension') || key.includes('misure')) {
            details.dimensions = value;
          } else if (key.includes('type') || key.includes('tipo')) {
            details.type = value;
          }
        }
      }
    });
    
    // 이미지
    let image = '';
    const imgEl = document.querySelector('img[src*="googleusercontent"]');
    if (imgEl) {
      image = imgEl.src.replace(/=w\d+/, '=w800').replace(/=h\d+/, '');
    }
    
    return { title, artist, ...details, image };
  });
  
  return data;
}

async function main() {
  console.log('🎨 Museo del Novecento (Milan) - Google Arts 스크래핑\n');
  
  const progress = loadProgress();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  // URL 수집
  if (progress.artworkUrls.length === 0) {
    await page.goto(MUSEUM_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await delay(3000);
    progress.artworkUrls = await collectArtworkUrls(page);
    saveProgress(progress);
    console.log(`\n총 ${progress.artworkUrls.length}개 작품 URL 수집 완료\n`);
  } else {
    console.log(`기존 ${progress.artworkUrls.length}개 URL 사용\n`);
  }
  
  // 기존 데이터 로드
  let existingObjects = [];
  try {
    const existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
    existingObjects = existingData.objects || [];
    console.log(`기존 ${existingObjects.length}개 데이터 로드\n`);
  } catch {
    console.log('새로 시작\n');
  }
  
  const objects = [...existingObjects];
  const existingUrls = new Set(existingObjects.map(o => o.url));
  const completedSet = new Set(progress.completed);
  
  for (let i = 0; i < progress.artworkUrls.length; i++) {
    const url = progress.artworkUrls[i];
    
    if (completedSet.has(url) || existingUrls.has(url)) {
      continue;
    }
    
    try {
      const data = await scrapeArtwork(page, url);
      
      const artwork = {
        id: `museo-novecento-milan-${i}`,
        title: data.title || 'Untitled',
        artist: data.artist || 'Unknown',
        year: data.year || '',
        medium: data.medium || '',
        dimensions: data.dimensions || '',
        type: data.type || 'painting',
        room: '',
        image: data.image || '',
        url: url
      };
      
      objects.push(artwork);
      progress.completed.push(url);
      
      const hasImage = artwork.image ? '✓' : '✗';
      console.log(`[${objects.length}/${progress.artworkUrls.length}] ${hasImage} ${artwork.title.substring(0, 35)} - ${artwork.artist.substring(0, 20)}`);
      
      // 주기적 저장 (데이터 + 진행 상황)
      if (objects.length % 50 === 0) {
        saveProgress(progress);
        const tempCollection = {
          id: 'museo-del-novecento-milan',
          title: 'Museo del Novecento',
          museum: 'Museo del Novecento',
          location: 'Milan, Italy',
          description: 'Museum dedicated to 20th-century Italian art.',
          coverImage: objects[0]?.image || '',
          website: 'https://www.museodelnovecento.org/',
          objects: objects
        };
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(tempCollection, null, 2));
        console.log(`  💾 ${objects.length}개 저장됨`);
      }
      
    } catch (e) {
      console.log(`[${i + 1}] ⚠ 오류: ${e.message.substring(0, 40)}`);
    }
    
    await delay(1000);
  }
  
  await browser.close();
  
  // 결과 저장
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
  saveProgress(progress);
  
  console.log(`\n✅ 완료: ${objects.length}개 작품`);
  console.log(`📁 저장: ${OUTPUT_FILE}`);
}

main().catch(console.error);
