import { useEffect, useRef, useState } from "react";
import ExhibitionBanner from "../components/ExhibitionBanner";
import CustomGoogleMap from "../components/CustomGoogleMap";
import ExhibitionDetails from "../components/ExhibitionDetails";
import ExhibitionModal from "../components/ExhibitionModal";
import GlobeHexPolygons from "../components/GlobeHexPolygons";
import GlobeOutline from "../components/GlobeOutline";
import type { Exhibition, ExhibitionItem } from "../types/Exhibition";

type HomePageProps = {
  exhibitions: Exhibition[];
};

export default function HomePage({ exhibitions }: HomePageProps) {
  // Approximate dark green used on the map style (adjust if needed)
  const MAP_DARK_GREEN = "#0B3D02";
  const [toggleOnColor, setToggleOnColor] = useState<string>(() => {
    try {
      return localStorage.getItem('toggleOnColor') || MAP_DARK_GREEN;
    } catch {
      return MAP_DARK_GREEN;
    }
  });
  const [selectedExhibition, setSelectedExhibition] = useState<Exhibition | null>(null);
  const [selectedModalExhibition, setSelectedModalExhibition] = useState<ExhibitionItem | null>(null);
  const [useGlobe, setUseGlobe] = useState(false);
  const [useOutlineGlobe, setUseOutlineGlobe] = useState(false);
  // Globe view uses react-globe.gl only (Cesium removed)
  const [showBanner, setShowBanner] = useState(true);
  const [focusTarget, setFocusTarget] = useState<Exhibition | null>(null);
  const lastFlowIdRef = useRef<string | null>(null);
  // Header reveal toggle state
  const [headerOn, setHeaderOn] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [dragPos, setDragPos] = useState(0); // 0..MAX range
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
    window.addEventListener("mousemove", onMove as any, { passive: true });
    window.addEventListener("touchmove", onMove as any, { passive: true });
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
    } catch {}
    return () => {
      // restore default when leaving page
      root.style.setProperty('--navbar-translateY', 'translateY(0)');
      if (scaleTimer) window.clearTimeout(scaleTimer);
    };
  }, [headerOn]);

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      {/* Toggle stays fixed vertically; scales up when ON */}
  <div style={{ position: "fixed", top: 12, left: 12, zIndex: 4500 }}>
        <div
          ref={trackRef}
          onClick={() => !dragActive && setHeaderOn(v => !v)}
          onContextMenu={async (e) => {
            e.preventDefault();
            try {
              const EyeDropperCtor = (window as any).EyeDropper;
              if (!EyeDropperCtor) {
                alert('이 브라우저는 스포이드(EyeDropper)를 지원하지 않습니다. 최신 Chrome 기반 브라우저에서 사용해 보세요.');
                return;
              }
              const eyeDropper = new EyeDropperCtor();
              const res = await eyeDropper.open();
              if (res && res.sRGBHex) {
                setToggleOnColor(res.sRGBHex);
                try { localStorage.setItem('toggleOnColor', res.sRGBHex); } catch {}
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
      {/* 지도 전체 화면 */}
      <div style={{ position: "absolute", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 1 }}>
        {useGlobe ? (
          useOutlineGlobe ? (
            <GlobeOutline focusLatLng={focusTarget ? { lat: focusTarget.latitude, lng: focusTarget.longitude } : null} />
          ) : (
            <GlobeHexPolygons
              exhibitions={exhibitions}
              onSelectExhibition={setSelectedExhibition}
              focusTarget={focusTarget}
            />
          )
        ) : (
          <CustomGoogleMap
            exhibitions={exhibitions}
            onSelectExhibition={setSelectedExhibition}
            focusTarget={focusTarget}
          />
        )}
      </div>
  {/* Bottom center controls: Globe toggle + Borders/Satellite (globe only) + Flow */}
      <div style={{ position: "fixed", bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 4000, display: 'flex', gap: 8 }}>
        <button
          onClick={() => setUseGlobe(v => !v)}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #d97706",
            background: useGlobe ? "#d97706" : "#fff",
            color: useGlobe ? "#fff" : "#d97706",
            cursor: "pointer",
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            minWidth: 96,
          }}
        >
          {useGlobe ? "Map" : "Globe"}
        </button>
        {useGlobe && (
          <button
            onClick={() => setUseOutlineGlobe(v => !v)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #111827",
              background: useOutlineGlobe ? "#111827" : "#fff",
              color: useOutlineGlobe ? "#fff" : "#111827",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
              minWidth: 132,
            }}
          >
            {useOutlineGlobe ? "Filled Globe" : "Outline Globe"}
          </button>
        )}
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
          }}
        >
          Flow
        </button>
      </div>
      {/* 오른쪽 팝업 배너 */}
  <div style={{ position: "fixed", top: "60px", right: 0, zIndex: 3000 }}>
        {showBanner && (
          <ExhibitionBanner
            onClose={() => setShowBanner(false)}
            onBannerClick={(exhibitionKey) => {
              // Try id, then name/title match
              let item = exhibitions.find(e => e.id === exhibitionKey) || null;
              if (!item) {
                item = exhibitions.find(e => e.name === exhibitionKey) || null;
              }
              if (!item) {
                item = exhibitions.find(e => (e.permanentExhibitions || []).some(pe => pe.title === exhibitionKey || pe.name === exhibitionKey)) || null;
              }
              setSelectedExhibition(item);
            }}
          />
        )}
      </div>
      {/* 선택된 전시관 상세 슬라이드 */}
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
      {/* 전시 모달 */}
      {selectedModalExhibition && (
        <ExhibitionModal
          exhibition={selectedModalExhibition}
          onClose={() => setSelectedModalExhibition(null)}
        />
      )}
    </div>
  );
  // Removed leftover Flow effect: single-click behavior only
}