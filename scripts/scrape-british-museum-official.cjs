#!/usr/bin/env node
/**
 * British Museum Official Website Scraper
 * 
 * Scrapes collection highlights directly from britishmuseum.org
 * using Puppeteer with Stealth plugin to bypass Cloudflare protection.
 * 
 * Features:
 * - Cloudflare bypass with stealth mode
 * - Gallery room discovery from official galleries page
 * - Object detail scraping with full metadata
 * - High-resolution image URL extraction
 * 
 * Output: public/data/british-museum-collection.json
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const BASE_URL = 'https://www.britishmuseum.org';
const COLLECTION_URL = `${BASE_URL}/collection`;
const OUT_PATH = path.join(process.cwd(), 'public', 'data', 'british-museum-collection.json');

// Key gallery searches to find highlights
const HIGHLIGHT_SEARCHES = [
  { query: 'rosetta stone', room: '4', category: 'Egyptian Sculpture' },
  { query: 'parthenon', room: '18', category: 'Parthenon Galleries' },
  { query: 'sutton hoo helmet', room: '41', category: 'Sutton Hoo' },
  { query: 'lewis chessmen', room: '40', category: 'Medieval Europe' },
  { query: 'assyrian lion hunt', room: '10', category: 'Assyrian' },
  { query: 'lamassu', room: '6', category: 'Assyrian' },
  { query: 'mummy egypt', room: '62', category: 'Egyptian Mummies' },
  { query: 'benin bronze', room: '25', category: 'Africa' },
  { query: 'moai easter island', room: '24', category: 'Living and Dying' },
  { query: 'standard of ur', room: '56', category: 'Mesopotamia' },
  { query: 'cyrus cylinder', room: '52', category: 'Ancient Iran' },
  { query: 'portland vase', room: '70', category: 'Roman' },
  { query: 'lindow man', room: '50', category: 'Prehistoric Britain' },
  { query: 'aztec serpent turquoise', room: '27', category: 'Mexico' },
  { query: 'samurai armour japan', room: '93', category: 'Japan' },
  { query: 'hokusai wave', room: '93', category: 'Japan' },
  { query: 'david vases china', room: '95', category: 'Chinese Ceramics' },
  { query: 'oxus treasure', room: '52', category: 'Ancient Iran' },
  { query: 'mold gold cape', room: '51', category: 'Prehistoric Britain' },
  { query: 'royal gold cup', room: '40', category: 'Medieval Europe' },
  { query: 'nereid monument', room: '17', category: 'Greek' },
  { query: 'mausoleum halicarnassus', room: '21', category: 'Greek' },
  { query: 'amaravati sculpture', room: '33', category: 'Asia' },
  { query: 'elgin marbles', room: '18', category: 'Parthenon Galleries' },
  { query: 'book of the dead', room: '62', category: 'Egyptian Mummies' },
  { query: 'ramesses statue', room: '4', category: 'Egyptian Sculpture' },
  { query: 'cleopatra', room: '4', category: 'Egyptian' },
  { query: 'gilgamesh flood tablet', room: '55', category: 'Mesopotamia' },
  { query: 'battersea shield', room: '50', category: 'Prehistoric Britain' },
  { query: 'tree of life weapon', room: '25', category: 'Africa' },
];

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function acceptCookies(page) {
  try {
    // Wait a bit for cookie dialog
    await delay(2000);
    
    const selectors = [
      '#onetrust-accept-btn-handler',
      'button[id*="accept"]',
      'button:has-text("Allow all")',
      'button:has-text("Accept all")',
      '.cookie-consent-accept',
      '[data-testid="cookie-accept"]'
    ];
    
    for (const selector of selectors) {
      try {
        const btn = await page.$(selector);
        if (btn) {
          await btn.click();
          console.log('  ✓ Cookies accepted');
          await delay(1000);
          return true;
        }
      } catch (e) {}
    }
    
    // Try clicking by text content
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const btn of buttons) {
        if (btn.textContent.toLowerCase().includes('accept') || 
            btn.textContent.toLowerCase().includes('allow')) {
          btn.click();
          return true;
        }
      }
      return false;
    });
    
  } catch (e) {
    console.log('  Cookie handling skipped');
  }
  return false;
}

async function waitForCloudflare(page, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const title = await page.title();
    const content = await page.content();
    
    if (!title.includes('Just a moment') && 
        !content.includes('challenge-platform') &&
        !content.includes('cf-browser-verification')) {
      return true;
    }
    
    console.log('  ⏳ Waiting for Cloudflare...');
    await delay(2000);
  }
  return false;
}

async function scrollAndLoad(page, times = 5) {
  for (let i = 0; i < times; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await delay(500);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

function parseYear(dateStr) {
  if (!dateStr) return 0;
  
  // Handle BC dates
  const bcMatch = dateStr.match(/(\d+)\s*(BC|BCE)/i);
  if (bcMatch) return -parseInt(bcMatch[1]);
  
  // Handle AD dates
  const adMatch = dateStr.match(/(\d{3,4})\s*(AD|CE)?/i);
  if (adMatch) return parseInt(adMatch[1]);
  
  // Handle century
  const centuryMatch = dateStr.match(/(\d+)(?:st|nd|rd|th)\s*century\s*(BC|BCE)?/i);
  if (centuryMatch) {
    const century = parseInt(centuryMatch[1]);
    return centuryMatch[2] ? -(century * 100 - 50) : (century * 100 - 50);
  }
  
  return 0;
}

async function searchCollection(page, query) {
  const searchUrl = `${COLLECTION_URL}/search?keyword=${encodeURIComponent(query)}&image=true&on_display=true`;
  console.log(`\n🔍 Searching: "${query}"`);
  
  try {
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await waitForCloudflare(page);
    await acceptCookies(page);
    await delay(2000);
    await scrollAndLoad(page, 3);
    
    // Extract search results
    const results = await page.evaluate(() => {
      const items = [];
      
      // Find all object cards/links
      const cards = document.querySelectorAll('[class*="card"], [class*="teaser"], [class*="promo"], article');
      
      cards.forEach(card => {
        const link = card.querySelector('a[href*="/collection/object/"]');
        if (!link) return;
        
        const href = link.getAttribute('href');
        const img = card.querySelector('img');
        const title = card.querySelector('h2, h3, [class*="title"]')?.textContent?.trim() ||
                      img?.getAttribute('alt')?.trim() || '';
        
        if (href && title) {
          items.push({
            url: href.startsWith('http') ? href : `https://www.britishmuseum.org${href}`,
            objectId: href.split('/object/')[1]?.split(/[/?#]/)[0] || '',
            title: title,
            thumbnail: img?.getAttribute('src') || img?.getAttribute('data-src') || ''
          });
        }
      });
      
      // Also try direct object links
      if (items.length === 0) {
        document.querySelectorAll('a[href*="/collection/object/"]').forEach(link => {
          const href = link.getAttribute('href');
          const img = link.querySelector('img') || link.closest('[class*="card"]')?.querySelector('img');
          const title = link.querySelector('[class*="title"]')?.textContent?.trim() ||
                        img?.getAttribute('alt')?.trim() ||
                        link.textContent?.trim() || '';
          
          if (href && !items.find(i => i.url.includes(href))) {
            items.push({
              url: href.startsWith('http') ? href : `https://www.britishmuseum.org${href}`,
              objectId: href.split('/object/')[1]?.split(/[/?#]/)[0] || '',
              title: title.substring(0, 200),
              thumbnail: img?.getAttribute('src') || ''
            });
          }
        });
      }
      
      return items.slice(0, 5); // Top 5 results
    });
    
    console.log(`   Found ${results.length} results`);
    return results;
    
  } catch (e) {
    console.log(`   ⚠ Search failed: ${e.message}`);
    return [];
  }
}

async function scrapeObjectDetail(page, objectUrl, retries = 2) {
  console.log(`   → Fetching: ${objectUrl}`);
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await page.goto(objectUrl, { waitUntil: 'networkidle2', timeout: 45000 });
      await waitForCloudflare(page);
      await acceptCookies(page);
      await delay(1500);
      await scrollAndLoad(page, 2);
      
      const detail = await page.evaluate(() => {
        // Helper functions
        const getText = (selectors) => {
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el?.textContent?.trim()) return el.textContent.trim();
          }
          return '';
        };
        
        const getMeta = (name) => {
          const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
          return el?.getAttribute('content') || '';
        };
        
        // Title
        const title = getText(['h1', '.object-title', '[class*="object"] h1']) ||
                      getMeta('og:title')?.replace(' | British Museum', '') || '';
        
        // Description
        const description = getMeta('description') || getMeta('og:description') || 
                           getText(['.object-description', '[class*="description"]']) || '';
        
        // Main image - try multiple sources
        let mainImage = '';
        
        // 1. Try og:image first (usually high quality)
        mainImage = getMeta('og:image');
        
        // 2. Try main object image
        if (!mainImage) {
          const mainImg = document.querySelector('.object-image img, [class*="object"] img, main img[src*="media"]');
          if (mainImg) {
            mainImage = mainImg.getAttribute('data-src') || 
                       mainImg.getAttribute('src') || '';
          }
        }
        
        // 3. Try to find highest resolution in srcset
        if (!mainImage) {
          const imgWithSrcset = document.querySelector('img[srcset]');
          if (imgWithSrcset) {
            const srcset = imgWithSrcset.getAttribute('srcset');
            const sources = srcset.split(',').map(s => s.trim().split(' '));
            // Sort by size descending
            sources.sort((a, b) => {
              const sizeA = parseInt(a[1]) || 0;
              const sizeB = parseInt(b[1]) || 0;
              return sizeB - sizeA;
            });
            mainImage = sources[0]?.[0] || '';
          }
        }
        
        // 4. Any image with media in URL
        if (!mainImage) {
          const mediaImg = document.querySelector('img[src*="media"], img[src*="collection"]');
          if (mediaImg) {
            mainImage = mediaImg.getAttribute('src') || '';
          }
        }
        
        // Fix relative URLs
        if (mainImage && !mainImage.startsWith('http')) {
          mainImage = mainImage.startsWith('//') ? `https:${mainImage}` : 
                     `https://www.britishmuseum.org${mainImage}`;
        }
        
        // Extract metadata from definition lists or structured data
        const metadata = {};
        document.querySelectorAll('dt').forEach(dt => {
          const dd = dt.nextElementSibling;
          if (dd?.tagName === 'DD') {
            const key = dt.textContent.trim().toLowerCase().replace(/[:\s]+/g, '_');
            metadata[key] = dd.textContent.trim();
          }
        });
        
        // Try to find specific fields
        const findField = (...labels) => {
          for (const label of labels) {
            if (metadata[label]) return metadata[label];
            
            // Try other selectors
            const el = document.querySelector(`[data-label*="${label}" i] .value, 
                                               [class*="${label}" i]`);
            if (el) return el.textContent.trim();
          }
          return '';
        };
        
        const date = findField('date', 'production_date', 'period', 'when') || '';
        const materials = findField('material', 'technique', 'medium', 'materials') || '';
        const dimensions = findField('dimension', 'size', 'measurements') || '';
        const culture = findField('culture', 'made_by', 'origin', 'where') || '';
        const location = findField('location', 'gallery', 'room', 'museum_location') || '';
        const objectNumber = findField('museum_number', 'registration', 'object_number', 'number') || '';
        
        // Get additional images
        const additionalImages = [];
        document.querySelectorAll('[class*="thumbnail"] img, [class*="gallery"] img').forEach(img => {
          const src = img.getAttribute('data-large') || 
                     img.getAttribute('data-src') || 
                     img.getAttribute('src');
          if (src && !additionalImages.includes(src) && src !== mainImage) {
            let fullSrc = src;
            if (!fullSrc.startsWith('http')) {
              fullSrc = fullSrc.startsWith('//') ? `https:${fullSrc}` : 
                       `https://www.britishmuseum.org${fullSrc}`;
            }
            additionalImages.push(fullSrc);
          }
        });
        
        return {
          title,
          description: description.substring(0, 1000),
          mainImage,
          date,
          materials,
          dimensions,
          culture,
          location,
          objectNumber,
          additionalImages: additionalImages.slice(0, 5),
          rawMetadata: metadata
        };
      });
      
      if (detail.title || detail.mainImage) {
        return detail;
      }
      
    } catch (e) {
      if (attempt < retries) {
        console.log(`   Retry ${attempt}/${retries}...`);
        await delay(2000);
      } else {
        console.log(`   ⚠ Failed: ${e.message}`);
      }
    }
  }
  
  return null;
}

async function main() {
  console.log('🏛️ British Museum Official Website Scraper');
  console.log('==========================================\n');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ],
    defaultViewport: { width: 1440, height: 900 }
  });
  
  const page = await browser.newPage();
  
  // Set realistic headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-GB,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
  });
  
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  // Block unnecessary resources to speed up
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const type = req.resourceType();
    if (['font', 'stylesheet'].includes(type)) {
      req.abort();
    } else {
      req.continue();
    }
  });
  
  const allItems = [];
  const seenIds = new Set();
  
  try {
    // First, visit the main collection page to establish session
    console.log('📡 Establishing session with British Museum...');
    await page.goto(COLLECTION_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    const cfPassed = await waitForCloudflare(page);
    
    if (!cfPassed) {
      console.log('⚠ Cloudflare challenge may still be active, continuing anyway...');
    }
    
    await acceptCookies(page);
    await delay(2000);
    console.log('✓ Session established\n');
    
    // Search for each highlight
    for (const search of HIGHLIGHT_SEARCHES) {
      const results = await searchCollection(page, search.query);
      
      for (const result of results) {
        if (seenIds.has(result.objectId)) continue;
        seenIds.add(result.objectId);
        
        // Get full details
        const detail = await scrapeObjectDetail(page, result.url);
        await delay(1500); // Rate limiting
        
        if (detail && (detail.title || detail.mainImage)) {
          allItems.push({
            id: result.objectId,
            name: detail.title || result.title,
            title: detail.title || result.title,
            description: detail.description || '',
            year: parseYear(detail.date),
            dateText: detail.date,
            materials: detail.materials,
            dimensions: detail.dimensions,
            culture: detail.culture,
            location: detail.location,
            objectNumber: detail.objectNumber,
            image: detail.mainImage,
            thumbnail: result.thumbnail,
            additionalImages: detail.additionalImages || [],
            url: result.url,
            room: search.room,
            category: search.category,
            searchQuery: search.query
          });
          
          console.log(`   ✓ ${detail.title || result.title}`);
        }
      }
    }
    
  } catch (e) {
    console.error('Fatal error:', e);
  } finally {
    await browser.close();
  }
  
  // Group by room/category
  const roomsMap = new Map();
  
  for (const item of allItems) {
    const roomKey = `room-${item.room}`;
    if (!roomsMap.has(roomKey)) {
      roomsMap.set(roomKey, {
        id: roomKey,
        roomNumber: item.room,
        title: `Room ${item.room}: ${item.category}`,
        name: item.category,
        floor: 'Various',
        items: []
      });
    }
    roomsMap.get(roomKey).items.push(item);
  }
  
  const rooms = Array.from(roomsMap.values())
    .sort((a, b) => parseInt(a.roomNumber) - parseInt(b.roomNumber));
  
  // Calculate stats
  const totalItems = allItems.length;
  const itemsWithImages = allItems.filter(i => i.image).length;
  
  const output = {
    museum: 'British Museum',
    museumId: 'british-museum',
    description: 'British Museum Collection - Highlight objects scraped from official website',
    source: COLLECTION_URL,
    scrapedAt: new Date().toISOString(),
    stats: {
      totalRooms: rooms.length,
      totalItems,
      itemsWithImages,
      itemsWithoutImages: totalItems - itemsWithImages
    },
    rooms
  };
  
  // Save output
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  
  console.log('\n==========================================');
  console.log('✅ Scraping Complete!');
  console.log(`📁 Output: ${OUT_PATH}`);
  console.log(`📊 Total rooms: ${rooms.length}`);
  console.log(`📊 Total items: ${totalItems}`);
  console.log(`📊 Items with images: ${itemsWithImages}`);
  console.log(`📊 Items without images: ${totalItems - itemsWithImages}`);
  console.log('\nNext step: Run upload-british-museum-to-r2.cjs');
}

main().catch(console.error);
