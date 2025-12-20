#!/usr/bin/env node
/**
 * Research script to analyze British Museum collection website structure
 */
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  // Listen for API requests
  const apiCalls = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/') || url.includes('_next/data') || url.includes('graphql')) {
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('json')) {
          const body = await response.text().catch(() => null);
          apiCalls.push({ url, status: response.status(), bodyPreview: body?.slice(0, 500) });
        } else {
          apiCalls.push({ url, status: response.status() });
        }
      } catch (e) {
        apiCalls.push({ url, status: response.status() });
      }
    }
  });
  
  console.log('=== BRITISH MUSEUM COLLECTION RESEARCH ===\n');
  
  // 1. Visit galleries page
  console.log('1. Navigating to galleries page...');
  await page.goto('https://www.britishmuseum.org/collection/galleries', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(5000);
  
  // Accept cookies
  try {
    await page.click('button:has-text("Allow all cookies")', { timeout: 5000 });
    await page.waitForTimeout(2000);
  } catch (e) {
    console.log('   (no cookie banner or already accepted)');
  }
  
  // Scroll to load content
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(500);
  }
  
  // Get gallery links
  const galleryLinks = await page.evaluate(() => {
    const anchors = document.querySelectorAll('a[href*="/collection/galleries/"]');
    return [...new Set([...anchors].map(a => {
      const href = a.getAttribute('href');
      const text = a.textContent?.trim() || '';
      return { href, text };
    }).filter(x => x.href && x.href !== '/collection/galleries' && x.href !== '/collection/galleries/'))];
  });
  
  console.log(`\n   Found ${galleryLinks.length} gallery links:`);
  galleryLinks.slice(0, 50).forEach(g => console.log(`   - ${g.href} → "${g.text.slice(0, 50)}"`));
  
  // Get page HTML structure
  const pageStructure = await page.evaluate(() => {
    const main = document.querySelector('main, .main-content, [role="main"]');
    if (!main) return 'No main element found';
    return {
      tagName: main.tagName,
      classList: [...main.classList],
      childCount: main.children.length,
      h1: document.querySelector('h1')?.textContent?.trim() || 'No H1'
    };
  });
  console.log('\n   Page structure:', JSON.stringify(pageStructure));
  
  // 2. Visit an example gallery page if we found any
  if (galleryLinks.length > 0) {
    const firstGallery = galleryLinks[0].href;
    const galleryUrl = firstGallery.startsWith('http') ? firstGallery : `https://www.britishmuseum.org${firstGallery}`;
    console.log(`\n2. Visiting example gallery: ${galleryUrl}`);
    
    await page.goto(galleryUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    
    // Get objects/artworks on this page
    const galleryObjects = await page.evaluate(() => {
      const objectLinks = document.querySelectorAll('a[href*="/collection/object/"]');
      return [...new Set([...objectLinks].map(a => {
        const href = a.getAttribute('href');
        const img = a.querySelector('img');
        const title = a.textContent?.trim() || img?.alt || '';
        return { href, title: title.slice(0, 100), imgSrc: img?.src || '' };
      }))];
    });
    
    console.log(`   Found ${galleryObjects.length} object links on gallery page`);
    galleryObjects.slice(0, 10).forEach(o => console.log(`   - ${o.href} → "${o.title.slice(0, 60)}"`));
  }
  
  // 3. Visit object detail page
  console.log('\n3. Visiting example object page...');
  await page.goto('https://www.britishmuseum.org/collection/object/Y_EA24', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  
  // Extract metadata
  const objectMetadata = await page.evaluate(() => {
    const getData = (selector) => document.querySelector(selector)?.textContent?.trim() || '';
    const getAll = (selector) => [...document.querySelectorAll(selector)].map(el => el.textContent?.trim()).filter(Boolean);
    
    const title = getData('h1, .object-title, .page-title');
    const images = [...document.querySelectorAll('img[src*="collection"], img[srcset*="collection"], picture img')].map(img => ({
      src: img.src,
      srcset: img.srcset
    }));
    
    // Look for metadata fields
    const metaFields = {};
    const dts = document.querySelectorAll('dt, .field-label, .metadata-label');
    dts.forEach(dt => {
      const label = dt.textContent?.trim() || '';
      const value = dt.nextElementSibling?.textContent?.trim() || '';
      if (label && value) metaFields[label] = value;
    });
    
    // Also try structured data
    const jsonLd = document.querySelector('script[type="application/ld+json"]');
    let structuredData = null;
    if (jsonLd) {
      try { structuredData = JSON.parse(jsonLd.textContent); } catch (e) {}
    }
    
    return { title, images: images.slice(0, 5), metaFields, structuredData };
  });
  
  console.log('   Object title:', objectMetadata.title);
  console.log('   Metadata fields:', JSON.stringify(objectMetadata.metaFields, null, 2));
  console.log('   Images found:', objectMetadata.images.length);
  objectMetadata.images.forEach((img, i) => {
    console.log(`     ${i + 1}. src: ${img.src?.slice(0, 100)}`);
    if (img.srcset) console.log(`        srcset: ${img.srcset?.slice(0, 150)}...`);
  });
  if (objectMetadata.structuredData) {
    console.log('   Structured data (JSON-LD):', JSON.stringify(objectMetadata.structuredData, null, 2).slice(0, 500));
  }
  
  // 4. Check for API patterns
  console.log('\n4. API calls observed:');
  apiCalls.forEach(call => {
    console.log(`   - [${call.status}] ${call.url}`);
    if (call.bodyPreview) {
      console.log(`     Preview: ${call.bodyPreview.slice(0, 200)}...`);
    }
  });
  
  // 5. Try collection search to understand search API
  console.log('\n5. Testing collection search...');
  await page.goto('https://www.britishmuseum.org/collection/search?keyword=rosetta', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  
  const searchResults = await page.evaluate(() => {
    const objectLinks = document.querySelectorAll('a[href*="/collection/object/"]');
    return [...new Set([...objectLinks].map(a => {
      const href = a.getAttribute('href');
      const img = a.querySelector('img');
      const title = a.textContent?.trim() || img?.alt || '';
      return { href, title: title.slice(0, 100), imgSrc: img?.src || '' };
    }))];
  });
  
  console.log(`   Search results found: ${searchResults.length}`);
  searchResults.slice(0, 10).forEach(r => console.log(`   - ${r.href} → "${r.title.slice(0, 60)}"`));
  
  // Get current URL to see query params
  console.log('   Final URL:', page.url());
  
  // 6. Summarize API endpoints
  console.log('\n=== API ENDPOINTS SUMMARY ===');
  const uniqueApiPatterns = [...new Set(apiCalls.map(c => {
    try {
      const u = new URL(c.url);
      return u.pathname;
    } catch { return c.url; }
  }))];
  uniqueApiPatterns.forEach(p => console.log(`   ${p}`));
  
  await browser.close();
  
  // Write results to file
  const results = {
    scrapedAt: new Date().toISOString(),
    galleryLinks,
    objectMetadata,
    searchResults,
    apiCalls: apiCalls.map(c => ({ url: c.url, status: c.status }))
  };
  
  fs.writeFileSync('downloads/british-museum-research.json', JSON.stringify(results, null, 2));
  console.log('\n=== Results saved to downloads/british-museum-research.json ===');
})();
