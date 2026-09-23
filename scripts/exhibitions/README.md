# 수도권 미술관 전시 일일 자동 동기화

서울·경기 주요 미술관 **14곳**의 진행/예정 전시를 매일 수집해
`src/data/exhibitions.js` 에 반영하고 포스터를 R2 에 보관하는 파이프라인이다.

> 기존 `scripts/sync-exhibitions.mjs` 는 스크래핑 결과를 **출력만** 하고
> 데이터 반영은 사람이 손으로 했다. 이 파이프라인은 반영까지 자동화하며,
> 부산·제주 등 수도권 밖 미술관은 여전히 옛 스크립트가 담당한다.

---

## 대상 미술관

| 미술관 | `exhibitions.js` id | 소스 |
|---|---|---|
| 국립현대미술관 서울 | `mmca-seoul` | `mmca` |
| 국립현대미술관 과천 | `mmca-gwacheon` | `mmca` |
| 국립중앙박물관 | `national-museum-korea` | `nmk` |
| 국립민속박물관 | `folk-museum` | `nfm` |
| 서울시립미술관 | `seoul-museum-of-art` | `sema` |
| 리움미술관 | `leeum-museum` | `leeumhoam` |
| 호암미술관 | `hoam-museum` | `leeumhoam` |
| 아모레퍼시픽미술관 | `apma` | `apma` |
| 대림미술관 | `daelim-museum` | `daelim` |
| 디뮤지엄 | `d-museum` | `daelim` |
| 예술의전당 한가람미술관 | `hangaram-art-museum` | `sac` |
| 동대문디자인플라자 | `ddp-gallery` | `ddp` |
| 그라운드시소 | `groundseesaw` | `groundseesaw` |
| 백남준아트센터 | `njpac` | `njpac` |

한 소스가 여러 미술관을 담당하기도 한다. MMCA 는 한 목록에 서울·과천·덕수궁
전시가 섞여 나오므로 전시관을 판별해 나눠 담고(덕수궁관은 서울로 합침, 청주관은 제외),
대림문화재단은 대림미술관/디뮤지엄을, 삼성문화재단은 리움/호암을 나눠 담는다.

---

## 매일 도는 방식

`.github/workflows/sync-exhibitions.yml` 이 **매일 06:00 KST**(UTC 21:00)에 실행된다.
변경의 성격에 따라 두 단계로 나뉜다.

**1단계 — 기존 전시 갱신 (`--no-new`) → main 에 바로 커밋**
기간 연장·조기 종료, 상태 전환, 포스터 교체, 종료 전시의 `pastExhibitions` 이관.
사람이 검토할 필요가 없는 변경이라 자동 반영하고 Firebase 배포까지 이어진다.

**2단계 — 신규 전시 (전체 실행) → draft PR**
새로 발견한 전시는 제목·소개문이 미술관 사이트에서 긁힌 그대로라 표현을 다듬어야 한다.
`bot/new-exhibitions` 브랜치에 올려 draft PR 로 알린다. 이 브랜치는 매일 최신 main
기준으로 다시 만들어지므로 **열려 있는 PR 은 항상 하나**이고 내용은 늘 최신이다.

> `GITHUB_TOKEN` 으로 push 한 커밋은 다른 워크플로를 트리거하지 않는다.
> 그래서 1단계 커밋 뒤 배포 워크플로를 `workflow_dispatch` 로 직접 호출한다
> (`deploy-firebase.yml` 에 해당 트리거를 추가해 둠).

---

## 수동 실행

```bash
npm run exhibitions:test        # 파이프라인 자체 점검 (네트워크 불필요)
npm run exhibitions:dry         # 수집 결과만 확인, 파일은 안 건드림
npm run exhibitions:sync        # 실제 반영

# 세부 옵션
node scripts/exhibitions/sync.mjs --source sema          # 특정 소스만
node scripts/exhibitions/sync.mjs --museum leeum-museum  # 특정 미술관만
node scripts/exhibitions/sync.mjs --no-images            # 포스터 업로드 생략(파싱 점검용)
node scripts/exhibitions/sync.mjs --no-new               # 기존 전시 갱신만
node scripts/exhibitions/sync.mjs --today 2026-12-01     # 기준일 지정(상태 계산 검증용)
node scripts/exhibitions/sync.mjs --report r.json --summary r.md
```

GitHub Actions 의 **Run workflow** 버튼으로도 돌릴 수 있다(dry-run·특정 소스 지정 가능).

---

## 데이터 안전 규칙

스크래핑은 사이트 개편 한 번에 깨진다. 그래서 파이프라인은 **덮어쓰기보다 보존**을 택한다.

