/**
 * MEP Video Collection Scraper
 * 비디오 작품들 스크랩해서 기존 컬렉션에 추가
 */

const { chromium } = require('playwright');
const fs = require('fs');

async function scrapeVideos() {
  console.log('🎬 Scraping MEP Video Collection...\n');
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://www.mep-fr.org/les-collections/la-collection-video/', {
    waitUntil: 'networkidle',
    timeout: 45000
  });
  await page.waitForTimeout(3000);
  
  // 쿠키 배너
  try {
    await page.click('button:has-text("OK"), .accept', { timeout: 2000 });
  } catch (e) {}
  
  const videos = await page.evaluate(() => {
    const results = [];
    
    // 이미지 + 캡션 패턴 찾기
    const images = document.querySelectorAll('img');
    
    images.forEach((img) => {
      const src = img.src || '';
      if (!src || src.includes('logo') || src.includes('icon') || src.includes('.gif')) return;
      if (!src.includes('mep-fr.org/wp-content')) return;
      
      // 부모에서 캡션 찾기
      let captionText = '';
      let parent = img.parentElement;
      
      for (let i = 0; i < 4 && parent; i++) {
        const text = parent.textContent?.trim();
        if (text && text.length > 20 && text.length < 500) {
          captionText = text;
          break;
        }
        parent = parent.parentElement;
      }
      
      if (!captionText) return;
      
      // 캡션 파싱: "Title, Artist, Year" 형식
      let title = '';
      let artist = '';
      let year = '';
      
      // 첫 줄 추출
      const firstLine = captionText.split('\n')[0].trim();
      
      // "Title, Artist, Year" 패턴
      const match = firstLine.match(/^(.+?),\s*(.+?),\s*(\d{4}(?:-\d{4})?)/);
      if (match) {
        title = match[1].trim();
        artist = match[2].trim();
        year = match[3].trim();
      } else {
        // 다른 패턴 시도
        const yearMatch = firstLine.match(/(\d{4}(?:-\d{4})?)/);
        if (yearMatch) {
          year = yearMatch[1];
          // 년도 이전 텍스트에서 제목과 작가 분리
          const beforeYear = firstLine.split(year)[0].trim();
          const parts = beforeYear.split(',').map(p => p.trim()).filter(Boolean);
          if (parts.length >= 2) {
            title = parts[0];
            artist = parts[1];
          } else if (parts.length === 1) {
            title = parts[0];
          }
        }
      }
      
      // 중복 체크
      const exists = results.some(r => r.image === src);
      if (!exists && title) {
        results.push({
          image: src,
          title: title,
          artist: artist,
          year: year,
          type: 'video',
          medium: 'Video'
        });
      }
    });
    
    return results;
  });
  
  await browser.close();
  
  console.log(`Found ${videos.length} video works with images\n`);
  videos.forEach(v => {
    console.log(`  - "${v.title}" by ${v.artist} (${v.year})`);
  });
  
  return videos;
}

async function main() {
  const videos = await scrapeVideos();
  
  // 기존 MEP 컬렉션 로드
  const mepPath = 'public/data/mep-photography-collection.json';
  const mepData = JSON.parse(fs.readFileSync(mepPath, 'utf-8'));
  
  console.log(`\n📸 Existing collection: ${mepData.objects.length} objects`);
  
  // 비디오 추가
  const startId = mepData.objects.length + 1;
  videos.forEach((v, idx) => {
    mepData.objects.push({
      id: `mep-video-${idx + 1}`,
      title: v.title,
      artist: v.artist,
      year: v.year,
      dimensions: '',
      medium: v.medium,
      image: v.image,
      type: 'video',
      video: null,
      source: 'MEP',
      detailUrl: 'https://www.mep-fr.org/les-collections/la-collection-video/'
    });
  });
  
  // 메타데이터 업데이트
  mepData.collectionName = 'The Collection';
  mepData.totalObjects = mepData.objects.length;
  mepData.scrapedAt = new Date().toISOString();
  
  // 저장
  fs.writeFileSync(mepPath, JSON.stringify(mepData, null, 2));
  
  console.log(`\n✅ Updated collection: ${mepData.objects.length} objects`);
  console.log(`   (Added ${videos.length} video works)`);
  console.log(`📄 Saved to: ${mepPath}`);
}

main().catch(console.error);
