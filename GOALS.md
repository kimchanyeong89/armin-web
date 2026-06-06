# ARMIN — 목표 & 도전 노트
> 마지막 업데이트: 2026-05-19
> 다음 분기에 시도할 큰 목표와, 그 아래 도전 과제들을 한 곳에 모아둔다.
> 형식 — 목표는 "왜"부터, 도전은 "어떻게"까지.

---

## 0. 이 문서를 쓰는 이유

ARMIN의 작업이 추천 시스템·임베딩·콘텐츠로 빠르게 가지를 뻗는 동안, "이번 분기 우리가 진짜로 옮기려는 바늘은 무엇인가"가 흩어지기 쉽다.
이 문서는 그 바늘 하나하나를 적어두는 곳이다. 로드맵(Phase 단위 실행 계획)은 별도 문서에 살고, 여기에는 **무엇을, 왜, 어디까지 가면 성공인가**만 적는다.

도전이 끝나거나 폐기되면 줄 긋고 그대로 둔다(역사 보존).

---

## 1. 큰 목표 (Vision)

ARMIN을 통해 한 명의 사용자가
- 전에는 닿지 않던 작품·전시에 닿고,
- 자기 취향을 더 또렷하게 알게 되고,
- 그 결과로 실제로 미술관에 한 번 더 간다.

이 세 가지가 측정 가능한 시점에 도달했는가 — 모든 도전은 결국 여기에 기여해야 한다.

---

## 2. 도전 과제 (Challenges to try)

### 2.1 GEO — ARMIN을 AI 검색·LLM에 학습/소개시키기  ⭐ NEW

**상태**: 미착수
**제안 착수**: 2026 Q3
**근거 문서**: Google이 2026-05-15에 공식 발표한 "Generative AI 기능 최적화 가이드"
**문서 링크**: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide

#### 왜 (Why)

사람들이 미술관·전시·작가를 검색하는 입구가 빠르게 바뀌고 있다.
구글 일반 검색만이 아니라 — AI Overviews, AI Mode, ChatGPT, Perplexity, Gemini, Claude 같은 생성형 엔진이 "이 주말에 서울에서 볼만한 전시", "OOO 작가와 비슷한 화풍의 한국 작가", "리움에서 꼭 봐야 할 상설작 5개" 같은 질문에 직접 답한다.
**그 답에 ARMIN이 인용되어야** 한다 — 인용되지 않으면 우리는 존재하지 않는 것과 같다.

Google이 공식 가이드를 낸 직후가 정확한 타이밍이다. 모두가 헷갈리는 시점에 ARMIN이 먼저 정리해두면, 한국 미술 도메인에서 AI가 가장 자주 인용하는 출처가 될 수 있다.

#### Google 공식 가이드의 핵심 (제대로 학습한 결과)

> 한 줄 — **"GEO는 결국 SEO다. 새로운 hack을 만들지 말고, 기본기 + non-commodity 콘텐츠에 집중하라."**

##### AI가 우리 콘텐츠에 닿는 두 가지 길
1. **Retrieval-Augmented Generation (그라운딩)** — Google 코어 랭킹으로 관련 페이지를 검색 → 거기서 정보를 뽑아 답변 생성 → 출처 링크 표시. 즉 **기존 SEO 랭킹이 그대로 AI 노출의 입구**다.
2. **Query Fan-Out** — 한 질문에서 AI가 여러 개의 관련 쿼리를 동시에 던진다. 예: "잡초로 뒤덮인 잔디 어떻게 살리지?" → 제초제, 무화학 제거, 예방법 각각 검색. 즉 **한 질문에 잘 답하는 페이지보다, 한 주제의 여러 각도를 다 커버하는 사이트가 유리**.

