import type { ExhibitionItem } from "../types/Exhibition";
import type { Artwork } from "../types/Artwork";
import { useState, useEffect, useRef } from "react";
import { addDoc, collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";

// Room type for floor plan boxes
// Room/editor features removed for viewer design

interface ExhibitionModalProps {
  exhibition: ExhibitionItem;
  onClose: () => void;
  // Add other props as needed
}

const ExhibitionModal = ({ exhibition, onClose }: ExhibitionModalProps) => {
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [showImageModal, setShowImageModal] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const infoPanelRef = useRef<HTMLDivElement | null>(null);
  const seededRef = useRef(false);
  const didCenterRef = useRef(false);
  const blockHeightsRef = useRef<{ h: number } | null>(null);
  const relocateTimerRef = useRef<number | null>(null);
  const [infoY, setInfoY] = useState<number>(0);

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

  // Viewer mode only; editing/upload removed

  const current = artworks[selectedIndex];

  // Sync selected index to the thumbnail nearest the vertical center on scroll (looped list)
  useEffect(() => {
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
        for (const node of nodes) {
          const r = node.getBoundingClientRect();
          const mid = r.top + r.height / 2;
          const d = Math.abs(mid - centerY);
          if (d < bestDist) { bestDist = d; nearestBase = parseInt(node.dataset.base || '0', 10); }
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
    };
  }, [artworks]);

  // Center to middle block initially so we can scroll infinitely
  useEffect(() => {
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
  }, [artworks.length]);

  // Forward wheel from the whole modal panel to the filmstrip when not hovering it
  useEffect(() => {
    const panel = panelRef.current;
    const scroller = listRef.current;
    if (!panel || !scroller) return;
    const onWheel = (e: WheelEvent) => {
      if (!scroller) return;
      // If the wheel originated inside the scroller, let native scroll handle it
      if (scroller.contains(e.target as Node)) return;
      // Otherwise, route the wheel delta to the scroller to drive image navigation
      e.preventDefault();
      scroller.scrollBy({ top: e.deltaY, behavior: 'auto' });
    };
    panel.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      panel.removeEventListener('wheel', onWheel as any);
    };
  }, [artworks.length]);

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
  <div ref={panelRef} style={{ position: "relative", backgroundColor: "#fff", width: "72%", height: "88%", padding: 0, borderRadius: 0, boxShadow: "0 8px 24px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Top bar: single title + right-aligned description; no dividing line */}
        <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 12, width: 220, minWidth: 220, textAlign: "center", marginLeft: -20 }}>
            {exhibition.title || exhibition.name}
          </div>
          <div style={{ marginLeft: "auto", marginRight: "4%", color: "#666", fontSize: 12, lineHeight: 1.4, width: "12%", maxWidth: "12%", textAlign: "left", wordBreak: "break-word", overflowWrap: "anywhere" }}>
            {exhibition.description || `${(exhibition.title || exhibition.name)}에 대한 간략한 소개입니다. 주요 소장품과 전시 맥락을 통해 작품의 미감을 자연스럽게 경험할 수 있도록 구성했습니다.`}
          </div>
          {/* close button moved to absolute top-right */}
        </div>

        {/* Absolute small close button at the top-right */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, border: "1px solid #ddd", background: "#fff", color: "#333", borderRadius: 0, cursor: "pointer", display: "grid", placeItems: "center", lineHeight: 1, fontSize: 12 }}
        >
          ✕
        </button>

        {/* Content area: left filmstrip + right stage */}
  <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          {/* Left vertical thumbnails scroller */}
          <div style={{ width: 220, position: "relative", background: "#fff" }}>
            <div
              ref={listRef}
              className="no-scrollbar"
              style={{ position: "absolute", inset: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "16px 12px", overscrollBehavior: "contain", msOverflowStyle: "none", scrollbarWidth: "none", scrollSnapType: "y proximity", scrollPaddingTop: "50%", scrollPaddingBottom: "50%" }}
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
      <div style={{ flex: 1, position: "relative", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {current ? (
        <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "6% 1.2% 3.5% 1.2%" }}>
                <img
                  src={current.image}
                  alt={current.name}
          style={{ maxWidth: "92%", maxHeight: "92%", objectFit: "contain", cursor: "zoom-in" }}
                  onClick={() => setShowImageModal(current.image || null)}
                />
              </div>
            ) : (
              <div style={{ color: "#777" }}>No image</div>
            )}
          </div>
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
            <img src={showImageModal} alt="Artwork" style={{ width: "100%", height: "auto" }} />
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