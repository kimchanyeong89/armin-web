/**
 * Musée d'Art Moderne de Paris - Painting Collection Test Scraper
 * Uses Navigart iframe directly
 * Test: First 3 pages
 */

const { chromium } = require('playwright');

const BASE_URL = 'https://www.navigart.fr/mamparis/artworks/checkbox:withimage/Avec%20image/tree_domain_all/Peinture';

async function testScrape() {
  console.log('🎨 MAM Paris - Painting Collection Test Scraper (via Navigart)');
  console.log('Testing first 3 pages...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  const allArtworks = [];
  
  try {
    for (let pageNum = 1; pageNum <= 3; pageNum++) {
      const url = `${BASE_URL}?page=${pageNum}&sort=random&layout=box`;
      console.log(`\n📄 Page ${pageNum}: ${url}`);
      
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(3000);
      
      // Wait for artwork items
      await page.waitForSelector('.box-item, a[class*="box-item"]', { timeout: 15000 }).catch(() => {});
      
      // Extract artwork data
      const items = await page.$$eval('a.box-item, a[class*="box-item"]', elements => {
        return elements.map(el => {
          const img = el.querySelector('img');
          const textContent = el.textContent?.trim() || '';
          
          // Parse text content - usually "Category Artist Title Year"
          const lines = textContent.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
          
          return {
            detailUrl: el.href,
            image: img?.src || null,
            rawText: lines,
            category: lines[0] || null,
            artist: lines[1] || null,
            title: lines[2] || null
          };
        });
      });
      
      console.log(`Found ${items.length} artworks`);
      
      if (items.length > 0) {
        console.log('Sample:', items.slice(0, 2).map(i => ({
          title: i.title,
          artist: i.artist,
          image: i.image?.slice(0, 50) + '...'
        })));
        allArtworks.push(...items);
      }
    }
    
    console.log(`\n✅ Total artworks found: ${allArtworks.length}`);
    
    // Check total count on site
    const totalText = await page.$eval('.total-results, [class*="total"], [class*="count"]', el => el.textContent).catch(() => null);
    console.log('Total results text:', totalText);
    
    // Save test results
    const fs = require('fs');
    fs.writeFileSync(
      '/Users/kietzsche/armin-web-main/downloads/mam-test-results.json',
      JSON.stringify({ artworks: allArtworks, count: allArtworks.length }, null, 2)
    );
    console.log('Saved to downloads/mam-test-results.json');
    
  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: '/Users/kietzsche/armin-web-main/downloads/mam-debug.png', fullPage: true });
  }
  
  await browser.close();
}

testScrape();
