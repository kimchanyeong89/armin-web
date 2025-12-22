/**
 * MEP (Maison Européenne de la Photographie) Collection Scraper - TEST
 * 작가별 페이지에서 사진 작품 수집
 * 테스트: 3명의 작가만
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 테스트용 작가 3명
const TEST_ARTISTS = [
  'https://www.mep-fr.org/les-collections/brassai/',
  'https://www.mep-fr.org/les-collections/coco-capitan/',
  'https://www.mep-fr.org/les-collections/robert-frank/'
];

async function scrapeArtistPage(browser, artistUrl) {
  console.log(`\n📸 Scraping: ${artistUrl}`);
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  try {
    await page.goto(artistUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // 쿠키 배너 처리
    try {
      const acceptBtn = await page.$('button:has-text("OK"), button:has-text("Accept"), .accept-cookies');
      if (acceptBtn) await acceptBtn.click();
    } catch (e) {}
    
    const data = await page.evaluate(() => {
      const result = {
        artistName: '',
        bio: '',
        artworks: []
      };
      
      // 작가 이름
      const h1 = document.querySelector('h1');
      result.artistName = h1?.textContent?.trim() || '';
      
      // 바이오/설명
      const bioEl = document.querySelector('.entry-content p, .artist-bio, article p');
      result.bio = bioEl?.textContent?.trim()?.slice(0, 500) || '';
      
      // 작품 이미지들 찾기
      const images = document.querySelectorAll('figure img, .gallery img, article img, .artwork img, .photo img');
      images.forEach((img, idx) => {
        const src = img.src || img.dataset?.src || '';
        if (src && !src.includes('logo') && !src.includes('icon')) {
          // 캡션 찾기
          const figure = img.closest('figure');
          const caption = figure?.querySelector('figcaption')?.textContent?.trim() || '';
          
          // 제목 추출 시도
          let title = img.alt || caption || '';
          
          result.artworks.push({
            image: src,
            title: title || `Untitled ${idx + 1}`,
            caption: caption
          });
        }
      });
      
      // 비디오 찾기
      const videos = document.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"]');
      videos.forEach(video => {
        let videoData = null;
        
        if (video.tagName === 'VIDEO') {
          videoData = {
            type: 'video',
            src: video.src || video.querySelector('source')?.src || ''
          };
        } else if (video.src?.includes('youtube')) {
          const match = video.src.match(/embed\/([^?]+)/);
          videoData = {
            type: 'youtube',
            videoId: match ? match[1] : '',
            src: video.src
          };
        } else if (video.src?.includes('vimeo')) {
          const match = video.src.match(/video\/(\d+)/);
          videoData = {
            type: 'vimeo',
            videoId: match ? match[1] : '',
            src: video.src
          };
        }
        
        if (videoData) {
          result.artworks.push({
            ...videoData,
            title: 'Video work',
            isVideo: true
          });
        }
      });
      
      return result;
    });
    
    await context.close();
    
    console.log(`   ✅ Found: ${data.artistName}`);
    console.log(`   📷 ${data.artworks.length} works`);
    
    return data;
    
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    await context.close();
    return null;
  }
}

async function main() {
  console.log('🏛️ MEP Collection Scraper - TEST (3 artists)\n');
  
  const browser = await chromium.launch({ headless: true });
  const allArtworks = [];
  
  try {
    for (const url of TEST_ARTISTS) {
      const artistData = await scrapeArtistPage(browser, url);
      
      if (artistData && artistData.artworks.length > 0) {
        artistData.artworks.forEach((work, idx) => {
          allArtworks.push({
            id: `mep-${artistData.artistName.toLowerCase().replace(/\s+/g, '-')}-${idx + 1}`,
            title: work.title,
            artist: artistData.artistName,
            image: work.image || '',
            type: work.isVideo ? 'video' : '2D',
            video: work.isVideo ? {
              type: work.type,
              videoId: work.videoId || null,
              src: work.src
            } : null,
            source: 'MEP',
            detailUrl: url,
            caption: work.caption || ''
          });
        });
      }
    }
    
    console.log(`\n\n📊 Total: ${allArtworks.length} works from ${TEST_ARTISTS.length} artists`);
    
    // 샘플 출력
    console.log('\n📋 Sample works:');
    allArtworks.slice(0, 5).forEach((art, i) => {
      console.log(`   ${i + 1}. "${art.title}" by ${art.artist}`);
      console.log(`      Image: ${art.image ? 'Yes' : 'No'}, Video: ${art.video ? art.video.type : 'No'}`);
    });
    
    // 저장
    const output = {
      museum: 'Maison Européenne de la Photographie',
      museumId: 'mep',
      collectionName: 'Photography Collection',
      scrapedAt: new Date().toISOString(),
      totalObjects: allArtworks.length,
      objects: allArtworks
    };
    
    const outputPath = 'downloads/mep-test-collection.json';
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\n💾 Saved to ${outputPath}`);
    
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
