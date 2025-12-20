# Temporary Scraping Standards

이 문서는 새로운 미술관/갤러리 전시 데이터를 스크랩할 때 반드시 준수해야 하는 표준 요구사항입니다.

---

## 1. Description 처리

### ❌ 하지 말 것
- Description 글자수 제한 (500자 등) 절대 금지
- 단락 구분(`\n\n`) 제거 금지
- `\r\n`을 단순 공백으로 변환 금지

### ✅ 해야 할 것
- **전체 텍스트 유지**: `.substring()` 등으로 자르지 않음
- **단락 유지**: `\n\n` 또는 `\r\n\r\n`은 그대로 보존
- **JS 문자열 이스케이프**: 줄바꿈은 `\\n\\n`으로 이스케이프

---

## 2. 원본 레이아웃 보존 (이미지/동영상 포함)

### ✅ 필수 요구사항
- 전시 페이지에 **이미지, 동영상이 글 사이에 있을 경우** 원본 레이아웃 그대로 가져옴
- HTML 구조를 `descriptionHtml` 필드에 저장하여 모달에서 렌더링
- 단순 텍스트만 추출하지 않음 - 멀티미디어 콘텐츠 위치 유지

### 구현 방식
```javascript
{
  description: "텍스트만 추출한 버전 (검색/미리보기용)",
  descriptionHtml: "<p>첫 단락</p><img src='...'/><p>두번째 단락</p><video>...</video>"
}
```

---

## 3. 작품 이미지 메타데이터

### ✅ 필수 정보 (약칭 금지)
전시에 포함된 작품 이미지는 반드시 다음 정보를 함께 수집:

```javascript
{
  artworks: [
    {
      image: "https://...",           // 작품 이미지 URL (R2 업로드)
      artistName: "Yoshitomo Nara",   // 작가 풀네임 (약칭 X)
      title: "Knife Behind Back",     // 작품 제목
      year: "2000",                   // 제작 연도
      medium: "Acrylic on canvas",    // (선택) 재료/기법
      dimensions: "234 x 208 cm"      // (선택) 크기
    }
  ]
}
```

### ❌ 하지 말 것
- 작가 이름 약칭 사용 (예: "Y. Nara" → "Yoshitomo Nara")
- 작품 정보 없이 이미지만 수집
- 연도 누락

---

## 4. 불필요한 텍스트 제거

Description에서 반드시 제거해야 하는 텍스트:

```javascript
// 정규식 패턴 (화살표 → 포함)
.replace(/\n*\s*Book now\s*→?\s*$/i, '')
.replace(/\n*\s*Visit official page\s*→?\s*$/i, '')
.replace(/\n*\s*Visit the official page\s*→?\s*$/i, '')
.replace(/\n*\s*Click here for more info\s*→?\s*$/i, '')
.replace(/\n*\s*More information\s*→?\s*$/i, '')
.replace(/\n*\s*Learn more\s*→?\s*$/i, '')
.replace(/\n*\s*Buy tickets\s*→?\s*$/i, '')
.replace(/\n*\s*Get tickets\s*→?\s*$/i, '')
```

---

## 5. 이미지 처리

### Cover Image
- R2에 WebP 포맷으로 업로드
- 버킷: `armin-gallery-images`
- 공개 URL: `https://pub-396fad1f96754c2f816f260faf970e63.r2.dev`
- 경로 형식: `exhibitions/{museum-slug}/{exhibition-id}.webp`

### Artwork Images
- 작품 이미지도 R2에 업로드
- 경로 형식: `exhibitions/{museum-slug}/artworks/{artwork-id}.webp`

### Placeholder 제거
- 실제 이미지가 없는 placeholder (예: cake 이미지, 기본 이미지) 감지 및 제거
- `coverImage` 필드를 빈 문자열로 설정

---

## 6. 필수 필드

모든 전시 데이터에 반드시 포함:

```javascript
{
  id: string,              // 고유 ID
  title: string,           // 전시 제목
  startDate: string,       // YYYY-MM-DD
  endDate: string,         // YYYY-MM-DD
  description: string,     // 전체 설명 (제한 없음, 단락 유지)
  descriptionHtml: string, // HTML 포함 설명 (이미지/동영상 레이아웃 유지)
  coverImage: string,      // R2 WebP URL 또는 빈 문자열
  url: string,             // 원본 페이지 URL
  galleryImages: [],       // 추가 이미지 배열
  artworks: []             // 작품 정보 배열 (artistName, title, year 포함)
}
```

---

## 7. UI 컴포넌트 (ExhibitionModal)

### 이미 숨김 처리된 요소
- "Visit official page →" 링크: 코드 유지하되 `{false && ...}`로 숨김

### Description 버튼 활성화 조건
- `detailedDescription` 또는 `url` 필드가 있어야 함

### Artworks 표시
- `artworks` 배열이 있으면 모달에 작품 갤러리 섹션 표시
- 각 작품: 이미지 + 작가명 + 작품명 + 연도

---

## 8. 빌드 전 체크리스트

스크랩 완료 후 빌드 전 반드시 확인:

```bash
# 1. 불필요한 텍스트 확인
grep -i "book now\|visit official\|click here\|learn more" public/data/*.json

# 2. Description 길이 확인 (500자 이하면 잘린 것)
node -e "const d=require('./public/data/FILE.json'); d.forEach(x => { if(x.description && x.description.length < 100) console.log(x.title, x.description.length) })"

# 3. Placeholder 이미지 확인
grep -i "placeholder\|default\|cake" public/data/*.json
```

---

## 9. 스크립트 템플릿 위치

참고할 기존 스크립트:
- `/scripts/scrape-hayward-full.cjs` - R2 업로드, description 정리 포함
- `/scripts/update-hayward-exhibitions.cjs` - JSON → exhibitions.js 변환

---

## 변경 이력

- 2024-12-19: 초기 작성 (Hayward Gallery 스크랩 경험 기반)
- 2024-12-19: 원본 레이아웃 보존, 작품 메타데이터 (작가 풀네임, 작품명, 연도) 요구사항 추가
