/**
 * 작성자 자리의 등급 — 확정한 월계관이 프로필 사진을 두른다.
 *
 * 5~10단계는 마크의 월계관을 사진 둘레 원(반지름 36)으로 옮긴 것이다. 잎은 안팎으로
 * 쌍을 이루므로 안쪽 잎이 사진 위로 넘어온다. 관이 되기 전인 1~4단계는 감싸는 모양이
 * 아니라서 마크의 잎과 가지를 생김새 그대로 사진 왼쪽 아래에 기대어 놓는다.
 * 8~10단계 별은 관 위에서 원을 따라 하나·둘·셋 뜬다.
 *
 * 색은 사진에서 찾은 키컬러 두 개다(keyColors.ts). 잎이 첫 색, 테두리와 별이 둘째 색이다. 밝기는 자리마다 고정하고 채도만 좁은 범위로 묶어, 사람마다
 * 색이 달라도 한 목록에서 톤이 어긋나지 않는다.
 */
import type { CSSProperties } from "react";
import ProfileAvatar from "./ProfileAvatar";
import { brush, build, leaf, outline, wreath, type Ink, type Pt } from "./RankIcon";
import { rankLevel } from "../utils/communityRank";
import { useKeyColors } from "../utils/keyColors";
import "./rankAvatar.css";

const R2D = Math.PI / 180;
const RING = 36;          /* 테두리 반지름 — 사진(33.3) 바로 바깥 */
const LEAFK = 1.3;        /* 잎 크기 — 확정 마크의 잎 비율을 테두리에 맞춰 키운 값 */
const PLACE = { s: 0.36, cx: 50, cy: 8 };   /* 1~4단계를 놓는 자리: 테두리 위 가운데에 작게 — 사진(그림)을 가리지 않게 */
const STAR_R = 6.8, STAR_OUT = 9;           /* 별은 테두리에서 9만큼 밖, 원을 따라 돈다 */
/* 두 가지는 바닥 한가운데(90°)에서 갈라져 양옆으로 올라간다 — 서로를 지나지 않아 바닥에서 잎이 엉키지 않는다.
   첫 잎은 바닥에서 11° 위라 아랫부분이 비지 않고, 끝잎이 별 자리까지 올라오지 않게 200°에서 멈춘다.
   단계가 오를수록 잎 쌍이 한 쌍씩 는다 */
const WCFG: Record<number, { th0: number; th1: number; qs: number[] }> = {
  5: { th0: 90, th1: 168, qs: [0.2, 0.62] },
  6: { th0: 90, th1: 200, qs: [0.14, 0.45, 0.76] },
  7: { th0: 90, th1: 200, qs: [0.1, 0.33, 0.56, 0.79] },
};
const WSTARS: Record<number, number[]> = { 8: [270], 9: [257, 283], 10: [245, 270, 295] };

const on = (r: number, deg: number): Pt => [50 + r * Math.cos(deg * R2D), 50 + r * Math.sin(deg * R2D)];

function starInk(x: number, y: number, r: number, core: number, rot: number, S: Ink[]) {
  for (let i = 0; i < 5; i++) {
    const a = (-90 + 72 * i + rot) * R2D, d = [Math.cos(a), Math.sin(a)];
    S.push({ pts: [[x, y], [x + d[0] * r * 0.5, y + d[1] * r * 0.5], [x + d[0] * r, y + d[1] * r]], w: [core, core * 0.62, core * 0.1] });
  }
}

/* 마크 좌표(100×100)를 사진 칸으로 옮긴다 — 획의 점과 굵기에만 배율을 건다 */
const move = (ink: Ink, s: number, cx: number, cy: number): Ink =>
  ({ pts: ink.pts.map(([x, y]) => [cx + s * (x - 50), cy + s * (y - 50)] as Pt), w: ink.w.map((v) => v * s) });

