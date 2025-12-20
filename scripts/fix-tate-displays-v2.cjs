/**
 * Fix Tate Britain Display artworks:
 * 1. Change image suffix from _10 to _9
 * 2. Extract title from URL if missing
 * 3. Set room numbers
 */

const fs = require('fs');
const path = require('path');

const DISPLAYS_FILE = path.join(__dirname, '../public/data/tate-britain.json');

function extractTitleFromUrl(url) {
  const match = url.match(/artworks\/([^/]+)$/);
  if (!match) return null;
  
  const slug = match[1];
  const withoutId = slug.replace(/-[a-z]\d+$/, '');
  const parts = withoutId.split('-');
  
  // Skip common artist prefixes
  const artistPrefixes = ['turner', 'constable', 'hogarth', 'blake', 'gainsborough', 
                          'reynolds', 'wilson', 'canaletto', 'stubbs', 'romney',
                          'raeburn', 'lawrence', 'hockney', 'bacon', 'freud',
                          'hambling', 'hodgkin', 'riley', 'caro', 'moore', 'hepworth',
                          'rothko', 'paolozzi', 'smith', 'clough', 'scott', 'bowling',
                          'kossoff', 'auerbach', 'kitaj', 'long', 'rubens', 'van-dyck',
                          'lely', 'kneller', 'fuseli', 'dobson', 'beale', 'barlow',
                          'collier', 'wright', 'mercier', 'highmore', 'nebot', 'devis',
                          'bronstein', 'morland', 'dawe', 'kauffman', 'ladbrooke',
                          'mulready', 'daniell', 'wilkie', 'parry', 'stuart', 'cotes',
                          'opie', 'hoppner', 'de-loutherbourg', 'westall', 'zoffany',
                          'hicks', 'bevan', 'bomberg', 'pailthorpe', 'wadsworth',
                          'cordery', 'cradock', 'webb', 'hunt', 'frink', 'richards',
                          'warren', 'morris', 'holden', 'self', 'nicholson', 'casteels',
                          'wells', 'souza', 'baker', 'davie', 'moody', 'ribeiro', 'lim',
                          'butler', 'williams', 'ayres', 'gupta', 'latham', 'li', 'lin',
                          'sutton', 'pasmore', 'hill', 'wise', 'martin', 'tilson',
                          'blow', 'boty', 'shemza', 'boshier', 'boyce', 'epstein',
                          'sokhanvari', 'norman', 'killigrew', 'carlile', 'siberechts',
                          'thornhill', 'mytens', 'gower', 'peake', 'van-somer',
                          'gheeraerts', 'des-granges', 'eworth', 'bettes', 'shaw',
                          'virtue', 'ferguson'];
  
  let titleParts = parts;
  for (let i = 0; i < Math.min(3, parts.length); i++) {
    if (artistPrefixes.includes(parts[i].toLowerCase())) {
      titleParts = parts.slice(i + 1);
      break;
    }
  }
  
  if (titleParts.length === 0) titleParts = parts;
  
  const title = titleParts
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .replace(/ And /g, ' and ')
    .replace(/ Of /g, ' of ')
    .replace(/ The /g, ' the ')
    .replace(/ In /g, ' in ')
    .replace(/ At /g, ' at ')
    .replace(/ With /g, ' with ')
    .replace(/ From /g, ' from ')
    .replace(/ On /g, ' on ')
    .replace(/ A /g, ' a ')
    .replace(/^the /, 'The ')
    .replace(/^a /, 'A ');
  
  return title || null;
}

function buildImageUrl(url) {
  const match = url.match(/([a-z]\d+)$/);
  if (!match) return '';
  
  const tateId = match[1];
  const idUpper = tateId.toUpperCase();
  const prefix = idUpper.charAt(0);
  const midPart = idUpper.substring(0, 3);
  
  // Use _9 suffix (high-res that actually works)
  return `https://media.tate.org.uk/art/images/work/${prefix}/${midPart}/${idUpper}_9.jpg`;
}

function main() {
  console.log('=== Fixing Tate Britain Display Artworks ===\n');

  const data = JSON.parse(fs.readFileSync(DISPLAYS_FILE, 'utf-8'));
  const items = data.items || [];

  let fixed = 0;

  for (const item of items) {
    if (!item.id?.startsWith('tate-britain-display-')) continue;

    console.log(`Processing: ${item.title || item.id}`);

    if (!Array.isArray(item.rooms)) continue;

    let roomNumber = 1;
    for (const room of item.rooms) {
      room.roomNumber = String(roomNumber);  // Just "1", "2", "3"...
      console.log(`  Room ${roomNumber}: ${room.name} (${room.artworks?.length || 0} artworks)`);
      roomNumber++;

      if (!Array.isArray(room.artworks)) continue;

      for (const artwork of room.artworks) {
        const url = artwork.url;
        if (!url) continue;

        // Fix title
        if (!artwork.title || artwork.title === 'Untitled') {
          artwork.title = extractTitleFromUrl(url) || 'Untitled';
        }

        // Always rebuild image URL with correct _9 suffix
        artwork.image = buildImageUrl(url);

        fixed++;
      }
    }
  }

  fs.writeFileSync(DISPLAYS_FILE, JSON.stringify(data, null, 2));
  console.log(`\n=== Done! Fixed ${fixed} artworks ===`);
}

main();
