/**
 * Google Arts & Culture 컬렉션 스크래핑 표준 스크립트
 * 
 * 사용법:
 * 1. galleries 배열에 스크래핑할 갤러리 정보 추가
 *    - id: JSON 파일명 (예: 'the-british-museum' → the-british-museum-collection.json)
 *    - name: 갤러리 표시 이름
 *    - slug: Google Arts 파트너 슬러그 (파트너 페이지 로고/설명 추출용)
 *    - url: Google Arts 컬렉션 페이지 URL
 * 2. node scripts/scrape-gac-collection.cjs 실행
 * 3. CAPTCHA 통과 후 Enter
 * 
 * 출력:
 * - public/data/{id}-collection.json (작품 데이터)
 * - downloads/{id}-scrape-log.json (스크래핑 로그)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const LOG_DIR = path.join(__dirname, '../downloads');
const CONCURRENCY = 20;
const RETRY_CONCURRENCY = 10;

const galleries = [
  {
    id: 'palais-de-tokyo',
    name: 'Palais de Tokyo',
    slug: 'palais-de-tokyo',
    url: 'https://artsandculture.google.com/explore/collections/palais-de-tokyo?c=assets',
    maxItems: 3000,
    excludePatterns: [
      /gallery view/i,
      /installation view/i,
      /exhibition view/i,
      /building exterior/i,
    ]
  }
];

// Courtauld 로고 패턴 (512x85, "The Courtauld Institute of Art")
const KNOWN_PLACEHOLDER_PATTERNS = [
  'DLb1gvdDgexOPYIumi9zCzxuRllsQru7I1aoYyY5xa-y2U6fpA',
  '7y8KlMlzIwEXg-zXCfwNl8WPURfq-InuWfQ0jaV2OsSOUsF-sg',
  'cqa1X0rOSdNhmlQ4yciTvNATGmvmPEBYitI_jtzbJOciOxN5Qg',
  'SazWu4at91Iynpl3861lF1TamkUhlOkvlRU3hFteiiETggZWXv',
];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// 제목 정리 (스크래핑용 - 간단한 버전)
function cleanTitle(title) {
  if (!title) return title;
  return title
    .replace(/\s*\(pl\.?\s*\[?\d+\]?\)\s*\(\d{4}\)\s*$/i, '')
    .replace(/\s*\(pl\.?\s*\[?\d+\]?\)\s*$/i, '')
    .replace(/,\s*pl\.?\s*\[?\d+\]?\s*\(\d{4}\)\s*$/i, '')
    .replace(/,\s*pl\.?\s*\[?\d+\]?\s*$/i, '')
    .replace(/\s*\[Pl\.\s*\d+\]\.?\s*\(\d{4}\)\s*$/i, '')
    .replace(/\s*\[Pl\.\s*\d+\]\s*$/i, '')
    .replace(/,?\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)?\s*\d{4}\.?\s*\(\d{4}\)\s*$/i, '')
    .replace(/\s*\(\d{4}(?:\s*[-–]\s*\d{2,4})?\)\s*$/, '')
    .replace(/\s*,\s*\d{4}(?:\s*[-–]\s*\d{2,4})?\s*$/, '')
    .replace(/\s+\d{4}(?:\s*[-–]\s*\d{2,4})?\s*$/, '')
    .replace(/\s*\(\s*c\.\s*\d{4}(?:\s*[-–]\s*\d{2,4})?\)\s*$/, '')
    .replace(/,?\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\.?\s*$/i, '')
    .replace(/\s*\(maker\s+unknown\)\s*/gi, ' ')
    .replace(/[,\.]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 작가 이름 정리 (정교한 버전) - 시대/지역/왕조 정보를 Unknown으로 처리
function cleanArtist(artist) {
  if (!artist || artist === 'Unknown') return 'Unknown';
  
  const trimmed = artist.trim();
  
  // 1. 전체가 시대/세기 정보만 있는 경우 → Unknown
  // "Late 15th or", "Late 14th or early 15th century ()", "10th or 11th century"
  const centuryOnlyPatterns = [
    /^(?:late|early|mid|c\.?)?\s*\d{1,2}(?:st|nd|rd|th)?\s*(?:or|[-–\/])?\s*(?:early|late|mid)?\s*\d{0,2}(?:st|nd|rd|th)?\s*century/i,
    /^(?:late|early|mid)?\s*\d{1,2}(?:st|nd|rd|th)?\s+or\s*$/i,  // "Late 15th or" (잘림)
  ];
  for (const pattern of centuryOnlyPatterns) {
    if (pattern.test(trimmed)) return 'Unknown';
  }
  
  // 2. 왕조 이름 → Unknown
  // "Chinese Yuan Dynasty (1279 - 1368)", "Ming Dynasty", "Tang Dynasty"
  const dynastyPatterns = [
    /dynasty/i,
    /^(?:chinese|japanese|korean|persian|mughal|ottoman|byzantine|roman|egyptian|greek)\s+/i,
    /^(?:yuan|ming|qing|song|tang|han|zhou|sui|jin|liao|shang)\s+(?:dynasty|period)?/i,
  ];
  for (const pattern of dynastyPatterns) {
    if (pattern.test(trimmed)) return 'Unknown';
  }
  
  // 3. 지역+세기 패턴 → Unknown
  // "Iran, 10th or 11th century (900 - 1099)", "Near Eastern (?) 17th century"
  const regionCenturyPatterns = [
    /^[A-Z][a-z]+(?:ern|ese|ian|ic)?\s*,?\s*\(?[\?\d]/i,  // "Iran, 10th" / "Near Eastern (?)"
    /^(?:near|middle|far)\s+eastern/i,
    /^(?:north|south|east|west|central)\s+(?:african|asian|european|american)/i,
  ];
  for (const pattern of regionCenturyPatterns) {
    if (pattern.test(trimmed)) return 'Unknown';
  }
  
  // 4. 월 단독 패턴 → Unknown
  const monthOnlyPattern = /^(?:\d{1,2}(?:st|nd|rd|th)?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{1,2}(?:st|nd|rd|th)?)?$/i;
  if (monthOnlyPattern.test(trimmed)) return 'Unknown';
  
  // 5. 기타 Unknown 패턴
  if (/^from\s+the\s+/i.test(trimmed)) return 'Unknown';
  if (/\(maker\s+unknown\)/i.test(artist)) return 'Unknown';
  if (/^After\s+unidentified/i.test(trimmed)) return 'Unknown';
  if (/^Additional\s+Items$/i.test(trimmed)) return 'Unknown';
  if (/^(?:unknown|anonymous|unidentified|unattributed)$/i.test(trimmed)) return 'Unknown';
  
  // 6. 정리 후 반환
  let cleaned = artist
    .replace(/(\w)\d{1,2}(?:st|nd|rd|th)?-century.*$/i, '$1')
    .replace(/\s*\d{1,2}(?:st|nd|rd|th)?-century\s+(?:plaster|bronze|marble)\s+cast.*$/i, '')
    .replace(/,?\s*made\s+from\s+.*$/i, '')
    .replace(/^Design\s+by\s+/i, '')
    .replace(/^Designed\s+by\s+/i, '')
    .replace(/^Photographed\s+by\s+/i, '')
    .replace(/^Published\s+by\s+/i, '')
    .replace(/^Original\s+attributed\s+to\s+/i, '')
    .replace(/\s*\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s*$/i, '')
    .replace(/\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?\s*$/i, '')
    .replace(/\s*\(\d{4}\s*[-–]\s*\d{4}\)\s*$/g, '')  // (1279 - 1368) 제거
    .replace(/\s*\(\s*\)\s*$/g, '')  // 빈 괄호 제거 "()"
    .replace(/\s*\(\s*\?\s*\)\s*/g, ' ')  // "(?) " 제거
    .replace(/\d{4}(?:\s*[-–;\/,]\s*\d{2,4})*\s*$/g, '')
    .replace(/c(?:a)?\.?\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)?\s*$/i, '')
    .replace(/c\.\s*\d{4}(?:\s*[-–]\s*\d{2,4})?\s*$/i, '')
    .replace(/c\.\s*$/i, '')
    .replace(/^\s*\d{4}(?:\s*[-–;\/,]\s*\d{2,4})*\s*/, '')
    .replace(/\s*(?:late|early|mid)?\s*\d{1,2}(?:st|nd|rd|th)\s+century(?:\/early\s+\d{1,2}(?:st|nd|rd|th)\s+century)?\s*$/i, '')
    .replace(/\s*\(or\s+later\)\)?$/i, '')  // "(or later))" 제거
    .replace(/\s+/g, ' ')
    .replace(/[;\/,\?\.]\s*$/, '')
    .replace(/^\s*[;\/,]\s*/, '')
    .trim();
  
  // 정리 후에도 세기/왕조 패턴이면 Unknown
  if (/^\d{1,2}(?:st|nd|rd|th)\s+century/i.test(cleaned)) return 'Unknown';
  if (/^(?:late|early|mid)\s*$/i.test(cleaned)) return 'Unknown';  // "Late" 만 남은 경우
  if (cleaned.length < 2) return 'Unknown';
  
  return cleaned || 'Unknown';
}

