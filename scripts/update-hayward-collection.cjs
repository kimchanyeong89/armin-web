/**
 * Hayward Gallery Collection → exhibitions.js 업데이트
 * 
 * ARCHIVE_RULES.md에 따라:
 * - permanentExhibitions에 "The Collection" 추가
 * - 작품 정보 (artworks) 포함
 * - 설치 뷰, 포스터 등 비작품 자료 필터링
 */

const fs = require('fs');
const path = require('path');

const COLLECTION_JSON = path.join(__dirname, '../public/data/hayward-gallery-collection.json');
const EXHIBITIONS_JS = path.join(__dirname, '../src/data/exhibitions.js');

// 비작품 자료 필터링 - 전시장 사진 + 텍스트 문서 제외
function isActualArtwork(obj) {
  const title = (obj.title || '').toLowerCase();
  
  // 전시장 사진 + 텍스트 문서 제외
  const excludePatterns = [
    /^installation view/i,    // 설치 뷰
    /installation view:/i,    // 설치 뷰
    /exterior view/i,         // 외부 사진
    /hayward exterior/i,      // 헤이워드 외부
    /gallery exterior/i,      // 갤러리 외부
    // 텍스트 문서 제외
    /^maintenance information/i,  // 유지보수 정보
    /^letter /i,                  // 편지
    /^draft text/i,               // 초안 텍스트
    /^text for /i,                // ~을 위한 텍스트
    /^text on /i,                 // ~에 대한 텍스트
    /^list of /i,                 // 목록
    /^document /i,                // 문서
    /^sample letter/i,            // 샘플 편지
    /^thank you letter/i,         // 감사 편지
    /^short exhibition description/i,  // 짧은 전시 설명
  ];
  
  for (const pattern of excludePatterns) {
    if (pattern.test(title)) return false;
  }
  
  return true;
}

// "Additional Items"를 "Unknown"으로 변환
function normalizeArtist(artist) {
  if (!artist || artist === 'Additional Items') {
    return 'Unknown';
  }
  return artist;
}

async function updateExhibitions() {
  console.log('📊 Hayward Gallery Collection → exhibitions.js 업데이트\n');

  // 컬렉션 데이터 로드
  if (!fs.existsSync(COLLECTION_JSON)) {
    console.error('❌ 컬렉션 데이터 없음:', COLLECTION_JSON);
    process.exit(1);
  }

  const collection = JSON.parse(fs.readFileSync(COLLECTION_JSON, 'utf8'));
  console.log(`✅ ${collection.totalObjects}개 항목 로드됨`);

  // 실제 작품만 필터링
  const filteredObjects = collection.objects.filter(isActualArtwork);
  console.log(`🎨 실제 작품: ${filteredObjects.length}개 (${collection.totalObjects - filteredObjects.length}개 비작품 제외)`);

  // 작품 데이터를 artworks 형식으로 변환
  const artworks = filteredObjects.map(obj => ({
    id: obj.id,
    image: obj.image,
    artistName: normalizeArtist(obj.artist),
    title: obj.title,
    year: obj.year ? String(obj.year) : null
  }));

  // 영구전시 객체 생성
  const permanentExhibition = {
    id: 'hayward-gallery-collection',
    name: 'The Collection',
    title: 'The Collection',
    description: `Explore the Hayward Gallery's collection featuring ${collection.totalObjects} works from renowned contemporary artists including Bridget Riley, Tracey Emin, Wolfgang Tillmans, and many more.`,
    startDate: 'Permanent',
    endDate: 'Permanent',
    image: collection.coverImage,
    artworks: artworks
  };

  // exhibitions.js 읽기
  let content = fs.readFileSync(EXHIBITIONS_JS, 'utf8');

  // Hayward Gallery 섹션의 permanentExhibitions 찾기 (내용 있거나 빈 배열)
  const haywardMatch = content.match(/(id:\s*["']hayward-gallery["'][\s\S]*?permanentExhibitions:\s*\[)([\s\S]*?)(\],\s*temporaryExhibitions)/);
  
  if (!haywardMatch) {
    console.error('❌ Hayward Gallery permanentExhibitions 섹션을 찾을 수 없음');
    process.exit(1);
  }

  // artworks 배열을 문자열로 변환
  const artworksStr = artworks.map(a => {
    const yearStr = a.year ? `"${a.year}"` : 'null';
    const titleEscaped = a.title.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    const artistEscaped = a.artistName.replace(/"/g, '\\"');
    return `{ id: "${a.id}", image: "${a.image}", artistName: "${artistEscaped}", title: "${titleEscaped}", year: ${yearStr} }`;
  }).join(',\n          ');

  // 영구전시 문자열 생성
  const descEscaped = permanentExhibition.description.replace(/"/g, '\\"');
  const exhibitionStr = `
      {
        id: "${permanentExhibition.id}",
        name: "${permanentExhibition.name}",
        title: "${permanentExhibition.title}",
        description: "${descEscaped}",
        startDate: "Permanent",
        endDate: "Permanent",
        image: "${permanentExhibition.image}",
        artworks: [
          ${artworksStr}
        ]
      }
    `;

  // 기존 permanentExhibitions 내용을 새 내용으로 교체
  content = content.replace(
    /(id:\s*["']hayward-gallery["'][\s\S]*?permanentExhibitions:\s*\[)([\s\S]*?)(\],\s*temporaryExhibitions)/,
    `$1${exhibitionStr}$3`
  );

  // 파일 저장
  fs.writeFileSync(EXHIBITIONS_JS, content);
  console.log(`\n✅ exhibitions.js 업데이트 완료!`);
  console.log(`   - permanentExhibitions에 "The Collection" 추가`);
  console.log(`   - ${artworks.length}개 작품 포함`);
}

updateExhibitions().catch(console.error);
