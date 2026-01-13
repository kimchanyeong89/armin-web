/**
 * Van Gogh Museum API 찾기
 * 네트워크 요청 모니터링으로 데이터 API 확인
 */

const { chromium } = require('playwright');
const fs = require('fs');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const apiCalls = [];
  
  // 네트워크 요청 모니터링
  page.on('request', request => {
    const url = request.url();
    if (url.includes('api') || url.includes('search') || url.includes('graphql') || 
        url.includes('collection') || url.includes('ajax') || url.includes('json')) {
      apiCalls.push({
        url: url,
        method: request.method(),
        type: 'request'
      });
    }
  });
  
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('api') || url.includes('search') || url.includes('graphql') || 
        url.includes('collection') && url.includes('json')) {
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('json')) {
          apiCalls.push({
            url: url,
            status: response.status(),
            contentType: contentType,
            type: 'response'
          });
        }
      } catch (e) {}
    }
  });
  
  console.log('페이지 로딩 중...');
  await page.goto('https://www.vangoghmuseum.nl/en/collection?q=', { waitUntil: 'networkidle' });
  
  console.log('스크롤 중...');
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n=== API 호출 발견 ===');
  const uniqueApis = [...new Set(apiCalls.map(c => c.url))];
  uniqueApis.forEach(url => {
    console.log(url);
  });
  
  // 페이지 소스에서 API 엔드포인트 찾기
  console.log('\n=== 페이지 소스 분석 ===');
  const pageContent = await page.content();
  
  // API URL 패턴 찾기
  const apiPatterns = pageContent.match(/https?:\/\/[^"'\s]*api[^"'\s]*/gi) || [];
  const searchPatterns = pageContent.match(/https?:\/\/[^"'\s]*search[^"'\s]*/gi) || [];
  
  console.log('API 패턴:', [...new Set(apiPatterns)].slice(0, 10));
  console.log('Search 패턴:', [...new Set(searchPatterns)].slice(0, 10));
  
  // __NEXT_DATA__ 또는 유사한 초기 데이터 찾기
  const nextData = await page.evaluate(() => {
    const script = document.querySelector('script#__NEXT_DATA__');
    if (script) return script.textContent.substring(0, 2000);
    return null;
  });
  
  if (nextData) {
    console.log('\n=== Next.js Data ===');
    console.log(nextData);
  }
  
  await browser.close();
}

main().catch(console.error);
