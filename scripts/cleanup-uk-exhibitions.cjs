const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/data/exhibitions.js');
let content = fs.readFileSync(filePath, 'utf8');

// IDs to remove - Hayward placeholders (second batch)
const haywardToRemove = new Set([
  'hayward-25119', // Sarah Lucas
  'hayward-25120', // Vlassis Caniaris
  'hayward-25121', // Phyllida Barlow
]);

// Exhibitions without any images to remove
// These are temporary/past exhibitions with NO_IMAGE and no data file
const noImageToRemove = {
  'tate-modern': {
    permanent: [], // Keep - have data files
    temporary: ['tm-temp-1', 'tm-temp-2'],
    past: ['tm-past-1', 'tm-past-2', 'tm-past-3']
  },
  'tate-britain': {
    permanent: [], // Keep tbc-perm-1 - has data file
    temporary: ['tb-temp-1', 'tb-temp-2'],
    past: ['tb-past-1', 'tb-past-2']
  },
  'national-gallery': {
    permanent: [], // Keep ng-1 - has data file  
    temporary: ['ng-t1'],
    past: ['ng-p1']
  },
  'national-portrait-gallery': {
    permanent: [], // Keep npg-floor3-rooms for now (has some structure)
    temporary: ['npg-temp-1', 'npg-temp-2', 'npg-temp-3', 'npg-temp-4'],
    past: ['npg-past-1', 'npg-past-2']
  },
  'vam': {
    permanent: [], // Keep - all have data files with images
    temporary: ['vam-t4', 'vam-t7', 'vam-t8', 'vam-t9', 'vam-t10', 'vam-t11', 'vam-t12', 'vam-t13', 'vam-t14', 'vam-t15', 'vam-t16', 'vam-t17'],
    past: ['vam-p1']
  },
  'tate-liverpool': {
    permanent: ['tl-1'], // No data file
    temporary: [],
    past: ['tl-p1', 'tl-p2']
  },
  'tate-st-ives': {
    permanent: [], // Keep tsi-perm-1 - has data file
    temporary: [],
    past: ['tsi-p1', 'tsi-p2', 'tsi-p3']
  },
  'scottish-national-gallery': {
    permanent: [], // Keep sng-collection - has data file
    temporary: ['sng-t1', 'sng-t2', 'sng-t3'],
    past: []
  },
  'royal-academy': {
    permanent: ['ra-2', 'ra-3'], // Keep ra-1 - has data file
    temporary: ['ra-t1', 'ra-t2', 'ra-t3', 'ra-t4', 'ra-t5', 'ra-t6'],
    past: ['ra-p1', 'ra-p2', 'ra-p3', 'ra-p4']
  },
  'serpentine-gallery': {
    permanent: [], // Keep serp-collection - has data file
    temporary: ['serp-t1', 'serp-t2', 'serp-t3'],
    past: ['serp-p1', 'serp-p2']
  },
  'dulwich-picture-gallery': {
    permanent: [],
    temporary: [],
    past: ['dpg-p1', 'dpg-p2', 'dpg-p3']
  },
  'courtauld-gallery': {
    permanent: [], // Keep cg-1 - has data file
    temporary: ['cg-t1', 'cg-t2'],
    past: ['cg-p1', 'cg-p2', 'cg-p3', 'cg-p4']
  },
  'manchester-art-gallery': {
    permanent: ['mag-1', 'mag-2'],
    temporary: ['mag-t1', 'mag-t2'],
    past: ['mag-p1', 'mag-p2']
  },
  'walker-art-gallery': {
    permanent: [], // Keep wag-collection - has data file
    temporary: ['wag-t1', 'wag-t2', 'wag-t3', 'wag-t4'],
    past: ['wag-p1', 'wag-p2']
  }
};

// Load current exhibitions to work with
const { exhibitions } = require('../src/data/exhibitions.js');

let totalRemoved = 0;

