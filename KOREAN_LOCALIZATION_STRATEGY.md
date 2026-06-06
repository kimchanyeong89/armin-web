# ARMIN 한국어화(i18n) 전략

> 작성: 2026-05-29 · 대상: armin-web-main · 기본 언어: 한국어(앱 default `ko`)
>
> 목표 — 미술관명·미술관 설명·작가명·작가 설명·작품명·작품 메타데이터·UI·검색까지
> 사이트 전체를 "가장 똑똑하게" 한국어로 제공한다. 권위 있는 공식 한글명을 최우선으로
> 쓰고, 없는 것은 결정적 규칙 → 멀티모달 AI 순으로 메운다.

---

## 0. 요약 (TL;DR)

**5대 원칙**
1. **전환식 표기(병기 금지)** — `language`에 따라 **한 번에 한 언어만**. 한글값 없으면 원어로 폴백.
2. **권위 우선** — Wikidata / Wikipedia / Getty(ULAN·AAT) 공식 한글명을 최우선.
3. **네이티브 한국어 산문** — 설명·인트로·캡션은 번역투 금지(기존 작업 원칙 준수).
4. **지연 + 캐시** — 대량(작품 제목)은 전량 사전번역 대신 **조회 시 번역·영구 캐시**.
5. **폴백 안전 + 결정적 우선** — 어떤 단계든 실패하면 원어로 정상 표시(빈 화면 금지). 규칙/사전으로 풀리는 것(재질·연도·지명·일반 제목)엔 API를 쓰지 않는다.

**계층별 한 줄 전략**

| 계층 | 대상 | 전략 | 비용/성격 |
|---|---|---|---|
| L0 UI 크롬 | 버튼·라벨·마이크로카피 | `t({ko,en})` 확대 + 공용 문자열 중앙화 | 결정적·저비용 |
| L1 지리 | 대륙·국가·도시 | `geoLocalization` 갭 채우기 | 결정적 |
| L2 미술관 | 이름·위치·설명 | 이름·위치=권위(Wikidata/공식), 설명=네이티브 LLM 번역+검수 | 바운디드(214) |
| L3 작가명 | 작가 표시명 | `wikiId`→Wikidata `ko` 라벨 배치, 없으면 ULAN/음역 | 권위·1회성(~3,115) |
| L4 전시 | 전시 제목·설명 | `exhibitionLocalization` 이미 `_ko` 우선 → 네이티브 번역 | 바운디드 |
| L5 작품 제목 | ~61.9만 | **4-Tier 파이프라인**(권위→사전→멀티모달 지연) | §5 |
| L6 작품 메타 | 재질·기법·연도·치수 | **용어집(규칙 기반)** | 결정적·고ROI |
| L7 큐레이션 | 주간·스페셜 | 이미 바이링궐 — 신규도 `_ko` 유지 | 기존 워크플로 |

**검색** — 의미검색은 **Jina CLIP v2(다국어)로 통합**(번역 hop 제거, SigLIP은 폴백 잔존), 키워드는 인덱스에 `*_ko` 필드 추가, 결과 표시는 표시 헬퍼로 즉시 한글화. (§6)

**이번 세션(Phase 1, 안전·무비용)** — L6 용어집, L1 geo 갭, `artworkLocalization` 헬퍼 + 표시 폴백 배선, Wikidata 이름 파이프라인 스크립트 작성·실행(작가/미술관 사이드카 생성). **게이트(사전 확인 후)** — LLM 대량 번역, D1/워커 재배포, 검색 기본 엔진 전환, 재임베딩.

---

## 1. 현재 상태 (As-is)

### 1.1 i18n 인프라 — 이미 핵심 배관이 있음
- `src/contexts/LanguageContext.tsx` — `AppLanguage = "ko" | "en"`, `t({ko,en})`, `localStorage("armin:language")`, 브라우저 언어 감지. KR/EN 토글 버튼(App.tsx).
- **데이터 표시 헬퍼가 이미 `_ko` 우선·원어 폴백으로 설계됨** — 즉 *데이터에 `_ko`를 채우면 UI가 자동으로 한글을 표시*한다.
  - `src/i18n/museumLocalization.ts` — `name_ko / location_ko / description_ko` 읽고 폴백. 설명 없을 때 한국어 템플릿 자동 생성("…은(는) …에 위치한 주요 미술관입니다").
  - `src/i18n/exhibitionLocalization.ts` — `title_ko / description_ko` 읽고 폴백. 전시 유형 라벨(상설/진행/예정/종료).
  - `src/i18n/geoLocalization.ts` — 대륙·국가·도시 정적 맵(부분).

