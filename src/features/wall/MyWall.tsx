import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { doc, getDoc, getFirestore, setDoc } from "firebase/firestore";
import { Trash2, X } from "lucide-react";
import { getOptimizedImageUrl } from "../../utils/imageProxy";
import "./myWall.css";

/* A wall to try prints on. Any picture on any page can be picked up and hung
   on it at a real size in centimetres, so the wall shows what bought posters
   would look like. Everything is kept in centimetres - the wall, each print's
   place and width - so a later print order can read the sizes from here.
   Prints snap to the wall's edges and to each other (the snap can be turned
   off), grow from their corners without changing shape, and can be cropped on
   the wall - a frame or margin trimmed away - without touching the picture. */

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
  /** what is trimmed off each side, as a share of the whole picture; only on this wall */
  crop?: Crop;
  /** height / width of the whole picture, once it has been cropped */
  imgRatio?: number;
}

interface Crop { l: number; t: number; r: number; b: number }

interface Wall {
  w: number;
  h: number;
  color: string;
  pieces: Piece[];
  /** prints are caught by edges and never overlap (the default); off, they go where they are let go */
  snap?: boolean;
  /** the member set the wall's size; until then it takes the drawer's shape */
  sized?: boolean;
}

type Corner = "nw" | "ne" | "sw" | "se";
/* the sides of the wall or of a crop being pulled: n(orth), s, e, w and the corners */
type Sides = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type Guides = { x: number[]; y: number[] };

/* a first wall has the proportions of the screen it is made on - tall on a
   phone, the window's shape on a computer - at a room's height of 240cm */
const CREAM = "#f1e8d4";
const defaultWall = (): Wall => ({
  w: Math.min(1000, Math.max(100, Math.round((240 * window.innerWidth) / Math.max(1, window.innerHeight) / 10) * 10)),
  h: 240,
  color: CREAM,
  pieces: [],
});
const WALL_LIMITS = { min: 100, max: 1000 };
/* print sizes by the long side, as poster shops sell them */
const LONG_SIDES = [40, 50, 70, 100];
/* a newly hung print's long side: a good share of the wall so it reads at
   once - two fifths of the wall's shorter side on a computer, a little less
   on a phone - within 40 and 150cm */
const firstLongSide = (wall: { w: number; h: number }, phone: boolean) =>
  clamp(Math.round(Math.min(wall.w, wall.h) * (phone ? 0.3 : 0.4)), 40, 150);
const MIN_WIDTH = 10;
/* the least of a picture a crop keeps, on either axis */
const MIN_KEEP = 0.1;
const snapOn = (wall: { snap?: boolean }) => wall.snap !== false;
/* how near a print has to come to catch an edge: 10px on screen, but never
   more than 3cm - on a small drawing 10px is a long way, and every line
   within it would hold the print still */
