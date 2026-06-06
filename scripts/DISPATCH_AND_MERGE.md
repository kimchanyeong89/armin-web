# 디스패치 & 머지 운영 가이드

외부에서 미술관 스크래핑을 한 건씩 시켰을 때, **나중에 합칠 때 충돌이 안 나도록** 운영하는 방법.

> 관련 문서
> - 무엇을 스크래핑할지: [`MUSEUM_SCRAPING_LIST.md`](../MUSEUM_SCRAPING_LIST.md) (저장소 루트)
> - 어떻게 스크래핑할지 (규칙·스키마): [`scripts/COLLECTION_SCRAPING_GUIDE.md`](COLLECTION_SCRAPING_GUIDE.md)
> - 디스패치 세션에 줄 프롬프트 본문: [`scripts/COLLECTION_SCRAPING_PROMPT.md`](COLLECTION_SCRAPING_PROMPT.md)

---

## 1. 시키는 방식 (Dispatch)

### 1-1. 외부에서 보내는 메시지 (최소 형태)

```
Scrape museum: {slug}
(per MUSEUM_SCRAPING_LIST.md + scripts/COLLECTION_SCRAPING_PROMPT.md)
```

예:
```
Scrape museum: moderna-museet
(per MUSEUM_SCRAPING_LIST.md + scripts/COLLECTION_SCRAPING_PROMPT.md)
```

이게 전부. 50자 미만. 모바일에서 부담 없이 보낼 수 있어요.

### 1-2. 디스패치 받은 Claude가 자동으로 하는 일

1. `MUSEUM_SCRAPING_LIST.md`에서 `slug` 행을 찾아 미술관 정보(이름·국가·도시·웹사이트·카테고리) 추출
2. `scripts/COLLECTION_SCRAPING_PROMPT.md`의 본문을 읽고 그 안의 `{...}` 자리를 위 정보로 채움
3. `scripts/COLLECTION_SCRAPING_GUIDE.md`의 규칙 준수
4. 브랜치 `add-museum/{slug}` 생성 (이 이름 규칙 고정)
5. Phase A → B → C → D → E → F 순서대로 실행
6. PR 열기 + 표준 description 작성

### 1-3. 한 번에 더 많이 시키고 싶을 때

같은 메시지를 슬러그만 바꿔서 여러 번 보내면 됩니다. 디스패치들은 서로 다른 브랜치에서 독립적으로 작업하므로 병렬로 돌려도 됩니다.

```
Scrape museum: moderna-museet (per MUSEUM_SCRAPING_LIST.md + scripts/COLLECTION_SCRAPING_PROMPT.md)
Scrape museum: prado (per MUSEUM_SCRAPING_LIST.md + scripts/COLLECTION_SCRAPING_PROMPT.md)
Scrape museum: eastman-museum (per MUSEUM_SCRAPING_LIST.md + scripts/COLLECTION_SCRAPING_PROMPT.md)
```

### 1-4. 중복 디스패치 방지

디스패치 보내기 전에 `MUSEUM_SCRAPING_LIST.md`의 `Status` 열을 확인:
- `pending` → 보내도 됨
- `in-progress` / `merged` → 보내지 말 것 (이미 진행 중 또는 완료)

PR 열림과 동시에 `Status`를 `in-progress`로 수동 업데이트하면 좋아요. (자동화는 나중에)

---

## 2. 충돌 안 나게 시키는 규칙 (Hard Rules)

디스패치 프롬프트(`COLLECTION_SCRAPING_PROMPT.md`)에 이미 박혀 있지만, 핵심만 다시:

### 디스패치는 다음 파일들을 **절대 건드리지 않음**

| 파일/디렉토리 | 이유 |
|---|---|
| `src/data/exhibitions.js` | 단일 거대 파일 — 모든 디스패치가 수정하면 100% 충돌 |
| `public/data/*-collection.json` (해당 미술관 외) | 다른 디스패치의 작업 영역 |
| `public/data/search-manifest.json` | 검색 인덱스, 임베딩 후 한꺼번에 재생성 |
| `public/data/search-warm-prefix.json` | 위와 동일 |
| `src/data/specials/*` | 별도 큐레이션 영역 |
| `workers/`, `src/components/`, `src/pages/` | 스크래핑 작업 스코프 외 |

### 디스패치가 **새로 만들기만 하는** 파일들

| 파일 | 내용 |
|---|---|
| `public/data/{slug}-collection.json` | 그 미술관 전용 — 충돌 불가능 |
| `src/data/pending/{slug}.json` | exhibitions.js 페이로드 (나중 머지용) — 신규 디렉토리, 파일명 unique |
| `scripts/SOURCE_RESEARCH_{slug}.md` | 그 미술관 소스 조사 노트 |
| `scripts/scrape-{slug}.{cjs|mjs}` | 그 미술관 스크래퍼 |
| `scripts/.state/{slug}-*.{json,ndjson}` | 진행 체크포인트 |

→ 이 패턴 덕분에 **2개 PR이 같은 파일을 동시에 수정할 일이 없음**. `git merge`가 항상 fast-forward.

### 브랜치 이름 규칙

- `add-museum/{slug}` — 고정 prefix + 슬러그
- 두 디스패치가 같은 슬러그를 잡으면 두 번째가 실패 (의도된 충돌 → PR 단계에서 발견)

---

## 3. 나중에 합치는 방식 (Merge)

### 3-1. 일상 머지 (PR 1건씩)

노트북 앞으로 돌아왔을 때:

