/**
 * Hayward Gallery exhibitions.js 업데이트 스크립트
 * 스크래핑한 JSON 데이터를 exhibitions.js에 통합
 */

const fs = require('fs');
const path = require('path');

// JSON 데이터 로드
const jsonPath = path.join(__dirname, '..', 'public', 'data', 'hayward-gallery-exhibitions.json');
const exhibitionsJsPath = path.join(__dirname, '..', 'src', 'data', 'exhibitions.js');

if (!fs.existsSync(jsonPath)) {
  console.error('❌ JSON 파일을 찾을 수 없습니다:', jsonPath);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
console.log(`📊 ${data.totalExhibitions}개 전시 데이터 로드 완료\n`);

// 현재 날짜 기준으로 분류
const today = new Date().toISOString().split('T')[0];

const current = [];
const upcoming = [];
const past = [];

for (const ex of data.exhibitions) {
  // 타이틀 정리 (줄바꿈, HTML entities 제거)
  const cleanTitle = (ex.title || '')
    .replace(/\n/g, ' ')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  
  const exhibition = {
    id: ex.id,
    name: cleanTitle,
    title: cleanTitle,
    description: (ex.description || '').trim(),
    coverImage: ex.coverImageR2 || ex.coverImage || null,
    sourceUrl: ex.sourceUrl || null,
  };
  
  // 날짜가 있는 경우
  if (ex.startDate && ex.endDate) {
    exhibition.startDate = ex.startDate;
    exhibition.endDate = ex.endDate;
    
    if (ex.startDate > today) {
      upcoming.push(exhibition);
    } else if (ex.endDate >= today) {
      current.push(exhibition);
    } else {
      past.push(exhibition);
    }
  } else if (ex.endDate) {
    // 종료일만 있는 경우
    exhibition.endDate = ex.endDate;
    if (ex.endDate >= today) {
      current.push(exhibition);
    } else {
      past.push(exhibition);
    }
  } else if (ex.startDate) {
    // 시작일만 있는 경우
    exhibition.startDate = ex.startDate;
    if (ex.startDate > today) {
      upcoming.push(exhibition);
    } else {
      past.push(exhibition);
    }
  } else {
    // 날짜 없는 경우 - past로 분류 (아카이브 데이터이므로)
    past.push(exhibition);
  }
}

// 정렬: 최신순
current.sort((a, b) => (b.endDate || b.startDate || '').localeCompare(a.endDate || a.startDate || ''));
upcoming.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
past.sort((a, b) => (b.endDate || b.startDate || '').localeCompare(a.endDate || a.startDate || ''));

console.log(`📅 분류 결과:`);
console.log(`  - 현재 전시: ${current.length}개`);
console.log(`  - 예정 전시: ${upcoming.length}개`);
console.log(`  - 과거 전시: ${past.length}개\n`);

// 전시 객체를 JS 코드로 변환
function formatExhibition(ex) {
  const parts = [];
  parts.push(`id: "${ex.id}"`);
  parts.push(`name: "${ex.name.replace(/"/g, '\\"')}"`);
  parts.push(`title: "${ex.title.replace(/"/g, '\\"')}"`);
  
  if (ex.description) {
    // 단락 구분 유지: \r\n 또는 \n\n을 \\n\\n으로 이스케이프
    // 단일 줄바꿈은 \\n으로 이스케이프
    const cleanDesc = ex.description
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r\n\r\n/g, '\\n\\n')  // 단락 구분 (더블)
      .replace(/\n\n/g, '\\n\\n')       // 단락 구분
      .replace(/\r\n/g, '\\n')          // 단일 줄바꿈
      .replace(/\r/g, '\\n')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, ' ')
      .trim();
    parts.push(`description: "${cleanDesc}"`);
    // detailedDescription도 추가해서 Description 버튼이 나타나도록 함
    parts.push(`detailedDescription: "${cleanDesc}"`);
  }
  
  if (ex.coverImage) {
    parts.push(`coverImage: "${ex.coverImage}"`);
  }
  
  // sourceUrl 추가 (url 필드로)
  if (ex.sourceUrl) {
    parts.push(`url: "${ex.sourceUrl}"`);
  }
  
  if (ex.startDate) {
    parts.push(`startDate: "${ex.startDate}"`);
  }
  
  if (ex.endDate) {
    parts.push(`endDate: "${ex.endDate}"`);
  }
  
  return `{ ${parts.join(', ')} }`;
}

// exhibitions.js 업데이트 - Hayward Gallery 섹션만 교체
let exhibitionsJs = fs.readFileSync(exhibitionsJsPath, 'utf8');

// Hayward Gallery 섹션 찾기
const haywardStart = exhibitionsJs.indexOf('id: "hayward-gallery"');
if (haywardStart === -1) {
  console.error('❌ Hayward Gallery 섹션을 찾을 수 없습니다');
  process.exit(1);
}

// 해당 갤러리 객체의 시작과 끝 찾기
let braceCount = 0;
let objStart = -1;
let objEnd = -1;

// 객체 시작 찾기 (역방향)
for (let i = haywardStart; i >= 0; i--) {
  if (exhibitionsJs[i] === '{') {
    objStart = i;
    break;
  }
}

// 객체 끝 찾기
braceCount = 0;
for (let i = objStart; i < exhibitionsJs.length; i++) {
  if (exhibitionsJs[i] === '{') braceCount++;
  if (exhibitionsJs[i] === '}') braceCount--;
  if (braceCount === 0) {
    objEnd = i + 1;
    break;
  }
}

// 새 Hayward Gallery 객체 생성
const temporaryExhibitionsCode = current.map(ex => `      ${formatExhibition(ex)}`).join(',\n');
const upcomingExhibitionsCode = upcoming.map(ex => `      ${formatExhibition(ex)}`).join(',\n');
const pastExhibitionsCode = past.map(ex => `      ${formatExhibition(ex)}`).join(',\n');

const newHaywardObj = `{
    id: "hayward-gallery",
    slug: "hayward",
    name: "Hayward Gallery",
    location: "Southbank Centre, Belvedere Road, London SE1 8XX",
    description: "A world-renowned contemporary art gallery and a landmark of brutalist architecture on the South Bank.",
    latitude: 51.5061,
    longitude: -0.1163,
    region: "London",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/galleries/hayward/building.webp",
    permanentExhibitions: [],
    temporaryExhibitions: [
${temporaryExhibitionsCode || '      // No current exhibitions'}
    ],
    upcomingExhibitions: [
${upcomingExhibitionsCode || '      // No upcoming exhibitions'}
    ],
    pastExhibitions: [
${pastExhibitionsCode}
    ]
  }`;

// 교체
const updatedJs = exhibitionsJs.substring(0, objStart) + newHaywardObj + exhibitionsJs.substring(objEnd);

// 저장
fs.writeFileSync(exhibitionsJsPath, updatedJs, 'utf8');

console.log(`✅ exhibitions.js 업데이트 완료!`);
console.log(`📁 ${exhibitionsJsPath}`);
console.log(`\n📊 최종 결과:`);
console.log(`  - temporaryExhibitions: ${current.length}개`);
console.log(`  - upcomingExhibitions: ${upcoming.length}개`);
console.log(`  - pastExhibitions: ${past.length}개`);
console.log(`  - 총: ${current.length + upcoming.length + past.length}개 전시`);