const SNAP_PX = 10;
const SNAP_MAX_CM = 3;
const reachFor = (scale: number) => Math.min(SNAP_PX / scale, SNAP_MAX_CM);
const COLORS = [
  { value: CREAM, ko: "미색", en: "Cream" },
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
  const xs: Array<[at: number, line: number]> = [[0, 0], [wall.w - w, wall.w], [(wall.w - w) / 2, wall.w / 2]];
  const ys: Array<[at: number, line: number]> = [[0, 0], [wall.h - h, wall.h], [(wall.h - h) / 2, wall.h / 2]];
  for (const o of others) {
    const oh = heightOf(o);
    xs.push([o.x + o.w, o.x + o.w], [o.x - w, o.x], [o.x, o.x], [o.x + o.w - w, o.x + o.w], [o.x + (o.w - w) / 2, o.x + o.w / 2]);
    ys.push([o.y + oh, o.y + oh], [o.y - h, o.y], [o.y, o.y], [o.y + oh - h, o.y + oh], [o.y + (oh - h) / 2, o.y + oh / 2]);
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
   it - left, right, above or below, edge to edge - so prints never overlap. */
function settle(p: Piece, others: Piece[], wall: Wall): Piece {
  /* prints that only touch do not overlap; a hundredth of a cm allows for rounding */
  const e = -0.01;
  const overlaps = (a: Piece, b: Piece) =>
    a.x < b.x + b.w + e && a.x + a.w + e > b.x && a.y < b.y + heightOf(b) + e && a.y + heightOf(a) + e > b.y;
  const hit = others.find((o) => overlaps(p, o));
  if (!hit) return p;
  const h = heightOf(p);
  const places = [
    { ...p, x: hit.x + hit.w },
    { ...p, x: hit.x - p.w },
    { ...p, y: hit.y + heightOf(hit) },
    { ...p, y: hit.y - h },
  ].filter((c) => c.x >= 0 && c.y >= 0 && c.x + c.w <= wall.w && c.y + heightOf(c) <= wall.h && !others.some((o) => overlaps(c, o)));
  if (!places.length) return p;
  places.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  return places[0];
}

/* The whole picture behind a print: its size and top-left in cm. A crop
   keeps the whole picture where it is and shows only part of it. */
const NO_CROP: Crop = { l: 0, t: 0, r: 0, b: 0 };
function wholeOf(p: Piece) {
  const c = p.crop || NO_CROP;
  const ratio = p.imgRatio ?? p.ratio;
  const w = p.w / (1 - c.l - c.r);
  return { c, ratio, w, h: w * ratio, x: p.x - c.l * w, y: p.y - c.t * w * ratio };
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

/* the picture under a point, outside the wall and the tab bar and big enough
   to be a work. A card often lays a label or shade over its picture, or turns
   the picture's pointer off, so the picture itself is not always under the
   pointer: the elements there are searched for a picture that covers the point. */
function pictureAt(x: number, y: number): HTMLImageElement | null {
  const covers = (img: HTMLImageElement) => {
    const r = img.getBoundingClientRect();
    return r.width >= 40 && r.height >= 40 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && !!(img.currentSrc || img.src);
  };
  for (const el of document.elementsFromPoint(x, y).slice(0, 6)) {
    if (el.closest(".wall-drawer, .bpn, .wall-grip")) return null;
    if (el instanceof HTMLImageElement) { if (covers(el)) return el; continue; }
    const inner = Array.from(el.querySelectorAll("img")).find(covers);
    if (inner) return inner;
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
  /* the print being cropped (a double-click on it), if any */
  const [cropping, setCropping] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const [scale, setScale] = useState(1); // px per cm
  const [guides, setGuides] = useState<Guides>({ x: [], y: [] });
  /* the picture carried from the page is moved directly, not by redrawing the wall */
  const ghostRef = useRef<HTMLImageElement>(null);
  const [dropping, setDropping] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  /* while the wall's own edge is pulled, the drawing keeps its scale so the edge stays under the finger */
  const sizing = useRef(false);
  const autoFitted = useRef(false);
  const fitTimer = useRef<number | undefined>(undefined);
  const [sizingLabel, setSizingLabel] = useState<string | null>(null);
  const wallRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<HTMLDivElement>(null);
  /* while a wall edge is pulled the wall grows on both sides about its middle;
     the stage does not always keep it centred (a wall taller than the stage
     grows downward), so its middle is held where it was, on screen, by hand */
  const sizeAnchor = useRef<{ cx: number; cy: number } | null>(null);
  useLayoutEffect(() => {
    const room = roomRef.current, el = wallRef.current;
    if (!room || !el) return;
    room.style.transform = "";
    const a = sizeAnchor.current;
    if (!a) return;
    const b = el.getBoundingClientRect();
    room.style.transform = `translate(${a.cx - (b.left + b.width / 2)}px, ${a.cy - (b.top + b.height / 2)}px)`;
  });

  const ref = doc(getFirestore(), `users/${uid}/profile/wall`);

  /* load once; a missing or broken record starts from the default wall */
  useEffect(() => {
    let live = true;
    getDoc(ref)
      .then((snap) => {
        const stored = snap.data()?.wall as Wall | undefined;
        if (live) setWall(stored && Array.isArray(stored.pieces) ? { ...defaultWall(), ...stored } : defaultWall());
      })
      .catch(() => live && setWall(defaultWall()));
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
      if (sizing.current) return;
      /* inside the stage's padding, with room under the wall for the metre */
      const cs = getComputedStyle(stage);
      const width = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const height = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 22;
      if (width <= 0 || height <= 0) return;
      /* a wall nobody has sized yet takes the drawer's own shape, so it fills
         it side to side; its height stays a room's. Once per opening (or per
         "fit to screen") - refitting whenever the stage changed would reshape
         the wall under the member's hands, e.g. when the size bar appears */
      if (!wall.sized && !autoFitted.current) {
        /* while the drawer is still being pulled the stage keeps changing: fit
           once it has held its size for a moment */
        window.clearTimeout(fitTimer.current);
        fitTimer.current = window.setTimeout(() => {
          autoFitted.current = true;
          const fitted = clamp(Math.round((wall.h * width) / height / 10) * 10, WALL_LIMITS.min, WALL_LIMITS.max);
          if (Math.abs(fitted - wall.w) < 10) return;
          setWall((w) => {
            if (!w || w.sized) return w;
            const next = { ...w, w: fitted };
            return { ...next, pieces: next.pieces.map((p) => keepOn(p, next)) };
          });
        }, 350);
      }
      setScale(Math.min(width / wall.w, height / wall.h));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [wall?.w, wall?.h, wall]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (cropping && (event.key === "Escape" || event.key === "Enter")) {
        setCropping(null);
        return;
      }
      if (event.key === "Escape") onClose();
      if ((event.key === "Delete" || event.key === "Backspace") && selected && !(event.target instanceof HTMLInputElement)) {
        setWall((w) => w && { ...w, pieces: w.pieces.filter((p) => p.id !== selected) });
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, selected, cropping]);

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
        const w = widthFor(ratio, firstLongSide(current, coarsePointer()));
        const raw = keepOn({ id: `p-${Date.now()}`, src, title, ratio, x: at.x - w / 2, y: at.y - (w * ratio) / 2, w }, current);
        let piece = raw;
        if (snapOn(current)) {
          const s = snap(raw, current.pieces, current, reachFor(scale));
          piece = settle(keepOn({ ...raw, x: s.x, y: s.y }, current), current.pieces, current);
        }
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

    const showGhost = (src: string | null, x = 0, y = 0) => {
      const g = ghostRef.current;
      if (!g) return;
      if (!src) { g.style.display = "none"; g.removeAttribute("src"); return; }
      if (!g.getAttribute("src")) g.src = getOptimizedImageUrl(src, 240);
      g.style.display = "block";
      g.style.left = `${x}px`;
      g.style.top = `${y}px`;
    };
    let over = false;
    const setOver = (next: boolean) => { if (next !== over) { over = next; setDropping(next); } };
    const lift = (x: number, y: number) => {
      if (!press) return;
      press.active = true;
      showGhost(press.src, x, y);
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
      showGhost(press.src, e.clientX, e.clientY);
      setOver(!!live.current.toWallCm(e.clientX, e.clientY));
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
      showGhost(null);
      setOver(false);
    };
    const cancel = () => {
      if (press) window.clearTimeout(press.timer);
      press = null;
      showGhost(null);
      setOver(false);
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
    /* the browser's own drag of a picture - or of the link round it - would take the pointer away */
    const noNativeDrag = (e: DragEvent) => {
      if (press || (e.target instanceof HTMLImageElement && !e.target.closest(".wall-drawer"))) e.preventDefault();
    };
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
        const s = snapOn(w) ? snap(raw, w.pieces.filter((p) => p.id !== piece.id), w, reachFor(scale)) : { ...raw, guides: { x: [], y: [] } };
        setGuides(s.guides);
        return { ...w, pieces: w.pieces.map((p) => (p.id === piece.id ? keepOn({ ...p, x: s.x, y: s.y }, w) : p)) };
      });
    };
    const end = () => {
      setGuides({ x: [], y: [] });
      setWall((w) => {
        if (!w || !snapOn(w)) return w;
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
        let width = clamp(Math.max(Math.abs(at.x - anchor.x), Math.abs(at.y - anchor.y) / piece.ratio), MIN_WIDTH, room);
        /* the growing edges are caught by the wall's edges and other prints' edges */
        const others = w.pieces.filter((p) => p.id !== piece.id);
        const reach = snapOn(w) ? reachFor(scale) : -1;
        const xs = [0, w.w, ...others.flatMap((o) => [o.x, o.x + o.w])];
        const ys = [0, w.h, ...others.flatMap((o) => [o.y, o.y + heightOf(o)])];
        const edgeX = left ? anchor.x - width : anchor.x + width;
        const edgeY = up ? anchor.y - width * piece.ratio : anchor.y + width * piece.ratio;
        let best: { w: number; d: number; gx?: number; gy?: number } | null = null;
        for (const X of xs) {
          const d = Math.abs(X - edgeX);
          const cw = left ? anchor.x - X : X - anchor.x;
          if (d <= reach && cw >= MIN_WIDTH && cw <= room && (!best || d < best.d)) best = { w: cw, d, gx: X };
        }
        for (const Y of ys) {
          const d = Math.abs(Y - edgeY);
          const cw = (up ? anchor.y - Y : Y - anchor.y) / piece.ratio;
          if (d <= reach && cw >= MIN_WIDTH && cw <= room && (!best || d < best.d)) best = { w: cw, d, gy: Y };
        }
        if (best) width = best.w;
        setGuides({ x: best?.gx !== undefined ? [best.gx] : [], y: best?.gy !== undefined ? [best.gy] : [] });
        const next = { ...piece, w: width, x: left ? anchor.x - width : anchor.x, y: up ? anchor.y - width * piece.ratio : anchor.y };
        return { ...w, pieces: w.pieces.map((p) => (p.id === piece.id ? next : p)) };
      });
    };
    const end = () => {
      setGuides({ x: [], y: [] });
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  };

  /* Any edge or corner of the wall pulled: the wall grows or shrinks on both
     opposite sides at once - pulling the top moves the foot too, pulling the
     left moves the right - so it stays centred under the pointer. A print
     against an edge rides with that edge; the others keep their place about
     the middle. */
  const startWallResize = (event: React.PointerEvent, sides: Sides) => {
    event.stopPropagation();
    event.preventDefault();
    if (!wall) return;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    sizing.current = true;
    const box = wallRef.current?.getBoundingClientRect();
    if (box) sizeAnchor.current = { cx: box.left + box.width / 2, cy: box.top + box.height / 2 };
    const start = { x: event.clientX, y: event.clientY, w: wall.w, h: wall.h, s: scale, pieces: wall.pieces };
    const across = sides.includes("e") ? 1 : sides.includes("w") ? -1 : 0;
    const down = sides.includes("s") ? 1 : sides.includes("n") ? -1 : 0;
    const TOUCH = 0.5; // cm: a print this near an edge is against it
    /* where a print goes on one axis when the wall's length there changes from `from` to `to` */
    const follow = (at: number, size: number, from: number, to: number) =>
      at <= TOUCH ? 0 : at + size >= from - TOUCH ? to - size : at + (to - from) / 2;
    const move = (e: PointerEvent) => {
      const dx = ((e.clientX - start.x) / start.s) * across, dy = ((e.clientY - start.y) / start.s) * down;
      /* each side moves as far as the pointer did, so the length changes by twice that */
      const nw = across ? clamp(Math.round((start.w + 2 * dx) / 2) * 2, WALL_LIMITS.min, WALL_LIMITS.max) : start.w;
      const nh = down ? clamp(Math.round((start.h + 2 * dy) / 2) * 2, WALL_LIMITS.min, WALL_LIMITS.max) : start.h;
      setSizingLabel(`${nw} × ${nh} cm`);
      setWall((w) => {
        if (!w) return w;
        const next = { ...w, w: nw, h: nh, sized: true };
        return {
          ...next,
          pieces: start.pieces.map((p) =>
            keepOn({ ...p, x: follow(p.x, p.w, start.w, nw), y: follow(p.y, heightOf(p), start.h, nh) }, next)),
        };
      });
    };
    const end = () => {
      sizing.current = false;
      sizeAnchor.current = null;
      setSizingLabel(null);
      /* fit the finished wall to the stage again */
      setWall((w) => w && { ...w });
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  };

  /* Cropping: the whole picture stays still and a side (or two, at a corner)
     of what shows is pulled in or out. With Alt / Option held, the opposite
     side moves by the same amount, so a frame comes off both sides evenly. */
  const startCrop = (event: React.PointerEvent, piece: Piece, sides: Sides) => {
    event.stopPropagation();
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const whole = wholeOf(piece);
    const c0 = whole.c;
    const move = (e: PointerEvent) => {
      const at = pointerCm(e.clientX, e.clientY);
      const fx = (at.x - whole.x) / whole.w, fy = (at.y - whole.y) / whole.h;
      const c = { ...c0 };
      const even = e.altKey;
      if (sides.includes("w")) { c.l = fx; if (even) c.r = c0.r + (fx - c0.l); }
      if (sides.includes("e")) { c.r = 1 - fx; if (even) c.l = c0.l + (1 - fx - c0.r); }
      if (sides.includes("n")) { c.t = fy; if (even) c.b = c0.b + (fy - c0.t); }
      if (sides.includes("s")) { c.b = 1 - fy; if (even) c.t = c0.t + (1 - fy - c0.b); }
      /* never past the picture, and always some of it left */
      c.l = clamp(c.l, 0, 1 - MIN_KEEP); c.r = clamp(c.r, 0, 1 - MIN_KEEP - c.l);
      c.t = clamp(c.t, 0, 1 - MIN_KEEP); c.b = clamp(c.b, 0, 1 - MIN_KEEP - c.t);
      const keepW = 1 - c.l - c.r, keepH = 1 - c.t - c.b;
      const next: Piece = {
        ...piece,
        crop: c,
        imgRatio: whole.ratio,
        ratio: (whole.ratio * keepH) / keepW,
        w: whole.w * keepW,
        x: whole.x + c.l * whole.w,
        y: whole.y + c.t * whole.h,
      };
      setWall((w) => w && { ...w, pieces: w.pieces.map((p) => (p.id === piece.id ? next : p)) });
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

  /* the whole picture back, where it was */
  const uncrop = (id: string) =>
    setWall((w) => w && {
      ...w,
      pieces: w.pieces.map((p) => {
        if (p.id !== id || !p.crop) return p;
        const whole = wholeOf(p);
        /* the fields are dropped, not set to undefined - Firestore refuses undefined */
        const { crop: _crop, imgRatio: _imgRatio, ...rest } = p;
        return keepOn({ ...rest, ratio: whole.ratio, w: whole.w, x: whole.x, y: whole.y }, w);
      }),
    });

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
      const next = { ...w, [side]: clamp(Math.round(value), WALL_LIMITS.min, WALL_LIMITS.max), sized: true };
      return { ...next, pieces: next.pieces.map((p) => keepOn(p, next)) };
    });
  };

  const remove = (id: string) => {
    setWall((w) => w && { ...w, pieces: w.pieces.filter((p) => p.id !== id) });
    setSelected(null);
    setCropping(null);
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
            {wall.sized && (
              <button type="button" className="mw-fit" onClick={() => { autoFitted.current = false; setWall({ ...wall, sized: false }); }}>
                {t({ ko: "화면에 맞추기", en: "Fit to screen" })}
              </button>
            )}
            {/* snap: prints are caught by edges and each other; off, they stay where they are let go.
                Turning it on or off leaves the prints already hung as they are. */}
            <button type="button" className="mw-tight" aria-pressed={snapOn(wall)} onClick={() => setWall({ ...wall, snap: !snapOn(wall) })}>
              <i aria-hidden="true" />
              {t({ ko: "스냅", en: "Snap" })}
            </button>
            <span className="mw-status">{saved ? t({ ko: "저장됨", en: "Saved" }) : t({ ko: "저장 중", en: "Saving" })}</span>
          </div>
        )}
        <button type="button" className="mw-close" onClick={onClose} aria-label={t({ ko: "닫기", en: "Close" })}>
          <X size={22} strokeWidth={1.6} />
        </button>
      </header>

      <div className="mw-stage" ref={stageRef} onPointerDown={() => { setSelected(null); setCropping(null); }}>
        {wall && (
          <div className="mw-room" ref={roomRef} style={{ width: wall.w * scale }}>
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
              {wall.pieces.map((p) => {
                const whole = wholeOf(p);
                const crop = p.id === cropping;
                /* the whole picture, placed so only the kept part shows through the print */
                const picture = (faint?: boolean) => (
                  <img
                    src={getOptimizedImageUrl(p.src, 800)}
                    alt={faint ? "" : p.title}
                    draggable={false}
                    className={faint ? "mw-piece__whole" : undefined}
                    style={{ left: (whole.x - p.x) * scale, top: (whole.y - p.y) * scale, width: whole.w * scale, height: whole.h * scale }}
                  />
                );
                return (
                  <figure
                    key={p.id}
                    className={`mw-piece${p.id === selected ? " is-on" : ""}${crop ? " is-crop" : ""}`}
                    style={{ left: p.x * scale, top: p.y * scale, width: p.w * scale, height: heightOf(p) * scale }}
                    onPointerDown={(e) => (crop ? e.stopPropagation() : startMove(e, p))}
                    onDoubleClick={() => { setSelected(p.id); setCropping(crop ? null : p.id); }}
                  >
                    {/* while cropping, the parts trimmed away show faintly around it */}
                    {crop && picture(true)}
                    <span className="mw-piece__view">{picture()}</span>
                    {p.id === selected && !crop &&
                      (["nw", "ne", "sw", "se"] as Corner[]).map((c) => (
                        <i key={c} className={`mw-corner mw-corner--${c}`} onPointerDown={(e) => startResize(e, p, c)} aria-hidden="true" />
                      ))}
                    {crop &&
                      (["n", "s", "e", "w", "nw", "ne", "sw", "se"] as Sides[]).map((side) => (
                        <i key={side} className={`mw-crop mw-crop--${side}`} onPointerDown={(e) => startCrop(e, p, side)} aria-hidden="true" />
                      ))}
                  </figure>
                );
              })}
              {/* the wall's own edges and corners: pull any of them to size it */}
              {(["n", "s", "e", "w", "nw", "ne", "sw", "se"] as Sides[]).map((side) => (
                <i key={side} className={`mw-edge mw-edge--${side}`} onPointerDown={(e) => startWallResize(e, side)} aria-hidden="true" />
              ))}
              {sizingLabel && <span className="mw-sizing">{sizingLabel}</span>}
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

      {chosen && cropping === chosen.id ? (
        <div className="mw-piecebar" onPointerDown={(e) => e.stopPropagation()}>
          <p className="mw-piecebar__title">
            {coarsePointer()
              ? t({ ko: "가장자리를 끌어 자르세요", en: "Drag an edge to crop" })
              : t({ ko: "가장자리를 끌어 자르세요 · Alt(⌥)를 누르면 양쪽이 같이", en: "Drag an edge to crop · hold Alt (⌥) for both sides" })}
          </p>
          <span className="mw-dims">
            {Math.round(chosen.w)} × {Math.round(heightOf(chosen))} cm
          </span>
          {chosen.crop && (
            <button type="button" className="mw-fit" onClick={() => uncrop(chosen.id)}>{t({ ko: "원래대로", en: "Reset" })}</button>
          )}
          <button type="button" className="mw-fit mw-fit--gold" onClick={() => setCropping(null)}>{t({ ko: "완료", en: "Done" })}</button>
        </div>
      ) : chosen && (
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
          <button type="button" className="mw-fit" onClick={() => setCropping(chosen.id)} title={t({ ko: "더블클릭으로도 자를 수 있어요", en: "Double-click a print to crop it too" })}>
            {t({ ko: "자르기", en: "Crop" })}
          </button>
          <button type="button" className="mw-remove" onClick={() => remove(chosen.id)} aria-label={t({ ko: "벽에서 떼기", en: "Take down" })}>
            <Trash2 size={16} strokeWidth={1.8} />
          </button>
        </div>
      )}

      <img ref={ghostRef} className="mw-ghost" alt="" style={{ display: "none" }} />
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
