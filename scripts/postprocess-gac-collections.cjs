/**
 * GAC 컬렉션 데이터 후처리
 * - 제목/작가/년도 정리
 * - 2D/3D 판단
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../public/data');

// 정리할 컬렉션들
const COLLECTIONS = [
  'royal-academy-collection.json',
  'serpentine-gallery-collection.json',
  'courtauld-gallery-collection.json',
];

// 제목 정리
function cleanTitle(title, artist) {
  if (!title) return { title, extractedArtist: null };
  
  let extractedArtist = null;
  let cleaned = title;
  
  // "owned by Artist Name" 또는 "belonging to Artist Name" 패턴에서 작가 추출
  const ownedByMatch = cleaned.match(/\s+(?:owned\s+by|belonging\s+to)\s+([A-Z](?:[A-Za-z\.\s]|(?<=\.)[A-Z])+?)(?:\s*$)/i);
  if (ownedByMatch) {
    extractedArtist = ownedByMatch[1].trim();
  }
  
  // "by Artist Name" 패턴에서 작가 추출 (일반 경우, owned by 아닌 경우만)
  if (!extractedArtist) {
    const byMatch = cleaned.match(/(?<!owned\s)\bby\s+([A-Z](?:[A-Za-z\s]|(?:\.[A-Z]))+?)(?:\s*,|\s*(?<!\.[A-Z])\.|\s*$)/i);
    if (byMatch) {
      extractedArtist = byMatch[1].trim();
      // 작가가 이미 있으면 제목에서 "by ~" 제거
      if (artist && artist !== 'Unknown') {
        cleaned = cleaned.replace(/(?<!owned\s)\bby\s+[A-Z](?:[A-Za-z\s]|(?:\.[A-Z]))+?(?:\s*,|\s*(?<!\.[A-Z])\.|\s*$)/i, '');
      }
    }
  }
  
  cleaned = cleaned
    // "(pl.[31]) (1821)", "(pl.[31])" 패턴 제거 - 괄호 안
    .replace(/\s*\(pl\.?\s*\[?\d+\]?\)\s*\(\d{4}\)\s*$/i, '')  // (pl.[31]) (1821)
    .replace(/\s*\(pl\.?\s*\[?\d+\]?\)\s*$/i, '')               // (pl.[31])
    // "pl.2 (1808)", "pl. [2]", "pl. 18" 패턴 제거 - 콤마 뒤
    .replace(/,\s*pl\.?\s*\[?\d+\]?\s*\(\d{4}\)\s*$/i, '')      // , pl.2 (1808)
    .replace(/,\s*pl\.?\s*\[?\d+\]?\s*$/i, '')                   // , pl. 18 또는 , pl.[2]
    // "[Pl. 27]. (1810)" 같은 중복 패턴 제거
    .replace(/\s*\[Pl\.\s*\d+\]\.?\s*\(\d{4}\)\s*$/i, '')
    .replace(/\s*\[Pl\.\s*\d+\]\s*$/i, '')
    // 끝에 중복된 년도 패턴 제거: ", May 1914. (1914)" 또는 "(1914)"
    .replace(/,?\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)?\s*\d{4}\.?\s*\(\d{4}\)\s*$/i, '')
    .replace(/\s*\(\d{4}(?:\s*[-–]\s*\d{2,4})?\)\s*$/, '')
    .replace(/\s*,\s*\d{4}(?:\s*[-–]\s*\d{2,4})?\s*$/, '')
    .replace(/\s+\d{4}(?:\s*[-–]\s*\d{2,4})?\s*$/, '')
    .replace(/\s*\(\s*c\.\s*\d{4}(?:\s*[-–]\s*\d{2,4})?\)\s*$/, '')
    // 끝의 날짜 패턴: ", May 1914." 또는 ", May 1914"
    .replace(/,?\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\.?\s*$/i, '')
    // "(maker unknown)" 패턴 정리
    .replace(/\s*\(maker\s+unknown\)\s*/gi, ' ')
    // 끝의 콤마, 마침표 정리
    .replace(/[,\.]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  return { title: cleaned, extractedArtist };
}

