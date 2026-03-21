import React, { useEffect, useRef, useState, Suspense, lazy, useMemo, useCallback } from "react";
import { useSearchParams, useNavigate, useLocation, useParams } from "react-router-dom";

// D3GeoGlobeSimplified disabled — Drawing Map is the default entry point
// const D3GeoGlobeSimplified = React.lazy(() => import("../components/D3GeoGlobeSimplified"));
import DrawingGlobe from "../components/DrawingGlobe";

import ExhibitionDetails from "../components/ExhibitionDetails";

import type { SearchableArtwork } from "../components/GlobalSearchBar";
// Filled Globe temporarily hidden
// Removed react-globe.gl Outline mode
// Heavy globe modes removed for performance on homepage
// Removed LeafletInteractiveMap import
import type { Exhibition, ExhibitionItem } from "../types/Exhibition";
const InteractiveGlobeMap = React.lazy(() => import("../components/InteractiveGlobeMap/InteractiveGlobeMap"));

const ExhibitionModal = lazy(() => import("../components/ExhibitionModal"));


import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp, getDocs } from "firebase/firestore";
import { shouldLimitNetwork } from "../utils/network";
import { ArtworkLightbox } from "../components/ArtworkLightbox";
import { GlobalNav } from "../components/GlobalNav";


// Admin email whitelist
const ADMIN_EMAILS = ['kietzland@gmail.com'];

type HomePageProps = {
  exhibitions: Exhibition[];
  isOverlayOpen?: boolean;
};