function minimizeChrome() {
  exec(`osascript -e 'tell application "System Events" to set visible of process "Chromium" to false'`);
}

// 파트너 페이지에서 로고 이미지와 설명 추출
async function extractPartnerInfo(page, gallery) {
  console.log(`\n🏛️  ${gallery.name}: 파트너 페이지에서 로고/설명 추출...`);
  
  // 파트너 페이지 URL 생성 (slug 기반)
  const partnerUrl = `https://artsandculture.google.com/partner/${gallery.slug}`;
  
  try {
    await page.goto(partnerUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(3000);
    
    const html = await page.evaluate(() => document.documentElement.innerHTML);
    
    // 로고 이미지 추출 (첫 번째 이미지가 보통 로고)
    const urls = html.match(/https:\/\/lh3\.googleusercontent\.com\/ci\/[A-Za-z0-9_-]+/g) || [];
    const uniqueUrls = [...new Set(urls)];
    const logoImage = uniqueUrls.length > 0 ? uniqueUrls[0] + '=w1200' : null;
    
    // 설명 추출 (첫 번째 적당한 길이의 문단)
    const description = await page.evaluate(() => {
      const paragraphs = document.querySelectorAll('p');
      for (const p of paragraphs) {
        const text = p.textContent.trim();
        // 50자 이상 500자 이하의 첫 번째 문단
        if (text.length > 50 && text.length < 500) {
          return text;
        }
      }
      return null;
    });
    
    if (logoImage) {
      console.log(`   ✅ 로고 이미지 발견`);
    } else {
      console.log(`   ⚠️  로고 이미지 없음`);
    }
    
    if (description) {
      console.log(`   ✅ 설명 추출 완료 (${description.length}자)`);
    } else {
      console.log(`   ⚠️  설명 없음`);
    }
    
    return { logoImage, description };
  } catch (e) {
    console.log(`   ❌ 파트너 페이지 접근 실패: ${e.message}`);
    return { logoImage: null, description: null };
  }
}

// 링크 수집
async function collectLinks(page, gallery) {
  console.log(`\n🔗 ${gallery.name}: 링크 수집 중...`);
  
  await page.goto(gallery.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await delay(3000);
  
  let links = new Set();
  let lastCount = 0;
  let stall = 0;
  const maxStall = 5;  // 빠른 스크래핑 - 5번 연속 변화 없으면 종료
  
  while (links.size < gallery.maxItems && stall < maxStall) {
    const newLinks = await page.$$eval('a[href*="/asset/"]', els => 
      els.map(el => el.href).filter(h => h.includes('/asset/'))
    );
    newLinks.forEach(l => links.add(l));
    
    process.stdout.write(`\r  수집: ${links.size}개 (stall: ${stall}/${maxStall})`);
    
    if (links.size === lastCount) stall++;
    else { stall = 0; lastCount = links.size; }
    
    await page.evaluate(() => window.scrollBy(0, 3000));  // 더 큰 스크롤
    await delay(500);  // 더 긴 대기
  }
  
  console.log(`\n✅ ${links.size}개 링크 수집 완료`);
  return Array.from(links);
}

// 이미지가 placeholder인지 확인
function isPlaceholderImage(imageUrl) {
  if (!imageUrl) return true;
  const baseUrl = imageUrl.replace(/=w\d+$/, '');
  for (const pattern of KNOWN_PLACEHOLDER_PATTERNS) {
    if (baseUrl.includes(pattern)) return true;
  }
  return false;
}

// 작품 상세 정보 스크래핑
async function scrapeArtwork(context, url, index, gallery, waitForRealImage = false, timeout = 15000) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    
    if (waitForRealImage) {
      await delay(4000);
      try {
        await page.waitForSelector('img[src*="lh3.googleusercontent.com"]', { timeout: 8000 });
        await delay(2000);
      } catch (e) {}
    } else {
      // 이미지가 로드될 때까지 충분히 대기
      await delay(2000);
      try {
        await page.waitForSelector('img[src*="lh3.googleusercontent.com"]', { timeout: 5000 });
      } catch (e) {}
    }
    
    const data = await page.evaluate((galleryName) => {
      const title = document.querySelector('h1')?.textContent?.trim();
      if (!title) return { error: 'no_title' };
      
      let artist = 'Unknown', year = null, medium = null, artworkType = null;
      
      // 1. JSON-LD structured data에서 추출 (가장 정확)
      const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of ldScripts) {
        try {
          const jsonData = JSON.parse(script.textContent);
          const items = Array.isArray(jsonData) ? jsonData : [jsonData];
          for (const item of items) {
            if (item['@type'] === 'CreativeWork' || item['@type'] === 'VisualArtwork') {
              if (item.author && artist === 'Unknown') {
                artist = item.author;
              }
              if (item.creator && artist === 'Unknown') {
                artist = typeof item.creator === 'string' ? item.creator : item.creator.name;
              }
              if (item.dateCreated && !year) {
                const m = item.dateCreated.match(/(\d{4})/);
                if (m) year = m[1];
              }
            }
          }
        } catch (e) {}
      }
      
      // 2. 메타 필드에서 추출 (Creator, Date Created, Type, Medium)
      const html = document.documentElement.innerHTML;
      
      if (artist === 'Unknown') {
        const creatorMatch = html.match(/Creator[:\s]*<[^>]*>([^<]+)/i);
        if (creatorMatch && creatorMatch[1].trim()) {
          artist = creatorMatch[1].trim();
        }
      }
      
      if (!year) {
        const dateMatch = html.match(/Date Created[:\s]*<[^>]*>([^<]+)/i);
        if (dateMatch && dateMatch[1].trim()) {
          const yearMatch = dateMatch[1].match(/(\d{4})/);
          if (yearMatch) year = yearMatch[1];
        }
      }
      
      const typeMatch = html.match(/Type[:\s]*<[^>]*>([^<]+)/i);
      if (typeMatch && typeMatch[1].trim()) {
        artworkType = typeMatch[1].trim();
      }
      
      const mediumMatch = html.match(/Medium[:\s]*<[^>]*>([^<]+)/i);
      if (mediumMatch && mediumMatch[1].trim()) {
        medium = mediumMatch[1].trim();
      }
      
      // 3. H2 태그에서 fallback 추출
      if (artist === 'Unknown' || !year) {
        const h2s = document.querySelectorAll('h2');
        for (const h2 of h2s) {
          const text = h2.textContent.trim();
          if (text.includes('Get the app') || text.length > 150) continue;
          if (text.toLowerCase().includes(galleryName.toLowerCase())) continue;
          
          const monthOnlyPattern = /^(?:\d{1,2}(?:st|nd|rd|th)?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{1,2}(?:st|nd|rd|th)?)?$/i;
          if (monthOnlyPattern.test(text)) continue;
          
          if (/^\d{1,2}(?:st|nd|rd|th)?[\s-]+century/i.test(text)) continue;
          if (/^(?:plaster|bronze|marble)\s+cast/i.test(text)) continue;
          
          // 왕조/세기/지역 패턴 스킵
          if (/dynasty/i.test(text)) continue;
          if (/^(?:late|early|mid)?\s*\d{1,2}(?:st|nd|rd|th)?\s*(?:or|[-–])?\s*(?:early|late|mid)?\s*\d{0,2}(?:st|nd|rd|th)?\s*century/i.test(text)) continue;
          if (/^(?:chinese|japanese|korean|persian|iranian|near\s+eastern|byzantine)/i.test(text)) continue;
          
          if (!year) {
            // 연도 범위 (1279 - 1368) 같은 경우는 무시 (왕조 범위일 가능성)
            const rangeMatch = text.match(/\((\d{4})\s*[-–]\s*(\d{4})\)/);
            if (rangeMatch) {
              const startYear = parseInt(rangeMatch[1]);
              const endYear = parseInt(rangeMatch[2]);
              // 범위가 50년 이상이면 왕조/시대 범위로 간주하고 무시
              if (endYear - startYear > 50) {
                // 연도 추출하지 않음
              } else {
                year = rangeMatch[1];
              }
            } else {
              // 단일 연도 추출
              const yearMatch = text.match(/(\d{4})(?!\s*[-–]\s*\d{4})/);
              if (yearMatch) year = yearMatch[1];
            }
          }
          
          if (artist === 'Unknown') {
            const possibleArtist = text.replace(/\s*\d{4}(?:\s*[-–;,]\s*\d{4})*\s*/g, '').trim();
            if (possibleArtist && possibleArtist.length > 2) {
              artist = possibleArtist;
            }
          }
          
          if (artist && artist !== 'Unknown') break;
        }
      }
      
      // 4. 아티스트 이름 정리
      if (artist && artist !== 'Unknown') {
        artist = artist
          .replace(/\s+/g, ' ')
          .replace(/[;,]\s*$/, '')
          .trim();
      }
      
      // 5. 2D/3D 판단
      let is3D = false;
      const type3DKeywords = ['sculpture', 'statue', 'bust', 'relief', 'cast', 'bronze', 'marble', 'ceramic', 'porcelain', 'terracotta', 'plaster', 'installation', 'object', 'vessel', 'vase', 'figure', 'figurine', 'model'];
      const medium3DKeywords = ['bronze', 'marble', 'stone', 'wood', 'clay', 'ceramic', 'plaster', 'terracotta', 'metal', 'glass', 'porcelain', 'wax'];
      
      if (artworkType) {
        const typeLower = artworkType.toLowerCase();
        is3D = type3DKeywords.some(k => typeLower.includes(k));
      }
      if (!is3D && medium) {
        const mediumLower = medium.toLowerCase();
        is3D = medium3DKeywords.some(k => mediumLower.includes(k));
      }
      if (!is3D && title) {
        const titleLower = title.toLowerCase();
        is3D = ['cast of', 'bust of', 'statue', 'sculpture', 'relief', 'tondo', 'figure of'].some(k => titleLower.includes(k));
      }
      
      let urls = html.match(/https:\/\/lh3\.googleusercontent\.com\/ci\/[A-Za-z0-9_-]+/g) || [];
      const uniqueUrls = [...new Set(urls)];
      
      const placeholderPatterns = [
        // Courtauld 로고 (512x85, "The Courtauld Institute of Art")
        'DLb1gvdDgexOPYIumi9zCzxuRllsQru7I1aoYyY5xa-y2U6fpA',
        '7y8KlMlzIwEXg-zXCfwNl8WPURfq-InuWfQ0jaV2OsSOUsF-sg',
        'cqa1X0rOSdNhmlQ4yciTvNATGmvmPEBYitI_jtzbJOciOxN5Qg',
        'SazWu4at91Iynpl3861lF1TamkUhlOkvlRU3hFteiiETggZWXv',
      ];
      
      const realUrls = uniqueUrls.filter(url => 
        !placeholderPatterns.some(p => url.includes(p))
      );
      
      // 첫 번째 실제 이미지 URL 선택 (작품 이미지가 먼저 나옴)
      const image = realUrls.length > 0 
        ? realUrls[0] + '=w800'
        : null;
      
      // YouTube 영상 감지
      let youtubeId = null;
      const youtubeIframes = document.querySelectorAll('iframe[src*="youtube.com/embed"]');
      if (youtubeIframes.length > 0) {
        const src = youtubeIframes[0].src;
        const match = src.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
        if (match) youtubeId = match[1];
      }
      if (!youtubeId) {
        const ytMatch = html.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
        if (ytMatch) youtubeId = ytMatch[1];
      }
      
      return { title, artist, year, image, youtubeId, medium, artworkType, is3D };
    }, gallery.name);
    
    await page.close();
    
    if (data.error === 'no_title') {
      return { status: 'failed', reason: 'no_title', url, index };
    }
    
    // YouTube 영상인 경우 - 이미지 없어도 성공!
    if (data.youtubeId) {
      const artwork = {
        id: `${gallery.id}-gac-${index + 1}`,
        title: cleanTitle(data.title),
        artist: cleanArtist(data.artist),
        year: data.year ? parseInt(data.year) : null,
        image: data.image || `https://img.youtube.com/vi/${data.youtubeId}/maxresdefault.jpg`,
        youtubeId: data.youtubeId,
        mediaType: 'video',
        sourceUrl: url
      };
      
      if (data.medium) artwork.medium = data.medium;
      if (data.artworkType) artwork.artworkType = data.artworkType;
      if (data.is3D) artwork.is3D = true;
      
      console.log(`\n   🎬 영상 발견: ${artwork.title} (${data.youtubeId})`);
      
      return {
        status: 'success',
        data: artwork,
        isVideo: true
      };
    }
    
    if (!data.image) {
      console.log(`\n   ❌ no_image: ${data.title}`);
      return { status: 'failed', reason: 'no_image', url, index, title: data.title };
    }
    
    // 제외 패턴 체크
    for (const pattern of gallery.excludePatterns) {
      if (pattern.test(data.title)) {
        return { 
          status: 'excluded', 
          reason: pattern.toString(), 
          url, 
          index, 
          title: data.title 
        };
      }
    }
    
    // Placeholder 체크 - 실패로 처리!
    if (isPlaceholderImage(data.image)) {
      return {
        status: 'failed',
        reason: 'placeholder',
        url,
        index,
        title: data.title,
        image: data.image
      };
    }
    
    // 성공 (일반 이미지)
    const artwork = {
      id: `${gallery.id}-gac-${index + 1}`,
      title: cleanTitle(data.title),
      artist: cleanArtist(data.artist),
      year: data.year ? parseInt(data.year) : null,
      image: data.image,
      sourceUrl: url
    };
    
    if (data.medium) artwork.medium = data.medium;
    if (data.artworkType) artwork.artworkType = data.artworkType;
    if (data.is3D) artwork.is3D = true;
    
    return {
      status: 'success',
      data: artwork,
      isVideo: false
    };
  } catch (e) {
    await page.close();
    return { status: 'failed', reason: 'error', error: e.message, url, index };
  }
}

