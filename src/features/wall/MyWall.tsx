import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { doc, getDoc, getFirestore, setDoc } from "firebase/firestore";
import { Trash2, X } from "lucide-react";
import { getOptimizedImageUrl } from "../../utils/imageProxy";
import "./myWall.css";

/* A wall to try prints on. Any picture on any page can be picked up and hung
   on it at a real size in centimetres, so the wall shows what bought posters
   would look like. Everything is kept in centimetres - the wall, each print's
   place and width - so a later print order can read the sizes from here.
   Prints snap to the wall's edges and to each other, a hair apart, and grow
   from their corners without changing shape. */

interface Piece {
  id: string;
  src: string;
  title: string;
  /** height / width of the picture itself, so a print keeps its proportions */
  ratio: number;
  /** top-left corner and width, in cm from the wall's top-left */
  x: number;
  y: number;
  w: number;
}

interface Wall {
  w: number;
  h: number;
  color: string;
  pieces: Piece[];
}

type Corner = "nw" | "ne" | "sw" | "se";
type Guides = { x: number[]; y: number[] };

const DEFAULT_WALL: Wall = { w: 300, h: 240, color: "#ece8df", pieces: [] };
const WALL_LIMITS = { min: 100, max: 1000 };
/* print sizes by the long side, as poster shops sell them */
const LONG_SIDES = [40, 50, 70, 100];
const FIRST_LONG_SIDE = 50;
const MIN_WIDTH = 10;
/* the hair between two prints, and between a print and the wall's edge, in cm */
const GAP = 2;
/* how near, on screen, a print has to come to catch an edge */
const SNAP_PX = 10;
const COLORS = [
  { value: "#ece8df", ko: "화이트", en: "White" },
  { value: "#b9b1a4", ko: "웜 그레이", en: "Warm grey" },
  { value: "#8d9784", ko: "세이지", en: "Sage" },
  { value: "#2a2a2a", ko: "차콜", en: "Charcoal" },
];

const heightOf = (p: { w: number; ratio: number }) => p.w * p.ratio;
const widthFor = (ratio: number, longSide: number) => (ratio >= 1 ? longSide / ratio : longSide);
const longSideOf = (p: Piece) => Math.round(p.ratio >= 1 ? heightOf(p) : p.w);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
/* a print never hangs off the wall */
const keepOn = (p: Piece, wall: { w: number; h: number }): Piece => ({
  ...p,
  x: clamp(p.x, 0, wall.w - p.w),
  y: clamp(p.y, 0, wall.h - heightOf(p)),
});

/* Where a print wants to be: its left and top edges are pulled to the nearest
   line within reach - a hair inside the wall's edges, its middle, a hair
   beside another print, or in line with another print's edges or middle.
   The lines it caught are returned so they can be drawn while it moves. */
function snap(p: Piece, others: Piece[], wall: Wall, reach: number): { x: number; y: number; guides: Guides } {
  const w = p.w;
  const h = heightOf(p);
  const xs: Array<[at: number, line: number]> = [[GAP, 0], [wall.w - GAP - w, wall.w], [(wall.w - w) / 2, wall.w / 2]];
  const ys: Array<[at: number, line: number]> = [[GAP, 0], [wall.h - GAP - h, wall.h], [(wall.h - h) / 2, wall.h / 2]];
  for (const o of others) {
    const oh = heightOf(o);
    xs.push([o.x + o.w + GAP, o.x + o.w + GAP / 2], [o.x - w - GAP, o.x - GAP / 2], [o.x, o.x], [o.x + o.w - w, o.x + o.w], [o.x + (o.w - w) / 2, o.x + o.w / 2]);
    ys.push([o.y + oh + GAP, o.y + oh + GAP / 2], [o.y - h - GAP, o.y - GAP / 2], [o.y, o.y], [o.y + oh - h, o.y + oh], [o.y + (oh - h) / 2, o.y + oh / 2]);
  }
  const pick = (value: number, options: Array<[number, number]>) => {
    let best: [number, number] | null = null;
    for (const option of options) {
      const d = Math.abs(option[0] - value);
      if (d <= reach && (!best || d < Math.abs(best[0] - value))) best = option;
    }
    return best;
  };
  const bx = pick(p.x, xs);
  const by = pick(p.y, ys);
  return { x: bx ? bx[0] : p.x, y: by ? by[0] : p.y, guides: { x: bx ? [bx[1]] : [], y: by ? [by[1]] : [] } };
}

