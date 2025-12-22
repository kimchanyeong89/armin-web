/**
 * Fondation Louis Vuitton Collection Scraper - TEST v2
 * 봇 차단 우회 시도
 */

const { chromium } = require('playwright');
const fs = require('fs');

const COLLECTION_URL = 'https://www.fondationlouisvuitton.fr/en/collection/artworks';

async function main() {
  console.log('🏛️ Fondation Louis Vuitton - TEST v2\n');
  
  const browser = await chromium.launch({ 
    headless: false,  // 봇 차단 우회를 위해 headful 모드
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'Europe/Paris'
  });
  
  // Anti-detection
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  });
  
  const page = await context.newPage();
  
  try {
    console.log('📡 Navigating...');
    await page.goto(COLLECTION_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    
    const title = await page.title();
    console.log('📄 Page title:', title);
    
    if (title.includes('Denied') || title.includes('Blocked')) {
      console.log('❌ Still blocked. Saving debug info...');
      await page.screenshot({ path: 'downloads/flv-blocked.png' });
      const html = await page.content();
      fs.writeFileSync('downloads/flv-blocked.html', html);
      console.log('   Saved: flv-blocked.png, flv-blocked.html');
    } else {
      console.log('✅ Page loaded!');
      await page.screenshot({ path: 'downloads/flv-success.png', fullPage: false });
      
      // 분석
      const links = await page.$$eval('a[href*="/collection/"]', els => 
        els.map(el => el.href).filter(h => h.includes('/artwork'))
      );
      console.log('🔗 Artwork links:', links.length);
      links.slice(0, 5).forEach(l => console.log('  -', l));
      
      const html = await page.content();
      fs.writeFileSync('downloads/flv-collection.html', html);
    }
    
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