// 1차 병렬 스크래핑
async function scrapeAllArtworks(context, links, gallery) {
  console.log(`\n🚀 ${gallery.name}: ${links.length}개 1차 스크래핑 (${CONCURRENCY}개 병렬)...`);
  
  const results = { success: [], excluded: [], failed: [], videos: [] };
  const startTime = Date.now();
  
  const hideInterval = setInterval(minimizeChrome, 500);
  
  for (let i = 0; i < links.length; i += CONCURRENCY) {
    minimizeChrome();
    const chunk = links.slice(i, i + CONCURRENCY);
    
    const promises = chunk.map((url, j) => 
      scrapeArtwork(context, url, i + j, gallery)
    );
    
    const chunkResults = await Promise.all(promises);
    
    for (const r of chunkResults) {
      if (r.status === 'success') {
        results.success.push(r.data);
        if (r.isVideo) {
          results.videos.push(r.data);
          console.log(`\n   🎬 영상 발견: ${r.data.title} (${r.data.youtubeId})`);
        }
      } else if (r.status === 'excluded') {
        results.excluded.push(r);
      } else {
        results.failed.push(r);
      }
    }
    
    const progress = Math.min(i + CONCURRENCY, links.length);
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = Math.round(progress / elapsed * 60);
    process.stdout.write(`\r  진행: ${progress}/${links.length} | 성공: ${results.success.length} (영상: ${results.videos.length}) | 제외: ${results.excluded.length} | 실패: ${results.failed.length} | ${rate}개/분`);
  }
  
  clearInterval(hideInterval);
  console.log();
  
  return results;
}

