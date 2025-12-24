const fs = require('fs');
const data = JSON.parse(fs.readFileSync('public/data/petit-palais-collection.json', 'utf8'));

// 170번 이후 작품들 확인
console.log('=== 170번 이후 작품 ===');
data.objects.slice(169, 185).forEach((obj, i) => {
  const hasImage = obj.image && obj.image.length > 10;
  console.log((170+i) + '. ' + obj.title.substring(0, 35));
  console.log('   Artist: ' + obj.artist);
  console.log('   Image: ' + (hasImage ? 'YES' : 'NO'));
  console.log('');
});

// 이미지 없는 작품 수
const noImage = data.objects.filter(o => {
  return !o.image || o.image === '';
});
console.log('\n이미지 없는 작품: ' + noImage.length + '개');

// 괄호 안 닫힌 작가 이름
const badArtists = data.objects.filter(o => {
  return o.artist && o.artist.includes('(') && !o.artist.includes(')');
});
console.log('괄호 안 닫힌 작가: ' + badArtists.length + '개');
badArtists.forEach(o => console.log('  - ' + o.artist));
