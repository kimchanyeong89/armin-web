import type { ExhibitionItem } from "../types/Exhibition";
import type { Artwork } from "../types/Artwork";
import { useState, useEffect, useRef, useMemo } from "react";
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
  // const STRIP_WIDTH = 150; // px, thumbnail strip width
  // const STRIP_GUTTER = 12; // px, spacing right of the strip
  const META_BASE_MARGIN = 8; // px, desired margin above metadata (raised closer to top)
  const META_SHIFT = 205; // px, horizontal shift to move metadata area right (moved -95px)
  const META_HOR_SCALE = 2 / 3; // shrink horizontal allocation to 2/3
  const META_VERTICAL_PAD = 24; // extra vertical space to allow wrapping
  // Title/description moved to left column header; top-bar alignment constants removed
  // Simplified layout constants; dynamic alignment removed
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  // Room selector: 'ALL' shows every artwork; other ids map to actual roomId values
  const [selectedRoomId, setSelectedRoomId] = useState<string>("ALL");
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

  // Allow adding simple rooms and compute a list of room buttons (ALL + defaults + custom + discovered)
  const [customRooms, setCustomRooms] = useState<string[]>([]);
  // Load/save custom rooms per exhibition to localStorage so rooms persist between opens
  useEffect(() => {
    try {
      const key = `rooms_${exhibition.id}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) setCustomRooms(parsed);
      }
    } catch {}
  }, [exhibition.id]);

  useEffect(() => {
    try {
      const key = `rooms_${exhibition.id}`;
      localStorage.setItem(key, JSON.stringify(customRooms));
    } catch {}
  }, [customRooms, exhibition.id]);
  const roomButtons = useMemo(() => {
    // Always include level-2 rooms 1–7 in numeric order, plus any discovered numeric rooms
    const defaultRooms = ['1','2','3','4','5','6','7'];
    const discovered = Array.from(new Set(
      artworks
        .map(a => (a.roomId || '').trim())
        .filter(id => id && id.toLowerCase() !== 'default')
    ));
    const numeric = Array.from(new Set([...defaultRooms, ...discovered].filter(id => /^\d+$/.test(id))));
    numeric.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    const hasC = discovered.some(id => id.toUpperCase() === 'C');
    const buttons: { label: string; id: string }[] = [{ label: 'ALL', id: 'ALL' }];
    for (const id of numeric) buttons.push({ label: id, id });
    if (hasC) buttons.push({ label: 'C', id: 'C' }); // append Central Hall at the end
    return buttons;
  }, [artworks]);

  const filteredArtworks = useMemo(() => {
    if (selectedRoomId === 'ALL') return artworks;
    return artworks.filter(a => (a.roomId || 'default') === selectedRoomId);
  }, [artworks, selectedRoomId]);
  // Momentum scroll state
  const momentumRef = useRef<{ vel: number; raf: number; accelFrames: number }>({ vel: 0, raf: 0, accelFrames: 0 });
  const applyMomentumRef = useRef<((delta: number) => void) | null>(null);
  // Alignment helpers for meta row under top controls
  const galleryRef = useRef<HTMLSpanElement | null>(null);
  const archiveRef = useRef<HTMLSpanElement | null>(null);
  const metaRowRef = useRef<HTMLDivElement | null>(null);
  const topBarRef = useRef<HTMLDivElement | null>(null);
  // descRef removed (description now in left header)
  const titleScrollRef = useRef<HTMLDivElement | null>(null);
  const titleRafRef = useRef<number | null>(null);
  const titleDirRef = useRef<number>(1);
  const didReseedRef = useRef(false);
  // gallerySeedRef removed (gallery extras no longer generated)
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
  // description/positioning constants removed — layout now uses fixed left-top positions
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
  // If a random image seed is requested via URL param, skip Firestore subscription and show 20 ephemeral images immediately
    const params = new URLSearchParams(window.location.search);
    const seedMode = params.get("seed");
  const allowSeed = exhibition.title?.trim() === "Korean Classical Art Collection" && (seedMode === "unsplash20" || seedMode === "picsum20");
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
    if (filteredArtworks.length === 0) { setSelectedIndex(0); return; }
    setSelectedIndex((prev) => Math.min(prev, filteredArtworks.length - 1));
  }, [filteredArtworks.length]);

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
  }, [metaPos, selectedIndex, filteredArtworks.length]);

  // Fix top bar height (stabilize baseline for meta/description Y calculations)
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

  // Description alignment simplified: using fixed left-top placement instead of dynamic computation.

  // Vertical alignment handled by static top values to match Archive line

  // No visible spacers; we'll clamp selection to first/last at extremes

  // Hover-based auto-scroll (marquee) for long titles: ping-pong left/right while hovered
  const startTitleAutoScroll = () => {
    const el = titleScrollRef.current;
    if (!el) return;
    const inner = el.firstElementChild as HTMLElement | null;
    if (!inner) return;
    const max = inner.scrollWidth - el.clientWidth;
    if (max <= 0) return;
    if (titleRafRef.current) cancelAnimationFrame(titleRafRef.current);
    titleDirRef.current = 1;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(40, now - last); // cap dt for large frames
      last = now;
      const speedPxPerMs = 0.05; // ~50px/sec
      const delta = titleDirRef.current * speedPxPerMs * dt;
      el.scrollLeft = Math.max(0, Math.min(max, el.scrollLeft + delta));
      if (el.scrollLeft >= max - 0.5) {
        titleDirRef.current = -1;
      } else if (el.scrollLeft <= 0.5) {
        titleDirRef.current = 1;
      }
      titleRafRef.current = requestAnimationFrame(step);
    };
    titleRafRef.current = requestAnimationFrame(step);
  };

  const stopTitleAutoScroll = (reset = true) => {
    if (titleRafRef.current) {
      cancelAnimationFrame(titleRafRef.current);
      titleRafRef.current = null;
    }
    const el = titleScrollRef.current;
    if (el && reset) el.scrollLeft = 0;
  };

  // Optional seeding: add placeholder images for a specific exhibition if empty
  useEffect(() => {
    const title = exhibition.title?.trim();
    if (!title || seededRef.current) return;
    const storageKey = `seeded_${exhibition.id}`;
    if (localStorage.getItem(storageKey)) { seededRef.current = true; return; }
  if (title === "Korean Classical Art Collection" && artworks.length === 0) {
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

  // Reseed helper via URL param for Korean Classical Art Collection: ?seed=unsplash20 | picsum20
  useEffect(() => {
    const title = exhibition.title?.trim();
    if (!title) return;
    const params = new URLSearchParams(window.location.search);
    const seedMode = params.get("seed");
    if (!seedMode) return;
  if (title !== "Korean Classical Art Collection") return;
  if (didReseedRef.current) return; // prevent re-run (StrictMode/HMR)
    didReseedRef.current = true;

    (async () => {
      try {
  // 1) Delete existing artworks
        const qDel = query(collection(db, "artworks"), where("exhibitionTitle", "==", exhibition.title));
        const snap = await getDocs(qDel);
        const delJobs: Promise<void>[] = [];
        snap.forEach((ds) => delJobs.push(deleteDoc(doc(db, "artworks", ds.id))));
        await Promise.all(delJobs);

  // 2) Add 20 new images (Unsplash source or Picsum)
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

  const current = filteredArtworks[selectedIndex];
  // Debug outlines disabled
  const DEBUG_LAYOUT = false;

  // Sync selected index to the thumbnail nearest the vertical center on scroll (looped list)
  useEffect(() => {
    if (viewMode !== 'archive') return; // only in archive mode
    const container = listRef.current;
    if (!container || filteredArtworks.length === 0) return;
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

  // Snap / magnetic snap disabled

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
  }, [filteredArtworks.length, selectedRoomId, viewMode]);

  // Center to middle block initially so we can scroll infinitely
  useEffect(() => {
    if (viewMode !== 'archive') return; // only in archive mode
    const el = listRef.current;
    if (!el || filteredArtworks.length === 0) return;
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
  }, [filteredArtworks.length, viewMode]);

  // Route wheel events from the panel to the momentum scroller (archive mode only)
  useEffect(() => {
    if (viewMode !== 'archive') return; // disable in gallery mode so grid scrolls naturally
    const panel = panelRef.current;
    const scroller = listRef.current;
    if (!panel || !scroller || filteredArtworks.length === 0) return;
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
  }, [filteredArtworks.length, selectedRoomId, viewMode]);

  // Apply inertia/momentum scrolling to the scroller itself (archive mode only)
  useEffect(() => {
    if (viewMode !== 'archive') return; // disable in gallery mode
    const el = listRef.current;
    if (!el || filteredArtworks.length === 0) return;
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
  // Prevent default scroll and handle via momentum logic
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
  }, [filteredArtworks.length, selectedRoomId, viewMode]);

  // Selection is driven purely by scroll position

  // ... rest of the component code ...
  // Shared layout values for room selector + info text
  const isGalleryLayout = viewMode === 'gallery';
  // Archive: move noticeably into the gap but avoid overlapping metadata (150 .. 420)
  const selectorLeftArchive = 280; // moved left by 100px from 380
  const selectorLeft = isGalleryLayout ? 12 : selectorLeftArchive;
  const selectorTop = isGalleryLayout ? 8 : 2;
  const selectorWidth = isGalleryLayout ? 160 : 180;
  const perRowCount = isGalleryLayout ? 6 : 5;
  // Info text X within the info panel should align visually to the selector's X
  // Keep info text inset inside the info panel to avoid clipping; align visually with selector
  const infoTextLeft = isGalleryLayout ? 4 : Math.max(12, selectorLeft - 150 + 12);

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
  {(viewMode === 'archive') && (
          <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 150, background: "transparent", zIndex: 1, display: 'flex', flexDirection: 'column', ...(DEBUG_LAYOUT ? { outline: "1px solid #964B00" } : {}) }}>
            {/* Left header: title + description + room selector */}
            <div style={{ padding: '8px 8px', borderBottom: '0px solid transparent' }}>
              <div
                ref={titleScrollRef}
                onMouseEnter={() => startTitleAutoScroll()}
                onMouseLeave={() => stopTitleAutoScroll(true)}
                style={{ fontSize: 12, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflowX: 'hidden', textOverflow: 'clip', cursor: 'default' }}
                title={exhibition.title || exhibition.name}
              >
                <span style={{ display: 'inline-block', paddingRight: 18 }}>{exhibition.title || exhibition.name}</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 10, color: '#666', lineHeight: 1.3, maxHeight: 72, overflow: 'hidden' }}>
                {exhibition.description || `${(exhibition.title || exhibition.name)} — a short introduction to the exhibition.`}
              </div>
              {/* room selector removed from left header; rendered between title/meta instead */}
            </div>
            {/* Centered placeholder area in the left column when no artworks (archive only) */}
            {filteredArtworks.length === 0 && viewMode === 'archive' && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ color: '#888', fontSize: 13, textAlign: 'center' }}>NO ARTWORKS
                  <br />YET .</div>
              </div>
            )}
            {/* Scrollable thumbnail strip below header (only when there are artworks) */}
            {filteredArtworks.length > 0 && (
              <div
                ref={listRef}
                className="no-scrollbar"
                style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 8px", overscrollBehavior: "contain", msOverflowStyle: "none", scrollbarWidth: "none", scrollSnapType: "y proximity", scrollPaddingTop: "50%", scrollPaddingBottom: "50%" }}
              >
                {[0,1,2].map((block) => (
                  <div key={`block-${block}`} data-block-container={block}>
                    {filteredArtworks.map((a, idx) => (
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
              </div>
            )}
          </div>
        )}
    {/* Top bar: single title + right-aligned description; no dividing line */}
  <div ref={topBarRef} style={{ position: "relative", padding: "0px 0px", display: "flex", alignItems: "flex-start", gap: 16, minHeight: topBarHeight, marginLeft: (LAYOUT_LEFT_BASE + META_SHIFT), marginRight: LAYOUT_RIGHT_PAD, ...(DEBUG_LAYOUT ? { outline: "1px dashed #00f" } : {}) }}>
          {/* Title aligned vertically with Archive */}
            {/* Title moved to left column header; removed duplicate here */}
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
          {/* Description moved to left column header; removed duplicate here */}
          {/* close button moved to absolute top-right */}
        </div>
    {/* Room selector: placed between top bar and meta row (chunked rows of 5) */}
  {/* Room selector: absolute so it doesn't push down the metadata; wraps when it runs out of width */}
  {(() => {
    // Use shared layout constants computed above: selectorLeft, selectorTop, selectorWidth, perRowCount
    const perRow = perRowCount;
    const isGallery = isGalleryLayout;
    return (
      <div style={{ position: 'absolute', left: selectorLeft, top: selectorTop, width: selectorWidth, zIndex: 20 }}>
        {/* ALL button on its own line */}
        {roomButtons.find(b => b.id === 'ALL') && (
          <div style={{ marginBottom: 6 }}>
            <button
              onClick={() => { setSelectedRoomId('ALL'); setSelectedIndex(0); }}
              style={{ padding: '4px 8px', fontSize: 11, borderRadius: 4, border: 'none', background: selectedRoomId === 'ALL' ? '#111' : 'transparent', color: selectedRoomId === 'ALL' ? '#fff' : '#222', cursor: 'pointer' }}
            >
              ALL
            </button>
          </div>
        )}
        {/* numeric/custom buttons: render in rows of 5, each row justified space-between */}
        {(() => {
          const nums = roomButtons.filter(b => b.id !== 'ALL');
          const rows = Math.max(1, Math.ceil(nums.length / perRow));
          return (
            <div style={{ width: '100%' }}>
              {Array.from({ length: rows }).map((_, r) => {
                const start = r * perRow;
                const slice = nums.slice(start, start + perRow);
                // const isLast = r === rows - 1; // removed (+) button
                return (
                  <div key={`room-row-${r}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
                    {slice.map((btn) => (
                      <button
                        key={btn.id}
                        onClick={() => { setSelectedRoomId(btn.id); setSelectedIndex(0); }}
                        style={{
                          // fixed size so single/double digit labels align
                          width: isGallery ? 32 : 34,
                          height: 22,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                          fontSize: 11,
                          borderRadius: 4,
                          border: 'none',
                          background: selectedRoomId === btn.id ? '#111' : 'transparent',
                          color: selectedRoomId === btn.id ? '#fff' : '#222',
                          cursor: 'pointer'
                        }}
                      >
                        {btn.label}
                      </button>
                    ))}
                    {/* fill empty slots so space-between works when slice shorter than perRow */}
                    {Array.from({ length: Math.max(0, perRow - slice.length) }).map((__, i) => (
                      <div key={`spacer-${r}-${i}`} style={{ width: 0 }} />
                    ))}
                    {/* put + button at the end of the last row */}
                    {/* '+' adder removed to avoid empty rooms */}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    );
  })()}

    {/* Artwork meta info (below the top bar, aligned to Gallery/Archive; dynamic per selected artwork) */}
  {(viewMode === 'archive' || viewMode === 'gallery') && (
  <div ref={metaRowRef} style={{ position: "relative", padding: "12px 12px 0 0", marginLeft: (LAYOUT_LEFT_BASE + META_SHIFT), marginTop: metaMarginTop, marginRight: LAYOUT_RIGHT_PAD, minHeight: (metaHeight + META_VERTICAL_PAD), ...(DEBUG_LAYOUT ? { outline: "1px solid #f00" } : {}) }}>
          {(() => {
                    const titleText = current?.name || "—";
                    const creatorText = current?.artist || "—";
                    const dateText = current?.date || (current?.year ? String(current.year) : "—");
                    const dimensionText = current?.dimension || "—";
                    const gap = Math.max(160, Math.min(360, metaPos.date - metaPos.creator - 12));
                    // shrink horizontal allocation to avoid cramped columns; allow content to wrap vertically
                    const shrunk = Math.max(80, Math.floor(gap * META_HOR_SCALE));
                    const titleW = shrunk;
                    const creatorW = shrunk;
                    const dateW = shrunk;
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
          <div ref={infoPanelRef} style={{ width: 260, background: "#fff", padding: "12px 10px 12px 12px", position: "relative" }}>
        {current ? (
          <div style={{ position: "absolute", top: infoY, left: infoTextLeft, right: 6, transform: "translateY(-50%)", color: "#222", lineHeight: 1.5 }}>
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
  <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', paddingLeft: 0 }}>
            {(() => {
              const items: Artwork[] = filteredArtworks;
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 64, padding: '192px 48px 96px 150px' }}>
                  {items.map((a, idx) => (
                    <div key={a.id ?? `${idx}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                      <div style={{ width: '60%', background: '#eee', borderRadius: 0 }}>
                        {a.image && (
                          <img src={a.image} alt={a.name} style={{ width: '100%', height: 'auto', display: 'block' }} />
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