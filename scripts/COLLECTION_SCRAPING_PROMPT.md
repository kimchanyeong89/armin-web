# 컬렉션 스크래핑 디스패치 프롬프트 (Per-Museum Template)

원격 디스패치(GitHub 브랜치 디스패치, Claude Cowork 등)로 새 미술관 1개를 스크래핑할 때 이 프롬프트를 복사해서 `{...}` 부분을 채워 보냅니다.

**전제**: 이 작업의 규칙·스키마·R2 컨벤션은 모두 `scripts/COLLECTION_SCRAPING_GUIDE.md`에 있습니다. 디스패치 받은 세션은 그 가이드를 먼저 읽고 시작합니다.

---

## 📋 입력 채우기 (Inputs)

```yaml
museum_name: "{영문 공식명}"
museum_name_ko: "{한글 표기}"
country: "{ISO 또는 영문 국가명, exhibitions.js 컨벤션 따름}"
city: "{도시명}"
slug: "{kebab-case-id, 다른 컬렉션과 겹치지 않게}"
website: "{컬렉션 홈 URL}"
target_categories:
  - painting
  - photograph        # 이 미술관에서 수집할 카테고리만 남기기
  - {...}
expected_count: {수집 예상 작품 수, 모르면 "unknown"}
priority_collections: "{있다면: 'Modern Paintings', 'Photography Archive' 등 - 미술관에 여러 컬렉션이 있을 때}"
```

---

## 🤖 디스패치 프롬프트 본문 (Copy-Paste)

```
You are scraping the artwork collection of a single museum and producing
production-ready files for the armin-web-main project.

CANONICAL RULES — READ FIRST:
- scripts/COLLECTION_SCRAPING_GUIDE.md (스키마, R2 경로, Phase A~F 규칙)
- scripts/EXHIBITION_UPDATE_GUIDE.md (R2 업로드 인증 명령)
- src/data/exhibitions.js (entry payload 포맷 참조)

TARGET:
- Museum: {museum_name} ({museum_name_ko})
- Country / City: {country} / {city}
- Slug: {slug}
- Website: {website}
- Categories to collect: {target_categories}
- Expected count: {expected_count}
- Priority sub-collections (if any): {priority_collections}

YOUR DELIVERABLES (single PR on branch `add-museum/{slug}`):
1. scripts/SOURCE_RESEARCH_{slug}.md
2. scripts/scrape-{slug}.{cjs|mjs}     (or reuse existing if pattern matches)
3. public/data/{slug}-collection.json   (or split by category if large)
4. src/data/pending/{slug}.json         (exhibitions.js entry payload — see below)
5. PR description with the Phase B pilot report + Phase E audit summary

DO NOT TOUCH:
- src/data/exhibitions.js   (will be merged later from pending/)
- public/data/*-collection.json files for other museums
- workers/, src/components/, src/pages/  (out of scope)

EXECUTE IN ORDER:

╔══════════════════════════════════════════════════════════════════╗
║ Phase A — Source Investigation                                   ║
╚══════════════════════════════════════════════════════════════════╝
1. Search existing scripts: `ls scripts | grep -iE "{slug-keywords}"`.
   If a prior probe exists, READ it first; build on it instead of duplicating.
2. Try in priority order: open API → keyed API → IIIF → bulk CSV/JSON
   → site-internal JSON (DevTools Network) → HTML scrape.
3. Write findings to scripts/SOURCE_RESEARCH_{slug}.md using the
   structure from scripts/RIJKSMUSEUM_API_SUMMARY.md:
   - Endpoint(s), params, sample response (1 artwork)
   - Pagination strategy
   - Image URL pattern (IIIF? CDN? Referer-protected?)
   - Rate limit / auth / robots.txt
   - Decision: which source to use, why

╔══════════════════════════════════════════════════════════════════╗
║ Phase B — 100-Item Pilot                                         ║
╚══════════════════════════════════════════════════════════════════╝
1. Pull EXACTLY 100 artworks (don't go further yet).
2. Verify against the 5 pilot criteria in COLLECTION_SCRAPING_GUIDE.md §3:
   - 4-must fields filled in 100/100
   - 6-standard fields filled in ≥80/100
   - Image URLs return HEAD 200, > 10KB
   - No placeholder hash repeating ≥5×
   - All categories ∈ {painting, drawing, print, photograph, video,
     mixed_media_2d, miniature, calligraphy, manuscript}
3. Run: `node scripts/audit/audit-images.mjs --only={slug}-collection-pilot.json`
4. If pilot fails → STOP, return to Phase A with findings.
   Do NOT proceed to Phase C with a broken source.
5. If pilot passes → record the report in PR description.

╔══════════════════════════════════════════════════════════════════╗
║ Phase C — Full Scrape                                            ║
╚══════════════════════════════════════════════════════════════════╝
1. Resume from pilot's 100 — don't restart.
2. Use checkpoint file: scripts/.state/{slug}-progress.json
3. Failed items → scripts/.state/{slug}-failed.ndjson, retry up to 3×.
4. Respect rate limits (1 req/sec default).
5. Final: public/data/{slug}-collection.json with all items.

╔══════════════════════════════════════════════════════════════════╗
║ Phase D — R2 Image Upload                                        ║
╚══════════════════════════════════════════════════════════════════╝
1. Try `node scripts/generic-r2-upload.cjs --collection {slug}-collection.json` first.
2. If that script doesn't fit the source, follow the manual pattern in
   COLLECTION_SCRAPING_GUIDE.md §3 Phase D.
3. Path: artworks/{collection-stem}/{id}-{hash8}-imageUrl.webp
4. Replace every `imageUrl` in the JSON with the R2 URL.
   Keep `original_imageUrl` untouched (audit trail).

╔══════════════════════════════════════════════════════════════════╗
║ Phase E — Audit                                                  ║
╚══════════════════════════════════════════════════════════════════╝
1. `node scripts/audit/audit-images.mjs --only={slug}-collection.json`
2. Read scripts/audit/audit-report.json for this collection's row.
3. If OK ≥ 95% → proceed.
   If 80~95% → remove BROKEN/PLACEHOLDER records from the JSON, re-audit.
   If < 80% → STOP, escalate. Source needs re-investigation.

╔══════════════════════════════════════════════════════════════════╗
║ Phase F — Hand-off                                               ║
╚══════════════════════════════════════════════════════════════════╝
1. Create src/data/pending/{slug}.json with the exhibitions.js entry payload:
   {
     "id": "{slug}",
     "slug": "{slug}",
     "name": "{museum_name_ko}",
     "name_en": "{museum_name}",
     "location": "{city}, {country_ko}",
     "location_en": "{city}, {country}",
     "description": "{1-2 sentence intro in Korean — written natively, not translated}",
     "description_en": "{1-2 sentence intro in English}",
     "latitude": {lat},
     "longitude": {lng},
     "country": "{country}",
     "region": "{city or state}",
     "representativeImage": "{R2 URL of one hero image from the collection}",
     "permanentExhibitions": [
       {
         "id": "{slug}-collection",
         "name": "{Collection Name}",
         "name_en": "{Collection Name English}",
         "title": "{Collection Name} Permanent Collection",
         "description": "Permanent collection of {museum_name}.",
         "collectionFile": "{slug}-collection.json"
       }
     ],
     "temporaryExhibitions": [],
     "pastExhibitions": []
   }
   NOTE: Korean description must read as native Korean prose, not as
   English-to-Korean translation. (See feedback_korean_natively memory.)

2. Open PR `add-museum/{slug}` with this description template:

   ## {museum_name} ({museum_name_ko}) Collection
   - Country: {country}, City: {city}
   - Source type: {api|iiif|bulk|html}
   - Source endpoint(s): {url}
   - Total artworks: {N}
   - Categories: painting {x}%, photograph {y}%, ... (full breakdown)

   ### Phase B Pilot (100 items)
   - 4-must fields: {x}/100
   - 6-standard fields: {y}/100
   - Image HEAD 200: {z}/100
   - Placeholder clusters: {count}

   ### Phase E Audit (full)
   - OK: {n} ({pct}%)
   - PLACEHOLDER: {n}
   - BROKEN: {n}

   ### Files
   - public/data/{slug}-collection.json ({N} artworks)
   - src/data/pending/{slug}.json (exhibitions.js payload)
   - scripts/SOURCE_RESEARCH_{slug}.md
   - scripts/scrape-{slug}.cjs

VERIFICATION BEFORE OPENING PR:
- [ ] git diff --stat shows only files in scripts/, public/data/, src/data/pending/
- [ ] No edits to src/data/exhibitions.js
- [ ] No edits to other collections' JSON
- [ ] Audit report OK ≥ 95%
- [ ] Korean description reads natively (not translationese)

ESCALATE (do NOT force-complete) when:
- Source has no API and HTML is JS-rendered + anti-bot → flag for Playwright setup
- Online collection covers < 30% of stated holdings → flag for partial-only PR with note
- Cannot find ≥ 50 artworks meeting 4-must fields → museum doesn't qualify, close PR with reason
```

