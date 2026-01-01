/**
 * Musée de l'Armée 데이터 정리 스크립트
 * - year: 복잡한 문자열에서 첫 번째 4자리 연도만 추출
 * - artist: "성, 이름" → "이름 성" 변환
 * - title: 제목 끝의 ", 연도" 패턴 제거
 * - imageUrl: 유효하지 않은 이미지 필터링
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const dataDir = path.join(__dirname, '..', 'public', 'data');
const files = [
  'musee-armee-peinture.json',
  'musee-armee-photographie.json',
  'musee-armee-dessin.json'
];

// 연도 추출: 첫 번째 4자리 연도 추출
function extractYear(yearText) {
  if (!yearText) return '';
  
  // "1912 (Date de signature), Troisième République" → "1912"
  // "XIXe siècle, 1855 (Avant)" → "1855"
  // "1627 (Entre), 1628 (Et)" → "1627"
  
  const match = String(yearText).match(/\b(\d{4})\b/);
  return match ? match[1] : '';
}

// 아티스트 이름 정리: "성, 이름" → "이름 성"
function cleanArtist(artist) {
  if (!artist) return 'Unknown';
  
  // "Anonyme" → "Anonymous"
  if (artist === 'Anonyme') return 'Anonymous';
  
  // "Detaille, Jean-Baptiste-Édouard" → "Jean-Baptiste-Édouard Detaille"
  // "Scott, Georges Bertin" → "Georges Bertin Scott"
  // "La Hyre, Laurent de" → "Laurent de La Hyre"
  
  if (artist.includes(', ')) {
    const parts = artist.split(', ');
    if (parts.length === 2) {
      const lastName = parts[0].trim();
      const firstName = parts[1].trim();
      return `${firstName} ${lastName}`;
    }
  }
  
  return artist;
}

// 제목 정리: 끝에 있는 ", 연도" 패턴 제거
// "Gare de l'Est, 1917" → "Gare de l'Est"
// "Village de Gerbéviller en Lorraine, 1915" → "Village de Gerbéviller en Lorraine"
// "Usines Opel, Stuttgart, 1945" → "Usines Opel, Stuttgart"
function cleanTitle(title) {
  if (!title) return '';
  
  // 제목 끝의 ", 연도" 패턴 제거
  // 패턴: ", " 다음에 4자리 연도로 끝나는 경우
  return title.replace(/,\s+\d{4}$/, '').trim();
}

// 이미지 URL 유효성 검사 (HEAD 요청으로 Content-Length 확인)
function checkImageUrl(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve(false);
      return;
    }
    
    const req = https.request(url, { method: 'HEAD', timeout: 5000 }, (res) => {
      const contentLength = parseInt(res.headers['content-length'] || '0', 10);
      // placeholder 이미지는 보통 작은 크기 (1KB 미만)
      // 실제 이미지는 보통 10KB 이상
      resolve(res.statusCode === 200 && contentLength > 5000);
    });
    
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function processFile(filename, checkImages = false) {
  const filePath = path.join(dataDir, filename);
  console.log(`\nProcessing: ${filename}`);
  
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  let titleCleanedCount = 0;
  let removedCount = 0;
  
  // 1단계: 제목과 아티스트 정리
  let artworks = data.artworks.map(artwork => {
    const originalTitle = artwork.title;
    const cleanedTitle = cleanTitle(artwork.title);
    
    if (originalTitle !== cleanedTitle) {
      titleCleanedCount++;
    }
    
    return {
      ...artwork,
      title: cleanedTitle
    };
  });
  
  // 2단계: 이미지 검증 (옵션)
  if (checkImages) {
    console.log(`  Checking ${artworks.length} images...`);
    const validArtworks = [];
    
    for (let i = 0; i < artworks.length; i++) {
      const artwork = artworks[i];
      const isValid = await checkImageUrl(artwork.imageUrl);
      
      if (isValid) {
        validArtworks.push(artwork);
      } else {
        removedCount++;
        if (removedCount <= 5) {
          console.log(`    Removed (no image): ${artwork.title}`);
        }
      }
      
      if ((i + 1) % 50 === 0) {
        console.log(`    Checked ${i + 1}/${artworks.length}...`);
      }
    }
    
    artworks = validArtworks;
  }
  
  data.artworks = artworks;
  
  // 정리된 데이터 저장
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`  Titles cleaned: ${titleCleanedCount}`);
  if (checkImages) {
    console.log(`  Removed (invalid images): ${removedCount}`);
  }
  console.log(`  Final count: ${data.artworks.length} artworks`);
  
  // 샘플 출력
  console.log(`  Sample:`);
  const sample = data.artworks[0];
  console.log(`    Title: ${sample.title}`);
  console.log(`    Artist: ${sample.artist}`);
  console.log(`    Year: ${sample.year}`);
}

const checkImages = process.argv.includes('--check-images');

console.log('=== Musée de l\'Armée Data Cleanup ===');
if (checkImages) {
  console.log('Image validation enabled (this may take a while)...');
}

(async () => {
  for (const file of files) {
    await processFile(file, checkImages);
  }
  console.log('\n✅ Cleanup complete!');
})();
