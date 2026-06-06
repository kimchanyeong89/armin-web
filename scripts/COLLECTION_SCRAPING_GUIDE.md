# 컬렉션 스크래핑 가이드 (Collection Scraping Guide)

이 문서는 **새 미술관의 소장품(작품 컬렉션) 데이터를 수집해서 `public/data/{slug}-collection.json` + R2 이미지로 저장**하는 규칙을 정의합니다.

> 📌 전시(exhibition) 스크래핑은 별도 문서 `EXHIBITION_UPDATE_GUIDE.md` 참조. 이 문서는 영구 소장품 전용입니다.

---

## 1. 스코프 (Scope)

### ✅ 포함 (평면 시각예술)
- `painting` — 회화 (유화·아크릴·템페라·수채 등)
- `drawing` — 드로잉·스케치
- `print` — 판화 (에칭·리소·실크스크린·목판 등)
- `photograph` — 사진
- `video` — 비디오·필름·무빙이미지
- `mixed_media_2d` — 평면 혼합매체
- `miniature` — 미니어처·세밀화 — ⚠️ **정확히 태깅하되 최종 컬렉션에서는 제외**(아래 ❌ 제외 참조). enum 값은 *감지용*으로 유지한다.
- `calligraphy` — 캘리그래피·서예
- `manuscript` — 채식필사본·일러스트레이션

### ❌ 제외
- 조각, 설치, 가구, 도예, 공예, 의류, 무기, 화석, 자연사 표본
- 단, 작가가 평면 작품의 일환으로 만든 **부조(relief)·소형 오브제**는 포함 가능 (큐레이터 판단)
- **포트레이트 미니어처** (펜던트·로켓에 넣는 상아/에나멜/벨럼 장식 초상) — 기술적으로는 회화지만 시각 그리드·SigLIP을 오염시키므로 **수집하지 않는다**. 주력 컬렉션(예: Wallace·Fitzwilliam)이라도 예외 없음.
  - **감지**: 소스가 `category: miniature`로 분류한 것이 가장 정확(미술관 자체 분류). 분류가 없으면 휴리스틱 — medium에 `ivory|enamel|vellum` + 최대변 ≤14cm.
  - **제거(가역적)**: 수집 후 `node scripts/remove-miniatures.mjs <slug> --apply` → 제거분은 `{slug}.miniatures-removed.json`로 백업, `--restore`로 복구. R2 이미지는 그대로 둠(고아 객체, 무해).

---

## 2. JSON 스키마 (Canonical Shape)

파일 경로: `public/data/{museum-slug}-collection.json`
파일명은 미술관 슬러그 + `-collection.json` 또는 분류별(`{slug}-paintings-collection.json`, `{slug}-photographs-collection.json` 등).

```json
{
  "museum": "Museum Display Name",
  "collection": "Paintings",
  "website": "https://museum.org/collection",
  "scraped_date": "2026-05-27",
  "total_count": 1234,
  "source_type": "api",
  "artworks": [
    {
      "id": "<source-stable-id>",
      "objectNumber": "<museum-inventory-no>",
      "title": "Title of Work",
      "artist": "Artist Name",
      "date": "1875 - 1880",
      "year": 1875,
      "medium": "oil on canvas",
      "dimensions": "height 100 cm × width 80 cm",
      "category": "painting",
      "description": "Short blurb if available.",
      "imageUrl": "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/{slug}/{id}-{hash}-imageUrl.webp",
      "thumbnailUrl": "https://...source-thumbnail...",
      "onDisplay": false,
      "displayLocation": "",
      "sourceUrl": "https://museum.org/object/12345",
      "metadata": {},
      "original_imageUrl": "https://...source-fullsize..."
    }
  ]
}
```

### 필드 정의