/* A print let go on top of another is moved to the nearest free place beside
   it - left, right, above or below, a hair apart - so prints never overlap. */
function settle(p: Piece, others: Piece[], wall: Wall): Piece {
  const overlaps = (a: Piece, b: Piece) =>
    a.x < b.x + b.w + GAP / 2 && a.x + a.w + GAP / 2 > b.x && a.y < b.y + heightOf(b) + GAP / 2 && a.y + heightOf(a) + GAP / 2 > b.y;
  const hit = others.find((o) => overlaps(p, o));
  if (!hit) return p;
  const h = heightOf(p);
  const places = [
    { ...p, x: hit.x + hit.w + GAP },
    { ...p, x: hit.x - p.w - GAP },
    { ...p, y: hit.y + heightOf(hit) + GAP },
    { ...p, y: hit.y - h - GAP },
  ].filter((c) => c.x >= 0 && c.y >= 0 && c.x + c.w <= wall.w && c.y + heightOf(c) <= wall.h && !others.some((o) => overlaps(c, o)));
  if (!places.length) return p;
  places.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  return places[0];
}

/* the picture's own address when it was shown through the image proxy */
function originalImage(src: string): string {
  try {
    const url = new URL(src, window.location.href);
    if (/(^|\.)wsrv\.nl$|weserv\.nl$/.test(url.hostname)) {
      const inner = url.searchParams.get("url") || "";
      return inner ? (/^https?:\/\//.test(inner) ? inner : `https://${inner}`) : src;
    }
    return url.href;
  } catch {
    return src;
  }
}

/* the picture under a point, outside the wall and the tab bar and big enough to be a work */
function pictureAt(x: number, y: number): HTMLImageElement | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el.closest(".wall-drawer, .bpn, .wall-grip")) return null;
    if (el instanceof HTMLImageElement && el.clientWidth >= 40 && el.clientHeight >= 40 && (el.currentSrc || el.src)) return el;
  }
  return null;
}

const coarsePointer = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

