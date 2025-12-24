/**
 * Palais des Beaux-Arts de Lille 스크래핑
 * https://pba.lille.fr/en/Collections/Highlights
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const LOG_DIR = path.join(__dirname, '../downloads');
const CONCURRENCY = 10;

const CONFIG = {
  id: 'palais-beaux-arts-lille',
  name: 'Palais des Beaux-Arts de Lille',
  url: 'https://pba.lille.fr/en/Collections/Highlights',
  city: 'Lille',
  country: 'France'
};

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function collectLinks(page) {
  console.log(`\n🔗 ${CONFIG.name}: 링크 수집 중...`);
  
  await page.goto(CONFIG.url, { waitUntil: 'networkidle', timeout: 60000 });
  await delay(3000);
  
  // 스크롤하면서 모든 작품 로드
  let previousHeight = 0;
  let stall = 0;
  while (stall < 5) {
    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
    if (currentHeight === previousHeight) {
      stall++;
    } else {
      stall = 0;
      previousHeight = currentHeight;
    }
    await page.evaluate(() => window.scrollBy(0, 2000));
    await delay(500);
  }
  
  const links = await page.evaluate(() => {
    const urls = [];
    document.querySelectorAll('a[href*="/en/Collections/Highlights/"]').forEach(a => {
      const href = a.href;
      // 카테고리 페이지 제외
      if (href.split('/').length > 6 && !href.includes('twitter') && !href.includes('facebook')) {
        urls.push(href);
      }
    });
    return [...new Set(urls)];
  });
  
  console.log(`✅ ${links.length}개 링크 수집 완료`);
  return links;
}

async function scrapeArtwork(context, url, index, total) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await delay(2000);
    
    const data = await page.evaluate((urlPath) => {
      const title = document.querySelector('h1, .title')?.textContent?.trim();
      if (!title) return { error: 'no_title' };
      
      let artist = 'Unknown';
      let year = null;
      let medium = '';
      let artworkType = '';
      let description = '';
      
      // 메타 정보 추출
      document.querySelectorAll('.field, .meta-item, dt, dd, p').forEach(el => {
        const text = el.textContent?.trim() || '';
        const label = el.previousElementSibling?.textContent?.trim()?.toLowerCase() || '';
        
        // 작가
        if (label.includes('artist') || label.includes('auteur') || label.includes('creator')) {
          artist = text;
        }
        // 연도
        if (label.includes('date') || label.includes('year') || label.includes('année')) {
          const match = text.match(/(\d{4})/);
          if (match) year = match[1];
        }
        // 미디엄
        if (label.includes('medium') || label.includes('technique') || label.includes('materials')) {
          medium = text;
        }
        // 타입
        if (label.includes('type') || label.includes('category') || label.includes('catégorie')) {
          artworkType = text;
        }
      });
      
      // URL에서 카테고리 추출
      const urlParts = urlPath.split('/');
      const categoryIndex = urlParts.indexOf('Highlights') + 1;
      if (categoryIndex > 0 && categoryIndex < urlParts.length - 1) {
        const category = urlParts[categoryIndex].replace(/-/g, ' ');
        if (!artworkType) artworkType = category;
      }
      
      // 이미지
      const img = document.querySelector('.artwork-image img, .main-image img, article img, .content img');
      let imageUrl = img?.src || '';
      
      // 설명
      const descEl = document.querySelector('.description, .notice, article p');
      if (descEl) description = descEl.textContent?.trim().slice(0, 500);
      
      return { title, artist, year, imageUrl, medium, artworkType, description };
    }, url);
    
    await page.close();
    
    if (data.error) {
      return null;
    }
    
    process.stdout.write(`\r  [${index + 1}/${total}] ${data.title?.slice(0, 40) || 'Unknown'}...`);
    
    return {
      id: `lille-pba-${index}`,
      title: data.title,
      artist: data.artist || 'Unknown',
      year: data.year,
      imageUrl: data.imageUrl,
      medium: data.medium || '',
      artworkType: data.artworkType || '',
      description: data.description || '',
      sourceUrl: url,
      museum: CONFIG.name,
      city: CONFIG.city,
      country: CONFIG.country
    };
  } catch (e) {
    await page.close();
    return null;
  }
}

async function main() {
  console.log(`\n🏛️  ${CONFIG.name} 스크래핑 시작...`);
  
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  try {
    const page = await context.newPage();
    const links = await collectLinks(page);
    await page.close();
    
    console.log(`\n📝 ${links.length}개 작품 스크래핑 시작...`);
    
    const artworks = [];
    
    // 병렬 처리
    for (let i = 0; i < links.length; i += CONCURRENCY) {
      const batch = links.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map((url, j) => scrapeArtwork(context, url, i + j, links.length))
      );
      results.filter(r => r).forEach(r => artworks.push(r));
    }
    
    console.log(`\n\n✅ ${artworks.length}개 작품 스크래핑 완료`);
    
    // 저장
    const outputData = {
      museum: CONFIG.name,
      city: CONFIG.city,
      country: CONFIG.country,
      scrapedAt: new Date().toISOString(),
      totalArtworks: artworks.length,
      artworks
    };
    
    const outputPath = path.join(OUTPUT_DIR, `${CONFIG.id}-collection.json`);
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    console.log(`💾 저장: ${outputPath}`);
    
    // 로그 저장
    const logPath = path.join(LOG_DIR, `${CONFIG.id}-scrape-log.json`);
    fs.writeFileSync(logPath, JSON.stringify({
      config: CONFIG,
      totalLinks: links.length,
      successfulScrapes: artworks.length,
      timestamp: new Date().toISOString()
    }, null, 2));
    
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