| 필드 | 필수도 | 비고 |
|---|---|---|
| `id` | **MUST** | 소스 내 안정적 식별자(URL slug, accession no, DB ID). ⚠️ **전역 고유 필수** — bare 정수("9087")는 컬렉션 간 충돌해 "Similar Works"(SigLIP/Vectorize) 추천이 엉뚱한 작품을 반환한다(임베딩이 id로 조회되므로). 등록 전 `node scripts/prefix-collection-ids.mjs <slug> --apply`로 `{slug}-{id}` 접두를 붙여 전역 고유화한다(Phase F-0). |
| `title` | **MUST** | 작품 제목 |
| `artist` | **MUST** | 작가명 (여러 명이면 `; `로 구분). **소스 형식 그대로 저장** — "Last, First"든 "First Last"든 변환하지 말 것. 표시는 `prettifyArtistName`, 매칭은 sorted-token 키가 통합 처리한다(MEMORY 참조). 단 굳이 고르면 "First Last" 자연순. |
| `year` | **MUST** | 정수 (제작 시작 년도). 추정이면 가장 빠른 추정치 |
| `category` | **MUST** | 위 enum 중 하나 (소문자) |
| `dimensions` | **SHOULD** | 원문 그대로. 없으면 `""` |
| `medium` | **SHOULD** | 원문 그대로. 없으면 `""` |
| `date` | optional | 원문 날짜 문자열 ("c. 1875", "1875-1880" 등) |
| `imageUrl` | **MUST (R2)** | R2 업로드 완료된 URL |
| `original_imageUrl` | **MUST** | 소스 원본 URL (감사·재시도용) |
| `sourceUrl` | **MUST** | 미술관 사이트 작품 상세 페이지 |
| `onDisplay` | optional | true/false, 모르면 `false` |
| `displayLocation` | optional | 갤러리·룸 표시. 모르면 `""` |
| `description` | optional | 큐레이터 텍스트. 없으면 `""` |
| `metadata` | optional | 카탈로그 raisonné 번호, IIIF manifest 등 소스 특수 필드 보관용 객체 |

### 메타데이터 필수 6 / 최소 4 규칙

> 6개 표준: **artist, title, year, dimensions, category, medium**
>
> **최소 4개 보장**: `title`, `artist`, `year`, `category`는 어떤 경우에도 비어 있으면 안 됩니다. 소스에서 정말 없으면 다음 순서로 추론:
> 1. 같은 작품의 다른 페이지(미술관 카탈로그 PDF, Wikidata, Wikipedia) 1회 교차 검증
> 2. 그래도 없으면 그 작품은 **레코드에서 제외** (절대 placeholder/Unknown으로 채우지 말 것)
>
> `dimensions`, `medium`은 비어 있어도 레코드 보존. 단 전체 컬렉션의 50% 이상에서 비어 있다면 그 소스의 metadata 수집 방식을 재점검할 것.

---

## 3. 워크플로우 (5 Phases)

### ⭐ 최우선 원칙 — 상세 페이지 전수 파싱 (Detail-Page Completeness)

> **메타데이터는 항상 작품 상세 페이지(detail page / record / 상세 데이터)에서 파싱한다.**
> 리스트 페이지·이미지 파일명·`og:title`·캡션 한 줄에서 작가·제목만 뽑고 끝내지 말 것.
> 상세 페이지에 `year`·`medium`·`dimensions`·작가 생몰년이 있으면 **반드시 전부 가져온다.**

**왜 이 원칙이 1순위인가** — 과거 Galnas 사례: 상세 페이지에 `S. Prinka (1947-2004)` / `Drawing pen pada kertas` / `61 x 71 cm` / `1979`가 전부 있었는데, 스크래퍼가 이미지 파일명에서 `artist_title`만 추출하는 shortcut을 써서 year·medium·dimensions를 100% 버렸다. 데이터는 사이트에 있었고, 우리가 안 가져온 것이다.

**shortcut의 종류와 올바른 대안**:
| ❌ Shortcut (금지) | ✅ 올바른 방법 |
|---|---|
| 이미지 파일명에서 `Artist_Title` 분해 | 상세 페이지 fetch → 모든 필드 파싱 |
| 리스트 페이지의 썸네일 캡션만 사용 | 캡션은 목록 수집용. 메타는 상세에서 |
| `og:title`만 읽고 medium/dim 무시 | JSON-LD + dt/dd + 본문 텍스트까지 훑기 |
| `cm` 정규식만 → 텍스트형 크기 누락 | 라벨~다음라벨 사이 값을 통째로 (예: "Variables según instalación") |
| 합쳐진 셀에서 한 조각만 (예: "재료; 크기"에서 크기만) | 구분자로 쪼개 medium·dimensions 둘 다 |

**상세 데이터가 사는 곳 (체크 순서)**:
1. JSON API 응답 필드 (가장 깨끗)
2. `<script type="application/ld+json">` (VisualArtwork 스키마: `artMedium`, `dateCreated`, `height`/`width`)
3. Next.js/Nuxt flight payload (`self.__next_f`, `__NUXT__`) — 화면에 보이는 텍스트는 여기 다 있다
4. `<dt>/<dd>`, `<table>` 행, `<figcaption>`, `field--name-*` (Drupal), 본문 첫 문장
5. 위가 다 없을 때만 "사이트에 그 필드가 실제로 없음"으로 결론

