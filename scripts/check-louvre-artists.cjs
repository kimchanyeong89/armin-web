const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./public/data/louvre-painting-collection.json', 'utf-8'));

// 작가 이름이 박물관 패턴인 경우 찾기
const museumPatterns = ['Musée', 'Museum', 'Massey', 'Augustins', 'Mirande', 'Tarbes', 'Toulouse', 'Bordeaux', 'Lyon', 'Grenoble', 'Dijon', 'Strasbourg', 'Arts,', 'Beaux-Arts', 'Palais', 'Château'];

const suspicious = data.objects.filter(o => {
  if (!o.artist) return false;
  return museumPatterns.some(p => o.artist.includes(p));
});

console.log('의심스러운 작가명:', suspicious.length, '개');
console.log('\n샘플:');
suspicious.slice(0, 15).forEach((o, i) => {
  console.log((i+1) + '.', o.title?.substring(0, 25), '| artist:', o.artist);
});
