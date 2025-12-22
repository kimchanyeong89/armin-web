const fs = require('fs');
const path = require('path');

// Check which exhibitions have actual data files with images
const dataDir = path.join(__dirname, '../public/data');

// Known data file mappings
const dataFileMappings = {
  'vam-painting': 'vam-paintings.json',
  'vam-portraits': 'vam-portraits.json', 
  'vam-posters': 'vam-posters.json',
  'vam-photographs': 'vam-photographs.json',
  'tm-perm-1': 'tate-collection-highlights-artworks.json',
  'tm-perm-3': 'tate-artworks.json',
  'tsi-perm-1': 'tate-st-ives-artworks.json',
  'tbc-perm-1': 'tate-britain-artworks.json',
  'ng-1': 'national-gallery-permanent.json',
  'dpg-1': 'dulwich-collection.json',
  'hayward-gallery-collection': 'hayward-gallery-collection.json',
  'ra-1': 'royal-academy-collection.json',
  'serp-collection': 'serpentine-gallery-collection.json',
  'cg-1': 'courtauld-gallery-collection.json',
  'wag-collection': 'walker-art-gallery-collection.json',
  'sng-collection': 'scottish-national-gallery-collection.json',
  'snpg-collection': 'scottish-national-portrait-gallery-collection.json',
  'sngma-collection': 'scottish-national-gallery-of-modern-art-collection.json',
  'bm-collection': 'the-british-museum-collection.json',
  'npg-floor3-rooms': 'npg-floor3.json',
};

console.log('Checking data files for modal page images...\n');

const hasImages = [];
const noImages = [];

for (const [exId, fileName] of Object.entries(dataFileMappings)) {
  const filePath = path.join(dataDir, fileName);
  
  if (!fs.existsSync(filePath)) {
    noImages.push({ id: exId, file: fileName, reason: 'FILE_NOT_FOUND' });
    continue;
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let items = [];
    
    // Different data structures
    if (Array.isArray(data)) {
      items = data;
    } else if (data.items) {
      items = data.items;
    } else if (data.objects) {
      items = data.objects;
    } else if (data.rooms) {
      // NPG floor3 format
      items = data.rooms.flatMap(r => r.items || []);
    } else if (data.artworks) {
      items = data.artworks;
    }
    
    const imagesCount = items.filter(it => it && (it.image || it.thumb)).length;
    
    if (imagesCount > 0) {
      hasImages.push({ id: exId, file: fileName, count: imagesCount });
    } else {
      noImages.push({ id: exId, file: fileName, reason: 'NO_IMAGES_IN_DATA', itemCount: items.length });
    }
  } catch (e) {
    noImages.push({ id: exId, file: fileName, reason: 'PARSE_ERROR', error: e.message });
  }
}

console.log('=== HAS IMAGES (keep these) ===');
hasImages.forEach(h => console.log(`✓ ${h.id} - ${h.file} (${h.count} images)`));

console.log('\n=== NO IMAGES (remove these) ===');
noImages.forEach(n => console.log(`✗ ${n.id} - ${n.file} - ${n.reason}`));

// List all data files
console.log('\n=== ALL DATA FILES ===');
const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
files.forEach(f => console.log('  ', f));
