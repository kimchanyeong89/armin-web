/* COLLY 마크 — 한 바퀴를 통째로 되풀이한다.
   흰 손글씨 COLLY 가 써지고, 글자가 살짝 눌리며 조금(0.9배) 작아져 내려가는 동안 그 위로 흰 33 연꽃이 핀다.
   굵은 붓질이 둘을 한꺼번에 앰버로 칠하고 한동안 머문 뒤, 흰 붓질이 오른쪽에서 왼쪽으로 되짚어 다시 흰색으로 칠한다.
   그다음 연꽃이 되감겨 지워지는 동안 COLLY 가 가운데로 돌아오고, COLLY 까지 지워지면 잠깐 비었다가 다시 처음부터.
   한 바퀴 25초.

   붓획은 중심선 + 굵기 프로파일이다. 같은 중심선을 마스크에 두껍게 긋고
   stroke-dashoffset 을 움직이면 획이 그려지고 지워진다. 윤곽 계산은 모듈을 읽을 때
   한 번뿐이고 움직임은 전부 CSS 키프레임이라, 헤더가 리렌더돼도 애니메이션이
   처음부터 다시 돌지 않고 매 프레임 도는 자바스크립트도 없다. */

import { useId, useLayoutEffect, useRef } from "react";

type Pt = [number, number];
type Stroke = { pts: Pt[]; w: number[]; seed: number; wob: number; mw: number };

const N = 48; // 중심선 표본 수 — 48px 로고에서 한 마디가 1px 아래다
const fx = (n: number) => n.toFixed(2);

/* Catmull-Rom 으로 조절점 사이를 N 등분한다. [x, y, 획 위의 위치 0~1] */
function sample(P: Pt[]): [number, number, number][] {
  const n = P.length, at = (i: number) => P[Math.max(0, Math.min(n - 1, i))];
  const out: [number, number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const u = (i / N) * (n - 1), s = Math.min(n - 2, Math.floor(u)), t = u - s;
    const a = at(s - 1), b = at(s), c = at(s + 1), d = at(s + 2), t2 = t * t, t3 = t2 * t;
    const cr = (k: 0 | 1) =>
      0.5 * (2 * b[k] + (-a[k] + c[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3);
    out.push([cr(0), cr(1), i / N]);
  }
  return out;
}

const wobble = (t: number, s: number, a: number) =>
  a * (Math.sin(t * 7.3 + s * 2.1) * 0.6 + Math.sin(t * 13.7 + s * 5.7) * 0.3 + Math.sin(t * 23.1 + s * 1.3) * 0.1);

const widthAt = (w: number[], t: number) => {
  const x = t * (w.length - 1), i = Math.min(w.length - 2, Math.floor(x)), k = x - i;
  return w[i] * (1 - k) + w[i + 1] * k;
};

/* 중심선 양옆으로 굵기만큼 벌린 닫힌 윤곽. 흔들림은 seed 로만 정해져서 같은 seed 는 늘 같은 그림이다 */
function outline({ pts, w }: Stroke, seed: number, amp: number): string {
  const c = sample(pts), A: Pt[] = [], B: Pt[] = [];
  c.forEach(([x, y, t], i) => {
    const p = c[Math.max(0, i - 1)], q = c[Math.min(c.length - 1, i + 1)];
    let dx = q[0] - p[0], dy = q[1] - p[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const j = wobble(t, seed, amp), ww = widthAt(w, t) * (1 + 0.06 * Math.sin(t * 17 + seed));
    A.push([x - (j + ww) * dy, y + (j + ww) * dx]);
    B.push([x - (j - ww) * dy, y + (j - ww) * dx]);
  });
  const la = A[A.length - 1], lb = B[B.length - 1], fa = A[0], fb = B[0];
  const rE = Math.hypot(la[0] - lb[0], la[1] - lb[1]) / 2, rS = Math.hypot(fa[0] - fb[0], fa[1] - fb[1]) / 2;
  return "M" + A.map((p) => fx(p[0]) + " " + fx(p[1])).join("L")
    + `A${fx(rE)} ${fx(rE)} 0 0 0 ${fx(lb[0])} ${fx(lb[1])}`
    + "L" + B.slice().reverse().map((p) => fx(p[0]) + " " + fx(p[1])).join("L")
    + `A${fx(rS)} ${fx(rS)} 0 0 0 ${fx(fa[0])} ${fx(fa[1])}Z`;
}

/* 마스크에 그을 중심선과 그 길이. 길이는 올림해서 dash 가 획 끝까지 덮게 한다 */
function centerline(pts: Pt[]) {
  const c = sample(pts);
  let len = 0;
  for (let i = 1; i < c.length; i++) len += Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]);
  return { d: "M" + c.map((p) => fx(p[0]) + " " + fx(p[1])).join("L"), len: Math.ceil(len * 10) / 10 };
}

const ell = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });

