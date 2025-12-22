/**
 * MAM Paris Debug - Check page structure after full load
 */

const { chromium } = require('playwright');

async function debug() {
  const browser = await chromium.launch({ headless: false }); // Visual debug
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  const url = 'https://www.mam.paris.fr/en/online-collections#/artworks/checkbox:withimage/Avec%20image/tree_domain_all/Peinture?page=1&sort=random&layout=box';
  
  console.log('Loading page...');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  
  // Wait for Angular/React app to load
  console.log('Waiting for SPA content...');
  await page.waitForTimeout(8000);
  
  // Check for iframe
  const iframes = await page.$$('iframe');
  console.log(`Found ${iframes.length} iframes`);
  
  // Check body content
  const bodyHtml = await page.evaluate(() => document.body.innerHTML.length);
  console.log(`Body HTML length: ${bodyHtml}`);
  
  // Look for any grid/list containers
  const containers = await page.evaluate(() => {
    const selectors = [
      '[class*="grid"]',
      '[class*="list"]',
      '[class*="artwork"]',
      '[class*="item"]',
      '[class*="card"]',
      '[class*="result"]',
      '[class*="notice"]',
      '.ng-scope',
      '[ng-repeat]',
      '[data-*]'
    ];
    
    const results = {};
    selectors.forEach(sel => {
      try {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          results[sel] = els.length;
        }
      } catch (e) {}
    });
    
    return results;
  });
  
  console.log('Containers found:', containers);
  
  // Look for images
  const images = await page.$$eval('img', imgs => imgs.map(i => ({ src: i.src?.slice(0, 80), alt: i.alt })).slice(0, 10));
  console.log('Images:', images);
  
  // Look for links
  const links = await page.$$eval('a', as => as.map(a => ({ href: a.href, text: a.textContent?.trim()?.slice(0, 50) })).filter(l => l.href.includes('artwork') || l.href.includes('notice') || l.href.includes('oeuvre')).slice(0, 10));
  console.log('Artwork links:', links);
  
  // Take screenshot
  await page.screenshot({ path: '/Users/kietzsche/armin-web-main/downloads/mam-debug.png', fullPage: true });
  console.log('Screenshot saved');
  
  // Save full HTML for analysis
  const html = await page.content();
  require('fs').writeFileSync('/Users/kietzsche/armin-web-main/downloads/mam-debug.html', html);
  console.log('HTML saved');
  
  // Keep browser open for 10 seconds to see
  await page.waitForTimeout(10000);
  
  await browser.close();
}

debug();
