const { exhibitions } = require('../src/data/exhibitions.js');

// IDs that have getFirstArtworkImage mapping
const hasMapping = [
  'vam-painting', 'vam-portraits', 'vam-posters', 'vam-photographs',
  'tm-perm-1', 'tm-perm-3', 'tsi-perm-1', 'tbc-perm-1', 'ng-1',
  'dpg-1', 'hayward-gallery-collection', 'ra-1', 'serp-collection',
  'cg-1', 'wag-collection', 'sng-collection', 'snpg-collection',
  'sngma-collection', 'bm-collection', 'npg-floor3-rooms'
];

const ukGalleries = ['tate-modern', 'tate-britain', 'national-gallery', 'national-portrait-gallery', 'vam', 'tate-liverpool', 'tate-st-ives', 'royal-academy', 'serpentine-gallery', 'courtauld-gallery', 'dulwich-picture-gallery', 'walker-art-gallery', 'scottish-national-gallery', 'scottish-national-portrait-gallery', 'scottish-national-gallery-of-modern-art', 'british-museum', 'hayward-gallery'];

console.log('Permanent exhibitions without image source:');
const noImagePermanent = [];

ukGalleries.forEach(gid => {
  const g = exhibitions.find(e => e.id === gid);
  if (!g) return;
  (g.permanentExhibitions || []).forEach(ex => {
    const hasImage = ex.image || ex.coverImage;
    const hasDataMapping = hasMapping.includes(ex.id);
    if (!hasImage && !hasDataMapping) {
      console.log('  ✗', gid, '-', ex.id, ex.name?.substring(0, 30));
      noImagePermanent.push(ex.id);
    }
  });
});

console.log('\nIDs to remove:', noImagePermanent);