### 1.2 커버리지
- 적용됨: App, Mypage(부분), Login(부분), VenuePanel(미술관 상세, geo+exhibition 헬퍼).
- **미적용(영문 하드코딩)**: OnboardingPage, ExhibitionPage, HomePage 등 ~9개 페이지, 네비게이션 라벨, 카드/폼 마이크로카피. SubmissionForm은 한국어 하드코딩(전환 불가).

### 1.3 데이터
- 미술관 **214개**(`src/data/exhibitions.js`) — name/location/description/전시 제목·설명. `_ko` 없음.
- 컬렉션 **208개 파일 / 작품 ~61.9만 점**(`public/data/*.json`) — title/artist/date/medium/dimensions 등. 스키마 3종(배열형·ID키형·래퍼형). `_ko` 없음.
- 작가 **~3,115명**(`public/data/artists-dates.json`) — **`wikiId` 보유**(예: `"Edvard Munch": { wikiId: "Q41406", … }`). 한글명·약력 없음.
- 큐레이션(`public/data/special-series/*`, `weekly-curations/*`) — **이미 `title_ko/intro_ko/caption_ko` 바이링궐**.

### 1.4 검색 — 두 모드, 한국어 이미 부분 작동
- **AI 의미검색**(순수 text→image, 키워드 매칭 없음):
  `searchByText(q, 100, isPrecisionMode ? 'jina' : 'siglip')`
  - 서버 `/search-by-text` 기본 `engine:'auto'` → **Jina CLIP v2(다국어·1024D, Modal 호스팅, `VECTORIZE_JINA`) 1순위** → 실패 시 **SigLIP(영어 전용)+번역** 폴백.
  - 단 **클라이언트 기본은 `'siglip'`**, "정밀검색" 토글 ON일 때만 `'jina'`(=한국어 native). 토글 기본 OFF → 한국어는 `llama-3.1-8b-instruct`로 영어 번역 후 `"a painting of …"` 캡션 래핑하여 인코딩(번역 KV 90일 캐시).
- **키워드검색**: 클라 `search.worker.ts` warm-prefix(로컬, 키워드 권위) + 서버 `/search-text`(D1 FTS5, `name`·`artist`·`museum` 매칭). 한국어 쿼리는 영어로 번역 + 원문 토큰 OR-매칭. **코퍼스가 영문이라 한국어는 번역 매칭에만 의존**, 콘텐츠 직접 매칭·결과 한글 표시 불가.

> 결론: 의미검색은 Jina로 한국어 native가 *가능*하나 기본값이 아님. 키워드/결과표시 한국어화는 인덱스·데이터에 `_ko`가 있어야 함.

---

## 2. 설계 원칙 (상세)

1. **전환식 표기 (사용자 확정)** — 원어·한글을 나란히 병기하지 않는다. KO 선택 시 한글, EN 선택 시 원어. 한글값이 없으면 KO에서도 원어로 폴백(빈칸 금지). 기존 `t()` / 표시 헬퍼 모델과 정확히 일치.
2. **권위 우선** — 사람이 만든 공식 한글명(Wikidata `ko` 라벨, 한국어 위키백과 표제어, Getty ULAN 한국어)을 기계번역보다 항상 우선.
3. **네이티브 한국어 산문** — 미술관/작가/전시 설명, 큐레이션 인트로·캡션은 영→한 직역투("종류의 X", em-dash 전이, 불필요한 외래어)를 배제하고 한국어 원어민 문장으로. 페르소나별 보이스 유지.
4. **지연 + 캐시** — 61.9만 제목을 전량 사전번역하지 않는다. 대부분은 조회되지 않으므로, 사용자가 처음 볼 때 번역하고 영구 캐시(KV/D1, 정규화 제목+언어 키)한다.
5. **폴백 안전** — Tier 실패·미커버 시 원어 표시. 검색·표시 어디서도 깨지지 않게.
6. **결정적 우선** — 지명·재질·연도·일반 제목 등 규칙/사전으로 정확히 풀리는 것은 LLM/번역 API를 쓰지 않는다(비용 0, 일관성↑).