const EVEN = (m: number) => [m * 0.82, m, m, m * 0.88];
const SWELL = (m: number) => [m * 0.42, m * 0.86, m, m * 0.92, m * 0.55];

/* 33 연꽃 — 다섯 꽃잎이 한 점에서 128° 부채꼴로 벌어지고 아래에 받침선이 있다.
   꽃잎은 밑동(90°)에서 붓을 대고 한 바퀴 돈다.
   mw 는 마스크 굵기다. 우글거림이 가장 크게 흔들 때의 윤곽보다 넓어야 가장자리가 잘리지 않는다. */
const LOTUS: Stroke[] = [
  ...[-64, -32, 0, 32, 64].map((deg, i): Stroke => {
    const R = (deg * Math.PI) / 180, cx = 50 + 15 * Math.sin(R), cy = 56 - 15 * Math.cos(R);
    const pts = ell(cx, cy, 8.5, 17, 90, 450, 40).map(([x, y]): Pt => [
      cx + (x - cx) * Math.cos(R) - (y - cy) * Math.sin(R),
      cy + (x - cx) * Math.sin(R) + (y - cy) * Math.cos(R),
    ]);
    return { pts, w: EVEN(2.4), seed: 19 + i, wob: 0.26, mw: 8 };
  }),
  { pts: [[27, 76], [73, 75]], w: SWELL(3), seed: 25, wob: 0.3, mw: 10 },
];

/* COLLY — 대문자 손글씨. 캡 높이 18(41~59)의 가로 띠를 원의 가운데 줄에 놓았다.
   C·O 는 위에서 붓을 대고 왼쪽으로 돈다. L 은 내리긋고 꺾어 한 획, Y 는 왼팔과 오른팔+기둥 두 획이다.
   L 의 꺾이는 자리는 점을 촘촘히 둬서 곡선 보간이 모서리를 뭉개지 않게 했다. */
const WORD_PATHS: Pt[][] = [
  ell(21.2, 50, 7.2, 9.2, -45, -315, 40),                                                   // C
  ell(38.3, 50, 8.2, 9.4, -80, -445, 44),                                                    // O — 한 바퀴 돌고 살짝 겹친다
  [[50.6, 41], [50.4, 50], [50.3, 56.6], [50.4, 58.5], [51.5, 59], [53.4, 58.95], [58.6, 58.8]], // L
  [[62.2, 41], [62, 50], [61.9, 56.6], [62, 58.5], [63.1, 59], [65, 58.95], [70.2, 58.8]],       // L
  [[73.4, 41], [76.55, 46.1], [79.7, 51.2]],                                                 // Y 왼팔
  [[86, 41], [82.95, 46.1], [79.9, 51], [79.7, 53.2], [79.7, 59]],                            // Y 오른팔 + 기둥
];
const WORD: Stroke[] = WORD_PATHS.map((pts, i) => ({ pts, w: EVEN(2), seed: 41 + i, wob: 0.22, mw: 7 }));

/* 앰버는 지도 화면의 강조색(--ig-atlas-accent)을 따른다. 그 밖에서 쓰면 같은 값으로 떨어진다.
   SVG 표현 속성(fill="…")에서는 var() 가 풀리지 않아 style 로 준다. */