// 실패 항목 재시도 (10개 병렬, 최대 3회, 이미지 대기 모드)
async function retryFailed(context, failed, gallery) {
  if (failed.length === 0) return { recovered: [], stillFailed: [], videos: [] };
  
  console.log(`\n🔄 ${failed.length}개 실패 항목 재시도 (${RETRY_CONCURRENCY}개 병렬, 이미지 대기 모드, 최대 3회)...`);
  
  const recovered = [];
  const stillFailed = [];
  const videos = [];
  
  async function retryOne(item) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await scrapeArtwork(context, item.url, item.index, gallery, true, 15000);
      
      if (result.status === 'success') {
        return { success: true, data: result.data, isVideo: result.isVideo };
      }
      
      if (attempt < 3) await delay(2000);
    }
    return { success: false, item: { ...item, attempts: 3 } };
  }
  
  for (let i = 0; i < failed.length; i += RETRY_CONCURRENCY) {
    minimizeChrome();
    const chunk = failed.slice(i, i + RETRY_CONCURRENCY);
    
    const results = await Promise.all(chunk.map(item => retryOne(item)));
    
    for (const r of results) {
      if (r.success) {
        recovered.push(r.data);
        if (r.isVideo) {
          videos.push(r.data);
          console.log(`   🎬 영상 복구: ${r.data.title} (${r.data.youtubeId})`);
        }
      } else {
        stillFailed.push(r.item);
      }
    }
    
    const progress = Math.min(i + RETRY_CONCURRENCY, failed.length);
    process.stdout.write(`\r  진행: ${progress}/${failed.length} | 복구: ${recovered.length} (영상: ${videos.length}) | 실패: ${stillFailed.length}`);
  }
  
  console.log(`\n   ✅ 복구: ${recovered.length}개 (영상: ${videos.length}개), 최종 실패: ${stillFailed.length}개`);
  return { recovered, stillFailed, videos };
}

