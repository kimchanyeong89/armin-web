const fs = require('fs');

const files = [
  'public/data/walker-art-gallery-collection.json',
  'public/data/scottish-national-gallery-collection.json', 
  'public/data/scottish-national-portrait-gallery-collection.json'
];

files.forEach(file => {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!data.coverImage && data.objects && data.objects.length > 0) {
    // 첫 번째 작품 이미지를 대표 이미지로 사용 (w1200 크기)
    const firstImage = data.objects[0].image;
    if (firstImage) {
      data.coverImage = firstImage.replace(/=w\d+$/, '=w1200');
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
      console.log(`✅ ${data.galleryName}: 대표 이미지 설정 완료`);
    }
  } else if (data.coverImage) {
    console.log(`✓ ${data.galleryName}: 이미 대표 이미지 있음`);
  }
});