const AMBER = "var(--ig-atlas-accent, #D4A547)";
const WHITE = "#F8F6F0"; // 처음 그려질 때의 흰색 — 앰버로 칠해지기 전

/* 합친 모양 — 위에 연꽃(0.62배), 아래에 COLLY(0.9배). 둘 사이 틈 3, 시각 중심 49.5.
   두 모양의 실제 윤곽 상자(연꽃 63.4×56.9, COLLY 75.4×22.6)에서 계산한 값이다. */
const LOTUS_T = "translate(50 37.81) scale(0.62) translate(-49.98 -50.2)";
const WX = 49.8, WY = 50.15; // COLLY 윤곽 상자의 가운데 — 이 점을 기준으로 누르고 줄인다
const wordT = (sx: number, sy: number, cy: number) =>
  `translate(${WX}px,${cy}px) scale(${sx},${sy}) translate(${-WX}px,${-WY}px)`;
const WORD_REST = wordT(1, 1, WY);            // 제자리
const WORD_PRESSED = wordT(0.96, 0.84, 60.26); // 눌리는 순간 — 가로보다 세로가 더 줄어든다
const WORD_LOCKUP = wordT(0.9, 0.9, 68.65);    // 연꽃 아래 자리 — 크기는 아주 조금만 줄인다

/* 우글거림 — 흔들림 seed 가 다른 같은 그림 세 벌을 0.35초씩 돌린다(초당 세 번 남짓).
   벌마다 마크 전체를 아주 조금 옮기고 기울이고, 잉크 번짐 필터도 따로 쓴다. */
const TAKES = [
  { seed: 0, move: "", f: 0.026, s: 3 },
  { seed: 137, move: "translate(.51 -.39) rotate(.63 50 50)", f: 0.029, s: 7 },
  { seed: 271, move: "translate(-.45 .48) rotate(-.54 50 50)", f: 0.032, s: 11 },
];
const BOIL = 2.6; // 우글거릴 때 흔들림 배율 — 모션 시안과 같은 값
const TAKE_MS = 350;

const STROKES = [...LOTUS, ...WORD];
const NIBS = STROKES.map((s) => centerline(s.pts));
const INK = TAKES.map((t) => STROKES.map((s) => outline(s, s.seed + t.seed, s.wob * BOIL)));

/* 한 바퀴 — 처음부터 끝까지 통째로 되풀이한다.
   흰 COLLY 쓰기 → 누르며 흰 연꽃 피우기 → 붓질로 둘을 한꺼번에 앰버로 칠하기 → 머묾
   → 흰 붓질로 다시 칠하기 → 잠깐 머묾 → 연꽃을 되감는 동안 COLLY 가 가운데로 → COLLY 도 되감겨 지워짐
   → 빈 채로 잠깐 → 다시 처음. */
const WRITE_AT = 300, WRITE = 2800, WRITE_END = WRITE_AT + WRITE;
const PRESS_AT = WRITE_END + 800; // 흰 글씨를 다 쓰면 곧 누르며 연꽃이 핀다
const PRESS = 1100, BLOOM = 2200, FADE = 1800, ERASE = 1600;
const BLOOM_AT = PRESS_AT + 150, BLOOM_END = BLOOM_AT + BLOOM;
const WASH = 3000; // 붓질 한 벌(여섯 획)에 걸리는 시간
/* 붓질 사이에 빈틈이 남을 수 있어서, 마지막 붓질이 끝날 즈음 칠한 면을 마크 전체로 서서히 넓힌다 */
const WASH_AT = BLOOM_END + 150, FILL_AT = WASH_AT + WASH - 150, FILL_END = WASH_AT + WASH + 250; // 연꽃이 다 그려지면 앰버로
const WHITE_WASH_AT = FILL_END + 6100;                                                           // 앰버로 6초 남짓 머문 뒤 흰색으로
const WHITE_FILL_AT = WHITE_WASH_AT + WASH - 150, WHITE_FILL_END = WHITE_WASH_AT + WASH + 250;
const FADE_AT = WHITE_FILL_END + 800; // 흰색으로 잠깐 머문 뒤 연꽃을 되감는다
/* 지우기가 절반 지났을 때 글자가 움직이기 시작해, 다 지워지고 0.6초 뒤 가운데에 닿는다.
   더 빨리 오르면 마지막까지 남는 왼쪽 꽃잎이 C·O 윗선에 붙어 갈고리 같은 모양이 잠깐 생긴다. */
