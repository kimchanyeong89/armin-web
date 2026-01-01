#!/usr/bin/env node
/**
 * Wallace Collection 필터 구조 디버깅
 */

const { chromium } = require('playwright');
const fs = require('fs');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();
  
  // Ground Floor 필터 URL로 직접 접근
  const url = 'https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=direct/1/ResultDetailView/preselectFilterSection.$FilterGroupControl.$MpDirectLink&sp=13&sp=Sroom&sp=SfilterDefinition&sp=0&sp=6&sp=3&sp=SdetailView&sp=0&sp=Sdetail&sp=0&sp=T&sp=0&sp=SdetailList&sp=0&sp=S10034&sp=S1';
  
  console.log('Ground Floor 페이지 로드...');
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));
  
  // HTML 구조 출력
  const html = await page.content();
  fs.writeFileSync('/tmp/wallace-ground-debug.html', html);
  console.log('HTML 저장: /tmp/wallace-ground-debug.html');
  
  // 모든 필터 아이템 찾기
  const filters = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll('a').forEach(a => {
      const text = a.textContent?.trim();
      const href = a.getAttribute('href') || '';
      if (text && (text.includes('Armour') || text.includes('Smoking'))) {
        results.push({ text, href: href.substring(0, 200) });
      }
    });
    return results;
  });
  
  console.log('\n발견된 관련 링크:');
  filters.forEach(f => console.log(`  ${f.text}: ${f.href}`));
  
  await browser.close();
}

main().catch(console.error);
