import { GoogleMap, Polyline, OverlayView, useJsApiLoader } from '@react-google-maps/api';
import { useCallback, useRef, useState, useEffect } from 'react';

import type { Exhibition } from '../types/Exhibition';

const containerStyle = { width: '100vw', height: '100vh' };
const center = { lat: 37.5665, lng: 126.9780 };

// API 키와 새 Map ID를 상수로 선언
const API_KEY = 'AIzaSyCjXHiVCgUGSDTBnacLnoPldQQt5C5DU4M';
const MAP_ID = '3d00da6d7d9060e41aa19e75';  // Armin‑web 지도 ID
// 안정적인 배열 상수 (LoadScript 재로드 방지)
const GOOGLE_LIBRARIES = ['marker'] as const;
const MAP_IDS = [MAP_ID] as const;

type CustomGoogleMapProps = {
  exhibitions: Exhibition[];
  onSelectExhibition?: (exhibition: Exhibition) => void;
  focusTarget?: Exhibition | null; // external command to focus
  userLocation?: { lat: number; lng: number } | null;
  resetZoomKey?: number;
};

export default function CustomGoogleMap({ exhibitions, onSelectExhibition, focusTarget, userLocation, resetZoomKey }: CustomGoogleMapProps) {
  // Recenter and reset zoom when userLocation or resetZoomKey changes
  useEffect(() => {
    if (!userLocation || !mapRef.current) return;
    mapRef.current.setCenter(userLocation);
    mapRef.current.setZoom(13); // or your preferred default zoom
  }, [userLocation, resetZoomKey]);
  const mapRef = useRef<any>(null);
  const overlayRef = useRef<any>(null);
  const advMarkersRef = useRef<Map<string, any>>(new Map());
  const headMarkerRef = useRef<any>(null);
  const [zoom, setZoom] = useState(11);
  const [lastClicked, setLastClicked] = useState<Exhibition | null>(null);
  const [segments, setSegments] = useState<Array<{ from: Exhibition; to: Exhibition }>>([]);
  const [paths, setPaths] = useState<any[][]>([]);
  const [animProgresses, setAnimProgresses] = useState<number[]>([]);
  const lastAnimatedIndexRef = useRef<number>(-1);
  const lastFocusedIdRef = useRef<string | null>(null);
  // Head is always visible; removed toggle state
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: API_KEY,
  mapIds: MAP_IDS as unknown as string[],
  libraries: GOOGLE_LIBRARIES as unknown as ("marker")[],
  });
  // Note: Avoid early returns before hooks to keep hook order consistent

  const focusExhibition = (exhibition: Exhibition) => {
    const map = mapRef.current;
    if (!map) {
      if (onSelectExhibition) onSelectExhibition(exhibition);
      return;
    }

    // Update clicked sequence and add a segment if applicable
    setSegments((prev) => {
      if (lastClicked) {
        return [...prev, { from: lastClicked, to: exhibition }];
      }
      return prev;
    });
    setLastClicked(exhibition);

    const offsetXPx = 220; // move marker slightly left of center to make room for right panel
    const duration = 1200; // ms

    const targetLatLng = new window.google.maps.LatLng(exhibition.latitude, exhibition.longitude);
    const projection = overlayRef.current?.getProjection?.();
    if (!projection) {
      map.panTo(targetLatLng);
      if (onSelectExhibition) onSelectExhibition(exhibition);
      return;
    }

    const mapDiv: HTMLElement = map.getDiv();
    const markerPx = projection.fromLatLngToContainerPixel(targetLatLng);
    const desiredPx = new window.google.maps.Point(mapDiv.clientWidth / 2 - offsetXPx, mapDiv.clientHeight / 2);
    const dx = desiredPx.x - markerPx.x;
    const dy = desiredPx.y - markerPx.y;

    const currentCenter = map.getCenter();
    const currentCenterPx = projection.fromLatLngToContainerPixel(currentCenter);
    const finalCenterPx = new window.google.maps.Point(currentCenterPx.x - dx, currentCenterPx.y - dy);
    const finalCenter = projection.fromContainerPixelToLatLng(finalCenterPx);

    // Smooth animation
    const start = performance.now();
    const startCenter = currentCenter.toJSON();
    const endCenter = finalCenter.toJSON();
    const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

    const step = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const e = easeInOut(t);
      const lat = startCenter.lat + (endCenter.lat - startCenter.lat) * e;
      const lng = startCenter.lng + (endCenter.lng - startCenter.lng) * e;
      map.setCenter({ lat, lng });
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        if (onSelectExhibition) onSelectExhibition(exhibition);
      }
    };
    requestAnimationFrame(step);
  };

  const computeCurvePoints = useCallback((from: Exhibition, to: Exhibition) => {
    const map = mapRef.current;
    const projection = overlayRef.current?.getProjection?.();
    if (!map || !projection) {
      // Fallback straight line
      return [
        { lat: from.latitude, lng: from.longitude },
        { lat: to.latitude, lng: to.longitude },
      ];
    }
    const p0 = projection.fromLatLngToContainerPixel(new window.google.maps.LatLng(from.latitude, from.longitude));
    const p2 = projection.fromLatLngToContainerPixel(new window.google.maps.LatLng(to.latitude, to.longitude));
    const dx = p2.x - p0.x;
    const dy = p2.y - p0.y;
    const dist = Math.hypot(dx, dy);
    const arc = Math.min(240, Math.max(80, dist * 0.3)); // px height
    const p1 = new window.google.maps.Point(p0.x + dx / 2, p0.y + dy / 2 - arc);

    const points: any[] = [];
    const steps = 32;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
      const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
      const latLng = projection.fromContainerPixelToLatLng(new window.google.maps.Point(x, y));
      points.push({ lat: latLng.lat(), lng: latLng.lng() });
    }
    return points;
  }, []);

  const recomputePaths = useCallback(() => {
    if (!segments.length) { setPaths([]); return; }
    const newPaths = segments.map(seg => computeCurvePoints(seg.from, seg.to));
    setPaths(newPaths);
  }, [segments, computeCurvePoints]);

  useEffect(() => { recomputePaths(); }, [recomputePaths, zoom]);

  // Keep animProgresses aligned with segments length
  useEffect(() => {
    setAnimProgresses(prev => {
      if (prev.length === segments.length) return prev;
      const next = prev.slice(0, segments.length);
      while (next.length < segments.length) next.push(0);
      return next;
    });
  }, [segments.length]);


  // External focus command handler
  useEffect(() => {
    if (!focusTarget) return;
    if (focusTarget.id === lastFocusedIdRef.current) return;
    lastFocusedIdRef.current = focusTarget.id;
    focusExhibition(focusTarget);
  }, [focusTarget]);

  // Sync exhibition markers with AdvancedMarkerElement
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;
    const g = (window as any).google;
    const run = async () => {
      // Ensure the marker library is loaded
      if (!g?.maps?.marker?.AdvancedMarkerElement) {
        try { await g.maps.importLibrary('marker'); } catch { /* ignore */ }
      }
      if (!g?.maps?.marker?.AdvancedMarkerElement) return; // give up quietly
      const map = mapRef.current;

      const visible = zoom > 2;
      // Remove markers that no longer exist in dataset
      const ids = new Set(exhibitions.map(e => e.id));
      for (const [id, marker] of advMarkersRef.current) {
        if (!ids.has(id)) {
          marker.setMap(null);
          advMarkersRef.current.delete(id);
        }
      }
      if (!visible) {
        for (const [, marker] of advMarkersRef.current) marker.setMap(null);
        return;
      }
      exhibitions.forEach(ex => {
        const pos = { lat: ex.latitude, lng: ex.longitude };
        const isActive = !!(lastClicked && lastClicked.id === ex.id);
        let marker = advMarkersRef.current.get(ex.id);
          if (!marker) {
            // Create a small black circular pin as an HTML element so we control color and click behavior
            const pinEl = document.createElement('div');
            pinEl.style.width = '14px';
            pinEl.style.height = '14px';
            pinEl.style.borderRadius = '50%';
            pinEl.style.background = '#111827';
            pinEl.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3)';
            pinEl.style.border = '2px solid #fff';
            pinEl.style.cursor = 'pointer';

            marker = new g.maps.marker.AdvancedMarkerElement({
              map,
              position: pos,
              content: pinEl,
              title: ex.name,
              zIndex: isActive ? 1000 : undefined,
            });
            marker.addListener('click', () => focusExhibition(ex));
            advMarkersRef.current.set(ex.id, marker);
          } else {
            marker.map = map;
            marker.position = pos;
            marker.title = ex.name;
            marker.zIndex = isActive ? 1000 : undefined;
            // ensure marker content style stays black if recreated
            try {
              const content = (marker as any).content as HTMLElement | null;
              if (content && content.style) {
                content.style.background = '#111827';
                content.style.border = '2px solid #fff';
              }
            } catch {}
          }
      });
    };
    run();
  }, [isLoaded, exhibitions, zoom, lastClicked]);

  // Cleanup markers on unmount
  useEffect(() => {
    return () => {
      for (const [, marker] of advMarkersRef.current) marker.setMap(null);
      advMarkersRef.current.clear();
      if (headMarkerRef.current) {
        headMarkerRef.current.setMap(null);
        headMarkerRef.current = null;
      }
    };
  }, []);

  // Update moving head marker at the end of the latest path
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;
    const g = (window as any).google;
    const run = async () => {
      if (!g?.maps?.marker?.AdvancedMarkerElement) {
        try { await g.maps.importLibrary('marker'); } catch { /* ignore */ }
      }
      if (!g?.maps?.marker?.AdvancedMarkerElement) return;
      const map = mapRef.current;
      if (!paths.length) {
        if (headMarkerRef.current) {
          headMarkerRef.current.setMap(null);
          headMarkerRef.current = null;
        }
        return;
      }
      const lastIdx = paths.length - 1;
      const path = paths[lastIdx];
      if (!path || path.length < 2) return;
      const progress = animProgresses[lastIdx] ?? 1;
      const index = Math.max(1, Math.floor((path.length - 1) * progress));
      const pos = path[index];
      const prev = path[index - 1];
      const dy = pos.lat - prev.lat;
      const dx = pos.lng - prev.lng;
      const rotation = (Math.atan2(dy, dx) * 180) / Math.PI;

      const headEl = document.createElement('div');
      headEl.style.width = '0px';
      headEl.style.height = '0px';
      headEl.style.borderTop = '5px solid transparent';
      headEl.style.borderBottom = '5px solid transparent';
      headEl.style.borderLeft = '10px solid #d97706';
      headEl.style.transform = `rotate(${rotation}deg)`;

      if (!headMarkerRef.current) {
        headMarkerRef.current = new g.maps.marker.AdvancedMarkerElement({
          map,
          position: pos,
          content: headEl,
          title: 'path-head',
          zIndex: 1200,
        });
      } else {
        headMarkerRef.current.map = map;
        headMarkerRef.current.position = pos;
        headMarkerRef.current.content = headEl;
        headMarkerRef.current.zIndex = 1200;
      }
    };
    run();
  }, [isLoaded, paths, animProgresses]);

  // Start progressive drawing animation for newly added segment
  useEffect(() => {
    const idx = segments.length - 1;
    if (idx < 0) return;
    if (lastAnimatedIndexRef.current >= idx) return; // already started
    lastAnimatedIndexRef.current = idx;

    let rafId = 0;
    const duration = 1200; // ms, match pan animation
    const start = performance.now();
    const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = easeInOut(t);
      setAnimProgresses(prev => {
        const next = [...prev];
        next[idx] = e;
        return next;
      });
      if (t < 1) rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [segments.length]);



  if (loadError) {
    return <div>Error loading map</div>;
  }

  if (!isLoaded) {
    return <div>Loading...</div>;
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={zoom}
      options={{
        mapId: MAP_ID,
        disableDefaultUI: true,
        zoomControl: true,
      }}
      onLoad={map => {
        mapRef.current = map;
        // Initialize overlay for projection access
        const overlay = new window.google.maps.OverlayView();
        overlay.onAdd = function () {};
        overlay.draw = function () {};
        overlay.onRemove = function () {};
        overlay.setMap(map);
        overlayRef.current = overlay;
      }}
      onZoomChanged={() => {
        if (mapRef.current) setZoom(mapRef.current.getZoom());
      }}
    >
    {exhibitions && exhibitions.map((exhibition) => {
        // 줌 레벨이 2 이하이면 라벨 숨김
        if (zoom <= 2) return null;
        return (
          <OverlayView
            key={`l-${exhibition.id}`}
            position={{ lat: exhibition.latitude, lng: exhibition.longitude }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
            getPixelPositionOffset={(width = 0, height = 0) => ({ x: -width / 2, y: -height - 36 })}
          >
            <div
              onClick={() => focusExhibition(exhibition)}
              style={{
                pointerEvents: 'auto',
                background: 'transparent',
                color: '#111827',
                padding: '2px 6px',
                borderRadius: 6,
                fontSize: 12,
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                transform: 'translateY(-4px)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              {exhibition.name}
            </div>
          </OverlayView>
        );
      })}

      {/* Dotted curved paths between successive clicks */}
      {paths.map((path, idx) => {
        const progress = animProgresses[idx] ?? 1;
        const count = Math.max(2, Math.floor(path.length * progress));
        const animatedPath = path.slice(0, count);
        return (
          <Polyline
            key={idx}
            path={animatedPath}
            options={{
              strokeOpacity: 0,
              strokeWeight: 0,
              icons: [
                {
                  icon: {
                    // tighter, shorter dash
                    path: "M 0 -1 L 0 1",
                    scale: 2, // ~4px dash length
                    strokeOpacity: 0.95,
                    strokeColor: "#d97706", // dark orange
                    strokeWeight: 2,
                  },
                  offset: "0",
                  repeat: "10px",
                },
              ],
            }}
          />
        );
      })}

  {/* Moving head marker managed imperatively via AdvancedMarkerElement */}
    </GoogleMap>

  {/* Head toggle removed; head always visible */}
    </div>
  );
}