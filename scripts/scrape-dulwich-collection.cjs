/**
 * Dulwich Picture Gallery Collection Scraper
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

// Parse artist full name and year from title tag
// Format: "Title | Artist Full Name | Dulwich Picture Gallery"
// Or: "Title — Dulwich Picture Gallery" (no artist in title)
function parseTitle(html) {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  if (!titleMatch) return { title: '', artist: '', year: null };
  
  const parts = titleMatch[1].split('|').map(p => p.trim());
  // Remove " — Dulwich Picture Gallery" from title if present
  let artworkTitle = parts[0] || '';
  artworkTitle = artworkTitle.replace(/\s*[—–-]\s*Dulwich Picture Gallery$/i, '').trim();
  
  // Artist is second part (before "Dulwich Picture Gallery")
  let artist = '';
  if (parts.length >= 2 && !parts[1].includes('Dulwich Picture Gallery')) {
    artist = parts[1].trim();
  }
  
  // If no artist in title, try to extract from HTML body
  if (!artist) {
    // Look for artist in the collection item attributes
    const artistMatch = html.match(/<p class="c-collection-item__attribute-name">Artist<\/p>\s*<p[^>]*>([^<]+)<\/p>/i);
    if (artistMatch) {
      artist = artistMatch[1].trim();
    }
    // Also try from description mentioning "by the ... artist"
    if (!artist) {
      const descArtist = html.match(/by the[^.]*artist\s+([A-Z][a-z]+(?:\s+[A-Za-z]+)*)\s*\(/);
      if (descArtist) {
        artist = descArtist[1].trim();
      }
    }
  }
  
  // Extract year from description meta tag
  const descMatch = html.match(/name="description"\s+content="[^"]*?(\b1[0-9]{3}\b|\b20[0-2][0-9]\b)[^"]*?"/i);
  let year = null;
  if (descMatch) {
    const possibleYear = parseInt(descMatch[1]);
    if (possibleYear >= 1200 && possibleYear <= 2025) {
      year = possibleYear;
    }
  }
  
  return { title: artworkTitle, artist, year };
}

// Extract room info from page
function extractRoom(html) {
  const roomMatch = html.match(/<p class="c-callout-box__room">in Room (\d+)<\/p>/i);
  return roomMatch ? `Room ${roomMatch[1]}` : null;
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
  const anyImg = html.match(/src="(https:\/\/assets\.dulwich-gallery\.substrakt\.net\/images\/[^"]+\.(jpg|jpeg|png))"/);
  if (anyImg) return anyImg[1];
  
  return null;
}

// Extract description
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

async function scrapeArtwork(slug) {
  const url = `${BASE_URL}${slug}`;
  try {
    const html = await httpsGet(url);
    const { title, artist, year } = parseTitle(html);
    const image = extractImage(html);
    const description = extractDescription(html);
    const room = extractRoom(html);
    
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
      artist,
      year,
      room,
      image,
      description,
      url
    };
  } catch (err) {
    console.error(`  ❌ Error: ${slug} - ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('🎨 Dulwich Picture Gallery Collection Scraper');
  console.log('📋 Following rules from: docs/ARCHIVE_RULES.md\n');
  
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
      await delay(500);
    } catch (err) {
      console.error(`  ❌ Error on page ${page}: ${err.message}`);
    }
  }
  
  console.log(`\n📊 Found ${allLinks.size} unique artwork links\n`);
  
  // Step 2: Scrape each artwork page
  console.log('🖼️ Scraping artwork details...');
  const artworks = [];
  const linkArray = Array.from(allLinks);
  
  for (let i = 0; i < linkArray.length; i++) {
    const slug = linkArray[i];
    console.log(`[${i + 1}/${linkArray.length}] ${slug.split('/').slice(-2, -1)[0]}`);
    
    const artwork = await scrapeArtwork(slug);
    if (artwork) {
      artworks.push(artwork);
    }
    
    await delay(300);
  }
  
  // Rule 5: Remove duplicates - by ID only (same URL = same artwork)
  // Title + Artist can be similar for different paintings
  console.log('\n🔍 Checking for duplicates (by ID)...');
  const seen = new Map();
  const uniqueArtworks = [];
  let duplicatesRemoved = 0;
  
  for (const art of artworks) {
    if (!seen.has(art.id)) {
      seen.set(art.id, true);
      uniqueArtworks.push(art);
    } else {
      console.log(`  Duplicate removed: ${art.id}`);
      duplicatesRemoved++;
    }
  }
  
  console.log(`  Removed ${duplicatesRemoved} duplicates`);
  
  // Step 3: Save results
  const collection = {
    museum: 'Dulwich Picture Gallery',
    museumId: 'dulwich-picture-gallery',
    collectionName: 'Dulwich Picture Gallery Collection',  // Rule 6
    location: 'Gallery Road, Dulwich Village, London SE21 7AD',
    scrapedAt: new Date().toISOString(),
    totalObjects: uniqueArtworks.length,
    coverImage: uniqueArtworks[0]?.image || null,  // Rule 7
    objects: uniqueArtworks
  };
  
  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2));
  
  console.log(`\n✅ Done!`);
  console.log(`📊 Total artworks: ${uniqueArtworks.length}`);
  console.log(`📁 Saved to: ${OUTPUT_FILE}`);
  console.log(`\n⏭️ Next: Run upload-dulwich-to-r2.cjs to upload images`);
}

main().catch(console.error);