---

## 3. 데이터 저장 모델

표시 헬퍼가 이미 `_ko`를 읽으므로 핵심 작업은 **"데이터에 `_ko`를 채우는 것"**. 원본을 오염시키지 않도록 **사이드카(sidecar) 분리**를 기본으로 한다.

```
public/data/i18n/
  museums.json      // { [museumId]:  { name_ko, location_ko, description_ko, source } }
  artists.json      // { [artistName]:{ name_ko, wikiId, source } }       ← Wikidata 배치 산출물
  glossary.ko.json  // 재질/기법/연도/일반제목 사전 (L6, Tier0~2) — 또는 src/i18n/*.ts 로 코드화
  titles/           // (선택) 컬렉션별 제목 _ko 사이드카: titles/<collectionFile>.ko.json
```
- **이유(ETC·DRY)**: 41MB급 원본 컬렉션 JSON을 건드리지 않고 번역만 따로 관리·갱신·롤백. 번역 데이터 한 곳(authoritative) 보관.
- **로드 전략**: 미술관/작가는 앱 로드시 머지하거나 헬퍼에 주입. 작품 제목은 (a) 사이드카 정적 파일(권위·사전 결과) + (b) **지연 번역분은 워커 KV/D1 캐시**로 이원화.
- **신규 헬퍼 필요**: `src/i18n/artworkLocalization.ts`(작품 title/medium/date 표시 폴백), `src/i18n/artistLocalization.ts`(작가명). 기존 museum/exhibition 헬퍼와 동일 패턴.

---

## 4. 계층별 전략

### L0. UI 크롬 (결정적·저비용)
- `useLanguage()`/`t()` 미적용 페이지(Onboarding, Exhibition, Home, 네비게이션, 카드, 폼) 전면 배선.
- 반복되는 공용 문자열은 `src/i18n/uiStrings.ts`로 중앙화(검색/네비/공통 버튼), 일회성은 인라인 `t({ko,en})` 유지(기존 패턴 존중, 과도한 추상화 금지).
- SubmissionForm 등 **하드코딩 한국어**는 `t()`로 감싸 EN에서도 동작하게.

### L1. 지리 (결정적)
- `geoLocalization.ts`의 국가/도시 맵을 214개 미술관이 쓰는 도시 전수로 보강(현재 부분). exhibitions.js의 `location` 파싱과 정합.

### L2. 미술관 이름·위치·설명 (바운디드 214)
- **이름·위치 = 권위**: Wikidata 미술관 엔티티 `ko` 라벨 + 한국어 위키백과 표제어(예: The Met→메트로폴리탄 미술관, Louvre→루브르 박물관, Tate Modern→테이트 모던). 검수 후 `i18n/museums.json`.
- **설명 = 네이티브 LLM 번역 + 검수**: 214개 × 2~3문장. 직역투 배제. Phase 2(게이트).

### L3. 작가명 (권위·1회성 ~3,115) ★ 큰 무기
- `artists-dates.json`의 `wikiId`로 **Wikidata `ko` 라벨 배치 수집**(SPARQL `VALUES`로 수백 개씩 묶어 1쿼리). 예시:
  ```sparql
  SELECT ?item ?koLabel WHERE {
    VALUES ?item { wd:Q41406 wd:Q5582 … }
    ?item rdfs:label ?koLabel . FILTER(lang(?koLabel)="ko")
  }
  ```
- 폴백: Getty ULAN 한국어(2023~ 한국 작가 1,100명 우선 추가) → 규칙 기반 음역 → 최후 원어 유지.
- 산출: `i18n/artists.json`. 검색 인덱스·작품 카드·작가 페이지가 공유.

