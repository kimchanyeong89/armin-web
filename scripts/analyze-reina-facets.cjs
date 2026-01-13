const fs = require('fs');

const parts = [];
for (let i = 1; i <= 8; i++) {
  const f = `public/data/reina-sofia-collection-part${i}.json`;
  if (fs.existsSync(f)) parts.push(...JSON.parse(fs.readFileSync(f, 'utf8')));
}

console.log('Total artworks:', parts.length);

// 2D detection patterns (should be checked FIRST)
const patterns2D = /oil|óleo|painting|pintura|canvas|lienzo|acrylic|acrílico|watercolor|acuarela|drawing|dibujo|print|estampa|photograph|foto|lithograph|litograf|etching|aguafuerte|engraving|grabado|woodcut|xilograf|screen\s?print|serigraf|paper|papel|ink|tinta|pencil|lápiz|charcoal|carboncillo|pastel|gouache|tempera|collage|paint\b|enamel/i;

// 3D detection patterns
const patterns3D = /sculpture|escultura|installation|instalaci|object\b|objeto\b|assemblage|cast|bronze|bronce|marble|mármol|metal\b|ceramic|cerámica|porcelain|terracotta/i;

// Wood pattern (standalone)
const patternWood = /\b(wood|madera)\b/i;

// Count 3D facets using proper 2D-first logic
function detectType(technique) {
  const t = (technique || '').toLowerCase();
  if (/video|film|animation|projection/i.test(t)) return 'video';
  // Check 2D FIRST (includes paint, enamel, etc.)
  if (patterns2D.test(t)) return '2D';
  // Then 3D
  if (patterns3D.test(t)) return '3D';
  // Wood only if not 2D
  if (patternWood.test(t) && !/cut|print|grab/i.test(t)) return '3D';
  return '2D';
}

// Facet regexes
const FACETS = {
  '2D': {
    'Canvas': /\bcanvas\b|\blienzo\b/i,
    'Paper': /\bpaper\b|\bcardboard\b|\bboard\b|\bpapel\b|\bcartón\b/i,
    'Photo': /photo|fotograf|gelatin|silver|chromogenic|c-?print|digital print|impresión digital/i,
    'Print': /lithograph|litograf|etching|aguafuerte|engraving|grabado|woodcut|xilograf|screen\s?print|serigraf|print\b|estampa/i,
    'Drawing': /drawing|dibujo|ink|tinta|pencil|lápiz|charcoal|carboncillo|pastel|gouache|watercolor|acuarela/i,
  },
  '3D': {
    'Wood': /\b(wood|madera)\b/i,
    'Install': /installation|instalaci|assemblage|object\b|objeto\b/i,
    'Metal': /\bmetal\b|hierro|acero|alumin|cobre|latón/i,
    'Sculpture': /sculpture|escultura|cast|bronze|bronce|marble|mármol/i,
    'Ceramic': /ceramic|cerámica|porcelain|terracotta/i,
  }
};

// Count by type
const type2D = parts.filter(a => detectType(a.technique) === '2D');
const type3D = parts.filter(a => detectType(a.technique) === '3D');
const typeVideo = parts.filter(a => detectType(a.technique) === 'video');

console.log('\n=== TYPE COUNTS ===');
console.log('2D:', type2D.length);
console.log('3D:', type3D.length);
console.log('Video:', typeVideo.length);

// Count 2D facets (only from 2D items)
console.log('\n=== 2D FACETS (from 2D items only) ===');
for (const [name, re] of Object.entries(FACETS['2D'])) {
  const count = type2D.filter(a => re.test(a.technique || '')).length;
  console.log(`${name}: ${count}`);
}

// Count 3D facets (only from 3D items)
console.log('\n=== 3D FACETS (from 3D items only) ===');
for (const [name, re] of Object.entries(FACETS['3D'])) {
  const count = type3D.filter(a => re.test(a.technique || '')).length;
  console.log(`${name}: ${count}`);
}

// Sample paint+wood items (should be 2D)
console.log('\n=== Sample "paint + wood" items (should be 2D) ===');
const paintWood = parts.filter(a => /paint|enamel|óleo|acrylic|acrílico/i.test(a.technique || '') && /wood|madera/i.test(a.technique || ''));
console.log(`Count: ${paintWood.length}`);
paintWood.slice(0, 5).forEach(a => console.log(`  - "${a.technique}" => ${detectType(a.technique)}`));

// Check if these are correctly classified as 2D
console.log('\n=== Verifying paint+wood classification ===');
const wronglyClassified = paintWood.filter(a => detectType(a.technique) === '3D');
console.log(`Wrongly classified as 3D: ${wronglyClassified.length}`);
if (wronglyClassified.length > 0) {
  wronglyClassified.slice(0, 3).forEach(a => console.log(`  - "${a.technique}"`));
}
