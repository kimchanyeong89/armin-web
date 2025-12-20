const fs = require('fs');
const path = require('path');

const displaysPath = path.join(__dirname, '../public/data/tate-britain-displays.json');
const mainPath = path.join(__dirname, '../public/data/tate-britain.json');

function cleanTitle(title) {
  if (!title) return title;
  let cleaned = title.trim();
  // Remove leading/trailing single quotes
  if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
    cleaned = cleaned.slice(1, -1);
  }
  return cleaned;
}

// Fix tate-britain-displays.json
const displays = JSON.parse(fs.readFileSync(displaysPath, 'utf8'));
let count1 = 0;
for (const display of Object.values(displays)) {
  if (display.rooms) {
    for (const room of display.rooms) {
      if (room.artworks) {
        for (const artwork of room.artworks) {
          const old = artwork.title;
          artwork.title = cleanTitle(artwork.title);
          if (old !== artwork.title) count1++;
        }
      }
    }
  }
}
fs.writeFileSync(displaysPath, JSON.stringify(displays, null, 2));
console.log('Fixed', count1, 'titles in displays');

// Fix tate-britain.json
const main = JSON.parse(fs.readFileSync(mainPath, 'utf8'));
let count2 = 0;
for (const item of main.items) {
  if (item.rooms) {
    for (const room of item.rooms) {
      if (room.artworks) {
        for (const artwork of room.artworks) {
          const old = artwork.title;
          artwork.title = cleanTitle(artwork.title);
          if (old !== artwork.title) count2++;
        }
      }
    }
  }
}
fs.writeFileSync(mainPath, JSON.stringify(main, null, 2));
console.log('Fixed', count2, 'titles in main');
