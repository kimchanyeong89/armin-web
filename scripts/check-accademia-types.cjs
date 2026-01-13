const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('public/data/gallerie-accademia-venice-collection.json', 'utf8'));
const data = raw.objects || raw;

function inferArtworkType(a) {
  if (a.type === '2D' || a.type === '3D') return a.type;
  const text = [a.category, a.artworkType, a.objectType, a.medium, a.technique, a.classification].filter(Boolean).join(' ').toLowerCase();
  if (!text) return null;
  
  // 3D keywords
  if (/\b(sculpture|craft|ceramic|ceramics|pottery|installation|architecture|metal|wood|glass|furniture|costume|fashion|jewelry|bronze|stone|clay|plaster|lacquer|mask|doll|weapon|tool|coin|vessel|statue|statues|bust|relief|object|textile|porcelain|terracotta|skulptur|plastik|objekt|kunsthandwerk|marble)\b/i.test(text)) return '3D';
  
  // 2D keywords
  if (/\b(painting|drawing|print|prints|korean painting|calligraphy|photography|photo|sketch|watercolor|oil|ink|scroll|fan|album|rubbing|illustration|poster|graphic|collage|screen|book|manuscript|engraving|etching|lithograph|video|film|new media|multimedia|moving image|canvas|paper)\b/i.test(text)) return '2D';
  return null;
}

const typeMap = { '2D': 0, '3D': 0, 'null': 0 };
const catsByType = { '2D': {}, '3D': {}, 'null': {} };

for (const a of data) {
  const t = inferArtworkType(a) || 'null';
  typeMap[t]++;
  const cat = a.category || 'N/A';
  catsByType[t][cat] = (catsByType[t][cat] || 0) + 1;
}

console.log('타입별 분포:', typeMap);
console.log('\n2D 카테고리:', catsByType['2D']);
console.log('3D 카테고리:', catsByType['3D']);
console.log('null 카테고리:', catsByType['null']);

// Painting인데 3D로 분류된 케이스
const painting3D = data.filter(a => a.category === 'Painting' && inferArtworkType(a) === '3D');
console.log('\nPainting인데 3D로 분류:', painting3D.length);
if (painting3D.length > 0) {
  for (const p of painting3D.slice(0, 3)) {
    console.log('  -', p.title, '| medium:', p.medium);
  }
}
