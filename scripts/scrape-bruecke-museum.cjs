/**
 * Deutsche Digitale Bibliothek (DDB) - Brücke-Museum Berlin Scraper
 * 
 * Scrapes the Brücke-Museum collection from DDB
 * - Total: ~1,755 artworks
 * - Uses IIIF image server
 * - Provider ID: 3KXQ5XC4EJ73TJ4TNOZ73IOYV27X4XXC
 * 
 * Collects ALL available metadata:
 * - title, artist, date (Entstanden)
 * - medium (Material/Technik), dimensions (Maße)
 * - category (Objekttyp: Gemälde, Zeichnung, Druckgrafik, Aquarell)
 * - inventoryNumber, location (Standort)
 * - copyright, license, image dimensions
 * - description, related works
 */

const fs = require('fs');
const path = require('path');

// Configuration
const PROVIDER_ID = '3KXQ5XC4EJ73TJ4TNOZ73IOYV27X4XXC';
const BASE_URL = 'https://www.deutsche-digitale-bibliothek.de';
const SEARCH_URL = `${BASE_URL}/searchresults`;
const ROWS_PER_PAGE = 100;
const DELAY_MS = 250;
const OUTPUT_FILE = path.join(__dirname, '../public/data/bruecke-museum-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/bruecke-museum-progress.json');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const decodeHtmlEntities = (str) => {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#92;/g, '\\')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
};

const cleanText = (str) => {
  if (!str) return '';
  return str
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/Mehr anzeigen|Weniger anzeigen/g, '')
    .trim();
};

// Load/save progress
const loadProgress = () => {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (e) {}
  return { itemIds: [], artworks: [], offset: 0 };
};

const saveProgress = (progress) => {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
};

// Fetch item IDs from search results
const fetchItemIds = async (offset = 0) => {
  const url = `${SEARCH_URL}?query=&offset=${offset}&rows=${ROWS_PER_PAGE}&facetValues%5B%5D=provider_id%3D${PROVIDER_ID}&isThumbnailFiltered=false`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const idMatches = html.matchAll(/item\/([A-Z0-9]{32})/g);
    return [...new Set([...idMatches].map(m => m[1]))];
  } catch (error) {
    console.error(`Error fetching offset ${offset}:`, error.message);
    return [];
  }
};

// Fetch all item IDs
const fetchAllItemIds = async (progress) => {
  console.log('\n📋 Phase 1: Collecting all item IDs...');
  
  const allIds = new Set(progress.itemIds || []);
  let offset = progress.offset || 0;
  let consecutiveEmpty = 0;
  
  while (consecutiveEmpty < 3 && offset <= 2000) {
    const ids = await fetchItemIds(offset);
    
    if (ids.length === 0) {
      consecutiveEmpty++;
    } else {
      consecutiveEmpty = 0;
      ids.forEach(id => allIds.add(id));
    }
    
    console.log(`  Offset ${offset}: ${ids.length} items, total: ${allIds.size}`);
    
    offset += ROWS_PER_PAGE;
    progress.offset = offset;
    progress.itemIds = [...allIds];
    saveProgress(progress);
    
    await delay(DELAY_MS);
  }
  
  console.log(`✅ Collected ${allIds.size} unique item IDs`);
  return [...allIds];
};