### Phase A — 소스 조사 (Source Investigation)

**우선순위 (위에서부터)**:
1. **공식 API + 키 불필요** — Rijksmuseum (`/api/v1/collection/search`), Cleveland MoA Open Access, Brooklyn Museum, Harvard Art Museums (키 필요·무료)
2. **공식 API + 키 필요** — Cooper Hewitt, Met (`/public/collection/v1`)
3. **벌크 다운로드** — GitHub repo의 CSV/JSON (MoMA, Tate, Carnegie Museum 등)
4. **IIIF Manifest** — Image API + Presentation API 조합으로 메타데이터·이미지 동시 획득
5. **사이트 내부 JSON 엔드포인트** — DevTools Network 탭에서 `fetch`/`XHR` 응답 탐색 (Wallace Collection, Galleria Nazionale 등)
6. **HTML 스크래핑** — 위 다섯이 모두 실패한 경우만

**조사 산출물**: `scripts/SOURCE_RESEARCH_{slug}.md` (Rijksmuseum 사례 참조)
- 발견한 엔드포인트 URL + 파라미터
- 응답 샘플 (작품 1건)
- 페이지네이션 방식
- 이미지 URL 구조 (IIIF vs CDN)
- 인증/Rate-limit/Referer 요구사항
- 결론: 사용 가능한지, 어떤 phase로 진입할지

### Phase B — 100건 파일럿 (Pilot Validation)

**전체 수집 전에 100건만 먼저** 뽑아서 다음을 검증:

| 검증 항목 | 통과 기준 |
|---|---|
| 4-필수 필드 채움률 | **100/100** (title, artist, year, category) |
| 6-표준 필드 채움률 | **≥ 80/100** (dimensions, medium 포함) |
| 이미지 URL 살아있음 | HEAD 200, content-length > 10KB |
| 이미지가 placeholder 아님 | 같은 hash가 5건 이상 반복되면 placeholder 의심 |
| 카테고리 일관성 | enum 외 값이 0개 |

**🔍 채움률 낮으면 = 사이트 한계인지 파서 버그인지 반드시 판별**

`year`·`medium`·`dimensions` 중 어느 하나라도 채움률이 낮으면(예: <80%), **그 작품의 상세 페이지를 브라우저/curl로 직접 열어** 해당 필드가 화면에 보이는지 확인한다:
- 화면엔 있는데 JSON엔 없다 → **파서 버그. 고치고 재수집.** (← Galnas/Iziko/MNBA가 이 케이스였다)
- 화면에도 없다 → 사이트 한계. 그 필드만 비우고 진행 (예: MAM CDMX·NMFA는 dimensions를 사이트가 미제공).

이 판별을 건너뛰고 "원래 사이트에 없나 보다" 단정하는 것이 가장 흔한 실수다. 낮은 채움률은 무죄추정 대상이 아니다 — 직접 눈으로 확인할 것.

**🚦 필수 게이트 — `validate-metadata.mjs` (placeholder/오염 탐지)**

"필드가 비어있지 않다"를 채움률로 세면 **거짓말이 된다.** 실제 사례: Mathaf 233건이 작가를 한 명도 못 가져왔는데(greedy 정규식 버그로 dt/dd 매칭 실패) 전부 `artist:"Anonymous"`로 채워, 순진한 `cov('artist')`는 "233/233 = 100%"라고 보고했다. 작가 정보는 사이트에 멀쩡히 있었다.

그래서 채움률은 **반드시 전용 검증기로** 측정한다:
```bash
node scripts/audit/validate-metadata.mjs {slug}      # 또는 인자 없이 전체
```
이 검증기는 다음을 BLOCKER로 잡는다:
- **placeholder 작가** (`Anonymous`/`Unknown` 등)를 "채워짐"에서 제외 → REAL fill% 계산. 100% placeholder = 파서가 작가를 0명 추출 = 버그 확정.
- **label contamination** — 값에 다른 필드 라벨이 섞임 (예: `title:"The Red One Artist: Samia Halaby"`). greedy 정규식 버그의 지문.
- **QID/파일명 제목** (라벨 fetch 실패), 빈/junk 제목, 중복 imageUrl.
- (`Untitled`/`Sin título`는 정당한 무제 제목으로 인정 — junk 아님.)

