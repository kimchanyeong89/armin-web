import { GoogleMap, Marker, Polyline, useJsApiLoader } from '@react-google-maps/api';
import { useCallback, useRef, useState, useEffect } from 'react';

import type { Exhibition } from '../types/Exhibition';

const containerStyle = { width: '100vw', height: '100vh' };
const center = { lat: 37.5665, lng: 126.9780 };

// API 키와 새 Map ID를 상수로 선언
const API_KEY = 'AIzaSyCjXHiVCgUGSDTBnacLnoPldQQt5C5DU4M';
const MAP_ID = '3d00da6d7d9060e41aa19e75';  // Armin‑web 지도 ID

type CustomGoogleMapProps = {
  exhibitions: Exhibition[];
  onSelectExhibition?: (exhibition: Exhibition) => void;
  focusTarget?: Exhibition | null; // external command to focus
};

export default function CustomGoogleMap({ exhibitions, onSelectExhibition, focusTarget }: CustomGoogleMapProps) {
  const mapRef = useRef<any>(null);
  const overlayRef = useRef<any>(null);
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
    mapIds: [MAP_ID],
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
        // 줌 레벨이 2 이하이면 마커 숨김
        if (zoom <= 2) return null;
        // 실제 핀 이미지의 원본 비율을 확인(예: 48x48, 40x48 등)
        // 상하가 더 길도록 1:2 비율로 조정 (예: 40x80)
  let width = Math.max(12, Math.min(24, zoom * 2));
  const isActive = !!(lastClicked && lastClicked.id === exhibition.id);
  if (isActive) width = Math.round(width * 1.25); // active pin slightly larger
  const height = Math.round(width * 2); // 1:2 비율
        // scaledSize, origin, anchor는 window.google.maps가 있을 때만 넘김
        if (window.google && window.google.maps) {
          return (
            <Marker
              key={exhibition.id}
              position={{ lat: exhibition.latitude, lng: exhibition.longitude }}
              title={exhibition.name}
              icon={{
                url: "/images/pin.png",
                scaledSize: new window.google.maps.Size(width, height),
                origin: new window.google.maps.Point(0, 0),
                anchor: new window.google.maps.Point(width / 2, height),
              }}
              zIndex={isActive ? 1000 : undefined}
              onClick={() => focusExhibition(exhibition)}
            />
          );
        } else {
          // window.google.maps가 없으면 scaledSize 등은 생략
          return (
            <Marker
              key={exhibition.id}
              position={{ lat: exhibition.latitude, lng: exhibition.longitude }}
              title={exhibition.name}
              icon={{ url: "/images/pin.png" }}
              zIndex={lastClicked && lastClicked.id === exhibition.id ? 1000 : undefined}
              onClick={() => focusExhibition(exhibition)}
            />
          );
        }
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

  {/* Moving head at the end of the latest animated path */}
  {paths.length > 0 && (() => {
        const lastIdx = paths.length - 1;
        const path = paths[lastIdx];
        if (!path || path.length < 2) return null;
        const progress = animProgresses[lastIdx] ?? 1;
        const index = Math.max(1, Math.floor((path.length - 1) * progress));
        const pos = path[index];
        const prev = path[index - 1];
        // Approximate rotation from prev->pos
        const dy = pos.lat - prev.lat;
        const dx = pos.lng - prev.lng;
        const rotation = (Math.atan2(dy, dx) * 180) / Math.PI; // degrees
        return (
          <Marker
            position={pos}
            zIndex={1200}
            icon={{
              path: window.google && window.google.maps ? window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW : 0,
              scale: 4,
              strokeColor: '#d97706',
              fillColor: '#d97706',
              fillOpacity: 1,
              strokeWeight: 1,
              rotation,
            }}
          />
        );
      })()}
    </GoogleMap>

  {/* Head toggle removed; head always visible */}
    </div>
  );
}