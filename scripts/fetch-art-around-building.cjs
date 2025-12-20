/**
 * Fetch Art Around the Building rooms with cover images
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_FILE = path.join(__dirname, '../public/data/tate-britain.json');

// Art Around the Building has these 4 locations:
const ROOMS = [
  {
    name: 'Djanogly Café',
    url: 'https://www.tate.org.uk/visit/tate-britain/display/art-around-the-building/djanogly-cafe',
  },
  {
    name: 'Manton Foyer',
    url: 'https://www.tate.org.uk/visit/tate-britain/display/art-around-the-building/manton-foyer',
  },
  {
    name: 'Rex Whistler Restaurant',
    url: 'https://www.tate.org.uk/visit/tate-britain/display/art-around-the-building/rex-whistler-restaurant',
  },
  {
    name: 'Grounds and Gardens',
    url: 'https://www.tate.org.uk/visit/tate-britain/display/art-around-the-building/grounds-and-gardens',
  },
];

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const artAroundIdx = data.items.findIndex(i => i.id === 'tate-britain-display-art-around-building');
  
  if (artAroundIdx === -1) {
    console.error('Art Around the Building not found');
    return;
  }
  
  const rooms = [];
  
  for (const room of ROOMS) {
    console.log(`Fetching ${room.name}...`);
    try {
      const html = await fetchPage(room.url);
      
      // Extract cover image from meta og:image or page content
      let coverImage = null;
      const ogMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
      if (ogMatch) {
        coverImage = ogMatch[1];
      }
      
      // Extract description
      let description = null;
      const descMatch = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i);
      if (descMatch) {
        description = descMatch[1];
      }
      
      rooms.push({
        name: room.name,
        url: room.url,
        coverImage: coverImage,
        description: description,
        location: `Tate Britain, ${room.name}`,
        artworks: [],
      });
      
      console.log(`  Cover: ${coverImage ? 'found' : 'not found'}`);
    } catch (e) {
      console.error(`  Error: ${e.message}`);
      rooms.push({
        name: room.name,
        url: room.url,
        coverImage: null,
        description: null,
        location: `Tate Britain, ${room.name}`,
        artworks: [],
      });
    }
  }
  
  data.items[artAroundIdx].rooms = rooms;
  
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  console.log(`\nUpdated Art Around the Building with ${rooms.length} rooms`);
}

main().catch(console.error);
