/**
 * MAM Paris - Debug selector finding
 * URL: https://www.mam.paris.fr/en/online-collections#/artworks/checkbox:withimage/Avec%20image/tree_domain_all/Peinture
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.mam.paris.fr/en/online-collections#/artworks/checkbox:withimage/Avec%20image/tree_domain_all/Peinture?page=1&sort=random&layout=box';

async function debug() {
  console.log('🔍 MAM Paris - Debug Selector Finding\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  try {
    console.log('📡 페이지 로드 중...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(5000);
    
    // Save HTML for debugging
    const html = await page.content();
    fs.writeFileSync(path.join(__dirname, '../downloads/mam-debug.html'), html);
    console.log('📄 HTML 저장: downloads/mam-debug.html\n');
    
    // Try different selectors
    const selectors = [
      'a[href*="/artwork/"]',
      'a[href*="artwork"]',
      '.box-item',
      'a.box-item',
      '[class*="box"]',
      '[class*="artwork"]',
      '[class*="item"]',
      'article a',
      '.results a',
      '.grid a',
      'a[class*="notice"]',
      'a.notice-link',
      '.notice-link',
      'img[src*="navigart"]',
      'a img'
    ];
    
    console.log('=== 셀렉터 테스트 ===\n');
    
    for (const sel of selectors) {
      const count = await page.$$eval(sel, els => els.length).catch(() => 0);
      console.log(`${sel}: ${count}개`);
    }
    
    // Get all links
    console.log('\n=== 모든 링크 (처음 20개) ===\n');
    const links = await page.$$eval('a', els => 
      els.slice(0, 20).map(el => ({ 
        href: el.href, 
        className: el.className,
        text: el.textContent.slice(0, 50) 
      }))
    );
    links.forEach((l, i) => {
      console.log(`${i + 1}. ${l.href}`);
      console.log(`   class: ${l.className}`);
    });
    
    // Check for iframe
    console.log('\n=== iframe 확인 ===\n');
    const iframes = await page.$$('iframe');
    console.log(`iframe 개수: ${iframes.length}`);
    
    for (let i = 0; i < iframes.length; i++) {
      const src = await iframes[i].getAttribute('src');
      console.log(`  [${i}] src: ${src}`);
    }
    
    // Get page structure
    console.log('\n=== 페이지 구조 ===\n');
    const structure = await page.evaluate(() => {
      const result = [];
      const walk = (el, depth = 0) => {
        if (depth > 3) return;
        const tag = el.tagName.toLowerCase();
        const id = el.id ? `#${el.id}` : '';
        const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(' ').slice(0,2).join('.')}` : '';
        result.push(`${'  '.repeat(depth)}${tag}${id}${cls}`);
        Array.from(el.children).forEach(c => walk(c, depth + 1));
      };
      walk(document.body);
      return result.slice(0, 50);
    });
    structure.forEach(s => console.log(s));
    
  } catch (e) {
    console.error('오류:', e.message);
  }
  
  await browser.close();
}

debug();
