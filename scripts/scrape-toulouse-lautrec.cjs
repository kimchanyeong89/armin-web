/**
 * Musée Toulouse-Lautrec Scraper
 * 213개 작품, WebMuseo 시스템 기반
 * Rate limit 방지 로직 포함
 */
const { chromium } = require('playwright');
const fs = require('fs');

const OUTPUT_DIR = '/Users/kietzsche/armin-web-main/public/data';
const OUTPUT_FILE = `${OUTPUT_DIR}/toulouse-lautrec-collection.json`;
const BASE_URL = 'https://webmuseo.com/ws/musee-toulouse-lautrec/app/collection';

function log(msg) {
  const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  console.log(`[${time}] ${msg}`);
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeToulouseLautrec(testMode = false) {
  console.log('═'.repeat(60));
  console.log(`  🎨 Musée Toulouse-Lautrec 스크래핑`);
  console.log(`  ${testMode ? '🧪 테스트 모드 (10개만)' : '🚀 전체 모드'}`);
  console.log('═'.repeat(60));
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'fr-FR',
    viewport: { width: 1920, height: 1080 }
  });
  
  // 먼저 메인 페이지 방문하여 세션 쿠키 획득
  log('🔐 세션 초기화 중...');
  const initPage = await context.newPage();
  await initPage.goto('https://webmuseo.com/ws/musee-toulouse-lautrec/app/collection', { 
    waitUntil: 'domcontentloaded', 
    timeout: 30000 
  });
  await delay(5000);
  await initPage.close();
  
  const artworks = [];
  const maxItems = testMode ? 10 : 300;
  
  try {
    // 1. 리스트 페이지에서 모든 작품 링크 수집
    const allLinks = [];
    let page = 1;
    let hasMore = true;
    
    log('📋 작품 링크 수집 시작...');
    
    while (hasMore && allLinks.length < maxItems) {
      const listPage = await context.newPage();
      const url = `${BASE_URL}?vc=ePkH4LF7w6iejEDVE_HJQh9PyAAA1v8gXA$$&page=${page}`;
      
      // Rate limit 방지: 첫 페이지는 10초, 이후 8초 딜레이
      await delay(page === 1 ? 10000 : 8000);
      
      try {
        await listPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await delay(4000);
        
        // 작품 링크 추출
        const links = await listPage.evaluate(() => {
          const anchors = document.querySelectorAll('a[href*="/collection/record/"]');
          const urls = [];
          anchors.forEach(a => {
            const href = a.href;
            if (!urls.includes(href)) {
              urls.push(href);
            }
          });
          return urls;
        });
        
        if (links.length === 0) {
          hasMore = false;
        } else {
          allLinks.push(...links);
          log(`페이지 ${page}: ${links.length}개 발견 (총 ${allLinks.length}개)`);
          page++;
        }
        
        // 테스트 모드에서 충분히 수집했으면 중단
        if (testMode && allLinks.length >= maxItems) {
          hasMore = false;
        }
      } catch (e) {
        log(`페이지 ${page} 오류: ${e.message}`);
        // rate limit 시 더 오래 기다림
        if (e.message.includes('Too many') || e.message.includes('timeout')) {
          log('Rate limit 감지, 30초 대기...');
          await delay(30000);
        } else {
          hasMore = false;
        }
      }
      
      await listPage.close();
    }
    
    // 중복 제거
    const uniqueLinks = [...new Set(allLinks)].slice(0, maxItems);
    log(`총 ${uniqueLinks.length}개 고유 링크, 상세 수집 시작...`);
    
    // 2. 상세 페이지에서 정보 추출 (순차적으로, 천천히)
    for (let i = 0; i < uniqueLinks.length; i++) {
      const url = uniqueLinks[i];
      const detailPage = await context.newPage();
      
      // Rate limit 방지 - 5초 딜레이
      await delay(5000);
      
      try {
        await detailPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(2000);
        
        const data = await detailPage.evaluate(() => {
          // 이미지 URL 추출
          let imageUrl = '';
          const ogImage = document.querySelector('meta[property="og:image"]');
          if (ogImage) {
            imageUrl = ogImage.content;
            // 상대 경로를 절대 경로로
            if (imageUrl.startsWith('/')) {
              imageUrl = 'https://webmuseo.com' + imageUrl;
            }
            // 더 큰 이미지로 업그레이드
            imageUrl = imageUrl.replace(/thumbw=\d+/, 'thumbw=1200').replace(/thumbh=\d+/, 'thumbh=1200');
          }
          
          // 제목
          let title = '';
          const titleMatch = document.title.match(/"([^"]+)"/);
          if (titleMatch) {
            title = titleMatch[1];
          }
          
          // 페이지 전체 텍스트
          const bodyText = document.body.innerText;
          
          // 작가 찾기
          let artist = 'Henri de Toulouse-Lautrec';
          
          // 제작 연도 찾기
          let year = '';
          const yearMatch = bodyText.match(/\b(18\d{2}|19\d{2})\b/);
          if (yearMatch) year = yearMatch[1];
          
          // 기법/재료 찾기 - li.field 패턴
          let medium = '';
          let dimensions = '';
          
          const fields = document.querySelectorAll('li.field, div.field');
          fields.forEach(field => {
            const text = field.textContent.trim();
            if (text.includes('Technique') || text.includes('matériaux')) {
              const value = text.replace(/Technique[^:]*:|matériaux[^:]*:/i, '').trim();
              if (value) medium = value;
            }
            if (text.includes('Dimension') || text.includes('Mesure') || text.includes('cm')) {
              const dimMatch = text.match(/\d+[,.]?\d*\s*[x×]\s*\d+[,.]?\d*(\s*[x×]\s*\d+[,.]?\d*)?\s*cm/i);
              if (dimMatch) dimensions = dimMatch[0];
            }
          });
          
          // dl/dd 패턴
          const dts = document.querySelectorAll('dt');
          dts.forEach(dt => {
            const dd = dt.nextElementSibling;
            if (dd && dd.tagName === 'DD') {
              const label = dt.textContent.toLowerCase();
              const value = dd.textContent.trim();
              if (label.includes('technique') || label.includes('matéri')) {
                medium = value;
              }
              if (label.includes('dimension') || label.includes('mesure')) {
                dimensions = value;
              }
            }
          });
          
          return { title, artist, year, medium, dimensions, imageUrl };
        });
        
        if (data.title || data.imageUrl) {
          artworks.push({
            id: `toulouse-lautrec-${artworks.length}`,
            title: data.title || 'Sans titre',
            artist: data.artist || 'Henri de Toulouse-Lautrec',
            year: data.year || '',
            medium: data.medium || '',
            dimensions: data.dimensions || '',
            imageUrl: data.imageUrl || '',
            sourceUrl: url,
            museum: 'Musée Toulouse-Lautrec'
          });
        }
        
        // 진행상황 출력
        if ((i + 1) % 10 === 0 || i === uniqueLinks.length - 1) {
          log(`${i + 1}/${uniqueLinks.length} 수집 완료 (${artworks.length}개 유효)`);
        }
      } catch (e) {
        log(`상세 페이지 오류 (${i}): ${e.message}`);
        if (e.message.includes('Too many')) {
          log('Rate limit 감지, 30초 대기...');
          await delay(30000);
          i--; // 재시도
        }
      }
      
      await detailPage.close();
    }
    
    // 저장
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
    
    console.log('═'.repeat(60));
    console.log(`  ✅ 완료: ${artworks.length}개`);
    console.log(`  📁 ${OUTPUT_FILE}`);
    console.log('═'.repeat(60));
    
    // 샘플 출력
    if (artworks.length > 0) {
      console.log('\n샘플 데이터:');
      console.log(JSON.stringify(artworks[0], null, 2));
    }
    
  } catch (error) {
    console.error('스크래핑 오류:', error);
  } finally {
    await browser.close();
  }
  
  return artworks;
}

// 실행
const testMode = process.argv.includes('--test');
scrapeToulouseLautrec(testMode);
