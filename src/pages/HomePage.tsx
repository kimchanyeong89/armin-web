import { useEffect, useRef, useState, Suspense, lazy } from "react";
import { useSearchParams } from "react-router-dom";
import OpenStreetMapComponent from '../components/OpenStreetMapComponent';
import D3GeoGlobeSimplified from "../components/D3GeoGlobeSimplified";

import ExhibitionDetails from "../components/ExhibitionDetails";
// Filled Globe temporarily hidden
// Removed react-globe.gl Outline mode
// Heavy globe modes removed for performance on homepage
// Removed LeafletInteractiveMap import
import type { Exhibition, ExhibitionItem } from "../types/Exhibition";

const ExhibitionModal = lazy(() => import("../components/ExhibitionModal"));
const LineGlobe = lazy(() => import("../components/LineGlobe"));
import { LoginButton } from "../components/LoginButton";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

// Admin email whitelist
const ADMIN_EMAILS = ['kietzland@gmail.com'];

type HomePageProps = {
  exhibitions: Exhibition[];
};

export default function HomePage({ exhibitions }: HomePageProps) {
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
  const [mapMode, setMapMode] = useState<'d3geo' | 'd3geo-globe-simplified' | 'line-globe'>(() => {
    try {
      const saved = localStorage.getItem('mapMode');
      return (saved === 'd3geo' || saved === 'd3geo-globe-simplified' || saved === 'line-globe') ? (saved as any) : 'd3geo-globe-simplified';
    } catch { return 'd3geo-globe-simplified'; }
  });
  useEffect(() => {
    try { localStorage.setItem('mapMode', mapMode); } catch { }
  }, [mapMode]);
  // Removed Outline Globe toggle
  // D3 globe is the only globe mode when Globe is ON
  // Globe view uses react-globe.gl only (Cesium removed)
  // Hide the banner on a user's very first visit; remember preference afterwards

  const [focusTarget, setFocusTarget] = useState<Exhibition | null>(null);
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
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setIsAdmin(!!(user && ADMIN_EMAILS.includes(user.email || '')));
    });
    return () => unsub();
  }, []);
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
          setSelectedExhibition(ex);
          setSelectedModalExhibition(permHit);
          setSearchParams({}); // Clear param after handling
          sessionStorage.removeItem('pendingExhibition');
          return;
        }
        // Check temporary exhibitions
        const tempItems = (ex as any).temporaryExhibitions || [];
        const tempHit = tempItems.find((it: any) => it && it.id === decodedId);
        if (tempHit) {
          setSelectedExhibition(ex);
          setSelectedModalExhibition(tempHit);
          setSearchParams({});
          sessionStorage.removeItem('pendingExhibition');
          return;
        }
        // Check past exhibitions
        const pastItems = (ex as any).pastExhibitions || [];
        const pastHit = pastItems.find((it: any) => it && it.id === decodedId);
        if (pastHit) {
          setSelectedExhibition(ex);
          setSelectedModalExhibition(pastHit);
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
  }, [searchParams, exhibitions, setSearchParams]);
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

  return (
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
        {mapMode === 'd3geo-globe-simplified' ? (
          <D3GeoGlobeSimplified
            exhibitions={exhibitions}
            onSelectExhibition={setSelectedExhibition}
            panOffset={selectedExhibition ? 200 : 0}
          />
        ) : mapMode === 'line-globe' ? (
          <Suspense fallback={<div style={{ width: '100vw', height: '100vh', background: '#fff' }} />}>
            <LineGlobe
              exhibitions={exhibitions}
              onSelectExhibition={setSelectedExhibition}
              panOffset={selectedExhibition ? 200 : 0}
            />
          </Suspense>
        ) : (
          <OpenStreetMapComponent
            focusLatLng={focusTarget ? { lat: focusTarget.latitude, lng: focusTarget.longitude } : undefined}
            exhibitions={exhibitions}
            onSelectExhibition={setSelectedExhibition}
          />
        )}
        {/* 'My location' button moved to bottom-center controls to align with Globe/2D toggle */}
      </div>
      {/* Bottom center controls: Flow + Globe toggle + map modes */}
      <div style={{ position: "fixed", bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 4000, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
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
            setFocusTarget(candidate);
          }}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: '1px solid #374151',
            background: '#fff',
            color: '#374151',
            cursor: "pointer",
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            minWidth: 96,
            fontWeight: 700,
          }}
        >
          Flow
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setMapMode('d3geo-globe-simplified')}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: mapMode === 'd3geo-globe-simplified' ? "1px solid #111827" : "1px solid #374151",
              background: mapMode === 'd3geo-globe-simplified' ? "#111827" : "#fff",
              color: mapMode === 'd3geo-globe-simplified' ? "#fff" : "#374151",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
              minWidth: 96,
              fontWeight: 700,
            }}
          >
            globe
          </button>
          <button
            onClick={() => setMapMode('d3geo')}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: mapMode === 'd3geo' ? "1px solid #111827" : "1px solid #374151",
              background: mapMode === 'd3geo' ? "#111827" : "#fff",
              color: mapMode === 'd3geo' ? "#fff" : "#374151",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
              minWidth: 96,
              fontWeight: 700,
            }}
          >
            flat
          </button>
          <button
            onClick={() => setMapMode('line-globe')}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: mapMode === 'line-globe' ? "1px solid #111827" : "1px solid #374151",
              background: mapMode === 'line-globe' ? "#111827" : "#fff",
              color: mapMode === 'line-globe' ? "#fff" : "#374151",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
              minWidth: 96,
              fontWeight: 700,
            }}
          >
            line
          </button>
        </div>
      </div>
      {/* Liked count & Login on top right - hide when modal is open */}
      {!selectedModalExhibition && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 10001, display: "flex", alignItems: "center", gap: 12 }}>
          {/* Admin button - only visible to admins */}
          {isAdmin && (
            <div
              onClick={() => window.location.href = '/admin'}
              style={{ background: '#fef3c7', padding: '8px 12px', borderRadius: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#92400e', cursor: 'pointer' }}
              title="Admin Dashboard"
            >
              <span>⚙️</span> Admin
            </div>
          )}
          <div style={{ background: 'rgba(255, 255, 255, 0.9)', padding: '6px 16px', borderRadius: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            <LoginButton />
          </div>
          <div
            onClick={() => window.location.href = '/mypage'}
            style={{ background: 'rgba(255, 255, 255, 0.9)', padding: '8px 12px', borderRadius: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: '#e11d48', cursor: 'pointer' }}
            title="Liked Artworks"
          >
            <span>♡</span>
          </div>
        </div>
      )}

      {/* Selected museum details slide */}
      <div style={{ position: "fixed", top: 0, right: 0, width: "400px", height: "100%", backgroundColor: "#fff", boxShadow: "-2px 0 8px rgba(0,0,0,0.2)", overflowY: "auto", zIndex: 1000, transform: selectedExhibition ? "translateX(0)" : "translateX(100%)", transition: "transform 0.3s ease" }}>
        {selectedExhibition && (
          <ExhibitionDetails
            exhibition={selectedExhibition}
            onClose={() => setSelectedExhibition(null)}
            isOpen={!!selectedExhibition}
            onSelectExhibition={item => setSelectedModalExhibition(item)}
          />
        )}
      </div>
      {/* Exhibition modal */}
      {selectedModalExhibition && (
        <Suspense fallback={null}>
          <ExhibitionModal
            exhibition={selectedModalExhibition}
            onClose={() => setSelectedModalExhibition(null)}
          />
        </Suspense>
      )}
    </div>
  );
  // Removed leftover Flow effect: single-click behavior only
}