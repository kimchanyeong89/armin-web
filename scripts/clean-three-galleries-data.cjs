/**
 * 3개 미술관 컬렉션 데이터 정리
 * - 아티스트 필드에서 날짜 제거
 * - 제목에서 연도 제거
 * - Unknown 아티스트 정리
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../public/data');

const COLLECTION_FILES = [
  'royal-academy-collection.json',
  'serpentine-gallery-collection.json',
  'courtauld-gallery-collection.json'
];

// 아티스트 필드 정리
function cleanArtist(artist) {
  if (!artist) return 'Unknown';
  
  // 끝에 날짜 패턴 제거 (예: "1778/", "2024-02", "20 July 2008 - 19 October")
  let cleaned = artist
    .replace(/\d{4}\/?\s*$/, '')  // "1778/" 또는 "1778" 끝
    .replace(/\d{4}-\d{2}.*$/, '')  // "2024-02" 이후
    .replace(/\d{1,2}\s+\w+\s+\d{4}\s*[-–]\s*\d{1,2}\s*\w*\s*\d{0,4}.*$/, '')  // "20 July 2008 - 19 October"
    .replace(/\d{4}\s*[-–]\s*\d{4}.*$/, '')  // "1613/1614"
    .trim();
  
  // 빈 문자열이면 Unknown
  if (!cleaned) return 'Unknown';
  
  // RA, A.R.A. 등 약어 정리
  cleaned = cleaned.replace(/\s+$/, '');
  
  return cleaned;
}

// 제목 정리
function cleanTitle(title) {
  if (!title) return title;
  
  // 끝에 연도 제거
  return title
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .replace(/\s*,\s*\d{4}\s*$/, '')
    .replace(/\s+\d{4}\s*$/, '')
    .trim();
}

async function main() {
  console.log('='.repeat(50));
  console.log('🧹 3개 미술관 컬렉션 데이터 정리');
  console.log('='.repeat(50));
  
  for (const filename of COLLECTION_FILES) {
    const filepath = path.join(DATA_DIR, filename);
    
    if (!fs.existsSync(filepath)) {
      console.log(`⚠️  ${filename}: 파일 없음`);
      continue;
    }
    
    const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    console.log(`\n📂 ${filename}`);
    console.log(`   원본 작품 수: ${data.objects.length}`);
    
    let artistFixed = 0;
    let titleFixed = 0;
    
    data.objects = data.objects.map(obj => {
      const originalArtist = obj.artist;
      const originalTitle = obj.title;
      
      const newArtist = cleanArtist(obj.artist);
      const newTitle = cleanTitle(obj.title);
      
      if (newArtist !== originalArtist) artistFixed++;
      if (newTitle !== originalTitle) titleFixed++;
      
      return {
        ...obj,
        artist: newArtist,
        title: newTitle
      };
    });
    
    // 저장
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    
    console.log(`   아티스트 수정: ${artistFixed}개`);
    console.log(`   제목 수정: ${titleFixed}개`);
    console.log(`   ✅ 저장 완료`);
  }
  
  console.log('\n✅ 정리 완료!');
}

main().catch(console.error);