// 중복 이미지 감지 (placeholder 추가 검출)
function detectDuplicateImages(results) {
  const imageCounts = {};
  results.forEach(r => {
    const baseUrl = r.image.replace(/=w\d+$/, '');
    imageCounts[baseUrl] = (imageCounts[baseUrl] || 0) + 1;
  });
  
  const duplicates = [];
  for (const [url, count] of Object.entries(imageCounts)) {
    if (count >= 3) {
      duplicates.push({ url, count });
    }
  }
  
  return duplicates;
}

// 중복 이미지를 가진 작품들 분리
function separateDuplicates(results, duplicateUrls) {
  const clean = [];
  const needRetry = [];
  
  const dupSet = new Set(duplicateUrls);
  
  for (const r of results) {
    const baseUrl = r.image.replace(/=w\d+$/, '');
    if (dupSet.has(baseUrl)) {
      needRetry.push({
        url: r.sourceUrl,
        index: parseInt(r.id.split('-').pop()) - 1,
        title: r.title,
        reason: 'duplicate_image'
      });
    } else {
      clean.push(r);
    }
  }
  
  return { clean, needRetry };
}

// 대표 이미지 추출
async function getGalleryCoverImage(page, gallery) {
  console.log(`\n🖼️  대표 이미지 추출...`);
  
  await page.goto(gallery.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await delay(2000);
  
  const coverImage = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    for (const img of imgs) {
      const src = img.src || '';
      if (src.includes('lh3.googleusercontent.com') && img.width > 200) {
        const base = src.split('=')[0];
        return base + '=w1200';
      }
    }
    return null;
  });
  
  if (coverImage) console.log(`   ✅ 대표 이미지 발견`);
  return coverImage;
}