**BLOCKER가 하나라도 있으면 등록·임베딩 금지.** exit code 1로 파이프라인을 막는다.

**검증 도구 묶음**:
```bash
node scripts/audit/audit-images.mjs --only={slug}-collection-pilot.json    # 이미지 placeholder/broken
node scripts/audit/validate-metadata.mjs {slug}                           # 메타 품질 (placeholder/오염)
# 둘 다 통과해야 Phase C 진입. 채움률 낮은 필드는 sourceUrl 직접 열어 사이트 한계인지 파서 버그인지 판별.
```

파일럿이 통과하지 못하면 **반드시 Phase A로 돌아가 소스 재조사**. Placeholder 50% 이상 → 그 소스로는 진행 불가, 다른 엔드포인트 탐색.

### Phase C — 전체 수집 (Full Scrape)

파일럿 통과 후에만 실행. 다음을 준수:
- Rate-limit 존중 (기본 1 req/sec, API 명시 있으면 그것 따름)
- Resumable: 페이지·ID 단위 체크포인트 파일 (`scripts/.state/{slug}-progress.json`)
- 실패한 작품은 별도 로그 (`scripts/.state/{slug}-failed.ndjson`) — 재시도 3회 후 포기
- 진행률 출력: 100건마다 stdout

#### ⭐ 수집 범위(Cap) 정책 — 임의 cap 금지

> **회화(painting)는 상한 없이 전부 수집한다.** "1500개만" 같은 임의 cap을 두지 말 것 (과거 실수: ashmolean 회화 3,742 중 1,500만 가져와 사용자 신뢰를 잃음).

대형 컬렉션에서 드로잉·판화·사진이 수만~수십만 점이면 **가치 선별(value filter)**을 적용해 양을 줄이되, 회화는 예외 없이 전부:

| 매체 | 정책 |
|---|---|
| **painting** (유화·아크릴·템페라·수채 회화) | **전부 수집. cap 없음.** |
| drawing / print / photograph / 기타 2D | **가치 선별 후 수집** — 아래 제외 기준 적용, 나머지는 전부 |

**가치 선별 — 제외 대상** (소스 메타/라벨에 근거할 때만; 추측 금지):
- 저품질 이미지: 긴 변 < 400px, placeholder, broken
- 부차·습작 장르: `study`, `sketch`(습작), `copy`/`reproduction`(복제), `squeeze`/`rubbing`(탁본), 인쇄 교정쇄
- 장식용 소품: **portrait miniature**(펜던트·로켓에 넣는 장식 초상 세밀화) — 주력 컬렉션이라도 **예외 없이 제외** (§1 스코프 ❌ 참조: `category: miniature` 감지 → `remove-miniatures.mjs`)
- 소스가 `on display`/`highlight`/`masterpiece` 플래그를 제공하면 그것을 우선 가치 신호로 사용

**핵심**: cap을 둘 거면 반드시 "가치 기준"으로 줄이고, **무엇을 왜 제외했는지 reason에 기록**한다. 단순 "상위 N개"로 자르지 말 것.

#### 📊 보고 표기 의무 — "전체 / 수집"

모든 진행 보고 표에는 **`전체 in-scope N / 수집 M`**를 반드시 표기한다. 그래야 cap·필터로 무엇이 빠졌는지 사용자가 안다. 예: `회화 3,742 전체 + 드로잉 1,820/29,736(가치선별)`. 단순히 "1,500점 수집"만 쓰면 안 된다.

### Phase D — R2 이미지 업로드

**버킷**: `armin-gallery-images`
**경로 컨벤션**: `artworks/{collection-file-stem}/{id}-{hash8}-imageUrl.webp`
- `{collection-file-stem}` = 파일명에서 `.json` 제거 (예: `prado-paintings-collection`)
- `{hash8}` = SHA-256(source URL)의 앞 8자
- 포맷 변환: 가능하면 webp로 (품질 85), 실패 시 원본 확장자 유지
- 최대 크기: 긴 변 2048px (이보다 크면 다운스케일)

**업로드 도구** (재사용 권장):
```bash
node scripts/generic-r2-upload.cjs --collection {slug}-collection.json
```
또는 직접:
```bash
NODE=/Users/kietzsche/.nvm/versions/node/v22.22.2/bin/node
WRANGLER=/Users/kietzsche/armin-web-main/node_modules/.bin/wrangler
CONFIG=/Users/kietzsche/armin-web-main/workers/r2-upload/wrangler.toml

"$NODE" "$WRANGLER" r2 object put \
  "armin-gallery-images/artworks/{slug}/{id}-{hash}-imageUrl.webp" \
  --file /tmp/img.webp --content-type "image/webp" \
  --cache-control "public, max-age=31536000" --remote -c "$CONFIG"
```