const RISE_AT = FADE_AT + FADE * 0.5, RISE = FADE * 0.5 + 600;
const ERASE_AT = RISE_AT + RISE + 400;    // 가운데로 돌아온 COLLY 를 되감아 지운다
const RESET_AT = ERASE_AT + ERASE + 100;  // 다 지워진 뒤 — 칠과 흰 층을 처음 상태로 몰래 돌려놓는다
const CYCLE = ERASE_AT + ERASE + 800;     // 빈 채로 0.8초 쉬고 다시 처음

/* 색칠 붓질 — 합친 모양(연꽃 x 30~70·y 20~56, 글자 x 16~84·y 58~79)을 비스듬한 붓질 여섯 번이
   왼쪽에서 오른쪽으로 오르내리며 덮는다. 붓질 하나가 꽃잎과 글자를 같이 지나가서 둘이 함께 물든다.
   w 는 붓 굵기로, 이웃 붓질 사이 거리(약 12)보다 굵어야 틈이 덜 남는다. */
const WASH_STROKES: { pts: Pt[]; w: number }[] = [
  { pts: [[13, 85], [17, 70], [22, 55]], w: 19 },   // ↗ 왼쪽 끝 — C
  { pts: [[36, 15], [30.5, 50], [24, 86]], w: 21 }, // ↙ 왼쪽 꽃잎 → C·O
  { pts: [[36, 87], [42.5, 50], [48, 13]], w: 21 }, // ↗ 가운데 왼쪽
  { pts: [[60, 13], [53.5, 50], [48, 87]], w: 22 }, // ↙ 가운데
  { pts: [[60, 87], [66.5, 52], [72, 17]], w: 21 }, // ↗ 오른쪽 꽃잎 → L·Y
  { pts: [[87, 54], [80.5, 70], [74, 86]], w: 19 }, // ↙ 오른쪽 끝 — Y
];
const WASH_NIBS = WASH_STROKES.map((s) => centerline(s.pts));

/* 구간 하나를 획 길이에 비례해 나눈다. 획과 획 사이에는 붓을 떼는 짧은 틈을 둔다 */
function split(ids: number[], start: number, dur: number, lift: number, lens = NIBS.map((n) => n.len)) {
  const total = ids.reduce((a, i) => a + lens[i], 0), avail = dur - lift * (ids.length - 1);
  const out = new Map<number, [number, number]>();
  let t = start;
  for (const i of ids) {
    const d = (lens[i] / total) * avail;
    out.set(i, [t, t + d]);
    t += d + lift;
  }
  return out;
}
const lotusIds = LOTUS.map((_, i) => i), wordIds = WORD.map((_, i) => LOTUS.length + i);
const washIds = WASH_STROKES.map((_, k) => k);
const WRITE_WIN = split(wordIds, WRITE_AT, WRITE, 90);
const BLOOM_WIN = split(lotusIds, BLOOM_AT, BLOOM, 90);
const WASH_WIN = split(washIds, WASH_AT, WASH, 80, WASH_NIBS.map((n) => n.len));
const WHITE_WASH_WIN = split([...washIds].reverse(), WHITE_WASH_AT, WASH, 80, WASH_NIBS.map((n) => n.len)); // 흰 붓질은 오른쪽에서 왼쪽으로
/* 지울 때는 그린 순서의 반대로 — 마지막 획부터 되감긴다 */
const FADE_WIN = split([...lotusIds].reverse(), FADE_AT, FADE, 40);
const ERASE_WIN = split([...wordIds].reverse(), ERASE_AT, ERASE, 40);

