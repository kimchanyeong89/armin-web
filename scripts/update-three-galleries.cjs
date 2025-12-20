/**
 * 3개 미술관 영구전시 업데이트
 * - 스크래핑된 컬렉션 데이터를 exhibitions.js에 연결
 * - 대표 이미지(representativeImage) 업데이트
 * - 영구전시(permanentExhibitions) 작품 연결
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../public/data');
const EXHIBITIONS_PATH = path.join(__dirname, '../src/data/exhibitions.js');

// 처리할 갤러리 목록
const GALLERIES = [
  {
    id: 'royal-academy',
    collectionFile: 'royal-academy-collection.json',
    exhibitionName: 'RA Collection',
    exhibitionId: 'ra-1'
  },
  {
    id: 'serpentine-gallery',
    collectionFile: 'serpentine-gallery-collection.json',
    exhibitionName: 'The Collection',
    exhibitionId: 'serp-collection'
  },
  {
    id: 'courtauld-gallery', 
    collectionFile: 'courtauld-gallery-collection.json',
    exhibitionName: 'The Courtauld Collection',
    exhibitionId: 'cg-1'
  }
];

async function main() {
  console.log('='.repeat(50));
  console.log('🔄 3개 미술관 영구전시 업데이트');
  console.log('='.repeat(50));
  
  // exhibitions.js 읽기
  let exhibitionsContent = fs.readFileSync(EXHIBITIONS_PATH, 'utf-8');
  
  const updates = [];
  
  for (const gallery of GALLERIES) {
    const collectionPath = path.join(DATA_DIR, gallery.collectionFile);
    
    if (!fs.existsSync(collectionPath)) {
      console.log(`⚠️  ${gallery.id}: 컬렉션 파일 없음 (${gallery.collectionFile})`);
      continue;
    }
    
    const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf-8'));
    console.log(`\n✅ ${gallery.id}: ${collection.totalObjects}개 작품 로드`);
    
    // coverImage가 있으면 대표 이미지 업데이트 정보 저장
    if (collection.coverImage) {
      updates.push({
        galleryId: gallery.id,
        coverImage: collection.coverImage,
        totalObjects: collection.totalObjects,
        exhibitionName: gallery.exhibitionName
      });
    }
    
    console.log(`   📷 대표 이미지: ${collection.coverImage ? '있음' : '없음'}`);
    console.log(`   🖼️  작품 수: ${collection.totalObjects}개`);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📝 업데이트 정보:');
  console.log('='.repeat(50));
  
  for (const update of updates) {
    console.log(`\n🏛️  ${update.galleryId}:`);
    console.log(`   전시명: ${update.exhibitionName}`);
    console.log(`   작품수: ${update.totalObjects}개`);
    console.log(`   대표이미지: ${update.coverImage?.substring(0, 60)}...`);
  }
  
  console.log('\n✅ 데이터 확인 완료!');
  console.log('\n💡 exhibitions.js의 representativeImage를 수동으로 업데이트하거나,');
  console.log('   각 갤러리의 영구전시에 artworks 필드를 추가할 수 있습니다.');
  console.log('\n💡 App.tsx에서 컬렉션 JSON을 로드하여 디테일 패널에 표시하세요.');
}

main().catch(console.error);
