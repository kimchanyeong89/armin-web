/**
 * Musée Jacquemart-André - Must-See Works Scraper
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const LIST_URL = 'https://www.musee-jacquemart-andre.com/en/discover/must-see-works-art';
const FINAL_OUTPUT = path.join(__dirname, '../public/data/jacquemart-andre-collection.json');

async function scrapeDetail(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    const data = await page.evaluate(() => {
      // 제목
      const titleEl = document.querySelector('h1, .work-title, .title');
      const title = titleEl ? titleEl.textContent.trim() : null;
      
      // 작가
      const artistEl = document.querySelector('.artist, .author, [class*="artist"]');
      let artist = artistEl ? artistEl.textContent.trim() : null;
      
      // 작가가 없으면 h1 다음 텍스트에서 찾기
      if (!artist) {
        const allText = document.body.innerText;
        const lines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        // 생몰년이 있는 줄 찾기
        for (const line of lines) {
          if (/\(\d{4}\s*[-–]\s*\d{4}\)/.test(line) || /\(\d{4}\s*[-–]\s*\d{4}/.test(line)) {
            artist = line.replace(/\(\d{4}.*$/, '').trim();
            break;
          }
        }
      }
      
      // 이미지
      let image = null;
      const imgEls = document.querySelectorAll('img');
      for (const img of imgEls) {
        const src = img.src || '';
        if (src.includes('/sites/default/files/') && !src.includes('logo') && !src.includes('icon')) {
          image = src;
          break;
        }
      }
      
      // og:image 대체
      if (!image) {
        const ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage) image = ogImage.content;
      }
      
      // 설명
      const descEl = document.querySelector('.work-description, .description, .body, article p');
      const description = descEl ? descEl.textContent.trim().substring(0, 500) : null;
      
      // 기타 정보
      let medium = null;
      let dimensions = null;
      let year = null;
      
      const infoEls = document.querySelectorAll('.field, .info, p');
      for (const el of infoEls) {
        const text = el.textContent.trim();
        if (!year && /^\d{4}$/.test(text)) year = text;
        if (!dimensions && /\d+\s*[x×]\s*\d+/.test(text)) dimensions = text;
        if (!medium && /(huile|oil|canvas|toile|bronze|marble|marbre)/i.test(text)) {
          medium = text.substring(0, 100);
        }
      }
      
      return { title, artist, image, description, medium, dimensions, year };
    });
    
    return { ...data, detailUrl: url };
  } catch (e) {
    console.log(`  ❌ ${url}: ${e.message}`);
    return { error: e.message, detailUrl: url };
  }
}

async function scrape() {
  console.log('🏛️ Musée Jacquemart-André - Must-See Works Scraper');
  console.log('='.repeat(50));
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // 목록 페이지에서 작품 URL 수집
  console.log('\n📋 작품 목록 수집 중...');
  await page.goto(LIST_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  
  // 쿠키 팝업 닫기
  try {
    const cookieBtn = await page.$('button:has-text("Accept")');
    if (cookieBtn) await cookieBtn.click();
    await page.waitForTimeout(1000);
  } catch {}
  
  const workUrls = await page.$$eval('a[href*="/works/"]', els => {
    const seen = new Set();
    return els.filter(el => {
      if (seen.has(el.href)) return false;
      seen.add(el.href);
      return true;
    }).map(el => el.href);
  });
  
  console.log(`✅ ${workUrls.length}개 작품 발견\n`);
  
  const artworks = [];
  
  for (let i = 0; i < workUrls.length; i++) {
    const url = workUrls[i];
    process.stdout.write(`\r[${i + 1}/${workUrls.length}] 스크래핑 중...`);
    
    const data = await scrapeDetail(page, url);
    
    if (!data.error) {
      artworks.push({
        id: `jacquemart-${i + 1}`,
        title: data.title || 'Sans titre',
        artist: data.artist || 'Unknown',
        year: data.year || null,
        image: data.image,
        dimensions: data.dimensions || null,
        medium: data.medium || null,
        description: data.description || null,
        source: 'Musée Jacquemart-André',
        detailUrl: data.detailUrl
      });
    }
    
    await page.waitForTimeout(500);
  }
  
  await browser.close();
  
  // 저장
  const finalOutput = {
    museum: 'Musée Jacquemart-André',
    museumId: 'jacquemart-andre',
    collectionName: 'Must-See Works Collection',
    scrapedAt: new Date().toISOString(),
    totalObjects: artworks.length,
    coverImage: artworks[0]?.image || '',
    objects: artworks
  };
  
  fs.writeFileSync(FINAL_OUTPUT, JSON.stringify(finalOutput, null, 2));
  
  console.log('\n\n' + '='.repeat(50));
  console.log('✅ 완료!');
  console.log(`  - 총 수집: ${artworks.length}개`);
  console.log(`📁 저장: ${FINAL_OUTPUT}`);
}

scrape().catch(console.error);
