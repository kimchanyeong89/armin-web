import { useEffect, useRef, useState } from 'react';
// @ts-ignore - runtime-only import; types optional
import { mesh } from 'topojson-client';
import type { Exhibition } from '../types/Exhibition';

// Fresh Canvas-based orthographic globe with line-drawn countries and city (urban area) boundaries.
// No D3 dependency. Responsive to container size, supports drag-rotate, wheel-zoom, and optional autorotate.

export type CustomGlobeMapProps = {
  focusLatLng?: { lat: number; lng: number } | null;
  autorotate?: boolean;
  exhibitions?: Exhibition[];
};

export default function CustomGlobeMap({
  focusLatLng = null,
  autorotate = false,
  exhibitions = [],
}: CustomGlobeMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);
  const [isRotating, setIsRotating] = useState(autorotate);
  const [rotation, setRotation] = useState({ x: 0, y: 0 }); // deg: pitch(X), yaw(Y)
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState({ active: false, x: 0, y: 0, id: -1 });
  const [size, setSize] = useState({ w: 800, h: 600, dpr: 1 });

  // Data
  const [countries, setCountries] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showCities, setShowCities] = useState(true);
  const [showCountries, setShowCountries] = useState(true);
  const [cityStrokeWidth, setCityStrokeWidth] = useState(1.2);
  const [cullBackface, setCullBackface] = useState(true);
  const [focusCityKey, setFocusCityKey] = useState<'london' | 'paris' | 'newyork' | 'tokyo'>('london');
  // Optional city adjacency lines from TopoJSON mesh (array of LineStrings)
  const [cityLines, setCityLines] = useState<number[][][] | null>(null);

  // Responsive sizing with DPR
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(320, Math.floor(el.clientWidth));
      const h = Math.max(240, Math.floor(el.clientHeight));
      setSize({ w, h, dpr });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Load data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cRes, uRes] = await Promise.all([
          fetch('/geo/countries.geo.json'),
          fetch('/atlas/urban-areas.json'),
        ]);
        const cData = cRes.ok ? await cRes.json() : { features: [] };
        const uData = uRes.ok ? await uRes.json() : { type: 'FeatureCollection', features: [] };
        if (!cancelled) {
          setCountries(cData.features || []);
          setCities(Array.isArray(uData.features) ? uData.features : []);
        }
        // Try optional TopoJSON for adjacency lines
        try {
          const topoRes = await fetch('/atlas/urban-areas-topo.json');
          if (topoRes.ok) {
            const topo = await topoRes.json();
            const keys = topo.objects ? Object.keys(topo.objects) : [];
            if (keys.length) {
              const obj = topo.objects[keys[0]];
              const m: any = mesh(topo, obj, (a: any, b: any) => a !== b);
              if (m && m.type) {
                const lines: number[][][] = m.type === 'LineString' ? [m.coordinates] : (m.coordinates || []);
                if (!cancelled) setCityLines(lines);
              }
            }
          }
        } catch {}
        if (!cancelled) {
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Math helpers (unit sphere)
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const latLngToUnit = (lat: number, lng: number) => {
    const phi = toRad(90 - lat);
    const theta = toRad(lng + 180);
    const x = Math.sin(phi) * Math.cos(theta);
    const y = Math.cos(phi);
    const z = Math.sin(phi) * Math.sin(theta);
    return { x, y, z };
  };
  const rotate = (p: { x: number; y: number; z: number }, pitchDeg: number, yawDeg: number) => {
    const pitch = toRad(pitchDeg);
    const yaw = toRad(yawDeg);
    // X
    const cy = Math.cos(pitch), sy = Math.sin(pitch);
    let x1 = p.x;
    let y1 = p.y * cy - p.z * sy;
    let z1 = p.y * sy + p.z * cy;
    // Y
    const cz = Math.cos(yaw), sz = Math.sin(yaw);
    const x2 = x1 * cz + z1 * sz;
    const y2 = y1;
    const z2 = -x1 * sz + z1 * cz;
    return { x: x2, y: y2, z: z2 };
  };
  const project = (p: { x: number; y: number; z: number }, cx: number, cy: number, r: number) => {
    return { x: cx + p.x * r, y: cy + p.y * r, z: p.z };
  };

  // Stroke a ring with backface awareness and horizon intersection
  const strokeRing = (
    ctx: CanvasRenderingContext2D,
    ring: number[][],
    cx: number,
    cy: number,
    r: number,
    pitch: number,
    yaw: number,
    cull: boolean
  ) => {
    if (!ring || ring.length < 2) return;
    let prevRot: { x: number; y: number; z: number } | null = null;
    let prevProj: { x: number; y: number; z: number } | null = null;
    let hasSubpath = false;

    const moveTo = (pt: { x: number; y: number }) => {
      ctx.moveTo(pt.x, pt.y);
      hasSubpath = true;
    };
    const lineTo = (pt: { x: number; y: number }) => {
      if (!hasSubpath) moveTo(pt);
      else ctx.lineTo(pt.x, pt.y);
    };

    for (let i = 0; i < ring.length; i++) {
      const [lng, lat] = ring[i];
      const rot = rotate(latLngToUnit(lat, lng), pitch, yaw);
      const proj = project(rot, cx, cy, r);
      if (!cull) {
        if (i === 0) moveTo({ x: proj.x, y: proj.y });
        else lineTo({ x: proj.x, y: proj.y });
      } else {
        if (i === 0) {
          if (proj.z > 0) moveTo({ x: proj.x, y: proj.y });
        } else if (prevRot && prevProj) {
          const frontPrev = prevProj.z > 0;
          const frontCurr = proj.z > 0;
          if (frontPrev && frontCurr) {
            lineTo({ x: proj.x, y: proj.y });
          } else if (frontPrev !== frontCurr) {
            // Edge crosses horizon (z=0) in rotated space; interpolate
            const dz = prevRot.z - rot.z; // note: prevRot.z at t=0, rot.z at t=1
            const t = dz !== 0 ? prevRot.z / (prevRot.z - rot.z) : 0.5;
            const xi = prevRot.x + (rot.x - prevRot.x) * t;
            const yi = prevRot.y + (rot.y - prevRot.y) * t;
            const zi = prevRot.z + (rot.z - prevRot.z) * t; // ~0
            const ip = project({ x: xi, y: yi, z: zi }, cx, cy, r);
            if (frontPrev) {
              // draw to intersection, then break
              lineTo({ x: ip.x, y: ip.y });
              hasSubpath = false; // break path
            } else {
              // start at intersection then draw to current
              moveTo({ x: ip.x, y: ip.y });
              lineTo({ x: proj.x, y: proj.y });
            }
          } else {
            // both backface: skip
          }
        }
      }
      prevRot = rot; prevProj = proj;
    }
  };

  const strokeFeature = (
    ctx: CanvasRenderingContext2D,
    feature: any,
    color: string,
    width: number,
    cx: number,
    cy: number,
    r: number,
    pitch: number,
    yaw: number,
    cull: boolean
  ) => {
    const g = feature?.geometry;
    if (!g) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    if (g.type === 'Polygon') {
      for (const ring of g.coordinates as number[][][]) strokeRing(ctx, ring, cx, cy, r, pitch, yaw, cull);
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates as number[][][][]) for (const ring of poly) strokeRing(ctx, ring, cx, cy, r, pitch, yaw, cull);
    }
    ctx.stroke();
  };

  const draw = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const { w, h, dpr } = size;
    // Setup backing store size for DPR
    const bw = Math.floor(w * dpr), bh = Math.floor(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw; canvas.height = bh;
    }
    // CSS size
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear
    ctx.clearRect(0, 0, w, h);
    // Background
    ctx.fillStyle = '#f7f7f7';
    ctx.fillRect(0, 0, w, h);

    const radius = Math.min(w, h) * 0.45 * zoom;
    const cx = w / 2, cy = h / 2;

    // Sphere outline
    ctx.beginPath();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#2b3138';
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    if (loaded) {
      // Countries first
      if (showCountries) {
        for (const f of countries) strokeFeature(ctx, f, '#2b3138', 1.1, cx, cy, radius, rotation.x, rotation.y, true);
      }
      // Urban areas on top
      if (showCities) {
        if (cityLines && cityLines.length) {
          // Draw adjacency lines (MultiLineString)
          ctx.strokeStyle = '#7c3aed';
          ctx.lineWidth = cityStrokeWidth;
          ctx.beginPath();
          for (const line of cityLines) {
            // reuse strokeRing logic with culling
            strokeRing(ctx, line as unknown as number[][], cx, cy, radius, rotation.x, rotation.y, cullBackface);
          }
          ctx.stroke();
        } else {
          // Fallback: draw city polygon outlines
          for (const f of cities) strokeFeature(ctx, f, '#7c3aed', cityStrokeWidth, cx, cy, radius, rotation.x, rotation.y, cullBackface);
        }
      }

      // Exhibitions (front only)
      ctx.fillStyle = '#ef4444';
      ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      for (const ex of exhibitions) {
        const rot = rotate(latLngToUnit(ex.latitude, ex.longitude), rotation.x, rotation.y);
        if (rot.z <= 0) continue;
        const p = project(rot, cx, cy, radius);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#333';
        ctx.fillText(ex.name, p.x + 6, p.y - 4);
        ctx.fillStyle = '#ef4444';
      }
    } else {
      ctx.fillStyle = '#666';
      ctx.font = '14px system-ui, sans-serif';
      const msg = 'Loading map data...';
      const m = ctx.measureText(msg);
      ctx.fillText(msg, cx - m.width / 2, cy + 6);
    }
  };

  // Animation loop: always draw, update rotation when autorotate is ON
  useEffect(() => {
    const step = (ts: number) => {
      const dt = Math.min(64, ts - (lastTsRef.current || ts));
      lastTsRef.current = ts;
      if (isRotating) {
        setRotation(prev => ({ x: prev.x, y: prev.y + 0.03 * dt })); // ~1.8 deg/sec
      }
      draw();
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRotating, size, zoom, countries, cities, exhibitions, showCities, showCountries]);

  // Redraw on rotation change (from drag/focus)
  useEffect(() => { draw(); }, [rotation.x, rotation.y]);

  // Focus control
  useEffect(() => {
    if (!focusLatLng) return;
    setRotation({ x: -focusLatLng.lat, y: focusLatLng.lng });
  }, [focusLatLng]);

  // Pointer handlers (more robust than mouse only)
  const onPointerDown = (e: React.PointerEvent) => {
    try { (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId); } catch {}
    setDrag({ active: true, x: e.clientX, y: e.clientY, id: e.pointerId });
    setIsRotating(false);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.active || (drag.id !== -1 && e.pointerId !== drag.id)) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    // Slightly stronger sensitivity
    setRotation(prev => ({ x: Math.max(-90, Math.min(90, prev.x + dy * 0.6)), y: prev.y + dx * 0.6 }));
    setDrag({ active: true, x: e.clientX, y: e.clientY, id: e.pointerId });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    try { (e.currentTarget as HTMLCanvasElement).releasePointerCapture(e.pointerId); } catch {}
    setDrag(prev => ({ ...prev, active: false, id: -1 }));
  };
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    setZoom(z => Math.max(0.5, Math.min(3, z * factor)));
  };

  // Quick focus to common cities (center front)
  const applyFocusCity = () => {
    const items = {
      london: { lat: 51.5074, lng: -0.1278 },
      paris: { lat: 48.8566, lng: 2.3522 },
      newyork: { lat: 40.7128, lng: -74.0060 },
      tokyo: { lat: 35.6762, lng: 139.6503 },
    } as const;
    const c = items[focusCityKey];
    setRotation({ x: -c.lat, y: c.lng });
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        style={{ display: 'block', width: '100%', height: '100%', cursor: drag.active ? 'grabbing' : 'grab', background: '#f7f7f7', borderRadius: 8, border: '1px solid #e5e7eb', touchAction: 'none' }}
      />

      {/* Local controls (rotate/reset/layers) */}
      <div style={{ position: 'absolute', left: 16, bottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => setIsRotating(r => !r)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: isRotating ? '#4CAF50' : '#fff', color: isRotating ? '#fff' : '#0f172a', fontWeight: 700 }}> {isRotating ? 'Stop' : 'Rotate'} </button>
        <button onClick={() => setRotation({ x: 0, y: 0 })} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontWeight: 700 }}>Reset</button>
        <button onClick={() => setShowCountries(v => !v)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: showCountries ? '#2b3138' : '#fff', color: showCountries ? '#fff' : '#0f172a', fontWeight: 700 }}>Countries</button>
        <button onClick={() => setShowCities(v => !v)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: showCities ? '#7c3aed' : '#fff', color: showCities ? '#fff' : '#0f172a', fontWeight: 700 }}>Cities</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#0f172a', padding: '2px 6px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff' }}>
          <span>City width</span>
          <input type="range" min={0.5} max={3} step={0.1} value={cityStrokeWidth} onChange={(e) => setCityStrokeWidth(parseFloat(e.target.value))} />
          <span>{cityStrokeWidth.toFixed(1)}</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#0f172a', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff' }}>
          <input type="checkbox" checked={cullBackface} onChange={(e) => setCullBackface(e.target.checked)} /> Cull
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff' }}>
          <select value={focusCityKey} onChange={(e) => setFocusCityKey(e.target.value as any)} style={{ padding: '4px 6px' }}>
            <option value="london">London</option>
            <option value="paris">Paris</option>
            <option value="newyork">New York</option>
            <option value="tokyo">Tokyo</option>
          </select>
          <button onClick={applyFocusCity} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontWeight: 700 }}>Focus</button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ position: 'absolute', right: 16, top: 16, background: 'rgba(255,255,255,0.9)', padding: 10, borderRadius: 8, fontSize: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 20, height: 2, background: '#2b3138' }} />
          <span>Countries</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 20, height: 2, background: '#7c3aed' }} />
          <span>Cities</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
          <span>Exhibitions</span>
        </div>
      </div>
    </div>
  );
}
