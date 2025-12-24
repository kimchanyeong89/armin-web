/**
 * Petit Palais Paris 전체 컬렉션 스크래퍼
 * 모든 카테고리의 작품을 하나의 영구전시로 수집
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.petitpalais.paris.fr';

const CATEGORIES = [
  { id: 'masterpieces', name: 'Masterpieces', url: '/en/collections/chefs-doeuvre' },
  { id: 'classical-world', name: 'Classical World', url: '/en/collections/classical-world' },
  { id: 'icons', name: 'Icons', url: '/en/collections/icons' },
  { id: 'middle-ages', name: 'Middle Ages', url: '/en/collections/middle-ages' },
  { id: 'renaissance', name: 'Renaissance', url: '/en/collections/renaissance' },
  { id: '17th-century', name: '17th Century', url: '/en/collections/17th-century' },
  { id: '18th-century', name: '18th Century', url: '/en/collections/18th-century' },
  { id: '19th-century', name: '19th Century', url: '/en/collections/19th-century' },
  { id: 'paris-1900', name: 'Paris 1900', url: '/en/collections/paris-1900' }
];

const OUTPUT_FILE = path.join(__dirname, '../public/data/petit-palais-collection.json');
const LOG_FILE = path.join(__dirname, '../downloads/petit-palais-scrape-log.json');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function collectArtworkLinks(page, categoryUrl) {
  const allLinks = new Set();
  let currentPage = 0;
  
  while (true) {
    const pageUrl = currentPage === 0 
      ? BASE_URL + categoryUrl 
      : BASE_URL + categoryUrl + '?page=' + currentPage;
    
    await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(2000);
    
    // 작품 링크 수집
    const links = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('a').forEach(a => {
        const href = a.href;
        if (href && href.includes('/oeuvre/')) {
          const exists = results.find(r => r === href);
          if (!exists) results.push(href);
        }
      });
      return results;
    });
    
    if (links.length === 0) break;
    
    const prevSize = allLinks.size;
    links.forEach(l => allLinks.add(l));
    
    // 새 링크가 없으면 마지막 페이지
    if (allLinks.size === prevSize) break;
    
    console.log(`     페이지 ${currentPage + 1}: ${links.length}개 (누적: ${allLinks.size}개)`);
    currentPage++;
    
    // 안전장치: 최대 20페이지
    if (currentPage >= 20) break;
  }
  
  return [...allLinks];
}

async function scrapeArtworkDetail(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(1500);
    
    const data = await page.evaluate(() => {
      // og 태그에서 기본 정보 추출
      const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
      const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
      
      // p.title 에서 제목
      const titleEl = document.querySelector('p.title');
      const title = titleEl?.textContent?.trim() || ogTitle || '';
      
      // p.author 에서 작가 - 클래스 비교로 찾기
      let artist = 'Unknown';
      document.querySelectorAll('p').forEach(p => {
        if (p.className === 'author') {
          const raw = p.textContent.trim();
          // "Gustave Courbet Ornans (Doubs), 1819 – ..." 형식에서 첫 번째 이름만 추출
          artist = raw.split(/\s+(?:Ornans|Paris|Lyon|Rome|London|\d{4})/)[0].trim() || raw.split(',')[0].trim() || raw;
        }
      });
      
      // 모든 p 태그에서 정보 추출
      let dateText = '';
      let medium = '';
      document.querySelectorAll('p').forEach(p => {
        const text = p.textContent.trim();
        if (text.startsWith('Date:')) {
          dateText = text.replace('Date:', '').trim();
        }
        if (text.startsWith('Materials and technics:') || text.startsWith('Materials:')) {
          medium = text.replace('Materials and technics:', '').replace('Materials:', '').trim();
        }
      });
      
      // 이미지 - og:image 사용
      const image = ogImage;
      
      return { title, artist, dateText, image, medium };
    });
    
    // 연도 추출
    let year = 0;
    if (data.dateText) {
      const match = data.dateText.match(/(\d{4})/);
      if (match) year = parseInt(match[1], 10);
    }
    
    return {
      title: data.title || 'Untitled',
      artist: data.artist || 'Unknown',
      year,
      date: data.dateText,
      image: data.image,
      medium: data.medium,
      sourceUrl: url
    };
  } catch (err) {
    console.error(`  ❌ 상세 스크래핑 실패: ${url} - ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('🎨 Petit Palais Paris 컬렉션 스크래퍼');
  console.log('='.repeat(60));
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  const allArtworkLinks = new Set();
  const categoryStats = {};
  
  // 1. 모든 카테고리에서 작품 링크 수집
  console.log('\n📂 카테고리별 작품 링크 수집...\n');
  
  for (const cat of CATEGORIES) {
    console.log(`  🔍 ${cat.name}...`);
    const links = await collectArtworkLinks(page, cat.url);
    categoryStats[cat.id] = links.length;
    links.forEach(link => allArtworkLinks.add(link));
    console.log(`     → ${links.length}개 발견 (누적: ${allArtworkLinks.size}개)`);
  }
  
  const uniqueLinks = [...allArtworkLinks];
  console.log(`\n✅ 총 ${uniqueLinks.length}개 고유 작품 링크 수집\n`);
  
  // 2. 각 작품 상세 페이지 스크래핑
  console.log('🖼️  작품 상세 정보 스크래핑...\n');
  
  const artworks = [];
  let success = 0;
  let failed = 0;
  
  for (let i = 0; i < uniqueLinks.length; i++) {
    const url = uniqueLinks[i];
    const artwork = await scrapeArtworkDetail(page, url);
    
    if (artwork && artwork.image) {
      artwork.id = `petit-palais-${i + 1}`;
      artworks.push(artwork);
      success++;
    } else {
      failed++;
    }
    
    if ((i + 1) % 10 === 0 || i === uniqueLinks.length - 1) {
      console.log(`  진행: ${i + 1}/${uniqueLinks.length} | 성공: ${success} | 실패: ${failed}`);
    }
  }
  
  await browser.close();
  
  // 3. 결과 저장
  const result = {
    galleryId: 'petit-palais',
    galleryName: 'Petit Palais - Musée des Beaux-Arts de la Ville de Paris',
    scrapedAt: new Date().toISOString(),
    totalObjects: artworks.length,
    categoryStats,
    objects: artworks
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
  console.log(`\n💾 ${OUTPUT_FILE} 저장 완료 (${artworks.length}개 작품)`);
  
  fs.writeFileSync(LOG_FILE, JSON.stringify({
    scrapedAt: new Date().toISOString(),
    totalLinks: uniqueLinks.length,
    success,
    failed,
    categoryStats
  }, null, 2));
  console.log(`📋 ${LOG_FILE} 로그 저장 완료`);
  
  console.log('\n📊 최종 보고서:');
  console.log(`   - 총 작품: ${artworks.length}개`);
  console.log(`   - 성공: ${success}개`);
  console.log(`   - 실패: ${failed}개`);
  Object.entries(categoryStats).forEach(([cat, count]) => {
    console.log(`   - ${cat}: ${count}개`);
  });
}

main().catch(console.error);
