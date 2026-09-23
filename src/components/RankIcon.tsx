/**
 * Rank marks, one per level: a laurel that grows.
 *
 * A leaf, then a second leaf (1–2), a sprig (3), two sprigs crossing in a V (4)
 * that bend into a U (5) and close into a wreath (6). At 7 the wreath is painted
 * gold and fills out to seven leaves a side; stars are then set inside it — one
 * large (8), two side by side (9), three in a triangle (10). Leaves are outlines
 * up to 6 and filled from 7, so the gold levels read heavier even inside a pill.
 *
 * The strokes are the COLLY logo's brush (CollyMark.tsx carries the same four
 * functions): a Catmull-Rom centre line widened by a width profile. From 24px
 * the line wobbles a little and an ink filter roughens its edge; below that both
 * are dropped and lines are held near 0.9px so a 10–11px mark still reads.
 * Everything is painted in currentColor.
 */
import { useId } from "react";
import { rankLevel } from "../utils/communityRank";

export type Pt = [number, number];
export type Ink = { pts: Pt[]; w: number[] };
export type Leaf = { b: Pt; a: number; L: number; W: number; bend?: number; rib?: boolean };
export type Brush = { size: number; big: boolean; lh: number; solidMin: number; amp: number };
type Wreath = { cx: number; cy: number; R: number; th0?: number; th1?: number; qs?: number[]; k?: number };