// 결과 저장
function saveResults(gallery, results, coverImage, excluded, finalFailed, videos, partnerInfo = {}) {
  const outputPath = path.join(OUTPUT_DIR, `${gallery.id}-collection.json`);
  
  const output = {
    galleryId: gallery.id,
    galleryName: gallery.name,
    coverImage: partnerInfo.logoImage || coverImage,  // 파트너 로고 우선
    partnerDescription: partnerInfo.description || null,  // 파트너 페이지 설명
    scrapedAt: new Date().toISOString(),
    totalObjects: results.length,
    videoCount: videos.length,
    excludedCount: excluded.length,
    failedCount: finalFailed.length,
    objects: results
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`💾 ${outputPath} 저장 완료 (${results.length}개 작품, ${videos.length}개 영상)`);
  
  const logPath = path.join(LOG_DIR, `${gallery.id}-scrape-log.json`);
  const logData = {
    scrapedAt: new Date().toISOString(),
    gallery: gallery.name,
    summary: {
      total: results.length + excluded.length + finalFailed.length,
      success: results.length,
      videos: videos.length,
      excluded: excluded.length,
      failed: finalFailed.length
    },
    videos: videos.map(v => ({
      title: v.title,
      youtubeId: v.youtubeId,
      url: v.sourceUrl
    })),
    excluded: excluded.map(e => ({
      title: e.title,
      reason: e.reason,
      url: e.url
    })),
    failed: finalFailed.map(f => ({
      title: f.title,
      reason: f.reason,
      url: f.url,
      attempts: f.attempts
    }))
  };
  
  fs.writeFileSync(logPath, JSON.stringify(logData, null, 2));
  console.log(`📋 ${logPath} 로그 저장 완료`);
}

