/**
 * Fondation Louis Vuitton - Firefox 기반 테스트
 */

const { firefox } = require('playwright');
const fs = require('fs');

const COLLECTION_URL = 'https://www.fondationlouisvuitton.fr/en/collection/artworks';

async function main() {
  console.log('🏛️ FLV Test - Firefox\n');
  
  const browser = await firefox.launch({ headless: true });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  try {
    console.log('📡 Navigating...');
    const response = await page.goto(COLLECTION_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('📊 Status:', response?.status());
    
    await page.waitForTimeout(3000);
    
    const title = await page.title();
    console.log('📄 Title:', title);
    
    const url = page.url();
    console.log('🔗 URL:', url);
    
    await page.screenshot({ path: 'downloads/flv-firefox.png', fullPage: false });
    console.log('📸 Screenshot saved');
    
    // 페이지 분석
    const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 1000));
    console.log('\n📝 Page content preview:\n', bodyText);
    
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