---

## 📤 디스패치 호출 예시

**GitHub 브랜치 디스패치 호출 시**:
```
Branch: add-museum/moderna-museet
Prompt: (위 본문에 아래를 채워서 전체 복붙)
  museum_name: "Moderna Museet"
  museum_name_ko: "모데르나 미술관"
  country: "Sweden"
  city: "Stockholm"
  slug: "moderna-museet"
  website: "https://www.modernamuseet.se/stockholm/en/collection/"
  target_categories: [painting, photograph, drawing, print, video]
  expected_count: ~138000
  priority_collections: "Modern paintings (Picasso, Matisse, Pollock collection)"
```

---

## 🔁 배치 디스패치 흐름 (85개 처리)

1. **첫 2~3건**: 직접 (혹은 Cowork) 시도 → 패턴·함정 파악 → 가이드/프롬프트 보정
2. **나머지**: GitHub 디스패치, 1 미술관 = 1 브랜치/PR
3. 주기적으로 로컬에서:
   ```bash
   git fetch --all --prune
   gh pr list --label collection-scrape --state open
   ```
4. PR 검토 → 통과한 것 squash merge
5. `src/data/pending/`이 일정 수 쌓이면 머지 스크립트 (별도 작성 예정) 1회 실행 → `exhibitions.js`에 일괄 통합

---

## ⚠️ 디스패치 운영 주의

- **동일 미술관 중복 디스패치 방지**: 호출 전 `gh pr list --search "add-museum/{slug}"` 확인
- **API 키 필요한 미술관**: 디스패치 환경에 환경변수 주입되어 있는지 확인. 없으면 IIIF/벌크 등 대체 경로 우선 시도하도록 프롬프트에서 지시
- **Failed 디스패치 회수**: PR 자체가 안 열리거나 Escalate된 경우 별도 트래킹 (`docs/museum-scrape-status.md` 등)
- **로컬 dev server HMR**: 머지 후 `exhibitions.js` 갱신 → vite가 자동 리로드 (이 부분은 user가 로컬에서 확인)
