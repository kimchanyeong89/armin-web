/**
 * MAM Paris - Painting Collection PARALLEL Scraper (3페이지 테스트)
 * 
 * 병렬 처리: 동시에 5개씩 스크래핑
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.navigart.fr/mamparis/#/artworks/checkbox:withimage/Avec%20image/tree_domain_all/Peinture';
const OUTPUT_FILE = path.join(__dirname, '../downloads/mam-painting-parallel-test.json');
const FINAL_OUTPUT = path.join(__dirname, '../public/data/mam-painting-collection.json');

const TEST_PAGES = 3;
const PARALLEL_COUNT = 5; // 동시에 5개씩

async function scrapeDetail(context, url, listImage) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1500);
    
    const data = await page.evaluate(() => {
      let image = null;
      const imgElements = Array.from(document.querySelectorAll('img'));
      for (const img of imgElements) {
        const src = img.src || '';
        if (src.includes('images.navigart.fr') && !src.includes('data:image')) {
          image = src.replace('/400/', '/1000/').replace('/200/', '/1000/').replace('/800/', '/1000/');
          break;
        }
        const dataSrc = img.getAttribute('data-src') || '';
        if (dataSrc.includes('images.navigart.fr')) {
          image = dataSrc.replace('/400/', '/1000/').replace('/200/', '/1000/').replace('/800/', '/1000/');
          break;
        }
      }
      
      const pageText = document.body.innerText;
      const lines = pageText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      let artist = null;
      let title = null;
      let year = null;
      let medium = null;
      let dimensions = null;
      
      const hasDash = lines[0]?.startsWith('-') || lines[0]?.startsWith('–') || lines[0]?.startsWith('—');
      
      if (hasDash) {
        artist = lines[0].replace(/^[-–—]\s*/, '').trim();
        title = lines[1] || null;
      } else {
        artist = lines[0] || null;
        const isLifespan = lines[1] && /^\d{4}/.test(lines[1]) && /[,\-]/.test(lines[1]);
        title = isLifespan ? lines[2] : lines[1];
      }
      
      for (let i = 0; i < Math.min(lines.length, 15); i++) {
        const line = lines[i];
        if (!year && /^(vers\s+)?\d{4}$/.test(line)) year = line.trim();
        if (!medium && /^(Peinture|Huile|Acrylique|Tempera|Gouache|Aquarelle)/i.test(line)) medium = line;
        if (!dimensions && /^\d+[,.]?\d*\s*[x×]\s*\d+[,.]?\d*\s*cm$/i.test(line)) dimensions = line;
      }
      
      if (title && (/^(vers\s+)?\d{4}$/.test(title) || /^(Peinture|Huile)/i.test(title))) {
        title = null;
      }
      
      return { image, artist, title, year, medium, dimensions };
    });
    
    await page.close();
    return { ...data, listImage, detailUrl: url };
  } catch (e) {
    await page.close();
    return { error: e.message, detailUrl: url, listImage };
  }
}

async function scrape() {
  console.log('🎨 MAM Paris - PARALLEL Scraper (3페이지 테스트)');
  console.log('='.repeat(50));
  console.log(`테스트: ${TEST_PAGES}페이지, 병렬: ${PARALLEL_COUNT}개씩`);
  console.log('='.repeat(50) + '\n');
  
  const startTime = Date.now();
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const mainPage = await context.newPage();
  
  const artworks = [];
  let allItems = [];
  
  try {
    // Step 1: Collect all items from pages
    console.log('📋 Step 1: 리스트 수집...');
    for (let pageNum = 1; pageNum <= TEST_PAGES; pageNum++) {
      const pageUrl = `${BASE_URL}?page=${pageNum}&sort=random&layout=box`;
      await mainPage.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await mainPage.waitForTimeout(2000);
      await mainPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await mainPage.waitForTimeout(1500);
      
      const items = await mainPage.$$eval('a[href*="/artwork/"]', elements => {
        const seen = new Set();
        return elements.filter(el => {
          if (seen.has(el.href)) return false;
          seen.add(el.href);
          return true;
        }).map(el => {
          const img = el.querySelector('img');
          let listImage = null;
          if (img) {
            const src = img.src || img.getAttribute('data-src') || '';
            if (src.includes('navigart.fr') && !src.includes('data:image')) {
              listImage = src.replace('/400/', '/1000/');
            }
          }
          return { detailUrl: el.href, listImage };
        });
      });
      
      allItems = allItems.concat(items);
      console.log(`  페이지 ${pageNum}: ${items.length}개`);
    }
    
    console.log(`\n✅ 총 ${allItems.length}개 항목 수집\n`);
    
    // Step 2: Parallel scraping
    console.log(`📝 Step 2: 병렬 스크래핑 (${PARALLEL_COUNT}개씩)...`);
    
    for (let i = 0; i < allItems.length; i += PARALLEL_COUNT) {
      const batch = allItems.slice(i, i + PARALLEL_COUNT);
      
      const results = await Promise.all(
        batch.map(item => scrapeDetail(context, item.detailUrl, item.listImage))
      );
      
      for (const data of results) {
        if (!data.error) {
          artworks.push({
            id: `mam-painting-${artworks.length + 1}`,
            title: data.title || 'Sans titre',
            artist: data.artist || 'Artiste inconnu',
            year: data.year || null,
            image: data.image || data.listImage,
            dimensions: data.dimensions || null,
            medium: data.medium || 'Peinture',
            source: 'Musée d\'Art Moderne de Paris',
            collectionArea: 'Painting',
            detailUrl: data.detailUrl
          });
          process.stdout.write('✓');
        } else {
          process.stdout.write('✗');
        }
      }
      
      // Small delay between batches
      await new Promise(r => setTimeout(r, 300));
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    // Save results
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ 
      testDate: new Date().toISOString(),
      testPages: TEST_PAGES,
      parallelCount: PARALLEL_COUNT,
      elapsed: `${elapsed}s`,
      testCount: artworks.length,
      artworks 
    }, null, 2));
    
    const finalOutput = {
      museum: 'Musée d\'Art Moderne de Paris',
      museumId: 'mam-paris',
      collectionName: 'Painting Collection',
      scrapedAt: new Date().toISOString(),
      totalObjects: artworks.length,
      coverImage: artworks[0]?.image || '',
      objects: artworks
    };
    fs.writeFileSync(FINAL_OUTPUT, JSON.stringify(finalOutput, null, 2));
    
    console.log(`\n\n✅ 완료! ${artworks.length}개 작품 (${elapsed}초)`);
    console.log(`📁 저장: ${FINAL_OUTPUT}`);
    
    console.log('\n=== 샘플 ===');
    artworks.slice(0, 3).forEach((art, i) => {
      console.log(`${i + 1}. ${art.title} - ${art.artist}`);
    });
    
  } catch (e) {
    console.error('\n❌ 오류:', e.message);
  }
  
  await browser.close();
}

scrape();
