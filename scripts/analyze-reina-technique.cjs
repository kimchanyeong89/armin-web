const fs = require('fs');

const parts = [];
for (let i = 1; i <= 8; i++) {
  const f = `public/data/reina-sofia-collection-part${i}.json`;
  if (fs.existsSync(f)) parts.push(...JSON.parse(fs.readFileSync(f, 'utf8')));
}

console.log('Total artworks:', parts.length);

// 기법(Technique) 중심 분류 - 지지체(support)는 분류에 영향 없음
// 2D 기법: 표면에 무언가를 칠하거나 그리거나 인쇄하는 것
// 3D 기법: 입체적 형태를 만드는 것

// 2D 기법 패턴
const TECHNIQUE_2D = /oil|óleo|acrylic|acrílico|tempera|gouache|watercolor|acuarela|enamel|lacquer|paint|pintura|ink|tinta|pencil|lápiz|charcoal|carboncillo|pastel|crayon|drawing|dibujo|sketch|print|estampa|lithograph|litograf|etching|aguafuerte|engraving|grabado|woodcut|xilograf|screen\s?print|serigraf|silkscreen|monotype|photograph|foto|gelatin|silver|chromogenic|c-?print|daguerreotype|collage|mixed media|técnica mixta/i;

// 3D 기법 패턴 (입체 작업)
const TECHNIQUE_3D = /sculpture|escultura|carving|tallado|cast|fundición|molding|modeling|modelado|installation|instalación|instalaci|assemblage|ensamblaje|construction|construcción|relief|relieve|mobile|móvil/i;

function detectType(technique) {
  const t = (technique || '').toLowerCase();
  if (/video|film|animation|projection/i.test(t)) return 'video';
  // 2D 기법 우선 체크
  if (TECHNIQUE_2D.test(t)) return '2D';
  // 3D 기법
  if (TECHNIQUE_3D.test(t)) return '3D';
  // 기본값 (알 수 없으면 2D로)
  return '2D';
}

// 2D 하위 분류 (기법 중심)
const FACETS_2D = {
  'Oil': /oil|óleo/i,
  'Acrylic': /acrylic|acrílico/i,
  'Tempera/Gouache': /tempera|gouache|watercolor|acuarela/i,
  'Ink/Drawing': /ink|tinta|pencil|lápiz|charcoal|carboncillo|pastel|crayon|drawing|dibujo/i,
  'Print': /print|estampa|lithograph|litograf|etching|aguafuerte|engraving|grabado|woodcut|xilograf|screen\s?print|serigraf|silkscreen|monotype/i,
  'Photo': /photograph|foto|gelatin|silver|chromogenic|c-?print|daguerreotype/i,
  'Collage': /collage|mixed media|técnica mixta/i,
  'Enamel/Lacquer': /enamel|lacquer/i,
};

// 3D 하위 분류 (기법 중심)
const FACETS_3D = {
  'Sculpture': /sculpture|escultura|carving|tallado|cast|fundición|molding|modeling|modelado/i,
  'Installation': /installation|instalación|instalaci/i,
  'Assemblage': /assemblage|ensamblaje|construction|construcción/i,
  'Relief': /relief|relieve/i,
  'Object': /object|objeto/i,
};

// 타입별 카운트
const type2D = parts.filter(a => detectType(a.technique) === '2D');
const type3D = parts.filter(a => detectType(a.technique) === '3D');
const typeVideo = parts.filter(a => detectType(a.technique) === 'video');

console.log('\n=== TYPE COUNTS ===');
console.log('2D:', type2D.length);
console.log('3D:', type3D.length);
console.log('Video:', typeVideo.length);

// 2D 하위 분류 카운트
console.log('\n=== 2D FACETS (기법 중심) ===');
for (const [name, re] of Object.entries(FACETS_2D)) {
  const count = type2D.filter(a => re.test(a.technique || '')).length;
  console.log(`${name}: ${count}`);
}

// 3D 하위 분류 카운트
console.log('\n=== 3D FACETS (기법 중심) ===');
for (const [name, re] of Object.entries(FACETS_3D)) {
  const count = type3D.filter(a => re.test(a.technique || '')).length;
  console.log(`${name}: ${count}`);
}

// 문제 케이스 확인: "lacquer on metal", "enamel on wood" 등
console.log('\n=== Sample: 2D technique on 3D material ===');
const lacquerMetal = parts.filter(a => /lacquer|enamel/i.test(a.technique || '') && /metal|wood|madera/i.test(a.technique || ''));
console.log(`Count: ${lacquerMetal.length}`);
lacquerMetal.slice(0, 5).forEach(a => console.log(`  - "${a.technique}" => ${detectType(a.technique)}`));

// 3D로 분류된 항목들 샘플
console.log('\n=== Sample 3D items ===');
type3D.slice(0, 10).forEach(a => console.log(`  - "${a.technique}"`));
