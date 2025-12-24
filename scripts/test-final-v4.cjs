/**
 * V4 스크래퍼 테스트 - 각 미술관에서 5개씩만
 */
const { chromium } = require('playwright');

// URL 슬러그에서 제목/작가 파싱
function parseMAMCSUrl(url) {
  const match = url.match(/\/artwork\/([^?]+)/);
  if (!match) return { artist: '', title: '' };
  
  const slug = match[1];
  const parts = slug.replace(/-\d+$/, '').split('-');
  
  let artistParts = [];
  let titleParts = [];
  let foundSeparator = false;
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isNamePart = ['dit', 'dite', 'le', 'la', 'de', 'du', 'van', 'von', 'der'].includes(part.toLowerCase());
    
    if (artistParts.length >= 2 && !isNamePart && !foundSeparator) {
      foundSeparator = true;
    }
    
    if (!foundSeparator) {
      artistParts.push(part);
    } else {
      titleParts.push(part);
    }
  }
  
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  
  return {
    artist: artistParts.map(capitalize).join(' '),
    title: titleParts.map(capitalize).join(' ') || 'Untitled'
  };
}

function parseRouenUrl(url) {
  const match = url.match(/\/oeuvres\/([^/?]+)/);
  if (!match) return '';
  const slug = match[1].replace(/-\d+$/, '');
  return slug.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

async function main() {
  console.log('🧪 V4 스크래퍼 테스트 (각 5개씩)\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  
  // === MAMCS 테스트 ===
  console.log('=== MAMCS 테스트 ===');
  const mamcsPage = await context.newPage();
  await mamcsPage.goto('https://www.navigart.fr/mamcs/artworks/checkbox:withimage/Avec%20image?page=1', { waitUntil: 'networkidle' });
  await mamcsPage.waitForTimeout(2000);
  
  const mamcsItems = await mamcsPage.$$eval('a[href*="/artwork/"]', links => {
    const seen = new Set();
    return links.slice(0, 10).map(link => {
      const href = link.href;
      if (seen.has(href)) return null;
      seen.add(href);
      const img = link.querySelector('img');
      return { href, imageUrl: img?.src || '' };
    }).filter(Boolean).slice(0, 5);
  });
  
  console.log(`  발견: ${mamcsItems.length}개`);
  for (const item of mamcsItems) {
    const parsed = parseMAMCSUrl(item.href);
    console.log(`  - ${parsed.artist}: "${parsed.title}"`);
    console.log(`    이미지: ${item.imageUrl ? '✅' : '❌'}`);
  }
  
  // === Rouen 테스트 ===
  console.log('\n=== Rouen MBA 테스트 ===');
  const rouenPage = await context.newPage();
  await rouenPage.goto('https://mbarouen.fr/en/collections/impressionism', { waitUntil: 'networkidle' });
  await rouenPage.waitForTimeout(2000);
  
  const rouenLinks = await rouenPage.$$eval('a[href*="/en/oeuvres/"]', els => 
    [...new Set(els.map(a => a.href))].slice(0, 5)
  );
  
  console.log(`  발견: ${rouenLinks.length}개 링크`);
  
  for (const link of rouenLinks) {
    const detailPage = await context.newPage();
    await detailPage.goto(link, { waitUntil: 'domcontentloaded' });
    await detailPage.waitForTimeout(1000);
    
    const data = await detailPage.evaluate(() => {
      const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
      const artist = document.querySelector('h2')?.textContent?.trim() || '';
      const bodyText = document.body.textContent || '';
      const dateMatch = bodyText.match(/DATE\s*:\s*(\d{4})/i);
      const year = dateMatch ? dateMatch[1] : '';
      
      const deepzoomImgs = document.querySelectorAll('img[src*="deepzoom"]');
      let imageUrl = '';
      for (const img of deepzoomImgs) {
        const hashMatch = img.src.match(/deepzoom\/([a-f0-9]+)_files/);
        if (hashMatch) {
          imageUrl = 'https://mbarouen.fr/sites/default/files/styles/large/public/oeuvres/' + hashMatch[1] + '.jpg';
          break;
        }
      }
      
      return { ogTitle, artist, year, imageUrl };
    });
    
    await detailPage.close();
    
    let title = data.ogTitle !== 'Musée des Beaux-Arts' ? data.ogTitle : parseRouenUrl(link);
    const artistClean = data.artist.replace(/\s*\([^)]*\)\s*\|.*$/, '').trim();
    
    console.log(`  - ${artistClean}: "${title}" (${data.year})`);
    console.log(`    이미지: ${data.imageUrl ? '✅' : '❌'}`);
  }
  
  // === Lille 테스트 ===
  console.log('\n=== Lille PBA 테스트 ===');
  const lillePage = await context.newPage();
  await lillePage.goto('https://pba.lille.fr/en/Collections/Highlights', { waitUntil: 'networkidle' });
  await lillePage.waitForTimeout(3000);
  
  // 스크롤
  for (let i = 0; i < 5; i++) {
    await lillePage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await lillePage.waitForTimeout(1000);
  }
  
  const lilleLinks = await lillePage.$$eval('a[href*="/Collections/Highlights/"]', els => 
    [...new Set(els.map(a => a.href).filter(h => h.split('/').length > 6))].slice(0, 5)
  );
  
  console.log(`  발견: ${lilleLinks.length}개 링크`);
  
  for (const link of lilleLinks) {
    const detailPage = await context.newPage();
    await detailPage.goto(link, { waitUntil: 'domcontentloaded' });
    await detailPage.waitForTimeout(1000);
    
    const data = await detailPage.evaluate(() => {
      const title = document.querySelector('h1')?.textContent?.trim() || '';
      const bodyText = document.body.textContent || '';
      const yearMatch = bodyText.match(/\b(1[4-9]\d{2}|20[0-2]\d)\b/);
      const year = yearMatch ? yearMatch[0] : '';
      const img = document.querySelector('img[src*="artwork_illustration"], img[src*="pba.lille.fr"]');
      const imageUrl = img?.src || '';
      return { title, year, imageUrl };
    });
    
    await detailPage.close();
    console.log(`  - "${data.title}" (${data.year})`);
    console.log(`    이미지: ${data.imageUrl ? '✅' : '❌'}`);
  }
  
  await browser.close();
  console.log('\n✅ 테스트 완료');
}

main().catch(console.error);