// 작가 이름에서 년도 추출 및 정리
function cleanArtist(artist) {
  if (!artist || artist === 'Unknown') return { artist: 'Unknown', year: null };
  
  // 월 이름만 있는 경우 무효 (예: "May", "4th December")
  const monthOnlyPattern = /^(?:\d{1,2}(?:st|nd|rd|th)?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{1,2}(?:st|nd|rd|th)?)?$/i;
  if (monthOnlyPattern.test(artist.trim())) {
    return { artist: 'Unknown', year: null };
  }
  
  // "from the ..." 로 시작하는 경우 Unknown (위치 정보가 작가에 들어간 경우)
  if (/^from\s+the\s+/i.test(artist.trim())) {
    return { artist: 'Unknown', year: null };
  }
  
  // "(maker unknown)" 포함된 경우 Unknown
  if (/\(maker\s+unknown\)/i.test(artist)) {
    return { artist: 'Unknown', year: null };
  }
  
  // "After unidentified..." 패턴 → Unknown
  if (/^After\s+unidentified/i.test(artist.trim())) {
    return { artist: 'Unknown', year: null };
  }
  
  // 년도 추출 (끝에 붙은 년도)
  let year = null;
  const yearMatch = artist.match(/(\d{4})(?:\s*[-–;\/]\s*\d{2,4})?$/);
  if (yearMatch) {
    year = parseInt(yearMatch[1]);
  }
  
  // 작가 이름 정리
  let cleaned = artist
    // 공백 없이 붙은 세기 패턴 분리: "sculptor18th-century" → "sculptor"
    .replace(/(\w)\d{1,2}(?:st|nd|rd|th)?-century.*$/i, '$1')
    // "19th-century plaster cast..." 같은 매체 정보 제거
    .replace(/\s*\d{1,2}(?:st|nd|rd|th)?-century\s+(?:plaster|bronze|marble)\s+cast.*$/i, '')
    // ", made from..." 부분 제거
    .replace(/,?\s*made\s+from\s+.*$/i, '')
    // "Design by X" → "X"
    .replace(/^Design\s+by\s+/i, '')
    // "Designed by X" → "X"
    .replace(/^Designed\s+by\s+/i, '')
    // "Photographed by X" → "X"
    .replace(/^Photographed\s+by\s+/i, '')
    // "Published by X" → "X"
    .replace(/^Published\s+by\s+/i, '')
    // "Original attributed to X" → "X"
    .replace(/^Original\s+attributed\s+to\s+/i, '')
    // 끝에 붙은 날짜 패턴 제거: "31 March" 또는 "March 31", "4th December"
    .replace(/\s*\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s*$/i, '')
    .replace(/\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?\s*$/i, '')
    // 끝에 붙은 년도 패턴 제거 (공백 없이 붙은 경우도)
    .replace(/\d{4}(?:\s*[-–;\/,]\s*\d{2,4})*\s*$/, '')
    // "ca. May" 또는 "c. May" 같은 날짜 패턴 제거
    .replace(/c(?:a)?\.?\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)?\s*$/i, '')
    // c. 날짜 패턴 제거
    .replace(/c\.\s*\d{4}(?:\s*[-–]\s*\d{2,4})?\s*$/i, '')
    .replace(/c\.\s*$/i, '')
    // 시작 부분 년도 제거
    .replace(/^\s*\d{4}(?:\s*[-–;\/,]\s*\d{2,4})*\s*/, '')
    // 세기 패턴 제거: "late 18th century", "early 19th century"
    .replace(/\s*(?:late|early|mid)?\s*\d{1,2}(?:st|nd|rd|th)\s+century(?:\/early\s+\d{1,2}(?:st|nd|rd|th)\s+century)?\s*$/i, '')
    // 특수문자 정리
    .replace(/\s+/g, ' ')
    .replace(/[;\/,\?\.]\s*$/, '')
    .replace(/^\s*[;\/,]\s*/, '')
    .trim();
  
  // "Published in ..." 같은 경우 Unknown으로
  if (cleaned.startsWith('Published in')) {
    cleaned = 'Unknown';
  }
  
  return { artist: cleaned || 'Unknown', year };
}