export default function MyWall({ uid, ko, compact, onClose }: {
  uid: string;
  ko: boolean;
  /** a short drawer or a phone: no kicker, no saving note */
  compact?: boolean;
  onClose: () => void;
}) {
  const t = (copy: { ko: string; en: string }) => (ko ? copy.ko : copy.en);
  const [wall, setWall] = useState<Wall | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const [scale, setScale] = useState(1); // px per cm
  const [guides, setGuides] = useState<Guides>({ x: [], y: [] });
  const [ghost, setGhost] = useState<{ src: string; x: number; y: number } | null>(null);
  const [dropping, setDropping] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const wallRef = useRef<HTMLDivElement>(null);

  const ref = doc(getFirestore(), `users/${uid}/profile/wall`);

  /* load once; a missing or broken record starts from the default wall */
  useEffect(() => {
    let live = true;
    getDoc(ref)
      .then((snap) => {
        const stored = snap.data()?.wall as Wall | undefined;
        if (live) setWall(stored && Array.isArray(stored.pieces) ? { ...DEFAULT_WALL, ...stored } : DEFAULT_WALL);
      })
      .catch(() => live && setWall(DEFAULT_WALL));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  /* save a moment after the last change */
  const firstLoad = useRef(true);
  useEffect(() => {
    if (!wall) return;
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    setSaved(false);
    const timer = window.setTimeout(() => {
      setDoc(ref, { wall, updatedAt: Date.now() })
        .then(() => setSaved(true))
        .catch((err) => console.error("[MyWall] save failed", err));
    }, 700);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wall]);

  /* the wall is drawn as large as the stage allows, at its own proportions */
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || !wall) return;
    const fit = () => {
      /* inside the stage's padding, with room under the wall for the metre */
      const cs = getComputedStyle(stage);
      const width = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const height = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 22;
      if (width <= 0 || height <= 0) return;
      setScale(Math.min(width / wall.w, height / wall.h));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [wall?.w, wall?.h, wall]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if ((event.key === "Delete" || event.key === "Backspace") && selected && !(event.target instanceof HTMLInputElement)) {
        setWall((w) => w && { ...w, pieces: w.pieces.filter((p) => p.id !== selected) });
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, selected]);

  const toWallCm = (clientX: number, clientY: number) => {
    const box = wallRef.current?.getBoundingClientRect();
    if (!box || clientX < box.left || clientX > box.right || clientY < box.top || clientY > box.bottom) return null;
    return { x: (clientX - box.left) / scale, y: (clientY - box.top) / scale };
  };

  /* a picture from the page: its proportions are read, then it is hung where
     it was let go, caught by the nearest edge */
  const hangFromPage = (src: string, title: string, at: { x: number; y: number }) => {
    const probe = new Image();
    const place = (ratio: number) =>
      setWall((current) => {
        if (!current) return current;
        const w = widthFor(ratio, FIRST_LONG_SIDE);
        const raw = keepOn({ id: `p-${Date.now()}`, src, title, ratio, x: at.x - w / 2, y: at.y - (w * ratio) / 2, w }, current);
        const s = snap(raw, current.pieces, current, SNAP_PX / scale);
        const piece = settle(keepOn({ ...raw, x: s.x, y: s.y }, current), current.pieces, current);
        window.setTimeout(() => setSelected(piece.id), 0);
        return { ...current, pieces: [...current.pieces, piece] };
      });
    probe.onload = () => place(probe.naturalWidth ? probe.naturalHeight / probe.naturalWidth : 1.4);
    probe.onerror = () => place(1.4);
    probe.src = getOptimizedImageUrl(src, 240);
  };

  /* Pick up any picture on the page: with a mouse, press and move; on a
     phone, hold for a moment first so a swipe still scrolls the page. The
     page listeners are set once and reach the wall through `live`. */
  const live = useRef({ toWallCm, hangFromPage });
  live.current = { toWallCm, hangFromPage };
  useEffect(() => {
    type Press = { id: number; x: number; y: number; src: string; title: string; touch: boolean; active: boolean; timer: number };
    let press: Press | null = null;
    let swallowClick = false;
    document.documentElement.classList.add("wall-open");

    const lift = (x: number, y: number) => {
      if (!press) return;
      press.active = true;
      setGhost({ src: press.src, x, y });
      navigator.vibrate?.(8);
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const img = pictureAt(e.clientX, e.clientY);
      if (!img) return;
      const touch = e.pointerType !== "mouse";
      press = {
        id: e.pointerId, x: e.clientX, y: e.clientY, touch, active: false, timer: 0,
        src: originalImage(img.currentSrc || img.src), title: img.alt || img.title || "",
      };
      if (touch) press.timer = window.setTimeout(() => press && lift(press.x, press.y), 320);
    };
    const move = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      if (!press.active) {
        const d = Math.hypot(e.clientX - press.x, e.clientY - press.y);
        if (!press.touch && d > 6) lift(e.clientX, e.clientY);
        else if (press.touch && d > 10) {
          /* a swipe, not a hold: leave it to the page */
          window.clearTimeout(press.timer);
          press = null;
        }
        return;
      }
      setGhost({ src: press.src, x: e.clientX, y: e.clientY });
      setDropping(!!live.current.toWallCm(e.clientX, e.clientY));
    };
    const up = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      window.clearTimeout(press.timer);
      if (press.active) {
        swallowClick = true;
        window.setTimeout(() => { swallowClick = false; }, 50);
        const at = live.current.toWallCm(e.clientX, e.clientY);
        if (at) live.current.hangFromPage(press.src, press.title, at);
      }
      press = null;
      setGhost(null);
      setDropping(false);
    };
    const cancel = () => {
      if (press) window.clearTimeout(press.timer);
      press = null;
      setGhost(null);
      setDropping(false);
    };
    /* a picture that was carried is not also opened */
    const click = (e: MouseEvent) => {
      if (!swallowClick) return;
      e.preventDefault();
      e.stopPropagation();
      swallowClick = false;
    };
    /* while a picture is held the page stays still, and the browser's own
       picture drag and long-press menu stay out of the way */
    const touchMove = (e: TouchEvent) => { if (press?.active) e.preventDefault(); };
    const noNativeDrag = (e: DragEvent) => { if (e.target instanceof HTMLImageElement && !e.target.closest(".wall-drawer")) e.preventDefault(); };
    const noMenu = (e: Event) => { if (press?.touch) e.preventDefault(); };

    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", cancel, true);
    document.addEventListener("click", click, true);
    document.addEventListener("touchmove", touchMove, { capture: true, passive: false });
    document.addEventListener("dragstart", noNativeDrag, true);
    document.addEventListener("contextmenu", noMenu, true);
    return () => {
      document.documentElement.classList.remove("wall-open");
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", cancel, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("touchmove", touchMove, true);
      document.removeEventListener("dragstart", noNativeDrag, true);
      document.removeEventListener("contextmenu", noMenu, true);
      if (press) window.clearTimeout(press.timer);
    };
  }, []);

  /* the pointer's place on the wall in cm, wherever it is */
  const pointerCm = (clientX: number, clientY: number) => {
    const box = wallRef.current!.getBoundingClientRect();
    return { x: (clientX - box.left) / scale, y: (clientY - box.top) / scale };
  };

  /* on the wall: drag a print to move it; it is caught by edges near it */
  const startMove = (event: React.PointerEvent, piece: Piece) => {
    event.stopPropagation();
    setSelected(piece.id);
    const start = { x: event.clientX, y: event.clientY, px: piece.x, py: piece.y };
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      setWall((w) => {
        if (!w) return w;
        const raw = keepOn({ ...piece, x: start.px + (e.clientX - start.x) / scale, y: start.py + (e.clientY - start.y) / scale }, w);
        const s = snap(raw, w.pieces.filter((p) => p.id !== piece.id), w, SNAP_PX / scale);
        setGuides(s.guides);
        return { ...w, pieces: w.pieces.map((p) => (p.id === piece.id ? keepOn({ ...p, x: s.x, y: s.y }, w) : p)) };
      });
    };
    const end = () => {
      setGuides({ x: [], y: [] });
      setWall((w) => {
        if (!w) return w;
        const others = w.pieces.filter((p) => p.id !== piece.id);
        return { ...w, pieces: w.pieces.map((p) => (p.id === piece.id ? settle(p, others, w) : p)) };
      });
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  };

  /* a corner pulled out or in: the opposite corner stays, the shape holds */
  const startResize = (event: React.PointerEvent, piece: Piece, corner: Corner) => {
    event.stopPropagation();
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const left = corner === "nw" || corner === "sw";
    const up = corner === "nw" || corner === "ne";
    const anchor = { x: left ? piece.x + piece.w : piece.x, y: up ? piece.y + heightOf(piece) : piece.y };
    const move = (e: PointerEvent) => {
      setWall((w) => {
        if (!w) return w;
        const at = pointerCm(e.clientX, e.clientY);
        const room = Math.min(left ? anchor.x : w.w - anchor.x, (up ? anchor.y : w.h - anchor.y) / piece.ratio);
        const width = clamp(Math.max(Math.abs(at.x - anchor.x), Math.abs(at.y - anchor.y) / piece.ratio), MIN_WIDTH, room);
        const next = { ...piece, w: width, x: left ? anchor.x - width : anchor.x, y: up ? anchor.y - width * piece.ratio : anchor.y };
        return { ...w, pieces: w.pieces.map((p) => (p.id === piece.id ? next : p)) };
      });
    };
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  };

  const resize = (id: string, longSide: number) =>
    setWall((w) => w && {
      ...w,
      pieces: w.pieces.map((p) => {
        if (p.id !== id) return p;
        const nextW = widthFor(p.ratio, longSide);
        /* grow about the print's centre */
        return keepOn({ ...p, w: nextW, x: p.x + (p.w - nextW) / 2, y: p.y + ((p.w - nextW) * p.ratio) / 2 }, w);
      }),
    });

  const setWallSize = (side: "w" | "h", raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return;
    setWall((w) => {
      if (!w) return w;
      const next = { ...w, [side]: clamp(Math.round(value), WALL_LIMITS.min, WALL_LIMITS.max) };
      return { ...next, pieces: next.pieces.map((p) => keepOn(p, next)) };
    });
  };

  const remove = (id: string) => {
    setWall((w) => w && { ...w, pieces: w.pieces.filter((p) => p.id !== id) });
    setSelected(null);
  };

  const dark = wall ? wall.color === "#2a2a2a" : false;
  const chosen = wall?.pieces.find((p) => p.id === selected) || null;

  return (
    <div className={compact ? "mw is-compact" : "mw"} role="region" aria-label={t({ ko: "내 벽 꾸미기", en: "My wall" })}>
      {/* one line: what this is, the wall's measures and colour, saving, close */}
      <header className="mw-head">
        <p className="mw-kicker">{t({ ko: "MY WALL · 벽 꾸미기", en: "MY WALL" })}</p>
        {wall && (
          <div className="mw-controls">
            <label className="mw-size">
              <span>{t({ ko: "벽 크기", en: "Wall" })}</span>
              <WallNumber value={wall.w} onCommit={(v) => setWallSize("w", v)} label={t({ ko: "가로", en: "Width" })} />
              <i>×</i>
              <WallNumber value={wall.h} onCommit={(v) => setWallSize("h", v)} label={t({ ko: "세로", en: "Height" })} />
              <small>cm</small>
            </label>
            <div className="mw-colors" role="radiogroup" aria-label={t({ ko: "벽 색", en: "Wall colour" })}>
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={wall.color === c.value}
                  title={t(c)}
                  aria-label={t(c)}
                  style={{ background: c.value }}
                  onClick={() => setWall({ ...wall, color: c.value })}
                />
              ))}
            </div>
            <span className="mw-status">{saved ? t({ ko: "저장됨", en: "Saved" }) : t({ ko: "저장 중", en: "Saving" })}</span>
          </div>
        )}
        <button type="button" className="mw-close" onClick={onClose} aria-label={t({ ko: "닫기", en: "Close" })}>
          <X size={20} strokeWidth={1.6} />
        </button>
      </header>

      <div className="mw-stage" ref={stageRef} onPointerDown={() => setSelected(null)}>
        {wall && (
          <div className="mw-room" style={{ width: wall.w * scale }}>
            <div
              className={`mw-wall${dark ? " is-dark" : ""}${dropping ? " is-dropping" : ""}`}
              ref={wallRef}
              style={{ width: wall.w * scale, height: wall.h * scale, background: wall.color }}
            >
              {wall.pieces.length === 0 && (
                <p className="mw-empty">
                  {coarsePointer()
                    ? t({ ko: "화면의 작품을 길게 누른 채 벽으로 끌어오세요.", en: "Hold any work on the screen, then drag it onto the wall." })
                    : t({ ko: "어느 화면의 작품이든 벽으로 끌어오세요.", en: "Drag any work from any page onto the wall." })}
                </p>
              )}
              {wall.pieces.map((p) => (
                <figure
                  key={p.id}
                  className={p.id === selected ? "mw-piece is-on" : "mw-piece"}
                  style={{ left: p.x * scale, top: p.y * scale, width: p.w * scale, height: heightOf(p) * scale }}
                  onPointerDown={(e) => startMove(e, p)}
                >
                  <img src={getOptimizedImageUrl(p.src, 800)} alt={p.title} draggable={false} />
                  {p.id === selected &&
                    (["nw", "ne", "sw", "se"] as Corner[]).map((c) => (
                      <i key={c} className={`mw-corner mw-corner--${c}`} onPointerDown={(e) => startResize(e, p, c)} aria-hidden="true" />
                    ))}
                </figure>
              ))}
              {/* the lines a moving print has caught */}
              {guides.x.map((x) => <span key={`gx${x}`} className="mw-guide mw-guide--x" style={{ left: x * scale }} />)}
              {guides.y.map((y) => <span key={`gy${y}`} className="mw-guide mw-guide--y" style={{ top: y * scale }} />)}
            </div>
            {/* one metre, drawn to the wall's scale */}
            <div className="mw-ruler" style={{ width: 100 * scale }}>
              <span>100cm</span>
            </div>
          </div>
        )}
      </div>

      {chosen && (
        <div className="mw-piecebar" onPointerDown={(e) => e.stopPropagation()}>
          <p className="mw-piecebar__title">{chosen.title || t({ ko: "작품", en: "Work" })}</p>
          <div className="mw-sizes" role="radiogroup" aria-label={t({ ko: "인쇄 크기", en: "Print size" })}>
            {LONG_SIDES.map((side) => (
              <button key={side} type="button" role="radio" aria-checked={longSideOf(chosen) === side} onClick={() => resize(chosen.id, side)}>
                {side}
              </button>
            ))}
          </div>
          <span className="mw-dims">
            {Math.round(chosen.w)} × {Math.round(heightOf(chosen))} cm
          </span>
          <button type="button" className="mw-remove" onClick={() => remove(chosen.id)} aria-label={t({ ko: "벽에서 떼기", en: "Take down" })}>
            <Trash2 size={16} strokeWidth={1.8} />
          </button>
        </div>
      )}

      {ghost && <img className="mw-ghost" src={getOptimizedImageUrl(ghost.src, 240)} alt="" style={{ left: ghost.x, top: ghost.y }} />}
    </div>
  );
}

/* a number typed in full before it is applied, so "3" on the way to "300"
   doesn't shrink the wall */
function WallNumber({ value, onCommit, label }: { value: number; onCommit: (v: string) => void; label: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    onCommit(draft);
    setDraft(String(value));
  };
  return (
    <input
      type="number"
      inputMode="numeric"
      min={WALL_LIMITS.min}
      max={WALL_LIMITS.max}
      value={draft}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}