1. **수집 0건이면 그 미술관은 건드리지 않는다.** 사이트가 막혀 빈 결과가 와도
   기존 전시가 지워지지 않는다. 날짜만으로 판단되는 종료 전시 이관만 적용된다.
2. **손으로 다듬은 값은 덮어쓰지 않는다.** `description`·`titleEn` 은 비어 있을 때만 채운다.
   기간(`startDate`/`endDate`)은 미술관 사이트를 정답으로 보고 갱신한다.
3. **`coverImage` 에는 검사를 통과한 R2 URL 만 쓴다.** 검사나 업로드에 실패하면 기존 이미지를 유지한다.
   미술관 CDN 주소를 그대로 넣으면 Referer 차단·링크 소멸로 브라우저에서 깨진다.
4. **포스터가 없는 새 전시는 추가하지 않는다.** 앱에서는 빈 카드로 보인다.
   미술관이 포스터를 올리면 다음 실행에서 추가되고, 그 전까지는 요약의 보류 목록에 남는다.
5. **저장 전에 파싱 검증한다.** 패치된 파일을 임시로 `import` 해 미술관 수까지 확인한 뒤 저장한다.
6. **전 소스 실패 시 워크플로를 실패로 남긴다.** 조용히 지나가지 않고 알림이 가도록 한다.

---

## 포스터 처리

### 고르기 — 올리기 전에 실제 이미지를 검사한다

목록 카드의 첫 `<img>` 나 상세 페이지 `og:image` 를 그대로 믿으면 엉뚱한 그림이 들어간다.
국립중앙박물관은 돋보기 버튼(49×49)이, 예술의전당은 기관 로고(203×64)가 포스터 자리에 들어간 적이 있다.
그래서 카드마다 후보를 차례로 내려받아 검사하고, 처음 통과한 이미지를 쓴다.

- 후보 순서: 어댑터가 준 `posterUrl` → `posterCandidates` → 상세 페이지 대표 이미지(JSON-LD·`og:image`)
- 거르는 기준 (`lib/images.mjs` 의 `checkPoster`)
  - 주소가 버튼·아이콘·로고·빈 이미지를 가리킨다 (`btn`, `ico`, `logo`, `sns`, `noimage` …)
  - 짧은 변이 150px 미만이거나 면적이 6만px 미만이다
  - 가로세로비가 1:3 ~ 2.4:1 을 벗어난다 (띠 배너, 가로로 긴 로고)
  - 파일이 5KB 미만이거나 이미지로 읽히지 않는다
  - 픽셀당 0.02바이트 미만이다 (한 가지 색으로 칠한 자리표시 이미지)
- 서로 다른 전시가 같은 이미지 파일을 쓰면 사이트 공통 이미지로 보고 모두 버린다.
- dry-run 에서도 검사는 한다. 업로드만 건너뛴다.

탈락한 이미지와 사유는 요약(`--summary`)의 포스터 절에 남는다.

### 저장

포스터는 Cloudflare Worker(`armin-r2-upload`)의 `/proxy-image` 엔드포인트를 통해
R2 에 저장한다. 워커가 서버사이드에서 `Referer` 를 붙여 받아오므로
**CI 에 R2 자격증명을 둘 필요가 없고**, 미술관의 hotlink 차단도 우회된다.

R2 키에는 원본 URL 해시가 들어간다(`exhibitions/covers/{전시id}-{해시}.jpg`).
미술관이 포스터를 교체하면 키가 바뀌어 새 이미지가 올라가고,
바뀌지 않았으면 기존 키를 그대로 재사용해 중복 업로드를 피한다.

워커가 원본을 받지 못하면 검사하며 내려받은 바이트를 워커의 `/upload` 로 직접 올린다.
서울시립미술관 이미지 서버는 `Content-Type` 을 비워 보내서(`;charset=UTF-8`) 워커의 `/proxy-image` 가 거부한다.

---

## 새 미술관 추가하기

1. `src/data/exhibitions.js` 에 미술관 블록이 있는지 확인한다(없으면 먼저 추가).
2. `scripts/exhibitions/sources/<key>.mjs` 를 만든다. 사이트가 쓰는 JSON API 나 목록 마크업을
   직접 읽고, 포스터는 원본 이미지 주소를 골라 넘긴다:

