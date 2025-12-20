/**
 * Fix Tate Modern Display data:
 * 1. Fix display titles (from img tags to actual names)
 * 2. Set cover image to first artwork's image
 * 3. Remove quotes from artwork titles
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../public/data/tate-modern.json');

// Display ID -> Correct Title mapping
const DISPLAY_TITLES = {
  'display-artist-and-society': 'Artist and Society',
  'display-in-the-studio': 'In the Studio',
  'display-materials-and-objects': 'Materials and Objects',
  'display-media-networks': 'Media Networks',
  'display-performer-and-participant': 'Performer and Participant',
  'display-tanks': 'Tanks',
  'display-artist-rooms-richard-long': 'Artist Rooms: Richard Long'
};

function removeQuotes(title) {
  if (!title) return title;
  // Unicode curly quotes: 8216 (') 8217 (') 8220 (") 8221 (")
  // Straight quotes: 39 (') 34 (")
  // Sometimes the same quote char is used on both sides
  const allQuotes = [
    String.fromCharCode(8216), // '
    String.fromCharCode(8217), // '
    String.fromCharCode(8220), // "
    String.fromCharCode(8221), // "
    "'", '"'
  ];
  
  let result = title;
  // Remove leading quote
  for (const q of allQuotes) {
    if (result.startsWith(q)) {
      result = result.slice(1);
      break;
    }
  }
  // Remove trailing quote
  for (const q of allQuotes) {
    if (result.endsWith(q)) {
      result = result.slice(0, -1);
      break;
    }
  }
  return result.trim();
}

function main() {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  
  let fixedTitles = 0;
  let fixedCovers = 0;
  let fixedArtworkTitles = 0;
  
  for (const item of data.items) {
    // Only process display items
    if (!item.id?.startsWith('display-')) continue;
    
    // 1. Fix display title
    if (DISPLAY_TITLES[item.id]) {
      console.log(`[Title] ${item.id}: "${item.title?.substring(0, 50)}..." -> "${DISPLAY_TITLES[item.id]}"`);
      item.title = DISPLAY_TITLES[item.id];
      fixedTitles++;
    }
    
    // 2. Find first artwork image for cover
    let firstArtworkImage = '';
    if (item.rooms) {
      for (const room of item.rooms) {
        if (room.artworks && room.artworks.length > 0) {
          for (const artwork of room.artworks) {
            if (artwork.image) {
              firstArtworkImage = artwork.image;
              break;
            }
          }
          if (firstArtworkImage) break;
        }
      }
    } else if (item.artworks && item.artworks.length > 0) {
      for (const artwork of item.artworks) {
        if (artwork.image) {
          firstArtworkImage = artwork.image;
          break;
        }
      }
    }
    
    if (firstArtworkImage && item.image !== firstArtworkImage) {
      console.log(`[Cover] ${item.id}: Set to first artwork image`);
      item.image = firstArtworkImage;
      fixedCovers++;
    }
    
    // 3. Remove quotes from artwork titles (directly modify in rooms)
    if (item.rooms) {
      for (const room of item.rooms) {
        if (room.artworks) {
          for (const artwork of room.artworks) {
            const originalTitle = artwork.title;
            const cleanTitle = removeQuotes(artwork.title);
            if (originalTitle !== cleanTitle) {
              artwork.title = cleanTitle;
              fixedArtworkTitles++;
            }
          }
        }
      }
    }
    
    // Also handle flat artworks array if exists
    if (item.artworks) {
      for (const artwork of item.artworks) {
        const originalTitle = artwork.title;
        const cleanTitle = removeQuotes(artwork.title);
        if (originalTitle !== cleanTitle) {
          artwork.title = cleanTitle;
          fixedArtworkTitles++;
        }
      }
    }
  }
  
  // Save
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  
  console.log('\n=== Summary ===');
  console.log(`Fixed ${fixedTitles} display titles`);
  console.log(`Fixed ${fixedCovers} cover images`);
  console.log(`Fixed ${fixedArtworkTitles} artwork titles (removed quotes)`);
  console.log('\nSaved to', DATA_PATH);
}

main();
