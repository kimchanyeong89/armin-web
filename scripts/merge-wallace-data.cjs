#!/usr/bin/env node
/**
 * v7 (제목) + v9 (이미지) 데이터 매칭
 * sourceUrl의 l숫자 ID로 매칭
 */

const fs = require('fs');
const path = require('path');

const v7File = path.join(__dirname, '../downloads/wallace-v7-progress.json');
const v9File = path.join(__dirname, '../downloads/wallace-v9-progress.json');
const outputFile = path.join(__dirname, '../public/data/wallace-collection.json');

function extractId(url) {
  if (!url) return null;
  const match = url.match(/sp=l(\d+)/);
  return match ? match[1] : null;
}

function main() {
  console.log('🔄 v7 + v9 데이터 매칭...\n');
  
  const v7Data = JSON.parse(fs.readFileSync(v7File, 'utf8'));
  const v9Data = JSON.parse(fs.readFileSync(v9File, 'utf8'));
  
  // v9에서 이미지 맵 생성 (ID -> 이미지 URL)
  const imageMap = new Map();
  for (const room of v9Data.rooms) {
    for (const artwork of room.artworks) {
      const id = extractId(artwork.sourceUrl);
      if (id && artwork.image) {
        imageMap.set(id, artwork.image);
      }
    }
  }
  
  console.log(`📷 v9에서 ${imageMap.size}개 이미지 맵 생성`);
  
  // v7 데이터에 이미지 매칭
  let matched = 0;
  let total = 0;
  
  const mergedRooms = v7Data.rooms.map(room => {
    const mergedArtworks = room.artworks.map(artwork => {
      total++;
      const id = extractId(artwork.sourceUrl);
      const image = id ? imageMap.get(id) : null;
      
      if (image) {
        matched++;
        return { ...artwork, image };
      }
      return artwork;
    });
    
    return { ...room, artworks: mergedArtworks };
  });
  
  console.log(`✅ ${matched}/${total} 작품 이미지 매칭됨\n`);
  
  // 결과 저장
  const result = {
    museum: 'The Wallace Collection',
    museumId: 'wallace-collection',
    location: 'London, UK',
    type: 'permanent',
    scrapedAt: new Date().toISOString(),
    totalRooms: mergedRooms.length,
    totalArtworks: total,
    artworksWithImages: matched,
    rooms: mergedRooms,
  };
  
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
  
  console.log('📁 저장됨:', outputFile);
  console.log(`🏠 ${mergedRooms.length}개 방`);
  console.log(`🖼️ ${total}개 작품 중 ${matched}개 이미지 있음`);
  
  // 샘플 출력
  console.log('\n샘플:');
  const sample = mergedRooms[0]?.artworks.slice(0, 3);
  sample?.forEach(art => {
    console.log(`  - ${art.title}`);
    console.log(`    이미지: ${art.image ? '✓' : '✗'}`);
  });
}

main();
