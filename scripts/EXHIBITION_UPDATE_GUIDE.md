# 전시 업데이트 가이드

## 파일 구조

```
scripts/
  sync-exhibitions.mjs         ← 메인 스크래퍼 (미술관별 전시 수집 + R2 이미지 업로드)
  EXHIBITION_UPDATE_GUIDE.md   ← 이 파일
src/data/exhibitions.js        ← 전시 데이터 원본
```

---

## 핵심 개념: 상태(status) 자동 전환

`exhibitions.js`에 기록된 `startDate` / `endDate`를 기준으로 앱에서 자동 계산됩니다.

| 조건 | 표시 |
|---|---|
| `endDate < 오늘` | **PAST** (과거 전시 — 전시 목록에서 제외) |
| `startDate > 오늘` | **UPCOMING** (예정 전시) |
| `startDate ≤ 오늘 ≤ endDate` | **CURRENT** (현재 전시 — 초록 도트) |

→ `status` 필드를 수동으로 변경할 필요 없습니다. 날짜만 맞으면 자동 분류됩니다.

---

## 업데이트 워크플로우

### 1단계: 스크래퍼 실행

```bash
# 전체 미술관 스캔
node scripts/sync-exhibitions.mjs

# 특정 미술관만
node scripts/sync-exhibitions.mjs --museum mmca
node scripts/sync-exhibitions.mjs --museum nmk
node scripts/sync-exhibitions.mjs --museum ddp
node scripts/sync-exhibitions.mjs --museum leeum
node scripts/sync-exhibitions.mjs --museum apma
node scripts/sync-exhibitions.mjs --museum sema
node scripts/sync-exhibitions.mjs --museum sac
node scripts/sync-exhibitions.mjs --museum groundseesaw
node scripts/sync-exhibitions.mjs --museum bma
node scripts/sync-exhibitions.mjs --museum jmoa
```

스크래퍼는 다음을 출력합니다:
- 발견된 전시 제목 + 날짜 + 이미지 URL
- R2에 업로드된 새 이미지 URL

### 2단계: exhibitions.js 수동 패치

스크래퍼 출력 결과를 보고 **새로 추가된 전시**만 `exhibitions.js`의 해당 미술관 블록에 추가합니다.

```javascript
// 예시: MMCA에 새 전시 추가
temporaryExhibitions: [
  // 기존 전시들...
  {
    id: "mmca-2026-newshow",
    title: "새로운 전시 제목",
    titleEn: "New Exhibition Title",
    description: "전시 소개...",
    startDate: "2026-05-10",
    endDate: "2026-09-30",
    coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/mmca-2026-newshow.jpg",
    officialUrl: "https://www.mmca.go.kr/...",
    status: "upcoming"   // 자동 계산이 백업용, 여기엔 참고로 기입
  }
]
```

### 3단계: 종료된 전시 이동

`endDate`가 지난 전시는 `temporaryExhibitions` → `pastExhibitions`로 이동하면 됩니다.
(앱이 날짜 기반으로 자동 처리하므로 이동하지 않아도 PAST로 표시되지만,
데이터 정리를 위해 주기적으로 이동하는 것을 권장)

```javascript
pastExhibitions: [
  {
    id: "mmca-2025-oldshow",
    title: "지난 전시",
    startDate: "2025-03-01",
    endDate: "2025-08-31",
    coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/mmca-2025-oldshow.jpg",
    status: "past"
  }
]
```

---

## 미술관별 접근 방법

### 국립현대미술관 (MMCA)
- **URL**: `https://www.mmca.go.kr/exhibitions/progressList.do`
- **스크래퍼**: `scrapeMmca()`
- **이미지**: `/upload/exhibition/` 경로
- **Referer**: `https://www.mmca.go.kr/`
- **특이사항**: 서울관(mmca-seoul) / 과천관(mmca-gwacheon) 각각 스캔

### 국립중앙박물관 (NMK)
- **URL**: `https://www.museum.go.kr/MUSEUM/contents/M0202010000.do?menuId=current`
- **스크래퍼**: `scrapeNmk()`
- **이미지**: `/afile/previewThumbnail/` 경로
- **Referer**: `https://www.museum.go.kr/`

### DDP (동대문디자인플라자)
- **URL**: `https://www.ddp.or.kr/index.html?menuno=240`
- **스크래퍼**: `scrapeDdp()`
- **이미지**: `/usr/upload/board_thumb/` 경로
- **Referer**: `https://www.ddp.or.kr/`

### 리움미술관 / 호암미술관 (Leeum / Hoam)
- **URL**: `https://www.leeumhoam.org/api/exhibition/list?museumType=L&status=ING` (리움)
          `https://www.leeumhoam.org/api/exhibition/list?museumType=H&status=ING` (호암)
- **스크래퍼**: `scrapeLeeumHoam()`
- **이미지**: `/upload/exhibition/` 경로
- **특이사항**: JSON API 응답, 예정전시는 `status=WAIT`

