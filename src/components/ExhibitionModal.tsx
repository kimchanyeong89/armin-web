import type { ExhibitionItem } from "../types/Exhibition";
import type { Artwork } from "../types/Artwork";
import { useState, useEffect, useRef } from "react";
import { addDoc, collection, onSnapshot, query, where, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebase";

// Room type for floor plan boxes
// Room/editor features removed for viewer design

interface ExhibitionModalProps {
  exhibition: ExhibitionItem;
  onClose: () => void;
  // Add other props as needed
}

const ExhibitionModal = ({ exhibition, onClose }: ExhibitionModalProps) => {
  // Layout anchors: keep top row and metadata row in sync
  const LAYOUT_LEFT_BASE = 420; // px, push the two-line layout block to the right
  const LAYOUT_RIGHT_PAD = 0; // stick to the right edge
  const DESCRIPTION_WIDTH_PCT = 12.5; // % width for exhibition description box
  // const STRIP_WIDTH = 150; // px, thumbnail strip width
  // const STRIP_GUTTER = 12; // px, spacing right of the strip
  const META_BASE_MARGIN = 8; // px, desired margin above metadata (raised closer to top)
  const TITLE_DESC_X_OFFSET = 260; // px, shift title/description 100px further right
  const ARCHIVE_LINE_TOP = 14; // px, align Y to Archive text line
  const TITLE_HEIGHT_EST = 16; // px, estimated title line height
  const TITLE_BELOW_GAP = 8; // px, gap between title and description
  const META_LABEL_INSET = 24; // px, metaRowRef top -> first label top (padding 12 + label top 12)
  const DESC_Y_NUDGE = -20; // px, lower description by 10px from previous position
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [showImageModal, setShowImageModal] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'archive' | 'gallery'>('archive');
  const listRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const infoPanelRef = useRef<HTMLDivElement | null>(null);
  const seededRef = useRef(false);
  const didCenterRef = useRef(false);
  const blockHeightsRef = useRef<{ h: number } | null>(null);
  const relocateTimerRef = useRef<number | null>(null);
  const magnetTimerRef = useRef<number | null>(null);
  const [infoY, setInfoY] = useState<number>(0);
  // 관성 스크롤 상태
  const momentumRef = useRef<{ vel: number; raf: number; accelFrames: number }>({ vel: 0, raf: 0, accelFrames: 0 });
  const applyMomentumRef = useRef<((delta: number) => void) | null>(null);
  // Alignment helpers for meta row under top controls
  const galleryRef = useRef<HTMLSpanElement | null>(null);
  const archiveRef = useRef<HTMLSpanElement | null>(null);
  const metaRowRef = useRef<HTMLDivElement | null>(null);
  const topBarRef = useRef<HTMLDivElement | null>(null);
  const descRef = useRef<HTMLDivElement | null>(null);
  const didReseedRef = useRef(false);
  const gallerySeedRef = useRef<number | null>(null);
  // Fixed symmetric columns to keep metadata spread and avoid overlap
  const META_CREATOR_X = 250; // px
  const META_DATE_X = 500; // px
  const META_GAP = META_DATE_X - META_CREATOR_X; // 250px by default
  const metaPos = {
    title: Math.max(0, META_CREATOR_X - META_GAP),
    creator: META_CREATOR_X,
    date: META_DATE_X,
    dimension: META_DATE_X + META_GAP,
  } as const;
  const titleRef = useRef<HTMLDivElement | null>(null);
  const metaTitleValueRef = useRef<HTMLDivElement | null>(null);
  const creatorRef = useRef<HTMLDivElement | null>(null);
  const dateRef = useRef<HTMLDivElement | null>(null);
  const dimensionRef = useRef<HTMLDivElement | null>(null);
  const [metaHeight, setMetaHeight] = useState<number>(44);
  const [topBarHeight, setTopBarHeight] = useState<number>(36);
  const [metaMarginTop] = useState<number>(META_BASE_MARGIN);
  const [descTopPx, setDescTopPx] = useState<number | null>(null);
  // Left positions now derive from metaPos.dimension
  // Vertical positions now follow the Archive line (top: 14)
  const stageMonitorRef = useRef<HTMLDivElement | null>(null);

  // Lock background scroll when modal is open
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // Subscribe to Firestore artworks for this exhibition
  useEffect(() => {
    // URL 파라미터로 랜덤 이미지 시드가 요청된 경우, 파이어스토어 구독을 생략하고 즉시 임시 이미지 20장을 표시
    const params = new URLSearchParams(window.location.search);
    const seedMode = params.get("seed");
    const allowSeed = exhibition.title?.trim() === "한국 고미술 컬렉션" && (seedMode === "unsplash20" || seedMode === "picsum20");
    if (allowSeed) {
      const now = Date.now();
      const useUnsplash = seedMode === "unsplash20";
      const keywords = "art,antique,artifact,exhibition,museum,asian";
      const list: Artwork[] = Array.from({ length: 20 }, (_, i) => ({
        id: `ephemeral-${now}-${i}`,
        name: `Random ${i + 1}`,
        artist: "Random",
        year: 0,
        image: useUnsplash ? `https://source.unsplash.com/1200x900/?${keywords}&sig=${now + i}` : `https://picsum.photos/seed/${now + i}/1200/900`,
        roomId: "default",
        exhibitionName: exhibition.name,
        exhibitionTitle: exhibition.title,
      }));
      setArtworks(list);
      return () => {};
    }
    // Subscribe to Firestore artworks for this exhibition
    const q = query(collection(db, "artworks"), where("exhibitionTitle", "==", exhibition.title));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Artwork[] = [];
        snap.forEach((d) => list.push(d.data() as Artwork));
        // Server truth: set directly from snapshot to avoid duplicates
        const withImages = list.filter(a => !!a.image);
        setArtworks(withImages);
        try {
          localStorage.setItem(`artworks_${exhibition.id}`, JSON.stringify(withImages));
        } catch {}
      },
      (error) => {
        console.error("Firestore onSnapshot error:", error);
        // Fallback to localStorage cache if available
        const cached = localStorage.getItem(`artworks_${exhibition.id}`);
        if (cached) {
          try {
            const cachedList = JSON.parse(cached) as Artwork[];
            setArtworks(cachedList.filter(a => !!a.image));
          } catch {}
        }
      }
    );
    return () => {
      unsub();
    };
  }, [exhibition.id, exhibition.title]);

  // Ensure selected index is valid when artworks update
  useEffect(() => {
    if (artworks.length === 0) { setSelectedIndex(0); return; }
    setSelectedIndex((prev) => Math.min(prev, artworks.length - 1));
  }, [artworks.length]);

  // Static columns; no DOM measurement needed

  // Measure meta row height to avoid overlap, whenever positions or content change
  useEffect(() => {
    const measure = () => {
      const heights = [titleRef.current, creatorRef.current, dateRef.current, dimensionRef.current].map(el => el?.offsetHeight || 0);
      const maxH = Math.max(44, ...heights);
      setMetaHeight(maxH);
    };
    // slight delay to ensure layout applied
    const id = window.setTimeout(measure, 0);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(id);
      window.removeEventListener('resize', measure);
    };
  }, [metaPos, selectedIndex, artworks.length]);

  // 상단 바 높이 고정 (메타/설명 Y 계산의 기준 안정화)
  useEffect(() => {
    const measureTopBar = () => {
      // Fix the top bar height so metadata can move up; description is absolute and won't be clipped
      setTopBarHeight(36);
    };
    const id = window.setTimeout(measureTopBar, 0);
    window.addEventListener('resize', measureTopBar);
    return () => {
      clearTimeout(id);
      window.removeEventListener('resize', measureTopBar);
    };
  }, [exhibition.title, exhibition.description, selectedIndex, metaPos]);

  // 전시 소개(설명) Y를 메타데이터의 TITLE 값 Y에 맞춤 (없으면 라벨 기준으로 폴백)
  useEffect(() => {
    const alignDescToMeta = () => {
      const topBar = topBarRef.current;
      const metaEl = metaRowRef.current;
      if (!topBar || !metaEl) return;
      const topBarRect = topBar.getBoundingClientRect();
      // 우선 TITLE 값의 실제 화면 Y를 사용
      const titleValEl = metaTitleValueRef.current;
      let desired: number;
      if (titleValEl) {
        const valRect = titleValEl.getBoundingClientRect();
        desired = Math.max(0, Math.round(valRect.top - topBarRect.top + DESC_Y_NUDGE));
      } else {
        // 폴백: 메타 라벨 Y 기준
        const metaRect = metaEl.getBoundingClientRect();
        const metaLabelTopScreen = metaRect.top + META_LABEL_INSET;
        desired = Math.max(0, Math.round(metaLabelTopScreen - topBarRect.top + DESC_Y_NUDGE));
      }
      setDescTopPx(desired);
    };
    const id = window.setTimeout(alignDescToMeta, 0);
    window.addEventListener('resize', alignDescToMeta);
    return () => {
      clearTimeout(id);
      window.removeEventListener('resize', alignDescToMeta);
    };
  }, [metaPos, selectedIndex, artworks.length, exhibition.description, topBarHeight]);

  // Vertical alignment handled by static top values to match Archive line

  // No visible spacers; we'll clamp selection to first/last at extremes

  // Optional seeding: add placeholder images for a specific exhibition if empty
  useEffect(() => {
    const title = exhibition.title?.trim();
    if (!title || seededRef.current) return;
    const storageKey = `seeded_${exhibition.id}`;
    if (localStorage.getItem(storageKey)) { seededRef.current = true; return; }
    if (title === "한국 고미술 컬렉션" && artworks.length === 0) {
      (async () => {
        try {
          seededRef.current = true;
          const ids = [1011, 1025, 1035, 1043, 1050, 1067, 1074, 1084, 109, 110];
          const now = Date.now();
          const batch = ids.map((pid, i) => {
            const artId = `seed-${now}-${i}`;
            const docData = {
              id: artId,
              name: `Seed Image ${i + 1}`,
              artist: "Unknown",
              year: 0,
              image: `https://picsum.photos/id/${pid}/1200/900`,
              roomId: "default",
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
            } as Artwork;
            return addDoc(collection(db, "artworks"), docData);
          });
          await Promise.all(batch);
          localStorage.setItem(storageKey, "1");
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("Seeding failed:", e);
        }
      })();
    }
  }, [artworks.length, exhibition.id, exhibition.name, exhibition.title]);

  // Reseed helper via URL param for 한국 고미술 컬렉션: ?seed=unsplash20 | picsum20
  useEffect(() => {
    const title = exhibition.title?.trim();
    if (!title) return;
    const params = new URLSearchParams(window.location.search);
    const seedMode = params.get("seed");
    if (!seedMode) return;
    if (title !== "한국 고미술 컬렉션") return;
    if (didReseedRef.current) return; // 재실행 방지 (StrictMode/HMR)
    didReseedRef.current = true;

    (async () => {
      try {
        // 1) 기존 작품 삭제
        const qDel = query(collection(db, "artworks"), where("exhibitionTitle", "==", exhibition.title));
        const snap = await getDocs(qDel);
        const delJobs: Promise<void>[] = [];
        snap.forEach((ds) => delJobs.push(deleteDoc(doc(db, "artworks", ds.id))));
        await Promise.all(delJobs);

        // 2) 신규 20장 추가 (Unsplash Source or Picsum)
        const now = Date.now();
        const count = 20;
        const useUnsplash = seedMode === "unsplash20";
        const keywords = "art,antique,artifact,exhibition,museum,asian";
        const jobs: Promise<any>[] = [];
        for (let i = 0; i < count; i++) {
          const artId = `seed-${now}-${i}`;
          const image = useUnsplash
            ? `https://source.unsplash.com/1200x900/?${keywords}&sig=${now + i}`
            : `https://picsum.photos/seed/${now + i}/1200/900`;
          const docData = {
            id: artId,
            name: `Random ${i + 1}`,
            artist: "Random",
            year: 0,
            image,
            roomId: "default",
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
          } as Artwork;
          jobs.push(addDoc(collection(db, "artworks"), docData));
        }
        await Promise.all(jobs);
  // eslint-disable-next-line no-console
  console.info(`[seed] Replaced with ${count} images via ${useUnsplash ? "Unsplash" : "Picsum"}.`);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Reseed failed:", e);
      }
    })();
  }, [exhibition.name, exhibition.title]);

  // Viewer mode only; editing/upload removed

  const current = artworks[selectedIndex];
  // Debug outlines disabled
  const DEBUG_LAYOUT = false;

  // Sync selected index to the thumbnail nearest the vertical center on scroll (looped list)
  useEffect(() => {
    if (viewMode !== 'archive') return; // only in archive mode
    const container = listRef.current;
    if (!container) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return; // throttle by rAF
      raf = requestAnimationFrame(() => {
        raf = 0;
        const rect = container.getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
  // Find nearest element by DOM sampling (do not mutate scrollTop here)
        const nodes = Array.from(container.querySelectorAll('[data-base]')) as HTMLElement[];
        let nearestBase = 0;
        let bestDist = Number.POSITIVE_INFINITY;
  // let nearestEl: HTMLElement | null = null; // no longer used (snap disabled)
        for (const node of nodes) {
          const r = node.getBoundingClientRect();
          const mid = r.top + r.height / 2;
          const d = Math.abs(mid - centerY);
          if (d < bestDist) {
            bestDist = d;
            nearestBase = parseInt(node.dataset.base || '0', 10);
            // nearestEl = node;
          }
        }
        setSelectedIndex(nearestBase);

        // Update floating info Y pinned to the scroller center line, adjusted to info panel coords
        const containerRect = container.getBoundingClientRect();
        const infoEl = infoPanelRef.current;
        if (infoEl) {
          const infoRect = infoEl.getBoundingClientRect();
          const computed = window.getComputedStyle(infoEl);
          const padTop = parseFloat(computed.paddingTop || '0');
          const centerLine = containerRect.top + (container.clientHeight / 2);
          setInfoY(centerLine - infoRect.top - padTop);
        }

        // Immediate wrap at hard edges to avoid getting stuck at top/bottom
        const hNow = (blockHeightsRef.current?.h && blockHeightsRef.current.h > 0)
          ? blockHeightsRef.current.h
          : (container.scrollHeight / 3);
        if (hNow && hNow > 0) {
          const st = container.scrollTop;
          // push back into the middle block if we hit extreme edges
          if (st <= hNow * 0.02) {
            container.scrollTop = st + hNow;
          } else if (st >= hNow * 1.98) {
            container.scrollTop = st - hNow;
          }
        }

        // Debounced recentre: only after scrolling settles
        if (relocateTimerRef.current) {
          clearTimeout(relocateTimerRef.current);
        }
        // If user is flinging fast (large delta between frames), skip recentre this cycle
        const velocityHint = Math.abs((container as any)._lastScrollTopVel ?? 0);
        const stNow = container.scrollTop;
        const stPrev = (container as any)._lastScrollTop ?? stNow;
        (container as any)._lastScrollTopVel = stNow - stPrev;
        (container as any)._lastScrollTop = stNow;

  // 스냅/자기장 스냅 비활성화

  relocateTimerRef.current = window.setTimeout(() => {
          if (velocityHint && Math.abs((container as any)._lastScrollTopVel) > 5) return;
          const st = container.scrollTop;
          // Measure one-block height precisely
          const h = blockHeightsRef.current?.h ?? (container.scrollHeight / 3);
          if (!h || h <= 0) return;
          if (st < h * 0.1) {
            container.scrollTop = st + h;
          } else if (st > h * 1.9) {
            container.scrollTop = st - h;
          }
        }, 240);
      });
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll as any);
      if (raf) cancelAnimationFrame(raf);
      if (relocateTimerRef.current) {
        clearTimeout(relocateTimerRef.current);
        relocateTimerRef.current = null;
      }
      if (magnetTimerRef.current) {
        clearTimeout(magnetTimerRef.current);
        magnetTimerRef.current = null;
      }
    };
  }, [artworks, viewMode]);

  // Center to middle block initially so we can scroll infinitely
  useEffect(() => {
    if (viewMode !== 'archive') return; // only in archive mode
    const el = listRef.current;
    if (!el || artworks.length === 0) return;
    didCenterRef.current = false;
    requestAnimationFrame(() => {
      if (!el || didCenterRef.current) return;
      const block1 = el.querySelector('[data-block-container="1"]') as HTMLElement | null;
      const block0 = el.querySelector('[data-block-container="0"]') as HTMLElement | null;
      if (block1 && block0) {
        const h = block1.offsetHeight; // one block height
        blockHeightsRef.current = { h };
      }
      const target = el.querySelector(`[data-block="1"][data-base="${selectedIndex}"]`) as HTMLElement | null;
      if (target) {
        const desiredScroll = (target.offsetTop + target.offsetHeight / 2) - (el.clientHeight / 2);
        el.scrollTo({ top: desiredScroll });
        // Set initial info Y pinned to scroller center line
        const infoEl = infoPanelRef.current;
        if (infoEl) {
          const scRect = el.getBoundingClientRect();
          const infoRect = infoEl.getBoundingClientRect();
          const computed = window.getComputedStyle(infoEl);
          const padTop = parseFloat(computed.paddingTop || '0');
          const centerLine = scRect.top + (el.clientHeight / 2);
          setInfoY(centerLine - infoRect.top - padTop);
        } else {
          setInfoY(el.clientHeight / 2);
        }
      }
      didCenterRef.current = true;
    });
  }, [artworks.length, viewMode]);

  // 패널에서 발생한 휠을 관성 스크롤로 전달 (아카이브 모드에서만)
  useEffect(() => {
    if (viewMode !== 'archive') return; // disable in gallery mode so grid scrolls naturally
    const panel = panelRef.current;
    const scroller = listRef.current;
    if (!panel || !scroller) return;
    const onWheel = (e: WheelEvent) => {
      if (!scroller) return;
      // If the wheel originated inside the scroller, let native scroll handle it
      if (scroller.contains(e.target as Node)) return;
      // Otherwise, route the wheel delta to the scroller to drive image navigation
      e.preventDefault();
      if (applyMomentumRef.current) {
        applyMomentumRef.current(e.deltaY);
      } else {
        scroller.scrollBy({ top: e.deltaY, behavior: 'auto' });
      }
    };
    panel.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      panel.removeEventListener('wheel', onWheel as any);
    };
  }, [artworks.length, viewMode]);

  // 스크롤러 자체에 관성 스크롤(무겁고 가속) 적용 (아카이브 모드에서만)
  useEffect(() => {
    if (viewMode !== 'archive') return; // disable in gallery mode
    const el = listRef.current;
    if (!el) return;
    const m = momentumRef.current;
  const MAX_VEL = 38; // 최대 속도 제한(더 낮춤)
  const GAIN = 0.35; // 입력 게인 축소(더 무겁게)
  const ACCEL_FRAMES = 8; // 가속 프레임 수 축소
  const ACCEL_FACTOR = 1.02; // 가속 배율 축소(덜 급격)
  const FRICTION = 0.88; // 마찰 강화(더 빨리 감속)

    const step = () => {
      // 가속 단계
      if (m.accelFrames > 0) {
        m.vel *= ACCEL_FACTOR;
        m.accelFrames -= 1;
      }
      // 마찰 적용
      m.vel *= FRICTION;

      // 매우 작은 속도는 정지 처리
      if (Math.abs(m.vel) < 0.15) {
        m.vel = 0;
        m.raf = 0;
        return;
      }
      el.scrollTop += m.vel;
      m.raf = requestAnimationFrame(step);
    };

    const addVelocity = (delta: number) => {
      m.vel = Math.max(-MAX_VEL, Math.min(MAX_VEL, m.vel + delta * GAIN));
      m.accelFrames = ACCEL_FRAMES;
      if (!m.raf) m.raf = requestAnimationFrame(step);
    };
    applyMomentumRef.current = addVelocity;

    const onWheel = (e: WheelEvent) => {
      // 기본 스크롤 막고 관성 로직으로 처리
      e.preventDefault();
      addVelocity(e.deltaY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel as any);
      if (m.raf) cancelAnimationFrame(m.raf);
      m.raf = 0;
      applyMomentumRef.current = null;
    };
  }, [artworks.length, viewMode]);

  // Selection is driven purely by scroll position

  // ... rest of the component code ...
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
  overscrollBehavior: "contain",
      }}
    >
  <div ref={panelRef} style={{ position: "relative", backgroundColor: "#fff", width: "100%", height: "100%", padding: 0, borderRadius: 0, boxShadow: "none", display: "flex", flexDirection: "column", overflow: "hidden", ...(DEBUG_LAYOUT ? { outline: "1px solid #f0f" } : {}) }}>
        {/* Absolute full-height thumbnail scroller at far left (archive mode only) */}
        {viewMode === 'archive' && (
          <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 150, background: "transparent", zIndex: 1, ...(DEBUG_LAYOUT ? { outline: "1px solid #964B00" } : {}) }}>
            <div
              ref={listRef}
              className="no-scrollbar"
              style={{ position: "absolute", inset: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 8px", overscrollBehavior: "contain", msOverflowStyle: "none", scrollbarWidth: "none", scrollSnapType: "y proximity", scrollPaddingTop: "50%", scrollPaddingBottom: "50%" }}
            >
              {artworks.length > 0 &&
                [0,1,2].map((block) => (
                  <div key={`block-${block}`} data-block-container={block}>
                    {artworks.map((a, idx) => (
                      <div
                        key={`${block}-${a.id}`}
                        data-block={block}
                        data-base={idx}
                        onClick={() => setSelectedIndex(idx)}
                        role="button"
                        tabIndex={0}
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 36, marginBottom: 84, cursor: "pointer", opacity: idx === selectedIndex ? 1 : 0.65, scrollSnapAlign: "center" }}
                      >
                        <div style={{ width: "40%", aspectRatio: "1 / 1", background: "#eee", borderRadius: 0, overflow: "hidden" }}>
                          {a.image && (
                            <img
                              src={a.image}
                              alt={a.name}
                              style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
                            />
                          )}
                        </div>
                        {/* captions moved to the right stage for the current item only */}
                      </div>
                    ))}
                  </div>
                ))}
              {artworks.length === 0 && (
                <div style={{ color: "#888", fontSize: 13 }}>No artworks yet.</div>
              )}
            </div>
          </div>
        )}
    {/* Top bar: single title + right-aligned description; no dividing line */}
  <div ref={topBarRef} style={{ position: "relative", padding: "0px 0px", display: "flex", alignItems: "flex-start", gap: 16, minHeight: topBarHeight, marginLeft: LAYOUT_LEFT_BASE, marginRight: LAYOUT_RIGHT_PAD, ...(DEBUG_LAYOUT ? { outline: "1px dashed #00f" } : {}) }}>
          {/* Title aligned vertically with Archive */}
            <div style={{ position: "absolute", left: (metaPos.dimension + TITLE_DESC_X_OFFSET), right: "auto", top: ARCHIVE_LINE_TOP, fontSize: 12, fontWeight: 700, textAlign: "left", padding: 0, margin: 0, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", zIndex: 3, ...(DEBUG_LAYOUT ? { outline: "1px solid #0a0" } : {}) }}>
            {exhibition.title || exhibition.name}
          </div>
          {/* Absolute-aligned controls to meta columns */}
          <span
      ref={galleryRef}
            onClick={() => setViewMode('gallery')}
            style={{ position: "absolute", left: (metaPos.date), top: 14, fontSize: 12, lineHeight: 1, fontWeight: 700, color: viewMode === 'gallery' ? "#000" : "#333", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", textDecoration: viewMode === 'gallery' ? 'underline' : 'none', ...(DEBUG_LAYOUT ? { outline: "1px solid #fa0" } : {}) }}
          >
            GALLERY
          </span>
          <span
      ref={archiveRef}
            onClick={() => setViewMode('archive')}
            style={{ position: "absolute", left: (metaPos.creator), top: 14, fontSize: 12, lineHeight: 1, fontWeight: 700, color: viewMode === 'archive' ? "#000" : "#333", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", textDecoration: viewMode === 'archive' ? 'underline' : 'none', ...(DEBUG_LAYOUT ? { outline: "1px solid #fa0" } : {}) }}
          >
            ARCHIVE
          </span>
          {/* Description: fixed narrow width, up to the close text on the right */}
          <div
            ref={descRef}
            style={{ position: "absolute", left: (metaPos.dimension + TITLE_DESC_X_OFFSET), right: "auto", width: `${DESCRIPTION_WIDTH_PCT}%`, top: (descTopPx ?? (ARCHIVE_LINE_TOP + TITLE_HEIGHT_EST + TITLE_BELOW_GAP)), color: "#666", fontSize: 12, lineHeight: 1.4, textAlign: "left", wordBreak: "break-word", overflowWrap: "anywhere", maxWidth: "unset", minWidth: 140, zIndex: 3, ...(DEBUG_LAYOUT ? { outline: "1px solid #90f" } : {}) }}
          >
            {exhibition.description || `${(exhibition.title || exhibition.name)}에 대한 간략한 소개입니다. 주요 소장품과 전시 맥락을 통해 작품의 미감을 자연스럽게 경험할 수 있도록 구성했습니다.`}
          </div>
          {/* close button moved to absolute top-right */}
        </div>

    {/* Artwork meta info (below the top bar, aligned to Gallery/Archive; dynamic per selected artwork) */}
  {viewMode === 'archive' && (
  <div ref={metaRowRef} style={{ position: "relative", padding: "12px 12px 0 0", marginLeft: LAYOUT_LEFT_BASE, marginTop: metaMarginTop, marginRight: LAYOUT_RIGHT_PAD, minHeight: metaHeight, ...(DEBUG_LAYOUT ? { outline: "1px solid #f00" } : {}) }}>
          {(() => {
            const titleText = current?.name || "—";
            const creatorText = current?.artist || "—";
            const dateText = current?.year ? String(current.year) : "—";
            const dimensionText = "—"; // Not available in Artwork type; placeholder
            const gap = Math.max(160, Math.min(360, metaPos.date - metaPos.creator - 12));
            const titleW = gap;
            const creatorW = gap;
            const dateW = gap;
            return (
              <>
                {/* TITLE */}
                <div ref={titleRef} style={{ position: "absolute", left: metaPos.title, top: 12, maxWidth: titleW, ...(DEBUG_LAYOUT ? { outline: "1px dashed #f66" } : {}) }}>
                  <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 4 }}>TITLE</div>
                  <div ref={metaTitleValueRef} style={{ fontSize: 12, color: "#222", fontWeight: 700, lineHeight: 1.3, whiteSpace: "normal", wordBreak: "break-word" }}>{titleText}</div>
                </div>
                {/* CREATOR (aligned under Gallery) */}
                <div ref={creatorRef} style={{ position: "absolute", left: metaPos.creator, top: 12, maxWidth: creatorW, ...(DEBUG_LAYOUT ? { outline: "1px dashed #6f6" } : {}) }}>
                  <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 4 }}>CREATOR</div>
                  <div style={{ fontSize: 12, color: "#222", lineHeight: 1.3, whiteSpace: "normal", wordBreak: "break-word" }}>{creatorText}</div>
                </div>
                {/* DATE (aligned under Archive) */}
                <div ref={dateRef} style={{ position: "absolute", left: metaPos.date, top: 12, maxWidth: dateW, ...(DEBUG_LAYOUT ? { outline: "1px dashed #66f" } : {}) }}>
                  <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 4 }}>DATE</div>
                  <div style={{ fontSize: 12, color: "#222", lineHeight: 1.3, whiteSpace: "normal", wordBreak: "break-word" }}>{dateText}</div>
                </div>
                {/* DIMENSION (to the right of DATE by the same gap) */}
                <div ref={dimensionRef} style={{ position: "absolute", left: metaPos.dimension, right: 0, top: 12, ...(DEBUG_LAYOUT ? { outline: "1px dashed #f6f" } : {}) }}>
                  <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 4 }}>DIMENSION</div>
                  <div style={{ fontSize: 12, color: "#222", lineHeight: 1.3, whiteSpace: "normal", wordBreak: "break-word" }}>{dimensionText}</div>
                </div>
              </>
            );
          })()}
  </div>
  )}

        {/* Textual close control at the top-right */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 6,
            right: 8,
            padding: 6,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#333",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "lowercase",
          }}
        >
          close
        </button>

    {/* Content area */}
  <div style={{ flex: 1, display: "flex", minHeight: 0, paddingLeft: viewMode === 'archive' ? 150 : 0 }}>

  {viewMode === 'archive' ? (
        <>
          {/* Middle info panel (floats next to selected thumbnail position) */}
          <div ref={infoPanelRef} style={{ width: 160, background: "#fff", padding: "12px 6px 12px 4px", position: "relative" }}>
            {current ? (
              <div style={{ position: "absolute", top: infoY, left: 4, right: 6, transform: "translateY(-50%)", color: "#222", lineHeight: 1.5 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={current.name}>{current.name}</div>
                <div style={{ fontSize: 11.5, color: "#666" }}>{current.artist}{current.year ? ` (${current.year})` : ""}</div>
              </div>
            ) : null}
          </div>
          {/* Right stage */}
          <div style={{ flex: 1, position: "relative", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div ref={stageMonitorRef} style={{ width: "80%", height: "70%", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {current ? (
                <img
                  src={current.image}
                  alt={current.name}
                  style={{ height: "100%", width: "auto", maxWidth: "100%", maxHeight: "100%", objectFit: "contain", cursor: "zoom-in", display: "block" }}
                  onClick={() => setShowImageModal(current.image || null)}
                />
              ) : (
                <div style={{ color: "#bbb", margin: "auto" }}>No image</div>
              )}
            </div>
          </div>
        </>
  ) : (
        // Gallery grid mode
  <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
          {(() => {
            if (!gallerySeedRef.current) gallerySeedRef.current = Date.now();
            const seed = gallerySeedRef.current;
            const extraCount = 10;
            const extras: Artwork[] = Array.from({ length: extraCount }, (_, i) => ({
              id: `gallery-extra-${seed}-${i}`,
              name: `Extra ${i + 1}`,
              artist: artworks[i % artworks.length]?.artist || 'Random',
              year: artworks[i % artworks.length]?.year || 0,
              image: `https://picsum.photos/seed/${seed + i}/1200/900`,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
            }));
            const items: Artwork[] = [...artworks, ...extras];
    return (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 64, padding: '192px 48px 96px 150px' }}>
                {items.map((a, idx) => (
                  <div key={a.id ?? `${idx}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <div style={{ width: '60%', aspectRatio: '1 / 1', background: '#eee', overflow: 'hidden', borderRadius: 0 }}>
                      {a.image && (
                        <img src={a.image} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      )}
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 400, color: '#222' }}>{String(idx + 1).padStart(2, '0')}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#222', marginTop: 2 }}>{a.name}{a.year ? ` (${a.year})` : ''}</div>
                      <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>{a.artist}</div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}
        </div>
      </div>

      {/* 이미지 미리보기 모달 */}
      {showImageModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 11000,
          }}
          onClick={() => setShowImageModal(null)}
        >
          <div style={{ maxWidth: "90%", maxHeight: "90%" }}>
            <img src={showImageModal!} alt="Artwork" style={{ width: "100%", height: "auto" }} />
          </div>
        </div>
      )}

  {/* Upload overlay removed in viewer mode */}
      {/* Hide scrollbars for filmstrip */}
      <style>
        {`
          .no-scrollbar::-webkit-scrollbar { width: 0; height: 0; display: none; }
          .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        `}
      </style>
    </div>
  );
};

export default ExhibitionModal;