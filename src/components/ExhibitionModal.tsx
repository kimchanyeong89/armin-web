import type { ExhibitionItem } from "../types/Exhibition";
import type { Artwork } from "../types/Artwork";
import { useState, useEffect, useRef, useMemo } from "react";
import { collection, query, where, onSnapshot, addDoc, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebase";
import { buildSourceSet, useProxy } from "../utils/imageProxy";
import { usePrefetchNeighbors } from "../hooks/usePrefetchNeighbors";

const sortNumericKeys = (map?: Record<string, string>) => {
  if (!map) return [] as number[];
  return Object.keys(map)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
};

const pickLowPlaceholder = (artwork: Artwork) => {
  if (artwork.lq) return artwork.lq;
  if (artwork.thumb) return artwork.thumb;
  const jpgKeys = sortNumericKeys(artwork.variants?.jpg);
  if (jpgKeys.length) {
    const url = artwork.variants?.jpg?.[String(jpgKeys[0])];
    if (url) return url;
  }
  const webpKeys = sortNumericKeys(artwork.variants?.webp);
  if (webpKeys.length) {
    const url = artwork.variants?.webp?.[String(webpKeys[0])];
    if (url) return url;
  }
  return artwork.image;
};

const buildVariantSourceSet = (
  artwork: Artwork,
  format: keyof NonNullable<Artwork["variants"]>,
  widths: number[],
  fallbackQuality: number
) => {
  const map = artwork.variants?.[format];
  if (map) {
    const rows = widths.filter((w) => map[String(w)]).map((w) => `${map[String(w)]} ${w}w`);
    if (rows.length) return rows.join(", ");
  }
  if (!useProxy) return null;
  if (format === "avif" || format === "webp") {
    return buildSourceSet(artwork.image, widths, format, fallbackQuality);
  }
  return null;
};

// Layout constants (original)
const LAYOUT_LEFT_BASE = 420; // px, push the two-line layout block to the right
const LAYOUT_RIGHT_PAD = 0; // px, stick to the right edge
const META_SHIFT = 205; // px, horizontal shift to move metadata area right
const META_BASE_MARGIN = 8; // px, margin above metadata (raised closer to top)
const META_VERTICAL_PAD = 24; // px, extra vertical space to allow wrapping
const META_HOR_SCALE = 2 / 3; // shrink horizontal allocation to 2/3

// Room type for floor plan boxes
// Room/editor features removed for viewer design

interface ExhibitionModalProps {
  exhibition: ExhibitionItem;
  onClose: () => void;
  initialSelectedIndex?: number;
}

const ExhibitionModal: React.FC<ExhibitionModalProps> = ({ exhibition, onClose, initialSelectedIndex = 0 }) => {
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [initialized, setInitialized] = useState<boolean>(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(initialSelectedIndex);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'archive' | 'gallery' | 'panorama'>('archive');
  const panelRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const infoPanelRef = useRef<HTMLDivElement | null>(null);
  const didCenterRef = useRef(false);
  const blockHeightsRef = useRef<{ h: number } | null>(null);
  const relocateTimerRef = useRef<number | null>(null);
  const magnetTimerRef = useRef<number | null>(null);
  const seededRef = useRef(false);
  const [infoY, setInfoY] = useState<number>(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<{
    src: string;
    start: { left: number; top: number; width: number; height: number };
    target: { left: number; top: number; width: number; height: number };
    animate: boolean;
  } | null>(null);
  // Progressive image loading state (Step 1): main stage / panorama
  const [mainLoaded, setMainLoaded] = useState(false);
  const mainImgRef = useRef<HTMLImageElement | null>(null);
  const idleDecodeHandlesRef = useRef<number[]>([]);
  // Representative image (from local feed or exhibition data)
  const [repImage, setRepImage] = useState<string | null>(null);
  // Close guards
  const isActiveRef = useRef(true);
  const closeGuardRef = useRef(false);
  useEffect(() => {
    return () => { isActiveRef.current = false; };
  }, []);
  const clearModalFlag = () => {
    try {
      const st = { ...(window.history.state || {}) } as any;
      delete st.modal;
      delete st.exhibitionId;
      delete st.selectedIndex;
      window.history.replaceState(st, document.title);
    } catch {}
  };

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
  const FIXED_META_HEIGHT = 56; // px, lock meta row height to prevent layout shift
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
  // metaHeight locked; no state
  const [topBarHeight, setTopBarHeight] = useState<number>(36);
  const [metaMarginTop] = useState<number>(META_BASE_MARGIN);
  // description/positioning constants removed — layout now uses fixed left-top positions
  // Left positions now derive from metaPos.dimension
  // Vertical positions now follow the Archive line (top: 14)
  const stageMonitorRef = useRef<HTMLDivElement | null>(null);
  // Panorama drag state
  const [panoramaDragging, setPanoramaDragging] = useState(false);
  const panStartXRef = useRef<number>(0);
  const panStartIndexRef = useRef<number>(0);

  // Lock background scroll when modal is open
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // Load header image: prefer current artwork image, fallback to any local representativeImage
  useEffect(() => {
    let aborted = false;
    async function loadRep() {
      setRepImage(null);
      const preferItem = (exhibition as any)?.image && String((exhibition as any).image).trim();
      const localRep = (exhibition as any)?.representativeImage && String((exhibition as any).representativeImage).trim();
      const chosen = preferItem || localRep || null;
      if (!aborted && chosen) setRepImage(chosen);
    }
    loadRep();
    return () => { aborted = true; };
  }, [exhibition]);

  // Reset progressive state & load high-res when selected artwork changes
  useEffect(() => {
    const currentArt = (() => {
      if (!filteredArtworks.length) return null;
      return filteredArtworks[Math.min(selectedIndex, filteredArtworks.length - 1)];
    })();
    setMainLoaded(false);
    if (!currentArt || !currentArt.image) return;
    let cancelled = false;
    const hi = new Image();
    hi.decoding = 'async';
    hi.loading = 'eager';
    hi.src = currentArt.image;
    hi.onload = () => {
      if (cancelled) return;
      setMainLoaded(true);
      if (mainImgRef.current) {
        // Swap to full-res if still on low-res
        if (mainImgRef.current.getAttribute('data-hi') !== '1') {
          mainImgRef.current.src = currentArt.image;
          mainImgRef.current.setAttribute('data-hi','1');
        }
      }
    };
    hi.onerror = () => { if (!cancelled) setMainLoaded(true); };
    return () => { cancelled = true; };
  }, [selectedIndex, filteredArtworks]);

  // History integration: when modal opens we push a modal state so refresh keeps modal
  // and back navigation can restore the underlying detail panel instead of navigating away.
  const didHistoryInitRef = useRef(false);
  useEffect(() => {
    if (didHistoryInitRef.current) return; // StrictMode-safe: run once per mount
    didHistoryInitRef.current = true;
    // Save the current history state as underlying state (hash/scroll) then push modal state
    try {
      const underlying = {
        hash: window.location.hash,
        scrollY: window.scrollY,
      };
      // merge underlying into current state
      const base = Object.assign({}, window.history.state || {});
      base.underlying = underlying;
      // replace current entry with one that contains underlying metadata
      window.history.replaceState(base, document.title);

  // push modal-specific state once; avoid duplicates to prevent double-close requirement
  const current = (window.history.state as any) || {};
  const guardKey = `modalGuard_${exhibition.id}`;
  const alreadyModal = !!(current.modal && current.exhibitionId === exhibition.id);
  const alreadyPushed = sessionStorage.getItem(guardKey) === '1';
  if (!alreadyModal && !alreadyPushed) {
    const modalState = { ...current, modal: true, exhibitionId: exhibition.id, selectedIndex } as any;
    window.history.pushState(modalState, document.title);
    try { sessionStorage.setItem(guardKey, '1'); } catch {}
  }

  // No extra dispatch here; HomePage reads history.state on mount to auto-open

      const onPop = (_e: PopStateEvent) => {
        // Always treat back like close while modal is mounted
        try { onClose(); } catch { /* ignore */ }
      };

      window.addEventListener('popstate', onPop);
      return () => {
        window.removeEventListener('popstate', onPop);
  try { sessionStorage.removeItem(guardKey); } catch {}
      };
    } catch (e) {
      // ignore any history errors (some browsers restrict replaceState in certain navigations)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep selection reflected in history so forward/back updates selection
  useEffect(() => {
    try {
      const st = Object.assign({}, window.history.state || {});
      st.selectedIndex = selectedIndex;
      window.history.replaceState(st, document.title);
    } catch (e) {}
  }, [selectedIndex]);

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
      setInitialized(true);
      return () => {};
    }
    // 0) Prime from local cache immediately to avoid empty-state flash
    try {
      const cached = localStorage.getItem(`artworks_${exhibition.id}`);
      if (cached) {
        const cachedList = JSON.parse(cached) as Artwork[];
        const withImages = cachedList.filter(a => !!a.image);
        if (withImages.length > 0) {
          setArtworks(withImages);
          setInitialized(true);
        }
      }
    } catch {}
    // Subscribe to Firestore artworks for this exhibition
    const q = query(collection(db, "artworks"), where("exhibitionTitle", "==", exhibition.title));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Artwork[] = [];
        snap.forEach((ds) => {
          const data = ds.data() as Artwork;
          // Ensure stable id exists; fall back to Firestore doc.id if missing
          const id = (data as any)?.id ? String((data as any).id) : ds.id;
          list.push({ ...data, id });
        });
        // Server truth: set directly from snapshot to avoid duplicates
        const withImages = list.filter(a => !!a.image);
        setArtworks(withImages);
        setInitialized(true);
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
            setInitialized(true);
          } catch { setInitialized(true); }
        } else {
          setInitialized(true);
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

  // Prefetch neighbor images for smoother stage switching
  usePrefetchNeighbors(filteredArtworks as any[], selectedIndex, 1);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const supportsIdle = typeof (window as any).requestIdleCallback === 'function';
    const schedule: (cb: () => void) => number = supportsIdle
      ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 800 })
      : (cb) => window.setTimeout(cb, 200);
    const cancel: (handle: number) => void = typeof (window as any).cancelIdleCallback === 'function'
      ? (handle) => (window as any).cancelIdleCallback(handle)
      : (handle) => window.clearTimeout(handle);

    idleDecodeHandlesRef.current.forEach(cancel);
    idleDecodeHandlesRef.current = [];

    const neighbors = [selectedIndex - 1, selectedIndex + 1];
    const seen = new Set<string>();
    neighbors.forEach((idx) => {
      if (idx < 0 || idx >= filteredArtworks.length) return;
      const url = filteredArtworks[idx]?.image;
      if (!url || seen.has(url)) return;
      seen.add(url);
      const handle = schedule(() => {
        try {
          const preload = new Image();
          preload.decoding = 'async';
          preload.loading = 'eager';
          preload.src = url;
          if (preload.decode) preload.decode().catch(() => {});
        } catch {}
      });
      idleDecodeHandlesRef.current.push(handle);
    });

    return () => {
      idleDecodeHandlesRef.current.forEach(cancel);
      idleDecodeHandlesRef.current = [];
    };
  }, [filteredArtworks, selectedIndex]);

  // Static columns; no DOM measurement needed

  // Meta row height locked; skip dynamic measurement to avoid jitter

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
  const displayArtwork = useMemo(() => {
    if (viewMode === 'gallery') {
      if (hoveredIndex !== null && filteredArtworks[hoveredIndex]) {
        return filteredArtworks[hoveredIndex];
      }
      // No hover in gallery: show placeholders (—) by returning null
      return null as unknown as Artwork | null;
    }
    return current;
  }, [viewMode, hoveredIndex, current, filteredArtworks]);

  // Open animated lightbox from clicked image (Genie-like)
  const openLightbox = (e: React.MouseEvent<HTMLImageElement, MouseEvent>, src: string) => {
    const img = e.currentTarget;
    if (!img || !src) return;
    const rect = img.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxW = vw * 0.9;
    const maxH = vh * 0.9;
    // Use thumb aspect as an approximation
    const aspect = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 4 / 3;
    let targetW = maxW;
    let targetH = targetW / aspect;
    if (targetH > maxH) {
      targetH = maxH;
      targetW = targetH * aspect;
    }
    const targetLeft = Math.round((vw - targetW) / 2);
    const targetTop = Math.round((vh - targetH) / 2);
    setLightbox({
      src,
      start: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      target: { left: targetLeft, top: targetTop, width: targetW, height: targetH },
      animate: false,
    });
    // Next frame: trigger transition
    requestAnimationFrame(() => setLightbox((s) => (s ? { ...s, animate: true } : s)));
  };

  const closeLightbox = () => {
    setLightbox((s) => (s ? { ...s, animate: false } : s));
    window.setTimeout(() => setLightbox(null), 320);
  };

  // ESC to close lightbox
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') closeLightbox(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);
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

  // Shared layout values for room selector + info text
  // Treat panorama like gallery for selector layout/positioning
  const isGalleryLayout = (viewMode === 'gallery' || viewMode === 'panorama');
  // Archive: move noticeably into the gap but avoid overlapping metadata (150 .. 420)
  // Shift archive-specific UI left by 100px per request
  const selectorLeftArchive = 280; // original 380 -> 280
  const selectorLeft = isGalleryLayout ? 12 : selectorLeftArchive;
  const selectorTop = isGalleryLayout ? 8 : 2;
  // Selector sizing constants: separate archive vs gallery to allow tighter gallery spacing
  const SELECTOR_COL_WIDTH_ARCHIVE = 28; // px (archive mode column width)
  const SELECTOR_COL_GAP_ARCHIVE = 1; // px (archive mode gap)
  const SELECTOR_COL_WIDTH_GALLERY = 24; // px (gallery mode: slightly wider for readability)
  const SELECTOR_COL_GAP_GALLERY = 1; // px (gallery mode: small gap)
  // Default layout uses 5 columns; gallery mode uses 20 columns per your request
  const perRowCount = 5;
  const selectorCols = isGalleryLayout ? 20 : perRowCount;
  const SELECTOR_COL_WIDTH = isGalleryLayout ? SELECTOR_COL_WIDTH_GALLERY : SELECTOR_COL_WIDTH_ARCHIVE;
  const SELECTOR_COL_GAP = isGalleryLayout ? SELECTOR_COL_GAP_GALLERY : SELECTOR_COL_GAP_ARCHIVE;
  const selectorWidth = selectorCols * SELECTOR_COL_WIDTH + Math.max(0, selectorCols - 1) * SELECTOR_COL_GAP;
  // Info text X within the info panel should align visually to the selector's X
  // Keep info text inset inside the info panel to avoid clipping; align visually with selector
  const infoTextLeft = isGalleryLayout ? 4 : Math.max(12, selectorLeft - 150 + 12);

  // Compute selector data outside JSX and replace the problematic IIFE-based room selector block with simpler JSX using this data to fix the syntax error
  const selectorData = useMemo(() => {
    // Build a full numeric sequence rounded up to known max so empty rooms are shown as placeholders
    const rawNumericButtons = roomButtons.filter(b => b.id !== 'ALL' && /^\d+$/.test(b.id));
    const existingNums = rawNumericButtons.map(b => parseInt(b.id, 10));
    const maxExisting = existingNums.length ? Math.max(...existingNums) : 0;
    const KNOWN_MAX_ROOMS: Record<string, number> = { 'European Paintings': 66 };
    const KNOWN_EMPTY_ROOMS: Record<string, number[]> = { 'European Paintings': [1,3,13,47,48,49,50] };
    const exhibitKey = (exhibition.title || exhibition.name || '').trim();
    const exhibitKeyLower = exhibitKey.toLowerCase();
    const findMatch = (map: Record<string, any>) => {
      for (const k of Object.keys(map)) {
        const kl = k.toLowerCase();
        if (!kl) continue;
        if (exhibitKeyLower.includes(kl) || kl.includes(exhibitKeyLower)) return map[k];
      }
      return undefined;
    };
    const forcedMax = findMatch(KNOWN_MAX_ROOMS) ?? 0;
    const extraEmpty = (findMatch(KNOWN_EMPTY_ROOMS) ?? []).slice();
    const maxEmpty = extraEmpty.length ? Math.max(...extraEmpty) : 0;
    const maxNum = Math.max(maxExisting, forcedMax, maxEmpty);
    const nums: { id: string; label: string; exists: boolean }[] = Array.from({ length: Math.max(0, maxNum) }, (_, i) => {
      const n = i + 1;
      const exists = artworks.some(a => String(a.roomId || '').trim() === String(n));
      return { id: String(n), label: String(n), exists };
    });
    const central = roomButtons.find(b => b.id === 'C');
    if (central) nums.push({ id: central.id, label: central.label, exists: true });

    // Chunk for gallery rows of 20
    const rows: typeof nums[] = [];
    for (let i = 0; i < nums.length; i += 20) rows.push(nums.slice(i, i + 20));

    return { nums, rows };
  }, [artworks, roomButtons, exhibition.title, exhibition.name]);

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
  <div
      ref={panelRef}
      style={{
        position: "relative",
  backgroundColor: "#fff",
        width: "100%",
        height: "100%",
        padding: 0,
        borderRadius: 0,
  boxShadow: "0 12px 28px rgba(0,0,0,0.25)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        ...(DEBUG_LAYOUT ? { outline: "1px solid #f0f" } : {})
      }}
    >
        {/* Old handle removed; the corner is now curled by default and interactive via the invisible zone above */}
        {/* Absolute full-height thumbnail scroller at far left (archive mode only) */}
  {(viewMode === 'archive') && (
          <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 150, background: "transparent", zIndex: 1, display: 'flex', flexDirection: 'column', ...(DEBUG_LAYOUT ? { outline: "1px solid #964B00" } : {}) }}>
            {/* Left header: title + description + room selector */}
            <div style={{ padding: '8px 8px', borderBottom: '0px solid transparent' }}>
              {repImage && (
                <div style={{ width: '100%', marginBottom: 8, background: '#ddd', borderRadius: 4, overflow: 'hidden' }}>
                  <img
                    src={repImage}
                    alt={(exhibition.title || exhibition.name) + ' cover'}
                    style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'cover' }}
                    decoding="async"
                    loading="eager"
                    onError={() => setRepImage(null)}
                  />
                </div>
              )}
              <div
                ref={titleScrollRef}
                onMouseEnter={() => startTitleAutoScroll()}
                onMouseLeave={() => stopTitleAutoScroll(true)}
                style={{ fontSize: 12, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflowX: 'hidden', textOverflow: 'clip', cursor: 'default' }}
                title={exhibition.title || exhibition.name}
              >
                <span style={{ display: 'inline-block', paddingRight: 18 }}>{exhibition.title || exhibition.name}</span>
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 10,
                  color: '#666',
                  lineHeight: 1.4,
                  maxHeight: 72, // visible viewport
                  overflow: 'hidden',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget;
                  // if content overflows, animate vertical scroll up/down
                  const canScroll = el.scrollHeight > el.clientHeight + 2;
                  if (!canScroll) return;
                  // Prevent duplicate RAFs
                  if ((el as any)._raf) cancelAnimationFrame((el as any)._raf);
                  let dir = 1; // 1: down, -1: up
                  const maxScroll = el.scrollHeight - el.clientHeight;
                  let last = performance.now();
                  const speed = 18; // px per second
                  const step = (now: number) => {
                    const dt = Math.min(40, now - last);
                    last = now;
                    el.scrollTop += dir * (speed * (dt / 1000));
                    if (el.scrollTop <= 0) { el.scrollTop = 0; dir = 1; }
                    else if (el.scrollTop >= maxScroll) { el.scrollTop = maxScroll; dir = -1; }
                    (el as any)._raf = requestAnimationFrame(step);
                  };
                  (el as any)._raf = requestAnimationFrame(step);
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget;
                  if ((el as any)._raf) {
                    cancelAnimationFrame((el as any)._raf);
                    (el as any)._raf = 0;
                  }
                  // Smoothly return to top so the first lines are visible next time
                  el.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                {exhibition.description || `${(exhibition.title || exhibition.name)} — a short introduction to the exhibition.`}
              </div>
              {/* room selector removed from left header; rendered between title/meta instead */}
            </div>
            {/* Centered placeholder area in the left column when no artworks (archive only) */}
            {initialized && filteredArtworks.length === 0 && viewMode === 'archive' && (
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
            key={`${block}-${a.id || idx}`}
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
                              loading="lazy"
                              decoding="async"
                              fetchPriority="low"
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
          <span
            onClick={() => setViewMode('panorama')}
            style={{ position: "absolute", left: (metaPos.title), top: 14, fontSize: 12, lineHeight: 1, fontWeight: 700, color: viewMode === 'panorama' ? "#000" : "#333", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", textDecoration: viewMode === 'panorama' ? 'underline' : 'none', ...(DEBUG_LAYOUT ? { outline: "1px solid #fa0" } : {}) }}
          >
            PANORAMA
          </span>
          {/* Description: fixed narrow width, up to the close text on the right */}
          {/* Description moved to left column header; removed duplicate here */}
          {/* close button moved to absolute top-right */}
        </div>
    {/* Room selector: placed between top bar and meta row (chunked rows of 5) */}
  {/* Room selector: absolute so it doesn't push down the metadata; wraps when it runs out of width */}
          <div style={{ position: 'absolute', left: selectorLeft, top: selectorTop, width: selectorWidth, zIndex: 20 }}>
            {roomButtons.find(b => b.id === 'ALL') && (
              <div style={{ marginBottom: 2 }}>
                <button onClick={() => { setSelectedRoomId('ALL'); setSelectedIndex(0); }} style={{ padding: '4px 8px', fontSize: 11, borderRadius: 4, border: 'none', background: selectedRoomId === 'ALL' ? '#111' : 'transparent', color: selectedRoomId === 'ALL' ? '#fff' : '#222', cursor: 'pointer' }}>ALL</button>
              </div>
            )}
            <div style={{ width: '100%' }}>
              {isGalleryLayout ? (
                // Gallery mode: render rows of 20
                selectorData.rows.map((row, rIdx) => (
                  <div key={`row-${rIdx}`} style={{ display: 'grid', gridTemplateColumns: `repeat(${row.length}, ${SELECTOR_COL_WIDTH}px)`, columnGap: SELECTOR_COL_GAP, rowGap: 6, justifyContent: 'start', marginBottom: 4 }}>
                    {row.map((btn) => (
                      <button key={btn.id} onClick={() => { if (btn.exists) { setSelectedRoomId(btn.id); setSelectedIndex(0); } }} disabled={!btn.exists} style={{ width: '100%', height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontSize: 9.5, borderRadius: 3, border: btn.exists ? 'none' : '1px dashed rgba(0,0,0,0.18)', background: btn.exists ? (selectedRoomId === btn.id ? '#111' : 'transparent') : 'rgba(0,0,0,0.03)', color: btn.exists ? (selectedRoomId === btn.id ? '#fff' : '#222') : 'rgba(0,0,0,0.38)', opacity: btn.exists ? 1 : 0.75, cursor: btn.exists ? 'pointer' : 'default', boxSizing: 'border-box' }}>
                        {btn.label}
                      </button>
                    ))}
                  </div>
                ))
              ) : (
                // Archive mode: simple grid with fixed columns
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${perRowCount}, ${SELECTOR_COL_WIDTH}px)`, columnGap: SELECTOR_COL_GAP, rowGap: 1, justifyContent: 'start', width: '100%' }}>
                  {selectorData.nums.map((btn) => (
                    <button key={btn.id} onClick={() => { if (btn.exists) { setSelectedRoomId(btn.id); setSelectedIndex(0); } }} disabled={!btn.exists} style={{ width: '100%', height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontSize: 9.5, borderRadius: 3, border: btn.exists ? 'none' : '1px dashed #ccc', background: btn.exists ? (selectedRoomId === btn.id ? '#111' : 'transparent') : 'transparent', color: btn.exists ? (selectedRoomId === btn.id ? '#fff' : '#222') : '#bbb', cursor: btn.exists ? 'pointer' : 'default' }}>
                      {btn.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

    {/* Artwork meta info (below the top bar, aligned to Gallery/Archive; dynamic per selected artwork) */}
  {(viewMode === 'archive' || viewMode === 'gallery' || viewMode === 'panorama') && (
  <div ref={metaRowRef} style={{ position: "relative", padding: "12px 12px 0 0", marginLeft: (LAYOUT_LEFT_BASE + META_SHIFT), marginTop: metaMarginTop, marginRight: LAYOUT_RIGHT_PAD, minHeight: (FIXED_META_HEIGHT + META_VERTICAL_PAD), ...(DEBUG_LAYOUT ? { outline: "1px solid #f00" } : {}) }}>
          {(() => {
                    const titleText = displayArtwork?.name || "—";
                    const creatorText = displayArtwork?.artist || "—";
                    const dateText = displayArtwork?.date || (displayArtwork?.year ? String(displayArtwork.year) : "—");
                    const dimensionText = displayArtwork?.dimension || "—";
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
                  <div ref={metaTitleValueRef} style={{ fontSize: 12, color: "#222", fontWeight: 700, lineHeight: 1.3, whiteSpace: "normal", wordBreak: "break-word", overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', maxHeight: 36 }}>{titleText}</div>
                </div>
                {/* CREATOR (aligned under Gallery) */}
                <div ref={creatorRef} style={{ position: "absolute", left: metaPos.creator, top: 12, maxWidth: creatorW, ...(DEBUG_LAYOUT ? { outline: "1px dashed #6f6" } : {}) }}>
                  <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 4 }}>CREATOR</div>
                  <div style={{ fontSize: 12, color: "#222", lineHeight: 1.3, whiteSpace: "normal", wordBreak: "break-word", overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', maxHeight: 36 }}>{creatorText}</div>
                </div>
                {/* DATE (aligned under Archive) */}
                <div ref={dateRef} style={{ position: "absolute", left: metaPos.date, top: 12, maxWidth: dateW, ...(DEBUG_LAYOUT ? { outline: "1px dashed #66f" } : {}) }}>
                  <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 4 }}>DATE</div>
                  <div style={{ fontSize: 12, color: "#222", lineHeight: 1.3, whiteSpace: "normal", wordBreak: "break-word", overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', maxHeight: 36 }}>{dateText}</div>
                </div>
                {/* DIMENSION (to the right of DATE by the same gap) */}
                <div ref={dimensionRef} style={{ position: "absolute", left: metaPos.dimension, right: 0, top: 12, ...(DEBUG_LAYOUT ? { outline: "1px dashed #f6f" } : {}) }}>
                  <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 4 }}>DIMENSION</div>
                  <div style={{ fontSize: 12, color: "#222", lineHeight: 1.3, whiteSpace: "normal", wordBreak: "break-word", overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', maxHeight: 36 }}>{dimensionText}</div>
                </div>
              </>
            );
          })()}
  </div>
  )}

        {/* Textual close control at the top-right */}
        <button
          onClick={() => {
            // 한 번의 클릭으로 즉시 닫기 + 모달 플래그 제거
            if (closeGuardRef.current) return;
            clearModalFlag();
            closeGuardRef.current = true;
            onClose();
          }}
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
            {/* Constrain image so it won't overlap metadata/top rows (reserve ~260px) */}
            <div ref={stageMonitorRef} style={{ width: "72%", maxHeight: "calc(100vh - 260px)", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {current ? (
                (() => {
                  const widths = window.innerWidth < 900 ? [480, 720, 960] : [640, 960, 1280, 1600];
                  const avif = buildVariantSourceSet(current, 'avif', widths, 70);
                  const webp = buildVariantSourceSet(current, 'webp', widths, 75);
                  const sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 82vw, 75vw';
                  const lowSrc = pickLowPlaceholder(current);
                  return (
                    <picture>
                      {useProxy && avif && <source type="image/avif" srcSet={avif || undefined} sizes={sizes} />}
                      {useProxy && webp && <source type="image/webp" srcSet={webp || undefined} sizes={sizes} />}
                      <img
                        ref={mainImgRef}
                        src={lowSrc}
                        alt={current.name}
                        decoding="async"
                        fetchPriority="high"
                        data-hi={lowSrc === current.image ? '1' : '0'}
                        style={{
                          width: "auto",
                          maxWidth: "100%",
                          maxHeight: "calc(100vh - 260px)",
                          objectFit: "contain",
                          cursor: "zoom-in",
                          display: "block",
                          filter: mainLoaded ? 'none' : 'blur(14px)',
                          transition: 'filter 420ms ease, opacity 420ms ease',
                          opacity: mainLoaded ? 1 : 0.88,
                          background: '#f5f5f5'
                        }}
                        onClick={(e) => openLightbox(e, current.image || "")}
                        onLoad={(e) => {
                          // If placeholder was already hi-res, mark loaded
                          if ((e.currentTarget.getAttribute('data-hi') === '1') && !mainLoaded) {
                            setMainLoaded(true);
                          }
                        }}
                      />
                    </picture>
                  );
                })()
              ) : (
                <div style={{ color: "#bbb", margin: "auto" }}>No image</div>
              )}
            </div>
          </div>
        </>
  ) : viewMode === 'gallery' ? (
        // Gallery grid mode
  <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', paddingLeft: 0 }}>
            {(() => {
              const items: Artwork[] = filteredArtworks;
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 64, padding: '192px 48px 96px 150px' }}>
                  {items.map((a, idx) => (
                    <div 
                      key={a.id ?? `${idx}`} 
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
                    >
                      <div
                        style={{ width: '60%', background: '#eee', borderRadius: 0 }}
                        onMouseEnter={() => setHoveredIndex(idx)}
                        onMouseLeave={() => setHoveredIndex(null)}
                      >
                        {a.image && (() => {
                          const widths = window.innerWidth < 900 ? [320, 480, 640] : [360, 540, 720, 900];
                          const avif = buildVariantSourceSet(a, 'avif', widths, 65);
                          const webp = buildVariantSourceSet(a, 'webp', widths, 70);
                          const sizes = '(max-width: 640px) 90vw, (max-width: 1024px) 55vw, 40vw';
                          const preview = pickLowPlaceholder(a);
                          return (
                            <picture>
                              {useProxy && avif && <source type="image/avif" srcSet={avif || undefined} sizes={sizes} />}
                              {useProxy && webp && <source type="image/webp" srcSet={webp || undefined} sizes={sizes} />}
                              <img
                                src={preview}
                                data-full={a.image}
                                alt={a.name}
                                loading="lazy"
                                decoding="async"
                                fetchPriority="low"
                                style={{ width: '100%', height: 'auto', display: 'block', cursor: 'zoom-in' }}
                                onClick={(e) => openLightbox(e, a.image || "")}
                              />
                            </picture>
                          );
                        })()}
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
      ) : (
        // Panorama mode
  <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: panoramaDragging ? 'none' : 'auto', cursor: 'ew-resize', touchAction: 'none' }}
          onMouseDown={(e) => {
            e.preventDefault();
            if (filteredArtworks.length === 0) return;
            setPanoramaDragging(true);
            panStartXRef.current = e.clientX;
            panStartIndexRef.current = selectedIndex;
            const onMove = (ev: MouseEvent) => {
              const dx = ev.clientX - panStartXRef.current;
              const n = Math.max(1, filteredArtworks.length);
              const pxPerImage = Math.max(12, Math.min(160, 480 / n));
              const delta = Math.round(-dx / pxPerImage);
              const next = Math.max(0, Math.min(n - 1, panStartIndexRef.current + delta));
              setSelectedIndex(next);
            };
            const onUp = () => {
              setPanoramaDragging(false);
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          }}
          onTouchStart={(e) => {
            if (filteredArtworks.length === 0) return;
            const t = e.touches[0];
            setPanoramaDragging(true);
            panStartXRef.current = t.clientX;
            panStartIndexRef.current = selectedIndex;
          }}
          onTouchMove={(e) => {
            if (!panoramaDragging) return;
            const t = e.touches[0];
            const dx = t.clientX - panStartXRef.current;
            const n = Math.max(1, filteredArtworks.length);
            const pxPerImage = Math.max(12, Math.min(160, 480 / n));
            const delta = Math.round(-dx / pxPerImage);
            const next = Math.max(0, Math.min(n - 1, panStartIndexRef.current + delta));
            setSelectedIndex(next);
          }}
          onTouchEnd={() => setPanoramaDragging(false)}
        >
          {current ? (
            (() => {
              const widths = window.innerWidth < 900 ? [800, 1200] : [960, 1280, 1600, 1920];
              const avif = buildVariantSourceSet(current, 'avif', widths, 70);
              const webp = buildVariantSourceSet(current, 'webp', widths, 75);
              const sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 95vw, 90vw';
              const lowSrc = pickLowPlaceholder(current);
              return (
                <picture>
                  {useProxy && avif && <source type="image/avif" srcSet={avif || undefined} sizes={sizes} />}
                  {useProxy && webp && <source type="image/webp" srcSet={webp || undefined} sizes={sizes} />}
                  <img
                    ref={mainImgRef}
                    src={lowSrc}
                    alt={current.name}
                    decoding="async"
                    fetchPriority="high"
                    draggable={false}
                    data-hi={lowSrc === current.image ? '1' : '0'}
                    style={{
                      width: 'auto',
                      maxWidth: '92%',
                      maxHeight: 'calc(100vh - 200px)',
                      objectFit: 'contain',
                      display: 'block',
                      filter: mainLoaded ? 'none' : 'blur(14px)',
                      transition: 'filter 420ms ease, opacity 420ms ease',
                      opacity: mainLoaded ? 1 : 0.88,
                      background: '#111'
                    }}
                  />
                </picture>
              );
            })()
          ) : (
            <div style={{ color: '#bbb', margin: 'auto' }}>No image</div>
          )}
        </div>
      )}
        </div>
      </div>

      {/* Animated lightbox (Genie-like) */}
      {lightbox && (
        <div
          onClick={closeLightbox}
          style={{
            position: 'fixed',
            inset: 0,
            background: lightbox.animate ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0)',
            transition: 'background 300ms ease',
            zIndex: 11000,
          }}
        >
          <div
            style={{
              position: 'fixed',
              left: 0,
              top: 0,
              width: lightbox.target.width,
              height: lightbox.target.height,
              transformOrigin: 'top left',
              transform: lightbox.animate
                ? `translate(${lightbox.target.left}px, ${lightbox.target.top}px) scale(1, 1)`
                : `translate(${lightbox.start.left}px, ${lightbox.start.top}px) scale(${Math.max(0.01, lightbox.start.width / Math.max(1, lightbox.target.width))}, ${Math.max(0.01, lightbox.start.height / Math.max(1, lightbox.target.height))})`,
              transition: 'transform 320ms cubic-bezier(0.22, 0.61, 0.36, 1), clip-path 320ms ease, -webkit-clip-path 320ms ease',
              boxShadow: lightbox.animate ? '0 24px 64px rgba(0,0,0,0.5)' : '0 0 0 rgba(0,0,0,0)',
              borderRadius: lightbox.animate ? 8 : 0,
              overflow: 'hidden',
              background: '#000',
              // Genie/funnel mask: start from a narrow neck shape, expand to full rectangle
              clipPath: lightbox.animate
                ? 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)'
                : 'polygon(48% 0%, 52% 0%, 80% 20%, 95% 60%, 100% 100%, 0% 100%, 5% 60%, 20% 20%)',
              WebkitClipPath: lightbox.animate
                ? 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)'
                : 'polygon(48% 0%, 52% 0%, 80% 20%, 95% 60%, 100% 100%, 0% 100%, 5% 60%, 20% 20%)',
              willChange: 'transform, clip-path',
            }}
          >
            <img
              src={lightbox.src}
              alt="Artwork"
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#000' }}
              draggable={false}
            />
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