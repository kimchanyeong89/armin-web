/**
 * Petit Palais 실패한 작품 재스크래핑
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FAILED_URLS_FILE = '/tmp/petit-palais-failed.txt';
const OUTPUT_FILE = path.join(__dirname, '../public/data/petit-palais-collection.json');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeArtworkDetail(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(1500);
    
    const data = await page.evaluate(() => {
      const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
      const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
      
      const titleEl = document.querySelector('p.title');
      const title = titleEl?.textContent?.trim() || ogTitle || '';
      
      let artist = 'Unknown';
      document.querySelectorAll('p').forEach(p => {
        if (p.className === 'author') {
          const raw = p.textContent.trim();
          artist = raw.split(/\s+(?:Ornans|Paris|Lyon|Rome|London|\d{4})/)[0].trim() || raw.split(',')[0].trim() || raw;
        }
      });
      
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
      
      return { title, artist, dateText, image: ogImage, medium };
    });
    
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
    console.error(`  ❌ 실패: ${url.split('/').pop()} - ${err.message.split('\n')[0]}`);
    return null;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('🔄 Petit Palais 실패 작품 재스크래핑');
  console.log('='.repeat(60));
  
  // 실패한 URL 로드
  const failedUrls = fs.readFileSync(FAILED_URLS_FILE, 'utf8').trim().split('\n').filter(u => u);
  console.log(`\n📋 실패 URL: ${failedUrls.length}개\n`);
  
  // 기존 데이터 로드
  const existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
  const existingUrls = new Set(existingData.objects.map(o => o.sourceUrl));
  
  // 이미 있는 URL 제외
  const urlsToScrape = failedUrls.filter(url => !existingUrls.has(url));
  console.log(`🔍 스크래핑 대상: ${urlsToScrape.length}개 (기존에 있는 ${failedUrls.length - urlsToScrape.length}개 제외)\n`);
  
  if (urlsToScrape.length === 0) {
    console.log('✅ 모든 작품이 이미 스크래핑되어 있습니다.');
    return;
  }
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  const newArtworks = [];
  let success = 0;
  let failed = 0;
  
  for (let i = 0; i < urlsToScrape.length; i++) {
    const url = urlsToScrape[i];
    const artwork = await scrapeArtworkDetail(page, url);
    
    if (artwork && artwork.image) {
      artwork.id = `petit-palais-retry-${i + 1}`;
      newArtworks.push(artwork);
      success++;
      console.log(`  ✅ ${artwork.title.substring(0, 40)}`);
    } else {
      failed++;
    }
    
    if ((i + 1) % 10 === 0) {
      console.log(`  진행: ${i + 1}/${urlsToScrape.length} | 성공: ${success} | 실패: ${failed}`);
    }
  }
  
  await browser.close();
  
  // 기존 데이터에 추가
  existingData.objects.push(...newArtworks);
  existingData.totalObjects = existingData.objects.length;
  
  // ID 재정렬
  existingData.objects.forEach((obj, idx) => {
    obj.id = `petit-palais-${idx + 1}`;
  });
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(existingData, null, 2));
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 재스크래핑 완료`);
  console.log(`   - 새로 추가: ${success}개`);
  console.log(`   - 실패: ${failed}개`);
  console.log(`   - 총 작품: ${existingData.objects.length}개`);
  console.log('='.repeat(60));
}

main().catch(console.error);
