#!/usr/bin/env node
/**
 * Wallace Collection 스크래퍼 v12
 * 공식 웹사이트(wallacecollection.org)에서 스크래핑
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../downloads/wallace-official-artworks.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/wallace-official-progress.json');

const TEST_MODE = process.argv.includes('--test');

// 컬렉션 카테고리
const CATEGORIES = [
  { name: 'Paintings', url: 'https://www.wallacecollection.org/explore/collection/paintings/', type: 'painting' },
  { name: 'Sculpture', url: 'https://www.wallacecollection.org/explore/collection/sculpture/', type: 'sculpture' },
  { name: 'Arms and Armour', url: 'https://www.wallacecollection.org/explore/collection/arms-and-armour/', type: 'arms' },
  { name: 'Decorative Arts', url: 'https://www.wallacecollection.org/explore/collection/decorative-arts/', type: 'decorative' },
];

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🏛️ Wallace Collection 공식 사이트 스크래퍼 v12\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  
  const allArtworks = [];
  const categoriesToScrape = TEST_MODE ? CATEGORIES.slice(0, 1) : CATEGORIES;
  
  try {
    for (const category of categoriesToScrape) {
      console.log(`📂 ${category.name} 카테고리 스크래핑...`);
      
      const page = await context.newPage();
      
      try {
        await page.goto(category.url, { waitUntil: 'networkidle', timeout: 60000 });
        await delay(2000);
        
        // 하이라이트 작품들의 링크 수집
        const artworkLinks = await page.evaluate(() => {
          const links = [];
          document.querySelectorAll('a').forEach(a => {
            const href = a.getAttribute('href');
            if (href && href.includes('/search-the-collection/')) {
              const title = a.textContent?.trim();
              if (title && title.length > 2 && !links.some(l => l.href === href)) {
                links.push({ href, title });
              }
            }
          });
          return links;
        });
        
        console.log(`  📋 ${artworkLinks.length}개 작품 링크 발견`);
        
        // 각 작품 페이지 방문
        for (let i = 0; i < artworkLinks.length; i++) {
          const link = artworkLinks[i];
          
          try {
            await page.goto(link.href, { waitUntil: 'networkidle', timeout: 30000 });
            await delay(1500);
            
            // 작품 정보 추출
            const artwork = await page.evaluate(() => {
              let title = '', artist = '', year = '', medium = '', dimensions = '', image = '';
              
              // 제목
              const titleEl = document.querySelector('h1');
              title = titleEl?.textContent?.trim() || '';
              
              // 작가
              const artistEl = document.querySelector('.artist, [class*="artist"]');
              artist = artistEl?.textContent?.trim() || '';
              
              // 이미지
              const imgEl = document.querySelector('img[src*="cloudfront"], img[src*="wp-content"]');
              if (imgEl) image = imgEl.src;
              
              // 메타데이터 (다양한 선택자 시도)
              document.querySelectorAll('p, span, div').forEach(el => {
                const text = el.textContent?.trim();
                if (!text) return;
                
                // 연도 패턴
                if (!year && /^\d{4}/.test(text) || /about\s+\d{4}|c\.\s*\d{4}/i.test(text)) {
                  year = text;
                }
                
                // 미디엄 패턴
                if (!medium && /oil on|canvas|panel|bronze|marble|wood|porcelain|steel|iron/i.test(text)) {
                  medium = text;
                }
                
                // 디멘션 패턴
                if (!dimensions && /\d+\.?\d*\s*x\s*\d+\.?\d*\s*(cm|mm|in)/i.test(text)) {
                  dimensions = text;
                }
              });
              
              return { title, artist, year, medium, dimensions, image };
            });
            
            if (artwork.title) {
              allArtworks.push({
                id: `wallace-${Date.now()}-${i}`,
                ...artwork,
                category: category.name,
                sourceUrl: link.href,
              });
              
              process.stdout.write(`\r  ✅ ${i + 1}/${artworkLinks.length} (${artwork.image ? '📷' : '⬜'})`);
            }
            
          } catch (err) {
            console.log(`\n  ⚠️ ${link.title}: ${err.message.substring(0, 30)}`);
          }
        }
        
        console.log('');
        
      } catch (err) {
        console.log(`  ❌ 카테고리 오류: ${err.message.substring(0, 40)}`);
      } finally {
        await page.close();
      }
    }
    
  } finally {
    await browser.close();
  }
  
  // 결과 저장
  const withImages = allArtworks.filter(a => a.image).length;
  const withArtist = allArtworks.filter(a => a.artist).length;
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    museum: 'The Wallace Collection',
    source: 'wallacecollection.org',
    scrapedAt: new Date().toISOString(),
    totalArtworks: allArtworks.length,
    withImages,
    withArtist,
    artworks: allArtworks,
  }, null, 2));
  
  console.log('\n' + '='.repeat(50));
  console.log(`✅ ${allArtworks.length}개 작품 저장`);
  console.log(`📷 이미지: ${withImages}개 | 🎨 작가: ${withArtist}개`);
  console.log(`📁 ${OUTPUT_FILE}`);
  console.log('='.repeat(50));
}

main().catch(console.error);
