import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs, getFirestore, setDoc } from "firebase/firestore";
import { Trash2, X } from "lucide-react";
import { getOptimizedImageUrl } from "../../utils/imageProxy";
import "./myWall.css";

/* A wall to try prints on: the saved works and exhibition posters hung at a
   real size in centimetres, so the wall shows what bought posters would look
   like. Everything is kept in centimetres - the wall, each print's place and
   width - so a later print order can read the sizes straight from here. */

export interface WallSource {
  key: string;
  src: string;
  title: string;
}

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

const DEFAULT_WALL: Wall = { w: 300, h: 240, color: "#ece8df", pieces: [] };
const WALL_LIMITS = { min: 100, max: 1000 };
/* print sizes by the long side, as poster shops sell them */
const LONG_SIDES = [40, 50, 70, 100];
const FIRST_LONG_SIDE = 50;
const COLORS = [
  { value: "#ece8df", ko: "화이트", en: "White" },
  { value: "#b9b1a4", ko: "웜 그레이", en: "Warm grey" },
  { value: "#8d9784", ko: "세이지", en: "Sage" },
  { value: "#2a2a2a", ko: "차콜", en: "Charcoal" },
];

const widthFor = (ratio: number, longSide: number) => (ratio >= 1 ? longSide / ratio : longSide);
const longSideOf = (p: Piece) => Math.round(p.ratio >= 1 ? p.w * p.ratio : p.w);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
/* a print never hangs off the wall */
const keepOn = (p: Piece, wall: { w: number; h: number }): Piece => ({
  ...p,
  x: clamp(p.x, 0, wall.w - p.w),
  y: clamp(p.y, 0, wall.h - p.w * p.ratio),
});

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

/* liked works first, then the posters of saved shows */
async function loadSources(uid: string): Promise<WallSource[]> {
  const db = getFirestore();
  const read = (path: string) => getDocs(collection(db, path)).then((snap) => snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))).catch(() => []);
  const [works, liked, saved] = await Promise.all([
    read(`users/${uid}/liked_artworks`),
    read(`users/${uid}/liked_exhibitions`),
    read(`users/${uid}/saved_exhibitions`),
  ]);
  const when = (x: any) => Number(x.likedAt?.seconds ?? x.likedAt ?? 0) || 0;
  works.sort((a: any, b: any) => when(b) - when(a));
  const seen = new Set<string>();
  const out: WallSource[] = [];
  const add = (key: string, src: unknown, title: unknown) => {
    const url = String(src || "").trim();
    if (!/^https?:\/\//.test(url) || seen.has(url)) return;
    seen.add(url);
    out.push({ key, src: url, title: String(title || "") });
  };
  works.forEach((w: any) => add(`a-${w.artworkId || w.id}`, w.image || w.i || w.imageUrl, w.title || w.name));
  [...liked, ...saved].forEach((x: any) => add(`e-${x.id}`, x.image, x.title || x.name));
  return out;
}

/* the picture last picked up anywhere on the page, for a drop on the wall */
let pickedUp: { src: string; title: string } | null = null;

