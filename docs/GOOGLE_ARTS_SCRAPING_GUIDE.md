# Google Arts & Culture 스크래핑 가이드

이 문서는 Google Arts & Culture에서 미술관/갤러리 컬렉션을 스크래핑하여 영구 전시(permanentExhibitions)로 아카이빙하는 방법을 설명합니다.

## 1. 개요

### 목적
- Google Arts & Culture 파트너 페이지의 컬렉션을 스크래핑
- 영구 전시 "The Collection"으로 아카이빙
- ARCHIVE_RULES.md에 따라 처리

### 주의사항
- Google Arts & Culture는 봇 감지가 있어 headless 브라우저 차단됨
- Playwright + visible browser 필수
- CAPTCHA가 나오면 수동으로 풀어야 함
- 이미지 URL은 `lh3.googleusercontent.com/ci/` 형식

## 2. 스크래핑 스크립트

### 기본 구조 (scripts/scrape-{gallery}-fast2.cjs 참조)

```javascript
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 설정
const BASE_URL = 'https://artsandculture.google.com/explore/collections/{partner-id}?c=assets';
const JSON_PATH = path.join(__dirname, '../public/data/{gallery}-collection.json');
const MAX_ITEMS = 1200;  // 최대 스크래핑 개수
const CONCURRENCY = 15;  // 동시 탭 개수

// macOS에서 Chromium 창 숨기기 (선택사항)
const { execSync } = require('child_process');
function hideChromiumWindows() {
  try {
    execSync(`osascript -e 'tell application "System Events" to set visible of (processes where name contains "Chromium") to false'`);
  } catch {}
}
```

### 핵심 로직

1. **메인 페이지에서 아이템 링크 수집**: 스크롤하며 모든 아이템 URL 수집
2. **병렬 탭으로 상세 페이지 방문**: 15개 탭 동시 처리
3. **이미지 URL 추출**: `lh3.googleusercontent.com/ci/` 패턴
4. **플레이스홀더 감지**: 동일 이미지가 3번 이상 나오면 플레이스홀더로 판단

### 이미지 URL 추출 방법

```javascript
// 상세 페이지에서 이미지 추출
const images = await page.$$eval('img[src*="lh3.googleusercontent.com"]', imgs => 
  imgs.map(img => img.src).filter(src => src.includes('/ci/'))
);

// 가장 큰 이미지 선택 (보통 첫 번째)
const bestImage = images[0]?.replace(/=w\d+/, '=w800') || null;
```

## 3. 데이터 처리

### JSON 구조

```json
{
  "partnerName": "Gallery Name",
  "partnerUrl": "https://artsandculture.google.com/partner/...",
  "scrapedAt": "2025-12-19T...",
  "totalObjects": 1045,
  "coverImage": "https://lh3.googleusercontent.com/ci/...",
  "objects": [
    {
      "id": "gallery-gac-0",
      "title": "Artwork Title",
      "artist": "Artist Name",
      "year": "1961",
      "image": "https://lh3.googleusercontent.com/ci/...=w800",
      "url": "https://artsandculture.google.com/asset/..."
    }
  ]
}
```

### 저장 위치
- `public/data/{gallery}-collection.json`

## 4. 필터링 규칙

### 아카이브 자료 vs 실제 작품

UI에서 "ARTWORKS ONLY" 토글로 필터링. 다음 패턴은 아카이브 자료로 분류:

```javascript
const archivalPatterns = [
  // 설치/외부 사진
  /^installation view/i,
  /installation view:/i,
  /exterior view/i,
  /gallery exterior/i,
  
  // 텍스트 문서
  /^maintenance information/i,
  /^letter /i,
  /^draft text/i,
  /^text for /i,
  /^text on /i,
  /^list of /i,
  /^document /i,
  /^sample letter/i,
  /^thank you letter/i,
  /^short exhibition description/i,
  
  // 전시 자료
  /^exhibition guide/i,
  /^marketing leaflet/i,
  /^press cutting/i,
  /^press release/i,
  /^private view/i,
  /^exhibitions leaflet/i,
  
  // 도면/다이어그램
  /^diagram /i,
  /^floorplan /i,
  /^freesheet /i,
  /walk guide/i,
  /^notes on /i,
  /^note on /i,
  /^catalogue /i,
];
```

