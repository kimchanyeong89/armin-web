// 콜리 앱 아이콘을 굽는다 — 앰버 바탕 + 먹색 소문자 colly 락업(2026-09-28 결정). 잉크 필터(feTurbulence)까지 그리려고 헤드리스 크롬을 쓴다.
// node brand/render.mjs [출력 경로…]   (apps/mobile 에서, 경로를 주면 그 파일만)
// 락업 비율은 스케네(skene-app/brand/render.mjs)·일록(bibly-app/brand/names/icons.mjs)과 같다: 아이콘 0.62, 적응형 전경 0.46.
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(new URL('../../../package.json', import.meta.url));
const puppeteer = require('puppeteer');

const BRAND = new URL('.', import.meta.url).pathname;
const MOBILE = new URL('..', import.meta.url).pathname;
const lockup = fs.readFileSync(BRAND + 'colly-lockup-ink.svg', 'utf8');
const mark = fs.readFileSync(BRAND + 'colly-mark-ink.svg', 'utf8'); // 연꽃만(글자 없음)
const BG = '#D4A547'; // 적응형 아이콘 바탕은 app.json android.adaptiveIcon.backgroundColor 와 같아야 한다

// [출력 경로, 한 변 px, 배경(null=투명), 상자 비율, 그림(기본 락업)]
const OUT = [
  ['assets/icon.png', 1024, BG, 0.62],
  ['assets/adaptive-icon.png', 1024, null, 0.46], // 적응형 아이콘 안전 영역(가운데 66%) 안
  ['store/play/icon-1024.png', 1024, BG, 0.62],
  ['store/play/icon-512.png', 512, BG, 0.62],
  // 입장 화면(app.json expo-splash-screen: 앰버 바탕, imageWidth 140). 연꽃 높이 = 그림 폭의 0.698
  // → 화면에서 97.7pt, 일록 원래 스플래시 마크와 같은 높이(2026-09-29). 0.824 = 0.698 × 뷰박스 67.2 / 연꽃 높이 56.9
  ['assets/splash-icon.png', 1024, null, 0.824, mark],
];
const only = process.argv.slice(2);

const browser = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage();
for (const [out, size, bg, ratio, svg = lockup] of OUT) {
  if (only.length && !only.includes(out)) continue;
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  const h = Math.round(size * ratio);
  await page.setContent(`<html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${bg || 'transparent'}"><div style="height:${h}px;width:${h}px">${svg}</div></body></html>`);
  await page.screenshot({ path: MOBILE + out, omitBackground: !bg, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(out, size);
}
await browser.close();
