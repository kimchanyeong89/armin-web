/**
 * 프로필 사진의 키컬러 두 개 — 그림에 가장 넓게 쓰인 색과, 그와 색상이 벌어진 색.
 *
 * 사진을 원으로 잘라 그 안의 픽셀을 OKLab 에서 여섯 무리로 나누고, 넓이와 선명함으로
 * 점수를 매겨 첫 색을 고른다. 둘째 색은 첫 색과 색상이 벌어질수록, 회색이 아닐수록
 * 높은 점수를 준다 — 밝기만 다른 짝은 배지에서 한 색으로 보이기 때문이다.
 *
 * 한 번 구한 값은 주소별로 남겨 화면마다 다시 계산하지 않는다. 다른 도메인 사진이라
 * 캔버스를 읽지 못하면 COLLY 앰버 한 쌍으로 돌아간다.
 */
import { useEffect, useState } from "react";
import { getOptimizedImageUrl } from "./imageProxy";

export type KeyColors = { h1: number; c1: number; h2: number; c2: number };

/** 사진을 읽지 못했을 때의 색 — 지금 앱이 쓰는 앰버(#D4A547) 한 쌍 */
export const AMBER_KEYS: KeyColors = { h1: 85, c1: 0.1, h2: 85, c2: 0.055 };

const N = 32, K = 6, ITER = 12;
const cache = new Map<string, KeyColors>();
const failed = new Set<string>();

function toOklab(r: number, g: number, b: number): [number, number, number] {
  const f = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const R = f(r), G = f(g), B = f(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** 같은 그림에서 늘 같은 색이 나오도록 씨앗을 고정한 k-means */
function cluster(px: [number, number, number][]) {
  const W = [1, 1.7, 1.7];
  const cent: [number, number, number][] = [];
  for (let i = 0; i < K; i++) cent.push(px[Math.floor((i + 0.5) * px.length / K)]);
  const lab = new Array<number>(px.length).fill(0);
  for (let it = 0; it < ITER; it++) {
    for (let i = 0; i < px.length; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < cent.length; c++) {
        let d = 0;
        for (let k = 0; k < 3; k++) { const v = (px[i][k] - cent[c][k]) * W[k]; d += v * v; }
        if (d < bd) { bd = d; best = c; }
      }
      lab[i] = best;
    }
    for (let c = 0; c < cent.length; c++) {
      let n = 0, a = 0, b = 0, l = 0;
      for (let i = 0; i < px.length; i++) if (lab[i] === c) { n++; l += px[i][0]; a += px[i][1]; b += px[i][2]; }
      if (n) cent[c] = [l / n, a / n, b / n];
    }
  }
  return cent.map((c, i) => {
    const n = lab.reduce((t, v) => t + (v === i ? 1 : 0), 0);
    const C = Math.hypot(c[1], c[2]);
    return { lab: c, share: n / px.length, C, h: (Math.atan2(c[2], c[1]) * 180 / Math.PI + 360) % 360 };
  }).filter((c) => c.share >= 0.04);
}

function pick(px: [number, number, number][]): KeyColors | null {
  const cl = cluster(px).map((c) => ({ ...c, score: Math.pow(c.share, 0.7) * (0.3 + Math.min(c.C / 0.09, 1)) }));
  if (!cl.length) return null;
  cl.sort((a, b) => b.score - a.score);
  const k1 = cl[0];
  let k2 = cl[1] || k1, top = -1;
  for (const c of cl.slice(1)) {
    const dE = Math.hypot(c.lab[0] - k1.lab[0], c.lab[1] - k1.lab[1], c.lab[2] - k1.lab[2]);
    if (dE < 0.1) continue;
    const dh = Math.abs(((c.h - k1.h + 180) % 360) - 180);
    const s = c.score * (0.45 + 0.55 * Math.min(dh / 55, 1)) * (0.35 + 0.65 * Math.min(c.C / 0.07, 1));
    if (s > top) { top = s; k2 = c; }
  }
  return { h1: k1.h, c1: k1.C, h2: k2.h, c2: k2.C };
}

function read(img: HTMLImageElement): KeyColors | null {
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (!side) return null;
  const cv = document.createElement("canvas");
  cv.width = cv.height = N;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, N, N);
  let d: Uint8ClampedArray;
  try { d = ctx.getImageData(0, 0, N, N).data; } catch { return null; } /* 다른 도메인 사진은 읽지 못한다 */
  const px: [number, number, number][] = [];
  const r2 = (N / 2) * (N / 2);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x + 0.5 - N / 2, dy = y + 0.5 - N / 2;
    if (dx * dx + dy * dy > r2) continue; /* 사진은 원으로 보인다 */
    const i = (y * N + x) * 4;
    if (d[i + 3] < 200) continue;
    px.push(toOklab(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255));
  }
  return px.length > 50 ? pick(px) : null;
}

/** 캔버스가 읽을 수 있는 주소로 — 다른 도메인 사진은 이미 쓰고 있는 이미지 프록시를 거친다 */
function fetchUrl(src: string): string {
  if (src.startsWith("data:") || src.startsWith("blob:")) return src;
  try {
    if (new URL(src, location.href).origin === location.origin) return src;
  } catch { /* 이상한 주소는 프록시에 맡긴다 */ }
  return getOptimizedImageUrl(src, 96, 80, "webp");
}

export function useKeyColors(src?: string | null): KeyColors {
  const [keys, setKeys] = useState<KeyColors>(() => (src && cache.get(src)) || AMBER_KEYS);
  useEffect(() => {
    if (!src) { setKeys(AMBER_KEYS); return; }
    const hit = cache.get(src);
    if (hit) { setKeys(hit); return; }
    if (failed.has(src)) { setKeys(AMBER_KEYS); return; }
    let alive = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      const k = read(img);
      if (k) cache.set(src, k); else failed.add(src);
      if (alive) setKeys(k || AMBER_KEYS);
    };
    img.onerror = () => { failed.add(src); if (alive) setKeys(AMBER_KEYS); };
    img.src = fetchUrl(src);
    return () => { alive = false; };
  }, [src]);
  return keys;
}
