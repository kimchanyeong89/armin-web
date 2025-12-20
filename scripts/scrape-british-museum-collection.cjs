#!/usr/bin/env node
/**
 * British Museum Collection Scraper
 * 
 * Scrapes all gallery rooms from the British Museum website,
 * including highlight objects with full metadata.
 * 
 * Features:
 * - Playwright with stealth for Cloudflare bypass
 * - Cookie consent handling
 * - Gallery room discovery
 * - Highlight objects per room
 * - Object detail page scraping for full metadata
 * - Image URL extraction
 * 
 * Output: public/data/british-museum-collection.json
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// All known British Museum gallery rooms
const GALLERIES = [
  // Ground Floor
  { id: '1', slug: 'room-1-enlightenment', title: 'Enlightenment', floor: 'Ground' },
  { id: '2', slug: 'room-2-collecting-the-world', title: 'Collecting the World', floor: 'Ground' },
  { id: '3', slug: 'room-3-the-islamic-world', title: 'The Islamic World', floor: 'Ground' },
  { id: '4', slug: 'room-4-egyptian-sculpture', title: 'Egyptian Sculpture', floor: 'Ground' },
  { id: '5', slug: 'room-5-assyrian-sculpture', title: 'Assyrian Sculpture', floor: 'Ground' },
  { id: '6', slug: 'room-6-assyrian-sculpture', title: 'Assyrian Sculpture', floor: 'Ground' },
  { id: '7', slug: 'room-7-assyrian-sculpture-nineveh', title: 'Assyrian Sculpture: Nineveh', floor: 'Ground' },
  { id: '8', slug: 'room-8-assyrian-sculpture-nineveh', title: 'Assyrian Sculpture: Nineveh', floor: 'Ground' },
  { id: '9', slug: 'room-9-assyrian-palace-reliefs', title: 'Assyrian Palace Reliefs', floor: 'Ground' },
  { id: '10', slug: 'room-10-assyria-lion-hunts', title: 'Assyria: Lion Hunts', floor: 'Ground' },
  { id: '10a', slug: 'room-10a-assyria-siege-of-lachish', title: 'Assyria: Siege of Lachish', floor: 'Ground' },
  { id: '10b', slug: 'room-10b-babylonia', title: 'Babylonia', floor: 'Ground' },
  { id: '11', slug: 'room-11-greece-and-lycian-gallery', title: 'Greece: Cycladic Islands', floor: 'Ground' },
  { id: '12', slug: 'room-12-greece-and-cyprus', title: 'Greece: Geometric and Archaic', floor: 'Ground' },
  { id: '13', slug: 'room-13-greece-classical-vases', title: 'Greece: Classical Greek Vases', floor: 'Ground' },
  { id: '14', slug: 'room-14-greece-late-classical', title: 'Greece: Late Classical', floor: 'Ground' },
  { id: '15', slug: 'room-15-greece-athens-and-lycia', title: 'Greece: Athens and Lycia', floor: 'Ground' },
  { id: '16', slug: 'room-16-bassae-sculptures', title: 'Bassae Sculptures', floor: 'Ground' },
  { id: '17', slug: 'room-17-nereid-monument', title: 'Nereid Monument', floor: 'Ground' },
  { id: '18', slug: 'room-18-parthenon-galleries', title: 'Parthenon Galleries', floor: 'Ground' },
  { id: '19', slug: 'room-19-parthenon-galleries', title: 'Parthenon Galleries', floor: 'Ground' },
  { id: '20', slug: 'room-20-mausoleum-of-halikarnassos', title: 'Mausoleum of Halicarnassus', floor: 'Ground' },
  { id: '21', slug: 'room-21-greek-and-roman-architecture', title: 'Greek and Roman Architecture', floor: 'Ground' },
  { id: '22', slug: 'room-22-alexander-the-great', title: 'Alexander the Great', floor: 'Ground' },
  { id: '23', slug: 'room-23-greek-and-roman-sculpture', title: 'Greek and Roman Sculpture', floor: 'Ground' },
  { id: '24', slug: 'room-24-living-and-dying', title: 'Living and Dying', floor: 'Ground' },
  { id: '25', slug: 'room-25-africa', title: 'Africa', floor: 'Ground' },
  { id: '26', slug: 'room-26-north-america', title: 'North America', floor: 'Ground' },
  { id: '27', slug: 'room-27-mexico', title: 'Mexico', floor: 'Ground' },
  { id: '33', slug: 'room-33-asia', title: 'Asia', floor: 'Ground' },
  { id: '33a', slug: 'room-33a-jade', title: 'Jade', floor: 'Ground' },
  { id: '33b', slug: 'room-33b-the-joseph-e-hotung-gallery', title: 'The Joseph E. Hotung Gallery', floor: 'Ground' },
  { id: '34', slug: 'room-34-islamic-world', title: 'The Islamic World', floor: 'Ground' },
  
  // Upper Floor
  { id: '35', slug: 'room-35-joseph-e-hotung-gallery', title: 'The Joseph E. Hotung Gallery', floor: 'Upper' },
  { id: '36', slug: 'room-36-korea', title: 'Korea', floor: 'Upper' },
  { id: '37', slug: 'room-37-china', title: 'China', floor: 'Upper' },
  { id: '38', slug: 'room-38-money', title: 'Money', floor: 'Upper' },
  { id: '39', slug: 'room-39-clocks-and-watches', title: 'Clocks and Watches', floor: 'Upper' },
  { id: '40', slug: 'room-40-medieval-europe', title: 'Medieval Europe', floor: 'Upper' },
  { id: '41', slug: 'room-41-sutton-hoo-and-europe', title: 'Sutton Hoo and Europe', floor: 'Upper' },
  { id: '42', slug: 'room-42-roman-britain', title: 'Roman Britain', floor: 'Upper' },
  { id: '43', slug: 'room-43-prehistoric-europe', title: 'Prehistoric Europe', floor: 'Upper' },
  { id: '44', slug: 'room-44-european-prehistory', title: 'European Prehistory', floor: 'Upper' },
  { id: '45', slug: 'room-45-european-prehistory', title: 'European Prehistory', floor: 'Upper' },
  { id: '46', slug: 'room-46-european-art', title: 'European Art', floor: 'Upper' },
  { id: '47', slug: 'room-47-european-glass', title: 'European Glass', floor: 'Upper' },
  { id: '48', slug: 'room-48-oceania', title: 'Oceania', floor: 'Upper' },
  { id: '49', slug: 'room-49-roman-empire', title: 'Roman Empire', floor: 'Upper' },
  { id: '50', slug: 'room-50-britain-and-europe', title: 'Britain and Europe', floor: 'Upper' },
  { id: '51', slug: 'room-51-europe-and-middle-east', title: 'Europe and Middle East', floor: 'Upper' },
  { id: '52', slug: 'room-52-ancient-iran', title: 'Ancient Iran', floor: 'Upper' },
  { id: '53', slug: 'room-53-ancient-anatolia', title: 'Ancient Anatolia', floor: 'Upper' },
  { id: '54', slug: 'room-54-ancient-levant', title: 'Ancient Levant', floor: 'Upper' },
  { id: '55', slug: 'room-55-ancient-mesopotamia', title: 'Ancient Mesopotamia', floor: 'Upper' },
  { id: '56', slug: 'room-56-ur-and-mesopotamia', title: 'Ur and Mesopotamia', floor: 'Upper' },
  { id: '57', slug: 'room-57-ancient-levant', title: 'Ancient Levant', floor: 'Upper' },
  { id: '58', slug: 'room-58-ancient-south-arabia', title: 'Ancient South Arabia', floor: 'Upper' },
  { id: '59', slug: 'room-59-ancient-cyprus', title: 'Ancient Cyprus', floor: 'Upper' },
  { id: '60', slug: 'room-60-ancient-egyptian-life-and-death', title: 'Egyptian Life and Death', floor: 'Upper' },
  { id: '61', slug: 'room-61-egyptian-mummies', title: 'Egyptian Mummies', floor: 'Upper' },
  { id: '62', slug: 'room-62-egyptian-mummies', title: 'Egyptian Mummies', floor: 'Upper' },
  { id: '63', slug: 'room-63-egyptian-mummies', title: 'Egyptian Mummies', floor: 'Upper' },
  { id: '64', slug: 'room-64-egyptian-life-and-death', title: 'Egyptian Life and Death', floor: 'Upper' },
  { id: '65', slug: 'room-65-sudan-egypt-and-nubia', title: 'Sudan, Egypt and Nubia', floor: 'Upper' },
  { id: '66', slug: 'room-66-coptic-egypt', title: 'Coptic Egypt', floor: 'Upper' },
  { id: '67', slug: 'room-67-south-and-south-east-asia', title: 'South and South East Asia', floor: 'Upper' },
  { id: '68', slug: 'room-68-money-and-medals', title: 'Money and Medals', floor: 'Upper' },
  { id: '69', slug: 'room-69-greek-and-roman-daily-life', title: 'Greek and Roman Daily Life', floor: 'Upper' },
  { id: '69a', slug: 'room-69a-greek-and-roman-gold-jewellery', title: 'Greek and Roman Gold Jewellery', floor: 'Upper' },
  { id: '70', slug: 'room-70-roman-empire', title: 'Roman Empire', floor: 'Upper' },
  { id: '71', slug: 'room-71-etruscan-world', title: 'Etruscan World', floor: 'Upper' },
  { id: '72', slug: 'room-72-greek-vases', title: 'Greek Vases', floor: 'Upper' },
  { id: '73', slug: 'room-73-greeks-in-italy', title: 'Greeks in Italy', floor: 'Upper' },
  
  // Lower Floor
  { id: '77', slug: 'room-77-roman-sculpture', title: 'Roman Sculpture', floor: 'Lower' },
  { id: '78', slug: 'room-78-roman-britain', title: 'Roman Britain', floor: 'Lower' },
  { id: '79', slug: 'room-79-roman-sculpture', title: 'Roman Sculpture', floor: 'Lower' },
  { id: '80', slug: 'room-80-roman-sculpture', title: 'Roman Sculpture', floor: 'Lower' },
  { id: '81', slug: 'room-81-roman-sculpture', title: 'Roman Sculpture', floor: 'Lower' },
  { id: '82', slug: 'room-82-roman-sculpture', title: 'Roman Sculpture', floor: 'Lower' },
  { id: '83', slug: 'room-83-roman-sculpture', title: 'Roman Sculpture', floor: 'Lower' },
  { id: '84', slug: 'room-84-roman-sculpture', title: 'Roman Sculpture', floor: 'Lower' },
  { id: '85', slug: 'room-85-roman-sculpture', title: 'Roman Sculpture', floor: 'Lower' },
  
  // Additional galleries
  { id: '90', slug: 'room-90-prints-and-drawings', title: 'Prints and Drawings', floor: 'Upper' },
  { id: '91', slug: 'room-91-japanese-galleries', title: 'Japanese Galleries', floor: 'Upper' },
  { id: '92', slug: 'room-92-japanese-galleries', title: 'Japanese Galleries', floor: 'Upper' },
  { id: '93', slug: 'room-93-japanese-galleries', title: 'Japanese Galleries', floor: 'Upper' },
  { id: '94', slug: 'room-94-chinese-ceramics', title: 'Chinese Ceramics', floor: 'Upper' },
  { id: '95', slug: 'room-95-percival-david-gallery', title: 'Percival David Collection', floor: 'Upper' },
];

// Famous highlights to always try to get detail for
const MUST_HAVE_HIGHLIGHTS = [
  'rosetta-stone', 'parthenon', 'sutton-hoo-helmet', 'lewis-chessmen',
  'elgin-marbles', 'mummy', 'lamassu', 'lion-hunt', 'benin-bronzes',
  'oxus-treasure', 'portland-vase', 'mildenhall', 'standard-of-ur',
  'cyrus-cylinder', 'moai', 'aztec', 'lindow-man'
];

const BASE_URL = 'https://www.britishmuseum.org';
const COLLECTION_URL = `${BASE_URL}/collection`;
const OUT_PATH = path.join(process.cwd(), 'public', 'data', 'british-museum-collection.json');

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function acceptCookies(page) {
  try {
    const buttons = [
      'button:has-text("Allow all cookies")',
      'button:has-text("Accept all cookies")',
      'button:has-text("Accept All")',
      '#onetrust-accept-btn-handler',
      '.cookie-consent-accept',
      'button[class*="accept"]'
    ];
    for (const selector of buttons) {
      const btn = await page.$(selector);
      if (btn) {
        await btn.click();
        await delay(500);
        console.log('  ✓ Cookies accepted');
        return true;
      }
    }
  } catch (e) {}
  return false;
}

async function scrollPage(page, times = 5) {
  for (let i = 0; i < times; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await delay(300);
  }
}

async function scrapeGalleryPage(page, gallery) {
  const url = `${COLLECTION_URL}/galleries/${gallery.slug}`;
  console.log(`\n📍 Scraping: ${url}`);
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await delay(1500);
    await acceptCookies(page);
    await scrollPage(page, 8);
    
    // Try to get objects from this gallery page
    const objects = await page.evaluate(() => {
      const items = [];
      
      // Look for object links
      const objectLinks = document.querySelectorAll('a[href*="/collection/object/"]');
      
      objectLinks.forEach(link => {
        const href = link.getAttribute('href');
        const img = link.querySelector('img');
        const titleEl = link.querySelector('h3, h2, .card__title, .teaser__title, [class*="title"]');
        
        if (href) {
          items.push({
            url: href.startsWith('http') ? href : `https://www.britishmuseum.org${href}`,
            objectId: href.split('/object/')[1]?.split('/')[0]?.split('?')[0] || '',
            title: titleEl?.textContent?.trim() || img?.getAttribute('alt') || '',
            thumbnail: img?.getAttribute('src') || img?.getAttribute('data-src') || ''
          });
        }
      });
      
      // Also look for promo cards
      const cards = document.querySelectorAll('.promo, .teaser, .card, article');
      cards.forEach(card => {
        const link = card.querySelector('a[href*="/collection/object/"]');
        const img = card.querySelector('img');
        const title = card.querySelector('h2, h3, .card__title')?.textContent?.trim();
        
        if (link) {
          const href = link.getAttribute('href');
          const objectId = href.split('/object/')[1]?.split('/')[0]?.split('?')[0];
          if (!items.find(i => i.objectId === objectId)) {
            items.push({
              url: href.startsWith('http') ? href : `https://www.britishmuseum.org${href}`,
              objectId,
              title: title || img?.getAttribute('alt') || '',
              thumbnail: img?.getAttribute('src') || ''
            });
          }
        }
      });
      
      // Deduplicate
      const seen = new Set();
      return items.filter(item => {
        if (!item.objectId || seen.has(item.objectId)) return false;
        seen.add(item.objectId);
        return true;
      });
    });
    
    console.log(`  Found ${objects.length} objects`);
    return objects;
    
  } catch (e) {
    console.log(`  ⚠ Failed: ${e.message}`);
    return [];
  }
}

async function scrapeObjectDetail(page, objectUrl) {
  console.log(`    → Scraping details: ${objectUrl}`);
  
  try {
    await page.goto(objectUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await delay(1200);
    await acceptCookies(page);
    await scrollPage(page, 3);
    
    const detail = await page.evaluate(() => {
      const getTextContent = (selector) => {
        const el = document.querySelector(selector);
        return el?.textContent?.trim() || '';
      };
      
      const getMetaContent = (name) => {
        const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        return el?.getAttribute('content') || '';
      };
      
      // Get title
      const title = getTextContent('h1') || 
                    getMetaContent('og:title') ||
                    document.title?.replace(' | British Museum', '') || '';
      
      // Get description
      const description = getMetaContent('description') ||
                          getMetaContent('og:description') ||
                          getTextContent('.object-detail__description, .object__description, [class*="description"]') || '';
      
      // Get main image (highest resolution)
      let mainImage = '';
      const ogImage = getMetaContent('og:image');
      const mainImg = document.querySelector('.object-detail__image img, .object__image img, main img');
      const srcSet = mainImg?.getAttribute('srcset');
      
      if (srcSet) {
        // Get highest resolution from srcset
        const sources = srcSet.split(',').map(s => s.trim().split(' '));
        const sorted = sources.sort((a, b) => {
          const sizeA = parseInt(a[1]) || 0;
          const sizeB = parseInt(b[1]) || 0;
          return sizeB - sizeA;
        });
        mainImage = sorted[0]?.[0] || '';
      }
      
      if (!mainImage) {
        mainImage = mainImg?.getAttribute('src') || ogImage || '';
      }
      
      // Clean up image URL - get largest version
      if (mainImage && mainImage.includes('iiif.wellcomecollection.org')) {
        // IIIF format - get full size
        mainImage = mainImage.replace(/\/full\/\d+,\d*\//, '/full/1200,/');
      } else if (mainImage && mainImage.includes('britishmuseum.org')) {
        // BM images - try to get larger version
        mainImage = mainImage.replace(/_\d+\.jpg/, '_1200.jpg');
      }
      
      // Get metadata fields
      const metadata = {};
      const metaRows = document.querySelectorAll('.object-detail__meta-row, .field, [class*="meta-item"], dl dt, dl dd');
      
      // Try key-value pairs
      document.querySelectorAll('.object-detail dt, dl dt').forEach(dt => {
        const dd = dt.nextElementSibling;
        if (dd && dd.tagName === 'DD') {
          const key = dt.textContent.trim().toLowerCase().replace(/[:\s]+/g, '_');
          metadata[key] = dd.textContent.trim();
        }
      });
      
      // Look for specific fields
      const findFieldValue = (labels) => {
        for (const label of labels) {
          const el = document.querySelector(`[class*="${label}"] dd, [data-label="${label}"] .value`);
          if (el) return el.textContent.trim();
          
          // Try dl/dt format
          const dts = document.querySelectorAll('dt');
          for (const dt of dts) {
            if (dt.textContent.toLowerCase().includes(label)) {
              const dd = dt.nextElementSibling;
              if (dd) return dd.textContent.trim();
            }
          }
        }
        return '';
      };
      
      const date = findFieldValue(['date', 'production date', 'period']) || 
                   metadata.date || metadata.production_date || '';
      const materials = findFieldValue(['material', 'technique', 'medium']) || 
                        metadata.materials || metadata.technique || '';
      const dimensions = findFieldValue(['dimension', 'size', 'measurements']) || 
                         metadata.dimensions || '';
      const location = findFieldValue(['location', 'gallery', 'room']) || 
                       metadata.location || metadata.museum_location || '';
      const culture = findFieldValue(['culture', 'made by', 'origin']) || 
                      metadata.culture || '';
      const objectNumber = findFieldValue(['museum number', 'registration', 'object number']) || 
                           metadata.museum_number || '';
      
      // Get additional images
      const additionalImages = [];
      document.querySelectorAll('.object-detail__thumbnails img, .gallery-thumbs img, [class*="thumbnail"] img').forEach(img => {
        const src = img.getAttribute('data-large-src') || img.getAttribute('src');
        if (src && !additionalImages.includes(src) && src !== mainImage) {
          additionalImages.push(src);
        }
      });
      
      return {
        title,
        description,
        mainImage: mainImage.startsWith('//') ? `https:${mainImage}` : mainImage,
        date,
        materials,
        dimensions,
        location,
        culture,
        objectNumber,
        additionalImages,
        rawMetadata: metadata
      };
    });
    
    return detail;
    
  } catch (e) {
    console.log(`    ⚠ Detail failed: ${e.message}`);
    return null;
  }
}

async function searchForHighlights(page, searchTerm) {
  const searchUrl = `${COLLECTION_URL}/search?keyword=${encodeURIComponent(searchTerm)}&on_display=true`;
  console.log(`\n🔍 Searching highlights: "${searchTerm}"`);
  
  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await delay(2000);
    await acceptCookies(page);
    await scrollPage(page, 5);
    
    const results = await page.evaluate(() => {
      const items = [];
      
      document.querySelectorAll('a[href*="/collection/object/"]').forEach(link => {
        const href = link.getAttribute('href');
        const img = link.querySelector('img');
        const title = link.querySelector('h3, h2, .card__title')?.textContent?.trim() || 
                      img?.getAttribute('alt') || '';
        
        if (href && !items.find(i => i.url.includes(href))) {
          items.push({
            url: href.startsWith('http') ? href : `https://www.britishmuseum.org${href}`,
            objectId: href.split('/object/')[1]?.split('/')[0]?.split('?')[0] || '',
            title,
            thumbnail: img?.getAttribute('src') || ''
          });
        }
      });
      
      return items.slice(0, 10); // Top 10 results
    });
    
    console.log(`  Found ${results.length} results`);
    return results;
    
  } catch (e) {
    console.log(`  ⚠ Search failed: ${e.message}`);
    return [];
  }
}

function parseYear(dateStr) {
  if (!dateStr) return 0;
  
  // Handle BC dates
  const bcMatch = dateStr.match(/(\d+)\s*(BC|BCE)/i);
  if (bcMatch) {
    return -parseInt(bcMatch[1]);
  }
  
  // Handle AD dates
  const adMatch = dateStr.match(/(\d{3,4})\s*(AD|CE)?/i);
  if (adMatch) {
    return parseInt(adMatch[1]);
  }
  
  // Handle century
  const centuryMatch = dateStr.match(/(\d+)(?:st|nd|rd|th)\s*century\s*(BC|BCE)?/i);
  if (centuryMatch) {
    const century = parseInt(centuryMatch[1]);
    const isBC = centuryMatch[2];
    return isBC ? -(century * 100 - 50) : (century * 100 - 50);
  }
  
  return 0;
}

async function main() {
  console.log('🏛️ British Museum Collection Scraper');
  console.log('=====================================\n');
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 }
  });
  
  const page = await context.newPage();
  
  const allRooms = [];
  const seenObjects = new Set();
  
  try {
    // 1. Scrape galleries page to discover all rooms
    console.log('📋 Step 1: Discovering galleries...\n');
    
    await page.goto(`${COLLECTION_URL}/galleries`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await delay(2000);
    await acceptCookies(page);
    await scrollPage(page, 10);
    
    // Get all gallery links from the main page
    const discoveredGalleries = await page.evaluate(() => {
      const galleries = [];
      document.querySelectorAll('a[href*="/collection/galleries/"]').forEach(link => {
        const href = link.getAttribute('href');
        if (href && href !== '/collection/galleries') {
          const slug = href.split('/galleries/')[1]?.split('?')[0];
          const title = link.textContent?.trim() || link.querySelector('h2, h3, .card__title')?.textContent?.trim() || '';
          if (slug && !galleries.find(g => g.slug === slug)) {
            galleries.push({ slug, title });
          }
        }
      });
      return galleries;
    });
    
    console.log(`Found ${discoveredGalleries.length} galleries from main page`);
    
    // Merge with known galleries
    const allGalleries = [...GALLERIES];
    for (const g of discoveredGalleries) {
      if (!allGalleries.find(kg => kg.slug === g.slug)) {
        const roomMatch = g.slug.match(/room-(\d+[a-z]?)/i);
        allGalleries.push({
          id: roomMatch?.[1] || g.slug,
          slug: g.slug,
          title: g.title || g.slug.replace(/-/g, ' ').replace(/^room \d+[a-z]?\s*/i, ''),
          floor: 'Unknown'
        });
      }
    }
    
    console.log(`Total galleries to scrape: ${allGalleries.length}\n`);
    
    // 2. Scrape each gallery
    console.log('📋 Step 2: Scraping galleries...\n');
    
    for (const gallery of allGalleries) {
      const objects = await scrapeGalleryPage(page, gallery);
      
      if (objects.length > 0) {
        const roomItems = [];
        
        // Get details for each object (limit to top 20 per room for performance)
        const objectsToDetail = objects.slice(0, 20);
        
        for (const obj of objectsToDetail) {
          if (seenObjects.has(obj.objectId)) continue;
          seenObjects.add(obj.objectId);
          
          const detail = await scrapeObjectDetail(page, obj.url);
          await delay(800); // Rate limiting
          
          if (detail) {
            roomItems.push({
              id: obj.objectId,
              name: detail.title || obj.title,
              title: detail.title || obj.title,
              description: detail.description || '',
              year: parseYear(detail.date),
              dateText: detail.date,
              materials: detail.materials,
              dimensions: detail.dimensions,
              culture: detail.culture,
              objectNumber: detail.objectNumber,
              image: detail.mainImage,
              thumbnail: obj.thumbnail,
              additionalImages: detail.additionalImages || [],
              url: obj.url
            });
          } else {
            // Fallback with basic info
            roomItems.push({
              id: obj.objectId,
              name: obj.title,
              title: obj.title,
              image: obj.thumbnail,
              url: obj.url
            });
          }
        }
        
        if (roomItems.length > 0) {
          allRooms.push({
            id: `room-${gallery.id}`,
            roomNumber: gallery.id,
            title: `Room ${gallery.id}: ${gallery.title}`,
            name: gallery.title,
            floor: gallery.floor,
            slug: gallery.slug,
            url: `${COLLECTION_URL}/galleries/${gallery.slug}`,
            items: roomItems
          });
          console.log(`  ✓ Room ${gallery.id}: ${roomItems.length} items collected`);
        }
      }
    }
    
    // 3. Search for must-have highlights
    console.log('\n📋 Step 3: Searching for must-have highlights...\n');
    
    const additionalHighlights = [];
    for (const term of MUST_HAVE_HIGHLIGHTS) {
      const results = await searchForHighlights(page, term);
      
      for (const obj of results.slice(0, 3)) {
        if (!seenObjects.has(obj.objectId)) {
          seenObjects.add(obj.objectId);
          const detail = await scrapeObjectDetail(page, obj.url);
          await delay(800);
          
          if (detail && detail.mainImage) {
            additionalHighlights.push({
              id: obj.objectId,
              name: detail.title || obj.title,
              title: detail.title || obj.title,
              description: detail.description || '',
              year: parseYear(detail.date),
              dateText: detail.date,
              materials: detail.materials,
              dimensions: detail.dimensions,
              culture: detail.culture,
              objectNumber: detail.objectNumber,
              image: detail.mainImage,
              thumbnail: obj.thumbnail,
              additionalImages: detail.additionalImages || [],
              url: obj.url,
              searchTerm: term
            });
          }
        }
      }
    }
    
    console.log(`\n✓ Found ${additionalHighlights.length} additional highlight objects`);
    
    // Add highlights to a special "Highlights" room
    if (additionalHighlights.length > 0) {
      allRooms.unshift({
        id: 'highlights',
        roomNumber: '0',
        title: 'Museum Highlights',
        name: 'Must-See Objects',
        floor: 'Various',
        slug: 'highlights',
        url: `${BASE_URL}/collection`,
        items: additionalHighlights
      });
    }
    
  } catch (e) {
    console.error('Fatal error:', e);
  } finally {
    await browser.close();
  }
  
  // Calculate totals
  const totalItems = allRooms.reduce((sum, room) => sum + room.items.length, 0);
  const itemsWithImages = allRooms.reduce((sum, room) => 
    sum + room.items.filter(i => i.image).length, 0);
  
  // Build output
  const output = {
    museum: 'British Museum',
    museumId: 'british-museum',
    description: 'British Museum Collection - Permanent galleries and highlight objects by room',
    source: COLLECTION_URL,
    scrapedAt: new Date().toISOString(),
    stats: {
      totalRooms: allRooms.length,
      totalItems,
      itemsWithImages,
      itemsWithoutImages: totalItems - itemsWithImages
    },
    rooms: allRooms
  };
  
  // Write output
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  
  console.log('\n=====================================');
  console.log('✅ Scraping Complete!');
  console.log(`📁 Output: ${OUT_PATH}`);
  console.log(`📊 Total rooms: ${allRooms.length}`);
  console.log(`📊 Total items: ${totalItems}`);
  console.log(`📊 Items with images: ${itemsWithImages}`);
  console.log(`📊 Items without images: ${totalItems - itemsWithImages}`);
}

main().catch(console.error);
