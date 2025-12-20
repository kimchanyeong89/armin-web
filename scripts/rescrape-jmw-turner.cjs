const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.tate.org.uk';

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Parse og:title format: 'Title', Artist, Year | Tate
function parseOgTitle(ogTitle) {
  if (!ogTitle) return { title: null, artist: null, year: null };
  
  // Remove " | Tate" suffix
  let text = ogTitle.replace(/\s*\|\s*Tate\s*$/, '').trim();
  
  // Pattern: 'Title', Artist, Year  or  Title, Artist, Year
  // Handle curly quotes (8216, 8217) and straight quotes
  const LEFT_Q = String.fromCharCode(8216);
  const RIGHT_Q = String.fromCharCode(8217);
  
  let title = null, artist = null, year = null;
  
  // Try pattern with quotes first
  const quotedMatch = text.match(new RegExp(`^[${LEFT_Q}'"](.+?)[${RIGHT_Q}'"],\\s*(.+),\\s*(\\d{4})$`));
  if (quotedMatch) {
    title = quotedMatch[1];
    artist = quotedMatch[2];
    year = quotedMatch[3];
  } else {
    // Try without quotes: Title, Artist, Year
    const parts = text.split(',').map(p => p.trim());
    if (parts.length >= 3) {
      const lastPart = parts[parts.length - 1];
      const yearMatch = lastPart.match(/(\d{4})/);
      if (yearMatch) {
        year = yearMatch[1];
        // Everything before last comma is title + artist
        // Usually: "Title", Artist
        const beforeYear = parts.slice(0, -1).join(', ');
        const artistMatch = beforeYear.match(/^(.+),\s*([^,]+)$/);
        if (artistMatch) {
          title = artistMatch[1].replace(/^['""']|['""']$/g, '');
          artist = artistMatch[2];
        } else {
          title = beforeYear.replace(/^['""']|['""']$/g, '');
        }
      }
    }
  }
  
  // Clean up title - remove surrounding quotes
  if (title) {
    title = title.replace(new RegExp(`^[${LEFT_Q}${RIGHT_Q}'"\`]`), '')
                 .replace(new RegExp(`[${LEFT_Q}${RIGHT_Q}'"\`]$`), '')
                 .trim();
  }
  
  return { title, artist, year };
}

async function getArtworkDetails(artworkUrl) {
  try {
    const html = await fetch(artworkUrl);
    
    // Get og:title
    const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
                         html.match(/<meta\s+content="([^"]+)"\s+property="og:title"/i);
    const ogTitle = ogTitleMatch ? ogTitleMatch[1] : null;
    
    // Get og:image
    const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
                         html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i);
    const ogImage = ogImageMatch ? ogImageMatch[1] : null;
    
    const parsed = parseOgTitle(ogTitle);
    
    return {
      title: parsed.title,
      artist: parsed.artist,
      year: parsed.year,
      image: ogImage,
      url: artworkUrl
    };
  } catch (e) {
    console.error('Error fetching', artworkUrl, e.message);
    return null;
  }
}

async function getRoomArtworks(roomUrl) {
  console.log('\nFetching room:', roomUrl);
  const html = await fetch(BASE_URL + roomUrl);
  
  // Get room name from og:title
  const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  let roomName = roomUrl.split('/').pop().replace(/-/g, ' ');
  if (ogTitleMatch) {
    roomName = ogTitleMatch[1].replace(/\s*\|\s*Tate.*$/, '').trim();
  }
  
  // Find artwork links
  const artworkPattern = /href="(\/art\/artworks\/[^"]+)"/g;
  const artworkUrls = new Set();
  let match;
  while ((match = artworkPattern.exec(html)) !== null) {
    artworkUrls.add(match[1]);
  }
  
  console.log(`  Room: ${roomName}, found ${artworkUrls.size} artwork links`);
  
  const artworks = [];
  for (const artUrl of artworkUrls) {
    await delay(500); // Be polite
    const artwork = await getArtworkDetails(BASE_URL + artUrl);
    if (artwork && artwork.image) {
      // Skip if image looks like a placeholder/white
      artworks.push(artwork);
      console.log(`    ✓ ${artwork.title || 'Unknown'} - ${artwork.artist || 'Unknown'}`);
    }
  }
  
  return { name: roomName, url: BASE_URL + roomUrl, artworks };
}

async function getDisplayInfo(displayUrl) {
  const html = await fetch(displayUrl);
  
  // Get og:image for thumbnail
  const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  const ogImage = ogImageMatch ? ogImageMatch[1] : null;
  
  // Get description
  const descMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i) ||
                    html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
  const description = descMatch ? descMatch[1] : null;
  
  return { image: ogImage, description };
}

async function main() {
  console.log('=== Re-scraping JMW Turner ===\n');
  
  const displayUrl = 'https://www.tate.org.uk/visit/tate-britain/display/jmw-turner';
  
  // Get display info
  const displayInfo = await getDisplayInfo(displayUrl);
  console.log('Display thumbnail:', displayInfo.image ? 'Found' : 'None');
  
  // Get room links
  const mainHtml = await fetch(displayUrl);
  const roomPattern = /href="(\/visit\/tate-britain\/display\/jmw-turner\/[^"]+)"/g;
  const roomUrls = new Set();
  let match;
  while ((match = roomPattern.exec(mainHtml)) !== null) {
    roomUrls.add(match[1]);
  }
  
  console.log(`\nFound ${roomUrls.size} rooms`);
  
  const rooms = [];
  for (const roomUrl of roomUrls) {
    await delay(1000);
    const room = await getRoomArtworks(roomUrl);
    if (room.artworks.length > 0) {
      rooms.push(room);
    }
  }
  
  // Build result
  const result = {
    id: 'tate-britain-display-jmw-turner',
    title: 'JMW Turner',
    description: displayInfo.description || 'See the world\'s largest free display of paintings by JMW Turner',
    image: displayInfo.image,
    url: displayUrl,
    rooms: rooms
  };
  
  // Count totals
  let totalArtworks = 0;
  rooms.forEach(r => totalArtworks += r.artworks.length);
  
  console.log('\n=== Summary ===');
  console.log(`Rooms: ${rooms.length}`);
  console.log(`Total artworks: ${totalArtworks}`);
  
  // Save to file
  const outputPath = path.join(__dirname, '../public/data/jmw-turner-new.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`\nSaved to ${outputPath}`);
  
  return result;
}

main().catch(console.error);