// Parse artwork data from item page - comprehensive extraction
const parseArtworkPage = (html, itemId) => {
  const artwork = {
    id: itemId,
    title: '',
    artist: '',
    artistLifeDates: '',
    date: '',
    medium: '',
    dimensions: '',
    category: '',
    inventoryNumber: '',
    otherNumbers: '',
    location: '',
    copyright: '',
    license: '',
    licenseUrl: '',
    description: '',
    provider: '',
    imageUrl: '',
    thumbnailUrl: '',
    imageWidth: null,
    imageHeight: null,
    detailUrl: `${BASE_URL}/item/${itemId}`,
    source: 'Brücke-Museum Berlin'
  };
  
  // 1. Title from og:title
  const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
  if (titleMatch) artwork.title = decodeHtmlEntities(titleMatch[1]);
  
  // 2. Image from og:image with dimensions
  const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
  if (imageMatch) {
    artwork.imageUrl = imageMatch[1];
    artwork.thumbnailUrl = artwork.imageUrl.replace('/full/full/', '/full/!800,800/');
  }
  
  const widthMatch = html.match(/<meta property="og:image:width" content="(\d+)"/);
  const heightMatch = html.match(/<meta property="og:image:height" content="(\d+)"/);
  if (widthMatch) artwork.imageWidth = parseInt(widthMatch[1]);
  if (heightMatch) artwork.imageHeight = parseInt(heightMatch[1]);
  
  // 3. IIIF data - artist and better image URLs
  const iiifMatch = html.match(/iiif-data="([^"]+)"/);
  if (iiifMatch) {
    try {
      const decoded = decodeHtmlEntities(iiifMatch[1]);
      const iiifData = JSON.parse(decoded);
      
      if (Array.isArray(iiifData) && iiifData[0]) {
        const data = iiifData[0];
        
        // Artist from author field
        if (data.author) {
          const authorMatch = data.author.match(/Urheber\*in:\s*([^/\n]+)/);
          if (authorMatch) {
            let artistName = authorMatch[1].replace(/\s+/g, ' ').trim();
            // Clean up format: "LastName, FirstName" -> "FirstName LastName"
            const nameParts = artistName.split(',').map(s => s.trim());
            if (nameParts.length === 2 && nameParts[1].length > 1) {
              artwork.artist = `${nameParts[1]} ${nameParts[0]}`;
            } else {
              artwork.artist = artistName;
            }
          }
        }
        
        // Better image URLs
        if (data.full?.uri) artwork.imageUrl = data.full.uri;
        if (data.preview?.uri) artwork.thumbnailUrl = data.preview.uri;
        if (data.width) artwork.imageWidth = data.width;
        if (data.height) artwork.imageHeight = data.height;
        
        // License info
        if (data.licenseInformation) {
          artwork.license = data.licenseInformation.text || '';
          artwork.licenseUrl = data.licenseInformation.url || '';
        }
      }
    } catch (e) {}
  }
  
  // 4. Artist from person link (with life dates)
  if (!artwork.artist) {
    const personMatch = html.match(/<a[^>]+class="[^"]*person[^"]*"[^>]*>([^<]+)\s*\((\d{4})\s*[-–]\s*(\d{4})\)[^<]*,\s*Künstler/);
    if (personMatch) {
      artwork.artist = personMatch[1].trim();
      artwork.artistLifeDates = `${personMatch[2]}-${personMatch[3]}`;
    }
  }
  
  // Also try to get life dates separately
  const lifeDatesMatch = html.match(/class="[^"]*person[^"]*"[^>]*>[^<]+\((\d{4})\s*[-–]\s*(\d{4})\)/);
  if (lifeDatesMatch && !artwork.artistLifeDates) {
    artwork.artistLifeDates = `${lifeDatesMatch[1]}-${lifeDatesMatch[2]}`;
  }
  
  // 5. Category (Objekttyp) - from core data
  const categoryMatch = html.match(/Objekttyp[\s\S]*?<li class="label-core-value">([^<]+)<\/li>/);
  if (categoryMatch) artwork.category = cleanText(categoryMatch[1]);
  
  // 6. Date (Entstanden) - from core data
  const dateMatch = html.match(/Entstanden[\s\S]*?<li class="label-core-value">([^<]+)<\/li>/);
  if (dateMatch) artwork.date = cleanText(dateMatch[1]);
  
  // 7. Provider (Datenpartner)
  const providerMatch = html.match(/Datenpartner[\s\S]*?<li class="label-core-value">([^<]+)<\/li>/);
  if (providerMatch) artwork.provider = cleanText(providerMatch[1]);
  
  // 8. Material/Technik (medium)
  const mediumMatch = html.match(/Material\/Technik<\/dt>[\s\S]*?<dd[^>]*>([\s\S]*?)<\/dd>/);
  if (mediumMatch) {
    const mediumHtml = mediumMatch[1];
    const spans = mediumHtml.match(/<span>([^<]+)<\/span>/g);
    if (spans) {
      artwork.medium = spans.map(s => cleanText(s.replace(/<[^>]+>/g, ''))).join('; ');
    }
  }
  
  // 9. Maße (dimensions)
  const dimMatch = html.match(/Maße<\/dt>[\s\S]*?<dd[^>]*>([\s\S]*?)<\/dd>/);
  if (dimMatch) {
    const dimHtml = dimMatch[1];
    const spans = dimHtml.match(/<span>([^<]+)<\/span>/g);
    if (spans) {
      artwork.dimensions = spans.map(s => cleanText(s.replace(/<[^>]+>/g, ''))).join('; ');
    }
  }
  
  // 10. Inventarnummer
  const invMatch = html.match(/Inventarnummer<\/dt>[\s\S]*?<dd[^>]*>\s*([^<\n]+)/);
  if (invMatch) artwork.inventoryNumber = cleanText(invMatch[1]);
  
  // 11. Weitere Nummer(n)
  const otherNumMatch = html.match(/Weitere Nummer\(n\)<\/dt>[\s\S]*?<dd[^>]*>([\s\S]*?)<\/dd>/);
  if (otherNumMatch) artwork.otherNumbers = cleanText(otherNumMatch[1]);
  
  // 12. Standort (location)
  const locMatch = html.match(/Standort<\/dt>[\s\S]*?<dd[^>]*>\s*([^<\n]+)/);
  if (locMatch) artwork.location = cleanText(locMatch[1]);
  
  // 13. Copyright from rights span
  const rightsMatch = html.match(/<span class="[^"]*item:rights[^"]*">([^<]+)<\/span>/);
  if (rightsMatch) artwork.copyright = cleanText(rightsMatch[1]);
  
  // 14. Rechteinformation (license info)
  const rechtMatch = html.match(/Rechteinformation<\/dt>[\s\S]*?<dd[^>]*>([\s\S]*?)<\/dd>/);
  if (rechtMatch && !artwork.license) {
    artwork.license = cleanText(rechtMatch[1]);
  }
  
  // 15. Description - look for any descriptive text
  const descMatch = html.match(/Beschreibung[\s\S]*?<dd[^>]*>([\s\S]*?)<\/dd>/);
  if (descMatch) artwork.description = cleanText(descMatch[1]);
  
  return artwork;
};