##### 가장 큰 레버 — Non-commodity 콘텐츠
- **commodity**: "초보 미술관 관람객을 위한 팁 7가지" — 누구나 쓸 수 있는 일반 지식.
- **non-commodity**: "리움에서 우리 사용자 12,000명이 가장 오래 머문 작품 — 우리가 그 이유를 임베딩으로 본 결과" — **1차 경험·전문성·고유 데이터**가 들어간 내용.
- Google이 명시: "재활용 가능한 콘텐츠, 다른 생성형 AI가 쉽게 생산할 수 있는 콘텐츠는 의미가 없다."

##### 기술 기반 — 빠진 게 있으면 위의 콘텐츠도 소용없음
- 페이지가 **크롤 가능 + 인덱스 가능 + Search 스니펫 자격**을 만족해야 한다.
- 시맨틱 HTML(완벽하지 않아도 됨), JS SEO 베스트 프랙티스(JS가 막혀 있지 않아야 함), 모바일 대응, 낮은 지연, 중복 콘텐츠 최소화.
- Search Console로 진단.

##### 안 해도 되는 것들 (Google이 명시적으로 부정한 GEO 신화)
- `llms.txt`, AI 전용 마크다운 파일, 특수 마크업 → **불필요**.
- 콘텐츠를 잘게 쪼개기(chunking) → **불필요**. "구글 시스템은 한 페이지 안의 여러 주제를 이해할 수 있다."
- AI용 동의어·롱테일 키워드로 재작성 → **불필요**.
- 인위적 mention/백링크 사냥 → **무의미**.
- schema.org 구조화 데이터 과집착 → AI 노출에 **필수 아님** (단, 리치 결과에는 여전히 유용).

##### Agentic 웹 (선택)
AI 에이전트가 사이트를 스크린샷·DOM·접근성 트리로 읽는 시나리오. 여유 있을 때 본다. Universal Commerce Protocol(UCP)이라는 신생 프로토콜.

#### ARMIN 진단 — 강점과 빈틈 (실측 2026-05-19)

**강점 — 이미 GEO에 유리한 자산**
- **1차 경험 콘텐츠가 있다**: Weekly thematic / dialogue, persona-fallback 큐레이션. Google이 말한 정확히 그 "non-commodity" 영역.
- **한국어 네이티브 카피**: 번역체가 아닌 네이티브 한국어 — 한국 미술 도메인에서 거의 유일한 포지션 (관련 메모: `feedback_korean_natively`).
- **고유 데이터 신호**: SigLIP 660k 이미지 임베딩, 사용자 좋아요 centroid 취향 벡터, cosine similarity 기반 추천 — 다른 누구도 가지지 못한 1차 데이터.
- **풍부한 정적 도메인 데이터**: `src/data/exhibitions.js`의 미술관·작가·상설·임시전시 인벤토리.
- **통합 검색 인덱스**: `public/data/search-manifest.json`, `search-warm-prefix.json` — 자체 검색 그라운딩 기반.

**빈틈 — 그대로 두면 AI에게 안 보이는 것들**
- ❌ `public/robots.txt` 없음 → 봇에 명시적 가이드 없음, AI 엔진별 정책도 못 함.
- ❌ `public/sitemap.xml` 없음 → 동적 라우트(`/exhibition/:id`, `/work/:id`)를 봇이 발견할 길이 사실상 막힘.
- ❌ SSR/SSG/prerender 전혀 없음 — Vite SPA. `index.html`에 `<title>Armin Gallery</title>` 한 줄. 나머지 메타는 클라이언트 렌더 이후에야 생기는데, **Google AI 인덱싱은 JS 실행 후의 결과를 자주 못 본다**.
- ❌ 라우트별 `<meta description>`, `og:image`, `twitter:card`, JSON-LD 없음.
- ❌ 핵심 콘텐츠 라우트가 전부 동적이라 위 두 가지 빈틈이 더 치명적: `/exhibition/:id`, `/work/:id`, `/artist-gallery/:artistName`, `/collection/:collectionId`, `/tate-modern/permanent`.
- ❔ Google Search Console 등록 여부 미확인.
- ❔ Cloudflare(Pages/Workers)의 `_headers`·`_redirects`에서 봇 UA 차단 정책 미확인.