export default function MyWall({ uid, ko, compact, pageDrops, onClose }: {
  uid: string;
  ko: boolean;
  /** a short drawer or a phone: smaller tray, no kicker */
  compact?: boolean;
  /** pictures on the page can be dragged in (a desktop; a phone has no drag) */
  pageDrops?: boolean;
  onClose: () => void;
}) {
  const t = (copy: { ko: string; en: string }) => (ko ? copy.ko : copy.en);
  const [wall, setWall] = useState<Wall | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const [scale, setScale] = useState(1); // px per cm
  const stageRef = useRef<HTMLDivElement>(null);
  const wallRef = useRef<HTMLDivElement>(null);
  const ratios = useRef(new Map<string, number>());
  const [ghost, setGhost] = useState<{ src: string; x: number; y: number } | null>(null);
  const [sources, setSources] = useState<WallSource[]>([]);
  const [dropping, setDropping] = useState(false);

  useEffect(() => {
    let live = true;
    void loadSources(uid).then((list) => live && setSources(list));
    return () => {
      live = false;
    };
  }, [uid]);

  /* any picture on the page can be dragged onto the wall: note what was
     picked up (an image, or a link or card holding one) */
  useEffect(() => {
    const onDragStart = (event: DragEvent) => {
      const target = event.target as HTMLElement | null;
      const img = target instanceof HTMLImageElement ? target : target?.querySelector?.("img");
      pickedUp = img?.currentSrc || img?.src
        ? { src: originalImage(img.currentSrc || img.src), title: img.alt || img.title || target?.getAttribute?.("aria-label") || "" }
        : null;
    };
    document.addEventListener("dragstart", onDragStart, true);
    return () => document.removeEventListener("dragstart", onDragStart, true);
  }, []);

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

  const hang = (source: WallSource, at?: { x: number; y: number }) => {
    if (!wall) return;
    const ratio = ratios.current.get(source.key) || 1.4;
    const w = widthFor(ratio, FIRST_LONG_SIDE);
    const h = w * ratio;
    /* a tapped print goes near the middle, a little off the last one */
    const step = (wall.pieces.length % 5) * 8;
    const x = at ? at.x - w / 2 : wall.w / 2 - w / 2 + step;
    const y = at ? at.y - h / 2 : wall.h * 0.42 - h / 2 + step;
    const piece = keepOn({ id: `${source.key}-${Date.now()}`, src: source.src, title: source.title, ratio, x, y, w }, wall);
    setWall({ ...wall, pieces: [...wall.pieces, piece] });
    setSelected(piece.id);
  };

  /* a picture from the page: its proportions are read before it is hung */
  const hangFromPage = (src: string, title: string, at: { x: number; y: number } | null) => {
    const key = `p-${src}`;
    const probe = new Image();
    probe.onload = () => {
      if (probe.naturalWidth) ratios.current.set(key, probe.naturalHeight / probe.naturalWidth);
      hang({ key, src, title }, at || undefined);
    };
    probe.onerror = () => hang({ key, src, title }, at || undefined);
    probe.src = getOptimizedImageUrl(src, 240);
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDropping(false);
    const at = toWallCm(event.clientX, event.clientY);
    const uri = event.dataTransfer.getData("text/uri-list").split("\n").find((l) => l && !l.startsWith("#"));
    const src = pickedUp?.src || (uri ? originalImage(uri.trim()) : "");
    const title = pickedUp?.title || "";
    pickedUp = null;
    if (/^https?:\/\//.test(src)) hangFromPage(src, title, at);
  };

  const toWallCm = (clientX: number, clientY: number) => {
    const box = wallRef.current?.getBoundingClientRect();
    if (!box || clientX < box.left || clientX > box.right || clientY < box.top || clientY > box.bottom) return null;
    return { x: (clientX - box.left) / scale, y: (clientY - box.top) / scale };
  };

  /* from the tray: a press that moves is a drag onto the wall, one that
     doesn't is a tap that hangs the print in the middle */
  const startFromTray = (event: React.PointerEvent, source: WallSource) => {
    if (event.button !== 0) return;
    const start = { x: event.clientX, y: event.clientY };
    let dragging = false;
    const move = (e: PointerEvent) => {
      if (!dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) dragging = true;
      if (dragging) setGhost({ src: source.src, x: e.clientX, y: e.clientY });
    };
    const end = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      setGhost(null);
      if (!dragging) return hang(source);
      const at = toWallCm(e.clientX, e.clientY);
      if (at) hang(source, at);
    };
    /* the tray took the gesture as a sideways scroll */
    const cancel = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      setGhost(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
  };

  /* on the wall: drag a print to move it */
  const startMove = (event: React.PointerEvent, piece: Piece) => {
    event.stopPropagation();
    setSelected(piece.id);
    const start = { x: event.clientX, y: event.clientY, px: piece.x, py: piece.y };
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      setWall((w) => w && {
        ...w,
        pieces: w.pieces.map((p) => (p.id === piece.id
          ? keepOn({ ...p, x: start.px + (e.clientX - start.x) / scale, y: start.py + (e.clientY - start.y) / scale }, w)
          : p)),
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
        return keepOn({ ...p, w: nextW, x: p.x + (p.w - nextW) / 2, y: p.y + (p.w - nextW) * p.ratio / 2 }, w);
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
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; if (!dropping) setDropping(true); }}
              onDragLeave={() => setDropping(false)}
              onDrop={onDrop}
              style={{ width: wall.w * scale, height: wall.h * scale, background: wall.color }}
            >
              {wall.pieces.length === 0 && (
                <p className="mw-empty">
                  {!pageDrops
                    ? t({ ko: "아래 작품을 눌러 걸어 보세요.", en: "Tap a work below to hang it." })
                    : t({ ko: "페이지의 작품이나 아래 작품을 벽으로 끌어오세요.", en: "Drag any work on the page, or one below, onto the wall." })}
                </p>
              )}
              {wall.pieces.map((p) => (
                <figure
                  key={p.id}
                  className={p.id === selected ? "mw-piece is-on" : "mw-piece"}
                  style={{ left: p.x * scale, top: p.y * scale, width: p.w * scale, height: p.w * p.ratio * scale }}
                  onPointerDown={(e) => startMove(e, p)}
                >
                  <img src={getOptimizedImageUrl(p.src, 800)} alt={p.title} draggable={false} />
                </figure>
              ))}
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
          <p className="mw-piecebar__title">{chosen.title}</p>
          <div className="mw-sizes" role="radiogroup" aria-label={t({ ko: "인쇄 크기", en: "Print size" })}>
            {LONG_SIDES.map((side) => (
              <button
                key={side}
                type="button"
                role="radio"
                aria-checked={longSideOf(chosen) === side}
                onClick={() => resize(chosen.id, side)}
              >
                {side}
              </button>
            ))}
          </div>
          <span className="mw-dims">
            {Math.round(chosen.w)} × {Math.round(chosen.w * chosen.ratio)} cm
          </span>
          <button type="button" className="mw-remove" onClick={() => remove(chosen.id)} aria-label={t({ ko: "벽에서 떼기", en: "Take down" })}>
            <Trash2 size={16} strokeWidth={1.8} />
          </button>
        </div>
      )}

      <div className="mw-tray">
        {sources.length === 0 ? (
          <p className="mw-tray__empty">
            {t({ ko: "좋아요한 작품이나 저장한 전시가 여기에 나옵니다.", en: "Works you like and exhibitions you save show up here." })}
          </p>
        ) : (
          <ul>
            {sources.map((s) => (
              <li key={s.key}>
                <button type="button" onPointerDown={(e) => startFromTray(e, s)} title={s.title} aria-label={s.title}>
                  <img
                    src={getOptimizedImageUrl(s.src, 240)}
                    alt=""
                    draggable={false}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      if (img.naturalWidth) ratios.current.set(s.key, img.naturalHeight / img.naturalWidth);
                    }}
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

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
