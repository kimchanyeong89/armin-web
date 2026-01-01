const data = require('../public/data/musee-chagall-collection.json');

let placeholder = 0, valid = 0, noImage = 0;

for (const obj of data.objects) {
  const img = obj.image || obj.highResImage;
  if (!img) { 
    noImage++; 
    continue; 
  }
  if (/eJx/.test(img)) {
    placeholder++;
  } else {
    valid++;
  }
}

console.log('=== 샤갈 미술관 플레이스홀더 체크 ===');
console.log('총 작품:', data.objects.length);
console.log('유효 이미지:', valid);
console.log('플레이스홀더:', placeholder);
console.log('이미지 없음:', noImage);
