const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '../public/data/gallerie-accademia-venice-collection.json');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log('=== 이미지 URL 샘플 (처음 5개) ===');
data.objects.slice(0, 5).forEach((obj, i) => {
  console.log((i+1) + '.', obj.title.substring(0, 40));
  console.log('   Image:', obj.image);
  console.log();
});

console.log('=== 년도 없는 작품 ===');
const noYear = data.objects.filter(obj => !obj.year || obj.year.trim() === '');
console.log('Total without year:', noYear.length, 'out of', data.objects.length);
console.log('\nFirst 10:');
noYear.slice(0, 10).forEach((obj, i) => {
  console.log((i+1) + '.', obj.title.substring(0, 50));
  console.log('   Artist:', obj.artist);
  console.log('   Source:', obj.sourceUrl);
});

console.log('\n=== 이미지 URL 패턴 분석 ===');
const hasItok = data.objects.filter(obj => obj.image && obj.image.includes('itok=')).length;
const hasStyles = data.objects.filter(obj => obj.image && obj.image.includes('/styles/')).length;
console.log('With itok param:', hasItok);
console.log('With /styles/ (thumbnails):', hasStyles);
