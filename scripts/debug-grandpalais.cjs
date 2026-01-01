/**
 * Debug Grand Palais RMN page structure
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function debug() {
  const browser = await chromium.launch({ headless: false }); // Headful for debugging
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  const url = 'https://images.grandpalaisrmn.fr/search-result?CS_MERGE=media%2Ccollections&SEARCHTXT1=%22conde%22&SEARCHMODE=NEW&CATEGORY[]=275846&CATEGORY[]=271490&EVENT=WEBSHOP_SEARCH';
  
  console.log('Navigating to:', url);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  
  // Wait for dynamic content
  console.log('Waiting for content...');
  await page.waitForTimeout(10000);
  
  // Accept cookies
  try {
    await page.click('button:has-text("Accept all cookies")');
    await page.waitForTimeout(3000);
    console.log('Accepted cookies');
  } catch (e) {
    console.log('No cookie banner or already accepted');
  }
  
  // Check for results
  await page.waitForTimeout(5000);
  
  // Get page structure
  const structure = await page.evaluate(() => {
    const result = {
      title: document.title,
      allClasses: [],
      images: [],
      links: [],
      iframes: []
    };
    
    // Get all unique class names
    const allElements = document.querySelectorAll('*[class]');
    const classSet = new Set();
    allElements.forEach(el => {
      const cls = el.getAttribute('class') || '';
      if (typeof cls === 'string') {
        cls.split(' ').forEach(c => {
          if (c.trim()) classSet.add(c.trim());
        });
      }
    });
    result.allClasses = [...classSet].sort();
    
    // Get all images
    document.querySelectorAll('img').forEach(img => {
      result.images.push({
        src: img.src,
        alt: img.alt,
        className: img.className
      });
    });
    
    // Get relevant links
    document.querySelectorAll('a').forEach(a => {
      if (a.href && (a.href.includes('asset') || a.href.includes('media'))) {
        result.links.push({
          href: a.href,
          text: a.textContent?.trim()?.substring(0, 100)
        });
      }
    });
    
    // Check for iframes
    document.querySelectorAll('iframe').forEach(iframe => {
      result.iframes.push({
        src: iframe.src,
        id: iframe.id
      });
    });
    
    return result;
  });
  
  console.log('\n=== Page Structure ===');
  console.log('Title:', structure.title);
  console.log('\nImages found:', structure.images.length);
  structure.images.slice(0, 10).forEach(img => {
    console.log('  -', img.src?.substring(0, 100));
  });
  
  console.log('\nRelevant links:', structure.links.length);
  structure.links.slice(0, 10).forEach(link => {
    console.log('  -', link.href?.substring(0, 100));
  });
  
  console.log('\nIframes:', structure.iframes.length);
  structure.iframes.forEach(iframe => {
    console.log('  -', iframe.src);
  });
  
  console.log('\nClasses containing "result" or "thumb" or "asset":');
  structure.allClasses.filter(c => 
    c.toLowerCase().includes('result') || 
    c.toLowerCase().includes('thumb') ||
    c.toLowerCase().includes('asset') ||
    c.toLowerCase().includes('grid') ||
    c.toLowerCase().includes('item')
  ).forEach(c => console.log('  -', c));
  
  // Save HTML for analysis
  const html = await page.content();
  fs.writeFileSync(path.join(__dirname, '../downloads/grandpalais-debug.html'), html);
  console.log('\nSaved HTML to downloads/grandpalais-debug.html');
  
  // Keep browser open for 30 seconds for manual inspection
  console.log('\nKeeping browser open for 30 seconds...');
  await page.waitForTimeout(30000);
  
  await browser.close();
}

debug().catch(console.error);