### 아티스트명 정규화
- `"Additional Items"` → `"Unknown"`

## 5. exhibitions.js 업데이트

### 갤러리 구조

```javascript
{
  id: "{gallery-id}",
  slug: "{slug}",
  name: "Gallery Name",
  location: "Address",
  description: "Description",
  latitude: 51.5061,
  longitude: -0.1163,
  region: "London",
  representativeImage: "https://...logo.webp",
  permanentExhibitions: [
    {
      id: "{gallery-id}-collection",
      name: "The Collection",
      title: "The Collection",
      description: "Explore the gallery's collection...",
      startDate: "Permanent",
      endDate: "Permanent",
      image: "https://lh3.googleusercontent.com/ci/...",
      artworks: [...]  // 또는 JSON 파일에서 로드
    }
  ],
  temporaryExhibitions: [...]
}
```

## 6. ExhibitionModal.tsx 설정

### JSON 로드 핸들러 추가

```typescript
// {gallery}-collection 핸들러
if (exhibition.id === '{gallery-id}-collection') {
  (async () => {
    try {
      const res = await fetch('/data/{gallery}-collection.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load artworks');
      const data = await res.json();
      
      // 아카이브 자료 표시 (isArchival 플래그)
      const isArchival = (title: string) => {
        for (const pattern of archivalPatterns) {
          if (pattern.test(title)) return true;
        }
        return false;
      };
      
      const list = data.objects.map((item, idx) => ({
        id: item.id || `{gallery}-gac-${idx}`,
        name: item.title || 'Untitled',
        artist: item.artist === 'Additional Items' ? 'Unknown' : (item.artist || 'Unknown'),
        year: toYear(item.year),
        image: item.image,
        isArchival: isArchival(item.title || ''),
        // ...
      }));
      
      setArtworks(list.filter(a => !!a.image));
      setInitialized(true);
    } catch (error) {
      console.error('Failed to load artworks:', error);
    }
  })();
  return () => {};
}
```

### ARTWORKS ONLY 토글

```typescript
// State
const [showArtworksOnly, setShowArtworksOnly] = useState(false);

// Filter
if (showArtworksOnly && exhibition.id === '{gallery-id}-collection') {
  filtered = filtered.filter(a => !(a as any).isArchival);
}

// UI (년도 필터 아래)
{exhibition.id === '{gallery-id}-collection' && (
  <button onClick={() => setShowArtworksOnly(!showArtworksOnly)}>
    {showArtworksOnly ? '✓ ARTWORKS ONLY' : 'ARTWORKS ONLY'}
  </button>
)}
```

## 7. 이미지 로딩 이슈

### referrerPolicy 필수

Google 이미지는 외부 Referrer를 차단하므로 모든 `<img>` 태그에 추가:

```jsx
<img
  src={artwork.image}
  referrerPolicy="no-referrer"
  // ...
/>
```

## 8. 체크리스트

새 갤러리 스크래핑 시:

- [ ] 파트너 페이지 URL 확인: `https://artsandculture.google.com/partner/{partner-id}`
- [ ] 스크래핑 스크립트 생성: `scripts/scrape-{gallery}-fast2.cjs`
- [ ] JSON 저장: `public/data/{gallery}-collection.json`
- [ ] exhibitions.js에 갤러리 추가 (permanentExhibitions 포함)
- [ ] ExhibitionModal.tsx에 로드 핸들러 추가
- [ ] `referrerPolicy="no-referrer"` 확인
- [ ] ARTWORKS ONLY 토글 추가 (필요시)
- [ ] 빌드 테스트: `npm run build`

## 9. 2D/3D 작품 분류 (선택사항)

박물관 컬렉션의 경우 조각상, 유물 등 3D 작품과 회화, 사진 등 2D 작품을 구분하면 유용합니다.

### 분류 패턴