/* [시각, 값, 그 시각부터 쓸 이징]. 같은 시각이 두 번 오면 뒤의 것이 이긴다 */
function keyframes(name: string, prop: string, total: number, frames: [number, string | number, string?][]) {
  const at = new Map<string, string>();
  for (const [t, v, ease] of frames)
    at.set(`${((t / total) * 100).toFixed(3)}%`, `${prop}:${v}${ease ? `;animation-timing-function:${ease}` : ""}`);
  return `@keyframes ${name}{${[...at].map(([k, v]) => `${k}{${v}}`).join("")}}`;
}
const EIO = "ease-in-out";

/* 붓질 한 벌 — 여섯 획이 차례로 칠하고, 끝 무렵 빈틈을 채우고, off 시각에 한꺼번에 처음 상태로 돌아간다 */
function washFrames(name: string, win: Map<number, [number, number]>, fillAt: number, fillEnd: number, off: number) {
  return [
    ...washIds.map((k) => {
      const L = WASH_NIBS[k].len, [w0, w1] = win.get(k)!;
      return keyframes(`${name}-${k}`, "stroke-dashoffset", CYCLE, [[0, L], [w0, L, EIO], [w1, 0], [off - 1, 0], [off, L], [CYCLE, L]]);
    }),
    keyframes(`${name}-fill`, "opacity", CYCLE, [[0, 0], [fillAt, 0, "ease-in"], [fillEnd, 1], [off - 1, 1], [off, 0], [CYCLE, 0]]),
  ];
}

/* 획 하나가 한 바퀴 동안 그려졌다(show) 되감겨 지워진다(hide) */
const nibFrames = (L: number, [a0, a1]: [number, number], [b0, b1]: [number, number]): [number, number, string?][] =>
  [[0, L], [a0, L, EIO], [a1, 0], [b0, 0, EIO], [b1, L], [CYCLE, L]];

/* 인라인 SVG 의 <style> 은 문서 전역에 걸리므로 이름을 마크 전용으로 둔다.
   모션을 줄여 달라고 한 사용자에게는 앰버로 칠해진 합친 모양이 멈춰 있다. */
const CSS = [
  ...lotusIds.map((i) => keyframes(`colly-bloom-${i}`, "stroke-dashoffset", CYCLE, nibFrames(NIBS[i].len, BLOOM_WIN.get(i)!, FADE_WIN.get(i)!))),
  ...wordIds.map((i) => keyframes(`colly-write-${i}`, "stroke-dashoffset", CYCLE, nibFrames(NIBS[i].len, WRITE_WIN.get(i)!, ERASE_WIN.get(i)!))),
  /* 앰버 칠은 흰 붓질이 마크를 다 덮은 순간 닫는다 — 흰색 밑에 앰버가 남으면 가장자리에 앰버 테가 비친다.
     흰 칠은 열어 둔 채로 연꽃과 글자가 지워지게 두었다가, 모든 획이 지워진 뒤에 처음 상태로 돌린다. */
  ...washFrames("colly-wash", WASH_WIN, FILL_AT, FILL_END, WHITE_FILL_END + 1),
  ...washFrames("colly-wwash", WHITE_WASH_WIN, WHITE_FILL_AT, WHITE_FILL_END, RESET_AT + 1),
  /* 흰 층은 칠이 마크를 다 덮은 순간 숨긴다. 같은 모양 두 겹이 포개져 있으면 앰버 가장자리에 흰 테가 남는다 */
  keyframes("colly-white-layer", "opacity", CYCLE, [[0, 1], [FILL_END, 1], [FILL_END + 1, 0], [RESET_AT, 0], [RESET_AT + 1, 1], [CYCLE, 1]]),
  keyframes("colly-press", "transform", CYCLE, [
    [0, WORD_REST], [PRESS_AT, WORD_REST, "ease-in"], [PRESS_AT + PRESS * 0.45, WORD_PRESSED, "ease-out"], [PRESS_AT + PRESS, WORD_LOCKUP],
    [RISE_AT, WORD_LOCKUP, EIO], [RISE_AT + RISE, WORD_REST], [CYCLE, WORD_REST],
  ]),
].join("") + `
@keyframes colly-take{0%,33.33%{opacity:1}33.34%,100%{opacity:0}}
@media (prefers-reduced-motion: reduce){
  .colly-nib,.colly-word,.colly-take,.colly-white,.colly-wash-fill{animation:none!important}
  .colly-nib{stroke-dashoffset:0!important}
  .colly-word{transform:${WORD_LOCKUP}!important}
  .colly-take-alt{opacity:0}
  .colly-white{display:none}
  .colly-wash-fill{opacity:1!important}
}`;