const normalizeToken = (value?: string) => (value || "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[^a-z0-9]+/g, "");

const collectExhibitionTokens = (entry?: ExhibitionItem | null) => {
  const tokens = new Set<string>();
  const addToken = (value?: string | null) => {
    const token = normalizeToken(value || "");
    if (token) tokens.add(token);
  };
  if (!entry) return tokens;
  addToken(entry.id as string);
  addToken((entry as any)?.slug);
  addToken((entry as any)?.collectionId);
  addToken(entry.name as string);
  addToken(entry.title as string);
  const file = (entry as any)?.collectionFile;
  if (typeof file === 'string') addToken(file.replace(/\.json$/i, ''));
  const aliases = (entry as any)?.aliases;
  if (Array.isArray(aliases)) aliases.forEach(alias => addToken(alias));
  return tokens;
};

export default function HomePage({ exhibitions, isOverlayOpen = false }: HomePageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { collectionId } = useParams<{ collectionId?: string }>();
  // Compute initial modal/detail state from history synchronously to avoid first-paint flicker
  const initialFromHistory = (() => {
    if (typeof window === 'undefined') return { item: null as ExhibitionItem | null, parent: null as Exhibition | null };
    try {
      const st = (window.history.state || {}) as any;
      if (st && st.modal && st.exhibitionId) {
        for (const ex of exhibitions) {
          const items = (ex as any).permanentExhibitions || [];
          if (Array.isArray(items)) {
            const hit = items.find((it: any) => it && (it.id === st.exhibitionId));
            if (hit) return { item: hit as ExhibitionItem, parent: ex };
          }
        }
      }
    } catch { }
    return { item: null as ExhibitionItem | null, parent: null as Exhibition | null };
  })();
  // Approximate dark green used on the map style (adjust if needed)
  const MAP_DARK_GREEN = "#0B3D02";
  const [toggleOnColor, setToggleOnColor] = useState<string>(() => {
    try {
      return localStorage.getItem('toggleOnColor') || MAP_DARK_GREEN;
    } catch {
      return MAP_DARK_GREEN;
    }
  });
  const [selectedExhibition, setSelectedExhibition] = useState<Exhibition | null>(initialFromHistory.parent);
  const [selectedModalExhibition, setSelectedModalExhibition] = useState<ExhibitionItem | null>(initialFromHistory.item);
  const [showInteractiveGlobe, setShowInteractiveGlobe] = useState(() => {
    // /collection/:id로 이동할 때 fromInteractiveMap state가 있으면 인터랙티브맵 자동 열기
    try { return !!(window.history.state?.usr?.fromInteractiveMap); } catch { return false; }
  });
  const [showDrawingGlobe, setShowDrawingGlobe] = useState(() => {
    // Always show drawing globe by default unless returning from interactive map
    const fromInteractive = !!(window.history.state?.usr?.fromInteractiveMap);
    const fromDrawingParam = new URLSearchParams(window.location.search).get('drawingMap') === 'true';
    return fromDrawingParam || !fromInteractive;
  });

  // Dispatch map mode event whenever the active map changes
  useEffect(() => {
    const mode = showDrawingGlobe ? 'drawing' : showInteractiveGlobe ? 'interactive' : 'default';
    window.dispatchEvent(new CustomEvent('map-mode-changed', { detail: mode }));
  }, [showDrawingGlobe, showInteractiveGlobe]);

  // Dark / light mode for home globe (persisted in localStorage)
  const [homeIsDark, setHomeIsDark] = useState<boolean>(() => {
    try { return localStorage.getItem('homeTheme') !== 'light'; } catch { return true; }
  });
  const toggleHomeTheme = () => {
    setHomeIsDark(v => {
      const next = !v;
      try { localStorage.setItem('homeTheme', next ? 'dark' : 'light'); } catch { }
      // Notify GlobalNav and other components that listen for theme changes
      window.dispatchEvent(new CustomEvent('theme-changed'));
      return next;
    });
  };


  // Removed Outline Globe toggle
  // D3 globe is the only globe mode when Globe is ON
  // Globe view uses react-globe.gl only (Cesium removed)
  // Hide the banner on a user's very first visit; remember preference afterwards

  // userLocation and resetZoomKey removed - My location button was removed
  const lastFlowIdRef = useRef<string | null>(null);
  // URL param handling for exhibition navigation from MyPage
  const [searchParams, setSearchParams] = useSearchParams();
  // Header reveal toggle state
  const [headerOn, setHeaderOn] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [dragPos, setDragPos] = useState(0); // 0..MAX range
  // Admin check
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<any>(null);
  // Separate Lightbox State for Fallback
  const [lightboxArtwork, setLightboxArtwork] = useState<any>(null);
  const [likedArtworks, setLikedArtworks] = useState<any[]>([]);
  const isNetworkConstrained = shouldLimitNetwork();

  useEffect(() => {
    let unsubLikes: (() => void) | null = null;
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAdmin(!!(u && ADMIN_EMAILS.includes(u.email || '')));
      if (unsubLikes) {
        unsubLikes();
        unsubLikes = null;
      }
      if (u) {
        if (isNetworkConstrained) {
          getDocs(collection(db, `users/${u.uid}/liked_artworks`)).then((snap) => {
            const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
            setLikedArtworks(list);
          }).catch(() => {
            setLikedArtworks([]);
          });
          return;
        }
        // Listen to likes
        unsubLikes = onSnapshot(collection(db, `users/${u.uid}/liked_artworks`), (snap) => {
          const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
          setLikedArtworks(list);
        });
      } else {
        setLikedArtworks([]);
      }
    });
    return () => {
      if (unsubLikes) unsubLikes();
      unsub();
    };
  }, [isNetworkConstrained]);
  // removed pulse to keep a single, smooth grow animation
  const trackRef = useRef<HTMLDivElement | null>(null);
  const KNOB_SIZE = 24; // px
  const TRACK_H = 28; // px
  const TRACK_W = 54; // px
  const TRACK_PAD = 2; // px
  const MAX_POS = TRACK_W - KNOB_SIZE - TRACK_PAD * 2; // slide range
  const KNOB_SLIDE_MS = 240; // fast slide duration
  const [scaleActive, setScaleActive] = useState(false); // trigger grow after slide completes

  // Tag body to apply homepage-specific font
  useEffect(() => {
    document.body.setAttribute('data-home', 'true');
    return () => { document.body.removeAttribute('data-home'); };
  }, []);

  // Sync dragPos to state when headerOn changes (if not actively dragging)
  useEffect(() => {
    if (!dragActive) setDragPos(headerOn ? MAX_POS : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headerOn]);

  // Pointer handlers for sliding knob
  useEffect(() => {
    if (!dragActive) return;
    let startX = 0;
    let base = dragPos;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = (e as TouchEvent).touches?.[0]?.clientX ?? (e as MouseEvent).clientX;
      if (startX === 0) return;
      const delta = clientX - startX;
      const next = Math.max(0, Math.min(MAX_POS, base + delta));
      setDragPos(next);
    };
    const onUp = () => {
      setDragActive(false);
      const turnedOn = dragPos > MAX_POS / 2;
      setHeaderOn(turnedOn);
      window.removeEventListener("mousemove", onMove as any);
      window.removeEventListener("touchmove", onMove as any);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
    const onDown = (e: MouseEvent | TouchEvent) => {
      // initialize startX when first move occurs
      const clientX = (e as TouchEvent).touches?.[0]?.clientX ?? (e as MouseEvent).clientX;
      startX = clientX;
      base = dragPos;
    };
    window.addEventListener("mousemove", onMove as any);
    window.addEventListener("touchmove", onMove as any, { passive: false });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    window.addEventListener("mousedown", onDown as any, { once: true });
    window.addEventListener("touchstart", onDown as any, { once: true });
    return () => {
      window.removeEventListener("mousemove", onMove as any);
      window.removeEventListener("touchmove", onMove as any);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragActive]);

  const collectionIndex = useMemo(() => {
    const map = new Map<string, { museum: Exhibition; exhibition: ExhibitionItem }>();
    const register = (museum: Exhibition, entry?: ExhibitionItem) => {
      if (!entry) return;
      const tokens = collectExhibitionTokens(entry);
      if (tokens.size === 0) return;
      tokens.forEach((token) => {
        if (!map.has(token)) {
          map.set(token, { museum, exhibition: entry });
        }
      });
    };
    exhibitions.forEach((ex) => {
      ((ex as any).permanentExhibitions || []).forEach((entry: ExhibitionItem) => register(ex, entry));
      ((ex as any).temporaryExhibitions || []).forEach((entry: ExhibitionItem) => register(ex, entry));
      ((ex as any).pastExhibitions || []).forEach((entry: ExhibitionItem) => register(ex, entry));
    });
    return map;
  }, [exhibitions]);

  const getCollectionEntry = useCallback((collectionId?: string | null) => {
    if (!collectionId) return null;
    const token = normalizeToken(collectionId);
    if (!token) return null;
    const cached = collectionIndex.get(token);
    if (cached) return cached;

    for (const museum of exhibitions) {
      const buckets = [
        ...((museum as any).permanentExhibitions || []),
        ...((museum as any).temporaryExhibitions || []),
        ...((museum as any).pastExhibitions || []),
      ];
      for (const entry of buckets) {
        const tokens = collectExhibitionTokens(entry);
        if (tokens.has(token)) {
          console.warn('[collection-index] late-resolved entry', collectionId);
          return { museum, exhibition: entry as ExhibitionItem };
        }
      }
    }

    console.warn('[collection-index] missing entry', collectionId);
    return null;
  }, [collectionIndex, exhibitions]);

  const guessCollectionFromArtwork = useCallback((artwork?: SearchableArtwork | null) => {
    if (!artwork) return null;
    const candidates = new Set<string>();
    if (artwork.exhibitionId) candidates.add(artwork.exhibitionId);
    if (artwork.id) {
      const parts = artwork.id.split(/[-_]/);
      for (let len = parts.length; len > 1; len--) {
        candidates.add(parts.slice(0, len).join("-"));
      }
    }
    for (const candidate of candidates) {
      const entry = getCollectionEntry(candidate);
      if (entry) return entry;
    }
    return null;
  }, [getCollectionEntry]);

  const openCollectionModal = useCallback((collectionId?: string | null, artwork?: SearchableArtwork | null, opts?: { skipNavigate?: boolean; replace?: boolean }) => {
    const entry = getCollectionEntry(collectionId || undefined);
    if (!entry) return false;
    setSelectedExhibition(entry.museum);
    setSelectedModalExhibition({
      ...entry.exhibition,
      initialArtwork: artwork || undefined,
    } as ExhibitionItem & { initialArtwork?: SearchableArtwork });
    if (!opts?.skipNavigate) {
      const target = `/collection/${encodeURIComponent(entry.exhibition.id)}`;
      if (location.pathname !== target) {
        navigate(target, { replace: !!opts?.replace });
      }
    }
    return true;
  }, [getCollectionEntry, location.pathname, navigate]);

  const closeCollectionModal = useCallback(() => {
    setSelectedModalExhibition(null);
    if (location.pathname.startsWith('/collection/')) {
      navigate('/', { replace: true });
    }
  }, [location.pathname, navigate]);

  // Handle exhibition URL params from MyPage navigation
  useEffect(() => {
    const exhibitionId = searchParams.get('exhibition');
    if (exhibitionId) {
      const decodedId = decodeURIComponent(exhibitionId);

      // Find the exhibition item and its parent museum
      for (const ex of exhibitions) {
        // Check permanent exhibitions
        const permItems = (ex as any).permanentExhibitions || [];
        const permHit = permItems.find((it: any) => it && it.id === decodedId);
        if (permHit) {
          openCollectionModal(permHit.id, null);
          setSearchParams({}); // Clear param after handling
          sessionStorage.removeItem('pendingExhibition');
          return;
        }
        // Check temporary exhibitions
        const tempItems = (ex as any).temporaryExhibitions || [];
        const tempHit = tempItems.find((it: any) => it && it.id === decodedId);
        if (tempHit) {
          openCollectionModal(tempHit.id, null);
          setSearchParams({});
          sessionStorage.removeItem('pendingExhibition');
          return;
        }
        // Check past exhibitions
        const pastItems = (ex as any).pastExhibitions || [];
        const pastHit = pastItems.find((it: any) => it && it.id === decodedId);
        if (pastHit) {
          openCollectionModal(pastHit.id, null);
          setSearchParams({});
          sessionStorage.removeItem('pendingExhibition');
          return;
        }
      }

      // If not found in exhibitions, try to use data from sessionStorage
      const pendingData = sessionStorage.getItem('pendingExhibition');
      if (pendingData) {
        try {
          const exhibitionData = JSON.parse(pendingData);
          // Create a minimal exhibition object for the modal
          const minimalExhibition = {
            id: exhibitionData.id,
            name: exhibitionData.name,
            title: exhibitionData.name,
            image: exhibitionData.image,
            description: '',
            startDate: '',
            endDate: '',
          };
          // Find the parent museum by name if available
          const parentMuseum = exhibitions.find((ex: any) =>
            ex.name === exhibitionData.museumName
          );
          if (parentMuseum) {
            setSelectedExhibition(parentMuseum);
          }
          setSelectedModalExhibition(minimalExhibition as any);
          setSearchParams({});
          sessionStorage.removeItem('pendingExhibition');
        } catch (e) {
          console.error('Failed to parse pending exhibition data', e);
          setSearchParams({});
        }
      } else {
        // Clear the param if we can't find the exhibition
        setSearchParams({});
      }
    }
  }, [searchParams, exhibitions, setSearchParams, openCollectionModal]);

  // Handle ?selectMuseum=ID for direct navigation to museum pin
  useEffect(() => {
    const museumId = searchParams.get('selectMuseum');
    if (museumId) {
      const museum = exhibitions.find(e => e.id === museumId);
      if (museum) {
        setSelectedExhibition(museum);
        setSelectedModalExhibition(null);
      }
      // Remove the param without removing other potential params (though usually this navigation is exclusive)
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('selectMuseum');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, exhibitions, setSearchParams]);

  // Open/close collection modal based on route
  useEffect(() => {
    if (!collectionId) {
      setSelectedModalExhibition(null);
      return;
    }
    const decodedId = decodeURIComponent(collectionId);
    openCollectionModal(decodedId, null, { skipNavigate: true, replace: true });
  }, [collectionId, openCollectionModal]);
  // One-shot Flow is handled directly in the Flow button onClick

  // Control Navbar visibility via CSS var
  useEffect(() => {
    const root = document.documentElement;
    // ensure hidden on first render (no white bar)
    root.style.setProperty('--navbar-translateY', headerOn ? 'translateY(0)' : 'translateY(-100%)');
    // sequence grow after fast knob slide on ON
    let scaleTimer: number | undefined;
    if (headerOn) {
      // grow after knob slides to the right
      if (scaleTimer) window.clearTimeout(scaleTimer);
      scaleTimer = window.setTimeout(() => setScaleActive(true), KNOB_SLIDE_MS + 40);
    } else {
      // shrink after knob slides back to the left
      if (scaleTimer) window.clearTimeout(scaleTimer);
      scaleTimer = window.setTimeout(() => setScaleActive(false), KNOB_SLIDE_MS + 40);
    }
    // notify Navbar for per-element animations
    try {
      window.dispatchEvent(new CustomEvent('header-toggle', { detail: { on: headerOn } }));
    } catch { }
    return () => {
      // restore default when leaving page
      root.style.setProperty('--navbar-translateY', 'translateY(0)');
      if (scaleTimer) window.clearTimeout(scaleTimer);
    };
  }, [headerOn]);

  // Auto-open modal after refresh if history.state indicates a modal was open.
  useEffect(() => {
    const openFromHistory = () => {
      try {
        const st = (window.history.state || {}) as any;
        if (st && st.modal && st.exhibitionId) {
          // find the ExhibitionItem by id across all exhibitions
          let foundItem: ExhibitionItem | null = null;
          let parent: Exhibition | null = null;
          for (const ex of exhibitions) {
            const items = (ex as any).permanentExhibitions || [];
            if (Array.isArray(items)) {
              const hit = items.find((it: any) => it && (it.id === st.exhibitionId));
              if (hit) { foundItem = hit; parent = ex; break; }
            }
          }
          if (foundItem) {
            // Open underlying details (right panel) and the modal on top
            // Avoid overriding if already set from initial state
            setSelectedExhibition(prev => prev ?? parent);
            setSelectedModalExhibition(prev => prev ?? foundItem);
          }
        }
      } catch { }
    };

    // If not already seeded from initial state, attempt once on mount
    if (!selectedModalExhibition) openFromHistory();

    const onLoadedWithModal = () => openFromHistory();
    window.addEventListener('exhibitionModal:loadedWithModal', onLoadedWithModal as any);
    return () => {
      window.removeEventListener('exhibitionModal:loadedWithModal', onLoadedWithModal as any);
    };
  }, [exhibitions, selectedModalExhibition]);

  const handleToggleLike = async (_e: any, art: any) => {
    if (!user) {
      // Silent fail or prompt
      return;
    }
    const id = art.artworkId || art.id;
    const isLiked = likedArtworks.some(a => (a.artworkId || a.id) === id);
    const ref = doc(db, `users/${user.uid}/liked_artworks/${id}`);

    if (isLiked) {
      await deleteDoc(ref);
    } else {
      await setDoc(ref, {
        ...art,
        likedAt: serverTimestamp(),
        artist: art.artist || 'Unknown'
      });
    }
  };

  return (
    <>
      <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
        {/* Toggle hidden per user request */}
        <div style={{ position: "fixed", top: 12, left: 12, zIndex: 4500, display: 'none' }}>
          <div
            ref={trackRef}
            onClick={() => !dragActive && setHeaderOn(v => !v)}
            onContextMenu={async (e) => {
              e.preventDefault();
              try {
                const EyeDropperCtor = (window as any).EyeDropper;
                if (!EyeDropperCtor) {
                  alert('This browser does not support EyeDropper. Please use a recent Chromium-based browser.');
                  return;
                }
                const eyeDropper = new EyeDropperCtor();
                const res = await eyeDropper.open();
                if (res && res.sRGBHex) {
                  setToggleOnColor(res.sRGBHex);
                  try { localStorage.setItem('toggleOnColor', res.sRGBHex); } catch { }
                }
              } catch (err) {
                // silently ignore cancellation
                console.warn('EyeDropper cancelled or failed', err);
              }
            }}
            style={{
              width: TRACK_W,
              height: TRACK_H,
              borderRadius: TRACK_H / 2,
              background: headerOn || dragPos > MAX_POS / 2 ? toggleOnColor : "#d1d5db",
              position: "relative",
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)",
              cursor: "pointer",
              // single smooth grow/shrink (starts after knob slide completes)
              transition: dragActive ? "none" : "background-color 220ms ease, transform 1200ms ease-in-out",
              transform: scaleActive ? 'scale(3.2)' : 'scale(1)',
              transformOrigin: 'left top',
              willChange: 'transform',
              userSelect: "none",
            }}
          >
            <div
              role="button"
              aria-label="Reveal header"
              onMouseDown={(e) => { e.preventDefault(); setDragActive(true); }}
              onTouchStart={(e) => { e.preventDefault(); setDragActive(true); }}
              style={{
                position: "absolute",
                top: TRACK_PAD,
                left: TRACK_PAD + dragPos,
                width: KNOB_SIZE,
                height: KNOB_SIZE,
                borderRadius: "50%",
                background: "#fff",
                boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
                // fast slide first
                transition: dragActive ? "none" : `left ${KNOB_SLIDE_MS}ms ease-out`,
                transform: 'scale(1)',
                transformOrigin: 'left top',
                touchAction: "none",
              }}
            />
          </div>
        </div>
        {/* Fullscreen map */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            zIndex: 1,
            touchAction: 'none',
            overflow: 'hidden'
          }}
        >
          {/* D3GeoGlobeSimplified intentionally disabled — Drawing Map is the default entry */}
          {/* 'My location' button moved to bottom-center controls to align with Globe/2D toggle */}
        </div>
        {/* Bottom center controls: Flow + Globe toggle + map modes - HIDDEN per user request */}
        <div style={{ position: "fixed", bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 4000, display: 'none', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {/* Flow button - moved first */}
          <button
            onClick={() => {
              if (!exhibitions.length) return;
              let candidate: Exhibition | null = null;
              for (let i = 0; i < 5; i++) {
                const idx = Math.floor(Math.random() * exhibitions.length);
                const ex = exhibitions[idx];
                if (ex.id !== lastFlowIdRef.current) { candidate = ex; break; }
              }
              candidate = candidate || exhibitions[Math.floor(Math.random() * exhibitions.length)];
              lastFlowIdRef.current = candidate.id;
              setSelectedExhibition(candidate);
            }}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: '1px solid rgba(201, 165, 90, 0.3)',
              background: 'rgba(8, 8, 7, 0.82)',
              color: '#f0ede6',
              cursor: "pointer",
              boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
              minWidth: 96,
              fontWeight: 700,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              letterSpacing: '0.04em',
            }}
          >
            Flow
          </button>
        </div>
        {/* Selected museum details */}
        {selectedExhibition && !showDrawingGlobe && (
          <ExhibitionDetails
            exhibition={selectedExhibition}
            onClose={() => setSelectedExhibition(null)}
            isOpen={!!selectedExhibition && !selectedModalExhibition && !lightboxArtwork && !isOverlayOpen}
            onSelectExhibition={item => openCollectionModal(item?.id, null)}
          />
        )}
        {/* Exhibition modal */}
        {
          selectedModalExhibition && (
            <Suspense fallback={null}>
              <ExhibitionModal
                exhibition={selectedModalExhibition}
                museumName={selectedExhibition?.name}
                onClose={closeCollectionModal}
              />
            </Suspense>
          )
        }

        {/* Unified Artwork Lightbox for Search Results */}
        {
          lightboxArtwork && (
            <ArtworkLightbox
              artwork={lightboxArtwork}
              onClose={() => setLightboxArtwork(null)}
              isLiked={likedArtworks.some(a => (a.artworkId || a.id) === (lightboxArtwork.artworkId || lightboxArtwork.id))}
              onToggleLike={handleToggleLike}
              likedArtworksList={likedArtworks}
              onChangeArtwork={setLightboxArtwork}
            />
          )
        }



        {/* ── Map toggle buttons — bottom-left stack, each styled to its destination ── */}
        {!selectedModalExhibition && !lightboxArtwork && !isOverlayOpen && (
          <div style={{
            position: "fixed",
            bottom: 24,
            left: 20,
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            alignItems: "flex-start",
          }}>
            {/* Interactive Globe — dark luxury style */}
            <button
              onClick={() => setShowInteractiveGlobe(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "9px 16px",
                background: "rgba(8,8,7,0.82)",
                border: "1px solid rgba(201,165,90,0.35)",
                color: "rgba(201,165,90,0.9)",
                borderRadius: 3,
                fontFamily: "'Space Grotesk', 'Helvetica Neue', sans-serif",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                cursor: "pointer",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                boxShadow: "0 0 0 1px rgba(201,165,90,0.08), 0 4px 20px rgba(0,0,0,0.45)",
                transition: "all 0.2s ease",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "rgba(201,165,90,0.1)";
                e.currentTarget.style.borderColor = "rgba(201,165,90,0.65)";
                e.currentTarget.style.color = "#c9a55a";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "rgba(8,8,7,0.82)";
                e.currentTarget.style.borderColor = "rgba(201,165,90,0.35)";
                e.currentTarget.style.color = "rgba(201,165,90,0.9)";
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" />
                <ellipse cx="12" cy="12" rx="4" ry="9" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="4.5" y1="7.5" x2="19.5" y2="7.5" />
                <line x1="4.5" y1="16.5" x2="19.5" y2="16.5" />
              </svg>
              Interactive Globe
            </button>

            {/* Drawing Map — brutalist sketch style */}
            <button
              onClick={() => setShowDrawingGlobe(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "9px 16px",
                background: "#FFFFFF",
                border: "2px solid #111111",
                color: "#111111",
                borderRadius: 0,
                fontFamily: "'Space Mono', 'Courier New', monospace",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                cursor: "pointer",
                boxShadow: "3px 3px 0 #111111",
                transition: "box-shadow 0.1s, transform 0.1s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = "1px 1px 0 #111111";
                e.currentTarget.style.transform = "translate(2px,2px)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = "3px 3px 0 #111111";
                e.currentTarget.style.transform = "none";
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
              </svg>
              Drawing Map
            </button>
          </div>
        )}


        {/* Interactive Globe Modal layer */}
        {showInteractiveGlobe && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 12500 }}>
            <React.Suspense fallback={<div style={{ width: '100%', height: '100%', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', fontSize: 12, letterSpacing: '0.2em' }}>LOADING MAP…</div>}>
            <InteractiveGlobeMap
              exhibitions={exhibitions}
              onSelectExhibition={(ex) => {
                setSelectedExhibition(ex);
                setShowInteractiveGlobe(false); // Exit globe to show details
              }}
              onSelectExhibitionItem={(ex) => { openCollectionModal(ex, null); }}
              onExit={() => setShowInteractiveGlobe(false)}
              onSwitchToDrawing={() => { setShowInteractiveGlobe(false); setShowDrawingGlobe(true); }}
            />
            </React.Suspense>
          </div>
        )}

        {/* Drawing Globe Modal layer */}
        {showDrawingGlobe && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 2000 }}>
            <DrawingGlobe
              exhibitions={exhibitions}
              onClose={() => { setShowDrawingGlobe(false); }}
              onSelectExhibition={(ex) => {
                navigate(`/exhibition/${ex.id}?mode=drawing`);
              }}
              onSwitchToInteractive={() => {
                setShowDrawingGlobe(false);
                setShowInteractiveGlobe(true);
              }}
            />
          </div>
        )}

      </div>

      {/* ── GlobalNav — OUTSIDE overflow:hidden so it's always visible ── */}
      <div style={{
          position: 'fixed',
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 200000, // Must be above ExhibitionModal (13000) and all overlays
          pointerEvents: 'auto',
        }}>
        <GlobalNav
          isAdmin={isAdmin}
          isModalOpen={!!selectedModalExhibition}
          searchProps={{
            onOpenLightbox: (artwork, openLightbox = true) => {
              if (!openLightbox) return;
              if (artwork.exhibitionId && openCollectionModal(artwork.exhibitionId, artwork)) return;
              const guessed = guessCollectionFromArtwork(artwork);
              if (guessed && openCollectionModal(guessed.exhibition.id, artwork)) return;
              setLightboxArtwork(artwork);
            },
            museums: exhibitions.map(ex => ({
              id: ex.id,
              name: ex.name,
              country: (ex as any).country || '',
              region: (ex as any).region,
              latitude: (ex as any).latitude || 0,
              longitude: (ex as any).longitude || 0,
              representativeImage: (ex as any).representativeImage,
              permanentExhibitions: (ex as any).permanentExhibitions || [],
            })),
            onNavigateToMuseum: (museum, collectionId, artwork) => {
              if (openCollectionModal(collectionId, artwork)) return;
              if (artwork && openCollectionModal(artwork.exhibitionId, artwork)) return;
              const guessedEntry = guessCollectionFromArtwork(artwork);
              if (guessedEntry && openCollectionModal(guessedEntry.exhibition.id, artwork)) return;
              const fallbackMuseum = exhibitions.find(e => e.id === museum.id) || guessedEntry?.museum;
              if (fallbackMuseum) {
                setSelectedExhibition(fallbackMuseum);
                const firstPermanent = ((fallbackMuseum as any).permanentExhibitions || [])[0];
                if (collectionId && firstPermanent && firstPermanent.id === collectionId) {
                  setSelectedModalExhibition({ ...firstPermanent, initialArtwork: artwork });
                  return;
                }
                setSelectedModalExhibition(null);
                return;
              }
              setSelectedModalExhibition({
                id: artwork?.id || museum.id,
                name: museum.name,
                title: museum.name,
                image: artwork?.image,
                description: artwork?.name || '',
                startDate: '',
                endDate: '',
                initialArtwork: artwork,
              } as any);
            },
          }}
        />
      </div>

      {/* ── Dark / Light mode toggle — bottom-right, fixed position ── */}
      <button
        onClick={toggleHomeTheme}
        title={homeIsDark ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{
          position: 'fixed',
          bottom: 86,
          right: 28,
          zIndex: 200002,
          width: 42,
          height: 42,
          borderRadius: '50%',
          border: homeIsDark
            ? '1px solid rgba(201,165,90,0.4)'
            : '1px solid rgba(140,110,40,0.45)',
          background: homeIsDark
            ? 'rgba(8,8,7,0.88)'
            : 'rgba(250,246,236,0.95)',
          color: homeIsDark ? '#c9a55a' : '#7a5a18',
          fontSize: 15,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: homeIsDark
            ? '0 0 0 1px rgba(201,165,90,0.1), 0 4px 18px rgba(0,0,0,0.5)'
            : '0 0 0 1px rgba(140,110,40,0.12), 0 4px 14px rgba(0,0,0,0.15)',
          transition: 'all 0.25s ease',
        }}
      >
        {homeIsDark ? '☾' : '☀'}
      </button>

    </>
  );
  // Removed leftover Flow effect: single-click behavior only
}