### L4. 전시 제목·설명 (바운디드)
- `exhibitionLocalization`이 이미 `_ko` 우선. exhibitions.js 전시 항목에 `title_ko/description_ko` 채움(네이티브 번역, Phase 2).

### L5. 작품 제목 (~61.9만) → §5 파이프라인

### L6. 작품 메타데이터: 재질·기법·연도·치수 (결정적·고ROI)
- 소수의 표현이 대부분을 덮음 → **용어집(규칙 기반)**, API 불필요.
  - 재질/기법: `Oil on canvas`→`캔버스에 유채`, `Bronze`→`청동`, `Watercolor`→`수채`, `Tempera on panel`→`패널에 템페라`… (Getty AAT 한국어 대응 참고)
  - 연도: `c. 1765`→`1765년경`, `1880–85`→`1880–85년`, `ca.`/`circa`→`경`.
  - 치수 단위: `cm/in` 표기 정규화.
- 산출: `src/i18n/mediumGlossary.ts` + `dateLocalization.ts`. 미커버는 원문 폴백.

### L7. 큐레이션 (기존 워크플로)
- 주간/스페셜은 이미 바이링궐. 신규 큐레이션도 `*_ko` 필드 유지. (Claude가 제안·작성, 최종 선정·발행은 사용자 — 기존 원칙 준수.)

---

## 5. 작품 제목 번역 파이프라인 (핵심)

리서치 근거: **시각 맥락은 미술 제목이 어려운 바로 그 조건(짧음·비유·중의성·고유명)에서만 의미 있게 효과**가 있고, `Untitled`·서술형(`Portrait of Mrs. X`)에는 낭비다. 따라서 **이미지 사용은 조건부**로 한다. 또한 **dedup**으로 수천 번 반복되는 일반 제목을 수백 캐논으로 줄인 뒤에야 LLM을 부른다. 대부분 제목은 조회되지 않으므로 **지연+캐시**가 비용을 최소화한다.

| Tier | 대상 | 방법 | 이미지 | 비용 |
|---|---|---|---|---|
| **T0 정규화·dedup** | `Untitled`/`무제`, `Still Life`, `Landscape`, `Composition N`, `Portrait of a Woman` 등 고빈도 | 정규화 후 그룹핑, 1 번역이 N개 커버 | — | 무료(1회) |
| **T1 권위** | Q-id 있는 유명작 | Wikidata `ko` 라벨 | — | 무료 |
| **T2 사전** | 일반·장르·재질 제목 | 큐레이션 용어집(AAT 연계) | — | 무료 |
| **T3 멀티모달 LLM (지연+캐시)** | 나머지 롱테일 | 조회 시 번역, 영구 캐시 | **조건부**(짧음·비유·중의 ≤~4단어 & `Untitled` 아님 & 인물 고유명 아님 → 이미지 첨부 `detail:low`; 그 외 텍스트 경로) | 지연이라 소액 |

- **모델**: T3 vision = Gemini 3 Flash 또는 GPT-4o급(이미지+제목+작가/연도/재질 컨텍스트). 텍스트 경로 = 경량 LLM(Gemini Flash/GPT-4o-mini) 배치, 혹은 NLLB-200 자가호스팅(한계비용 0) 폴백.
- **표기(사용자 확정)**: **전환식**. KO=번역 결과(없으면 원어), EN=원어. (참고: MMCA 등 미술계 관행은 원제 보존+한글 병기지만, 본 사이트는 토글 UX이므로 단일 언어 표기를 채택.)
- **비용 감각**: dedup+지연 결합 시 텍스트 전량도 수~수십 달러 규모, 멀티모달도 실조회분만이라 저렴. 전량 사전 멀티모달은 불필요.
- **저장**: T1·T2 결과는 `i18n/titles/*.ko.json` 정적 사이드카, T3 지연분은 워커 KV/D1 캐시.

---

## 6. 검색 전략 (사용자 요청: 통합이 나은가?)

**핵심 답: 의미검색은 Jina로 "통합"이 맞다. 단 SigLIP+번역은 폴백으로 남겨 이중 안전을 유지하고, 키워드는 별개 트랙으로 한국어 필드를 색인한다. 번역 로직은 폐기하지 말고(KV 캐시라 거의 무료) 키워드·폴백 보강용으로 유지.**