**완료 후**: JSON의 모든 `imageUrl`은 R2 URL이어야 함. `original_imageUrl`은 보존.

#### ⭐ 업로드 전 이미지 전처리 — autocrop (흰 여백 · "© Museum" 캡션 밴드 제거)

많은 미술관(특히 eMuseum 계열: Wallace, Folkwang)은 **촬영 원본**을 제공한다 — 흰색 스캔 여백, 하단 "© Museum" **저작권 캡션 밴드**, 액자 매트 여백이 포함. 그대로 올리면 모달에 흰 띠가 보이고 **SigLIP 임베딩이 오염**된다.

> ⚠️ **기본 OFF (opt-in)** — `autocropToWebp`는 기본적으로 **트림하지 않고** 순수 webp 변환만 한다. 흰여백 스캔을 주는 미술관이 드물고 자동 트림이 작품 가장자리를 잘못 자를 위험이 더 크기 때문. **사용자가 특정 미술관의 흰여백을 보고 요청할 때만** `AUTOCROP_TRIM=1 node scripts/scrape-….mjs …` (또는 `autocropToWebp(buf,{trim:true})`)로 켠다. 아래 설명은 트림을 켰을 때의 동작이다.

→ (트림 켤 때) R2 업로드 직전 **`scripts/lib/autocrop.mjs`**로 흰 여백을 잘라낸다:
```js
import { autocropToWebp } from './lib/autocrop.mjs';
const { buffer, cropped, shrink, reason } = await autocropToWebp(srcBuffer);
// buffer = webp(2048/q85). 흰 스캔 여백/캡션 밴드 제거(white-trim) 또는 원본(꽉 찬 이미지는 no-op)
```
**white-trim 전용** (⚠️ bg-crop은 의도적으로 비활성 — 회화의 하늘을 배경으로 오인해 잘랐었음):
- "행/열의 ≥88%가 흰색(pixel>236)"이면 그 줄을 여백으로 보고 제거. 하단 **검은 © 캡션 글씨(소수 픽셀)는 무시**하므로 `sharp.trim()`이 못 잡던 캡션 밴드도 잘린다.
- 넓은 흰 여백(>25%)은 종이 작품일 수 있어 **건드리지 않음**. 작품 자체는 절대 안 자름.

**⚠️ 일괄 재처리는 반드시 2단계** (안 그러면 카드가 안 바뀜):
```bash
node scripts/reprocess-images.mjs {slug}            # dry-run: cropped 수·shrink 분포 확인
node scripts/reprocess-images.mjs {slug} --apply    # ① R2 이미지를 white-trim 후 재업로드
node scripts/cache-bust-images.mjs {slug} {version} # ② imageUrl에 ?v=N 부착 → weserv CDN 캐시 무효화
```
② cache-bust가 핵심: 카드 썸네일은 weserv(images.weserv.nl) 프록시를 거치는데, R2의 1년 cache-control을 그대로 따라 **옛 이미지를 1년 캐시**한다. `?v=N`을 올려야 weserv가 새 이미지를 다시 가져온다. (신규 스크랩이면 처음부터 autocrop된 이미지를 올리므로 cache-bust 불필요 — 재처리할 때만.)

### Phase E — Placeholder 감사 (Post-Scrape Audit)

전체 업로드 후 필수 실행:
```bash
node scripts/audit/audit-images.mjs --only={slug}-collection.json
```

산출물: `scripts/audit/audit-report.json` 안에서 해당 컬렉션의 BROKEN / PLACEHOLDER / OK 카운트 확인.
- **OK ≥ 95%** → 통과
- **OK 80~95%** → broken/placeholder 레코드를 JSON에서 제거 후 통과
- **OK < 80%** → Phase A부터 재조사 (다른 소스 필요)

**⚠️ "이미지 없음" placeholder — 200 OK인데 그림이 아니다**

일부 미술관은 누락 작품에 **고정 placeholder 이미지**를 200 OK로 서빙한다 (예: NGMA NPDR의 "Image not found" 하늘색 캔버스 906×1800). HTTP는 정상이라 broken으로 안 잡히고, webp로 변환돼 R2에 올라가 **모달에 "그림 아닌 안내문"이 뜬다.** 실제 NGMA에서 33건 발생했다.

