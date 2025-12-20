# 🏛️ 미술관 아카이브 규칙 (Archive Rules)

이 파일은 미술관/갤러리 컬렉션을 아카이브할 때 따라야 하는 규칙입니다.
새 채팅이 시작될 때 이 파일을 참조하세요.

---

## 📋 기본 규칙

### 1. 이미지 저장
- **형식**: WebP (quality 85, max 1200px)
- **저장소**: Cloudflare R2
  - Bucket: `armin-gallery-images`
  - Public URL: `https://pub-396fad1f96754c2f816f260faf970e63.r2.dev`
- **경로 형식**: `/{museum-slug}/{artwork-id}.webp`

### 2. 이미지 필터링
- 빈 이미지(placeholder, null, undefined)는 가져오지 않음
- 이미지가 없는 작품은 아카이브에서 제외

### 3. 작품 정보 수집
필수 필드:
- `artist`: 작가 **풀네임** (약칭 X, 예: "Rembrandt van Rijn" O, "Rembrandt" X)
- `title` / `name`: 작품 이름
- `year`: 제작년도 (**숫자만**, 예: 1642)
- `image`: R2에 저장된 WebP URL
- `id`: 고유 식별자

### 4. 방(Room) 구조
- 미술관이 방 구조로 되어 있으면 방 구조를 유지
- `rooms` 객체로 그룹화: `{ "room-1": [...], "room-2": [...] }`
- 방 정보가 없으면 단일 배열로 저장

### 5. 중복 검증
- 같은 전시 내에서 중복된 작품 검증
- 중복 기준: 같은 `title` + 같은 `artist`
- 중복 발견 시 첫 번째만 유지, 나머지 삭제

### 6. 영구전시 명명 규칙
- 컬렉션 이름 형식: `{미술관 이름} Collection`
- 예: "Dulwich Picture Gallery Collection"
- ID 형식: `{museum-slug}-collection`

### 7. 표지 이미지 (Cover Image)
우선순위:
1. 컬렉션 공식 표지 이미지가 있으면 사용
2. 없으면 아카이브된 첫 번째 작품 이미지 사용

---

## 🎨 전시 아카이브 규칙

### 8. 전시 분류
- 전시 정보 수집: **전시명, 표지 이미지, 전시 기간**
- 기간이 없거나 "영구 전시"/"Permanent" 표기 → `permanentExhibitions`에 추가
- 기간이 명시되어 있으면 → `temporaryExhibitions`에 추가

### 9. 전시 표지 이미지
- 전시 페이지의 **가장 위에 있거나 가장 처음**에 있는 이미지를 표지로 사용
- 히어로 배너 이미지 우선

### 10. 전시 설명 (Description)
- 전시 설명은 모달 페이지의 `description`으로 저장
- **글, 이미지, 동영상**을 그대로 임베드
- HTML 구조 유지하여 마크다운/HTML로 저장

### 11. 전시 내 작품
- 전시 페이지에 작품이 있는 경우, 모달 페이지에 추가
- 필수 필드: **작품 이름, 작가 이름, 년도, 이미지**
- **중복 없어야 함**
- **빈 이미지 작품 제외**
- 스크래핑 중 여러 번 검증하고 문제 발견 시 스크립트 수정

### 12. 전시 페이지 이미지
- 본래 사이트의 전시 페이지에 있는 이미지들
- 작품 정보와 함께 모달 페이지에도 추가
- 갤러리 형태로 표시 가능하도록 저장

---

## 📁 파일 구조

### JSON 데이터 파일
저장 위치: `/public/data/{museum-slug}-collection.json`

```json
{
  "museum": "Museum Name",
  "museumId": "museum-slug",
  "collectionName": "Museum Name Collection",
  "scrapedAt": "2025-01-01T00:00:00.000Z",
  "totalObjects": 100,
  "coverImage": "https://...",
  "objects": [
    {
      "id": "artwork-001",
      "title": "Artwork Title",
      "artist": "Artist Full Name",
      "year": 1642,
      "image": "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/museum-slug/artwork-001.webp",
      "room": "Room 1",
      "description": "..."
    }
  ],
  "rooms": {
    "room-1": [...],
    "room-2": [...]
  }
}
```

### exhibitions.js 업데이트
```javascript
{
  id: "museum-slug",
  name: "Museum Name",
  permanentExhibitions: [
    {
      id: "museum-slug-collection",
      name: "Museum Name Collection",
      title: "Museum Name Collection",
      description: "...",
      startDate: "Permanent",
      endDate: "Permanent",
      image: "표지 이미지 URL"
    }
  ]
}
```

---

## 🔧 R2 업로드 설정

환경변수 필요:
```
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_ENDPOINT=https://....r2.cloudflarestorage.com
R2_BUCKET=armin-gallery-images
```

---

## ✅ 체크리스트

아카이브 완료 시 확인사항:
- [ ] 모든 이미지 WebP로 변환됨
- [ ] R2에 업로드 완료
- [ ] 빈 이미지 제외됨
- [ ] 작가 풀네임 사용
- [ ] 년도가 숫자로만 저장됨
- [ ] 중복 작품 제거됨
- [ ] JSON 파일 생성됨
- [ ] exhibitions.js 업데이트됨
- [ ] 표지 이미지 설정됨

---

*마지막 업데이트: 2025-12-18*
