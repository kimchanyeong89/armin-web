/**
 * Belvedere Museum Collection Scraper - Test (100 items)
 * URL: https://sammlung.belvedere.at/objects/images?
 * 모든 메타데이터 수집: 제목, 작가, 날짜, 매체, 크기, 오브젝트 타입, 설명, 이미지, 원본 링크
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/belvedere-collection-test.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/belvedere-test-progress.json');
const LOG_FILE = path.join(__dirname, '../downloads/belvedere-test-log.txt');

const TEST_LIMIT = 100; // 테스트용 100개

// 디렉토리 생성
const OUTPUT_DIR = path.dirname(OUTPUT_FILE);
const DOWNLOADS_DIR = path.dirname(PROGRESS_FILE);
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeArtworkDetail(page, artworkUrl) {
  try {
    await page.goto(artworkUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    // 메타데이터 추출
    const metadata = await page.evaluate(() => {
      const data = {};
      
      // 원본 링크
      data.originalUrl = window.location.href;
      
      // 제목 - 다양한 선택자 시도
      const titleSelectors = ['h1', '.object-title', '.artwork-title', '[data-testid="title"]', '.title'];
      for (const selector of titleSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim()) {
          data.title = el.textContent.trim();
          break;
        }
      }
      
      // 아티스트 - 다양한 선택자 시도
      const artistSelectors = ['.artist', '.creator', '[data-testid="artist"]', 'a[href*="/artist/"]', '.author'];
      for (const selector of artistSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim()) {
          data.artist = el.textContent.trim();
          break;
        }
      }
      
      // 날짜/연도
      const dateSelectors = ['.date', '.year', '[data-testid="date"]', '.creation-date'];
      for (const selector of dateSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim()) {
          data.date = el.textContent.trim();
          break;
        }
      }
      
      // 매체 (Medium/Technik)
      const mediumSelectors = ['.medium', '.material', '.technique', '[data-testid="medium"]', '.technik'];
      for (const selector of mediumSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim()) {
          data.medium = el.textContent.trim();
          break;
        }
      }
      
      // 크기 (Dimensions/Maße)
      const dimensionSelectors = ['.dimensions', '.size', '.measurements', '[data-testid="dimensions"]', '.maße'];
      for (const selector of dimensionSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim()) {
          data.dimensions = el.textContent.trim();
          break;
        }
      }
      
      // 오브젝트 타입 (Object Type/Kunstgattung/Objektart)
      const objectTypeSelectors = ['.object-type', '.type', '.classification', '.category', '.kunstgattung', '.objektart', '[data-testid="object-type"]'];
      for (const selector of objectTypeSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim()) {
          data.objectType = el.textContent.trim();
          break;
        }
      }
      
      // 설명 (Description)
      const descSelectors = ['.description', '.text', '[data-testid="description"]', '.object-description'];
      for (const selector of descSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim()) {
          data.description = el.textContent.trim();
          break;
        }
      }
      
      // 이미지 URL
      const imgSelectors = [
        'img.artwork-image',
        '.artwork-image img',
        'picture img',
        '.object-image img',
        '[data-testid="artwork-image"]',
        '.main-image img'
      ];
      for (const selector of imgSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          data.imageUrl = el.src || el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || '';
          if (data.imageUrl) break;
        }
      }
      
      // 메타데이터 테이블/리스트에서 추가 정보 추출
      const metadataSections = document.querySelectorAll('.metadata, .object-info, .artwork-info, dl, .details, .info-section');
      metadataSections.forEach(section => {
        const text = section.textContent || '';
        const items = section.querySelectorAll('dt, .label, .metadata-label, strong, .info-label');
        
        items.forEach(item => {
          const label = item.textContent?.trim().toLowerCase() || '';
          const valueEl = item.nextElementSibling || item.parentElement?.querySelector('dd, .value, .info-value');
          const value = valueEl?.textContent?.trim() || '';
          
          if (!value) return;
          
          if ((label.includes('technik') || label.includes('medium') || label.includes('material')) && !data.medium) {
            data.medium = value;
          }
          if ((label.includes('maße') || label.includes('dimensions') || label.includes('size') || label.includes('measurements')) && !data.dimensions) {
            data.dimensions = value;
          }
          if ((label.includes('typ') || label.includes('type') || label.includes('object type') || label.includes('kunstgattung') || label.includes('objektart')) && !data.objectType) {
            data.objectType = value;
          }
          if ((label.includes('kategorie') || label.includes('category') || label.includes('classification')) && !data.objectType) {
            data.objectType = value;
          }
          if ((label.includes('datum') || label.includes('date') || label.includes('jahr') || label.includes('year')) && !data.date) {
            data.date = value;
          }
          if ((label.includes('künstler') || label.includes('artist') || label.includes('creator')) && !data.artist) {
            data.artist = value;
          }
        });
      });
      
      return data;
    });

    return metadata;
  } catch (error) {
    log(`⚠️ 상세 페이지 스크래핑 오류 (${artworkUrl}): ${error.message}`);
    return null;
  }
}

async function collectArtworkLinks(page) {
  const artworkLinks = [];
  const seenIds = new Set();
  let scrollAttempts = 0;
  const MAX_SCROLL_ATTEMPTS = 200;
  
  log('🔍 작품 링크 수집 시작...');
  
  while (artworkLinks.length < TEST_LIMIT && scrollAttempts < MAX_SCROLL_ATTEMPTS) {
    // 현재 페이지의 모든 작품 링크 수집 (필터링 적용)
    const links = await page.evaluate(() => {
      const allLinks = Array.from(document.querySelectorAll('a[href]')).map(a => a.href);
      
      // 작품 링크 필터링: /objects/[숫자]/[슬러그] 형식만, 필터/세션/해시 제외
      const objectLinks = allLinks.filter(href => {
        if (!href || !href.includes('/objects/')) return false;
        if (href.includes('filter') || href.includes('jsessionid') || href.includes('#') || href.includes('?')) {
          // 쿼리 파라미터만 있는 경우는 허용 (ctx, idx 등)
          if (!href.match(/\/objects\/\d+\/[^\/]+(\?[^#]*)?$/)) return false;
        }
        // /objects/[숫자]/[슬러그] 형식 확인
        return /\/objects\/\d+\/[^\/\?#]+/.test(href);
      });
      
      return [...new Set(objectLinks)]; // 중복 제거
    });
    
    // 새로운 링크만 추가
    let newLinks = 0;
    for (const link of links) {
      // URL에서 고유 ID 추출
      const match = link.match(/\/objects\/(\d+)\//);
      const id = match ? match[1] : link;
      
      if (!seenIds.has(id)) {
        seenIds.add(id);
        artworkLinks.push(link);
        newLinks++;
        if (artworkLinks.length >= TEST_LIMIT) break;
      }
    }
    
    log(`스크롤 ${scrollAttempts + 1}: ${newLinks}개 새 링크 발견 (총 ${artworkLinks.length}/${TEST_LIMIT}개)`);
    
    if (artworkLinks.length >= TEST_LIMIT) break;
    
    // 스크롤하여 더 많은 항목 로드
    const scrollHeightBefore = await page.evaluate(() => document.body.scrollHeight);
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    
    await sleep(2000); // 새 항목 로드 대기
    
    const scrollHeightAfter = await page.evaluate(() => document.body.scrollHeight);
    
    // "더 보기" 또는 "Load more" 버튼 확인
    const loadMoreButton = await page.$('button:has-text("Load more"), button:has-text("Mehr laden"), button:has-text("Show more"), .load-more, [data-testid="load-more"], button:has-text("Weitere"), button:has-text("More")');
    if (loadMoreButton) {
      try {
        await loadMoreButton.click();
        await sleep(2000);
      } catch (e) {
        // 버튼 클릭 실패 시 계속
      }
    }
    
    scrollAttempts++;
    
    // 더 이상 새 항목이 로드되지 않으면 종료
    if (newLinks === 0 && scrollHeightBefore === scrollHeightAfter) {
      log('더 이상 새 항목이 로드되지 않음');
      break;
    }
  }
  
  log(`✅ 총 ${artworkLinks.length}개 작품 링크 수집 완료`);
  return artworkLinks.slice(0, TEST_LIMIT);
}

async function main() {
  log('🎨 Belvedere Museum Collection Scraper - Test (100 items)');
  log('='.repeat(60));
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    // 메인 페이지로 이동
    const mainUrl = 'https://sammlung.belvedere.at/objects/images?';
    log(`📄 페이지 로드: ${mainUrl}`);
    await page.goto(mainUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000); // JavaScript 로드 대기
    
    // 작품 링크 수집
    const artworkLinks = await collectArtworkLinks(page);
    
    if (artworkLinks.length === 0) {
      log('❌ 작품 링크를 찾을 수 없습니다');
      return;
    }
    
    log(`\n📊 상세 정보 수집 시작 (${artworkLinks.length}개)...`);
    
    const artworks = [];
    const processedIds = new Set();
    
    for (let i = 0; i < artworkLinks.length; i++) {
      const link = artworkLinks[i];
      
      // 중복 체크
      const match = link.match(/\/objects\/(\d+)\//);
      const id = match ? match[1] : link;
      
      if (processedIds.has(id)) {
        log(`⏭️ 중복 스킵: ${link}`);
        continue;
      }
      processedIds.add(id);
      
      log(`\n[${i + 1}/${artworkLinks.length}] ${link}`);
      
      const metadata = await scrapeArtworkDetail(page, link);
      
      if (metadata && metadata.title) {
        const artwork = {
          id: `belvedere-${id}`,
          name: metadata.title,
          artist: metadata.artist || 'Unknown',
          year: parseInt(metadata.date?.match(/\d{4}/)?.[0]) || 0,
          date: metadata.date || '',
          image: metadata.imageUrl || '',
          sourceUrl: link,
          originalUrl: metadata.originalUrl || link,
          exhibitionName: 'Belvedere Museum',
          exhibitionTitle: 'Belvedere Collection',
          description: metadata.description || '',
          medium: metadata.medium || '',
          dimension: metadata.dimensions || '',
          category: metadata.objectType || '',
          objectType: metadata.objectType || '',
          type: (metadata.objectType?.toLowerCase().includes('painting') || metadata.objectType?.toLowerCase().includes('gemälde') || metadata.objectType?.toLowerCase().includes('malerei')) ? '2D' : '3D'
        };
        
        artworks.push(artwork);
        log(`✅ 수집 완료: ${artwork.name} by ${artwork.artist} | ${artwork.objectType}`);
      } else {
        log(`⚠️ 메타데이터 수집 실패: ${link}`);
      }
      
      // 진행 상황 저장
      if ((i + 1) % 10 === 0) {
        const progress = {
          artworks: artworks,
          processedIds: Array.from(processedIds),
          lastIndex: i + 1,
          totalLinks: artworkLinks.length
        };
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
        log(`💾 진행 상황 저장: ${artworks.length}개 작품 수집됨`);
      }
      
      await sleep(1000); // Rate limiting
    }
    
    // 최종 저장
    const output = {
      museum: 'Belvedere Museum',
      collection: 'Belvedere Collection',
      artworks: artworks,
      total: artworks.length,
      scrapedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    log(`\n✅ 완료! ${artworks.length}개 작품 저장됨: ${OUTPUT_FILE}`);
    
  } catch (error) {
    log(`❌ 오류 발생: ${error.message}`);
    console.error(error);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