검출·차단 2단계:
1. **수집 시점 (재발 방지)** — 원본 다운로드 직후 sha256(+크기 사전체크)이 알려진 placeholder와 같으면 `throw('placeholder')`로 스킵. (`scrape-ngma.mjs`의 `PLACEHOLDER_SHA` 패턴 참조)
2. **사후 일괄 (이미 수집된 것)** — `scripts/audit/detect-{museum}-placeholders.mjs` 패턴: 원본 content-length로 후보 필터 → sha256 확증 → JSON 레코드 제거 + R2 객체 삭제. (`detect-ngma-placeholders.mjs` 참조)

placeholder를 처음 발견하는 법: 같은 content-length가 여러 건이거나, 모달에서 안내문 이미지가 보이면 그 이미지를 `Read`로 직접 눈으로 확인 → sha256 채취 → 블랙리스트 등록.

**⚠️ 포트레이트 미니어처 제외 (§1 스코프 참조)**

영국·유럽 고전 미술관은 펜던트/로켓용 상아·에나멜·벨럼 장식 초상(miniature)이 회화로 섞여 들어온다. 시각 그리드·SigLIP 오염원이므로 제거:
```bash
node scripts/remove-miniatures.mjs {slug}                  # dry-run: 미니어쳐 수·매체 분포·샘플
node scripts/remove-miniatures.mjs {slug} --apply          # 미술관 자체 category=miniature 제거(최정확)
node scripts/remove-miniatures.mjs {slug} --apply --medium # +휴리스틱(상아/에나멜/벨럼 ≤14cm) — category 태그 없는 소스용
```
가역적: `{slug}.miniatures-removed.json` 백업 + `--restore`. 표 보고 시 "미니어쳐 N점 제외" 표기.

**⚠️ 저화질 소스 큐레이션 (eSbirky 등) + 실제 이미지 확인**

저해상도(<1000px)·works-on-paper 위주 소스(eSbirky 등)는 메타는 통과해도 시각적으로 약하다. **메타데이터만 믿지 말고 실제 이미지 몇 개를 `curl`+`Read`로 직접 봐라** — "플레이스홀더 같다"·"중복 같다"는 사용자 지적이 알고 보면 (a) 어둡고 저대비인 실제 op-art 판화, (b) 제목만 "무제"인 각기 다른 연작, (c) 옛 사진 콜라주(유명작가라도)인 경우가 많다. 진짜 오류(공유이미지 placeholder)는 §Phase E 상단 참조. 시각적 저가치(옛사진/콜라주·무제연작 반복)는 **사용자 확인 후** 큐레이션 제거: `node scripts/curate-collection.mjs <slug> --apply [--cap=N]` (가역적 `.curated-removed.json` 백업). 큐레이션은 실재 작품을 빼는 것이므로 임의로 하지 말고 규모를 사용자와 합의한다.

### Phase F — 앱 등록 + 시각 확인 (지도 · 인터랙티브 모달)

**수집만으로는 미완이다.** 미술관이 지도에 핀으로 뜨고, 클릭하면 인터랙티브 모달에서 작품이 보이는 것까지가 "1건 완료"의 정의다.

#### F-0. 등록 전 최종 게이트 — ID 고유화 + 메타 검증 (BLOCKER 0)

```bash
node scripts/prefix-collection-ids.mjs {slug} --apply   # ⚠️ 작품 id를 {slug}- 접두로 전역 고유화 (추천 충돌 방지)
node scripts/audit/validate-metadata.mjs {slug}          # ✓ all passed 가 떠야 등록 진행
```
BLOCKER가 있으면 등록하지 않는다. placeholder 작가 100%·label 오염 등은 여기서 100% 걸린다.

#### F-1. `src/data/exhibitions.js`에 미술관 엔트리 직접 추가

> 직접 실행 모드(이 세션처럼 main에서 작업)에서는 `pending/`이 아니라 `exhibitions.js`에 **바로 추가**한다.
> (병렬 디스패치/PR 모드일 때만 충돌 회피용으로 `src/data/pending/{slug}.json`을 쓴다 — §8 참조.)

