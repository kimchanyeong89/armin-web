/**
 * GAC 메타데이터 추출 디버깅
 */

const { chromium } = require('playwright');

const TEST_URLS = [
  'https://artsandculture.google.com/asset/the-blinding-of-elymas/5QGaO8M6MWdIng',
  'https://artsandculture.google.com/asset/the-virgin-and-child-with-the-infant-st-john-taddei-tondo/PQGwHXQr2dMcaw',
  'https://artsandculture.google.com/asset/self-portrait-of-sir-joshua-reynolds-pra/XgGQYSbJxQ7KMw',
];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function debugMetadata(page, url) {
  console.log('\n' + '='.repeat(80));
  console.log('URL:', url.split('/').pop());
  
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(2000);
  
  const data = await page.evaluate(() => {
    const result = {
      title: document.querySelector('h1')?.textContent?.trim(),
      h2s: [],
      metaFields: [],
      allText: [],
      structuredData: null,
    };
    
    // 모든 h2 분석
    document.querySelectorAll('h2').forEach(h2 => {
      result.h2s.push(h2.textContent.trim());
    });
    
    // 메타데이터 필드 (라벨: 값 형태) 찾기
    const labels = ['Artist', 'Creator', 'Date', 'Medium', 'Dimensions', 'Type', 'Title', 'Culture', 'Period'];
    document.querySelectorAll('*').forEach(el => {
      const text = el.textContent?.trim();
      if (text && text.length < 200) {
        for (const label of labels) {
          if (text.startsWith(label + ':') || text.startsWith(label + ' ')) {
            result.metaFields.push({ label, text: text.slice(0, 150) });
          }
        }
      }
    });
    
    // JSON-LD structured data 찾기
    const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
    ldScripts.forEach(script => {
      try {
        const data = JSON.parse(script.textContent);
        result.structuredData = data;
      } catch (e) {}
    });
    
    // 페이지에서 "details" 섹션 찾기
    const detailsSection = document.querySelector('[data-section="details"]');
    if (detailsSection) {
      result.detailsSection = detailsSection.innerHTML.slice(0, 500);
    }
    
    // aria-label이 있는 요소들
    document.querySelectorAll('[aria-label]').forEach(el => {
      const label = el.getAttribute('aria-label');
      if (label && label.length < 100) {
        result.allText.push({ type: 'aria-label', text: label });
      }
    });
    
    // 페이지 HTML에서 메타데이터 패턴 찾기
    const html = document.body.innerHTML;
    
    // "Creator" 또는 "Artist" 근처 텍스트
    const creatorMatch = html.match(/Creator[^<]*<[^>]*>([^<]+)/i);
    if (creatorMatch) result.creatorMatch = creatorMatch[1];
    
    const artistMatch = html.match(/Artist[^<]*<[^>]*>([^<]+)/i);
    if (artistMatch) result.artistMatch = artistMatch[1];
    
    // Date 근처 텍스트
    const dateMatch = html.match(/Date[^<]*<[^>]*>([^<]+)/i);
    if (dateMatch) result.dateMatch = dateMatch[1];
    
    // Medium/Type 분석 (2D/3D 구분용)
    const mediumMatch = html.match(/Medium[^<]*<[^>]*>([^<]+)/i);
    if (mediumMatch) result.mediumMatch = mediumMatch[1];
    
    const typeMatch = html.match(/Type[^<]*<[^>]*>([^<]+)/i);
    if (typeMatch) result.typeMatch = typeMatch[1];
    
    return result;
  });
  
  console.log('\n📝 제목:', data.title);
  
  console.log('\n📋 H2 태그들:');
  data.h2s.forEach((h2, i) => console.log(`   ${i + 1}. ${h2.slice(0, 80)}`));
  
  if (data.structuredData) {
    console.log('\n🔗 Structured Data (JSON-LD):');
    console.log(JSON.stringify(data.structuredData, null, 2).slice(0, 800));
  }
  
  if (data.creatorMatch) console.log('\n👤 Creator match:', data.creatorMatch);
  if (data.artistMatch) console.log('👤 Artist match:', data.artistMatch);
  if (data.dateMatch) console.log('📅 Date match:', data.dateMatch);
  if (data.mediumMatch) console.log('🎨 Medium match:', data.mediumMatch);
  if (data.typeMatch) console.log('📦 Type match:', data.typeMatch);
  
  if (data.metaFields.length > 0) {
    console.log('\n📊 메타 필드:');
    data.metaFields.slice(0, 10).forEach(f => console.log(`   ${f.label}: ${f.text}`));
  }
  
  return data;
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  });
  const page = await context.newPage();
  
  console.log('⏳ CAPTCHA 처리...');
  await page.goto('https://artsandculture.google.com/', { waitUntil: 'domcontentloaded' });
  await delay(3000);
  
  console.log('🔐 CAPTCHA 통과 후 Enter...');
  await new Promise(resolve => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.setRawMode(false);
      resolve();
    });
  });
  
  for (const url of TEST_URLS) {
    await debugMetadata(page, url);
  }
  
  console.log('\n\n종료하려면 Ctrl+C...');
  await new Promise(() => {});
}

main().catch(console.error);
