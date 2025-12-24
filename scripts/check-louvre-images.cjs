const fs = require('fs');

const data = JSON.parse(fs.readFileSync('./public/data/louvre-painting-collection.json', 'utf-8'));
const objects = data.objects || [];

// 이미지 없는 경우 체크
const noImage = objects.filter(o => !o.image);
const hasImage = objects.filter(o => o.image);

console.log('총 작품:', objects.length);
console.log('이미지 있음:', hasImage.length);
console.log('이미지 없음:', noImage.length);
console.log('비율:', ((hasImage.length / objects.length) * 100).toFixed(1) + '%');

// 샘플로 이미지 없는 작품 몇 개 확인
if (noImage.length > 0) {
  console.log('\n이미지 없는 작품 샘플:');
  noImage.slice(0, 5).forEach((o, i) => {
    console.log((i+1) + '.', o.title, '-', o.artist);
  });
}