엔트리 필수 필드 (기존 엔트리 형식과 동일하게):
```javascript
{
  id: "{slug}",
  name_ko: "{한글 표기}",
  name: "{영문 공식명}",
  city: "{도시}",
  country: "{국가}",
  latitude: {위도},          // 실제 미술관 좌표 — globe 핀 위치
  longitude: {경도},
  description_ko: "{네이티브 한국어 소개 1~2문장}",   // 번역투 금지 (feedback_korean_natively)
  description: "{영문 소개}",
  representativeImage: "{컬렉션 대표작 R2 URL}",       // globe 카드 썸네일
  permanentExhibitions: [
    { id: "{slug}-collection", name: "Collection", name_en: "Collection",
      title: "{미술관} — Collection", title_en: "...",
      description: "{N점 + 매체 구성}", description_en: "...",
      startDate: "Permanent", endDate: "Permanent",
      collectionFile: "{slug}-collection.json" }   // ← public/data/ 파일명과 정확히 일치
  ],
  temporaryExhibitions: [],
  pastExhibitions: [],
  exhibitions: []
}
```

- `collectionFile`은 인터랙티브 모달(`InteractiveGlobeRealModal.tsx`)이 `/data/{collectionFile}`로 fetch한다. 파일명 오타 = 0 works.
- 모달은 collection JSON의 `artworks` 배열을 읽는다(또는 `items/data/objects/...` — `extractItemsFromPayload`). 스키마(§2)를 지키면 자동 인식.
- `representativeImage`가 비면 앱이 컬렉션 첫 작품으로 대체하지만, 명시 권장.

#### F-2. ⚠️ Vite dev server 재시작 (필수 — 안 하면 0 works)

**`public/data/`에 새로 만든 JSON은 dev server를 재시작해야 인식된다.** 재시작 전에는 Vite가 SPA fallback으로 `index.html`을 반환 → 앱이 `JSON.parse`에서 빈 배열 → **지도엔 핀이 떠도 모달은 "0 works"**.

```bash
# 실행 중인 vite PID 찾기
lsof -iTCP -sTCP:LISTEN -P | grep vite        # 예: PID, 포트(5181 등)
kill {PID}
npm run dev                                    # 재시작
```

(`src/data/exhibitions.js` 수정은 HMR로 즉시 반영되므로 핀·설명은 재시작 없이 보인다. **JSON만 재시작이 필요**하다. 이건 dev 전용 — prod 빌드는 정적 복사라 무관.)

#### F-3. 시각 확인 (사람이 눈으로)

```bash
# dev server가 JSON을 제대로(application/json) 주는지 — HTML이면 재시작 실패
curl -s -o /dev/null -w "%{content_type}\n" "http://localhost:{PORT}/data/{slug}-collection.json"
# → application/json 이어야 함. text/html 이면 F-2 재실행.
```

그다음 브라우저에서:
- [ ] 지도(globe)에 해당 좌표에 핀이 뜬다
- [ ] 핀 클릭 → 인터랙티브 모달이 열린다
- [ ] 모달에 "N works"가 실제 수집 수와 일치
- [ ] 작품 이미지가 placeholder 아닌 실제 그림으로 렌더된다

### Phase G — 임베딩 핸드오프 (별도 트리거)

데이터·이미지·앱 등록이 끝난 뒤 SigLIP 임베딩과 D1 manifest 갱신은 별도로 진행 (`scripts/modal_embed/` 파이프라인). 핸드오프 시점:
- ✅ `public/data/{slug}-collection.json` 존재
- ✅ R2에 모든 이미지 업로드됨
- ✅ `audit-report.json`에서 OK ≥ 95%
- ✅ `exhibitions.js` 등록 + dev server에서 "N works" 시각 확인 완료

---

## 4. R2 컨벤션 요약

| 항목 | 값 |
|---|---|
| Bucket | `armin-gallery-images` |
| Public URL | `https://pub-396fad1f96754c2f816f260faf970e63.r2.dev` |
| Artwork path | `artworks/{collection-stem}/{id}-{hash8}-imageUrl.webp` |
| Exhibition cover | `exhibitions/covers/{museum-id}-{year}-{title}.jpg` |
| Worker | `armin-r2-upload.armin-art.workers.dev` |

---

## 5. 분류별 접근 패턴 (참고)

| 소스 유형 | 대표 사례 | 권장 도구 |
|---|---|---|
| Open Access API | Rijksmuseum, Cleveland MoA, Brooklyn | `node-fetch` + 페이지 루프 |
| 키 필요 API | Met, Harvard, V&A | 환경변수 키, 동일 패턴 |
| IIIF | Yale, Princeton, ARTIC | manifest 파싱 → 이미지 + label/metadata |
| GitHub 벌크 | MoMA, Tate, Carnegie | `git clone` 후 로컬 변환 |
| 사이트 내부 JSON | Wallace, GNAM, Pera | DevTools Network 분석 + `fetch` |
| 봇 차단 HTML | NFM, 일부 한국 박물관 | Playwright + 세션 쿠키, 또는 Chrome MCP |

