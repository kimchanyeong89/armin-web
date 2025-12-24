const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/Users/kietzsche/armin-web-main/public/data/marmottan-collection.json', 'utf-8'));

// 작가명에서 생몰년 제거하고 제목/연도 수정
data.objects = data.objects.map(obj => {
  let artist = obj.artist;
  let title = obj.title;
  let year = obj.year;
  
  // '1830 ; 1903' 형태의 생몰년이 아티스트에 있으면 제거 (파싱 오류)
  const lifeYearMatch = artist.match(/^(\d{4})\s*[;–-]\s*(\d{4})$/);
  if (lifeYearMatch) {
    artist = 'Unknown';
  }
  
  // 아티스트명에 생몰년 포함된 경우 제거
  artist = artist.replace(/\s*:\s*\d{4}\s*[;–-]\s*\d{4}$/, '').trim();
  artist = artist.replace(/\s+\d{4}\s*[;–-]\s*\d{4}$/, '').trim();
  
  // year에서 'vers', 'entre' 등 불필요한 텍스트 제거
  if (year) {
    const yearMatch = year.match(/(\d{4})/);
    year = yearMatch ? yearMatch[1] : '';
  }
  
  return { ...obj, artist, title, year };
});

fs.writeFileSync('/Users/kietzsche/armin-web-main/public/data/marmottan-collection.json', JSON.stringify(data, null, 2));
console.log('수정 완료!');

// 확인
const fixed = JSON.parse(fs.readFileSync('/Users/kietzsche/armin-web-main/public/data/marmottan-collection.json', 'utf-8'));
console.log('\n수정 후 마지막 5개:');
fixed.objects.slice(-5).forEach(obj => {
  console.log('  -', obj.artist + ':', obj.title, '(' + obj.year + ')');
});
