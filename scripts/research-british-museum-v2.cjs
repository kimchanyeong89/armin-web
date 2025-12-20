#!/usr/bin/env node
/**
 * Research script to analyze British Museum collection website structure
 * Using puppeteer-extra with stealth to bypass Cloudflare
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

(async () => {
  console.log('=== BRITISH MUSEUM COLLECTION RESEARCH ===\n');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security'
    ],
    defaultViewport: { width: 1360, height: 900 }
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
  
  // Listen for API requests
  const apiCalls = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/') || url.includes('_next/data') || url.includes('graphql')) {
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('json')) {
          const body = await response.text().catch(() => null);
          apiCalls.push({ url, status: response.status(), bodyPreview: body?.slice(0, 1000) });
        } else {
          apiCalls.push({ url, status: response.status() });
        }
      } catch (e) {
        apiCalls.push({ url, status: response.status() });
      }
    }
  });
  
  async function acceptCookies() {
    try {
      const selectors = [
        'button:has-text("Allow all cookies")',
        '#onetrust-accept-btn-handler',
        'button[title*="Accept"]',
        'button.accept-cookies'
      ];
      for (const sel of selectors) {
        const el = await page.$(sel);
        if (el) {
          await el.click().catch(() => {});
          await new Promise(r => setTimeout(r, 1000));
          return;
        }
      }
    } catch (e) {}
  }
  
  try {
    // 1. Visit galleries page
    console.log('1. Navigating to galleries page...');
    await page.goto('https://www.britishmuseum.org/collection/galleries', { 
      waitUntil: 'domcontentloaded', 
      timeout: 90000 
    });
    await new Promise(r => setTimeout(r, 5000));
    await acceptCookies();
    await new Promise(r => setTimeout(r, 2000));
    
    // Scroll to load content
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await new Promise(r => setTimeout(r, 600));
    }
    
    // Get gallery links
    const galleryLinks = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a[href*="/collection/galleries/"]');
      return [...new Set([...anchors].map(a => {
        const href = a.getAttribute('href') || '';
        const text = a.textContent?.trim() || '';
        return { href, text: text.slice(0, 100) };
      }).filter(x => x.href && x.href !== '/collection/galleries' && x.href !== '/collection/galleries/'))];
    });
    
    console.log(`\n   Found ${galleryLinks.length} gallery links:`);
    galleryLinks.slice(0, 40).forEach(g => console.log(`   - ${g.href} → "${g.text.slice(0, 50)}"`));
    
    // Get page HTML structure
    const pageStructure = await page.evaluate(() => {
      const title = document.title;
      const h1 = document.querySelector('h1')?.textContent?.trim() || 'No H1';
      const allLinks = [...document.querySelectorAll('a')].map(a => a.getAttribute('href')).filter(Boolean);
      const galleryPatterns = allLinks.filter(h => h.includes('/galleries/') || h.includes('/gallery/'));
      return { title, h1, totalLinks: allLinks.length, galleryPatternLinks: galleryPatterns.length };
    });
    console.log('\n   Page structure:', JSON.stringify(pageStructure));
    
    // 2. Visit example gallery page if found
    let galleryObjects = [];
    if (galleryLinks.length > 0) {
      const firstGallery = galleryLinks[0].href;
      const galleryUrl = firstGallery.startsWith('http') ? firstGallery : `https://www.britishmuseum.org${firstGallery}`;
      console.log(`\n2. Visiting example gallery: ${galleryUrl}`);
      
      await page.goto(galleryUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await new Promise(r => setTimeout(r, 5000));
      await acceptCookies();
      
      // Scroll
      for (let i = 0; i < 6; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await new Promise(r => setTimeout(r, 500));
      }
      
      galleryObjects = await page.evaluate(() => {
        const objectLinks = document.querySelectorAll('a[href*="/collection/object/"]');
        return [...new Set([...objectLinks].map(a => {
          const href = a.getAttribute('href') || '';
          const img = a.querySelector('img');
          const title = a.textContent?.trim() || img?.alt || '';
          return { href, title: title.slice(0, 100), imgSrc: img?.src || '' };
        }))];
      });
      
      console.log(`   Found ${galleryObjects.length} object links on gallery page`);
      galleryObjects.slice(0, 15).forEach(o => console.log(`   - ${o.href} → "${o.title.slice(0, 60)}"`));
    }
    
    // 3. Visit object detail page
    console.log('\n3. Visiting example object page (Y_EA24)...');
    await page.goto('https://www.britishmuseum.org/collection/object/Y_EA24', { 
      waitUntil: 'domcontentloaded', 
      timeout: 90000 
    });
    await new Promise(r => setTimeout(r, 5000));
    await acceptCookies();
    
    // Extract metadata
    const objectMetadata = await page.evaluate(() => {
      const title = document.querySelector('h1, .object-title, .page-title')?.textContent?.trim() || '';
      
      const images = [...document.querySelectorAll('img')].map(img => ({
        src: img.src || '',
        srcset: img.srcset || '',
        alt: img.alt || ''
      })).filter(img => img.src && (img.src.includes('collection') || img.src.includes('britishmuseum')));
      
      // Look for metadata fields (various patterns)
      const metaFields = {};
      
      // Pattern 1: dt/dd pairs
      const dts = document.querySelectorAll('dt');
      dts.forEach(dt => {
        const label = dt.textContent?.trim() || '';
        const dd = dt.nextElementSibling;
        const value = dd?.textContent?.trim() || '';
        if (label && value) metaFields[label] = value;
      });
      
      // Pattern 2: Look for labeled fields
      const fieldLabels = document.querySelectorAll('[class*="label"], [class*="field-name"]');
      fieldLabels.forEach(el => {
        const label = el.textContent?.trim();
        const value = el.nextElementSibling?.textContent?.trim();
        if (label && value) metaFields[label] = value;
      });
      
      // Pattern 3: Get all text content as fallback
      const mainContent = document.querySelector('main, article, .content, [role="main"]');
      const allText = mainContent?.textContent?.slice(0, 2000) || '';
      
      // Look for structured data
      const jsonLd = document.querySelector('script[type="application/ld+json"]');
      let structuredData = null;
      if (jsonLd) {
        try { structuredData = JSON.parse(jsonLd.textContent); } catch (e) {}
      }
      
      // Look for Open Graph / meta tags
      const metaTags = {};
      document.querySelectorAll('meta[property], meta[name]').forEach(m => {
        const key = m.getAttribute('property') || m.getAttribute('name');
        const val = m.getAttribute('content');
        if (key && val) metaTags[key] = val;
      });
      
      return { title, images: images.slice(0, 10), metaFields, structuredData, metaTags, textPreview: allText.slice(0, 500) };
    });
    
    console.log('   Object title:', objectMetadata.title);
    console.log('   Meta tags:', JSON.stringify(objectMetadata.metaTags, null, 2));
    console.log('   Metadata fields:', JSON.stringify(objectMetadata.metaFields, null, 2));
    console.log('   Text preview:', objectMetadata.textPreview?.slice(0, 300));
    console.log('   Images found:', objectMetadata.images?.length || 0);
    (objectMetadata.images || []).slice(0, 5).forEach((img, i) => {
      console.log(`     ${i + 1}. src: ${img.src?.slice(0, 120)}`);
    });
    if (objectMetadata.structuredData) {
      console.log('   Structured data (JSON-LD):', JSON.stringify(objectMetadata.structuredData, null, 2).slice(0, 800));
    }
    
    // 4. Test collection search
    console.log('\n4. Testing collection search for "rosetta"...');
    await page.goto('https://www.britishmuseum.org/collection/search?keyword=rosetta', { 
      waitUntil: 'domcontentloaded', 
      timeout: 90000 
    });
    await new Promise(r => setTimeout(r, 5000));
    await acceptCookies();
    
    // Scroll to load results
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await new Promise(r => setTimeout(r, 500));
    }
    
    const searchResults = await page.evaluate(() => {
      const objectLinks = document.querySelectorAll('a[href*="/collection/object/"]');
      return [...new Set([...objectLinks].map(a => {
        const href = a.getAttribute('href') || '';
        const img = a.querySelector('img');
        const title = a.textContent?.trim() || img?.alt || '';
        return { href, title: title.slice(0, 100), imgSrc: img?.src || '' };
      }))];
    });
    
    console.log(`   Search results: ${searchResults.length}`);
    searchResults.slice(0, 10).forEach(r => console.log(`   - ${r.href} → "${r.title.slice(0, 60)}"`));
    console.log('   Final URL:', page.url());
    
    // 5. API Summary
    console.log('\n=== API ENDPOINTS OBSERVED ===');
    apiCalls.forEach(call => {
      console.log(`   [${call.status}] ${call.url.slice(0, 150)}`);
      if (call.bodyPreview) {
        console.log(`      Body: ${call.bodyPreview.slice(0, 300)}...`);
      }
    });
    
    // Save results
    const results = {
      scrapedAt: new Date().toISOString(),
      galleryLinks,
      galleryObjects,
      objectMetadata,
      searchResults,
      apiCalls: apiCalls.map(c => ({ url: c.url, status: c.status, bodyPreview: c.bodyPreview?.slice(0, 500) }))
    };
    
    const outPath = path.join(process.cwd(), 'downloads', 'british-museum-research.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log(`\n=== Results saved to ${outPath} ===`);
    
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await browser.close();
  }
})();
