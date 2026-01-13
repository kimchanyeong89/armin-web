const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('public/data/smb-bode-museum-collection.json', 'utf8'));
const data = raw.artworks || raw;
console.log('Total:', data.length);

// medium/technique 분석
const mediums = {};
data.forEach(a => {
  const t = (a.medium || a.technique || '').toLowerCase();
  if (t) mediums[t] = (mediums[t] || 0) + 1;
});

console.log('\n=== Top medium values ===');
Object.entries(mediums).sort((a,b) => b[1] - a[1]).slice(0, 50).forEach(([k,v]) => console.log(v, k));

// 2D/3D 패턴
const patterns2D = /oil|óleo|olio|acrylic|acrílico|acrilico|tempera|gouache|watercolor|acuarela|acquarello|enamel|lacquer|paint|pintura|ink|tinta|inchiostro|pencil|lápiz|matita|charcoal|carboncillo|carbone|pastel|crayon|drawing|dibujo|disegno|sketch|print|estampa|stampa|lithograph|litograf|etching|aguafuerte|acquaforte|engraving|grabado|incisione|woodcut|xilograf|xilografia|screen\s?print|serigraf|serigrafia|silkscreen|monotype|photograph|foto|gelatin|silver|chromogenic|c-?print|daguerreotype|collage|mixed media|técnica mixta|tecnica mista/i;

const patterns3D = /sculpture|scultura|escultura|carving|tallado|intaglio|cast|getto|fundición|molding|modeling|modelado|modellato|installation|instalación|instalaci|installazione|assemblage|ensamblaje|construction|construcción|costruzione|relief|relieve|mobile|móvil|marble|marmo|marmi|mármol|pietra|calcare|calcarea|granito|granite|alabast|serpentin|legno|wood|madera|bronze|bronzo|bronce|ceramic|cerámica|porcelain|terracotta|bust|statue|object|textile/i;

// N으로 분류되는 항목 확인
let uncategorized = 0;
const uncatSamples = [];
data.forEach(a => {
  const text = [a.type, a.category, a.artworkType, a.objectType, a.medium, a.technique, a.classification].filter(Boolean).join(' ').toLowerCase();
  const is2D = patterns2D.test(text);
  const is3D = patterns3D.test(text);
  if (!is2D && !is3D) {
    uncategorized++;
    if (uncatSamples.length < 20) uncatSamples.push(text.substring(0, 100));
  }
});

console.log('\n=== Uncategorized (N) count:', uncategorized);
console.log('Samples:');
uncatSamples.forEach(s => console.log('  -', s));