// Fetch single item details
const fetchItemDetails = async (itemId) => {
  const url = `${BASE_URL}/item/${itemId}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    return parseArtworkPage(html, itemId);
  } catch (error) {
    console.error(`Error fetching ${itemId}:`, error.message);
    return null;
  }
};

// Main
const scrape = async () => {
  console.log('🎨 Brücke-Museum Berlin (DDB) Scraper');
  console.log('=====================================');
  console.log('Collecting ALL available metadata\n');
  
  let progress = loadProgress();
  
  // Phase 1: Collect all item IDs
  if (!progress.itemIds || progress.itemIds.length < 1700) {
    progress.itemIds = await fetchAllItemIds(progress);
  } else {
    console.log(`📋 Using cached ${progress.itemIds.length} item IDs`);
  }
  
  const itemIds = progress.itemIds;
  const existingIds = new Set((progress.artworks || []).map(a => a.id));
  const toFetch = itemIds.filter(id => !existingIds.has(id));
  
  console.log(`\n🖼️  Phase 2: Fetching artwork details...`);
  console.log(`   Total: ${itemIds.length}, Already: ${existingIds.size}, Remaining: ${toFetch.length}\n`);
  
  const artworks = progress.artworks || [];
  let processed = 0;
  let valid = 0;
  
  for (const itemId of toFetch) {
    const artwork = await fetchItemDetails(itemId);
    
    if (artwork && artwork.title && artwork.imageUrl) {
      artworks.push(artwork);
      valid++;
    }
    
    processed++;
    
    if (processed % 50 === 0) {
      console.log(`   ${processed}/${toFetch.length} processed (${valid} valid)`);
      progress.artworks = artworks;
      saveProgress(progress);
    }
    
    await delay(DELAY_MS);
  }
  
  progress.artworks = artworks;
  saveProgress(progress);
  
  const validArtworks = artworks.filter(a => a.imageUrl && a.title);
  
  console.log(`\n✅ Complete! ${validArtworks.length} artworks`);
  
  // Stats
  const stats = {
    total: validArtworks.length,
    withDate: validArtworks.filter(a => a.date).length,
    withMedium: validArtworks.filter(a => a.medium).length,
    withDimensions: validArtworks.filter(a => a.dimensions).length,
    withCategory: validArtworks.filter(a => a.category).length,
    categories: {}
  };
  
  validArtworks.forEach(a => {
    const cat = a.category || 'Unknown';
    stats.categories[cat] = (stats.categories[cat] || 0) + 1;
  });
  
  console.log('\n📊 Statistics:');
  console.log(`   With date: ${stats.withDate}`);
  console.log(`   With medium: ${stats.withMedium}`);
  console.log(`   With dimensions: ${stats.withDimensions}`);
  console.log(`   With category: ${stats.withCategory}`);
  console.log('\n📂 Categories:');
  Object.entries(stats.categories).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
    console.log(`   ${cat}: ${count}`);
  });
  
  // Sample artwork
  const sample = validArtworks.find(a => a.date && a.medium && a.category);
  if (sample) {
    console.log('\n🔍 Sample artwork:');
    console.log(JSON.stringify(sample, null, 2));
  }
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(validArtworks, null, 2));
  console.log(`\n💾 Saved to ${OUTPUT_FILE}`);
  
  return validArtworks;
};

scrape().catch(console.error);