/* 단계·크기마다 한 번만 계산한다 */
const cache = new Map<string, { leaf: string[]; line: string[] }>();
function wrapPaths(level: number, box: number) {
  const key = `${level}:${box}`;
  let hit = cache.get(key);
  if (hit) return hit;
  const p = brush(Math.max(10, box * 0.62));
  const big = box >= 70, gold = level >= 7;
  /* 확정 마크와 같은 규칙: 6단계까지 윤곽, 7단계부터 채움. 작은 자리에서는 윤곽이 뭉개져 채운다 */
  /* 채운 잎은 칸이 40px 이상이면 가운데 잎맥을 비워 결을 남긴다 */
  const mode = gold ? (box >= 40 ? "veined" : "solid") : big ? "outline" : "solid";
  const leafInk: Ink[] = [], lineInk: Ink[] = [];
  const h = p.lh * 0.72;
  lineInk.push({ pts: Array.from({ length: 33 }, (_, i) => on(RING, 90 + (360 * i) / 32)), w: [h, h, h, h] });
  if (level <= 4) {
    build(level, p).forEach((ink) => leafInk.push(move(ink, PLACE.s, PLACE.cx, PLACE.cy)));
  } else {
    const cfg = WCFG[Math.min(level, 7)];
    const k = LEAFK * (gold ? 0.95 : 1);
    wreath({ cx: 50, cy: 50, R: RING, th0: cfg.th0, th1: cfg.th1, qs: cfg.qs, k }).leaves.forEach((lf) => leaf(lf, mode, p, leafInk));
    const core = ((p.big ? 3.3 : Math.max(3.3, 58 / p.size)) * STAR_R) / (p.big ? 10 : 12);
    for (const deg of WSTARS[level] || []) {
      const [x, y] = on(RING + STAR_OUT, deg);
      starInk(x, y, STAR_R, core, deg + 90, lineInk);
    }
  }
  hit = {
    leaf: leafInk.map((ink, i) => outline(ink.pts, ink.w, i * 7 + 3, p.amp)),
    line: lineInk.map((ink, i) => outline(ink.pts, ink.w, i * 7 + 5, p.amp)),
  };
  cache.set(key, hit);
  return hit;
}

const clampC = (c: number) => Math.min(0.11, Math.max(0.045, c));

export function RankAvatar({ rank, src, crop, name = "", size, className }: {
  rank?: string | null;
  src?: string | null;
  crop?: React.ComponentProps<typeof ProfileAvatar>["crop"];
  name?: string;
  size: number;
  className?: string;
}) {
  const keys = useKeyColors(src);
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const photo = (
    <ProfileAvatar
      src={src || undefined}
      crop={crop}
      size={size}
      alt=""
      background="rgba(128,120,104,.35)"
      fallback={<span className="rk-init" style={{ fontSize: Math.round(size * 0.42) }}>{initial}</span>}
    />
  );
  if (!rank) return <span className={className}>{photo}</span>;

  const level = rankLevel(rank);
  const box = Math.round(size * 1.5);
  const { leaf: leafPaths, line: linePaths } = wrapPaths(level, box);
  const k1 = clampC(keys.c1), k2 = clampC(keys.c2);
  const tone = {
    "--rk-h": keys.h1,
    "--rk-k": k1.toFixed(3),
    "--rk-h2": keys.h2,
    "--rk-k2": k2.toFixed(3),
    "--rk-kp": (k1 * 0.8).toFixed(3),
  } as CSSProperties;

  return (
    <span
      className={`rk-av${className ? ` ${className}` : ""}`}
      style={{ ...tone, width: box, height: box }}
      title={rank}
      role="img"
      aria-label={rank}
    >
      {photo}
      <svg width={box} height={box} viewBox="0 0 100 100" fill="currentColor" aria-hidden="true" focusable="false">
        <g className="rk-line" opacity={level < 7 ? 0.62 : 1}>{linePaths.map((d, i) => <path key={i} d={d} />)}</g>
        <g className={`rk-leaf${level < 7 ? " is-pale" : ""}`}>{leafPaths.map((d, i) => <path key={i} d={d} />)}</g>
      </svg>
    </span>
  );
}

export default RankAvatar;