// 2D/3D 판단
function determine3D(title, artist, medium, artworkType) {
  const text = `${title || ''} ${medium || ''} ${artworkType || ''}`.toLowerCase();
  
  const keywords3D = [
    'sculpture', 'statue', 'bust', 'relief', 'cast', 'tondo',
    'bronze', 'marble', 'stone', 'ceramic', 'porcelain', 'terracotta', 
    'plaster', 'installation', 'object', 'vessel', 'vase', 
    'figure', 'figurine', 'model', 'mask', 'head of'
  ];
  
  return keywords3D.some(k => text.includes(k));
}

// 컬렉션 처리
function processCollection(filename) {
  const filepath = path.join(DATA_DIR, filename);
  
  if (!fs.existsSync(filepath)) {
    console.log(`⚠️  ${filename} 없음`);
    return null;
  }
  
  const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  console.log(`\n📦 ${data.galleryName || filename}`);
  console.log(`   원본: ${data.objects.length}개`);
  
  let yearFixed = 0;
  let artistFixed = 0;
  let count3D = 0;
  
  data.objects = data.objects.map(obj => {
    const originalArtist = obj.artist;
    const originalYear = obj.year;
    
    // 작가 정리 및 년도 추출
    const { artist, year: artistYear } = cleanArtist(obj.artist);
    
    // 년도 결정 (기존 > 작가에서 추출)
    let finalYear = obj.year;
    if (!finalYear && artistYear) {
      finalYear = artistYear;
      yearFixed++;
    }
    
    // 제목 정리 및 "by ~"에서 작가 추출
    const { title, extractedArtist } = cleanTitle(obj.title, artist);
    
    // 최종 작가 결정 (비정상적으로 짧은 작가명도 Unknown으로 취급)
    let finalArtist = artist;
    const isInvalidArtist = !artist || artist === 'Unknown' || artist.length < 4;
    if (isInvalidArtist && extractedArtist) {
      finalArtist = extractedArtist;
      artistFixed++;
    } else if (artist !== obj.artist) {
      artistFixed++;
    }
    
    // 2D/3D 판단
    const is3D = determine3D(title, finalArtist, obj.medium, obj.artworkType);
    if (is3D) count3D++;
    
    return {
      ...obj,
      title,
      artist: finalArtist,
      year: finalYear,
      is3D: is3D || undefined,  // false면 저장 안함
    };
  });
  
  console.log(`   ✅ 작가 정리: ${artistFixed}개`);
  console.log(`   ✅ 년도 복구: ${yearFixed}개`);
  console.log(`   ✅ 3D 작품: ${count3D}개`);
  
  // 통계
  const withYear = data.objects.filter(o => o.year).length;
  const unknownArtist = data.objects.filter(o => o.artist === 'Unknown').length;
  console.log(`   📊 년도 정보: ${withYear}/${data.objects.length} (${(withYear/data.objects.length*100).toFixed(1)}%)`);
  console.log(`   📊 Unknown 작가: ${unknownArtist}개`);
  
  // 저장
  data.processedAt = new Date().toISOString();
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`   💾 저장 완료`);
  
  return data;
}

// 샘플 출력
function printSamples(data, count = 5) {
  console.log(`\n   샘플 (처리 후):`);
  data.objects.slice(0, count).forEach((o, i) => {
    console.log(`   ${i + 1}. ${o.title}`);
    console.log(`      작가: ${o.artist} | 년도: ${o.year} | 3D: ${o.is3D || false}`);
  });
}

// 메인
function main() {
  console.log('🔧 GAC 컬렉션 데이터 후처리');
  console.log('=' .repeat(50));
  
  for (const filename of COLLECTIONS) {
    const data = processCollection(filename);
    if (data) {
      printSamples(data, 3);
    }
  }
  
  console.log('\n\n✅ 모든 컬렉션 처리 완료!');
}

main();