// 보고서 출력
function printReport(gallery, results, excluded, failed, videos) {
  const uniqueImages = new Set(results.map(r => r.image)).size;
  const withYear = results.filter(r => r.year).length;
  const unknownArtist = results.filter(r => r.artist === 'Unknown').length;
  const count3D = results.filter(r => r.is3D).length;
  const withMedium = results.filter(r => r.medium).length;
  const withType = results.filter(r => r.artworkType).length;
  
  console.log(`\n📊 ${gallery.name} 최종 보고서:`);
  console.log(`   - 총 작품: ${results.length}개`);
  console.log(`   - 🎬 영상: ${videos.length}개`);
  console.log(`   - 🖼️  이미지: ${results.length - videos.length}개`);
  console.log(`   - 고유 이미지: ${uniqueImages}개`);
  console.log(`   - 연도 정보: ${withYear}개 (${(withYear/results.length*100).toFixed(1)}%)`);
  console.log(`   - Unknown 아티스트: ${unknownArtist}개`);
  console.log(`   - 🎨 Medium 정보: ${withMedium}개 (${(withMedium/results.length*100).toFixed(1)}%)`);
  console.log(`   - 📦 Type 정보: ${withType}개 (${(withType/results.length*100).toFixed(1)}%)`);
  console.log(`   - 🗿 3D 작품: ${count3D}개`);
  console.log(`   - 제외됨: ${excluded.length}개 (필터링 패턴)`);
  console.log(`   - 최종 실패: ${failed.length}개`);
  
  if (count3D > 0) {
    console.log(`\n🗿 3D 작품 목록:`);
    results.filter(r => r.is3D).slice(0, 10).forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.title} (${r.artworkType || r.medium || 'unknown type'})`);
    });
    if (count3D > 10) console.log(`   ... 외 ${count3D - 10}개`);
  }
  
  if (videos.length > 0) {
    console.log(`\n🎬 영상 목록:`);
    videos.forEach((v, i) => {
      console.log(`   ${i + 1}. ${v.title} (${v.youtubeId})`);
    });
  }
}

// 단일 갤러리 처리 (ra-test와 동일한 흐름)
async function processGallery(context, mainPage, gallery) {
  console.log('\n' + '='.repeat(60));
  console.log(`🎨 ${gallery.name} 스크래핑`);
  console.log('='.repeat(60));
  
  const startTime = Date.now();
  
  // 0. 파트너 페이지에서 로고/설명 추출
  const partnerInfo = await extractPartnerInfo(mainPage, gallery);
  
  // 1. 링크 수집
  const links = await collectLinks(mainPage, gallery);
  
  // 2. 대표 이미지 추출 (파트너 로고가 없을 경우 fallback)
  const coverImage = await getGalleryCoverImage(mainPage, gallery);
  
  // 3. 1차 병렬 스크래핑
  const firstPass = await scrapeAllArtworks(context, links, gallery);
  
  // 4. 실패 항목 재시도 (placeholder 포함)
  const { recovered, stillFailed, videos: recoveredVideos } = await retryFailed(context, firstPass.failed, gallery);
  
  // 5. 모든 성공 결과 합치기
  let allSuccess = [...firstPass.success, ...recovered];
  let allVideos = [...firstPass.videos, ...recoveredVideos];
  
  // 6. 중복 이미지 감지 (추가 placeholder 검출)
  let finalFailed = [...stillFailed];
  
  for (let round = 1; round <= 2; round++) {
    const duplicates = detectDuplicateImages(allSuccess);
    
    if (duplicates.length === 0) {
      console.log(`✅ 중복 이미지 없음 - 모든 이미지 정상`);
      break;
    }
    
    console.log(`\n⚠️  ${duplicates.length}개 중복 이미지 감지 (라운드 ${round}/2)`);
    duplicates.forEach(d => {
      console.log(`   - ${d.count}회 중복: ...${d.url.slice(-50)}`);
    });
    
    const { clean, needRetry } = separateDuplicates(allSuccess, duplicates.map(d => d.url));
    
    if (needRetry.length === 0) break;
    
    console.log(`   ${needRetry.length}개 작품 재시도 필요`);
    
    const { recovered: rec, stillFailed: sf, videos: recVideos } = await retryFailed(context, needRetry, gallery);
    
    allSuccess = [...clean, ...rec];
    allVideos = [...allVideos.filter(v => !needRetry.some(n => n.title === v.title)), ...recVideos];
    finalFailed = [...finalFailed, ...sf];
  }
  
  // 7. 저장 (partnerInfo 포함)
  saveResults(gallery, allSuccess, coverImage, firstPass.excluded, finalFailed, allVideos, partnerInfo);
  
  // 8. 보고서
  printReport(gallery, allSuccess, firstPass.excluded, finalFailed, allVideos);
  
  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\n⏱️  소요 시간: ${Math.round(elapsed / 60)}분 ${Math.round(elapsed % 60)}초`);
  
  return { success: allSuccess.length, failed: finalFailed.length };
}

