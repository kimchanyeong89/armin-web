#!/usr/bin/env node
/**
 * British Museum Collection Scraper - Playwright Headful Version
 * 
 * Uses Playwright with a visible browser to bypass Cloudflare.
 * Playwright handles Cloudflare better than Puppeteer.
 * 
 * Usage: node scripts/scrape-british-museum-playwright.cjs
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE_URL = 'https://www.britishmuseum.org';
const COLLECTION_URL = `${BASE_URL}/collection`;
const OUT_PATH = path.join(process.cwd(), 'public', 'data', 'british-museum-collection.json');

// Famous highlight objects with their search terms
const HIGHLIGHTS = [
  { term: 'rosetta stone', room: '4', roomTitle: 'Egyptian Sculpture' },
  { term: 'ramesses II bust', room: '4', roomTitle: 'Egyptian Sculpture' },
  { term: 'parthenon sculptures', room: '18', roomTitle: 'Parthenon Galleries' },
  { term: 'elgin marbles', room: '18', roomTitle: 'Parthenon Galleries' },
  { term: 'sutton hoo helmet', room: '41', roomTitle: 'Sutton Hoo and Europe' },
  { term: 'sutton hoo', room: '41', roomTitle: 'Sutton Hoo and Europe' },
  { term: 'lewis chessmen', room: '40', roomTitle: 'Medieval Europe' },
  { term: 'egyptian mummy', room: '62', roomTitle: 'Egyptian Mummies' },
  { term: 'benin bronzes', room: '25', roomTitle: 'Africa' },
  { term: 'lamassu winged bull', room: '6', roomTitle: 'Assyrian Sculpture' },
  { term: 'lion hunt ashurbanipal', room: '10', roomTitle: 'Assyria: Lion Hunts' },
  { term: 'dying lioness', room: '10', roomTitle: 'Assyria: Lion Hunts' },
  { term: 'cyrus cylinder', room: '52', roomTitle: 'Ancient Iran' },
  { term: 'oxus treasure', room: '52', roomTitle: 'Ancient Iran' },
  { term: 'standard of ur', room: '56', roomTitle: 'Mesopotamia' },
  { term: 'royal game of ur', room: '56', roomTitle: 'Mesopotamia' },
  { term: 'portland vase', room: '70', roomTitle: 'Roman Empire' },
  { term: 'lindow man', room: '50', roomTitle: 'Britain and Europe' },
  { term: 'mold gold cape', room: '51', roomTitle: 'Europe' },
  { term: 'battersea shield', room: '50', roomTitle: 'Britain and Europe' },
  { term: 'aztec turquoise serpent', room: '27', roomTitle: 'Mexico' },
  { term: 'aztec skull mask', room: '27', roomTitle: 'Mexico' },
  { term: 'hoa hakananai\'a moai', room: '24', roomTitle: 'Living and Dying' },
  { term: 'amaravati sculpture', room: '33', roomTitle: 'Asia' },
  { term: 'great wave hokusai', room: '93', roomTitle: 'Japanese Galleries' },
  { term: 'david vases chinese', room: '95', roomTitle: 'Chinese Ceramics' },
  { term: 'nereid monument', room: '17', roomTitle: 'Nereid Monument' },
  { term: 'mausoleum halicarnassus', room: '21', roomTitle: 'Mausoleum of Halicarnassus' },
  { term: 'book of dead hunefer', room: '62', roomTitle: 'Egyptian Mummies' },
  { term: 'queen lyre ur', room: '56', roomTitle: 'Mesopotamia' },
  { term: 'ram thicket ur', room: '56', roomTitle: 'Mesopotamia' },
  { term: 'sekhmet statue', room: '4', roomTitle: 'Egyptian Sculpture' },
  { term: 'amenhotep III head', room: '4', roomTitle: 'Egyptian Sculpture' },
];

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForPage(page, maxWait = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const title = await page.title();
    if (!title.toLowerCase().includes('just a moment') && 
        !title.toLowerCase().includes('checking')) {
      return true;
    }
    await delay(1000);
    process.stdout.write('.');
  }
  return false;
}

async function scrollAndWait(page) {
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await delay(300);
  }
}

async function scrapeSearch(page, searchTerm, roomInfo) {
  const url = `${COLLECTION_URL}/search?keyword=${encodeURIComponent(searchTerm)}&on_display=true&view=grid&sort=relevance`;
  
  try {
    console.log(`\n🔍 Searching: "${searchTerm}"`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await delay(3000);
    await waitForPage(page, 10000);
    await scrollAndWait(page);
    
    // Get search results
    const results = await page.evaluate(() => {
      const items = [];
      
      // Find all object links
      const links = document.querySelectorAll('a[href*="/collection/object/"]');
      const seen = new Set();
      
      links.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;
        
        const objectId = href.split('/object/')[1]?.split(/[/?#]/)[0];
        if (!objectId || seen.has(objectId)) return;
        seen.add(objectId);
        
        // Find associated image and title
        const container = link.closest('article, .card, .result, li, div[class*="result"]') || link;
        const img = container.querySelector('img') || link.querySelector('img');
        const titleEl = container.querySelector('h2, h3, h4, [class*="title"]') || link;
        
        items.push({
          objectId,
          url: `https://www.britishmuseum.org${href.startsWith('/') ? href : '/' + href}`,
          title: titleEl?.textContent?.trim() || '',
          thumbnail: img?.src || img?.getAttribute('data-src') || ''
        });
      });
      
      return items.slice(0, 3); // Top 3 per search
    });
    
    console.log(`   Found ${results.length} results`);
    return results.map(r => ({ ...r, ...roomInfo }));
    
  } catch (e) {
    console.log(`   ⚠ Failed: ${e.message}`);
    return [];
  }
}

async function scrapeObjectPage(page, obj) {
  console.log(`   → Details: ${obj.objectId}`);
  
  try {
    await page.goto(obj.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await delay(2000);
    await waitForPage(page, 8000);
    await scrollAndWait(page);
    
    const detail = await page.evaluate(() => {
      const getText = (sel) => document.querySelector(sel)?.textContent?.trim() || '';
      const getAttr = (sel, attr) => document.querySelector(sel)?.getAttribute(attr) || '';
      
      // Title
      const title = getText('h1') || getAttr('meta[property="og:title"]', 'content');
      
      // Description
      const description = getText('.object-detail__description, [class*="description"]') || 
                          getAttr('meta[name="description"]', 'content') ||
                          getAttr('meta[property="og:description"]', 'content');
      
      // Main image - find the best one
      let mainImage = '';
      
      // Try OG image first (usually good quality)
      mainImage = getAttr('meta[property="og:image"]', 'content');
      
      // Look for main object image
      if (!mainImage) {
        const imgEl = document.querySelector('.object-detail__image img, main img[src*="collection"], [class*="object"] img');
        if (imgEl) {
          // Check for srcset for higher res
          const srcset = imgEl.getAttribute('srcset');
          if (srcset) {
            const sources = srcset.split(',').map(s => {
              const parts = s.trim().split(/\s+/);
              return { url: parts[0], width: parseInt(parts[1]) || 0 };
            }).sort((a, b) => b.width - a.width);
            mainImage = sources[0]?.url || '';
          }
          if (!mainImage) {
            mainImage = imgEl.src || imgEl.getAttribute('data-src') || '';
          }
        }
      }
      
      // Get metadata
      const metadata = {};
      document.querySelectorAll('dt').forEach(dt => {
        const dd = dt.nextElementSibling;
        if (dd?.tagName === 'DD') {
          const key = dt.textContent.trim().toLowerCase().replace(/[:\s]+/g, '_').replace(/_+$/, '');
          metadata[key] = dd.textContent.trim();
        }
      });
      
      // Extract common fields
      const findValue = (...keys) => {
        for (const key of keys) {
          const found = Object.entries(metadata).find(([k]) => k.includes(key));
          if (found) return found[1];
        }
        return '';
      };
      
      return {
        title,
        description,
        mainImage: mainImage?.startsWith('//') ? `https:${mainImage}` : mainImage,
        date: findValue('date', 'period', 'production'),
        materials: findValue('material', 'technique', 'medium'),
        dimensions: findValue('dimension', 'size', 'measurement'),
        culture: findValue('culture', 'made', 'origin', 'school'),
        location: findValue('location', 'gallery', 'room'),
        objectNumber: findValue('museum_number', 'registration', 'accession'),
        findspot: findValue('findspot', 'excavated', 'found'),
        metadata
      };
    });
    
    return detail;
    
  } catch (e) {
    console.log(`   ⚠ Detail failed: ${e.message}`);
    return null;
  }
}

function parseYear(str) {
  if (!str) return 0;
  
  // BC/BCE dates
  const bc = str.match(/(\d+)\s*(BC|BCE)/i);
  if (bc) return -parseInt(bc[1]);
  
  // AD/CE dates or plain years
  const ad = str.match(/(\d{3,4})\s*(AD|CE)?/i);
  if (ad) return parseInt(ad[1]);
  
  // Century
  const cent = str.match(/(\d+)(?:st|nd|rd|th)\s*century\s*(BC|BCE)?/i);
  if (cent) {
    const c = parseInt(cent[1]);
    return cent[2] ? -(c * 100 - 50) : (c * 100 - 50);
  }
  
  return 0;
}

async function main() {
  console.log('🏛️ British Museum Collection Scraper (Playwright)');
  console.log('================================================');
  console.log('A browser will open. If CAPTCHA appears, solve it manually.');
  console.log('');
  
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 }
  });
  
  const page = await context.newPage();
  
  // Hide automation indicators
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  
  const allItems = [];
  const seenIds = new Set();
  
  try {
    // Step 1: Navigate to main site and pass Cloudflare
    console.log('\n📋 Step 1: Accessing British Museum...\n');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    console.log('⏳ Waiting for Cloudflare...');
    const passed = await waitForPage(page, 45000);
    
    if (!passed) {
      console.log('\n\n⚠ Cloudflare challenge detected!');
      console.log('Please solve the CAPTCHA in the browser window.');
      console.log('Press Enter when done...');
      
      await new Promise(resolve => {
        process.stdin.setRawMode?.(true);
        process.stdin.resume();
        process.stdin.once('data', () => {
          process.stdin.setRawMode?.(false);
          resolve();
        });
      });
    }
    
    console.log('\n✓ Access granted!\n');
    await delay(2000);
    
    // Step 2: Search for highlights
    console.log('📋 Step 2: Collecting highlight objects...\n');
    
    for (const highlight of HIGHLIGHTS) {
      const results = await scrapeSearch(page, highlight.term, {
        roomNumber: highlight.room,
        roomTitle: highlight.roomTitle
      });
      
      for (const result of results) {
        if (seenIds.has(result.objectId)) continue;
        seenIds.add(result.objectId);
        
        const detail = await scrapeObjectPage(page, result);
        await delay(2000);
        
        if (detail && (detail.title || result.title)) {
          allItems.push({
            id: result.objectId,
            name: detail.title || result.title,
            title: detail.title || result.title,
            description: detail.description || '',
            year: parseYear(detail.date),
            dateText: detail.date || '',
            materials: detail.materials || '',
            dimensions: detail.dimensions || '',
            culture: detail.culture || '',
            location: detail.location || '',
            findspot: detail.findspot || '',
            objectNumber: detail.objectNumber || '',
            image: detail.mainImage || result.thumbnail || '',
            thumbnail: result.thumbnail || '',
            url: result.url,
            roomNumber: result.roomNumber,
            roomTitle: result.roomTitle
          });
          
          console.log(`   ✓ ${(detail.title || result.title).substring(0, 50)}...`);
        }
      }
      
      await delay(1500);
    }
    
    console.log(`\n✓ Total collected: ${allItems.length} items`);
    
  } catch (e) {
    console.error('\n❌ Error:', e.message);
  }
  
  // Organize by room
  const roomMap = new Map();
  
  for (const item of allItems) {
    const roomId = item.roomNumber || 'highlights';
    
    if (!roomMap.has(roomId)) {
      roomMap.set(roomId, {
        id: `room-${roomId}`,
        roomNumber: roomId,
        title: item.roomTitle ? `Room ${roomId}: ${item.roomTitle}` : 'Highlights',
        name: item.roomTitle || 'Museum Highlights',
        items: []
      });
    }
    
    roomMap.get(roomId).items.push(item);
  }
  
  // Sort rooms by room number
  const rooms = Array.from(roomMap.values())
    .sort((a, b) => {
      if (a.roomNumber === 'highlights') return -1;
      if (b.roomNumber === 'highlights') return 1;
      return parseInt(a.roomNumber) - parseInt(b.roomNumber);
    });
  
  // Build output
  const output = {
    museum: 'British Museum',
    museumId: 'british-museum',
    description: 'British Museum Collection - Highlight objects from official website',
    source: COLLECTION_URL,
    scrapedAt: new Date().toISOString(),
    stats: {
      totalRooms: rooms.length,
      totalItems: allItems.length,
      itemsWithImages: allItems.filter(i => i.image).length,
      itemsWithoutImages: allItems.filter(i => !i.image).length
    },
    rooms
  };
  
  // Save
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  
  console.log('\n================================================');
  console.log('✅ Scraping Complete!');
  console.log(`📁 Output: ${OUT_PATH}`);
  console.log(`📊 Rooms: ${rooms.length}`);
  console.log(`📊 Total items: ${allItems.length}`);
  console.log(`📊 With images: ${allItems.filter(i => i.image).length}`);
  console.log(`📊 Without images: ${allItems.filter(i => !i.image).length}`);
  
  console.log('\n🔄 Next: Run upload-british-museum-to-r2.cjs to upload images');
  
  console.log('\nClosing browser in 3 seconds...');
  await delay(3000);
  await browser.close();
}

main().catch(console.error);