### 아모레퍼시픽 미술관 (APMA)
- **URL**: `https://apma.amorepacific.com/kor/exhibition/current-exhibition.do`
- **스크래퍼**: `scrapeApma()`
- **이미지**: `image-apma.amorepacific.com/upload/exhibition/` CDN

### 서울시립미술관 (SeMA)
- **URL**: `https://sema.seoul.go.kr/kr/whatson/exhibition/list?status=ING`
- **스크래퍼**: `scrapeSema()`
- **이미지**: `/common/imgFileView` 경로

### 예술의전당 한가람미술관 (SAC)
- **URL**: `https://www.sac.or.kr/site/main/show/showList?pageIndex=1&period=1&cateid=CATE001&placeid=&status=2`
- **스크래퍼**: `scrapeSac()`
- **이미지**: `upload.cdn.sac.or.kr` CDN

### 그라운드시소
- **URL**: `https://www.groundseesaw.co.kr` (파싱 + cafe24 CDN)
- **스크래퍼**: `scrapeGroundseesaw()`
- **이미지**: `groundseesaw.cafe24.com` CDN
- **특이사항**: CORS/hotlink 차단 있음 → curl로 직접 다운로드 필요

### 부산시립미술관 (BMA)
- **URL 현재**: `https://art.busan.go.kr/tblTsite07Display/listNowClient.nm`
- **URL 예정**: `https://art.busan.go.kr/tblTsite07Display/listFutureClient.nm`
- **스크래퍼**: `scrapeBma()`
- **이미지**: `/uploadfiles/display/arthqpic/` 경로 (URL 인코딩 주의)
- **특이사항**: 2026년 가을까지 본관 리노베이션 중. 이우환 공간은 운영 중

### 제주도립미술관 (JMOA)
- **URL**: `https://www.jeju.go.kr/jmoa/show/current.htm`
- **스크래퍼**: `scrapeJmoa()`
- **이미지**: `/files/exhibition/{uuid}.jpg` 경로
- **특이사항**: `?stat=READY` 파라미터로 예정전시 추가 스캔

---

## 이미지 R2 업로드 방법

### 자동 (스크래퍼 통해)
스크래퍼가 자동으로 이미지를 다운로드하고 R2에 업로드합니다.

### 수동 (직접 curl + wrangler)
```bash
NODE=/Users/kietzsche/.nvm/versions/node/v22.22.2/bin/node
WRANGLER=/Users/kietzsche/armin-web-main/node_modules/.bin/wrangler
CONFIG=/Users/kietzsche/armin-web-main/workers/r2-upload/wrangler.toml

# 1. 이미지 다운로드
curl -sL "https://museum-site.com/path/to/image.jpg" \
  -H "Referer: https://museum-site.com/" \
  -o /tmp/my-exhibition.jpg

# 2. R2 업로드
"$NODE" "$WRANGLER" r2 object put \
  "armin-gallery-images/exhibitions/covers/museum-year-exhibition.jpg" \
  --file /tmp/my-exhibition.jpg \
  --content-type "image/jpeg" \
  --cache-control "public, max-age=31536000" \
  --remote -c "$CONFIG"

# 결과 URL: https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/museum-year-exhibition.jpg
```

---

## 권장 업데이트 주기

| 작업 | 주기 |
|---|---|
| 전시 상태 자동 전환 | 앱 내 자동 (날짜 기반) |
| 신규/예정 전시 추가 | 월 1회 (각 미술관 사이트 확인) |
| 종료 전시를 pastExhibitions로 이동 | 분기 1회 |
| 스크래퍼 테스트 실행 | 신규 전시 추가 시 |

---

## 새 미술관 추가 방법

1. `exhibitions.js`에 새 미술관 블록 추가
2. `sync-exhibitions.mjs`에 `scrapeNewMuseum()` 함수 추가
3. `SCRAPERS` 맵에 등록
4. 이 가이드에 미술관 접근 방법 추가

### exhibitions.js 미술관 블록 템플릿
```javascript
{
  id: "museum-id",
  slug: "museum-id",
  name: "미술관 이름",
  name_en: "Museum Name",
  location: "서울특별시 ...",
  location_en: "..., Seoul",
  description: "미술관 소개...",
  latitude: 37.0000,
  longitude: 127.0000,
  country: "South Korea",
  region: "Seoul",
  representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/...",
  permanentExhibitions: [],
  temporaryExhibitions: [
    {
      id: "museum-2026-title",
      title: "전시 제목",
      titleEn: "Exhibition Title",
      description: "전시 소개",
      startDate: "2026-01-01",
      endDate: "2026-06-30",
      coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/museum-2026-title.jpg",
      officialUrl: "https://museum-website.com",
      status: "ongoing"
    }
  ],
  pastExhibitions: []
}
```

---

## R2 버킷 정보

- **버킷**: `armin-gallery-images`
- **공개 URL**: `https://pub-396fad1f96754c2f816f260faf970e63.r2.dev`
- **이미지 경로 컨벤션**: `exhibitions/covers/{museum-id}-{year}-{short-title}.jpg`
- **CF Worker**: `armin-r2-upload.armin-art.workers.dev` (proxy-image, upload 엔드포인트)
