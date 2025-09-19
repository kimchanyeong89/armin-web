import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';

const D3GeoGlobeSimplified: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [loadingStatus, setLoadingStatus] = useState<string>('Ready');
  // Legacy holder removed; we render directly from datasets
  const [scale, setScale] = useState<number>(1); // 줌 스케일 (0.5 ~ 2.0, 지구 꽉 차는 최소)

  // Always-available datasets for interactions
  const [countries, setCountries] = useState<any[]>([]);
  const [admin1Topo, setAdmin1Topo] = useState<any | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const admin1OverlayCacheRef = useRef<Map<string, any>>(new Map());
  const [admin1OverlayMesh, setAdmin1OverlayMesh] = useState<any | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{x:number;y:number;text:string}|null>(null);
  const [hoverCountry, setHoverCountry] = useState<any | null>(null);
  const [flagCache] = useState<Map<string, {url:string}>>(new Map());
  const [hoverFlagUrl, setHoverFlagUrl] = useState<string | null>(null);
  const animatingRef = useRef(false);
  const hoverFetchTimeoutRef = useRef<number | null>(null);
  const hoverAbortRef = useRef<AbortController | null>(null);

  // Refs to keep latest values inside event handlers without reattaching listeners
  const rotationRef = useRef(rotation);
  const scaleRef = useRef(scale);
  const countriesRef = useRef(countries);
  const admin1TopoRef = useRef(admin1Topo);

  useEffect(() => { rotationRef.current = rotation; }, [rotation]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { countriesRef.current = countries; }, [countries]);
  useEffect(() => { admin1TopoRef.current = admin1Topo; }, [admin1Topo]);

  // 자동 LOD 전환은 사용하지 않습니다. (클릭 시 디테일 표시)

  // Dedicated loaders to keep base datasets available
  const loadCountries = async () => {
    try {
      setLoadingStatus('Loading countries (50m, detailed)...');
      // Try 50m first (matches D3 GEO view), then fall back
      const tryFetch = async (url: string) => {
        try {
          const r = await fetch(url);
          if (!r.ok) return null;
          return await r.json();
        } catch { return null; }
      };
      let raw: any = await tryFetch('/geodata/countries-50m.json');
      if (!raw) raw = await tryFetch('/geodata/countries-110m.json');
      if (!raw) raw = await tryFetch('/atlas/countries-110m.json');
      if (!raw) raw = await tryFetch('/atlas/ne_110m_admin_0_countries.geojson');
      if (!raw) throw new Error('No countries dataset available');
      let feats: any[] = [];
      if (raw.type === 'FeatureCollection') {
        feats = raw.features || [];
      } else if (raw.type === 'Topology' && raw.objects) {
        const keys = Object.keys(raw.objects);
        const pick = keys.find(k => k.toLowerCase().includes('countries'))
          || keys.find(k => k.toLowerCase().includes('admin_0'))
          || keys[0];
        const fc: any = topojson.feature(raw, (raw.objects as any)[pick]);
        feats = fc.features || [];
      }
      setCountries(feats);
      setLoadingStatus(`✅ Countries (detailed) ready (${feats.length})`);
    } catch (e:any) {
      console.error('Failed to load countries', e);
      setLoadingStatus(`❌ Countries load failed: ${e.message || e}`);
    }
  };

  const loadAdmin1 = async (): Promise<any | null> => {
    try {
      setLoadingStatus('Loading Admin-1 20% TopoJSON...');
      const res = await fetch('/atlas/simplified-admin1-10m-20pct-q.topo.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const topology = await res.json();
      setAdmin1Topo(topology);
      setLoadingStatus('✅ Admin-1 data ready');
      return topology;
    } catch (e:any) {
      console.error('Failed to load admin-1', e);
      setLoadingStatus(`❌ Admin-1 load failed: ${e.message || e}`);
      return null;
    }
  };

  // (legacy loader removed)

  // Render globe and features with Canvas for better performance
  const renderGlobe = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get full screen size
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Large orthographic projection with zoom, fixed center
    const projection = d3.geoOrthographic()
      .scale(scale * Math.min(width, height))
      .translate([width / 2, height / 2])
      .rotate([rotation.x, -rotation.y]);

    const path = d3.geoPath().projection(projection).context(ctx);

    // Draw white sphere background
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    path({ type: 'Sphere' });
    ctx.fill();
    ctx.stroke();

  // Graticule removed per request

    // Base: draw country boundaries
    if (countries.length > 0) {
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 0.9;
      countries.forEach((feature: any) => {
        // fill hovered country white beneath stroke
        const isHover = hoverCountry && feature === hoverCountry;
        if (isHover) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          path(feature);
          ctx.fill();
        }
        ctx.beginPath();
        path(feature);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    // Selected overlay mesh for a specific country (emphasized)
    if (admin1OverlayMesh) {
      ctx.save();
      ctx.strokeStyle = '#000';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      path(admin1OverlayMesh as any);
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  };

  // Initial load of datasets
  useEffect(() => {
    loadCountries();
  }, []);

  // Update LOD level based on scale
  // No auto LOD switching; details shown only on click

  // Handle window resize and initial render
  useEffect(() => {
    renderGlobe();
    const handleResize = () => renderGlobe();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [rotation, scale, countries, admin1OverlayMesh, hoverCountry]);

  // Helpers for click-to-center zoom
  const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const shortestDeltaDeg = (from: number, to: number) => {
    let d = to - from;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  };
  const animateTo = (targetRot: {x:number;y:number}, targetScale: number, duration = 800) => {
    const startRot = { x: rotationRef.current.x, y: rotationRef.current.y };
    const startScale = scaleRef.current;
    const dx = shortestDeltaDeg(startRot.x, targetRot.x);
    const dy = shortestDeltaDeg(startRot.y, targetRot.y);
    const ds = targetScale - startScale;
    const t0 = performance.now();
    animatingRef.current = true;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const e = easeInOutCubic(t);
      setRotation({ x: startRot.x + dx * e, y: startRot.y + dy * e });
      setScale(Math.max(0.5, Math.min(2.0, startScale + ds * e)));
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        animatingRef.current = false;
      }
    };
    requestAnimationFrame(step);
  };
  const computeFitScale = (feature: any, targetRot: {x:number;y:number}, width: number, height: number) => {
    const minWH = Math.min(width, height);
    // Binary search for the largest scale that keeps feature within 85% of minWH
    let lo = 0.6, hi = 2.0, best = scaleRef.current;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      const projection = d3.geoOrthographic()
        .scale(mid * minWH)
        .translate([width / 2, height / 2])
        .rotate([targetRot.x, -targetRot.y]);
      const path = d3.geoPath().projection(projection as any);
      const b = path.bounds(feature as any);
      const w = b[1][0] - b[0][0];
      const h = b[1][1] - b[0][1];
      const maxDim = Math.max(w, h);
      if (maxDim <= 0.85 * minWH) { best = mid; lo = mid; } else { hi = mid; }
    }
    return Math.max(0.5, Math.min(2.0, best));
  };

  // Mouse interactions: drag for rotation, wheel for zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    let isDragging = false;
    let lastMouse = { x: 0, y: 0 };
    let moved = 0;

    const handleMouseDown = (event: MouseEvent) => {
      if (animatingRef.current) return;
      isDragging = true;
      lastMouse = { x: event.clientX, y: event.clientY };
      canvas.style.cursor = 'grabbing';
      moved = 0;
    };

    let hoverRAF = 0;
    const handleMouseMove = (event: MouseEvent) => {
      if (isDragging) {
        const dx = event.clientX - lastMouse.x;
        const dy = event.clientY - lastMouse.y;
        
        // Rotate
        const sensitivity = 0.25;
        setRotation(prev => ({
          x: prev.x + dx * sensitivity,
          y: Math.max(-90, Math.min(90, prev.y + dy * sensitivity))
        }));
        
        lastMouse = { x: event.clientX, y: event.clientY };
        moved += Math.abs(dx) + Math.abs(dy);
      } else {
        if (animatingRef.current) return;
        // Hover detection when not dragging
        if (hoverRAF) cancelAnimationFrame(hoverRAF);
        hoverRAF = requestAnimationFrame(() => {
          const rect = canvas.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          const width = rect.width;
          const height = rect.height;
          const projection = d3.geoOrthographic()
            .scale(scaleRef.current * Math.min(width, height))
            .translate([width / 2, height / 2])
            .rotate([rotationRef.current.x, -rotationRef.current.y]);
          const inv = (projection as any).invert?.bind(projection);
          const p = inv ? inv([x, y]) : null;
          if (!p || !countriesRef.current.length) {
            setHoverInfo(null);
            setHoverCountry(null);
            setHoverFlagUrl(null);
            if (hoverAbortRef.current) hoverAbortRef.current.abort();
          } else {
            let found: any = null;
            for (let i = 0; i < countriesRef.current.length; i++) {
              if (d3.geoContains(countriesRef.current[i], p)) { found = countriesRef.current[i]; break; }
            }
            if (found) {
              const name = (found.properties && (found.properties.name || found.properties.ADMIN || found.properties.admin)) || 'Unknown';
              setHoverInfo({ x: event.clientX + 12, y: event.clientY + 12, text: name });
              setHoverCountry(found);
              // Resolve flag URL quickly via ISO2 (FlagCDN) or fallback to REST
              const prop = found.properties || {};
              const iso2 = (prop.iso_a2 || prop.ISO_A2 || prop.adm0_a2 || prop.ADM0_A2 || prop.A2) as string | undefined;
              const iso3 = (prop.iso_a3 || prop.ISO_A3 || prop.adm0_a3 || prop.ADM0_A3) as string | undefined;
              const normalizedISO2 = (iso2 && /^[A-Z]{2}$/i.test(iso2)) ? String(iso2).toLowerCase() : undefined;
              const normalizedISO3 = (iso3 && /^[A-Z]{3}$/i.test(iso3) && iso3 !== '-99') ? String(iso3).toUpperCase() : undefined;
              const kosovoA2 = (normalizedISO3 === 'XKX') ? 'xk' : undefined;
              const key = (normalizedISO2 || kosovoA2 || normalizedISO3 || name) as string;
              const cached = flagCache.get(key);
              if (cached) {
                setHoverFlagUrl(cached.url);
              } else if (normalizedISO2 || kosovoA2) {
                const code2 = (normalizedISO2 || kosovoA2)!;
                const url = `https://flagcdn.com/w24/${code2}.png`;
                flagCache.set(key, { url });
                setHoverFlagUrl(url);
              } else if (normalizedISO3) {
                if (hoverFetchTimeoutRef.current) window.clearTimeout(hoverFetchTimeoutRef.current);
                hoverFetchTimeoutRef.current = window.setTimeout(() => {
                  if (hoverAbortRef.current) hoverAbortRef.current.abort();
                  const ctl = new AbortController();
                  hoverAbortRef.current = ctl;
                  fetch(`https://restcountries.com/v3.1/alpha/${encodeURIComponent(normalizedISO3)}`, { signal: ctl.signal })
                    .then(r => r.ok ? r.json() : null)
                    .then((j:any) => {
                      if (!j) return;
                      const entry = Array.isArray(j) ? j[0] : j;
                      const a2 = (entry?.cca2 && typeof entry.cca2 === 'string') ? String(entry.cca2).toLowerCase() : undefined;
                      const url = a2 ? `https://flagcdn.com/w24/${a2}.png` : (entry?.flags?.png as string | undefined);
                      if (url) { flagCache.set(key, { url }); setHoverFlagUrl(url); }
                    })
                    .catch(() => {});
                }, 120);
              } else {
                // fallback by name (fullText) with debounce
                if (hoverFetchTimeoutRef.current) window.clearTimeout(hoverFetchTimeoutRef.current);
                hoverFetchTimeoutRef.current = window.setTimeout(() => {
                  if (hoverAbortRef.current) hoverAbortRef.current.abort();
                  const ctl = new AbortController();
                  hoverAbortRef.current = ctl;
                  fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(name)}?fullText=true`, { signal: ctl.signal })
                    .then(r => r.ok ? r.json() : null)
                    .then((j:any) => {
                      if (!j || !j[0]) return;
                      const a2 = (j[0]?.cca2 && typeof j[0].cca2 === 'string') ? String(j[0].cca2).toLowerCase() : undefined;
                      const url = a2 ? `https://flagcdn.com/w24/${a2}.png` : (j[0]?.flags?.png as string | undefined);
                      if (url) { flagCache.set(key, { url }); setHoverFlagUrl(url); }
                    })
                    .catch(() => {});
                }, 160);
              }
            } else {
              setHoverInfo(null);
              setHoverCountry(null);
              setHoverFlagUrl(null);
              if (hoverAbortRef.current) hoverAbortRef.current.abort();
            }
          }
        });
      }
    };

    const handleMouseUp = () => {
      isDragging = false;
      canvas.style.cursor = 'grab';
    };

    const handleClick = async (event: MouseEvent) => {
  if (animatingRef.current) return;
  if (moved > 5) return; // ignore drags
      if (!countriesRef.current.length) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const width = rect.width;
      const height = rect.height;
      const projection = d3.geoOrthographic()
        .scale(scaleRef.current * Math.min(width, height))
        .translate([width / 2, height / 2])
        .rotate([rotationRef.current.x, -rotationRef.current.y]);
      const inv = (projection as any).invert?.bind(projection);
      const p = inv ? inv([x, y]) : null;
      if (!p) return;
      let countryFeature: any | null = null;
      for (let i = 0; i < countriesRef.current.length; i++) {
        if (d3.geoContains(countriesRef.current[i], p)) {
          countryFeature = countriesRef.current[i];
          break;
        }
      }
      if (!countryFeature) return;
      const countryName = (countryFeature.properties && (countryFeature.properties.name || countryFeature.properties.ADMIN || countryFeature.properties.admin)) || 'Unknown';
      setSelectedCountry(countryName);

      const cached = admin1OverlayCacheRef.current.get(countryName);
      if (cached) {
        setAdmin1OverlayMesh(cached);
        return;
      }
      try {
        let topology = admin1TopoRef.current;
        if (!topology) {
          topology = await loadAdmin1();
          if (!topology) return;
        }
        const objectKey = topology.objects.ne_10m_admin_1_states_provinces ? 'ne_10m_admin_1_states_provinces' : Object.keys(topology.objects)[0];
        const topoObj = topology.objects[objectKey];
        const geoms: any[] = topoObj.geometries || [];
        const subsetGeoms: any[] = [];
        for (let i = 0; i < geoms.length; i++) {
          const g = geoms[i];
          try {
            const fc = topojson.feature(topology, { type: 'GeometryCollection', geometries: [g] } as any) as any;
            const feat = fc.type === 'FeatureCollection' ? fc.features[0] : fc;
            const c = d3.geoCentroid(feat as any);
            if (c && d3.geoContains(countryFeature, c)) subsetGeoms.push(g);
          } catch {
            // ignore
          }
        }
        if (!subsetGeoms.length) return;
        const subsetObj = { type: 'GeometryCollection', geometries: subsetGeoms } as any;
        const mesh = topojson.mesh(topology, subsetObj, (a: any, b: any) => a !== b);
        admin1OverlayCacheRef.current.set(countryName, mesh as any);
        setAdmin1OverlayMesh(mesh as any);
      } catch (e) {
        console.error('Overlay mesh error', e);
      }

      // Animate center/zoom to the clicked country
      try {
        const centroid = d3.geoCentroid(countryFeature as any) as [number, number];
        const targetRot = { x: -centroid[0], y: centroid[1] };
        const targetScale = computeFitScale(countryFeature, targetRot, width, height);
        animateTo(targetRot, targetScale, 900);
      } catch {}
    };

    const handleWheel = (event: WheelEvent) => {
      // Only zoom if mouse is over canvas
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      if (mouseX >= 0 && mouseX <= rect.width && mouseY >= 0 && mouseY <= rect.height) {
        event.preventDefault();
        const zoomFactor = 0.05;
        const delta = event.deltaY > 0 ? -zoomFactor : zoomFactor;
        setScale(prevScale => {
          const newScale = Math.max(0.5, Math.min(2.0, prevScale + delta));
          // Zoom towards mouse direction by adjusting rotation
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;
          const dirX = (mouseX - centerX) / centerX; // -1 to 1
          const dirY = (mouseY - centerY) / centerY; // -1 to 1
          const rotateFactor = 0.1 * (newScale - prevScale);
          setRotation(prev => ({
            x: prev.x + dirX * rotateFactor,
            y: Math.max(-90, Math.min(90, prev.y - dirY * rotateFactor))
          }));
          return newScale;
        });
      }
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('click', handleClick);
    window.addEventListener('wheel', handleWheel);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('click', handleClick);
      window.removeEventListener('wheel', handleWheel);
    };
  }, []);

  return (
    <div style={{ 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      width: '100vw', 
      height: '100vh', 
      backgroundColor: '#ffffff',
      overflow: 'hidden'
    }}>
      {/* Control panel */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        zIndex: 1000,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        padding: '20px',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        maxWidth: '320px',
        maxHeight: '80vh',
        overflowY: 'auto'
      }}>
        <h2 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 'bold' }}>
          City Boundaries Globe
        </h2>
        <div style={{ color: '#666', marginBottom: '15px', fontSize: '14px' }}>
          Status: {loadingStatus} | 상세도: 국가(50m) · 국가 클릭 시 주/성 디테일
        </div>
        <div style={{ 
          marginTop: '15px', 
          fontSize: '12px', 
          color: '#666',
          lineHeight: '1.4'
        }}>
          • 드래그: 지구본 회전<br/>
          • 마우스 휠: 커서 방향으로 확대/축소<br/>
          • 자동 상세도 전환 없음 (국가 클릭 시만 상세 표시)<br/>
          • 국가 위에 마우스를 올리면 이름 표시<br/>
          • 국가를 클릭하면 해당 국가의 주/성 경계를 강조 표시
        </div>
        {selectedCountry && (
          <div style={{ marginTop: '10px' }}>
            <div style={{ fontSize: '12px', color: '#333' }}>선택된 국가: {selectedCountry}</div>
            <button
              style={{ marginTop: '6px', fontSize: '12px', padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc', background: '#f7f7f7', cursor: 'pointer' }}
              onClick={() => { setSelectedCountry(null); setAdmin1OverlayMesh(null); }}
            >
              강조 해제
            </button>
          </div>
        )}
      </div>
      
      {/* Globe */}
      <canvas 
        ref={canvasRef} 
        style={{ 
          cursor: 'grab',
          display: 'block'
        }}
      />

      {/* Tooltip */}
      {hoverInfo && (
        <div
          style={{
            position: 'fixed',
            left: hoverInfo.x,
            top: hoverInfo.y,
            padding: '6px 8px',
            background: 'rgba(0,0,0,0.75)',
            color: '#fff',
            borderRadius: 6,
            fontSize: 12,
            pointerEvents: 'none',
            zIndex: 1001
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {hoverFlagUrl && (
              <img
                src={hoverFlagUrl}
                alt="flag"
                width={18}
                height={12}
                style={{ display: 'block', borderRadius: 2 }}
              />
            )}
            <span>{hoverInfo.text}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default D3GeoGlobeSimplified;
