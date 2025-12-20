#!/usr/bin/env node
/**
 * British Museum Cookie-based Scraper
 * 
 * Step 1: Open Chrome manually and go to https://www.britishmuseum.org/collection
 * Step 2: Open DevTools (F12) -> Application -> Cookies
 * Step 3: Copy the 'cf_clearance' cookie value
 * Step 4: Run this script with: node scripts/scrape-bm-with-cookies.cjs "YOUR_CF_CLEARANCE_VALUE"
 * 
 * Or export all cookies as a JSON file and place it as 'bm-cookies.json' in the project root.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_URL = 'https://www.britishmuseum.org';
const OUT_PATH = path.join(process.cwd(), 'public', 'data', 'british-museum-collection.json');

// Get cf_clearance from command line or cookies file
let CF_CLEARANCE = process.argv[2] || '';
let ALL_COOKIES = '';

// Try to load cookies from file
const cookiesFile = path.join(process.cwd(), 'bm-cookies.json');
if (fs.existsSync(cookiesFile)) {
  try {
    const cookies = JSON.parse(fs.readFileSync(cookiesFile, 'utf8'));
    ALL_COOKIES = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    console.log('✓ Loaded cookies from bm-cookies.json');
  } catch (e) {
    console.log('⚠ Could not parse bm-cookies.json');
  }
}

if (!ALL_COOKIES && CF_CLEARANCE) {
  ALL_COOKIES = `cf_clearance=${CF_CLEARANCE}`;
}

if (!ALL_COOKIES) {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  British Museum Cookie-based Scraper                             ║
╠══════════════════════════════════════════════════════════════════╣
║  Cloudflare is blocking automated access.                        ║
║  You need to provide cookies from a manual browser session.      ║
╠══════════════════════════════════════════════════════════════════╣
║  OPTION 1: Export cookies                                        ║
║  1. Install "EditThisCookie" Chrome extension                    ║
║  2. Go to https://www.britishmuseum.org/collection               ║
║  3. Click EditThisCookie icon -> Export -> Save as JSON          ║
║  4. Save file as 'bm-cookies.json' in project root               ║
║  5. Run this script again                                        ║
╠══════════════════════════════════════════════════════════════════╣
║  OPTION 2: Quick method                                          ║
║  1. Go to https://www.britishmuseum.org/collection in Chrome     ║
║  2. Open DevTools (F12) -> Application tab -> Cookies            ║
║  3. Find 'cf_clearance' cookie and copy its value                ║
║  4. Run: node scripts/scrape-bm-with-cookies.cjs "COOKIE_VALUE"  ║
╚══════════════════════════════════════════════════════════════════╝
`);
  process.exit(1);
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cookie': ALL_COOKIES,
  'Referer': 'https://www.britishmuseum.org/',
  'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"macOS"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Upgrade-Insecure-Requests': '1'
};

// Museum highlights with known object IDs
const HIGHLIGHTS = [
  // Room 4 - Egyptian Sculpture
  { id: 'Y_EA24', name: 'The Rosetta Stone', room: '4', roomTitle: 'Egyptian Sculpture' },
  { id: 'Y_EA19', name: 'Colossal Bust of Ramesses II', room: '4', roomTitle: 'Egyptian Sculpture' },
  { id: 'Y_EA10', name: 'Head of Amenhotep III', room: '4', roomTitle: 'Egyptian Sculpture' },
  
  // Rooms 6-10 - Assyrian
  { id: 'W_1851-0902-1', name: 'Human-headed Winged Bull (Lamassu)', room: '6', roomTitle: 'Assyrian Sculpture' },
  { id: 'W_1856-0909-51', name: 'Lion Hunt of Ashurbanipal', room: '10', roomTitle: 'Assyria: Lion Hunts' },
  { id: 'W_1856-0909-53', name: 'Dying Lioness Relief', room: '10', roomTitle: 'Assyria: Lion Hunts' },
  
  // Rooms 18-19 - Parthenon
  { id: 'G_1816-0610-93', name: 'Parthenon Sculptures - East Pediment', room: '18', roomTitle: 'Parthenon Galleries' },
  { id: 'G_1816-0610-98', name: 'Horse of Selene', room: '18', roomTitle: 'Parthenon Galleries' },
  
  // Room 17 - Nereid Monument
  { id: 'G_1848-1020-1', name: 'Nereid Monument', room: '17', roomTitle: 'Nereid Monument' },
  
  // Room 24 - Living and Dying
  { id: 'E_Oc1869-1005-1', name: 'Hoa Hakananai\'a (Moai)', room: '24', roomTitle: 'Living and Dying' },
  
  // Room 25 - Africa
  { id: 'E_Af1897-1011-1', name: 'Bronze Head of a Queen Mother (Benin)', room: '25', roomTitle: 'Africa' },
  
  // Room 27 - Mexico
  { id: 'E_Am-St-401', name: 'Double-headed Serpent (Aztec)', room: '27', roomTitle: 'Mexico' },
  { id: 'E_Am-St-402', name: 'Turquoise Mosaic Skull', room: '27', roomTitle: 'Mexico' },
  
  // Room 40 - Medieval Europe
  { id: 'H_1831-1101-78', name: 'Lewis Chessmen', room: '40', roomTitle: 'Medieval Europe' },
  { id: 'H_1892-0501-1', name: 'Royal Gold Cup', room: '40', roomTitle: 'Medieval Europe' },
  
  // Room 41 - Sutton Hoo
  { id: 'H_1939-1010-93', name: 'Sutton Hoo Helmet', room: '41', roomTitle: 'Sutton Hoo and Europe' },
  { id: 'H_1939-1010-1', name: 'Sutton Hoo Great Gold Buckle', room: '41', roomTitle: 'Sutton Hoo and Europe' },
  { id: 'H_1939-1010-4', name: 'Sutton Hoo Shoulder Clasps', room: '41', roomTitle: 'Sutton Hoo and Europe' },
  
  // Room 50 - Britain and Europe
  { id: 'H_1984-1002-1', name: 'Lindow Man', room: '50', roomTitle: 'Britain and Europe' },
  { id: 'H_1857-0715-1', name: 'Battersea Shield', room: '50', roomTitle: 'Britain and Europe' },
  { id: 'H_1836-0831-1', name: 'Mold Gold Cape', room: '51', roomTitle: 'Europe' },
  
  // Room 52 - Ancient Iran
  { id: 'W_1880-0617-1941', name: 'Cyrus Cylinder', room: '52', roomTitle: 'Ancient Iran' },
  { id: 'W_1897-1231-117', name: 'Oxus Treasure - Gold Armlet', room: '52', roomTitle: 'Ancient Iran' },
  
  // Rooms 55-56 - Mesopotamia
  { id: 'W_1928-1010-3', name: 'Standard of Ur', room: '56', roomTitle: 'Mesopotamia' },
  { id: 'W_1928-1010-378', name: 'Royal Game of Ur', room: '56', roomTitle: 'Mesopotamia' },
  { id: 'W_1928-1010-161', name: 'Ram in a Thicket', room: '56', roomTitle: 'Mesopotamia' },
  
  // Rooms 61-66 - Egyptian Mummies
  { id: 'Y_EA32751', name: 'Gebelein Man (Ginger)', room: '64', roomTitle: 'Egyptian Mummies' },
  { id: 'Y_EA6665', name: 'Mummy of Katebet', room: '63', roomTitle: 'Egyptian Mummies' },
  { id: 'Y_EA9901-3', name: 'Book of the Dead of Hunefer', room: '62', roomTitle: 'Egyptian Mummies' },
  
  // Room 70 - Roman Empire
  { id: 'G_1945-0927-1', name: 'Portland Vase', room: '70', roomTitle: 'Roman Empire' },
  
  // Rooms 91-94 - Japan
  { id: 'A_1906-1220-0-533', name: 'The Great Wave off Kanagawa (Hokusai)', room: '93', roomTitle: 'Japan' },
  
  // Room 95 - Chinese Ceramics
  { id: 'A_PDF-B-613', name: 'David Vases', room: '95', roomTitle: 'Chinese Ceramics' },
];

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: HEADERS
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      // Handle gzip
      if (res.headers['content-encoding'] === 'gzip') {
        const zlib = require('zlib');
        const gunzip = zlib.createGunzip();
        res.pipe(gunzip);
        gunzip.on('data', chunk => data += chunk);
        gunzip.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
        gunzip.on('error', reject);
      } else {
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
      }
    });
    
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function extractMetadata(html) {
  const getMatch = (regex) => {
    const match = html.match(regex);
    return match ? match[1].trim() : '';
  };
  
  const getMeta = (name) => {
    const regex = new RegExp(`<meta[^>]*(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i');
    const match = html.match(regex);
    if (match) return match[1];
    
    const regex2 = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']${name}["']`, 'i');
    const match2 = html.match(regex2);
    return match2 ? match2[1] : '';
  };
  
  // Title
  const title = getMeta('og:title') || getMatch(/<h1[^>]*>([^<]+)<\/h1>/i) || '';
  
  // Description
  const description = getMeta('og:description') || getMeta('description') || '';
  
  // Image
  let image = getMeta('og:image') || '';
  if (image && image.startsWith('//')) {
    image = 'https:' + image;
  }
  
  // Try to find larger image in srcset or data attributes
  const srcsetMatch = html.match(/srcset=["']([^"']+)["']/i);
  if (srcsetMatch) {
    const sources = srcsetMatch[1].split(',').map(s => {
      const parts = s.trim().split(/\s+/);
      return { url: parts[0], width: parseInt(parts[1]) || 0 };
    }).filter(s => s.url.includes('media.britishmuseum')).sort((a, b) => b.width - a.width);
    
    if (sources.length > 0 && sources[0].width > 800) {
      image = sources[0].url;
      if (image.startsWith('//')) image = 'https:' + image;
    }
  }
  
  // Extract metadata from definition lists
  const metadata = {};
  const dlMatch = html.match(/<dl[^>]*class="[^"]*object[^"]*"[^>]*>([\s\S]*?)<\/dl>/gi);
  if (dlMatch) {
    dlMatch.forEach(dl => {
      const pairs = dl.match(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi) || [];
      pairs.forEach(pair => {
        const dtMatch = pair.match(/<dt[^>]*>([\s\S]*?)<\/dt>/i);
        const ddMatch = pair.match(/<dd[^>]*>([\s\S]*?)<\/dd>/i);
        if (dtMatch && ddMatch) {
          const key = dtMatch[1].replace(/<[^>]+>/g, '').trim().toLowerCase().replace(/[:\s]+/g, '_');
          const value = ddMatch[1].replace(/<[^>]+>/g, '').trim();
          if (key && value) metadata[key] = value;
        }
      });
    });
  }
  
  return {
    title: title.replace(/\s*\|\s*British Museum.*$/i, '').trim(),
    description,
    image,
    date: metadata.date || metadata.production_date || metadata.period || '',
    materials: metadata.materials || metadata.technique || metadata.material || '',
    dimensions: metadata.dimensions || metadata.size || '',
    culture: metadata.culture || metadata.school || metadata.made_by || '',
    location: metadata.location || metadata.museum_location || '',
    objectNumber: metadata.museum_number || metadata.registration_number || '',
    findspot: metadata.findspot || metadata.excavated || '',
    metadata
  };
}

function parseYear(str) {
  if (!str) return 0;
  const bc = str.match(/(\d+)\s*(BC|BCE)/i);
  if (bc) return -parseInt(bc[1]);
  const ad = str.match(/(\d{3,4})\s*(AD|CE)?/i);
  if (ad) return parseInt(ad[1]);
  return 0;
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🏛️ British Museum Collection Scraper (Cookie-based)');
  console.log('===================================================\n');
  
  // Test the cookies first
  console.log('🔑 Testing cookies...');
  
  try {
    const testResult = await fetchPage(`${BASE_URL}/collection`);
    
    if (testResult.status === 403 || testResult.data.includes('Just a moment')) {
      console.log('❌ Cookies are invalid or expired!');
      console.log('Please get fresh cookies from your browser.\n');
      process.exit(1);
    }
    
    if (testResult.status === 200 && !testResult.data.includes('cf_chl_')) {
      console.log('✓ Cookies are valid!\n');
    } else {
      console.log('⚠ Cookies might be expired. Trying anyway...\n');
    }
  } catch (e) {
    console.log(`⚠ Test failed: ${e.message}. Trying anyway...\n`);
  }
  
  const allItems = [];
  const roomMap = new Map();
  
  console.log('📋 Fetching highlight objects...\n');
  
  for (let i = 0; i < HIGHLIGHTS.length; i++) {
    const highlight = HIGHLIGHTS[i];
    const url = `${BASE_URL}/collection/object/${highlight.id}`;
    
    process.stdout.write(`[${i + 1}/${HIGHLIGHTS.length}] ${highlight.name.substring(0, 40)}... `);
    
    try {
      const result = await fetchPage(url);
      
      if (result.status === 200 && !result.data.includes('Just a moment')) {
        const meta = extractMetadata(result.data);
        
        if (meta.title || highlight.name) {
          const item = {
            id: highlight.id,
            name: meta.title || highlight.name,
            title: meta.title || highlight.name,
            description: meta.description,
            year: parseYear(meta.date),
            dateText: meta.date,
            materials: meta.materials,
            dimensions: meta.dimensions,
            culture: meta.culture,
            location: meta.location || `Room ${highlight.room}`,
            objectNumber: meta.objectNumber,
            findspot: meta.findspot,
            image: meta.image,
            url,
            roomNumber: highlight.room,
            roomTitle: highlight.roomTitle
          };
          
          allItems.push(item);
          
          // Add to room
          if (!roomMap.has(highlight.room)) {
            roomMap.set(highlight.room, {
              id: `room-${highlight.room}`,
              roomNumber: highlight.room,
              title: `Room ${highlight.room}: ${highlight.roomTitle}`,
              name: highlight.roomTitle,
              items: []
            });
          }
          roomMap.get(highlight.room).items.push(item);
          
          console.log(`✓ ${meta.image ? '📷' : '⚠️'}`);
        } else {
          console.log('⚠ No data');
        }
      } else if (result.data.includes('Just a moment')) {
        console.log('❌ Cloudflare blocked');
      } else {
        console.log(`❌ HTTP ${result.status}`);
      }
    } catch (e) {
      console.log(`❌ ${e.message}`);
    }
    
    await delay(1500); // Rate limiting
  }
  
  // Sort rooms
  const rooms = Array.from(roomMap.values())
    .sort((a, b) => parseInt(a.roomNumber) - parseInt(b.roomNumber));
  
  // Build output
  const output = {
    museum: 'British Museum',
    museumId: 'british-museum',
    description: 'British Museum Collection - Highlight objects from official website',
    source: `${BASE_URL}/collection`,
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
  
  console.log('\n===================================================');
  console.log('✅ Scraping Complete!');
  console.log(`📁 Output: ${OUT_PATH}`);
  console.log(`📊 Rooms: ${rooms.length}`);
  console.log(`📊 Total items: ${allItems.length}`);
  console.log(`📊 With images: ${allItems.filter(i => i.image).length}`);
  console.log(`📊 Without images: ${allItems.filter(i => !i.image).length}`);
  
  if (allItems.filter(i => i.image).length > 0) {
    console.log('\n🔄 Next: Run upload-british-museum-to-r2.cjs to upload images');
  }
}

main().catch(console.error);
