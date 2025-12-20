/**
 * Fix Tate Britain Display artworks by:
 * 1. Extracting proper title from URL slug
 * 2. Building correct high-res image URL from Tate ID
 * 3. Setting room numbers 1-8
 */

const fs = require('fs');
const path = require('path');

const DISPLAYS_FILE = path.join(__dirname, '../public/data/tate-britain.json');

function extractTitleFromUrl(url) {
  // URL format: https://www.tate.org.uk/art/artworks/turner-self-portrait-n00458
  // Extract the slug between artist and ID, convert to title case
  const match = url.match(/artworks\/([^/]+)$/);
  if (!match) return null;
  
  const slug = match[1];
  // Remove the ID at the end (e.g., -n00458, -t05829, -p03155)
  const withoutId = slug.replace(/-[a-z]\d+$/, '');
  
  // Convert slug to title: "turner-self-portrait" -> "Self-Portrait"
  // First, remove artist prefix if present
  const parts = withoutId.split('-');
  
  // Find where the title starts (usually after artist name)
  // Common artist prefixes to skip
  const artistPrefixes = ['turner', 'constable', 'hogarth', 'blake', 'gainsborough', 
                          'reynolds', 'wilson', 'canaletto', 'stubbs', 'romney',
                          'raeburn', 'lawrence', 'hockney', 'bacon', 'freud',
                          'hambling', 'hodgkin', 'riley', 'caro', 'moore', 'hepworth',
                          'rothko', 'paolozzi', 'smith', 'clough', 'scott', 'bowling',
                          'kossoff', 'auerbach', 'kitaj', 'long', 'cragg', 'kapoor'];
  
  let titleParts = parts;
  if (artistPrefixes.includes(parts[0].toLowerCase())) {
    titleParts = parts.slice(1);
  }
  
  // Convert to title case
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

function extractArtistFromUrl(url) {
  const match = url.match(/artworks\/([^-]+)/);
  if (!match) return '';
  
  const artistSlug = match[1];
  const artistMap = {
    'turner': 'Joseph Mallord William Turner',
    'constable': 'John Constable',
    'hogarth': 'William Hogarth',
    'blake': 'William Blake',
    'gainsborough': 'Thomas Gainsborough',
    'reynolds': 'Sir Joshua Reynolds',
    'wilson': 'Richard Wilson',
    'canaletto': 'Canaletto',
    'stubbs': 'George Stubbs',
    'romney': 'George Romney',
    'raeburn': 'Sir Henry Raeburn',
    'lawrence': 'Sir Thomas Lawrence',
    'hockney': 'David Hockney',
    'bacon': 'Francis Bacon',
    'freud': 'Lucian Freud',
    'hambling': 'Maggi Hambling',
    'hodgkin': 'Howard Hodgkin',
    'riley': 'Bridget Riley',
    'caro': 'Anthony Caro',
    'moore': 'Henry Moore',
    'hepworth': 'Barbara Hepworth',
    'rothko': 'Mark Rothko',
    'paolozzi': 'Eduardo Paolozzi',
    'smith': 'Richard Smith',
    'clough': 'Prunella Clough',
    'scott': 'William Scott',
    'bowling': 'Frank Bowling',
    'kossoff': 'Leon Kossoff',
    'auerbach': 'Frank Auerbach',
    'kitaj': 'R.B. Kitaj',
    'long': 'Richard Long',
    'rubens': 'Peter Paul Rubens',
    'van-dyck': 'Anthony van Dyck',
    'lely': 'Sir Peter Lely',
    'kneller': 'Sir Godfrey Kneller',
    'fuseli': 'Henry Fuseli',
    'unknown-artist-britain': 'Unknown Artist, Britain',
    'british-school': 'British School',
  };
  
  return artistMap[artistSlug] || artistSlug.split('-').map(w => 
    w.charAt(0).toUpperCase() + w.slice(1)
  ).join(' ');
}

function buildImageUrl(url) {
  // Extract Tate ID from URL (e.g., n00458, t05829, p03155)
  const match = url.match(/([a-z]\d+)$/);
  if (!match) return '';
  
  const tateId = match[1];
  const idUpper = tateId.toUpperCase();
  const prefix = idUpper.charAt(0);
  const midPart = idUpper.substring(0, 3);
  
  // Return high-res image URL
  return `https://media.tate.org.uk/art/images/work/${prefix}/${midPart}/${idUpper}_10.jpg`;
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

    // Assign room numbers 1, 2, 3...
    let roomNumber = 1;
    for (const room of item.rooms) {
      room.roomNumber = `Room ${roomNumber}`;
      console.log(`  ${room.roomNumber}: ${room.name} (${room.artworks?.length || 0} artworks)`);
      roomNumber++;

      if (!Array.isArray(room.artworks)) continue;

      for (const artwork of room.artworks) {
        const url = artwork.url;
        if (!url) continue;

        // Fix title if it's "Untitled" or missing
        if (!artwork.title || artwork.title === 'Untitled') {
          const extractedTitle = extractTitleFromUrl(url);
          if (extractedTitle) {
            artwork.title = extractedTitle;
          }
        }

        // Fix artist if missing
        if (!artwork.artist) {
          artwork.artist = extractArtistFromUrl(url);
        }

        // Fix image URL if missing or bad
        const hasBadImage = !artwork.image || 
                           artwork.image.includes('original_images') ||
                           artwork.image.includes('Lead_image');
        if (hasBadImage) {
          artwork.image = buildImageUrl(url);
        }

        // Remove bad dateText
        if (artwork.dateText?.includes('Until') || artwork.dateText?.includes('Feb')) {
          delete artwork.dateText;
        }

        fixed++;
      }
    }
  }

  // Save fixed data
  fs.writeFileSync(DISPLAYS_FILE, JSON.stringify(data, null, 2));
  console.log(`\n=== Done! Fixed ${fixed} artworks ===`);
}

main();
