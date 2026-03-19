/**
 * Dulwich Picture Gallery Collection Scraper v3
 * 개선사항:
 * - HTML 엔티티 디코딩 (&#x27; → ')
 * - 작가 파싱 개선 (대소문자, 공백 유연하게)
 * - 세기 표기 지원 (17th century → 1650, 표기: "17c")
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

// HTML 엔티티 디코딩
function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x22;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// Extract attribute value by name (Artist, Date, etc.)
// 더 유연한 파싱: 대소문자 무시, 공백 유연하게
function extractAttribute(html, attrName) {
  // Method 1: vale (typo) - 원래 방식
  const regex1 = new RegExp(
    `<p[^>]*class="c-collection-item__attribute-name"[^>]*>\\s*${attrName}\\s*</p>\\s*<p[^>]*class="c-collection-item__attribute-vale"[^>]*>([^<]+)</p>`,
    'is'
  );
  let match = html.match(regex1);
  if (match) return decodeHtmlEntities(match[1].trim());

  // Method 2: value (정상) - 혹시 수정된 경우
  const regex2 = new RegExp(
    `<p[^>]*class="c-collection-item__attribute-name"[^>]*>\\s*${attrName}\\s*</p>\\s*<p[^>]*class="c-collection-item__attribute-value"[^>]*>([^<]+)</p>`,
    'is'
  );
  match = html.match(regex2);
  if (match) return decodeHtmlEntities(match[1].trim());

  // Method 3: 더 느슨한 패턴 - attribute-name 다음에 오는 p 태그
  const regex3 = new RegExp(
    `>${attrName}</p>\\s*<p[^>]*>([^<]+)</p>`,
    'is'
  );
  match = html.match(regex3);
  if (match) return decodeHtmlEntities(match[1].trim());

  return '';
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
  let title = titleMatch[1].trim().replace(/\s*[—–-]\s*Dulwich Picture Gallery$/i, '');
  return decodeHtmlEntities(title);
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
  return descMatch ? decodeHtmlEntities(descMatch[1]) : '';
}

// Get all artwork links from a page
function extractArtworkLinks(html) {
  const regex = /href="(\/explore\/explore-the-collection\/[^"?]+)"/g;
  const links = new Set();
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (match[1] !== '/explore/explore-the-collection/') {
      links.add(match[1]);
    }
  }
  return Array.from(links);
}

// Parse year from date string - 세기 표기 지원
// 반환: { year: 숫자(정렬용), dateStr: 표기용 }
function parseYear(dateStr) {
  if (!dateStr) return { year: null, displayDate: null };

  // 1. 일반 연도: "1645", "c. 1650", "1640-1645"
  const yearMatch = dateStr.match(/(\d{4})/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1]);
    if (year >= 1200 && year <= 2025) {
      return { year, displayDate: dateStr };
    }
  }

  // 2. 세기 표기: "17th century", "17th C", "17c", "seventeenth century"
  const centuryPatterns = [
    // 숫자 + th/st/nd/rd century
    /(\d{1,2})(?:st|nd|rd|th)\s*(?:century|c\.?)/i,
    // 단어로 된 세기 (예: "seventeenth century")
  ];

  const centuryWords = {
    'twelfth': 12, 'thirteenth': 13, 'fourteenth': 14, 'fifteenth': 15,
    'sixteenth': 16, 'seventeenth': 17, 'eighteenth': 18, 'nineteenth': 19,
    'twentieth': 20, 'twenty-first': 21
  };

  // 숫자 세기 매칭
  for (const pattern of centuryPatterns) {
    const match = dateStr.match(pattern);
    if (match) {
      const century = parseInt(match[1]);
      if (century >= 12 && century <= 21) {
        // 세기의 중간값 (예: 17c → 1650)
        const midYear = (century - 1) * 100 + 50;
        return { year: midYear, displayDate: `${century}c` };
      }
    }
  }

  // 단어 세기 매칭
  for (const [word, century] of Object.entries(centuryWords)) {
    if (dateStr.toLowerCase().includes(word)) {
      const midYear = (century - 1) * 100 + 50;
      return { year: midYear, displayDate: `${century}c` };
    }
  }

  // 3. "early/mid/late 17th century" 처리
  const periodMatch = dateStr.match(/(early|mid|late)[- ]?(\d{1,2})(?:st|nd|rd|th)/i);
  if (periodMatch) {
    const period = periodMatch[1].toLowerCase();
    const century = parseInt(periodMatch[2]);
    let yearOffset = 50; // mid
    if (period === 'early') yearOffset = 25;
    if (period === 'late') yearOffset = 75;
    const year = (century - 1) * 100 + yearOffset;
    return { year, displayDate: `${period} ${century}c` };
  }

  return { year: null, displayDate: dateStr || null };
}

async function scrapeArtwork(slug) {
  const url = `${BASE_URL}${slug}`;
  try {
    const html = await httpsGet(url);

    // Extract all fields from detail page
    const title = extractTitle(html);

    // 작가: "Artist" 또는 "Artist description" 필드 둘 다 체크
    let artist = extractAttribute(html, 'Artist');
    if (!artist) {
      artist = extractAttribute(html, 'Artist description');
    }

    const rawDate = extractAttribute(html, 'Date');
    const { year, displayDate } = parseYear(rawDate);
    const room = extractRoom(html);
    const image = extractImage(html);
    const description = extractDescription(html);
    const dimensions = extractAttribute(html, 'Dimensions');
    const materials = extractAttribute(html, 'Materials');
    const category = extractAttribute(html, 'Category') || extractAttribute(html, 'Object type');
    const accessionNumber = extractAttribute(html, 'Accession number');

    // Check display status
    // If "room" is present, it's usually on display. 
    // We can also check specifically for "Not on display" text in the callout or attributes.
    const isOnDisplay = !!room && !html.includes('Not on display');
    const displayStatus = isOnDisplay ? (room || 'On display') : 'Not on display';

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
      dateStr: displayDate || rawDate,
      room,
      image,
      description,
      dimensions,
      materials,
      category,
      ondisplay: isOnDisplay,
      displayStatus,
      accessionNumber,
      url
    };
  } catch (err) {
    console.error(`  ❌ Error: ${slug} - ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('🎨 Dulwich Picture Gallery Collection Scraper v3');
  console.log('📋 개선사항:');
  console.log('   - HTML 엔티티 디코딩 (&#x27; → \')');
  console.log('   - 작가 파싱 개선');
  console.log('   - 세기 표기 지원 (17th century → 1650, 표기: 17c)\n');

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
      console.log(`     Artist: ${artwork.artist || 'Unknown'} | Year: ${artwork.dateStr || 'N/A'} | Room: ${artwork.room || 'N/A'}`);
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
  console.log(`  With artist: ${withArtist} (${Math.round(withArtist / artworks.length * 100)}%)`);
  console.log(`  With year: ${withYear} (${Math.round(withYear / artworks.length * 100)}%)`);
  console.log(`  With room: ${withRoom} (${Math.round(withRoom / artworks.length * 100)}%)`);

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