세 갈래로 단계 실행:

- **제안 C — 결과 표시 한국어화 (즉시, 1단계)**
  검색 결과 카드가 표시 헬퍼로 `museum_ko / artist_ko / title_ko` 폴백 렌더. **인덱스 변경 없이** 체감 즉시 개선. L2·L3 데이터가 채워지는 만큼 자동 반영.

- **제안 A — 의미검색 Jina 통합**
  클라이언트 기본 엔진을 `'siglip'`→`'jina'`(또는 `'auto'`)로, "정밀검색" 토글을 기본 ON 또는 라벨 재정의. 효과: 한국어 시적/자연어 쿼리에서 **번역 손실 제거**, 인코더 1개로 단순화, 모달리티 갭 캡션 트릭 불요. SigLIP+번역은 Jina 인코더 다운/타임아웃 시 **자동 폴백**(이미 구현됨).
  ⚠ **선결 확인**: `VECTORIZE_JINA`의 임베딩 커버리지가 전체 코퍼스(작품/이미지 전수)인지 부분인지. 부분이면 재임베딩 완료 후 기본 전환(부분 전환 시 recall 저하 위험). → 게이트.

- **제안 B — 키워드 한국어 색인**
  D1 FTS(`artworks` 테이블)와 클라 `search-warm-prefix.json`에 `title_ko / artist_ko / museum_ko` 컬럼·필드 추가 → 한국어 키워드를 **콘텐츠에 직접 매칭** + 오프라인 즉시검색 한국어 동작 + 결과 표기 한글. 데이터 의존: **작가/미술관 먼저(저비용·권위)**, 제목은 채워지는 대로. 기존 "원문 OR 영어번역" 매칭은 유지(폴백).

**권고 순서**: C(즉시) → B(작가·미술관) → A(Jina 기본화, 커버리지 확인 후) → B(제목, T1~T3 진행분).

---

## 7. 단계별 실행 로드맵

### Phase 1 — 이번 세션 (안전·무비용·가역)
- [ ] L6 용어집 모듈: `mediumGlossary.ts`, `dateLocalization.ts`, 일반제목 사전(T0/T2)
- [ ] L1 geo 갭 채우기
- [ ] `artworkLocalization.ts` + `artistLocalization.ts` 헬퍼 신설, 결과/상세 표시 폴백 배선 (검색 제안 C 토대)
- [ ] Wikidata 이름 파이프라인 **스크립트 작성 + 실행**(무료·가역): `i18n/artists.json`(작가 ~3,115), `i18n/museums.json`(미술관 214) 생성
- [ ] (여유 시) 미적용 페이지 UI `t()` 배선 일부

### Phase 2 — 게이트(사전 확인): LLM 네이티브 번역
- 미술관/전시/작가 **설명** 네이티브 한국어 번역 + 검수 → 사이드카
- 작품 제목 T1(권위)·T2(사전) 적용 → `i18n/titles/*.ko.json`

### Phase 3 — 게이트(비용·배포)
- 작품 제목 **T3 멀티모달 지연 번역** 워커 엔드포인트(이미지 조건부) + KV/D1 캐시
- D1/`search-warm-prefix` **한국어 필드 색인 재빌드**
- 검색 **기본 엔진 Jina 전환**(+ 임베딩 커버리지 확인/재임베딩)
- 워커 재배포

---

## 8. 리스크 · 확인 필요
- **Jina 임베딩 커버리지**(전/부분) — 검색 기본 전환의 선결 조건.
- **LLM 번역 비용 한도·모델 선택** — Phase 2/3 게이트.
- **원본 컬렉션 JSON 불변 원칙** — 번역은 사이드카/캐시로 분리.
- **한글 조사 처리**(은/는, 이/가, 을/를) — 템플릿형 자동 설명 생성 시 주의(museumLocalization에 이미 "은(는)" 패턴 존재).
- **로마자 표기 표준** — 작가명 음역은 국립국어원 외래어 표기법 우선, Wikidata `ko` 없을 때만.
