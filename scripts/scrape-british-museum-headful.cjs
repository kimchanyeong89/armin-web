#!/usr/bin/env node
/**
 * British Museum Collection Scraper - Headful Browser Version
 * 
 * Uses a visible browser window to bypass Cloudflare protection.
 * The browser will open, you may need to solve a CAPTCHA if prompted,
 * then the scraper will collect data automatically.
 * 
 * Usage: node scripts/scrape-british-museum-headful.cjs
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const BASE_URL = 'https://www.britishmuseum.org';
const COLLECTION_URL = `${BASE_URL}/collection`;
const OUT_PATH = path.join(process.cwd(), 'public', 'data', 'british-museum-collection.json');

// Known gallery rooms with their official slugs
const GALLERIES = [
  { id: '4', slug: 'room-4-egyptian-sculpture', title: 'Egyptian Sculpture' },
  { id: '6', slug: 'room-6-assyria-nimrud', title: 'Assyria: Nimrud' },
  { id: '7', slug: 'room-7-assyria-nineveh', title: 'Assyria: Nineveh' },
  { id: '8', slug: 'room-8-assyria-khorsabad', title: 'Assyria: Khorsabad' },
  { id: '9', slug: 'room-9-assyria-nineveh', title: 'Assyria: Nineveh (Cont.)' },
  { id: '10', slug: 'room-10-assyria-lion-hunts', title: 'Assyria: Lion Hunts' },
  { id: '18', slug: 'room-18-greece-parthenon', title: 'Greece: Parthenon' },
  { id: '24', slug: 'room-24-living-and-dying', title: 'Living and Dying' },
  { id: '25', slug: 'room-25-africa', title: 'Africa' },
  { id: '27', slug: 'room-27-mexico', title: 'Mexico' },
  { id: '33', slug: 'room-33-china-south-asia', title: 'China, South Asia' },
  { id: '40', slug: 'room-40-medieval-europe', title: 'Medieval Europe' },
  { id: '41', slug: 'room-41-sutton-hoo', title: 'Sutton Hoo' },
  { id: '52', slug: 'room-52-ancient-iran', title: 'Ancient Iran' },
  { id: '55', slug: 'room-55-mesopotamia', title: 'Mesopotamia' },
  { id: '56', slug: 'room-56-mesopotamia', title: 'Mesopotamia' },
  { id: '61', slug: 'room-61-egypt-mummies', title: 'Egyptian Mummies' },
  { id: '62', slug: 'room-62-egypt-mummies', title: 'Egyptian Mummies' },
  { id: '63', slug: 'room-63-egypt-mummies', title: 'Egyptian Mummies' },
  { id: '91', slug: 'room-91-japan', title: 'Japan' },
  { id: '95', slug: 'room-95-chinese-ceramics', title: 'Chinese Ceramics' },
];

// Famous objects to search for directly
const HIGHLIGHT_SEARCHES = [
  'rosetta stone',
  'parthenon sculptures',
  'elgin marbles',
  'sutton hoo helmet',
  'lewis chessmen',
  'egyptian mummy',
  'benin bronzes',
  'assyrian lion hunt',
  'lamassu',
  'cyrus cylinder',
  'standard of ur',
  'portland vase',
  'lindow man',
  'aztec serpent',
  'hoa hakananai moai',
  'amaravati',
  'mold gold cape',
  'great wave hokusai',
  'david vases'
];

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForCloudflare(page) {
  console.log('⏳ Waiting for Cloudflare challenge...');
  
  // Wait for the challenge to complete
  let attempts = 0;
  while (attempts < 30) {
    const title = await page.title();
    if (!title.includes('Just a moment')) {
      console.log('✓ Cloudflare passed!');
      return true;
    }
    await delay(2000);
    attempts++;
    process.stdout.write('.');
  }
  
  console.log('\n⚠ Cloudflare challenge timeout - please solve CAPTCHA if visible');
  return false;
}

async function scrollPage(page, times = 5) {
  for (let i = 0; i < times; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await delay(500);
  }
}

async function scrapeSearchResults(page, searchTerm) {
  const searchUrl = `${COLLECTION_URL}/search?keyword=${encodeURIComponent(searchTerm)}&on_display=true&view=grid&perPage=20`;
  console.log(`\n🔍 Searching: "${searchTerm}"`);
  
  try {
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await delay(2000);
    await scrollPage(page, 3);
    
    const objects = await page.evaluate(() => {
      const items = [];
      
      // Look for object cards/links
      document.querySelectorAll('.search-results__result, .object-card, [class*="result"], a[href*="/collection/object/"]').forEach(el => {
        const link = el.tagName === 'A' ? el : el.querySelector('a[href*="/collection/object/"]');
        if (!link) return;
        
        const href = link.getAttribute('href');
        const img = el.querySelector('img');
        const titleEl = el.querySelector('h2, h3, [class*="title"], .object-card__title');
        
        if (href) {
          const objectId = href.split('/object/')[1]?.split('/')[0]?.split('?')[0];
          if (objectId && !items.find(i => i.objectId === objectId)) {
            items.push({
              objectId,
              url: href.startsWith('http') ? href : `https://www.britishmuseum.org${href}`,
              title: titleEl?.textContent?.trim() || img?.getAttribute('alt') || '',
              thumbnail: img?.getAttribute('src') || img?.getAttribute('data-src') || ''
            });
          }
        }
      });
      
      return items.slice(0, 5); // Top 5 per search
    });
    
    console.log(`   Found ${objects.length} objects`);
    return objects;
    
  } catch (e) {
    console.log(`   ⚠ Search failed: ${e.message}`);
    return [];
  }
}

async function scrapeObjectDetail(page, objectUrl, objectId) {
  console.log(`   → Getting details: ${objectId}`);
  
  try {
    await page.goto(objectUrl, { waitUntil: 'networkidle2', timeout: 45000 });
    await delay(1500);
    await scrollPage(page, 2);
    
    const detail = await page.evaluate(() => {
      // Get title
      const titleEl = document.querySelector('h1, .object-detail__title, [class*="object-title"]');
      const title = titleEl?.textContent?.trim() || '';
      
      // Get description
      const descEl = document.querySelector('.object-detail__description, [class*="description"], meta[name="description"]');
      const description = descEl?.textContent?.trim() || descEl?.getAttribute('content') || '';
      
      // Get main image - look for the largest image
      let mainImage = '';
      
      // Try to find high-res image
      const imgSources = [];
      document.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
        const srcset = img.getAttribute('srcset') || '';
        if (src && (src.includes('/collection/') || src.includes('britishmuseum'))) {
          imgSources.push(src);
        }
        if (srcset) {
          srcset.split(',').forEach(s => {
            const url = s.trim().split(' ')[0];
            if (url) imgSources.push(url);
          });
        }
      });
      
      // Get largest image
      if (imgSources.length > 0) {
        // Prefer larger sizes
        const sorted = imgSources.sort((a, b) => {
          const getSize = (url) => {
            const match = url.match(/(\d+)w|_(\d+)\./);
            return match ? parseInt(match[1] || match[2]) : 0;
          };
          return getSize(b) - getSize(a);
        });
        mainImage = sorted[0];
      }
      
      // Also try OG image
      const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
      if (!mainImage && ogImage) {
        mainImage = ogImage;
      }
      
      // Get metadata from page
      const metadata = {};
      
      // Look for definition list metadata
      document.querySelectorAll('dl dt, .object-detail__meta dt, [class*="metadata"] dt').forEach(dt => {
        const dd = dt.nextElementSibling;
        if (dd && dd.tagName === 'DD') {
          const key = dt.textContent.trim().toLowerCase().replace(/[:\s]+/g, '_');
          metadata[key] = dd.textContent.trim();
        }
      });
      
      // Look for labeled fields
      document.querySelectorAll('[class*="field"], [class*="meta-item"]').forEach(field => {
        const label = field.querySelector('[class*="label"], dt, strong');
        const value = field.querySelector('[class*="value"], dd, span:last-child');
        if (label && value) {
          const key = label.textContent.trim().toLowerCase().replace(/[:\s]+/g, '_');
          metadata[key] = value.textContent.trim();
        }
      });
      
      return {
        title,
        description,
        mainImage: mainImage?.startsWith('//') ? `https:${mainImage}` : mainImage,
        date: metadata.date || metadata.production_date || metadata.period || '',
        materials: metadata.materials || metadata.material || metadata.technique || '',
        dimensions: metadata.dimensions || metadata.size || '',
        culture: metadata.culture || metadata.made_by || metadata.origin || '',
        location: metadata.location || metadata.museum_location || metadata.gallery || '',
        objectNumber: metadata.museum_number || metadata.registration_number || '',
        metadata
      };
    });
    
    return detail;
    
  } catch (e) {
    console.log(`   ⚠ Detail failed: ${e.message}`);
    return null;
  }
}

function parseYear(dateStr) {
  if (!dateStr) return 0;
  
  const bcMatch = dateStr.match(/(\d+)\s*(BC|BCE)/i);
  if (bcMatch) return -parseInt(bcMatch[1]);
  
  const adMatch = dateStr.match(/(\d{3,4})\s*(AD|CE)?/i);
  if (adMatch) return parseInt(adMatch[1]);
  
  const centuryMatch = dateStr.match(/(\d+)(?:st|nd|rd|th)\s*century\s*(BC|BCE)?/i);
  if (centuryMatch) {
    const century = parseInt(centuryMatch[1]);
    return centuryMatch[2] ? -(century * 100 - 50) : (century * 100 - 50);
  }
  
  return 0;
}

async function main() {
  console.log('🏛️ British Museum Collection Scraper (Headful)');
  console.log('=============================================');
  console.log('A browser window will open. If you see a CAPTCHA, please solve it.');
  console.log('');
  
  const browser = await puppeteer.launch({
    headless: false, // IMPORTANT: Opens visible browser
    defaultViewport: { width: 1440, height: 900 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1440,900'
    ]
  });
  
  const page = await browser.newPage();
  
  // Set realistic user agent
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  // Avoid detection
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  });
  
  const allItems = [];
  const seenObjects = new Set();
  
  try {
    // First, visit the main page to pass Cloudflare
    console.log('\n📋 Step 1: Passing Cloudflare protection...\n');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    
    const passed = await waitForCloudflare(page);
    if (!passed) {
      console.log('\n⚠ Please solve the CAPTCHA in the browser window, then press Enter to continue...');
      await new Promise(resolve => {
        process.stdin.once('data', resolve);
      });
    }
    
    await delay(2000);
    
    // Step 2: Search for highlights
    console.log('\n📋 Step 2: Searching for highlight objects...\n');
    
    for (const searchTerm of HIGHLIGHT_SEARCHES) {
      const results = await scrapeSearchResults(page, searchTerm);
      
      for (const obj of results) {
        if (seenObjects.has(obj.objectId)) continue;
        seenObjects.add(obj.objectId);
        
        const detail = await scrapeObjectDetail(page, obj.url, obj.objectId);
        await delay(1500);
        
        if (detail && detail.title) {
          allItems.push({
            id: obj.objectId,
            name: detail.title,
            title: detail.title,
            description: detail.description,
            year: parseYear(detail.date),
            dateText: detail.date,
            materials: detail.materials,
            dimensions: detail.dimensions,
            culture: detail.culture,
            location: detail.location,
            objectNumber: detail.objectNumber,
            image: detail.mainImage,
            thumbnail: obj.thumbnail,
            url: obj.url,
            searchTerm
          });
          console.log(`   ✓ Added: ${detail.title.substring(0, 50)}...`);
        }
      }
      
      await delay(2000);
    }
    
    console.log(`\n✓ Collected ${allItems.length} highlight objects`);
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  
  // Organize by location/room
  const roomMap = new Map();
  
  for (const item of allItems) {
    const roomId = item.location ? 
      item.location.match(/Room\s*(\d+)/i)?.[1] || 'highlights' : 
      'highlights';
    
    if (!roomMap.has(roomId)) {
      roomMap.set(roomId, {
        id: `room-${roomId}`,
        roomNumber: roomId,
        title: roomId === 'highlights' ? 'Museum Highlights' : `Room ${roomId}`,
        items: []
      });
    }
    roomMap.get(roomId).items.push(item);
  }
  
  const rooms = Array.from(roomMap.values());
  
  // Build output
  const output = {
    museum: 'British Museum',
    museumId: 'british-museum',
    description: 'British Museum Collection - Highlight objects scraped from official website',
    source: COLLECTION_URL,
    scrapedAt: new Date().toISOString(),
    stats: {
      totalRooms: rooms.length,
      totalItems: allItems.length,
      itemsWithImages: allItems.filter(i => i.image).length
    },
    rooms
  };
  
  // Save
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  
  console.log('\n=============================================');
  console.log('✅ Scraping Complete!');
  console.log(`📁 Output: ${OUT_PATH}`);
  console.log(`📊 Total items: ${allItems.length}`);
  console.log(`📊 Items with images: ${allItems.filter(i => i.image).length}`);
  
  console.log('\nClosing browser in 5 seconds...');
  await delay(5000);
  await browser.close();
}

main().catch(console.error);