---

## 6. 기존 스크립트 재사용 가이드

새로 작성하기 전에 검색:
```bash
ls scripts | grep -iE "{museum-keyword}"   # 이전 시도가 있는지
ls scripts | grep -iE "(api|iiif|bulk)"     # 패턴별
```

핵심 도구:
- `scripts/audit/validate-metadata.mjs` — **메타 품질 게이트** (Phase B·F 필수). placeholder 작가·label 오염·QID 제목·REAL fill% 측정
- `scripts/audit/audit-images.mjs` — placeholder/broken 이미지 감사 (Phase E 필수)
- `scripts/audit/reaudit-placeholders.mjs` — 재감사
- `scripts/audit/delete-placeholders.mjs` — placeholder 레코드 제거
- `scripts/generic-r2-upload.cjs` — 일반 R2 업로드
- `scripts/RIJKSMUSEUM_API_SUMMARY.md` — 소스 조사 문서 템플릿
- `scripts/check-placeholders.cjs` — 빠른 수동 체크

---

## 7. Acceptance Checklist ("1건 완료"의 정의)

**데이터 수집 (Phase A~E)**
- [ ] `scripts/SOURCE_RESEARCH_{slug}.md` 작성됨
- [ ] Phase B 파일럿(100건) 검증 통과
- [ ] 메타데이터는 **상세 페이지 전수 파싱**으로 수집 (파일명/리스트 shortcut 아님)
- [ ] `public/data/{slug}-collection.json` 생성
- [ ] **`node scripts/audit/validate-metadata.mjs {slug}` → BLOCKER 0** (placeholder 작가·label 오염·QID 제목 없음)
- [ ] REAL fill%로 확인 (placeholder 제외한 실질 채움률). 낮은 필드는 사이트 한계임을 sourceUrl로 입증
- [ ] 모든 `imageUrl`이 R2 URL, `audit-images.mjs` OK ≥ 95%
- [ ] 컬렉션 `category` 분포 기록

**앱 등록 + 시각 확인 (Phase F) — 이게 빠지면 미완**
- [ ] `src/data/exhibitions.js`에 미술관 엔트리 추가 (좌표·representativeImage·collectionFile)
- [ ] `collectionFile` 값이 `public/data/`의 실제 파일명과 정확히 일치
- [ ] **Vite dev server 재시작** (새 JSON 인식 — 안 하면 0 works)
- [ ] `curl .../data/{slug}-collection.json` → `application/json` 확인 (HTML 아님)
- [ ] 브라우저: 지도 핀 → 인터랙티브 모달 → "N works" 실제 수와 일치 → 이미지 렌더 확인

---

## 8. 안티-패턴 (하지 말 것)

- ❌ `cov()`/"비어있지 않음" 카운트로 채움률 보고 — placeholder를 "채워짐"으로 세서 거짓말이 된다. 반드시 `validate-metadata.mjs`의 REAL fill% 사용
- ❌ 작가/제목 추출 실패를 `Anonymous`/`Unknown` 같은 dummy로 메우고 넘어가기 (사이트에 정보 있으면 파서를 고쳐라)
- ❌ greedy 정규식으로 `<dd>...</dd>` / 셀 캡처 (다음 필드까지 삼킨다 — 항상 non-greedy `*?`)
- ❌ Unknown / N/A / "Artist not recorded" 같은 dummy 값으로 4-필수 필드 채우기
- ❌ Placeholder 이미지를 그대로 R2에 업로드
- ❌ 병렬 디스패치/PR 모드에서 `exhibitions.js` 직접 수정 (충돌) → 그때만 `pending/` 사용. 직접 실행 모드(단일 세션)에서는 `exhibitions.js` 직접 등록이 정답.
- ❌ 수집만 하고 `exhibitions.js` 등록·dev server 재시작을 건너뛰기 (지도/모달에 안 보임 = 미완)
- ❌ 새 JSON 추가 후 dev server 재시작 누락 (0 works의 가장 흔한 원인)
- ❌ Rate-limit 무시한 병렬 요청 (소스 차단당함)
- ❌ Phase B 건너뛰고 전체 수집 시작 (수만 건 재작업 위험)
- ❌ 조각·설치 작품을 `category: "sculpture"`로 포함 (스코프 외)
