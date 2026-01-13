const path = require('path');
const data = require(path.join(__dirname, '../public/data/gallerie-accademia-venice-collection.json'));
const artworks = data.objects || data;

function inferArtworkType(a) {
  if (a.type === '2D' || a.type === '3D') return a.type;
  const text = [
    a.category, a.artworkType, a.objectType,
    a.medium, a.technique, a.classification
  ].filter(Boolean).join(' ').toLowerCase();

  if (!text) return null;

  // 3D keywords
  if (/\b(sculpture|craft|ceramic|ceramics|pottery|installation|architecture|metal|wood|glass|furniture|costume|fashion|jewelry|bronze|stone|clay|plaster|lacquer|mask|doll|weapon|tool|coin|vessel|statue|statues|bust|relief|object|textile|porcelain|terracotta|skulptur|plastik|objekt|kunsthandwerk|marble)\b/i.test(text)) return '3D';

  // 2D keywords
  if (/\b(painting|drawing|print|prints|korean painting|calligraphy|photography|photo|sketch|watercolor|oil|ink|scroll|fan|album|rubbing|illustration|poster|graphic|collage|screen|book|manuscript|engraving|etching|lithograph|video|film|new media|multimedia|moving image|canvas|paper|zeichnung|druck|radierung|holzschnitt|lithografie|aquarell|tusche|gemälde|pastel|kreide|bild)\b/i.test(text)) return '2D';
  return null;
}

// 분류 결과
const results = { '2D': 0, '3D': 0, 'null': 0 };
const catByType = { '2D': {}, '3D': {}, 'null': {} };

for (const a of artworks) {
  const t = inferArtworkType(a);
  const key = t || 'null';
  results[key]++;
  const cat = a.category || 'unknown';
  catByType[key][cat] = (catByType[key][cat] || 0) + 1;
}

console.log('분류 결과:', results);
console.log('\n2D 카테고리:', catByType['2D']);
console.log('3D 카테고리:', catByType['3D']);
console.log('null 카테고리:', catByType['null']);
