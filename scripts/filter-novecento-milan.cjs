const fs = require('fs');

// 기존 저장된 데이터 확인
const dataFile = 'public/data/museo-del-novecento-milan-collection.json';
const data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
console.log('현재 저장된 작품:', data.objects.length);

// 빈 제목이나 'Permanent Collection' 같은 것 제외하고 필터링
const filteredObjects = data.objects.filter(obj => {
  const title = obj.title || '';
  // 제외 패턴
  if (title.startsWith('Permanent Collection')) return false;
  if (title.startsWith('Room ')) return false;
  if (title.startsWith('Diario -')) return false;
  if (title.includes('Helical staircase')) return false;
  if (obj.artist === 'Unknown' && !obj.year) return false;
  return true;
});

console.log('필터링 후:', filteredObjects.length);

// ID 재생성
filteredObjects.forEach((obj, i) => {
  obj.id = 'museo-novecento-milan-' + i;
});

data.objects = filteredObjects;
data.coverImage = filteredObjects[0]?.image || '';

fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
console.log('저장 완료');
