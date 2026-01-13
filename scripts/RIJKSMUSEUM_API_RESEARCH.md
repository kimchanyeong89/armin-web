# Rijksmuseum API 조사 결과

## ✅ onDisplay 태그 저장

현재 스크립트 (`scrape-rijksmuseum-paintings.cjs`)에 이미 구현되어 있습니다:
- `onDisplay`: boolean 값 (전시 중 여부)
- `displayLocation`: string (전시 위치, 예: "Gallery of Honour")

코드 위치: `scripts/scrape-rijksmuseum-paintings.cjs` (283-308줄)

## 🔍 API 조사 결과

### 1. 이미지 API (발견됨 ✅)

**엔드포인트**: 
```
https://www.rijksmuseum.nl/api/headless/assets/{assetId}?w={width}&h={height}&useFocusPointForResize=true&format=webp
```

**파라미터**:
- `assetId`: 이미지 UUID
- `w`: 너비 (픽셀)
- `h`: 높이 (픽셀)
- `useFocusPointForResize`: boolean
- `format`: webp, jpg 등

**특징**:
- API 키 불필요
- 이미지 리사이징 지원
- 고해상도 이미지도 가능 (w, h 파라미터 조정)

**사용 예시**:
```javascript
// 썸네일
const thumbnailUrl = `https://www.rijksmuseum.nl/api/headless/assets/${assetId}?w=200&h=200&format=webp`;

// 고해상도
const highResUrl = `https://www.rijksmuseum.nl/api/headless/assets/${assetId}?w=1200&h=1200&format=webp`;
```

### 2. 메타데이터 API (확인 필요 ⚠️)

**시도한 API들**:
- ❌ `/api/en/collection/{objectNumber}` - HTTP 410 (deprecated)
- ❌ `/api/nl/collection/{objectNumber}` - HTTP 410 (deprecated)
- ❌ `acc.data.rijksmuseum.nl/iiif/presentation/objects/{id}` - 404
- ❌ `iiif.micr.io/{id}/manifest` - 작동하지 않음

**발견된 JSON 파일**:
- `/_collection/builds/meta/{uuid}.json` - 빌드 메타데이터 (작품 정보 아님)

### 3. Search API (작동함 ✅)

**엔드포인트**: 
```
https://data.rijksmuseum.nl/search/collection
```

**파라미터**:
- `type=painting`: 작품 타입 필터
- `imageAvailable=true`: 이미지 있는 작품만
- `pageToken`: 페이지네이션

**반환**: Linked Open Data ID 목록만 (상세 정보 없음)

## 💡 제안

### 현재 스크립트 유지 (권장)

현재 웹사이트 스크래핑 방식이 가장 안정적입니다:
1. ✅ onDisplay 정보 확실히 수집 가능
2. ✅ 모든 메타데이터 접근 가능
3. ✅ 이미지 URL도 수집 가능

### API 활용 개선 방안 (선택적)

이미지 API는 활용 가능:
- 웹사이트에서 `assetId`를 찾아서 이미지 API로 고해상도 이미지 가져오기
- 하지만 현재 방식도 충분히 작동함

메타데이터 API는:
- 공개 API가 제한적이거나 deprecated 상태
- 웹사이트 스크래핑이 더 안정적

## 📝 참고

- Rijksmuseum는 Open Data 정책을 운영하지만, 공개 API가 제한적
- 웹사이트 스크래핑 시 Rate limiting 주의 (현재 스크립트에 구현됨)
- onDisplay 정보는 웹페이지에서만 확인 가능