```js
import { getJson } from '../lib/http.mjs';
import { cleanText, normalizeDate } from '../lib/parse.mjs';

const BASE = 'https://example-museum.kr';

export default {
  key: 'example',
  label: '예시미술관',
  homepage: BASE,
  museums: ['example-museum'],          // exhibitions.js 의 id

  async fetch({ log }) {
    const data = await getJson(`${BASE}/api/exhibitions?status=current`, { referer: `${BASE}/` });
    const cards = (data?.list || []).map((item) => ({
      museumId: 'example-museum',
      title: cleanText(item.title),
      startDate: normalizeDate(item.startDate),
      endDate: normalizeDate(item.endDate),
      posterUrl: `${BASE}${item.originalImage}`,      // 목록 썸네일보다 원본
      posterCandidates: [`${BASE}${item.thumbnail}`], // 원본이 검사에서 탈락하면 쓸 예비 후보
      posterReferer: `${BASE}/`,
      officialUrl: `${BASE}/exhibition/${item.id}`,
      sourceId: String(item.id),
    }));
    log(`    ✓ 현재 전시 → ${cards.length}건`);
    return cards;
  },
};
```

3. `sources/index.mjs` 의 `SOURCES` 와 `MUSEUM_LABELS` 에 등록한다.
4. `node scripts/exhibitions/test.mjs` 로 레지스트리 정합성을 확인하고,
   `node scripts/exhibitions/sync.mjs --source example --dry-run` 으로 수집과 포스터 검사 결과를 확인한다.

`genericParse`(JSON-LD → 목록 카드 추출)는 사이트 구조를 모를 때 쓰는 마지막 수단이다.
블록의 첫 이미지를 포스터로 잡아서 버튼이나 로고가 섞이기 쉽다. 포스터 검사가 걸러 주지만
주소를 직접 고르는 편이 정확하다.

---

## 소스가 깨졌을 때

워크플로 요약(Job Summary)과 `exhibition-sync-report` 아티팩트에
미술관별 수집 건수·실패 사유·정보가 빠진 전시가 정리된다.

```bash
# 어느 단계에서 깨졌는지 확인
node scripts/exhibitions/sync.mjs --source <key> --dry-run --no-images
```

- **HTTP 오류·타임아웃** → 사이트 주소가 바뀐 경우가 많다. 어댑터가 쓰는 목록 주소나 API 를 다시 찾는다.
  목록을 스크립트로 그리는 사이트는 페이지 JS 에서 AJAX 주소를 찾는 편이 빠르다
  (MMCA `AjaxExhibitionList.do`, 리움·호암 `/exhibition/list`, 대림 `api.daelimmuseum.org`).
- **0건 수집** → 페이지는 열리는데 파싱이 안 되는 경우다. 목록 마크업을 보고 어댑터의 정규식을 고친다.
- **포스터 검사 탈락** → 요약의 포스터 절에 사유가 남는다. 버튼이나 로고가 잡혔다면 어댑터가
  주소를 잘못 고른 것이므로 원본 이미지 주소를 찾아 `posterUrl` 로 넘긴다.
- **`UNABLE_TO_VERIFY_LEAF_SIGNATURE`** → 서버가 중간 인증서를 빼고 보낸 경우다 (DDP).
  서버 인증서의 CA Issuers 주소에서 중간 인증서를 받아 `certs/` 에 PEM 으로 넣는다.
  Node 22.19 미만에서는 `NODE_EXTRA_CA_CERTS` 환경변수로 같은 파일을 지정한다.

국립민속박물관은 첫 연결을 끊는 방화벽이 있어 Node 에서는 자주 실패한다 (curl 은 두 번째 시도에 붙는다).
이때도 기존 데이터는 유지되므로 사이트가 비지 않는다.

---

## 구조

```
scripts/exhibitions/
  sync.mjs              메인 오케스트레이터 (수집 → 포스터 검사·업로드 → 병합 → 반영 → 리포트)
  test.mjs              자체 점검 (네트워크 불필요)
  certs/                서버가 빠뜨리는 중간 인증서 (http.mjs 가 신뢰 목록에 더한다)
  lib/
    http.mjs            fetch + 재시도 + EUC-KR 디코딩 + 이미지 다운로드
    parse.mjs           날짜/HTML/구조화데이터 파싱, 장식용 이미지 판별
    extract.mjs         목록 페이지 → 전시 카드 추출, 타 기관 행사 판별
    source-utils.mjs    후보 URL 순차 시도 등 어댑터 공통 도구
    images.mjs          포스터 검사(크기·비율·장식 이미지) → R2 (Worker 경유)
    merge.mjs           기존 데이터와 병합 (보존 규칙)
    patch.mjs           exhibitions.js 부분 수정 (문자 범위 스플라이싱)
  sources/
    index.mjs           레지스트리
    *.mjs               미술관별 어댑터
```

`patch.mjs` 는 파일 전체를 재직렬화하지 않고 바꿀 배열의 문자 범위만 갈아끼운다.
7천 줄짜리 데이터 파일의 주석과 수작업 서식을 보존하고 diff 를 작게 유지하기 위해서다.
문자열·주석을 인식하는 스캐너를 쓰므로 값 안의 괄호나
`// Musée de l'Armée` 같은 주석 속 아포스트로피에 속지 않는다.