```javascript
// 3D 작품 감지 패턴
const PATTERNS_3D = [
  // 조각/입체
  /\bsculpture\b/i, /\bstatue\b/i, /\bstatuette\b/i, /\bfigurine\b/i,
  /\bbust\b/i, /\brelief\b/i, /\bhead of\b/i, /\bfigure of\b/i,
  
  // 유물/오브제
  /\bvase\b/i, /\bvessel\b/i, /\bjar\b/i, /\bbowl\b/i, /\bcup\b/i,
  /\bplate\b/i, /\bdish\b/i, /\bpot\b/i, /\burn\b/i, /\bamphora\b/i,
  
  // 무기/도구
  /\bsword\b/i, /\bdagger\b/i, /\bhelmet\b/i, /\bshield\b/i, /\barmour\b/i,
  
  // 장신구/보석
  /\bjewelry\b/i, /\bnecklace\b/i, /\bbracelet\b/i, /\bring\b/i, /\bamulet\b/i,
  
  // 건축/석재
  /\bstele\b/i, /\bslab\b/i, /\btablet\b/i, /\bsarcophagus\b/i, /\bmummy\b/i,
  
  // 기타
  /\bcoin\b/i, /\bmedal\b/i, /\bseal\b/i, /\bivory\b/i, /\bbox\b/i,
];

// 2D 작품 감지 패턴
const PATTERNS_2D = [
  /\bpainting\b/i, /\bdrawing\b/i, /\bsketch\b/i, /\bprint\b/i,
  /\bengraving\b/i, /\betching\b/i, /\blithograph\b/i, /\bwoodcut\b/i,
  /\bphotograph\b/i, /\bposter\b/i, /\bwatercolour\b/i, /\boil on\b/i,
  /\bportrait of\b/i, /\blandscape\b/i, /\bmap\b/i, /\bmanuscript\b/i,
  /\bpapyrus\b/i, /\bfresco\b/i, /\bmosaic\b/i, /\btapestry\b/i,
];
```

### 분류 함수

```javascript
function classifyArtworkType(title, description = '') {
  const text = `${title} ${description}`.toLowerCase();
  
  for (const pattern of PATTERNS_3D) {
    if (pattern.test(text)) return '3D';
  }
  for (const pattern of PATTERNS_2D) {
    if (pattern.test(text)) return '2D';
  }
  return 'unknown';
}
```

### JSON 구조 (2D/3D 포함)

```json
{
  "museum": "British Museum",
  "museumId": "british-museum",
  "collectionName": "The Collection",
  "stats": {
    "total": 100,
    "type2D": 15,
    "type3D": 72,
    "typeUnknown": 13
  },
  "objects": [
    {
      "id": "bm-gac-1",
      "title": "The Rosetta Stone",
      "artist": "Unknown",
      "year": -196,
      "image": "https://lh3.googleusercontent.com/ci/...",
      "type": "3D",
      "sourceUrl": "https://artsandculture.google.com/asset/..."
    }
  ]
}
```

### UI 필터링

```typescript
// 2D/3D 필터 상태
const [artworkTypeFilter, setArtworkTypeFilter] = useState<'all' | '2D' | '3D'>('all');

// 필터 적용
if (artworkTypeFilter !== 'all') {
  filtered = filtered.filter(a => (a as any).type === artworkTypeFilter);
}

// UI 버튼
<div className="flex gap-1">
  {['all', '2D', '3D'].map(type => (
    <button
      key={type}
      onClick={() => setArtworkTypeFilter(type as any)}
      className={artworkTypeFilter === type ? 'active' : ''}
    >
      {type === 'all' ? 'ALL' : type}
    </button>
  ))}
</div>
```

## 10. 참고 파일

- 스크래핑 스크립트: `scripts/scrape-hayward-fast2.cjs`, `scripts/scrape-british-museum-gac.cjs`
- 업데이트 스크립트: `scripts/update-hayward-collection.cjs`
- 컬렉션 JSON: `public/data/hayward-gallery-collection.json`, `public/data/british-museum-gac-collection.json`
- 전시 데이터: `src/data/exhibitions.js`
- 모달 컴포넌트: `src/components/ExhibitionModal.tsx`
