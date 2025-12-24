/**
 * Musée des Beaux-Arts de Rouen 스크래핑
 * https://mbarouen.fr/en/collections (모든 컬렉션 페이지 합치기)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const LOG_DIR = path.join(__dirname, '../downloads');
const CONCURRENCY = 8;

const CONFIG = {
  id: 'musee-beaux-arts-rouen',
  name: 'Musée des Beaux-Arts de Rouen',
  baseUrl: 'https://mbarouen.fr',
  collectionsUrl: 'https://mbarouen.fr/en/collections',
  city: 'Rouen',
  country: 'France'
};

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function collectCollectionPages(page) {
  console.log(`\n🔗 ${CONFIG.name}: 컬렉션 페이지 수집 중...`);
  
  await page.goto(CONFIG.collectionsUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await delay(3000);
  
  const collectionPages = await page.evaluate(() => {
    const pages = [];
    document.querySelectorAll('a[href*="/en/collections/"]').forEach(a => {
      const href = a.href;
      const text = a.textContent?.trim();
      // 메인 페이지 제외, 실제 컬렉션 페이지만
      if (href !== 'https://mbarouen.fr/en/collections' && 
          !href.includes('#') && 
          text && text.length > 2) {
        pages.push({
          url: href,
          name: text,
          category: href.split('/').pop()?.replace(/-/g, ' ')
        });
      }
    });
    // 중복 제거
    const unique = [];
    const seen = new Set();
    pages.forEach(p => {
      if (!seen.has(p.url)) {
        seen.add(p.url);
        unique.push(p);
      }
    });
    return unique;
  });
  
  console.log(`✅ ${collectionPages.length}개 컬렉션 페이지 발견`);
  collectionPages.forEach(p => console.log(`   - ${p.name}`));
  
  return collectionPages;
}

async function collectArtworksFromCollection(context, collection) {
  const page = await context.newPage();
  const artworkLinks = [];
  
  try {
    console.log(`\n📂 "${collection.name}" 컬렉션 스크래핑...`);
    await page.goto(collection.url, { waitUntil: 'networkidle', timeout: 60000 });
    await delay(3000);
    
    // 스크롤하며 모든 작품 로드
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
    
    // 작품 링크 수집
    const links = await page.evaluate(() => {
      const urls = [];
      document.querySelectorAll('a[href*="/en/oeuvres/"], a[href*="/en/works/"], a[href*="/oeuvre/"]').forEach(a => {
        urls.push(a.href);
      });
      return [...new Set(urls)];
    });
    
    // 작품 카드 직접 파싱 시도
    const cards = await page.evaluate((cat) => {
      const items = [];
      document.querySelectorAll('.artwork, .card, .item, article, .teaser').forEach(el => {
        const img = el.querySelector('img');
        const title = el.querySelector('h2, h3, .title, .name')?.textContent?.trim();
        const link = el.querySelector('a')?.href;
        
        if (title && img?.src) {
          items.push({
            title,
            imageUrl: img.src,
            sourceUrl: link,
            category: cat
          });
        }
      });
      return items;
    }, collection.category);
    
    console.log(`   ✅ ${cards.length}개 작품 발견 (링크: ${links.length}개)`);
    
    await page.close();
    return { links, cards, collection };
  } catch (e) {
    console.log(`   ❌ 오류: ${e.message}`);
    await page.close();
    return { links: [], cards: [], collection };
  }
}

async function scrapeArtworkDetail(context, url, category, index, total) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await delay(2000);
    
    const data = await page.evaluate(() => {
      const title = document.querySelector('h1, .title')?.textContent?.trim();
      if (!title) return { error: 'no_title' };
      
      let artist = 'Unknown';
      let year = null;
      let medium = '';
      let description = '';
      
      // 메타 정보 영역 파싱
      document.querySelectorAll('.field, .meta, dt, dd, .info-item, p').forEach(el => {
        const text = el.textContent?.trim() || '';
        const prevLabel = el.previousElementSibling?.textContent?.trim()?.toLowerCase() || '';
        const elLabel = el.querySelector('label, .label, strong')?.textContent?.toLowerCase() || '';
        const label = prevLabel || elLabel;
        
        if (label.includes('artist') || label.includes('artiste') || label.includes('auteur')) {
          artist = text.replace(/^(artist|artiste|auteur)\s*:?\s*/i, '').trim();
        }
        if (label.includes('date') || label.includes('year') || label.includes('année')) {
          const match = text.match(/(\d{4})/);
          if (match) year = match[1];
        }
        if (label.includes('technique') || label.includes('medium') || label.includes('matér')) {
          medium = text.replace(/^(technique|medium|matériaux?)\s*:?\s*/i, '').trim();
        }
      });
      
      // 이미지
      const img = document.querySelector('.artwork-image img, .main-image img, article img, .field img, .visual img');
      const imageUrl = img?.src || '';
      
      // 설명
      const descEl = document.querySelector('.description, .body, .content p, article p');
      if (descEl) description = descEl.textContent?.trim().slice(0, 500);
      
      return { title, artist, year, imageUrl, medium, description };
    });
    
    await page.close();
    
    if (data.error) return null;
    
    process.stdout.write(`\r  [${index + 1}/${total}] ${data.title?.slice(0, 40) || 'Unknown'}...`);
    
    return {
      ...data,
      artworkType: category,
      sourceUrl: url
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
    const collections = await collectCollectionPages(page);
    await page.close();
    
    const allArtworks = [];
    
    // 각 컬렉션에서 작품 수집
    for (const collection of collections) {
      const result = await collectArtworksFromCollection(context, collection);
      
      // 상세 페이지가 있으면 스크래핑
      if (result.links.length > 0) {
        for (let i = 0; i < result.links.length; i += CONCURRENCY) {
          const batch = result.links.slice(i, i + CONCURRENCY);
          const results = await Promise.all(
            batch.map((url, j) => 
              scrapeArtworkDetail(context, url, collection.category, i + j, result.links.length)
            )
          );
          results.filter(r => r).forEach(r => {
            allArtworks.push({
              id: `rouen-mba-${allArtworks.length}`,
              ...r,
              museum: CONFIG.name,
              city: CONFIG.city,
              country: CONFIG.country
            });
          });
        }
      } else if (result.cards.length > 0) {
        // 카드에서 직접 추출한 데이터 사용
        result.cards.forEach((card, i) => {
          allArtworks.push({
            id: `rouen-mba-${allArtworks.length}`,
            title: card.title,
            artist: 'Unknown',
            year: null,
            imageUrl: card.imageUrl,
            medium: '',
            artworkType: card.category,
            description: '',
            sourceUrl: card.sourceUrl || collection.url,
            museum: CONFIG.name,
            city: CONFIG.city,
            country: CONFIG.country
          });
        });
      }
    }
    
    console.log(`\n\n✅ ${allArtworks.length}개 작품 스크래핑 완료`);
    
    // 저장
    const outputData = {
      museum: CONFIG.name,
      city: CONFIG.city,
      country: CONFIG.country,
      scrapedAt: new Date().toISOString(),
      totalArtworks: allArtworks.length,
      artworks: allArtworks
    };
    
    const outputPath = path.join(OUTPUT_DIR, `${CONFIG.id}-collection.json`);
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    console.log(`💾 저장: ${outputPath}`);
    
    // 로그 저장
    const logPath = path.join(LOG_DIR, `${CONFIG.id}-scrape-log.json`);
    fs.writeFileSync(logPath, JSON.stringify({
      config: CONFIG,
      collections: collections.length,
      totalArtworks: allArtworks.length,
      timestamp: new Date().toISOString()
    }, null, 2));
    
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