const N = 48;
const R2D = Math.PI / 180;
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
export function outline(pts: Pt[], w: number[], seed: number, amp: number): string {
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

/* 24px 이상은 로고처럼 흔들고 선을 비율대로, 그 아래는 흔들림 없이 선을 0.9px 안팎으로 잡고
   칠한 잎은 1.9px 폭 아래로 줄지 않게 한다 — 윤곽 잎과 칠한 잎이 굵기로 갈린다 */
export function brush(size: number): Brush {
  const big = size >= 24;
  return { size, big, lh: big ? Math.max(1.05, 50 / size) : 46 / size, solidMin: big ? 0 : 95 / size, amp: big ? 0.28 : 0 };
}

/* 잎 — b 밑동, a 방향(도), L 길이, W 반폭. 가운데보다 조금 아래가 가장 넓고 끝이 뾰족하다 */
const prof = (u: number) => (u <= 0 || u >= 1 ? 0 : Math.pow(Math.sin(Math.PI * Math.pow(u, 0.9)), 0.8));

/* 잎 중심선에서 off 만큼 옆으로 떨어진 점 */
function leafAt(lf: Leaf, u: number, off: number): Pt {
  const a = lf.a * R2D, d = [Math.cos(a), Math.sin(a)], n = [-Math.sin(a), Math.cos(a)];
  const o = (lf.bend || 0) * lf.L * Math.sin(Math.PI * u) + off;
  return [lf.b[0] + d[0] * u * lf.L + n[0] * o, lf.b[1] + d[1] * u * lf.L + n[1] * o];
}

function leafPoint(lf: Leaf, u: number, side: number): Pt {
  return leafAt(lf, u, side * lf.W * prof(u));
}

export function leaf(lf: Leaf, mode: "outline" | "dash" | "solid" | "veined", p: Brush, S: Ink[]) {
  if (mode === "veined") {
    /* 채운 잎 — 가운데 잎맥을 비워 두 쪽으로 칠해 결이 보이게 한다. 잎맥은 밑동이 넓고 끝으로 갈수록 가늘다 */
    const W = Math.max(lf.W, p.solidMin), us = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
    const vein = (u: number) => W * 0.22 * Math.pow(1 - u, 0.7);
    for (const side of [-1, 1]) {
      S.push({
        pts: us.map((u) => leafAt(lf, u, (side * (vein(u) + W * prof(u))) / 2)),
        w: us.map((u) => Math.max((W * prof(u) - vein(u)) / 2, W * 0.035)),
      });
    }
  } else if (mode === "solid") {
    const W = Math.max(lf.W, p.solidMin), us = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
    S.push({ pts: us.map((u) => leafPoint(lf, u, 0)), w: us.map((u) => Math.max(W * prof(u), W * 0.07)) });
  } else if (mode === "dash") {
    S.push({ pts: [0.08, 0.5, 0.92].map((u) => leafPoint(lf, u, 0)), w: [p.lh * 0.55, p.lh, p.lh * 0.5] });
  } else {
    const us = [0, 0.12, 0.3, 0.5, 0.7, 0.88, 1];
    for (const side of [-1, 1]) S.push({ pts: us.map((u) => leafPoint(lf, u, side)), w: [p.lh * 0.45, p.lh, p.lh, p.lh * 0.85, p.lh * 0.35] });
    if (p.big && lf.rib) S.push({ pts: [-0.12, 0.35, 0.8].map((u) => leafPoint(lf, u, 0)), w: [p.lh * 0.8, p.lh * 0.7, p.lh * 0.3] });
  }
}

/* 관 — 왼쪽 가지는 아래(78°)에서 왼쪽을 돌아 th1 까지, 오른쪽은 거울상. 232° 는 위에 틈만 남은 닫힌 관,
   196° 는 옆 가운데까지 올라온 U자. qs 는 잎 쌍이 붙는 자리이고 끝에 끝잎이 하나 더 붙는다 */
export function wreath({ cx, cy, R, th0 = 78, th1 = 232, qs = [0.34, 0.67], k = 1 }: Wreath) {
  const al = 34 * R2D, c = Math.cos(al), sn = Math.sin(al);
  const stems: Pt[][] = [], leaves: Leaf[] = [];
  const ang = (v: number[]) => Math.atan2(v[1], v[0]) / R2D;
  for (const left of [true, false]) {
    const th = (q: number) => (left ? th0 + (th1 - th0) * q : 180 - (th0 + (th1 - th0) * q)) * R2D;
    const P = (q: number): Pt => [cx + R * Math.cos(th(q)), cy + R * Math.sin(th(q))];
    const T = (q: number) => (left ? [-Math.sin(th(q)), Math.cos(th(q))] : [Math.sin(th(q)), -Math.cos(th(q))]);
    const bend = left ? 0.05 : -0.05;
    stems.push(Array.from({ length: 9 }, (_, i) => P(i / 8)));
    for (const q of qs) {
      const t = T(q), nn = [Math.cos(th(q)), Math.sin(th(q))], b = P(q);
      leaves.push({ b, a: ang([t[0] * c + nn[0] * sn, t[1] * c + nn[1] * sn]), L: 17 * k, W: 3.7 * k, bend });
      leaves.push({ b, a: ang([t[0] * c - nn[0] * sn, t[1] * c - nn[1] * sn]), L: 15.5 * k, W: 3.4 * k, bend: -bend });
    }
    leaves.push({ b: P(1), a: ang(T(1)), L: 15 * k, W: 3.3 * k, bend });
  }
  return { stems, leaves };
}

/* 별 — 가운데서 다섯 갈래로 뻗으며 가늘어지는 붓획 */
function star({ cx, cy }: Wreath, p: Brush, S: Ink[], dx: number, dy: number, s: number) {
  const r = (p.big ? 10 : 12) * s, c0 = (p.big ? 3.3 : Math.max(3.3, 58 / p.size)) * s, x = cx + dx, y = cy + dy;
  for (let i = 0; i < 5; i++) {
    const a = (-90 + 72 * i) * R2D, d = [Math.cos(a), Math.sin(a)];
    S.push({ pts: [[x, y], [x + d[0] * r * 0.5, y + d[1] * r * 0.5], [x + d[0] * r, y + d[1] * r]], w: [c0, c0 * 0.62, c0 * 0.1] });
  }
}

/* 단계마다 그림 전체가 원판 가운데 오도록 관의 중심을 맞췄다. 8~10단계는 7단계 관을 그대로 쓴다 */
const Q7 = [0.31, 0.54, 0.77];
const WREATHS: Record<number, Wreath> = {
  5: { cx: 50, cy: 47.4, R: 27, th1: 196, qs: [0.5] },
  6: { cx: 50, cy: 51.75, R: 27 },
  7: { cx: 50, cy: 51, R: 27.5, qs: Q7, k: 0.95 },
};
/* 별 자리 — [dx, dy, 크기]. 관 안쪽 잎 끝이 중심에서 약 22.8 떨어져 있어 꼭짓점이 그 안쪽 2 이상에 들게 골랐다.
   10단계는 위에 하나, 아래에 둘인 삼각형 */
const STARS: Record<number, [number, number, number][]> = {
  8: [[0, 1.5, 1.8]],
  9: [[-11, 1, 1], [11, 1, 1]],
  10: [[0, -6.35, 0.78], [-9.4, 7.85, 0.78], [9.4, 7.85, 0.78]],
};

export function build(level: number, p: Brush): Ink[] {
  const S: Ink[] = [];
  const stem = (pts: Pt[], h: number) => S.push({ pts, w: [h * 0.7, h, h, h * 0.8] });
  if (level === 1) {
    const lf: Leaf = { b: [37.8, 66.1], a: -52, L: 46, W: 8.6, bend: 0.06, rib: true };
    const d = [Math.cos(-52 * R2D), Math.sin(-52 * R2D)];
    stem([[lf.b[0] - d[0] * 7.5, lf.b[1] - d[1] * 7.5 + 0.6], lf.b], p.big ? p.lh * 0.9 : p.lh);
    leaf(lf, "outline", p, S);
  } else if (level === 2) {
    /* 두 잎 사이를 62°로 벌린다 — 좁으면 10px에서 잎 한 장과 같은 덩어리가 된다 */
    const b: Pt = [38.5, 66.5];
    stem([[b[0] - 5.2, b[1] + 6.2], b], p.big ? p.lh * 0.9 : p.lh);
    leaf({ b, a: -70, L: 40, W: 7.6, bend: 0.06, rib: true }, "outline", p, S);
    leaf({ b, a: -8, L: 31, W: 6, bend: -0.06, rib: true }, "outline", p, S);
  } else if (level === 3) {
    stem([[30.5, 85], [40.5, 63], [54.5, 39]], p.big ? p.lh * 0.95 : p.lh);
    const sprig: Leaf[] = [
      { b: [54.5, 39], a: -58, L: 26, W: 5, bend: 0.05, rib: true },
      { b: [37.5, 69.6], a: -106, L: 23, W: 4.6, bend: -0.05, rib: true },
      { b: [45.5, 54.6], a: -12, L: 23, W: 4.6, bend: 0.05, rib: true },
    ];
    sprig.forEach((lf) => leaf(lf, "outline", p, S));
  } else if (level === 4) {
    /* 3단계 가지가 거울상으로 하나 더 나고, 밑동에서 엇갈려 V자로 벌어진다 */
    for (const sx of [-1, 1]) {
      const X = (x: number) => (sx < 0 ? x : 100 - x), A = (a: number) => (sx < 0 ? a : 180 - a), bd = (v: number) => (sx < 0 ? v : -v);
      stem([[X(53), 84], [X(44), 59], [X(31), 35]], p.big ? p.lh * 0.95 : p.lh);
      const sprig: Leaf[] = [
        { b: [X(31), 35], a: A(-118), L: 22, W: 4.4, bend: bd(0.05), rib: true },
        { b: [X(45.8), 64], a: A(-148), L: 21, W: 4.2, bend: bd(-0.05), rib: true },
        { b: [X(38.8), 49.4], a: A(-78), L: 21, W: 4.2, bend: bd(0.05), rib: true },
      ];
      sprig.forEach((lf) => leaf(lf, "outline", p, S));
    }
  } else {
    const cfg = WREATHS[Math.min(level, 7)];
    const { stems, leaves } = wreath(cfg);
    stems.forEach((pts) => stem(pts, p.lh * 0.85));
    leaves.forEach((lf) => leaf(lf, level >= 7 ? "solid" : p.big ? "outline" : "dash", p, S));
    for (const [dx, dy, s] of STARS[level] || []) star(cfg, p, S, dx, dy, s);
  }
  return S;
}

/* 윤곽 계산은 단계·크기마다 한 번뿐이다 — 한 화면에 같은 마크가 여럿 떠도 다시 계산하지 않는다 */
const cache = new Map<string, string[]>();
function markPaths(level: number, size: number): string[] {
  const key = `${level}:${size}`;
  let d = cache.get(key);
  if (!d) {
    const p = brush(size);
    d = build(level, p).map((ink, i) => outline(ink.pts, ink.w, i * 7 + 3, p.amp));
    cache.set(key, d);
  }
  return d;
}

export function RankIcon({ level, size = 11 }: { level: number; size?: number }) {
  /* 한 화면에 큰 마크가 여럿 뜨면 번짐 필터 id 가 겹쳐 뒤의 것이 앞의 필터를 문다 */
  const uid = "rk" + useId().replace(/[^\w-]/g, "");
  const lv = Math.min(10, Math.max(1, Math.round(level) || 1));
  const big = size >= 24;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      style={{ flex: "none", overflow: "visible" }}
    >
      {big && (
        <defs>
          <filter id={`${uid}-ink`} filterUnits="userSpaceOnUse" x="-12" y="-12" width="124" height="124">
            <feTurbulence type="fractalNoise" baseFrequency={0.026} numOctaves={2} seed={3} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={0.9} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      )}
      <g filter={big ? `url(#${uid}-ink)` : undefined}>
        {markPaths(lv, size).map((d, i) => <path key={i} d={d} />)}
      </g>
    </svg>
  );
}

/** A writer's level beside their name: the laurel mark alone, large enough to read; the level's name is its tooltip. */
export function RankBadge({ rank, size = 18, className }: { rank?: string | null; size?: number; className?: string }) {
  if (!rank) return null;
  return (
    <span className={className} title={rank} role="img" aria-label={rank}>
      <RankIcon level={rankLevel(rank)} size={size} />
    </span>
  );
}

export default RankIcon;
