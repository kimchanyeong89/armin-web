// 검색어를 쳤을 때 결과가 언제 뜨고, 색인 로딩이 끝난 뒤 목록이 바뀌는지 잰다.
//
// 공유 브라우저 창에서는 다른 세션이 끼어들거나, 창이 가려져 타이머가 느려져서
// 측정이 틀어졌다. 격리된 헤드리스 Chromium 에서 진짜 키 입력으로 잰다.
// "20초 뒤 목록이 바뀐다" 회귀를 잡는 용도다.
//
//   node scripts/measure-search-timing.mjs                      # 기본: 5190, "skiff"
//   node scripts/measure-search-timing.mjs http://localhost:5181/search monet

import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:5190/search';
const query = process.argv[3] || 'skiff';
const WATCH_MS = 40000;
// "작품, 작가 검색..." — 앱의 검색 입력창 placeholder
const INPUT = 'input[placeholder="작품, 작가 검색..."]';

// Playwright 전용 Chromium 이 캐시에 없으면(ms-playwright 가 비어 있던 적이 있다)
// 설치된 Chrome 을 헤드리스로 쓴다. 임시 프로필이라 평소 Chrome 프로필은 건드리지 않는다.
const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console error]', m.text().slice(0, 200));
});

await page.goto(url, { waitUntil: 'domcontentloaded' });
const input = page.locator(INPUT);
await input.waitFor({ timeout: 30000 });
await page.waitForTimeout(1500); // 첫 렌더가 자리 잡을 시간

// DOM 이 바뀔 때마다 결과 제목 목록을 기록한다(타이머 반복이 아니라 변경 감지)
const probe = (q) => {
  const re = new RegExp(q, 'i');
  const countRe = /작품\s*(\d+)/; // "작품 N"
  window.__log = [];
  let last = '';
  const check = () => {
    const text = document.body.innerText;
    const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
    // "작품 N" 제목 아래의 결과 행을 읽는다. 행은 [제목, 작가, (연도), ⓘ] 순서다.
    // 검색어가 든 줄만 세면 작가명 검색("renoir")은 제목에 단어가 없고 작가 줄은 한국어라
    // 결과가 떠도 한 줄도 안 잡혔다. 제목 → 작가를 함께 적어 작가가 바뀌어도 변화로 잡는다.
    const titles = [];
    const head = lines.findIndex((s, i) => s === '작품' && /^\d+$/.test(lines[i + 1] || ''));
    if (head >= 0) {
      const total = Number(lines[head + 1]);
      let cur = [];
      for (const s of lines.slice(head + 2)) {
        if (s === 'ⓘ') {
          if (cur.length) titles.push(`${cur[0]} — ${cur[1] || ''}`);
          cur = [];
          if (titles.length >= Math.min(total, 30)) break;
        } else cur.push(s);
      }
    }
    // 검색어가 들어간 썸네일 주소 — 그림이 바뀌어도(틀린 그림 → 교정본) 변화로 잡는다
    const imgs = [...document.images]
      .map((im) => im.currentSrc || im.src)
      .filter((src) => re.test(src))
      .map((src) => src.replace(/^https?:\/\/[^/]+\//, ''));
    const count = (text.match(countRe) || [])[1] || '';
    const key = count + '|' + titles.join(' / ') + '|' + imgs.join(' ');
    if (key !== last) {
      last = key;
      window.__log.push({ ms: Math.round(performance.now() - window.__t0), count, titles, imgs });
    }
  };
  new MutationObserver(check).observe(document.body, { subtree: true, childList: true, characterData: true });
  window.__t0 = performance.now();
};
for (let attempt = 1; ; attempt++) {
  try {
    await page.evaluate(probe, query);
    break;
  } catch (e) {
    // 설정 파일이 바뀐 뒤 첫 로딩에서 Vite 가 의존성을 다시 묶으며 페이지를 한 번 새로 고친다.
    // 그러면 "Execution context was destroyed" 가 난다 — 입력창을 다시 기다려 재시도한다.
    if (attempt >= 3 || !/context was destroyed|navigation/i.test(String(e && e.message))) throw e;
    await page.waitForLoadState('load').catch(() => {});
    await input.waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
  }
}

await input.pressSequentially(query, { delay: 60 });
await page.waitForTimeout(WATCH_MS);
const log = (await page.evaluate(() => window.__log)).filter((e) => e.titles.length);
await browser.close();

for (const e of log) {
  console.log(`${String(e.ms).padStart(6)}ms  작품 ${e.count || '?'}`);
  for (const t of e.titles) console.log(`          ${t}`);
  if (e.imgs.length) console.log(`          썸네일: ${e.imgs.join(' , ')}`);
}
if (!log.length) {
  console.log('결과 없음');
  process.exit(1);
}

const first = log[0].titles;
const final = log[log.length - 1].titles;
const sameOrder =
  first.filter((t) => final.includes(t)).join(' ') === final.filter((t) => first.includes(t)).join(' ');
const added = final.filter((t) => !first.includes(t));
const dropped = first.filter((t) => !final.includes(t));
console.log(`\n첫 결과 ${log[0].ms}ms · 최종 ${log[log.length - 1].ms}ms · 바뀐 횟수 ${log.length - 1}`);
console.log(
  `공통 항목 순서 ${sameOrder ? '같음' : '다름'} · 나중에 추가 ${added.length}` +
    (added.length ? ` (${added.join(', ')})` : '') +
    ` · 사라짐 ${dropped.length}`,
);
