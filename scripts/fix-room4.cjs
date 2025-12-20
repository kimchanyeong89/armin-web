/**
 * Fix Room 4 - The Exhibition Age
 * Process the 21 unenriched artworks
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const DISPLAYS_FILE = path.join(__dirname, '../public/data/tate-britain-displays.json');
const IMAGES_DIR = path.join(__dirname, '../temp-tate-display-images');
const R2_BUCKET = 'armin-web';
const R2_PUBLIC_URL = 'https://pub-0e9cd559fbf4456c9304536a417d9f86.r2.dev';

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        fetchHtml(response.headers.location).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => resolve(data));
      response.on('error', reject);
    });
    
    request.on('error', reject);
    request.setTimeout(15000, () => {
      request.destroy();
      reject(new Error('Timeout'));
    });
  });
}

function parseOgTitle(ogTitle) {
  if (!ogTitle) return null;
  let cleaned = ogTitle.replace(/\s*\|\s*Tate\s*$/i, '').trim();
  
  let title = '', artist = '', year = '';
  
  cleaned = cleaned.replace(/[\u2018\u2019]/g, "'");
  cleaned = cleaned.replace(/[\u201C\u201D]/g, '"');
  
  const titleEndPattern = /',\s+/;
  const titleEndMatch = cleaned.match(titleEndPattern);
  
  if (cleaned.startsWith("'") && titleEndMatch) {
    let lastCommaQuote = -1;
    let searchFrom = 1;
    
    while (true) {
      const pos = cleaned.indexOf("', ", searchFrom);
      if (pos === -1) break;
      
      const afterPos = pos + 3;
      if (afterPos < cleaned.length && /[A-Z]/.test(cleaned.charAt(afterPos))) {
        lastCommaQuote = pos;
      }
      searchFrom = pos + 1;
    }
    
    if (lastCommaQuote > 0) {
      title = cleaned.substring(1, lastCommaQuote);
      let remainder = cleaned.substring(lastCommaQuote + 3).trim();
      
      const yearPatterns = [
        /,?\s*\??\s*exhibited\s+(\d{4})(?:\s*[-–]?\s*\d{0,4})?$/i,
        /,?\s*\??\s*c\.?\s*(\d{4})(?:\s*[-–]?\s*\d{0,4})?$/i,
        /,?\s*(\d{4})(?:\s*[-–]?\s*\d{0,4})?$/i
      ];
      
      for (const pattern of yearPatterns) {
        const match = remainder.match(pattern);
        if (match) {
          year = match[1];
          remainder = remainder.replace(match[0], '').trim();
          break;
        }
      }
      artist = remainder.replace(/,\s*$/, '').trim();
      artist = artist.replace(/,\s*\d{4}.*$/i, '').trim();
    }
  }
  
  if (artist && !/[a-zA-Z]{2,}/.test(artist)) artist = '';
  if (year && !/^\d{4}$/.test(year)) {
    const m = year.match(/(\d{4})/);
    year = m ? m[1] : '';
  }
  
  return { title, artist, year };
}

async function fetchArtworkDetails(url, artworkId) {
  try {
    const html = await fetchHtml(url);
    
    const ogMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
                    html.match(/<meta\s+content="([^"]+)"\s+property="og:title"/i);
    
    if (!ogMatch) return null;
    
    const parsed = parseOgTitle(ogMatch[1]);
    if (!parsed) return null;
    
    const prefix = artworkId.charAt(0).toUpperCase();
    const mid = artworkId.substring(0, 3).toUpperCase();
    const imageUrl = `https://media.tate.org.uk/art/images/work/${prefix}/${mid}/${artworkId.toUpperCase()}_10.jpg`;
    
    return {
      title: parsed.title,
      artist: parsed.artist,
      year: parsed.year,
      image: imageUrl
    };
  } catch (e) {
    console.log(`  Error fetching ${url}: ${e.message}`);
    return null;
  }
}

async function downloadImage(imageUrl, artworkId) {
  return new Promise((resolve) => {
    const filepath = path.join(IMAGES_DIR, `${artworkId}.jpg`);
    
    const file = fs.createWriteStream(filepath);
    https.get(imageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (response) => {
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(filepath);
        resolve(null);
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        
        const stats = fs.statSync(filepath);
        if (stats.size < 5000) {
          fs.unlinkSync(filepath);
          resolve(null);
          return;
        }
        
        resolve({ filepath });
      });
    }).on('error', () => {
      file.close();
      try { fs.unlinkSync(filepath); } catch {}
      resolve(null);
    });
  });
}

function uploadToR2(localPath, r2Path) {
  try {
    const cmd = `npx wrangler r2 object put ${R2_BUCKET}/${r2Path} --file="${localPath}" --content-type="image/jpeg"`;
    execSync(cmd, { stdio: 'pipe', cwd: path.join(__dirname, '..') });
    return `${R2_PUBLIC_URL}/${r2Path}`;
  } catch (e) {
    return null;
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function scrapeRoomPage(roomUrl) {
  try {
    const html = await fetchHtml(roomUrl);
    const artworks = [];
    const seen = new Set();
    
    // Find all artwork links - format: /art/artworks/artist-title-id
    const regex = /href="(\/art\/artworks\/[^"]+)"/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const href = match[1];
      const idMatch = href.match(/([a-z]\d{5})$/i);
      if (idMatch && !seen.has(idMatch[1].toUpperCase())) {
        seen.add(idMatch[1].toUpperCase());
        artworks.push({
          id: idMatch[1].toUpperCase(),
          url: `https://www.tate.org.uk${href}`
        });
      }
    }
    
    return artworks;
  } catch (e) {
    console.log(`  Error fetching room: ${e.message}`);
    return [];
  }
}

async function main() {
  console.log('=== Fix Room 4 - The Exhibition Age ===\n');
  
  const data = JSON.parse(fs.readFileSync(DISPLAYS_FILE, 'utf-8'));
  const display = data['historic-early-modern'];
  const room = display.rooms.find(r => r.name === 'The Exhibition Age');
  
  if (!room) {
    console.log('Room not found!');
    return;
  }
  
  console.log(`Room: ${room.name}`);
  console.log(`URL: ${room.url}`);
  console.log(`Artworks: ${room.artworks.length}\n`);
  
  // Scrape room page for proper URLs
  console.log('Scraping room page for artwork URLs...');
  const scrapedArtworks = await scrapeRoomPage(room.url);
  console.log(`Found ${scrapedArtworks.length} artworks on page\n`);
  
  // Create a map of scraped URLs by ID
  const urlMap = new Map();
  for (const a of scrapedArtworks) {
    urlMap.set(a.id, a.url);
  }
  
  // Filter unenriched artworks
  const unenriched = room.artworks.filter(a => !a.title || !a.artist);
  console.log(`Unenriched: ${unenriched.length}\n`);
  
  let processed = 0;
  let validArtworks = [];
  
  for (const artwork of scrapedArtworks) {
    console.log(`Processing ${artwork.id}...`);
    
    const details = await fetchArtworkDetails(artwork.url, artwork.id);
    await sleep(500);
    
    if (!details || !details.title || !details.artist) {
      console.log(`  Skip: no title/artist`);
      continue;
    }
    
    if (details.title.toLowerCase() === 'untitled') {
      console.log(`  Skip: Untitled`);
      continue;
    }
    
    // Download image
    const imgResult = await downloadImage(details.image, artwork.id);
    if (!imgResult) {
      console.log(`  Skip: invalid image`);
      continue;
    }
    
    // Upload to R2
    const r2Path = `tate-britain/artworks/${artwork.id}.jpg`;
    const r2Url = uploadToR2(imgResult.filepath, r2Path);
    
    validArtworks.push({
      id: artwork.id,
      url: artwork.url,
      title: details.title,
      artist: details.artist,
      year: details.year || '',
      image: r2Url || details.image,
      originalImage: details.image
    });
    
    console.log(`  ✓ ${details.artist} - "${details.title}" (${details.year || 'n/a'})`);
    processed++;
  }
  
  // Update room with valid artworks
  room.artworks = validArtworks;
  room.artworkCount = validArtworks.length;
  
  // Save
  fs.writeFileSync(DISPLAYS_FILE, JSON.stringify(data, null, 2));
  
  console.log(`\n=== Done ===`);
  console.log(`Processed: ${processed}`);
}

main().catch(console.error);
