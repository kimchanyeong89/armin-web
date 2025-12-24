/**
 * 각 미술관 스크래퍼 테스트 (소량)
 */
const { chromium } = require('playwright');

async function testMAMCS() {
  console.log('\n=== MAMCS 테스트 ===');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // 단일 작품 페이지 테스트
  await page.goto('https://www.navigart.fr/mamcs/artwork/gustave-dore-coucher-de-soleil-dans-les-alpes-250000000004347', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  const data = await page.evaluate(() => {
    const artistLink = document.querySelector('a[href*="/artworks/authors/"]');
    const artist = artistLink?.textContent?.trim() || '';
    
    const pageText = document.body.textContent || '';
    const lines = pageText.split('\n').map(l => l.trim()).filter(l => l);
    
    // 아티스트 바로 다음 줄이 제목
    const artistIdx = lines.findIndex(l => l.includes(artist));
    const title = artistIdx >= 0 ? lines[artistIdx + 1] : '';
    
    const yearMatch = pageText.match(/vers?\s*(\d{4})\s*[-–]?\s*(\d{4})?/i);
    const year = yearMatch ? yearMatch[0] : '';
    
    const typeMatch = pageText.match(/(Peinture|Dessin|Photographie|Sculpture)/i);
    const artworkType = typeMatch ? typeMatch[1] : '';
    
    const mediumMatch = pageText.match(/(Huile sur toile|Huile sur bois|Aquarelle)/i);
    const medium = mediumMatch ? mediumMatch[0] : '';
    
    const dimMatch = pageText.match(/(\d+(?:,\d+)?)\s*[x×]\s*(\d+(?:,\d+)?)\s*cm/i);
    const dimensions = dimMatch ? dimMatch[0] : '';
    
    const img = document.querySelector('img[src*="images.navigart.fr"]');
    const imageUrl = img?.src || '';
    
    return { artist, title, year, artworkType, medium, dimensions, imageUrl };
  });
  
  console.log('결과:', JSON.stringify(data, null, 2));
  await browser.close();
  return data;
}

async function testRouen() {
  console.log('\n=== Rouen MBA 테스트 ===');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://mbarouen.fr/en/oeuvres/the-church-at-moret-in-the-morning-sun', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  const data = await page.evaluate(() => {
    const title = document.querySelector('h1')?.textContent?.trim() || '';
    const artist = document.querySelector('h2')?.textContent?.trim() || '';
    
    const metaText = document.body.textContent || '';
    const dateMatch = metaText.match(/DATE\s*:\s*(\d{4})/i);
    const year = dateMatch ? dateMatch[1] : '';
    
    const mediumMatch = metaText.match(/MEDIUM\s*:\s*([^\n]+)/i);
    const medium = mediumMatch ? mediumMatch[1].trim() : '';
    
    // 이미지 - deepzoom에서 추출
    const deepzoomImg = document.querySelector('img[src*="deepzoom"]');
    let imageUrl = '';
    if (deepzoomImg) {
      const src = deepzoomImg.src;
      const hashMatch = src.match(/deepzoom\/([a-f0-9]+)_files/);
      if (hashMatch) {
        imageUrl = `https://mbarouen.fr/sites/default/files/styles/large/public/oeuvres/${hashMatch[1]}.jpg`;
      }
    }
    
    // 대안: og:image 메타 태그
    if (!imageUrl) {
      const ogImage = document.querySelector('meta[property="og:image"]');
      imageUrl = ogImage?.content || '';
    }
    
    return { title, artist, year, medium, imageUrl };
  });
  
  console.log('결과:', JSON.stringify(data, null, 2));
  await browser.close();
  return data;
}

async function testLille() {
  console.log('\n=== Lille PBA 테스트 ===');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://pba.lille.fr/en/Collections/Highlights/16th-20th-century-Paintings/After-dinner-in-Ornans', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  
  const data = await page.evaluate(() => {
    // h1 또는 특정 클래스로 제목 찾기
    const h1 = document.querySelector('h1');
    const title = h1?.textContent?.trim() || '';
    
    // 페이지 전체 텍스트에서 정보 추출
    const bodyText = document.body.textContent || '';
    
    // 작가 찾기 (보통 제목 근처)
    const artistMatch = bodyText.match(/Gustave Courbet|Claude Monet|Pablo Picasso|([A-Z][a-z]+ [A-Z][a-z]+)/);
    const artist = artistMatch ? artistMatch[0] : '';
    
    // 연도
    const yearMatch = bodyText.match(/\b(1[4-9]\d{2}|20[0-2]\d)\b/);
    const year = yearMatch ? yearMatch[0] : '';
    
    // 이미지
    const img = document.querySelector('img[src*="pba.lille"], img[src*="collections"]');
    const imageUrl = img?.src || '';
    
    // og:image
    const ogImage = document.querySelector('meta[property="og:image"]');
    const ogImageUrl = ogImage?.content || '';
    
    return { title, artist, year, imageUrl, ogImageUrl };
  });
  
  console.log('결과:', JSON.stringify(data, null, 2));
  await browser.close();
  return data;
}

async function main() {
  console.log('🧪 스크래퍼 테스트 시작...\n');
  
  await testMAMCS();
  await testRouen();
  await testLille();
  
  console.log('\n✅ 테스트 완료');
}

main().catch(console.error);
