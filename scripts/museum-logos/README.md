# 미술관 로고

작품 상세 모달의 첫 화면(히어로)에 미술관 로고를 띄운다. 공식 로고는 한 가지 색 마스크로 저장하고, 앱이 테마 글자색으로 칠한다. 공식 로고가 없는 미술관은 이름으로 만든 COLLY 텍스트 로고가 나온다.

## 파일 위치

| 위치 | 내용 |
|---|---|
| `public/images/museum-logos/<id>.png` | 앱이 쓰는 마스크(검은 잉크 + 투명도) |
| `src/data/museumLogos.json` | 로고가 있는 미술관 목록과 크기. 여기 없는 미술관은 텍스트 로고 |
| `src/components/MuseumLogo.tsx` | 마스크와 텍스트 로고를 그리는 컴포넌트 |
| `scripts/museum-logos/sources.json` | 미술관별 출처 URL과 원본 종류 |
| `scripts/museum-logos/originals/` | 내려받은 원본 파일(컬러 복원용) |
| `scripts/museum-logos/pipeline/` | 수집·변환·반영 스크립트와 검수 기록(`decisions.json`) |

2026-09-15 기준 300곳 중 278곳이 공식 로고, 22곳이 텍스트 로고다.

## 원칙

- 미술관 자체의 현재 로고만 쓴다. 시·정부·후원사 마크, 개관 기념 변형, 이름이 빠진 상위 기관 마크는 쓰지 않는다.
- 벡터를 우선한다. 작은 래스터는 `publish.mjs`가 매끄럽게 키운 뒤 저장하고, 앱은 마스크 폭의 절반보다 크게 그리지 않는다.
- 자동 점수는 오답이 섞인다. 반영 전에 대조표(`review.mjs`, `gallery.mjs`)로 눈으로 확인한다.

## 미술관을 새로 추가할 때

`pipeline/` 스크립트는 작업 폴더에서 돌린 그대로다. 파일 맨 위의 경로 상수(`S`, `REPO`)를 작업 폴더에 맞게 바꾼 뒤 그 폴더에서 실행한다.

1. 공식 로고 파일(SVG 우선)을 구해 `manual/<id>/`에 넣고 `manual/<id>/source.json`에 출처를 적는다.
2. `node collect-manual.mjs` → `node assemble.mjs --only=<id>` 로 후보 마스크를 만든다.
3. `node review.mjs review/new --ids=<id>` 로 대조표를 만들어 확인한다.
4. `decisions.json`에 `{"s":"pick","file":"<후보 파일>"}` 또는 `{"s":"text"}`를 적는다. 투명 배경 안의 밝은 배지처럼 잉크가 뭉개지면 `"mode":"lum"`, 여러 색 글자가 덩어리로 보이면 `"mode":"bg-white"`를 더한다.
5. `node apply-decisions.mjs` → `node publish.mjs` 로 반영한다. 새 파일은 Vite 개발 서버를 다시 켜야 보인다.
