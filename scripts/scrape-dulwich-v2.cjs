/**
 * Dulwich Picture Gallery Collection Scraper v2
 * 상세 페이지에서 Artist, Date, Room 정보를 제대로 파싱
 * 규칙 파일: docs/ARCHIVE_RULES.md
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.dulwichpicturegallery.org.uk';
const COLLECTION_URL = '/explore/explore-the-collection/';
const OUTPUT_FILE = path.join(__dirname, '../public/data/dulwich-collection.json');
const TOTAL_PAGES = 14;

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Extract attribute value by name (Artist, Date, etc.)
// Note: Dulwich uses "attribute-vale" (typo in their HTML)
function extractAttribute(html, attrName) {
  const regex = new RegExp(
    `<p class="c-collection-item__attribute-name">${attrName}</p>\\s*<p class="c-collection-item__attribute-vale">([^<]+)</p>`,
    'i'
  );
  const match = html.match(regex);
  return match ? match[1].trim() : '';
}

// Extract room info from callout box
function extractRoom(html) {
  const roomMatch = html.match(/<p class="c-callout-box__room">in Room (\d+)<\/p>/i);
  return roomMatch ? `Room ${roomMatch[1]}` : null;
}

// Extract title from title tag
function extractTitle(html) {
  const titleMatch = html.match(/<title>([^<|]+)/);
  if (!titleMatch) return '';
  return titleMatch[1].trim().replace(/\s*[—–-]\s*Dulwich Picture Gallery$/i, '');
}

// Extract main image from page
function extractImage(html) {
  // Look for high-res image first (width-1800)
  const highRes = html.match(/src="(https:\/\/assets\.dulwich-gallery\.substrakt\.net\/images\/[^"]+\.width-1800\.[^"]+)"/);
  if (highRes) return highRes[1];
  
  // Fallback to width-800
  const medRes = html.match(/src="(https:\/\/assets\.dulwich-gallery\.substrakt\.net\/images\/[^"]+\.width-800\.[^"]+)"/);
  if (medRes) return medRes[1];
  
  // Any image from assets
  const anyImg = html.match(/src="(https:\/\/assets\.dulwich-gallery\.substrakt\.net\/images\/[^"]+\.(jpg|jpeg|png|webp))"/i);
  if (anyImg) return anyImg[1];
  
  return null;
}

// Extract description from meta tag
function extractDescription(html) {
  const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
  return descMatch ? descMatch[1] : '';
}

// Get all artwork links from a page
function extractArtworkLinks(html) {
  const regex = /href="(\/explore\/explore-the-collection\/[^"?]+)"/g;
  const links = new Set();
  let match;
  while ((match = regex.exec(html)) !== null) {
    // Skip the main collection page link
    if (match[1] !== '/explore/explore-the-collection/') {
      links.add(match[1]);
    }
  }
  return Array.from(links);
}

// Parse year from date string (e.g., "1645", "c. 1650", "1640-1645")
function parseYear(dateStr) {
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{4})/);
  if (match) {
    const year = parseInt(match[1]);
    if (year >= 1200 && year <= 2025) return year;
  }
  return null;
}

async function scrapeArtwork(slug) {
  const url = `${BASE_URL}${slug}`;
  try {
    const html = await httpsGet(url);
    
    // Extract all fields from detail page
    const title = extractTitle(html);
    const artist = extractAttribute(html, 'Artist');
    const dateStr = extractAttribute(html, 'Date');
    const year = parseYear(dateStr);
    const room = extractRoom(html);
    const image = extractImage(html);
    const description = extractDescription(html);
    const dimensions = extractAttribute(html, 'Dimensions');
    const materials = extractAttribute(html, 'Materials');
    const accessionNumber = extractAttribute(html, 'Accession number');
    
    // Rule 2: Skip if no image
    if (!image) {
      console.log(`  ⚠️ No image: ${title}`);
      return null;
    }
    
    // Generate ID from slug
    const id = slug.replace('/explore/explore-the-collection/', '').replace(/\/$/, '');
    
    return {
      id,
      title,
      artist: artist || 'Unknown',
      year,
      dateStr,
      room,
      image,
      description,
      dimensions,
      materials,
      accessionNumber,
      url
    };
  } catch (err) {
    console.error(`  ❌ Error: ${slug} - ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('🎨 Dulwich Picture Gallery Collection Scraper v2');
  console.log('📋 Following rules from: docs/ARCHIVE_RULES.md');
  console.log('✨ Now extracting: Artist, Date, Room, Dimensions, Materials\n');
  
  const allLinks = new Set();
  
  // Step 1: Collect all artwork links from all pages
  console.log('📄 Collecting artwork links from all pages...');
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const pageUrl = `${BASE_URL}${COLLECTION_URL}?search=&artist=&subject=&period=&country=&display_status=all&page=${page}`;
    console.log(`  Page ${page}/${TOTAL_PAGES}...`);
    
    try {
      const html = await httpsGet(pageUrl);
      const links = extractArtworkLinks(html);
      links.forEach(link => allLinks.add(link));
      await delay(300);
    } catch (err) {
      console.error(`  ❌ Error on page ${page}: ${err.message}`);
    }
  }
  
  console.log(`\n📊 Found ${allLinks.size} unique artwork links\n`);
  
  // Step 2: Scrape each artwork page
  const artworks = [];
  const linksArray = Array.from(allLinks);
  
  // Rule 5: ID-based duplicate detection
  const seenIds = new Set();
  
  for (let i = 0; i < linksArray.length; i++) {
    const slug = linksArray[i];
    const id = slug.replace('/explore/explore-the-collection/', '').replace(/\/$/, '');
    
    // Skip duplicates by ID
    if (seenIds.has(id)) {
      console.log(`[${i + 1}/${linksArray.length}] ⏭️ Duplicate: ${id}`);
      continue;
    }
    seenIds.add(id);
    
    console.log(`[${i + 1}/${linksArray.length}] Scraping: ${id}`);
    
    const artwork = await scrapeArtwork(slug);
    if (artwork) {
      artworks.push(artwork);
      // Show extracted info
      console.log(`  ✅ ${artwork.title}`);
      console.log(`     Artist: ${artwork.artist || 'Unknown'} | Year: ${artwork.year || 'N/A'} | Room: ${artwork.room || 'N/A'}`);
    }
    
    // Be polite to the server
    await delay(200);
  }
  
  // Stats
  const withArtist = artworks.filter(a => a.artist && a.artist !== 'Unknown').length;
  const withYear = artworks.filter(a => a.year).length;
  const withRoom = artworks.filter(a => a.room).length;
  
  console.log('\n📊 Scraping Complete:');
  console.log(`  Total artworks: ${artworks.length}`);
  console.log(`  With artist: ${withArtist} (${Math.round(withArtist/artworks.length*100)}%)`);
  console.log(`  With year: ${withYear} (${Math.round(withYear/artworks.length*100)}%)`);
  console.log(`  With room: ${withRoom} (${Math.round(withRoom/artworks.length*100)}%)`);
  
  // Save to file
  const output = {
    museum: 'Dulwich Picture Gallery',
    museumId: 'dulwich-picture-gallery',
    collectionName: 'Dulwich Picture Gallery Collection',
    location: 'Gallery Road, Dulwich Village, London SE21 7AD',
    scrapedAt: new Date().toISOString(),
    totalObjects: artworks.length,
    coverImage: artworks[0]?.image || null,
    objects: artworks
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\n💾 Saved to: ${OUTPUT_FILE}`);
}

main().catch(console.error);