#### 어떻게 (Method) — 5단계

각 단계는 위의 빈틈 중 어디를 메우는지 명시한다. **수단(SEO 기본기) → 콘텐츠(non-commodity 강화) 순서**로 간다. 수단이 빠지면 콘텐츠도 안 보이기 때문에.

##### Phase 1 — 크롤링 기본기 (1~2주, 가장 먼저)
> 빈틈: robots/sitemap 없음, 봇이 라우트를 발견 못 함

- [ ] `public/robots.txt` 추가. 기본 예시:
  ```
  User-agent: *
  Allow: /
  Disallow: /admin
  Sitemap: https://armin.gallery/sitemap.xml
  ```
- [ ] AI 봇 정책 결정 후 `robots.txt`에 명시 — 별도 결정 필요:
  - `GPTBot` (OpenAI 학습), `ChatGPT-User` (브라우즈), `PerplexityBot`, `ClaudeBot` (Anthropic), `Google-Extended` (Gemini 학습)
  - 트레이드오프: AI 답변 노출 vs 모델 학습 데이터 제공. ARMIN은 노출 우선이므로 **기본 Allow** 권장.
- [ ] `scripts/generate-sitemap.ts` 작성 + `npm run build` 후 자동 실행.
  - 정적: `/`, `/community`, `/ai`, `/exhibitions`, `/search`
  - 동적: `src/data/exhibitions.js`를 돌며 `/exhibition/{id}`, `/collection/{collectionFile basename}`, `/artist-gallery/{slug}` 자동 출력.
- [ ] Google Search Console 등록 + sitemap 제출. 색인 상태 베이스라인 기록.
- [ ] Cloudflare 설정에서 봇 UA 차단·rate-limit 없는지 확인.

##### Phase 2 — 페이지별 메타 + 선택적 구조화 데이터 (2~3주)
> 빈틈: 라우트별 메타 없음. JSON-LD 없음.

- [ ] `react-helmet-async` 도입. 라우트 컴포넌트마다 `<Helmet>`으로 채움:
  - `<title>` (작품명·전시명·작가명 포함)
  - `<meta name="description">` (1차 해설 본문 앞 160자)
  - `og:title`, `og:description`, `og:image`, `og:type`, `twitter:card`
- [ ] **선택적** JSON-LD (Google 가이드대로 과집착 X, 해당하는 곳만):
  - `/exhibition/:id` → `ExhibitionEvent`
  - `/work/:id` → `VisualArtwork` (creator, dateCreated, artMedium 등)
  - `/artist-gallery/:artistName` → `Person`
  - 미술관 상세 → `Museum` (extends `Place`)
- [ ] `<img alt="...">` 검수 패스 — 작가 + 작품명 + 매체. 봇에게 이미지 의미 전달.
- [ ] `<link rel="alternate" hreflang="ko"/"en"/"x-default">` — 한·영 이중 인덱싱.

##### Phase 3 — SPA의 크롤 한계 극복 (3~4주, 가장 어려움)
> 빈틈: JS 실행 전 HTML이 비어 있음. AI 인덱서는 보통 거기서 멈춤.

옵션 A — 부분 prerender (권장):
- [ ] `vite-plugin-prerender-spa` 또는 `react-snap` 도입.
- [ ] 빌드 시 `exhibitions.js` 인벤토리에서 ID enumerate → 핵심 라우트만 정적 HTML 생성.
  - 우선순위: `/exhibition/*`, `/work/*`, `/artist-gallery/*`, `/collection/*`, `/exhibitions`, `/ai`, `/tate-modern/permanent`
  - 후순위: `/community/*`, `/admin/*`(어차피 noindex)

옵션 B — 봇 UA 라우팅:
- [ ] Cloudflare Worker에서 봇 UA 감지 → prerender.io 캐시 응답 또는 자체 정적 캐시로 라우팅.

옵션 C — Next.js 마이그레이션:
- 큼. 별도 결정 필요. **이 분기엔 검토만**.

