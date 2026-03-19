/**
 * Museum of Fine Arts, Budapest (MFAB) Scraper
 * URL: https://www.mfab.hu/artworks/
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/mfab-collection-test.json');
const LOG_FILE = path.join(__dirname, '../downloads/mfab-test-run.log');

// 디렉토리 생성
if (!fs.existsSync(path.dirname(OUTPUT_FILE))) fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function scrapeArtworkDetail(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    const metadata = await page.evaluate(() => {
      const data = {};
      data.originalUrl = window.location.href;
      
      // 제목
      const titleEl = document.querySelector('h1.page-title, .artwork-title');
      data.title = titleEl ? titleEl.textContent.trim() : '';
      
      // 이미지 (다양한 선택자 시도)
      const imgSelectors = [
        '.artwork-image img', 
        '.page-content img',
        'figure.wp-block-image img',
        'img[class*="wp-image-"]',
        '.entry-content img',
        '.main-image img'
      ];
      
      let imgEl = null;
      for (const sel of imgSelectors) {
        imgEl = document.querySelector(sel);
        if (imgEl) break;
      }

      if (imgEl) {
        data.imageUrl = imgEl.src;
        // 상대 경로 처리
        if (data.imageUrl && !data.imageUrl.startsWith('http')) {
             // base URL이 없으면 도메인 붙이기
             if (data.imageUrl.startsWith('/')) {
                 data.imageUrl = 'https://www.mfab.hu' + data.imageUrl;
             }
        }
      }
      
      // 이미지가 없으면 null 리턴 (필수 조건)
      if (!data.imageUrl) return null;
      
      // 메타데이터 테이블/리스트 파싱
      // MFAB 상세 페이지 구조에 맞춰 수정 필요 (일단 일반적인 구조 탐색)
      const rows = document.querySelectorAll('.artwork-details .row, .meta-data tr, dl div');
      
      rows.forEach(row => {
        const labelEl = row.querySelector('label, dt, th, .label');
        const valueEl = row.querySelector('.value, dd, td');
        
        if (labelEl && valueEl) {
          const label = labelEl.textContent.trim().toLowerCase().replace(':', '');
          const value = valueEl.textContent.trim();
          
          if (label.includes('artist') || label.includes('maker') || label.includes('creator')) {
            data.artist = value;
          } else if (label.includes('date') || label.includes('year') || label.includes('period')) {
            data.date = value;
          } else if (label.includes('medium') || label.includes('technique') || label.includes('material')) {
            data.medium = value;
          } else if (label.includes('dimension') || label.includes('size')) {
            data.dimensions = value;
          } else if (label.includes('inventory')) {
            data.inventoryNumber = value;
          } else if (label.includes('collection') || label.includes('department')) {
            data.department = value;
          }
        }
      });
      
      // 설명
      const descEl = document.querySelector('.artwork-description, .content-text');
      if (descEl) {
        data.description = descEl.textContent.trim();
      }
      
      return data;
    });
    
    return metadata;
    
  } catch (e) {
    log(`❌ 상세 수집 실패 (${url}): ${e.message}`);
    return null;
  }
}

// Helper function defined at the top scope
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  log('🚀 MFAB Scraper Started');
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  const page = await browser.newPage();
  
  // 1. 목록 페이지 접속
  const baseUrl = 'https://www.mfab.hu/artworks/?per_page=100&offset=0&current_page=1&orderby=&order=asc&show_only=withimage&artwork_type=computer-print,film,painting,photograph,print,prints-and-drawings,video';
  log(`목록 페이지 접속: ${baseUrl}`);
  
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60000 });
  
  // 2. 링크 수집
  const links = await page.evaluate(() => {
    const items = [];
    document.querySelectorAll('.card__link').forEach(a => {
      items.push(a.href);
    });
    return items;
  });
  
  log(`🔗 발견된 작품 링크: ${links.length}개`);
  
  const artworks = [];
  
  // 3. 상세 수집 (100개 제한)
  for (let i = 0; i < Math.min(links.length, 100); i++) {
    const url = links[i];
    log(`[${i+1}/${links.length}] 수집 중: ${url}`);
    
    const detail = await scrapeArtworkDetail(page, url);
    
    if (detail) {
      artworks.push({
        id: `mfab-${url.split('/').filter(s=>s).pop()}`,
        name: detail.title || 'Untitled',
        artist: detail.artist || 'Unknown',
        date: detail.date || '',
        image: detail.imageUrl || '',
        medium: detail.medium || '',
        dimension: detail.dimensions || '',
        category: detail.department || 'Painting', // 임시
        description: detail.description || '',
        sourceUrl: url,
        originalUrl: url,
        type: '2D' // 일단 2D로 가정
      });
      
      // 중간 저장 (10개마다)
      if (artworks.length % 10 === 0) {
        const output = {
            museum: 'Museum of Fine Arts, Budapest',
            collection: 'MFAB Collection',
            artworks: artworks,
            total: artworks.length,
            scrapedAt: new Date().toISOString()
        };
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
        log(`💾 중간 저장: ${artworks.length}개`);
      }
    }
    
    await sleep(1000);
  }
  
  // 4. 저장
  const output = {
    museum: 'Museum of Fine Arts, Budapest',
    collection: 'MFAB Collection',
    artworks: artworks,
    total: artworks.length,
    scrapedAt: new Date().toISOString()
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  log(`✨ 완료! ${artworks.length}개 저장됨: ${OUTPUT_FILE}`);
  
  await browser.close();
}

main().catch(console.error);
