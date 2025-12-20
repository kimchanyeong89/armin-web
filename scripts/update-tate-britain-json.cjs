const fs = require('fs');

const displays = JSON.parse(fs.readFileSync('public/data/tate-britain-displays.json', 'utf8'));
const britainJson = JSON.parse(fs.readFileSync('public/data/tate-britain.json', 'utf8'));

// Remove old display items
britainJson.items = britainJson.items.filter(item => {
  const id = item.id || '';
  return !id.includes('jmw-turner') && 
         !id.includes('historic-early-modern') && 
         !id.includes('modern-contemporary') && 
         !id.includes('art-around-building');
});

// Fallback images for displays
const fallbackImages = {
  'jmw-turner': 'https://media.tate.org.uk/art/images/work/N/N01/N01981_10.jpg',
  'historic-early-modern': 'https://media.tate.org.uk/art/images/work/T/T00/T00069_10.jpg',
  'modern-contemporary': 'https://media.tate.org.uk/art/images/work/T/T07/T07496_10.jpg',
  'art-around-building': 'https://media.tate.org.uk/aztate-prd-ew-dg-wgtail-st1-ctr-data/images/France_Lise_Mcgurn_Djanogly_Cafe_23.width-600.jpg'
};

// Add new display items from scraped data
for (const [key, display] of Object.entries(displays)) {
  const roomsWithArtworks = display.rooms.filter(r => r.artworks && r.artworks.length > 0);
  
  britainJson.items.push({
    id: display.id,
    name: display.name,
    title: display.title,
    description: display.description,
    startDate: display.startDate,
    endDate: display.endDate,
    image: fallbackImages[key] || display.image,
    url: display.url,
    museumName: display.museumName,
    museumLocation: display.museumLocation,
    rooms: roomsWithArtworks.map(r => ({
      id: r.id,
      name: r.name,
      roomNumber: r.roomNumber,
      description: r.description,
      url: r.url,
      artworkCount: r.artworks.length,
      artworks: r.artworks.map(a => ({
        url: a.url,
        title: a.title.replace('More on this artwork', '').trim() || 'Untitled'
      }))
    }))
  });
}

fs.writeFileSync('public/data/tate-britain.json', JSON.stringify(britainJson, null, 2));
console.log('Updated tate-britain.json with', britainJson.items.length, 'items');
console.log('Displays added:');
for (const [key, display] of Object.entries(displays)) {
  const roomsWithArtworks = display.rooms.filter(r => r.artworks && r.artworks.length > 0);
  console.log(`  - ${display.name}: ${roomsWithArtworks.length} rooms`);
}