부수 작업:
- [ ] LCP / INP / CLS 측정 (PageSpeed Insights) — 페이지 경험 신호.

##### Phase 4 — Non-commodity 콘텐츠 강화 (지속)
> 빈틈: 우리가 가진 1차 데이터가 가시 영역에 안 나옴.

- [ ] Weekly 콘텐츠를 공개 라우트로 노출 — `/weekly/{slug}` 형태. 현재 `/admin/weekly/preview`만 있어 비공개.
- [ ] 각 작품/전시 페이지에 ARMIN 고유 인사이트 블록 추가:
  - "ARMIN 사용자 N명 중 X%가 좋아요한 작품"
  - "이 작품과 시각적으로 가장 가까운 ARMIN 컬렉션 5점" (SigLIP cosine 기반)
  - 페르소나 다이얼로그 본문
- [ ] 미술관 페이지에 우리만 가진 데이터: 컬렉션 규모, 사용자 인기 Top 5, 큐레이터 노트.
- [ ] 한국어 + 영어 동시 운영 (Phase 2의 hreflang과 짝).

##### Phase 5 — 측정·반복 (지속)
> 빈틈: AI 노출이 잡히는지 안 잡히는지 모름.

- [ ] Search Console — AI Overviews 노출/클릭 추적, 분기별 비교.
- [ ] 매주 시드 쿼리 10개를 ChatGPT/Perplexity/Gemini/Claude에 직접 던지고 ARMIN 인용 여부 기록.
  - 예: "한국에서 OOO 작가 전시 보는 곳", "주말에 서울에서 볼 만한 전시", "리움 상설 추천", "도슨트가 좋은 미술관"
- [ ] 인용된 페이지 패턴 분석 — 어떤 종류의 페이지가 AI에게 잘 잡히는가? 그 패턴을 다음 분기 콘텐츠 결정에 반영.

#### 안 할 것 (명시)

Google이 부정한 것들에 시간 쓰지 않는다:
- `llms.txt` 만들기
- 콘텐츠를 작은 chunk로 쪼개기
- AI용 동의어·롱테일 키워드로 재작성
- 가짜 mention/백링크 사냥
- 구조화 데이터를 만병통치약처럼 다루기
- AI 인덱서를 위해 두 벌의 콘텐츠 운영(인간용 / AI용)

#### 성공 기준 (Definition of Done — 2026 Q4 시점)

- [ ] Search Console 인덱스된 ARMIN 페이지 수 ≥ 1,000개 (전시·작품·작가 합산)
- [ ] 핵심 라우트 12개 이상이 봇 UA(`curl -A Googlebot ...`)로 fetch했을 때 HTML 본문에 제목·설명·1차 콘텐츠가 보임
- [ ] 시드 쿼리 10개 중 3개 이상에서 한 개 이상의 AI 엔진이 ARMIN을 인용
- [ ] Search Console에서 AI Overviews 노출 리포트가 양수(>0)

---

### 2.2 (이 자리 비워둠)

> 새 도전이 생기면 같은 형식으로 추가: 왜 / 진단 / 어떻게 / 안 할 것 / 성공 기준.

---

## 3. 참고 자료

GEO:
- [Google Search Central — Optimizing for generative AI features (2026-05-15, 공식)](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [Search Engine Journal — Google's New AI Search Guide Calls AEO And GEO 'Still SEO'](https://www.searchenginejournal.com/googles-new-ai-search-guide-calls-aeo-and-geo-still-seo/575026/)
- [Search Engine Land — Mastering generative engine optimization in 2026](https://searchengineland.com/mastering-generative-engine-optimization-in-2026-full-guide-469142)

저장소 내 관련 문서:
- [EXHIBITION_RECOMMENDATION_ROADMAP.md](EXHIBITION_RECOMMENDATION_ROADMAP.md) — 추천 시스템 Phase 로드맵
- [docs/RECOMMENDATION_SYSTEM_ROADMAP.md](docs/RECOMMENDATION_SYSTEM_ROADMAP.md)
