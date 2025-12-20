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

function parseOgTitle(ogTitle) {
  if (!ogTitle) return { title: null, artist: null, year: null };
  
  let text = ogTitle.replace(/\s*\|\s*Tate\s*$/, '').trim();
  const LEFT_Q = String.fromCharCode(8216);
  const RIGHT_Q = String.fromCharCode(8217);
  
  let title = null, artist = null, year = null;
  
  // Pattern with quotes: 'Title', Artist, Year
  const quotedMatch = text.match(new RegExp(`^[${LEFT_Q}'"](.+?)[${RIGHT_Q}'"],\\s*(.+),\\s*(\\d{4})$`));
  if (quotedMatch) {
    title = quotedMatch[1];
    artist = quotedMatch[2];
    year = quotedMatch[3];
  } else {
    // Pattern without quotes
    const parts = text.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      const lastPart = parts[parts.length - 1];
      const yearMatch = lastPart.match(/^(\d{4})$/);
      if (yearMatch) {
        year = yearMatch[1];
        const beforeYear = parts.slice(0, -1).join(', ');
        const lastCommaIdx = beforeYear.lastIndexOf(',');
        if (lastCommaIdx > 0) {
          title = beforeYear.substring(0, lastCommaIdx).replace(/^['""']/,'').replace(/['""']$/,'');
          artist = beforeYear.substring(lastCommaIdx + 1).trim();
        } else {
          title = beforeYear.replace(/^['""']/,'').replace(/['""']$/,'');
        }
      } else {
        // No year, try Title, Artist
        const lastComma = text.lastIndexOf(',');
        if (lastComma > 0) {
          title = text.substring(0, lastComma).replace(/^['""']/,'').replace(/['""']$/,'').trim();
          artist = text.substring(lastComma + 1).trim();
        } else {
          title = text.replace(/^['""']/,'').replace(/['""']$/,'');
        }
      }
    } else {
      title = text.replace(/^['""']/,'').replace(/['""']$/,'');
    }
  }
  
  // Clean up curly quotes from title
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
    
    const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
                         html.match(/<meta\s+content="([^"]+)"\s+property="og:title"/i);
    const ogTitle = ogTitleMatch ? ogTitleMatch[1] : null;
    
    const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
                         html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i);
    const ogImage = ogImageMatch ? ogImageMatch[1] : null;
    
    const parsed = parseOgTitle(ogTitle);
    
    return {
      title: parsed.title || 'Untitled',
      artist: parsed.artist || 'Unknown Artist',
      year: parsed.year || null,
      image: ogImage,
      url: artworkUrl
    };
  } catch (e) {
    console.error('Error fetching', artworkUrl, e.message);
    return null;
  }
}

async function getRoomArtworks(roomUrl) {
  console.log('\n  Fetching:', roomUrl.split('/').pop());
  const html = await fetch(BASE_URL + roomUrl);
  
  const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  let roomName = roomUrl.split('/').pop().replace(/-/g, ' ');
  if (ogTitleMatch) {
    roomName = ogTitleMatch[1].replace(/\s*[–-]\s*Display at Tate Britain/i, '').replace(/\s*\|\s*Tate.*$/, '').trim();
  }
  
  const artworkPattern = /href="(\/art\/artworks\/[^"]+)"/g;
  const artworkUrls = new Set();
  let match;
  while ((match = artworkPattern.exec(html)) !== null) {
    artworkUrls.add(match[1]);
  }
  
  console.log(`    ${roomName}: ${artworkUrls.size} links`);
  
  const artworks = [];
  for (const artUrl of artworkUrls) {
    await delay(300);
    const artwork = await getArtworkDetails(BASE_URL + artUrl);
    if (artwork && artwork.image) {
      artworks.push(artwork);
      process.stdout.write('.');
    }
  }
  if (artworks.length > 0) console.log(` ${artworks.length} artworks`);
  
  return { name: roomName, url: BASE_URL + roomUrl, artworks };
}

async function scrapeDisplay(name, urlPath) {
  console.log(`\n\n========== ${name} ==========`);
  const displayUrl = BASE_URL + urlPath;
  
  // Get display info
  const mainHtml = await fetch(displayUrl);
  const ogImageMatch = mainHtml.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  const ogDescMatch = mainHtml.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
  
  // Get room links
  const roomPattern = new RegExp(`href="(${urlPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^"]+)"`, 'g');
  const roomUrls = new Set();
  let match;
  while ((match = roomPattern.exec(mainHtml)) !== null) {
    roomUrls.add(match[1]);
  }
  
  console.log(`Found ${roomUrls.size} rooms`);
  
  const rooms = [];
  for (const roomUrl of roomUrls) {
    await delay(800);
    const room = await getRoomArtworks(roomUrl);
    if (room.artworks.length > 0) {
      rooms.push(room);
    }
  }
  
  // Use first room's first artwork as thumbnail if no og:image
  let thumbnail = ogImageMatch ? ogImageMatch[1] : null;
  if (!thumbnail && rooms.length > 0 && rooms[0].artworks.length > 0) {
    thumbnail = rooms[0].artworks[0].image;
  }
  
  return {
    id: `tate-britain-display-${urlPath.split('/').pop()}`,
    title: name,
    description: ogDescMatch ? ogDescMatch[1] : '',
    image: thumbnail,
    url: displayUrl,
    rooms: rooms
  };
}

async function main() {
  const displays = [
    { name: 'JMW Turner', path: '/visit/tate-britain/display/jmw-turner' },
    { name: 'Historic and Early Modern British Art', path: '/visit/tate-britain/display/historic-british-art' },
    { name: 'Modern and Contemporary British Art', path: '/visit/tate-britain/display/modern-contemporary-british-art' }
  ];
  
  const results = {};
  
  for (const display of displays) {
    const data = await scrapeDisplay(display.name, display.path);
    results[display.path] = data;
    
    let artCount = 0;
    data.rooms.forEach(r => artCount += r.artworks.length);
    console.log(`\n  Summary: ${data.rooms.length} rooms, ${artCount} artworks`);
  }
  
  // Save
  const outputPath = path.join(__dirname, '../public/data/tate-britain-displays-new.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  
  console.log('\n\n========== FINAL ==========');
  let totalRooms = 0, totalArtworks = 0;
  for (const [key, data] of Object.entries(results)) {
    let ac = 0;
    data.rooms.forEach(r => ac += r.artworks.length);
    console.log(`${data.title}: ${data.rooms.length} rooms, ${ac} artworks`);
    totalRooms += data.rooms.length;
    totalArtworks += ac;
  }
  console.log(`\nTOTAL: ${totalRooms} rooms, ${totalArtworks} artworks`);
  console.log(`\nSaved to ${outputPath}`);
}

main().catch(console.error);
