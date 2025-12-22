/**
 * FLV API 엔드포인트 탐색
 */

const { chromium } = require('playwright');
const fs = require('fs');

async function main() {
  console.log('🔍 FLV API 엔드포인트 탐색\n');
  
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  // 네트워크 요청 모니터링
  const apiRequests = [];
  
  page.on('request', request => {
    const url = request.url();
    if (url.includes('api') || url.includes('graphql') || url.includes('json') || url.includes('artworks')) {
      apiRequests.push({
        method: request.method(),
        url: url,
        headers: request.headers()
      });
    }
  });
  
  page.on('response', async response => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';
    
    if (contentType.includes('json') || url.includes('api') || url.includes('graphql')) {
      console.log(`📡 ${response.status()} ${url.slice(0, 100)}`);
      
      try {
        const body = await response.text();
        if (body.length < 50000) {
          fs.writeFileSync(`downloads/flv-api-${Date.now()}.json`, body);
        }
      } catch (e) {}
    }
  });
  
  try {
    console.log('📡 Loading page...');
    await page.goto('https://www.fondationlouisvuitton.fr/en/collection/artworks', { 
      waitUntil: 'networkidle', 
      timeout: 60000 
    });
    
    await page.waitForTimeout(5000);
    
    console.log('\n📋 API Requests found:', apiRequests.length);
    apiRequests.forEach((req, i) => {
      console.log(`\n${i + 1}. ${req.method} ${req.url.slice(0, 120)}`);
    });
    
    // 저장
    fs.writeFileSync('downloads/flv-api-requests.json', JSON.stringify(apiRequests, null, 2));
    console.log('\n💾 Saved to downloads/flv-api-requests.json');
    
  } catch (e) {
    console.log('Error:', e.message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