// Process each gallery
for (const gallery of exhibitions) {
  const toRemove = noImageToRemove[gallery.id];
  if (!toRemove) continue;
  
  const origPerm = gallery.permanentExhibitions?.length || 0;
  const origTemp = gallery.temporaryExhibitions?.length || 0;
  const origPast = gallery.pastExhibitions?.length || 0;
  
  if (toRemove.permanent.length > 0) {
    gallery.permanentExhibitions = (gallery.permanentExhibitions || [])
      .filter(e => !toRemove.permanent.includes(e.id));
  }
  if (toRemove.temporary.length > 0) {
    gallery.temporaryExhibitions = (gallery.temporaryExhibitions || [])
      .filter(e => !toRemove.temporary.includes(e.id));
  }
  if (toRemove.past.length > 0) {
    gallery.pastExhibitions = (gallery.pastExhibitions || [])
      .filter(e => !toRemove.past.includes(e.id));
  }
  
  const removed = (origPerm - (gallery.permanentExhibitions?.length || 0)) +
                  (origTemp - (gallery.temporaryExhibitions?.length || 0)) +
                  (origPast - (gallery.pastExhibitions?.length || 0));
  
  if (removed > 0) {
    console.log(`${gallery.id}: removed ${removed} exhibitions`);
    totalRemoved += removed;
  }
}

// Also remove Hayward placeholders
const hayward = exhibitions.find(e => e.id === 'hayward-gallery');
if (hayward) {
  const origPast = hayward.pastExhibitions?.length || 0;
  hayward.pastExhibitions = (hayward.pastExhibitions || [])
    .filter(e => !haywardToRemove.has(e.id));
  const removed = origPast - hayward.pastExhibitions.length;
  if (removed > 0) {
    console.log(`hayward-gallery: removed ${removed} placeholder exhibitions`);
    totalRemoved += removed;
  }
}

console.log(`\nTotal removed: ${totalRemoved}`);

// Now we need to write this back
// Since the structure is complex, let's regenerate the exhibitions array

function escapeString(s) {
  if (!s) return '';
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function serializeExhibitionItem(ex) {
  const parts = [];
  parts.push(`id: "${ex.id}"`);
  if (ex.name) parts.push(`name: "${escapeString(ex.name)}"`);
  if (ex.title) parts.push(`title: "${escapeString(ex.title)}"`);
  if (ex.description) parts.push(`description: "${escapeString(ex.description)}"`);
  if (ex.detailedDescription) parts.push(`detailedDescription: "${escapeString(ex.detailedDescription)}"`);
  if (ex.image) parts.push(`image: "${ex.image}"`);
  if (ex.coverImage) parts.push(`coverImage: "${ex.coverImage}"`);
  if (ex.url) parts.push(`url: "${ex.url}"`);
  if (ex.startDate) parts.push(`startDate: "${ex.startDate}"`);
  if (ex.endDate) parts.push(`endDate: "${ex.endDate}"`);
  if (ex.pricing) parts.push(`pricing: "${escapeString(ex.pricing)}"`);
  if (ex.artworks) parts.push(`artworks: ${JSON.stringify(ex.artworks)}`);
  return `{ ${parts.join(', ')} }`;
}

// For simplicity, let's just filter out the IDs from the file using regex
// This is more reliable than full serialization

// Collect all IDs to remove
const allIdsToRemove = new Set([...haywardToRemove]);
Object.values(noImageToRemove).forEach(gallery => {
  gallery.permanent.forEach(id => allIdsToRemove.add(id));
  gallery.temporary.forEach(id => allIdsToRemove.add(id));
  gallery.past.forEach(id => allIdsToRemove.add(id));
});

console.log('\nIDs to remove:', [...allIdsToRemove].length);

// Read file and remove entries
let newContent = content;
for (const id of allIdsToRemove) {
  // Match patterns like: { id: "xxx", ... }
  // This is a bit risky but should work for most cases
  const regex = new RegExp(`\\{[^{}]*id:\\s*"${id}"[^{}]*\\},?\\s*`, 'g');
  newContent = newContent.replace(regex, '');
}

// Clean up any leftover empty lines and trailing commas
newContent = newContent.replace(/,(\s*)\]/g, '$1]');
newContent = newContent.replace(/\[\s*,/g, '[');

fs.writeFileSync(filePath, newContent);
console.log('\nUpdated exhibitions.js');