async function main() {
  console.log('='.repeat(60));
  console.log('🎨 Courtauld & Serpentine 영구전시 구축');
  console.log('   - 1회 CAPTCHA로 2개 갤러리 처리');
  console.log('   - ra-test와 동일한 구조');
  console.log('='.repeat(60));
  
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--window-position=100,100',
      '--window-size=900,700'
    ]
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 900, height: 700 }
  });
  
  const mainPage = await context.newPage();
  
  // CAPTCHA 처리 대기
  console.log('\n⏳ CAPTCHA 페이지 로딩 중...');
  await mainPage.goto('https://artsandculture.google.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await delay(3000);
  
  console.log('\n' + '⚠️'.repeat(20));
  console.log('🔐 CAPTCHA가 나타나면 브라우저에서 직접 통과해주세요.');
  console.log('   완료되면 여기에서 Enter를 눌러주세요...');
  console.log('⚠️'.repeat(20));
  
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  await new Promise(resolve => {
    rl.question('', () => {
      rl.close();
      resolve();
    });
  });
  
  console.log('\n✅ 확인! 스크래핑 시작합니다...');
  minimizeChrome();
  
  const totalStartTime = Date.now();
  
  // 각 갤러리 순차 처리
  for (const gallery of galleries) {
    await processGallery(context, mainPage, gallery);
  }
  
  await browser.close();
  
  const totalElapsed = (Date.now() - totalStartTime) / 1000;
  console.log(`\n⏱️  전체 소요 시간: ${Math.round(totalElapsed / 60)}분 ${Math.round(totalElapsed % 60)}초`);
  
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