const loop = (name: string) => `${name} ${CYCLE}ms linear infinite`;

/* 마스크 안에 긋는 붓 한 번. 중심선을 윤곽보다 두껍게 긋고 dashoffset 으로 드러낸다 */
const nibPath = (nib: { d: string; len: number }, width: number, animation: string, key?: number) => (
  <path
    key={key} className="colly-nib" d={nib.d} fill="none" stroke="#fff" strokeWidth={width}
    strokeLinecap="round" strokeLinejoin="round"
    style={{
      /* 간격을 길이의 두 배로 둔다. 길이 하나만 주면 숨어 있는 동안 획 끝에 둥근 점이 찍힌다 */
      strokeDasharray: `${nib.len} ${nib.len * 2}`,
      strokeDashoffset: nib.len,
      animation,
    }}
  />
);
const nibMask = (id: string, i: number) => (
  <mask key={id} id={id} maskUnits="userSpaceOnUse" x={-14} y={-14} width={128} height={128}>
    {nibPath(NIBS[i], STROKES[i].mw, loop(i < LOTUS.length ? `colly-bloom-${i}` : `colly-write-${i}`))}
  </mask>
);

export function CollyMark({ size = 48 }: { size?: number }) {
  /* 한 화면에 둘 이상 뜨면 마스크 id 가 겹쳐 뒤의 것이 앞의 마스크를 물게 된다 */
  const uid = "cm" + useId().replace(/[^\w-]/g, "");
  const ref = useRef<SVGSVGElement>(null);
  /* 연꽃·글자·붓질·우글거림은 서로 다른 요소에 걸린 CSS 애니메이션이라 같은 순간에 출발해야만 박자가 맞는다.
     일부 요소만 새로 붙으면(핫 리로드, 키 변경) 그 요소만 0초부터 다시 돌아, 연꽃이 제자리 글자 위에 그려진다.
     붙을 때마다 모든 애니메이션의 출발 시각을 하나로 맞춘다. */
  useLayoutEffect(() => {
    const t = document.timeline.currentTime;
    if (t == null || !ref.current) return;
    for (const a of ref.current.getAnimations({ subtree: true })) a.startTime = t;
  }, []);
  /* 붓질 한 벌을 담은 마스크 — 붓모 필터로 가장자리를 거칠게 하고, 끝에 빈틈을 채우는 면을 둔다 */
  const washMask = (id: string, name: string) => (
    <mask id={id} maskUnits="userSpaceOnUse" x={-14} y={-14} width={128} height={128}>
      <g filter={`url(#${uid}-bristle)`}>
        {WASH_NIBS.map((nib, k) => nibPath(nib, WASH_STROKES[k].w, loop(`${name}-${k}`), k))}
      </g>
      <rect
        className="colly-wash-fill" x={-14} y={-14} width={128} height={128} fill="#fff"
        style={{ opacity: 0, animation: loop(`${name}-fill`) }}
      />
    </mask>
  );
  /* 세 층이 같은 모양·같은 획 마스크를 쓴다. 다른 건 색과, 어느 붓질 마스크 뒤에 있느냐뿐이다 */
  const figure = (paths: string[]) => (
    <>
      <g transform={LOTUS_T}>
        {lotusIds.map((i) => <path key={i} d={paths[i]} mask={`url(#${uid}-m${i})`} />)}
      </g>
      <g className="colly-word" style={{ animation: loop("colly-press") }}>
        {wordIds.map((i) => <path key={i} d={paths[i]} mask={`url(#${uid}-m${i})`} />)}
      </g>
    </>
  );
  return (
    <svg ref={ref} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="COLLY" style={{ display: "block" }}>
      <defs>
        {TAKES.map((t, g) => (
          <filter key={g} id={`${uid}-ink${g}`} x="-14%" y="-14%" width="128%" height="128%">
            <feTurbulence type="fractalNoise" baseFrequency={t.f} numOctaves={2} seed={t.s} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={0.7} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        ))}
        {NIBS.map((_, i) => nibMask(`${uid}-m${i}`, i))}
        {/* 붓모 가장자리 — 칠한 면의 경계를 거칠게 흔들어, 칼로 자른 선이 아니라 붓이 끌린 자리처럼 보이게 한다 */}
        <filter id={`${uid}-bristle`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency={0.09} numOctaves={2} seed={9} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={5} xChannelSelector="R" yChannelSelector="G" />
        </filter>
        {washMask(`${uid}-wash`, "colly-wash")}
        {washMask(`${uid}-wwash`, "colly-wwash")}
      </defs>
      <style>{CSS}</style>
      <circle cx={50} cy={50} r={50} fill="#0A0A0A" />
      {INK.map((paths, g) => (
        <g
          key={g} className={g ? "colly-take colly-take-alt" : "colly-take"}
          filter={`url(#${uid}-ink${g})`} transform={TAKES[g].move || undefined}
          style={{ fill: AMBER, animation: `colly-take ${TAKE_MS * TAKES.length}ms linear ${-((TAKES.length - g) % TAKES.length) * TAKE_MS}ms infinite` }}
        >
          {/* 흰 층 — 연꽃과 글자가 처음 그려지는 모습 */}
          <g className="colly-white" style={{ fill: WHITE, animation: loop("colly-white-layer") }}>{figure(paths)}</g>
          {/* 앰버 층 — 앰버 붓질 마스크를 통해서만 보인다 */}
          <g mask={`url(#${uid}-wash)`}>{figure(paths)}</g>
          {/* 다시 흰 층 — 앰버 위를 흰 붓질이 되짚어 칠한다. 이 층이 보이는 채로 연꽃과 글자가 지워진다 */}
          <g className="colly-white" mask={`url(#${uid}-wwash)`} style={{ fill: WHITE }}>{figure(paths)}</g>
        </g>
      ))}
    </svg>
  );
}

/* ── 불러오는 동안의 연꽃 ─────────────────────────────────────────────
   글자 없이 연꽃만, 처음부터 앰버로. 꽃잎이 차례로 그려지고, 다 그려지면 우글거리며
   숨 쉬듯 조금 부풀었다 기울고, 그린 반대 순서로 되감겨 지워진 뒤 다시 그려진다. 한 바퀴 약 5.5초.
   로고와 같은 획·마스크·우글거림을 쓰고, 키프레임 이름만 따로 둔다(로고가 없는 화면에서도 돌도록). */
const L_DRAW_AT = 150, L_DRAW = 1700, L_HOLD = 2300, L_UNDRAW = 1000;
const L_DRAW_END = L_DRAW_AT + L_DRAW, L_UNDRAW_AT = L_DRAW_END + L_HOLD;
const L_CYCLE = L_UNDRAW_AT + L_UNDRAW + 400;
const L_DRAW_WIN = split(lotusIds, L_DRAW_AT, L_DRAW, 60);
const L_UNDRAW_WIN = split([...lotusIds].reverse(), L_UNDRAW_AT, L_UNDRAW, 30);
/* 연꽃 윤곽 상자(63.4×56.9)의 가운데를 칸 가운데에 두고 1.28배 — 우글거림 여유를 남긴다 */
const LOADER_T = "translate(50 50) scale(1.28) translate(-49.98 -50.2)";
const LOADER_CSS = [
  ...lotusIds.map((i) => {
    const L = NIBS[i].len, [a0, a1] = L_DRAW_WIN.get(i)!, [b0, b1] = L_UNDRAW_WIN.get(i)!;
    return keyframes(`colly-lotus-${i}`, "stroke-dashoffset", L_CYCLE, [[0, L], [a0, L, EIO], [a1, 0], [b0, 0, EIO], [b1, L], [L_CYCLE, L]]);
  }),
  keyframes("colly-lotus-breathe", "transform", L_CYCLE, [
    [0, "scale(1) rotate(0deg)"],
    [L_DRAW_END, "scale(1) rotate(0deg)", EIO],
    [L_DRAW_END + L_HOLD * 0.5, "scale(1.06) rotate(-2.5deg)", EIO],
    [L_UNDRAW_AT, "scale(1) rotate(0deg)"],
    [L_CYCLE, "scale(1) rotate(0deg)"],
  ]),
].join("") + `
@keyframes colly-lotus-take{0%,33.33%{opacity:1}33.34%,100%{opacity:0}}
@media (prefers-reduced-motion: reduce){
  .colly-lotus-nib,.colly-lotus-take,.colly-lotus-breathe{animation:none!important}
  .colly-lotus-nib{stroke-dashoffset:0!important}
  .colly-lotus-take-alt{opacity:0}
}`;

/** 불러오는 동안 띄우는 연꽃 — 글자 없이, 앰버로 그려졌다 움직이고 지워지기를 되풀이한다 */
export function CollyLotusLoader({ size = 64 }: { size?: number }) {
  const uid = "cl" + useId().replace(/[^\w-]/g, "");
  const ref = useRef<SVGSVGElement>(null);
  /* 꽃잎마다 따로 걸린 애니메이션이 같은 순간에 출발해야 차례가 맞는다 */
  useLayoutEffect(() => {
    const t = document.timeline.currentTime;
    if (t == null || !ref.current) return;
    for (const a of ref.current.getAnimations({ subtree: true })) a.startTime = t;
  }, []);
  const lloop = (name: string) => `${name} ${L_CYCLE}ms linear infinite`;
  return (
    <svg ref={ref} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false" style={{ display: "block", overflow: "visible" }}>
      <defs>
        {TAKES.map((t, g) => (
          <filter key={g} id={`${uid}-ink${g}`} x="-14%" y="-14%" width="128%" height="128%">
            <feTurbulence type="fractalNoise" baseFrequency={t.f} numOctaves={2} seed={t.s} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={0.7} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        ))}
        {lotusIds.map((i) => (
          <mask key={i} id={`${uid}-m${i}`} maskUnits="userSpaceOnUse" x={-14} y={-14} width={128} height={128}>
            <path
              className="colly-lotus-nib" d={NIBS[i].d} fill="none" stroke="#fff" strokeWidth={STROKES[i].mw}
              strokeLinecap="round" strokeLinejoin="round"
              style={{ strokeDasharray: `${NIBS[i].len} ${NIBS[i].len * 2}`, strokeDashoffset: NIBS[i].len, animation: lloop(`colly-lotus-${i}`) }}
            />
          </mask>
        ))}
      </defs>
      <style>{LOADER_CSS}</style>
      <g className="colly-lotus-breathe" style={{ transformBox: "view-box", transformOrigin: "50px 50px", animation: lloop("colly-lotus-breathe") }}>
        {INK.map((paths, g) => (
          <g
            key={g} className={g ? "colly-lotus-take colly-lotus-take-alt" : "colly-lotus-take"}
            filter={`url(#${uid}-ink${g})`} transform={TAKES[g].move || undefined}
            style={{ fill: AMBER, animation: `colly-lotus-take ${TAKE_MS * TAKES.length}ms linear ${-((TAKES.length - g) % TAKES.length) * TAKE_MS}ms infinite` }}
          >
            <g transform={LOADER_T}>
              {lotusIds.map((i) => <path key={i} d={paths[i]} mask={`url(#${uid}-m${i})`} />)}
            </g>
          </g>
        ))}
      </g>
    </svg>
  );
}