```bash
# 1. 열려 있는 collection-scrape PR 목록 확인
gh pr list --search "head:add-museum/" --state open

# 2. 하나씩 검토
gh pr view {PR번호}
gh pr diff {PR번호}

# 3. 검증 (선택) — 파일럿 리포트가 PR description에 있으니 빠르게 OK 판단 가능
#    의심스러우면 체크아웃해서 직접 audit 실행
git fetch origin add-museum/{slug}
git checkout add-museum/{slug}
node scripts/audit/audit-images.mjs --only={slug}-collection.json

# 4. 머지 (squash 권장 — 커밋 깔끔하게)
gh pr merge {PR번호} --squash --delete-branch

# 5. MUSEUM_SCRAPING_LIST.md 업데이트 (Status: merged, PR: #번호)
```

이 시점까지는 **`exhibitions.js`는 여전히 그대로**. `src/data/pending/{slug}.json`만 늘어남.

### 3-2. 일괄 통합 (pending → exhibitions.js)

`src/data/pending/`에 5~10개 쌓이면 한 번에 정리:

```bash
git checkout main && git pull

# pending 디렉토리에 뭐가 있는지 확인
ls src/data/pending/

# 각 파일의 내용을 exhibitions.js의 적절한 위치(국가별 블록)에 수동 삽입
# (현재는 manual copy-paste. 자동화 스크립트는 추후 추가 예정)

# 통합 끝난 pending 파일은 .merged/ 하위로 이동 (이력 보존)
mkdir -p src/data/pending/.merged
mv src/data/pending/{merged-slug-1}.json src/data/pending/.merged/
mv src/data/pending/{merged-slug-2}.json src/data/pending/.merged/

# 로컬 dev 확인
npm run dev
# → 추가된 미술관이 globe/map에 나오는지, 컬렉션 페이지가 열리는지 확인

# 커밋
git add src/data/exhibitions.js src/data/pending/
git commit -m "feat(museums): integrate {N} new museums from pending — {slug-list}"
git push
```

> 💡 **자동 머지 스크립트는 첫 PR 1~2건 받아본 뒤에 작성**합니다 (`scripts/merge-pending.mjs`).
> 실제 페이로드 형식 확인 → AST 기반 삽입 vs sed 기반 append 결정.
> 지금부터 만들면 가정 위에 짓는 거라 Karpathy 룰 위배.

### 3-3. 임베딩까지 가는 길

여기까지가 이 가이드의 책임. 다음 단계는:
1. R2 이미지 일정 수 누적되면 → `scripts/modal_embed/` 파이프라인으로 SigLIP 임베딩
2. D1 `siglip_index` 갱신
3. `public/data/search-manifest.json` + `search-warm-prefix.json` 재생성
4. `npm run build` 후 배포

이 단계는 디스패치가 아니라 **사용자가 로컬에서 트리거**합니다 (자세한 건 [`ai-search-architecture` 메모리](../.claude/projects/-Users-kietzsche-armin-web-main/memory/ai-search-architecture.md) 참조).

---

## 4. 실패/예외 처리

### Escalate된 PR (디스패치가 진행 불가 판단)

PR description에 "ESCALATE: ..." 사유가 적혀 있음. 처리:
1. 사유 읽고 → 다른 소스(IIIF, 다른 API) 존재 여부 직접 확인
2. 대안 있으면: PR 코멘트로 힌트 주고 **재디스패치** 가능
3. 대안 없으면: PR close, `MUSEUM_SCRAPING_LIST.md`의 `Status`를 `escalated`로, `Notes`에 사유 기록

### Phase E 감사 통과 못 한 PR

`OK < 95%` → 디스패치가 자동으로 BROKEN 레코드 제거 후 재시도하게 되어 있음. 그래도 실패하면 escalate. 머지 안 하는 게 정답.

### 슬러그 충돌

두 사람(또는 두 시점)이 같은 슬러그를 디스패치 → 두 번째가 브랜치 충돌로 실패. 대처:
1. 먼저 열린 PR의 진행상황 확인
2. 죽었으면 (in-progress 인데 며칠째 그대로) → 그 브랜치 강제 삭제 후 재디스패치
3. 살아 있으면 → 그냥 기다림

---

## 5. 한눈에 보는 운영 체크리스트

**디스패치 보내기 전**:
- [ ] `MUSEUM_SCRAPING_LIST.md`에서 슬러그 `Status: pending` 확인
- [ ] 같은 슬러그의 열린 PR 없는지 `gh pr list --search "head:add-museum/{slug}"`

**디스패치 보낼 때**:
- [ ] 메시지에 `per MUSEUM_SCRAPING_LIST.md + scripts/COLLECTION_SCRAPING_PROMPT.md` 명시

**PR 받은 후 머지 전**:
- [ ] PR description에 Phase B 파일럿 결과 있음
- [ ] PR description에 Phase E 감사 결과 OK ≥ 95% 있음
- [ ] git diff에 `src/data/exhibitions.js` 수정 없음 (확인 필수)
- [ ] git diff에 다른 미술관 collection JSON 수정 없음

**머지 후**:
- [ ] `MUSEUM_SCRAPING_LIST.md` Status → `merged`, PR 번호 기입

**pending 5~10개 쌓였을 때**:
- [ ] `exhibitions.js`에 일괄 통합 (지금은 manual)
- [ ] 통합한 pending 파일 `.merged/`로 이동
- [ ] `npm run dev`로 시각 확인
