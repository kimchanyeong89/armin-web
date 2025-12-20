/**
 * Debug script to see what images are on each Tate display page
 */
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Test one page first
  const url = 'https://www.tate.org.uk/visit/tate-modern/display/artist-and-society';
  console.log(`\nVisiting: ${url}\n`);
  
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  
  // Accept cookies
  try {
    const btn = await page.$('button:has-text("Accept")');
    if (btn) await btn.click();
  } catch {}
  
  await page.waitForTimeout(3000);
  
  // Get all images with their context
  const imgs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img')).map((img, index) => {
      const rect = img.getBoundingClientRect();
      return {
        index,
        src: (img.src || '').substring(0, 120),
        alt: img.alt || '',
        top: Math.round(rect.top),
        width: img.width || img.naturalWidth,
        height: img.height || img.naturalHeight,
        parent: img.parentElement?.tagName || '',
        className: img.className || ''
      };
    });
  });
  
  console.log('All images on page:\n');
  imgs.forEach(img => {
    console.log(`[${img.index}] top=${img.top} size=${img.width}x${img.height}`);
    console.log(`    src: ${img.src}`);
    console.log(`    alt: ${img.alt}`);
    console.log(`    parent: ${img.parent}, class: ${img.className}\n`);
  });
  
  await browser.close();
}

main().catch(console.error);
