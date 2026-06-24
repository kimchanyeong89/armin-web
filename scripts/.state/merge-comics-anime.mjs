// One-shot: merge the separate 만화 + 애니메이션 genre sections into ONE 만화·애니메이션 section.
// Header-string splice only (no content regex) → safe. Idempotent: skips if already merged.
import fs from 'node:fs';
const DOC = 'GENRE_TOP10_LIST.md';
const lines = fs.readFileSync(DOC, 'utf8').split('\n');
if (lines.some((l) => l.startsWith('## 💬 만화·애니메이션'))) { console.log('already merged'); process.exit(0); }
const start = lines.findIndex((l) => l.startsWith('## 💬 만화'));
const end = lines.findIndex((l) => l.startsWith('## 🌐 동시대미술'));
if (start < 0 || end < 0 || end <= start) { console.error('anchors not found', start, end); process.exit(1); }
const merged = [
  '## 💬 만화·애니메이션 (Comics · Animation) — 보유 2/10 ⚠️ 구조적 천장',
  '',
  '원화(planches originales)·만화 原画·카툰 드로잉·셀화/배경화/설정화 등 종이·셀 위 평면 작품. **만화·애니 모두 원화 대부분이 작가/스튜디오 저작권으로 묶이고, 공공 애니·만화 박물관조차 객체별 온라인 이미지 카탈로그를 공개하는 곳이 극소수** — 横手(増田만화관)·新潟 등 공공관 wp-json에도 컬렉션 포스트타입 없음(원화는 물리보유하나 미공개). 현재 CIBDI 앙굴렘만 실제 객체 카탈로그 보유.',
  '',
  '| # | 미술관 | 도시 | 국가 | 대륙 | ARMIN |',
  '|---|---|---|---|---|---|',
  '| 1 | Cité de la BD (CIBDI 앙굴렘) | Angoulême | France | 유럽 | ✅ 보유 2,071점 |',
  '| 2 | 한국만화박물관 | Bucheon | South Korea | 아시아 | ✅ 보유 23점 |',
  '| 3 | 京都国際マンガミュージアム (교토 국제만화) | Kyoto | Japan | 아시아 | ❌ 수집불가 (자체 인프라 이미지 카탈로그 없음) |',
  '| 4 | Belgian Comic Strip Center (벨기에 만화센터) | Brussels | Belgium | 유럽 | ❌ 수집불가 (객체 카탈로그 없음) |',
  '| 5 | 三鷹の森ジブリ美術館 (지브리) | Mitaka | Japan | 아시아 | ❌ 수집불가 (카탈로그 없음·스튜디오 저작권) |',
  '| 6 | 手塚治虫記念館 (데즈카 오사무) | Takarazuka | Japan | 아시아 | ❌ 수집불가 (403 차단) |',
  '| 7 | Billy Ireland Cartoon Library (OSU) | Columbus | USA | 북미 | ❌ 수집불가 (저작권 스코프) |',
  '| 8 | Musée Hergé (에르제) | Louvain-la-Neuve | Belgium | 유럽 | ❌ 수집불가 (저작권 잠금) |',
  '| 9 | CITIA / 안시 애니메이션 (Annecy) | Annecy | France | 유럽 | ⚪ 시도중 |',
  '| 10 | Cartoon Art Museum | San Francisco | USA | 북미 | ❌ 수집불가 (객체 카탈로그 없음) |',
  '',
];
const out = [...lines.slice(0, start), ...merged, ...lines.slice(end)];
fs.writeFileSync(DOC, out.join('\n'));
console.log(`merged 만화+애니메이션: lines ${start}–${end} → ${merged.length} lines`);
