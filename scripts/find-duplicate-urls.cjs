const data = require('../public/data/royal-academy-collection.json');

// 이미지별로 그룹화
const byImage = {};
data.objects.forEach(item => {
  const img = item.image;
  if (!byImage[img]) byImage[img] = [];
  byImage[img].push(item);
});

// 10개 이상 중복 = placeholder
console.log('=== 10개 이상 중복된 이미지 (placeholder) ===\n');
Object.entries(byImage)
  .filter(([img, items]) => items.length >= 10)
  .forEach(([img, items]) => {
    console.log('Count:', items.length);
    console.log('Image URL:', img);
    console.log('');
  });

// 총 placeholder 수
const placeholderCount = Object.entries(byImage)
  .filter(([img, items]) => items.length >= 3)
  .reduce((sum, [img, items]) => sum + items.length, 0);

console.log('Total artworks with placeholder (3+ duplicates):', placeholderCount);
console.log('Total artworks:', data.objects.length);
console.log('Real images:', data.objects.length - placeholderCount);
