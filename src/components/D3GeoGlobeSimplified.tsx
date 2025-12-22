import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { Exhibition } from '../types/Exhibition';
import { exhibitions as exhibitionsData } from '../data/exhibitions';
import * as topojson from 'topojson-client';

type D3GeoGlobeSimplifiedProps = {
  exhibitions?: Exhibition[];
  onSelectExhibition?: (ex: Exhibition) => void;
  panOffset?: number; // horizontal offset in pixels when detail panel is open
};

const D3GeoGlobeSimplified: React.FC<D3GeoGlobeSimplifiedProps> = ({ exhibitions, onSelectExhibition, panOffset = 0 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const perfOverlayRef = useRef<HTMLDivElement | null>(null);
  const perfStatsRef = useRef({ fps: 0, frameTime: 0, lastFrame: 0, frameCount: 0 });
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  // Removed UI status panel
  // Legacy holder removed; we render directly from datasets
  const MIN_ZOOM = 0.95; // 가장 줌아웃 (요청에 따라 0.95로 제한)
  const MAX_ZOOM = 100.0; // 줌인 사실상 무제한에 가깝게 확대 허용
  const [scale, setScale] = useState<number>(MIN_ZOOM); // 첫 로드 시 최저 배율로 시작
  // 통일된 선(Stroke) 기본 불투명도 (요청: 약 90%)
  const BASE_STROKE_OPACITY = 0.9;

  // Store panOffset in ref for use in projection without causing full re-render
  const panOffsetRef = useRef(panOffset);
  useEffect(() => { panOffsetRef.current = panOffset; }, [panOffset]);

  // Always-available datasets for interactions
  const [countries, setCountries] = useState<any[]>([]);
  const [admin1Topo, setAdmin1Topo] = useState<any | null>(null);
  // Removed selectedCountry panel state
  const admin1OverlayCacheRef = useRef<Map<string, any>>(new Map());
  const admin1SubsetCacheRef = useRef<Map<string, any[]>>(new Map());
  const admin1SubsetFeaturesRef = useRef<any[] | null>(null);
  const [admin1OverlayMesh, setAdmin1OverlayMesh] = useState<any | null>(null);
  const admin1OverlayMeshRef = useRef<any | null>(null);
  const DRAW_ADMIN1 = false; // 도시 경계 숨김 (코드 유지)
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; text: string } | null>(null);
  const [hoverCountry, setHoverCountry] = useState<any | null>(null);
  const [flagCache] = useState<Map<string, { url: string }>>(new Map());
  const [hoverFlagUrl, setHoverFlagUrl] = useState<string | null>(null);
  const animatingRef = useRef(false);
  const frozenClusterKeyRef = useRef<string | null>(null); // Freeze cluster during zoom animation
  const clusterTransitionInProgressRef = useRef<boolean>(false); // Track if cluster split/merge animation is in progress
  const hoverFetchTimeoutRef = useRef<number | null>(null);
  const hoverAbortRef = useRef<AbortController | null>(null);
  const [projTranslate, setProjTranslate] = useState<[number, number] | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const pinsSvgRef = useRef<SVGSVGElement | null>(null);
  const gPinsRef = useRef<SVGGElement | null>(null);
  const expandedClustersRef = useRef<Set<string>>(new Set());
  const animateExpandKeyRef = useRef<string | null>(null);
  const collapseAnimKeyRef = useRef<string | null>(null);
  const collapsePendingRef = useRef<number>(0);
  const collapseFinalizedRef = useRef<boolean>(false);
  const lastPinsKeyRef = useRef<string>('');
  const expandedLayoutCacheRef = useRef<Map<string, any>>(new Map());
  // Store merged cluster items for expansion (when clicking merged cluster at high zoom)
  const mergedItemsForExpansionRef = useRef<Map<string, any[]>>(new Map());
  const onSelectExhibitionRef = useRef<typeof onSelectExhibition | undefined>(onSelectExhibition);
  useEffect(() => { onSelectExhibitionRef.current = onSelectExhibition; }, [onSelectExhibition]);

  // Cluster mode toggle: true = cluster mode, false = individual pins
  const [clusterMode, setClusterMode] = useState(true);
  const prevClusterModeRef = useRef(clusterMode);
  // Track if user is dragging to prevent cluster collapse during drag
  const isDraggingRef = useRef(false);
  // Track if last mouseup was from a drag (to ignore the click event that follows)
  const wasDraggingRef = useRef(false);

  // Refs to keep latest values inside event handlers without reattaching listeners
  const rotationRef = useRef(rotation);
  const scaleRef = useRef(scale);
  const prevScaleForMergeRef = useRef(scale); // Track previous scale to detect threshold crossing
  const countriesRef = useRef(countries);
  const admin1TopoRef = useRef(admin1Topo);
  const translateRef = useRef<[number, number] | null>(null);

  useEffect(() => { rotationRef.current = rotation; }, [rotation]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { countriesRef.current = countries; }, [countries]);
  useEffect(() => { admin1TopoRef.current = admin1Topo; }, [admin1Topo]);
  useEffect(() => { translateRef.current = projTranslate; }, [projTranslate]);
  useEffect(() => { admin1OverlayMeshRef.current = admin1OverlayMesh; }, [admin1OverlayMesh]);

  // 자동 LOD 전환은 사용하지 않습니다. (클릭 시 디테일 표시)

  // Chaikin smoothing algorithm - makes polygon edges curved
  const chaikinSmooth = (coords: number[][], iterations: number = 2): number[][] => {
    if (coords.length < 3) return coords;

    let result = coords;
    for (let iter = 0; iter < iterations; iter++) {
      const smoothed: number[][] = [];
      for (let i = 0; i < result.length; i++) {
        const p0 = result[i];
        const p1 = result[(i + 1) % result.length];

        // Q point at 1/4
        const q: number[] = [
          0.75 * p0[0] + 0.25 * p1[0],
          0.75 * p0[1] + 0.25 * p1[1]
        ];
        // R point at 3/4
        const r: number[] = [
          0.25 * p0[0] + 0.75 * p1[0],
          0.25 * p0[1] + 0.75 * p1[1]
        ];

        smoothed.push(q, r);
      }
      result = smoothed;
    }
    return result;
  };

  // Apply smoothing to a geometry
  const smoothGeometry = (geometry: any): any => {
    if (!geometry) return geometry;

    if (geometry.type === 'Polygon') {
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((ring: number[][]) => chaikinSmooth(ring, 2))
      };
    } else if (geometry.type === 'MultiPolygon') {
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((polygon: number[][][]) =>
          polygon.map((ring: number[][]) => chaikinSmooth(ring, 2))
        )
      };
    }
    return geometry;
  };

  // Dedicated loaders to keep base datasets available
  const loadCountries = async () => {
    try {
      // 단순화 버전: 가장 가벼운 110m 해상도만 사용 (line 맵 수준으로 경량화)
      const tryFetch = async (url: string) => {
        try {
          const r = await fetch(url);
          if (!r.ok) return null;
          return await r.json();
        } catch { return null; }
      };
      let raw: any = await tryFetch('/geodata/countries-110m.json');
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

      // Precompute lon/lat bounding boxes for quick reject on hit-tests AND apply smoothing
      feats.forEach((f: any) => {
        try {
          // Apply Chaikin smoothing for curved edges
          f.geometry = smoothGeometry(f.geometry);
        } catch { }
        try { (f as any)._bbox = d3.geoBounds(f); } catch { /* ignore */ }
      });
      setCountries(feats);
    } catch (e: any) {
      console.error('Failed to load countries', e);
    }
  };

  const loadAdmin1 = async (): Promise<any | null> => {
    try {
      // status: loading admin-1 topo
      const res = await fetch('/atlas/simplified-admin1-10m-20pct-q.topo.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const topology = await res.json();
      setAdmin1Topo(topology);
      return topology;
    } catch (e: any) {
      console.error('Failed to load admin-1', e);
      return null;
    }
  };

  // (legacy loader removed)

  // Canvas size cache to avoid expensive resize operations every frame
  const canvasSizeRef = useRef({ width: 0, height: 0, dpr: 1 });

  // Setup canvas size (expensive - only on resize)
  const setupCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    // Only resize if dimensions changed
    if (canvasSizeRef.current.width !== width || canvasSizeRef.current.height !== height) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      canvasSizeRef.current = { width, height, dpr };
    }
  };

  // Render globe and features with Canvas for better performance
  const renderGlobe = () => {
    const t0 = performance.now();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use cached dimensions (no expensive resize)
    const { width, height, dpr } = canvasSizeRef.current;
    if (width === 0 || height === 0) return; // Not yet initialized

    // Reset transform and clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Large orthographic projection with zoom, fixed center
    // NOTE: panOffset is handled via CSS transform on wrapper, not here
    const tx = (translateRef.current?.[0] ?? (width / 2));
    const ty = (translateRef.current?.[1] ?? (height / 2));
    const projection = d3.geoOrthographic()
      .scale(scaleRef.current * 0.5 * Math.min(width, height))
      .translate([tx, ty])
      .rotate([rotationRef.current.x, -rotationRef.current.y])
      .precision(0.25); // finer resampling for smoother coastlines

    const path = d3.geoPath().projection(projection).context(ctx);

    // Draw white sphere background
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.8; // 글로브 테두리 더 얇게
    ctx.beginPath();
    path({ type: 'Sphere' });
    ctx.fill();
    ctx.save();
    ctx.globalAlpha = BASE_STROKE_OPACITY; // 테두리만 90%
    ctx.stroke();
    ctx.restore();

    // Graticule removed per request

    // Base: draw country boundaries
    if (countriesRef.current.length > 0) {
      ctx.lineWidth = 0.8;
      ctx.lineJoin = 'round'; // Rounded joins
      ctx.lineCap = 'round';  // Rounded caps
      countriesRef.current.forEach((feature: any) => {
        const isHover = hoverCountry && feature === hoverCountry;
        if (isHover) {
          // Hover fill 은 100% 불투명 유지
          ctx.save();
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = 1;
          ctx.beginPath();
          path(feature);
          ctx.fill();
          ctx.restore();
        }
        ctx.beginPath();
        path(feature);
        ctx.save();
        ctx.globalAlpha = BASE_STROKE_OPACITY; // 국경선 90%
        ctx.strokeStyle = isHover ? '#444444' : '#111111';
        ctx.stroke();
        ctx.restore();
      });
    }

    // Selected overlay mesh for a specific country (emphasized)
    if (DRAW_ADMIN1 && admin1OverlayMeshRef.current) {
      ctx.save();
      ctx.strokeStyle = '#000';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.5; // Reduced opacity to 50% per user request
      ctx.beginPath();
      path(admin1OverlayMeshRef.current as any);
      ctx.stroke();
      ctx.restore();
    }

    // 프레임/시간 표시 업데이트
    const t1 = performance.now();
    const stats = perfStatsRef.current;
    stats.frameTime = t1 - t0;
    stats.frameCount += 1;
    const now = t1;
    if (now - stats.lastFrame > 400) {
      const elapsed = Math.max(1, now - stats.lastFrame);
      stats.fps = Math.round((stats.frameCount / elapsed) * 1000);
      stats.lastFrame = now;
      stats.frameCount = 0;
      if (perfOverlayRef.current) {
        perfOverlayRef.current.innerHTML = `<div>FPS: ${stats.fps}</div><div>Frame: ${stats.frameTime.toFixed(1)}ms</div>`;
        perfOverlayRef.current.style.color = stats.fps >= 50 ? '#10b981' : stats.fps >= 30 ? '#f59e0b' : '#ef4444';
      }
    }
  };

  // Initial load of datasets
  useEffect(() => {
    loadCountries();
  }, []);

  // 성능 오버레이 생성 (line 맵과 동일하게 하단 좌측 고정)
  useEffect(() => {
    const div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.bottom = '80px';
    div.style.left = '16px';
    div.style.background = 'rgba(0,0,0,0.8)';
    div.style.color = '#ef4444';
    div.style.padding = '8px 12px';
    div.style.borderRadius = '8px';
    div.style.fontFamily = 'monospace';
    div.style.fontSize = '14px';
    div.style.zIndex = '9999';
    div.style.pointerEvents = 'none';
    div.innerHTML = '<div>FPS: --</div><div>Frame: --ms</div>';
    document.body.appendChild(div);
    perfOverlayRef.current = div;
    return () => {
      try { div.remove(); } catch { /* ignore */ }
      perfOverlayRef.current = null;
    };
  }, []);

  // Prefetch admin1 topology on idle for faster first click
  useEffect(() => {
    if (!countries.length || admin1TopoRef.current) return;
    const prefetch = () => { loadAdmin1(); };
    const ric = (window as any).requestIdleCallback as ((cb: () => void, opts?: any) => number) | undefined;
    let id: number | null = null;
    if (ric) {
      id = ric(prefetch);
      return () => { if (id && (window as any).cancelIdleCallback) (window as any).cancelIdleCallback(id); };
    } else {
      const t = window.setTimeout(prefetch, 1200);
      return () => window.clearTimeout(t);
    }
  }, [countries]);

  // Update LOD level based on scale
  // No auto LOD switching; details shown only on click

  // Handle window resize and initial render
  useEffect(() => {
    setupCanvas(); // Set canvas size initially
    renderGlobe();
    const handleResize = () => {
      setupCanvas(); // Only resize canvas on window resize
      renderGlobe();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [rotation, scale, countries, admin1OverlayMesh, hoverCountry, projTranslate, panOffset]);

  // Build projection for external uses (pins)
  const getProjection = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    // NOTE: panOffset is handled via CSS transform on wrapper, not here
    const tx = (translateRef.current?.[0] ?? width / 2);
    const ty = (translateRef.current?.[1] ?? height / 2);
    return d3.geoOrthographic()
      .scale(scaleRef.current * 0.5 * Math.min(width, height))
      .translate([tx, ty])
      .rotate([rotationRef.current.x, -rotationRef.current.y])
      .precision(2.0);
  };

  // Extract country name from exhibition location
  const extractCountry = (d: any): string => {
    // First check direct country field
    if (d.country && typeof d.country === 'string') {
      return d.country;
    }
    
    const s = d.location;
    if (typeof s !== 'string') return '';
    const raw = s.toLowerCase();
    
    // Known country patterns
    if (raw.includes('uk') || raw.includes('united kingdom') || raw.includes('england') || raw.includes('scotland') || raw.includes('wales')) return 'United Kingdom';
    if (raw.includes('서울') || raw.includes('korea') || raw.includes('한국')) return 'South Korea';
    if (raw.includes('france') || raw.includes('paris')) return 'France';
    if (raw.includes('usa') || raw.includes('united states') || raw.includes('america')) return 'United States';
    if (raw.includes('germany') || raw.includes('deutschland')) return 'Germany';
    if (raw.includes('italy') || raw.includes('italia')) return 'Italy';
    if (raw.includes('spain') || raw.includes('españa')) return 'Spain';
    if (raw.includes('japan') || raw.includes('日本')) return 'Japan';
    if (raw.includes('china') || raw.includes('中国')) return 'China';
    if (raw.includes('netherlands') || raw.includes('holland')) return 'Netherlands';
    
    return '';
  };

  // Cluster preparation
  const CLUSTER_GRID_SIZE = 0.8;
  const roundToGrid = (v: number) => Math.round(v / CLUSTER_GRID_SIZE) * CLUSTER_GRID_SIZE;

  const normalizeCity = (d: any) => {
    // 1. Check direct region field first
    if (d.region) {
      const r = d.region.toLowerCase();
      if (r.includes('london')) return 'london';
      return r.split(',')[0].trim();
    }
    // 2. Check city field if exists
    if (d.city) return d.city.toLowerCase().trim();

    // 3. Fallback to location parsing
    const s = d.location;
    if (typeof s !== 'string') return '';
    const raw = s.toLowerCase();

    // Known major cities override
    if (raw.includes('london')) return 'london';
    if (raw.includes('seoul') || raw.includes('서울')) return 'seoul';
    if (raw.includes('manchester')) return 'manchester';
    if (raw.includes('liverpool')) return 'liverpool';
    if (raw.includes('edinburgh')) return 'edinburgh';
    if (raw.includes('cambridge')) return 'cambridge';
    if (raw.includes('oxford')) return 'oxford';
    if (raw.includes('paris')) return 'paris';
    if (raw.includes('new york')) return 'new york';

    // Generic parse: take last significant word block that isn't a country
    const parts = raw.split(/[,:]/).map((p: string) => p.trim()).filter((p: string) => p && !/\d/.test(p)); // Filter out parts with numbers (postcodes)
    const stopWords = new Set(['uk', 'united kingdom', 'england', 'scotland', 'wales', 'gb', 'usa', 'united states', 'korea']);

    while (parts.length && stopWords.has(parts[parts.length - 1])) {
      parts.pop();
    }
    if (parts.length) return parts[parts.length - 1];
    return '';
  };

  type ClusterInfo = { key: string; items: Exhibition[]; centerLon: number; centerLat: number; sortedByName: Exhibition[] };
  const clustersListRef = useRef<ClusterInfo[] | null>(null);

  // Re-compute clusters with splitting logic
  if (true) {
    const list = (exhibitions && exhibitions.length ? exhibitions : (exhibitionsData as Exhibition[]));
    const map: Record<string, Exhibition[]> = {};

    // Initial grouping - 반드시 국가별로 먼저 분리
    for (const d of list) {
      const country = (d as any).country || extractCountry(d) || 'unknown';
      const cityKey = normalizeCity(d);
      let key: string;
      if (cityKey) {
        // 국가 + 도시로 클러스터 키 생성 (다른 나라 절대 합쳐지지 않음)
        key = `${country}::city:${cityKey}`;
      } else {
        const gridLon = roundToGrid(d.longitude);
        const gridLat = roundToGrid(d.latitude);
        // 국가 + 그리드로 클러스터 키 생성
        key = `${country}::grid:${gridLon},${gridLat}`;
      }
      (map[key] ||= []).push(d);
    }

    // No longer splitting large clusters - keep all items together
    clustersListRef.current = Object.entries(map).map(([key, items]) => ({
      key,
      items,
      centerLon: d3.mean(items as any, (d: any) => d.longitude) as number,
      centerLat: d3.mean(items as any, (d: any) => d.latitude) as number,
      sortedByName: [...items].sort((a: any, b: any) => String(a.name || a.title).localeCompare(String(b.name || b.title)))
    }));
  }

  // Handle resize and document click
  useEffect(() => {
    const onResize = () => {
      if (!pinsSvgRef.current) return;
      d3.select(pinsSvgRef.current).attr('width', window.innerWidth).attr('height', window.innerHeight);
      renderPins();
    };
    const onDocClick = (e: MouseEvent) => {
      // Don't collapse cluster during drag or immediately after drag ended
      if (isDraggingRef.current) return;
      if (wasDraggingRef.current) {
        wasDraggingRef.current = false; // Reset so next click works
        return;
      }
      if (!expandedClustersRef.current.size) return;
      const target = e.target as Element | null;
      if (target && (target.closest('.pin') || target.closest('.pins-overlay'))) {
        // Clicked within pins overlay; if it hit empty svg region (no pin), collapse
        if (target.classList.contains('pins-overlay')) {
          const key = Array.from(expandedClustersRef.current)[0];
          collapseAnimKeyRef.current = key;
          collapseFinalizedRef.current = false;
          lastPinsKeyRef.current = '';
          renderPins();
        }
        return;
      }
      // Outside anywhere: collapse
      const key = Array.from(expandedClustersRef.current)[0];
      collapseAnimKeyRef.current = key;
      collapseFinalizedRef.current = false;
      lastPinsKeyRef.current = '';
      renderPins();
    };
    window.addEventListener('resize', onResize);
    document.addEventListener('click', onDocClick, true);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('click', onDocClick, true);
    };
  }, []);

  // Render pins on view changes
  const renderPins = (fastUpdate = false) => {
    if (!pinsSvgRef.current || !gPinsRef.current || !clustersListRef.current) return;

    const proj = getProjection();
    const rot = proj.rotate() as [number, number, number];
    // Include scale in key but force re-render for zoom-based city name visibility
    const showCityNames = scaleRef.current > 3;
    const key = `${rot[0].toFixed(1)},${rot[1].toFixed(1)},${scaleRef.current.toFixed(2)},${(translateRef.current || []).join(',')},${clusterMode},${showCityNames}`;
    
    // Helper: spread expanded items progressively as zoom increases
    const getExpandedSpread = (s: number) => {
      // 0 at ~1.15x, 1 at ~3.45x, clamped
      const t = (s - 1.15) / 2.3;
      return Math.max(0, Math.min(1, t));
    };

    // During fast update (animation), only update transforms, don't rebuild
    const g = d3.select(gPinsRef.current);
    
    if (fastUpdate) {
      // Fast path: just update existing pin positions without remove/re-add
      const existingPins = g.selectAll<SVGGElement, any>('g.pin');
      if (existingPins.size() > 0) {
        const spread = getExpandedSpread(scaleRef.current);
        existingPins.each(function(d: any) {
          if (!d) return;

          // Skip pins that are currently animating (have _originX set from expand animation)
          // The D3 transition will handle their position/opacity
          if (d._originX != null || d._collapsing) {
            return;
          }

          // Expanded pins are laid out relative to a cluster center; update using stored offsets.
          if (d._expanded && d._layoutKey && typeof d._dx === 'number' && typeof d._dy === 'number') {
            const layout = expandedLayoutCacheRef.current.get(String(d._layoutKey));
            const center = layout ? (proj([layout.centerLon, layout.centerLat]) as [number, number] | null) : null;
            if (center && Number.isFinite(center[0]) && Number.isFinite(center[1])) {
              const x = center[0] + d._dx * spread;
              const y = center[1] + d._dy * spread;
              const sel = d3.select(this);
              sel.attr('transform', `translate(${x}, ${y})`);
              // Fade in as zoom progresses: opacity follows spread
              sel.style('opacity', Math.max(0.1, spread));

              // Keep the link/anchor pointing to the original museum location.
              const anchorP = proj([d.longitude, d.latitude]) as [number, number] | null;
              if (anchorP && Number.isFinite(anchorP[0]) && Number.isFinite(anchorP[1])) {
                const dx2 = anchorP[0] - x;
                const dy2 = anchorP[1] - y;
                const link = sel.select<SVGLineElement>('line.pin-link');
                const dot = sel.select<SVGCircleElement>('circle.pin-anchor');
                if (!link.empty()) link.attr('x2', dx2).attr('y2', dy2);
                if (!dot.empty()) dot.attr('cx', dx2).attr('cy', dy2);
              }
            }
            return;
          }

          // Default: geographic projection position
          const p = proj([d.longitude, d.latitude]) as [number, number] | null;
          if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
            d3.select(this).attr('transform', `translate(${p[0]}, ${p[1]})`);
          }
        });
        return; // Skip full re-render
      }
    }
    
    if (lastPinsKeyRef.current === key) return;
    lastPinsKeyRef.current = key;

    // Detect mode change and fully reset pins
    const modeChanged = prevClusterModeRef.current !== clusterMode;
    if (modeChanged) {
      prevClusterModeRef.current = clusterMode;
      // Clear everything when switching modes
      g.selectAll('g.pin').remove();
      expandedClustersRef.current.clear();
      expandedLayoutCacheRef.current.clear();
      mergedItemsForExpansionRef.current.clear();
      collapseAnimKeyRef.current = null;
      animateExpandKeyRef.current = null;
    }

    // Build nodes
    const nodes: any[] = [];
    const MAX_EXPANDED_ITEMS = 40;

    // If cluster mode is off, show all exhibitions as individual pins
    if (!clusterMode) {
      for (const c of clustersListRef.current) {
        const items = c.items as any[];
        for (const d0 of items) {
          const p = proj([d0.longitude, d0.latitude]) as [number, number] | null;
          if (!p) continue;
          // In All mode, hide labels and use smaller pins
          nodes.push({ ...d0, _cluster: false, _hideLabel: true, _smallPin: true, px: p[0], py: p[1] });
        }
      }
    } else {
      // Cluster mode: group by city/grid - ALWAYS show as cluster (even count=1)

      // Get current zoom level for dynamic clustering
      const currentScale = scaleRef.current;

      // Dynamic cluster merge based on zoom level
      // More aggressive merging at low zoom, less at high zoom
      // At scale 1: threshold ~80px (merge a lot)
      // At scale 2: threshold ~50px (merge less)
      // At scale 4+: threshold ~30px (mostly individual city clusters)
      const MERGE_THRESHOLD_PX = Math.max(30, 80 / Math.pow(currentScale, 0.5));

      // First, project all cluster centers
      type ClusterCenter = { cluster: ClusterInfo; px: number; py: number };
      const clusterCenters: ClusterCenter[] = [];
      for (const c of clustersListRef.current) {
        const center = proj([c.centerLon, c.centerLat]) as [number, number] | null;
        if (!center) continue;
        clusterCenters.push({ cluster: c, px: center[0], py: center[1] });
      }

      // Hierarchical clustering: merge overlapping clusters at ANY zoom level
      // This creates dynamic multi-level clusters based on screen overlap
      type MergedCluster = {
        keys: string[];
        items: Exhibition[];
        px: number;
        py: number;
        centerLon: number;
        centerLat: number;
        sortedByName: Exhibition[];
        _level: number;  // Nesting level (0 = city, 1+ = merged)
      };
      const mergedClusters: MergedCluster[] = [];
      const usedIndices = new Set<number>();

      for (let i = 0; i < clusterCenters.length; i++) {
        if (usedIndices.has(i)) continue;

        const c1 = clusterCenters[i];
        // 클러스터 키에서 국가 추출 (예: "United Kingdom::city:london")
        const c1Country = c1.cluster.key.split('::')[0];
        const mergedItems: Exhibition[] = [...c1.cluster.items];
        const mergedKeys: string[] = [c1.cluster.key];
        let totalPx = c1.px;
        let totalPy = c1.py;
        let totalLon = c1.cluster.centerLon;
        let totalLat = c1.cluster.centerLat;
        let mergeCount = 1;

        usedIndices.add(i);

        // Always check for overlapping clusters to merge (regardless of zoom level)
        // 단, 같은 나라끼리만 머지! 다른 나라는 절대 합치지 않음
        for (let j = i + 1; j < clusterCenters.length; j++) {
          if (usedIndices.has(j)) continue;

          const c2 = clusterCenters[j];
          // 국가가 다르면 머지하지 않음
          const c2Country = c2.cluster.key.split('::')[0];
          if (c1Country !== c2Country) continue;
          
          const dist = Math.hypot(c1.px - c2.px, c1.py - c2.py);

          // Merge if close enough on screen AND same country
          if (dist < MERGE_THRESHOLD_PX) {
            mergedItems.push(...c2.cluster.items);
            mergedKeys.push(c2.cluster.key);
            totalPx += c2.px;
            totalPy += c2.py;
            totalLon += c2.cluster.centerLon;
            totalLat += c2.cluster.centerLat;
            mergeCount++;
            usedIndices.add(j);
          }
        }

        mergedClusters.push({
          keys: mergedKeys,
          items: mergedItems,
          px: totalPx / mergeCount,
          py: totalPy / mergeCount,
          centerLon: totalLon / mergeCount,
          centerLat: totalLat / mergeCount,
          sortedByName: [...mergedItems].sort((a: any, b: any) =>
            String(a.name || a.title).localeCompare(String(b.name || b.title))),
          _level: mergeCount > 1 ? 1 : 0  // Track if this is a merged cluster
        });
      }

      // Build nodes from merged clusters
      for (const mc of mergedClusters) {
        const key = mc.keys[0]; // Use first key as the main key
        const items = mc.items;

        // Check if this cluster (or any of its merged clusters) is expanded
        const isExpanded = mc.keys.some(k => expandedClustersRef.current.has(k)) && items.length > 1;
        console.log('[renderPins] cluster key:', key, 'isExpanded:', isExpanded, 'expandedClusters:', [...expandedClustersRef.current], 'mc.keys:', mc.keys, 'items.length:', items.length);

        if (isExpanded) {
          // Find which key is expanded
          const expandedKey = mc.keys.find(k => expandedClustersRef.current.has(k)) || key;
          
          // Check if we have pre-stored merged items for this expansion
          const mergedItems = mergedItemsForExpansionRef.current.get(expandedKey);
          
          // For merged clusters with pre-stored items, use those
          // For single-city clusters, find the original cluster from clustersListRef
          // For dynamically merged clusters (mc._level > 0), use mc
          let clusterData: any;
          if (mergedItems && mergedItems.length > 0) {
            // Use pre-stored merged items
            clusterData = {
              centerLon: mc.centerLon,
              centerLat: mc.centerLat,
              sortedByName: [...mergedItems].sort((a: any, b: any) =>
                String(a.name || a.title).localeCompare(String(b.name || b.title)))
            };
          } else if (mc._level > 0) {
            clusterData = mc;
          } else {
            clusterData = clustersListRef.current?.find(c => c.key === expandedKey);
          }
          if (!clusterData) continue;

          // --- STABLE PIN LAYOUT LOGIC ---
          let layout = expandedLayoutCacheRef.current.get(expandedKey);

          if (!layout) {
            const center = proj([clusterData.centerLon, clusterData.centerLat]) as [number, number] | null;
            if (!center) continue;

            const sorted = clusterData.sortedByName as any[];
            const count = Math.min(sorted.length, MAX_EXPANDED_ITEMS);

            const MIN_SPACING = 26;
            const COL_OFFSET = 120;

            const layoutItems = [];
            for (let i = 0; i < count; i++) {
              const d0 = sorted[i];
              const y = (i - (count - 1) / 2) * MIN_SPACING;
              const x = COL_OFFSET;
              const anchorP = proj([d0.longitude, d0.latitude]) as [number, number] | null;

              layoutItems.push({
                data: d0,
                dx: x,
                dy: y,
                dax: anchorP ? anchorP[0] - center[0] : 0,
                day: anchorP ? anchorP[1] - center[1] : 0
              });
            }

            layout = {
              baseScale: scaleRef.current,
              centerLon: clusterData.centerLon,
              centerLat: clusterData.centerLat,
              items: layoutItems
            };
            expandedLayoutCacheRef.current.set(expandedKey, layout);
          }

          const curCenter = proj([layout.centerLon, layout.centerLat]) as [number, number] | null;
          if (!curCenter) continue;

          const scaleFactor = getExpandedSpread(scaleRef.current);
          const isExpanding = animateExpandKeyRef.current === expandedKey;
          const isCollapsing = collapseAnimKeyRef.current === expandedKey;
          if (isCollapsing) collapsePendingRef.current = layout.items.length;

          for (const item of layout.items) {
            const px = curCenter[0] + item.dx * scaleFactor;
            const py = curCenter[1] + item.dy * scaleFactor;
            // Skip items with invalid positions
            if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
            
            const originalPos = proj([item.data.longitude, item.data.latitude]) as [number, number] | null;
            const ax = originalPos ? originalPos[0] : curCenter[0];
            const ay = originalPos ? originalPos[1] : curCenter[1];

            nodes.push({
              ...item.data,
              _cluster: false,
              _expanded: true,
              px, py,
              _layoutKey: expandedKey,
              _dx: item.dx,
              _dy: item.dy,
              _anchorX: ax,
              _anchorY: ay,
              _initialSpread: scaleFactor, // Store initial spread to set initial opacity
              ...(isExpanding ? { _originX: curCenter[0], _originY: curCenter[1], _delayLabelAfterMove: true } : {}),
              ...(isCollapsing ? { _collapsing: true, _collapseX: curCenter[0], _collapseY: curCenter[1], _collapseOrder: 0 } : {}),
            });
          }

        } else {
          // Show as cluster (even for count=1)
          // Use fixed position (no collision displacement)
          let displayName = '';
          
          // Determine if this is a multi-city merged cluster
          // Use _level to check if clusters were dynamically merged at current zoom
          // mc._level > 0 means multiple city clusters were merged due to screen proximity
          const isMultiCity = mc._level > 0;
          
          if (isMultiCity) {
            // Try to get country name from the first item
            for (const item of items) {
              const country = extractCountry(item);
              if (country) {
                displayName = country;
                break;
              }
            }
            // Fallback to first city name if no country found
            // Handle new key format: "Country::city:cityname" or old format "city:cityname"
            if (!displayName) {
              const cityMatch = key.match(/::city:([^:]+)$/) || key.match(/^city:([^:]+)$/);
              if (cityMatch) {
                let rawCity = cityMatch[1];
                rawCity = rawCity.replace(/:north|:south|:west|:east$/, '');
                displayName = rawCity.charAt(0).toUpperCase() + rawCity.slice(1);
              }
            }
          } else {
            // Single city cluster - show city name
            // Handle new key format: "Country::city:cityname" or old format "city:cityname"
            const cityMatch = key.match(/::city:([^:]+)$/) || key.match(/^city:([^:]+)$/);
            if (cityMatch) {
              let rawCity = cityMatch[1];
              rawCity = rawCity.replace(/:north|:south|:west|:east$/, '');
              displayName = rawCity.charAt(0).toUpperCase() + rawCity.slice(1);
            }
          }
          // Skip clusters with invalid positions
          if (!Number.isFinite(mc.px) || !Number.isFinite(mc.py)) continue;
          
          nodes.push({
            _cluster: true,
            key,
            count: items.length,
            longitude: mc.centerLon,
            latitude: mc.centerLat,
            px: mc.px,
            py: mc.py,
            cityName: displayName,
            _items: items,  // Store items for click handling
            _allKeys: mc.keys,  // Store all merged keys
            _isMerged: mc._level > 0  // Track if this is a merged (multi-city) cluster
          });
        }
      }

      // Collision avoidance for cluster nodes - only for single-city clusters at high zoom
      // Merged clusters (multi-city) don't need collision avoidance - they naturally separate when zoomed in
      if (currentScale >= 4) {
        const MIN_CLUSTER_DIST = 50; // minimum pixel distance between cluster centers
        // Only apply collision avoidance to non-merged (single city) clusters
        const clusterNodes = nodes.filter((n: any) => n._cluster && !n._isMerged);

        // Sort clusters by geographic position for stable ordering (prevents swapping)
        clusterNodes.sort((a: any, b: any) => {
          // Primary sort by latitude (north to south)
          const latDiff = b.latitude - a.latitude;
          if (Math.abs(latDiff) > 0.1) return latDiff;
          // Secondary sort by longitude (west to east)
          return a.longitude - b.longitude;
        });

        // More iterations with stronger push for proper separation
        for (let iter = 0; iter < 5; iter++) {
          for (let i = 0; i < clusterNodes.length; i++) {
            for (let j = i + 1; j < clusterNodes.length; j++) {
              const a = clusterNodes[i];
              const b = clusterNodes[j];
              const dx = b.px - a.px;
              const dy = b.py - a.py;
              const dist = Math.hypot(dx, dy);
              if (dist < MIN_CLUSTER_DIST && dist > 0.1) {
                // Full push to separate overlapping clusters
                const overlap = (MIN_CLUSTER_DIST - dist) / 2;
                const ux = dx / dist;
                const uy = dy / dist;
                a.px -= ux * overlap;
                a.py -= uy * overlap;
                b.px += ux * overlap;
                b.py += uy * overlap;
              }
            }
          }
        }
      }
    } // end of clusterMode else block

    // Remove all pins and re-add (simpler than D3 update pattern for complex pins)
    // Detect if cluster composition changed - animate transitions for any cluster change
    const currentScaleVal = scaleRef.current;
    
    // Check if cluster keys changed (not just threshold crossing)
    const existingClusters = g.selectAll<SVGGElement, any>('g.pin').filter((d: any) => d && d._cluster);
    const existingClusterKeys = new Set<string>();
    existingClusters.each(function(d: any) {
      if (d && d.key) existingClusterKeys.add(d.key);
    });
    const newClusterKeys = new Set(nodes.filter((n: any) => n._cluster).map((n: any) => n.key));
    
    // Detect if clusters actually changed (not just position updates)
    const clustersChanged = existingClusterKeys.size !== newClusterKeys.size || 
      [...existingClusterKeys].some(k => !newClusterKeys.has(k)) ||
      [...newClusterKeys].some(k => !existingClusterKeys.has(k));
    
    // Only update prevScale if not in transition to avoid re-triggering
    if (!clusterTransitionInProgressRef.current) {
      prevScaleForMergeRef.current = currentScaleVal;
    }
    
    // If transition already in progress, check if we need to force a full re-render
    // (e.g., user clicked on a sub-cluster to expand museums)
    if (clusterTransitionInProgressRef.current) {
      // If there's an expand animation pending OR we have expanded clusters,
      // cancel the cluster transition and do a full re-render
      if (animateExpandKeyRef.current || expandedClustersRef.current.size > 0) {
        // Cancel the cluster transition to allow museum expansion
        clusterTransitionInProgressRef.current = false;
        g.selectAll('g.pin').remove(); // Clear all pins to start fresh
        // Continue to full re-render below
      } else {
        // Normal transition update: just update cluster positions
        g.selectAll<SVGGElement, any>('g.pin').each(function(d: any) {
          if (!d || !d._cluster) return;
          const p = proj([d.longitude, d.latitude]) as [number, number] | null;
          if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
            const currentTransform = d3.select(this).attr('transform') || '';
            const scaleMatch = currentTransform.match(/scale\(([^)]+)\)/);
            const currentScale = scaleMatch ? scaleMatch[0] : 'scale(1)';
            // Preserve stored offsets (shrink offset for old clusters, collision offset for new ones)
            const offsetX = d._shrinkOffsetX ?? d._collisionOffsetX ?? 0;
            const offsetY = d._shrinkOffsetY ?? d._collisionOffsetY ?? 0;
            const finalX = p[0] + offsetX;
            const finalY = p[1] + offsetY;
            d3.select(this).attr('transform', `translate(${finalX}, ${finalY}) ${currentScale}`);
            d.px = finalX;
            d.py = finalY;
          }
        });
        return;
      }
    }
    
    // Animate when clusters change (split or merge)
    // BUT skip animation if we have expanded clusters (user clicked to see museums)
    if (clustersChanged && existingClusters.size() > 0 && expandedClustersRef.current.size === 0 && !animateExpandKeyRef.current) {
      // Mark transition as in progress
      clusterTransitionInProgressRef.current = true;
      
      // Store the nodes data for later use (will recalculate positions)
      const clusterNodes = nodes.filter((n: any) => n._cluster);
      
      // Build a mapping: for each old cluster key, find which new cluster it belongs to
      // This allows nearby clusters to merge toward THEIR new cluster center, not a global center
      const oldKeyToNewCluster = new Map<string, any>();
      existingClusters.each(function(d: any) {
        const oldKey = d.key;
        // Find which new cluster contains this old key
        for (const newNode of clusterNodes) {
          if (newNode._allKeys && newNode._allKeys.includes(oldKey)) {
            oldKeyToNewCluster.set(oldKey, newNode);
            break;
          }
        }
      });
      
      // Calculate collision offset for existing clusters before they shrink
      existingClusters.each(function(d: any) {
        const currentTransform = d3.select(this).attr('transform') || '';
        const translateMatch = currentTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (translateMatch) {
          const renderedX = parseFloat(translateMatch[1]);
          const renderedY = parseFloat(translateMatch[2]);
          const p = proj([d.longitude, d.latitude]) as [number, number] | null;
          if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
            d._shrinkOffsetX = renderedX - p[0];
            d._shrinkOffsetY = renderedY - p[1];
          }
        }
        
        // Store target merge center (the new cluster this old cluster will merge into)
        const targetNewCluster = oldKeyToNewCluster.get(d.key);
        if (targetNewCluster) {
          const targetP = proj([targetNewCluster.longitude ?? targetNewCluster.centerLon, 
                               targetNewCluster.latitude ?? targetNewCluster.centerLat]) as [number, number] | null;
          if (targetP && Number.isFinite(targetP[0]) && Number.isFinite(targetP[1])) {
            d._mergeCenterX = targetP[0];
            d._mergeCenterY = targetP[1];
          }
        }
      });
      
      // Animate shrinking of old clusters with a SINGLE shared animation loop
      const shrinkStartTime = performance.now();
      const shrinkDuration = 250;
      let shrinkAnimationId: number | null = null;
      void shrinkAnimationId; // Mark as intentionally unused (stored for potential cancellation)
      
      // Pre-calculate start positions for all clusters
      existingClusters.each(function(d: any) {
        const startP = proj([d.longitude, d.latitude]) as [number, number] | null;
        d._animStartX = startP ? startP[0] + (d._shrinkOffsetX ?? 0) : 0;
        d._animStartY = startP ? startP[1] + (d._shrinkOffsetY ?? 0) : 0;
        d._animTargetX = d._mergeCenterX ?? d._animStartX;
        d._animTargetY = d._mergeCenterY ?? d._animStartY;
      });
      
      const animateShrinkAll = () => {
        const elapsed = performance.now() - shrinkStartTime;
        const t = Math.min(1, elapsed / shrinkDuration);
        
        const eased = t < 0.5 
          ? 2 * t * t
          : 1 - Math.pow(-2 * t + 2, 2) / 2;
        
        existingClusters.each(function(d: any) {
          const el = d3.select(this);
          const currentX = d._animStartX + (d._animTargetX - d._animStartX) * eased;
          const currentY = d._animStartY + (d._animTargetY - d._animStartY) * eased;
          const currentScale = 1 - eased * 0.7;
          
          el.attr('transform', `translate(${currentX}, ${currentY}) scale(${currentScale})`);
          d.px = currentX;
          d.py = currentY;
        });
        
        if (t < 1) {
          shrinkAnimationId = requestAnimationFrame(animateShrinkAll);
        } else {
          // Animation complete - remove all at once
          shrinkAnimationId = null;
          existingClusters.remove();
        }
      };
      
      if (existingClusters.size() > 0) {
        shrinkAnimationId = requestAnimationFrame(animateShrinkAll);
      }
      
      // Create and animate new clusters after a delay
      setTimeout(() => {
        // Recalculate positions with current projection before creating elements
        const currentProj = getProjection();
        
        // Build reverse mapping: find which old cluster each new cluster came from
        // by checking if the new cluster's key was part of any old cluster's _allKeys
        const oldClustersData: any[] = [];
        existingClusters.each(function(d: any) {
          const p = currentProj([d.longitude, d.latitude]) as [number, number] | null;
          if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
            oldClustersData.push({
              key: d.key,
              allKeys: d._allKeys || [d.key],
              px: p[0] + (d._shrinkOffsetX ?? 0),
              py: p[1] + (d._shrinkOffsetY ?? 0)
            });
          }
        });
        
        clusterNodes.forEach((n: any) => {
          const p = currentProj([n.longitude ?? n.centerLon, n.latitude ?? n.centerLat]) as [number, number] | null;
          if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
            n.px = p[0];
            n.py = p[1];
            n._geoPx = p[0];
            n._geoPy = p[1];
          }
          
          // Find which old cluster this new cluster came from
          // Check if any of this new cluster's keys were in an old cluster
          let parentFound = false;
          for (const oldC of oldClustersData) {
            // Check if any of this new cluster's keys match the old cluster's keys
            const newKeys = n._allKeys || [n.key];
            for (const nk of newKeys) {
              if (oldC.allKeys.includes(nk) || oldC.key === nk) {
                n._parentCenterX = oldC.px;
                n._parentCenterY = oldC.py;
                parentFound = true;
                break;
              }
            }
            if (parentFound) break;
          }
          
          // Fallback: if no parent found, start from own position
          if (!parentFound) {
            n._parentCenterX = n.px;
            n._parentCenterY = n.py;
          }
          
          n._collisionOffsetX = 0;
          n._collisionOffsetY = 0;
        });
        
        const newEnter = g.selectAll<SVGGElement, any>('g.pin-new')
          .data(clusterNodes, (d: any) => d.key)
          .enter()
          .append('g')
          .attr('class', 'pin')
          .style('cursor', 'pointer')
          .style('pointer-events', 'auto')
          // Start at PARENT center position (water drop effect - split from parent)
          .attr('transform', (d: any) => `translate(${d._parentCenterX ?? d.px ?? 0}, ${d._parentCenterY ?? d.py ?? 0}) scale(0.3)`);
        
        // Add cluster visuals to new elements
        newEnter.each(function(d: any) {
          const baseW = Math.max(20, 14 + Math.log2(Math.max(1, d.count)) * 3);
          const baseH = baseW;
          d._collapsedW = baseW;
          d._collapsedH = baseH;
          d._expandedW = d.cityName ? Math.max(baseW, Math.min(70, d.cityName.length * 6 + 14)) : baseW;
          d._expandedH = d.cityName ? baseH + 12 : baseH;
          
          const el = d3.select(this);
          el.append('rect')
            .attr('class', 'cluster-bg')
            .attr('rx', 6).attr('ry', 6)
            .attr('fill', '#111827').attr('stroke', '#E5E7EB').attr('stroke-width', 1)
            .attr('x', -baseW / 2)
            .attr('y', -baseH / 2)
            .attr('width', baseW)
            .attr('height', baseH);
          el.append('text')
            .attr('class', 'cluster-count')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('font-size', Math.max(10, 9 + Math.log2(Math.max(1, d.count)) * 0.8))
            .attr('font-weight', 'bold')
            .attr('fill', '#ffffff')
            .text(d.count);
          if (d.cityName) {
            el.append('text')
              .attr('class', 'cluster-city')
              .attr('text-anchor', 'middle')
              .attr('dy', '1.1em')
              .attr('font-size', 7)
              .attr('fill', '#ffffff')
              .attr('opacity', 0)
              .text(d.cityName.toUpperCase());
          }
          el.append('title').text(`${d.cityName || 'Cluster'}: ${d.count}개의 전시관`);
        });
        
        // Add hover handlers immediately after creation (don't wait for animation)
        newEnter
          .on('mouseenter', function (_event: any, d: any) {
            if (frozenClusterKeyRef.current === d.key) return;
            const el = d3.select(this);
            const bg = el.select('.cluster-bg');
            const count = el.select('.cluster-count');
            const city = el.select('.cluster-city');
            bg.interrupt('hover'); count.interrupt('hover'); city.interrupt('hover');
            bg.transition('hover').duration(200).ease(d3.easeCubicOut)
              .attr('x', -d._expandedW / 2).attr('y', -d._expandedH / 2)
              .attr('width', d._expandedW).attr('height', d._expandedH);
            count.transition('hover').duration(150).ease(d3.easeCubicOut)
              .attr('dy', d.cityName ? '-0.1em' : '0.35em');
            if (d.cityName) {
              city.transition('hover').delay(50).duration(150).ease(d3.easeCubicOut).attr('opacity', 0.9);
            }
          })
          .on('mouseleave', function (_event: any, d: any) {
            if (frozenClusterKeyRef.current === d.key) return;
            const el = d3.select(this);
            const bg = el.select('.cluster-bg');
            const count = el.select('.cluster-count');
            const city = el.select('.cluster-city');
            bg.interrupt('hover'); count.interrupt('hover'); city.interrupt('hover');
            bg.transition('hover').duration(200).ease(d3.easeCubicOut)
              .attr('x', -d._collapsedW / 2).attr('y', -d._collapsedH / 2)
              .attr('width', d._collapsedW).attr('height', d._collapsedH);
            count.transition('hover').duration(150).ease(d3.easeCubicOut).attr('dy', '0.35em');
            city.transition('hover').duration(100).attr('opacity', 0);
          })
          .on('mouseover', function (this: SVGGElement) {
            d3.select(this).select('.cluster-bg').transition().duration(120).attr('stroke-width', 2);
          })
          .on('mouseout', function (this: SVGGElement) {
            d3.select(this).select('.cluster-bg').transition().duration(120).attr('stroke-width', 1.5);
          })
          .on('click', (_evt: any, d: any) => {
            console.log('[newEnter click] d.key:', d.key, '_allKeys:', d._allKeys, '_isMerged:', d._isMerged, 'items:', d._items?.length);
            if (d._cluster) {
              const k = d.key as string;
              console.log('[newEnter click] cluster key:', k);
              // Use _isMerged flag instead of _allKeys.length for more accurate detection
              const isMergedCluster = d._isMerged === true;
              console.log('[newEnter click] isMergedCluster:', isMergedCluster);
              if (d._items && d._items.length === 1 && !isMergedCluster) {
                try { onSelectExhibitionRef.current && onSelectExhibitionRef.current(d._items[0] as Exhibition); } catch { }
                return;
              }
              try {
                const currentScale = scaleRef.current;
                const width = window.innerWidth;
                const height = window.innerHeight;
                const targetRot = { x: -Number(d.longitude), y: Number(d.latitude) };
                let countryFeature: any | null = null;
                const list = countriesRef.current || [];
                for (let i = 0; i < list.length; i++) {
                  const f: any = list[i];
                  const c = d3.geoCentroid(f as any);
                  if (c && d3.geoContains(f, [Number(d.longitude), Number(d.latitude)])) { countryFeature = f; break; }
                }
                const fitScale = countryFeature ? computeFitScale(countryFeature, targetRot, width, height) : Math.max(currentScale, 2.0);
                const targetScale = Math.min(15, Math.max(fitScale * 2, 8));
                const duration = currentScale > 1 ? 1200 : 2500;
                frozenClusterKeyRef.current = k;
                if (isMergedCluster) {
                  // Don't freeze merged clusters - allow them to split during zoom
                  frozenClusterKeyRef.current = null;
                  
                  // If already zoomed in enough (scale >= 6), clusters won't split further
                  // In this case, expand the merged cluster showing ALL items
                  if (currentScale >= 6) {
                    console.log('[newEnter click] merged cluster at high zoom, expanding ALL items:', d._items?.length);
                    
                    // Use the first key as the expansion key
                    const expandKey = k;
                    const allItems = d._items || [];
                    
                    // Store merged items for use in renderPins (layout will be created there with correct projection)
                    if (allItems.length > 0) {
                      mergedItemsForExpansionRef.current.set(expandKey, allItems);
                    }
                    
                    // Clear any stale layout cache for this key
                    expandedLayoutCacheRef.current.delete(expandKey);
                    
                    // Freeze the current cluster to prevent flashing during transition
                    frozenClusterKeyRef.current = expandKey;
                    
                    // Expand using the primary key (don't clear first to avoid flash)
                    expandedClustersRef.current.clear();
                    expandedClustersRef.current.add(expandKey);
                    animateExpandKeyRef.current = expandKey;
                    // Don't reset lastPinsKeyRef to avoid full re-render flash
                    
                    // Zoom enough to split the merged cluster (so user sees both clusters)
                    const splitZoomScale = Math.min(15, Math.max(currentScale * 1.8, 10));
                    animateTo(targetRot, splitZoomScale, duration * 0.8, () => {
                      frozenClusterKeyRef.current = null;
                      renderPins(false);
                    });
                    return;
                  }
                  
                  // Just zoom to split the merged cluster - user clicks individual cluster to expand
                  animateTo(targetRot, targetScale, duration, () => { frozenClusterKeyRef.current = null; });
                  return;
                }
                const willExpand = !expandedClustersRef.current.has(k);
                console.log('[newEnter click] willExpand:', willExpand, 'alreadyZoomedIn:', currentScale >= 4);
                const alreadyZoomedIn = currentScale >= 4;
                const hasExpandedCluster = expandedClustersRef.current.size > 0;
                if (willExpand && alreadyZoomedIn && hasExpandedCluster) {
                  frozenClusterKeyRef.current = null;
                  expandedClustersRef.current.clear();
                  expandedClustersRef.current.add(k);
                  expandedLayoutCacheRef.current.delete(k);
                  animateExpandKeyRef.current = k ? String(k) : null;
                  lastPinsKeyRef.current = '';
                  console.log('[newEnter click] calling renderPins (alreadyZoomedIn path)');
                  renderPins(false);
                  return;
                } else if (willExpand) {
                  const expandDelay = Math.floor(duration * 0.7);
                  setTimeout(() => {
                    expandedClustersRef.current.clear();
                    expandedClustersRef.current.add(k);
                    expandedLayoutCacheRef.current.delete(k);
                    animateExpandKeyRef.current = k ? String(k) : null;
                    lastPinsKeyRef.current = '';
                    console.log('[newEnter click] calling renderPins (delayed expand path)');
                    renderPins(false);
                  }, expandDelay);
                  animateTo(targetRot, targetScale, duration, () => { frozenClusterKeyRef.current = null; return true; });
                } else {
                  animateTo(targetRot, targetScale, duration, () => { frozenClusterKeyRef.current = null; });
                  collapseAnimKeyRef.current = k ? String(k) : null;
                  collapseFinalizedRef.current = false;
                  lastPinsKeyRef.current = '';
                  renderPins();
                }
              } catch { }
            } else {
              try { onSelectExhibitionRef.current && onSelectExhibitionRef.current(d as Exhibition); } catch { }
            }
          });
        
        // Animate all new clusters with a SINGLE shared animation loop
        // This prevents multiple renderPins calls and infinite loops
        const animationStartTime = performance.now();
        const animationDuration = 300;
        let animationFrameId: number | null = null;
        void animationFrameId; // Mark as intentionally unused (stored for potential cancellation)
        
        const animateAllNewClusters = () => {
          const elapsed = performance.now() - animationStartTime;
          const t = Math.min(1, elapsed / animationDuration);
          
          // Custom easing: slow start, smooth middle, gentle end
          const eased = t < 0.5 
            ? (1 - Math.cos(t * Math.PI)) / 2
            : (1 + Math.sin((t - 0.5) * Math.PI)) / 2;
          
          const currentProj = getProjection();
          
          newEnter.each(function(d: any) {
            const el = d3.select(this);
            const startX = d._parentCenterX ?? d._geoPx ?? 0;
            const startY = d._parentCenterY ?? d._geoPy ?? 0;
            const startScale = 0.3;
            
            const p = currentProj([d.longitude ?? d.centerLon, d.latitude ?? d.centerLat]) as [number, number] | null;
            
            if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
              const targetX = p[0];
              const targetY = p[1];
              const currentX = startX + (targetX - startX) * eased;
              const currentY = startY + (targetY - startY) * eased;
              const currentScale = startScale + (1 - startScale) * eased;
              
              el.attr('transform', `translate(${currentX}, ${currentY}) scale(${currentScale})`);
              d.px = currentX;
              d.py = currentY;
            }
          });
          
          if (t < 1) {
            animationFrameId = requestAnimationFrame(animateAllNewClusters);
          } else {
            // Animation complete - only call once for all elements
            animationFrameId = null;
            clusterTransitionInProgressRef.current = false;
            prevScaleForMergeRef.current = scaleRef.current;
            // Don't call renderPins here - just update the key to allow future re-renders
            lastPinsKeyRef.current = '';
            // Handlers were already attached immediately after newEnter creation
          }
        };
        
        if (newEnter.size() > 0) {
          animationFrameId = requestAnimationFrame(animateAllNewClusters);
        }
        
        // If no new clusters, just end the transition
        if (clusterNodes.length === 0) {
          clusterTransitionInProgressRef.current = false;
          prevScaleForMergeRef.current = scaleRef.current;
          lastPinsKeyRef.current = '';
        }
      }, 100); // Start expanding after old clusters begin shrinking
      
      return; // Don't continue with normal rendering
    } else {
      g.selectAll('g.pin').remove();
    }

    const enter = g.selectAll<SVGGElement, any>('g.pin').data(nodes, (d: any) => (d._cluster ? d.key : d.id)).enter().append('g').attr('class', 'pin').style('cursor', 'pointer').style('pointer-events', 'auto')
      // Set initial opacity for expanded pins based on spread factor (so they appear during zoom)
      .style('opacity', (d: any) => {
        // If animating from origin, start invisible (animation will fade in)
        if (d._originX != null) return 0;
        if (d._expanded && typeof d._initialSpread === 'number') return Math.max(0.1, d._initialSpread);
        return 1;
      })
      .attr('transform', (d: any) => {
        // If expanding animation, start from origin position (cluster center)
        if (d._originX != null && d._originY != null) {
          return `translate(${d._originX}, ${d._originY})`;
        }
        const x = d.px ?? 0;
        const y = d.py ?? 0;
        return `translate(${x}, ${y})`;
      });
    
    const enterCluster = enter.filter((d: any) => d._cluster);
    
    // Pre-calculate and store sizes in data to avoid recalculation issues
    enterCluster.each(function(d: any) {
      const baseW = Math.max(20, 14 + Math.log2(Math.max(1, d.count)) * 3);
      const baseH = baseW;
      d._collapsedW = baseW;
      d._collapsedH = baseH;
      d._expandedW = d.cityName ? Math.max(baseW, Math.min(70, d.cityName.length * 6 + 14)) : baseW;
      d._expandedH = d.cityName ? baseH + 12 : baseH;
      // Check if this cluster is frozen (being zoomed) - should render expanded
      d._frozen = frozenClusterKeyRef.current === d.key;
    });
    
    // 배경 (기본: 숫자만 표시할 크기) - use pre-calculated sizes
    // If frozen, render in expanded state
    enterCluster.append('rect')
      .attr('class', 'cluster-bg')
      .attr('rx', 6).attr('ry', 6)
      .attr('fill', '#111827').attr('stroke', '#E5E7EB').attr('stroke-width', 1)
      .attr('x', (d: any) => d._frozen ? -d._expandedW / 2 : -d._collapsedW / 2)
      .attr('y', (d: any) => d._frozen ? -d._expandedH / 2 : -d._collapsedH / 2)
      .attr('width', (d: any) => d._frozen ? d._expandedW : d._collapsedW)
      .attr('height', (d: any) => d._frozen ? d._expandedH : d._collapsedH);
    // Count (항상 표시)
    enterCluster.append('text')
      .attr('class', 'cluster-count')
      .attr('text-anchor', 'middle')
      .attr('dy', (d: any) => d._frozen && d.cityName ? '-0.1em' : '0.35em')
      .attr('font-size', (d: any) => Math.max(10, 9 + Math.log2(Math.max(1, d.count)) * 0.8))
      .attr('font-weight', 'bold')
      .attr('fill', '#ffffff')
      .text((d: any) => d.count);
    // City name label (호버 시에만 표시, opacity 0으로 시작) - 모든 클러스터에 추가
    // If frozen, show city name immediately
    enterCluster.append('text')
      .attr('class', 'cluster-city')
      .attr('text-anchor', 'middle')
      .attr('dy', '1.1em')
      .attr('font-size', 7)
      .attr('fill', '#ffffff')
      .attr('opacity', (d: any) => d._frozen && d.cityName ? 0.9 : 0)
      .text((d: any) => d.cityName ? d.cityName.toUpperCase() : '');
    enterCluster.append('title').text((d: any) => `${d.cityName || 'Cluster'}: ${d.count}개의 전시관`);
    
    // 클러스터 호버 효과
    enterCluster.on('mouseenter', function (_event: any, d: any) {
      // If this cluster is frozen (clicked and zooming), keep it expanded
      if (frozenClusterKeyRef.current === d.key) return;
      
      const el = d3.select(this);
      const bg = el.select('.cluster-bg');
      const count = el.select('.cluster-count');
      const city = el.select('.cluster-city');
      
      // Stop any running transitions first
      bg.interrupt('hover');
      count.interrupt('hover');
      city.interrupt('hover');
      
      // Animate to expanded size using pre-calculated values
      bg.transition('hover').duration(200).ease(d3.easeCubicOut)
        .attr('x', -d._expandedW / 2)
        .attr('y', -d._expandedH / 2)
        .attr('width', d._expandedW)
        .attr('height', d._expandedH);
      
      // 숫자 위로 이동 (도시명이 있을 때만)
      count.transition('hover').duration(150).ease(d3.easeCubicOut)
        .attr('dy', d.cityName ? '-0.1em' : '0.35em');
      
      // 도시명 페이드인 (있을 때만)
      if (d.cityName) {
        city.transition('hover').delay(50).duration(150).ease(d3.easeCubicOut)
          .attr('opacity', 0.9);
      }
    })
    .on('mouseleave', function (_event: any, d: any) {
      // If this cluster is frozen (clicked and zooming), keep it expanded
      if (frozenClusterKeyRef.current === d.key) return;
      
      const el = d3.select(this);
      const bg = el.select('.cluster-bg');
      const count = el.select('.cluster-count');
      const city = el.select('.cluster-city');
      
      // Stop any running transitions first
      bg.interrupt('hover');
      count.interrupt('hover');
      city.interrupt('hover');
      
      // Animate back to collapsed size using pre-calculated values
      bg.transition('hover').duration(200).ease(d3.easeCubicOut)
        .attr('x', -d._collapsedW / 2)
        .attr('y', -d._collapsedH / 2)
        .attr('width', d._collapsedW)
        .attr('height', d._collapsedH);
      
      // 숫자 중앙으로 복원
      count.transition('hover').duration(150).ease(d3.easeCubicOut)
        .attr('dy', '0.35em');
      
      // 도시명 페이드아웃
      city.transition('hover').duration(100)
        .attr('opacity', 0);
    });

    const enterPin = enter.filter((d: any) => !d._cluster);
    // For expanded cluster items: draw line from pin to original museum location, and a dot at original location
    // Skip drawing during animation (_originX means it's animating in)
    enterPin.filter((d: any) => d._expanded && !d._originX && !d._collapsing).each(function (d: any) {
      const g = d3.select(this);
      if (d._anchorX != null && d._anchorY != null) {
        // dx, dy = offset from pin position (0,0) to original museum location
        const dx = (d._anchorX - d.px);
        const dy = (d._anchorY - d.py);
        if (Math.hypot(dx, dy) > 3) {
          // Draw line from pin to original location
          g.append('line')
            .attr('class', 'pin-link')
            .attr('x1', 0).attr('y1', 0) // Pin position (label)
            .attr('x2', dx).attr('y2', dy) // Original museum location
            .attr('stroke', '#6b7280')
            .attr('stroke-width', 0.8)
            .attr('stroke-opacity', 0.6)
            .style('display', 'none'); // Start hidden, show after animation
          // Draw small dot at original museum location
          g.append('circle')
            .attr('class', 'pin-anchor')
            .attr('cx', dx).attr('cy', dy)
            .attr('r', 3)
            .attr('fill', '#111827')
            .attr('stroke', '#fff')
            .attr('stroke-width', 0.5)
            .style('display', 'none'); // Start hidden, show after animation
        }
      }
    });
    // Label marker (displaced position)
    enterPin.append('rect')
      .attr('class', 'pin-bg')
      .attr('x', (d: any) => d._smallPin ? -2 : -4)
      .attr('y', (d: any) => d._smallPin ? -2 : -4)
      .attr('width', (d: any) => d._smallPin ? 4 : 8)
      .attr('height', (d: any) => d._smallPin ? 4 : 8)
      .attr('rx', (d: any) => d._smallPin ? 1 : 2)
      .attr('ry', (d: any) => d._smallPin ? 1 : 2)
      .attr('fill', '#111827')
      .attr('stroke', '#111827')
      .attr('stroke-width', 1);
    // Only add labels for pins that don't have _hideLabel flag
    enterPin.filter((d: any) => !d._hideLabel)
      .append('text')
      .attr('class', 'pin-label')
      .attr('dy', '0.35em')
      .attr('x', 8)
      .attr('text-anchor', 'start')
      .style('font-size', '10px')
      .style('font-weight', 'bold')
      .style('fill', '#333')
      .style('stroke', '#fff')
      .style('stroke-width', 1.5)
      .style('paint-order', 'stroke')
      .text((d: any) => String(d.title ?? d.name ?? '').toUpperCase());

    enter
      .each(function (d: any, i: number) {
        const gEl = d3.select(this as SVGGElement);
        const isCollapsing = !!(d as any)._collapsing;
        const collapseOrder = (d as any)._collapseOrder ?? 0;
        const easeOut = d3.easeCubicOut;
        const easeExpand = d3.easePolyOut.exponent(3); // Stronger deceleration for expanding

        // Ensure link & anchor elements exist before animation
        let link = gEl.select<SVGLineElement>('line.pin-link');
        let anchor = gEl.select<SVGCircleElement>('circle.pin-anchor');
        const hasAnchor = d._anchorX != null && d._anchorY != null;

        if (hasAnchor) {
          if (link.empty()) {
            link = gEl.insert('line', ':first-child')
              .attr('class', 'pin-link')
              .attr('stroke', '#6b7280')
              .attr('stroke-width', 0.8)
              .attr('stroke-opacity', 0.5)
              .style('display', 'none');
          }
          if (anchor.empty()) {
            anchor = gEl.insert('circle', ':first-child')
              .attr('class', 'pin-anchor')
              .attr('r', 3)
              .attr('fill', '#111827')
              .attr('stroke', '#ffffff')
              .attr('stroke-width', 0.5)
              .style('display', 'none');
          }
        }

        // Enter/expand animation
        if ((d as any)._originX != null && (d as any)._originY != null) {
          // Stagger delay based on index for "blooming" effect - reduced for snappier feel
          const stagger = (i % 10) * 8;
          const expandDur = 300;

          const originX = Number.isFinite((d as any)._originX) ? (d as any)._originX : 0;
          const originY = Number.isFinite((d as any)._originY) ? (d as any)._originY : 0;
          const targetPx = Number.isFinite(d.px) ? d.px : 0;
          const targetPy = Number.isFinite(d.py) ? d.py : 0;
          
          gEl.attr('transform', `translate(${originX},${originY})`)
            .style('opacity', 0)
            .transition().delay(stagger).duration(expandDur).ease(easeExpand)
            .style('opacity', 1)
            .attrTween('transform', function () {
              const iX = d3.interpolateNumber(originX, targetPx);
              const iY = d3.interpolateNumber(originY, targetPy);
              const that = d3.select(this);
              return function (t) {
                const x = iX(t);
                const y = iY(t);

                // Dynamically update line to always point to anchor (fixed world pos) from current pin pos
                if (hasAnchor) {
                  const lx = d._anchorX - x;
                  const ly = d._anchorY - y;
                  // Show them if hidden
                  const l = that.select('line.pin-link');
                  const a = that.select('circle.pin-anchor');
                  if (l.style('display') === 'none') l.style('display', '').style('opacity', 1);
                  if (a.style('display') === 'none') a.style('display', '').style('opacity', 1);

                  l.attr('x2', lx).attr('y2', ly);
                  a.attr('cx', lx).attr('cy', ly);
                }
                return `translate(${x},${y})`;
              };
            })
            .on('end', function () {
              delete (d as any)._originX;
            });
        } else if (isCollapsing) {
          const delayMs = Math.max(0, 30 * collapseOrder);
          const collapseDur = 400;

          // For collapsing, we can also tween line to shorten it properly
          const startPx = Number.isFinite(d.px) ? d.px : 0;
          const startPy = Number.isFinite(d.py) ? d.py : 0;
          gEl.attr('transform', `translate(${startPx},${startPy})`)
            .transition().delay(delayMs).duration(collapseDur).ease(d3.easeQuadIn)
            .style('opacity', 0)
            .attrTween('transform', function () {
              const iX = d3.interpolateNumber(startPx, (d as any)._collapseX);
              const iY = d3.interpolateNumber(startPy, (d as any)._collapseY);
              const that = d3.select(this);
              return function (t) {
                const x = iX(t);
                const y = iY(t);
                if (hasAnchor) {
                  const lx = d._anchorX - x;
                  const ly = d._anchorY - y;
                  const l = that.select('line.pin-link');
                  const a = that.select('circle.pin-anchor');
                  l.attr('x2', lx).attr('y2', ly);
                  a.attr('cx', lx).attr('cy', ly);
                }
                return `translate(${x},${y})`;
              };
            })
            .on('end', () => {
              if (collapsePendingRef.current > 0) {
                collapsePendingRef.current -= 1;
                if (collapsePendingRef.current === 0 && !collapseFinalizedRef.current) {
                  collapseFinalizedRef.current = true;
                  expandedClustersRef.current.clear();
                  collapseAnimKeyRef.current = null;
                  lastPinsKeyRef.current = '';
                  renderPins();
                }
              }
            });
        } else {
          // Static position update - skip if px/py is NaN
          const px = Number.isFinite(d.px) ? d.px : 0;
          const py = Number.isFinite(d.py) ? d.py : 0;
          gEl.attr('transform', `translate(${px},${py})`);
          if (hasAnchor) {
            const dx = (d._anchorX - d.px);
            const dy = (d._anchorY - d.py);
            if (Math.hypot(dx, dy) > 1) {
              link.style('display', '').style('opacity', 1)
                .attr('x1', 0).attr('y1', 0).attr('x2', dx).attr('y2', dy);
              anchor.style('display', '').style('opacity', 1)
                .attr('cx', dx).attr('cy', dy);
            } else {
              link.style('display', 'none');
              anchor.style('display', 'none');
            }
          }
        }

        // Label slide/fade for pins
        const label = gEl.select<SVGTextElement>('.pin-label');
        if (!label.empty()) {
          if (isCollapsing) {
            // Already handled by group opacity fade out above
          } else if ((d as any)._delayLabelAfterMove) {
            const stagger = (i % 10) * 15;
            label.interrupt().style('opacity', 0)
              .transition().delay(stagger + 300).duration(300).ease(easeOut)
              .style('opacity', 1);
            delete (d as any)._delayLabelAfterMove;
          } else {
            label.interrupt().attr('x', 8).style('opacity', 1);
          }
        }
      })
      .on('click', (_evt: any, d: any) => {
        if (d._cluster) {
          const k = d.key as string;

          // Check if this is a merged cluster (super-cluster containing multiple clusters)
          // Use _isMerged flag for accurate detection
          const isMergedCluster = d._isMerged === true;
          console.log('[enter click] key:', k, '_isMerged:', d._isMerged, '_allKeys:', d._allKeys?.length);

          // If single item cluster, directly select it
          if (d._items && d._items.length === 1 && !isMergedCluster) {
            console.log('[globe] single cluster click, selecting:', d._items[0]);
            try {
              onSelectExhibition && onSelectExhibition(d._items[0] as Exhibition);
            } catch (e) { console.error('[globe] select error:', e); }
            return;
          }

          // For merged clusters OR 2+ items: Recenter and zoom
          try {
            const width = window.innerWidth;
            const height = window.innerHeight;
            // NOTE: Do NOT reset translate abruptly - animateTo will interpolate it smoothly
            const targetRot = { x: -Number(d.longitude), y: Number(d.latitude) };
            // Two-stage zoom for a "pulled-in" feel:
            // 1) Fit to containing country
            // 2) Then continue to MAX_ZOOM
            // Find containing country by cluster center
            let countryFeature: any | null = null;
            const list = countriesRef.current || [];
            for (let i = 0; i < list.length; i++) {
              const f: any = list[i];
              const c = d3.geoCentroid(f as any);
              if (c && d3.geoContains(f, [Number(d.longitude), Number(d.latitude)])) { countryFeature = f; break; }
            }
            const fitScale = countryFeature ? computeFitScale(countryFeature, targetRot, width, height) : Math.max(scaleRef.current, 2.0);
            // SMOOTH ZOOM: reasonable target (not too extreme), slow start
            const targetScale = Math.min(15, Math.max(fitScale * 2, 8)); // Cap at 15, minimum 8
            // Duration: use original 2500ms, but slightly faster (1500ms) if already zoomed in
            const duration = scaleRef.current > 1 ? 1200 : 2500;

            // Freeze this cluster's visual state during zoom animation
            // But NOT for merged clusters - they should split naturally as zoom increases
            frozenClusterKeyRef.current = k;

            // If this is a merged cluster (super-cluster), zoom all the way to final level
            // This skips intermediate cluster levels for better UX
            if (isMergedCluster) {
              // Don't freeze merged clusters - allow them to split during zoom
              frozenClusterKeyRef.current = null;
              
              // If already zoomed in enough (scale >= 6), clusters won't split further
              // In this case, expand the merged cluster showing ALL items
              if (scaleRef.current >= 6) {
                console.log('[enter click] merged cluster at high zoom, expanding ALL items:', d._items?.length);
                
                // Use the first key as the expansion key
                const expandKey = k;
                const allItems = d._items || [];
                
                // Store merged items for use in renderPins (layout will be created there with correct projection)
                if (allItems.length > 0) {
                  mergedItemsForExpansionRef.current.set(expandKey, allItems);
                }
                
                // Clear any stale layout cache for this key
                expandedLayoutCacheRef.current.delete(expandKey);
                
                // Freeze the current cluster to prevent flashing during transition
                frozenClusterKeyRef.current = expandKey;
                
                // Expand using the primary key (don't clear first to avoid flash)
                expandedClustersRef.current.clear();
                expandedClustersRef.current.add(expandKey);
                animateExpandKeyRef.current = expandKey;
                // Don't reset lastPinsKeyRef to avoid full re-render flash
                
                // Zoom enough to split the merged cluster (so user sees both clusters)
                const splitZoomScale = Math.min(15, Math.max(scaleRef.current * 1.8, 10));
                animateTo(targetRot, splitZoomScale, duration * 0.8, () => {
                  frozenClusterKeyRef.current = null;
                  renderPins(false);
                });
                return;
              }
              
              // Just zoom to split the merged cluster - user clicks individual cluster to expand
              animateTo(targetRot, targetScale, duration, () => {
                frozenClusterKeyRef.current = null;
              });
              return;
            }

            // For individual clusters (directly containing museums), expand/collapse
            const willExpand = !expandedClustersRef.current.has(k);

            // If already zoomed in enough AND another cluster is already expanded,
            // skip zoom animation and directly switch to the new cluster
            const alreadyZoomedIn = scaleRef.current >= 4;
            const hasExpandedCluster = expandedClustersRef.current.size > 0;

            if (willExpand && alreadyZoomedIn && hasExpandedCluster) {
              // Immediately switch to new cluster without zoom animation
              frozenClusterKeyRef.current = null; // No animation, clear immediately
              expandedClustersRef.current.clear();
              expandedClustersRef.current.add(k);
              // Clear layout cache for this cluster to force fresh layout + animation
              expandedLayoutCacheRef.current.delete(k);
              animateExpandKeyRef.current = k ? String(k) : null;
              lastPinsKeyRef.current = '';
              renderPins(false); // Use full render to trigger animation
              return true; // Signal that we handled rendering
            } else if (willExpand) {
              // Start expand animation early (at 70% of zoom) for seamless feel
              const expandDelay = Math.floor(duration * 0.7);
              setTimeout(() => {
                // Set expanded state and trigger the expand animation
                expandedClustersRef.current.clear();
                expandedClustersRef.current.add(k);
                expandedLayoutCacheRef.current.delete(k);
                animateExpandKeyRef.current = k ? String(k) : null;
                lastPinsKeyRef.current = '';
                renderPins(false); // This will trigger the line expansion animation
              }, expandDelay);
              
              animateTo(targetRot, targetScale, duration, () => {
                frozenClusterKeyRef.current = null; // Clear frozen state after zoom completes
                return true; // Signal that we handled rendering (expand already started)
              });
            } else {
              animateTo(targetRot, targetScale, duration, () => {
                frozenClusterKeyRef.current = null; // Clear frozen state after zoom completes
              });
              // Collapse immediately for responsiveness
              collapseAnimKeyRef.current = k ? String(k) : null;
              collapseFinalizedRef.current = false;
              lastPinsKeyRef.current = '';
              renderPins();
            }
          } catch { }
          // Show admin-1 overlay for the country containing this cluster
          // Delay to prevent white flash during zoom animation (use fixed delay matching max animation time)
          setTimeout(() => {
          (async () => {
            try {
              const lon = Number(d.longitude);
              const lat = Number(d.latitude);
              if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
              let countryFeature: any | null = null;
              const list = countriesRef.current || [];
              for (let i = 0; i < list.length; i++) {
                const f: any = list[i];
                const bb = f._bbox as [[number, number], [number, number]] | undefined;
                if (bb) {
                  const lonMin = bb[0][0], latMin = bb[0][1];
                  const lonMax = bb[1][0], latMax = bb[1][1];
                  const lonIn = lonMin <= lonMax ? (lon >= lonMin && lon <= lonMax) : (lon >= lonMin || lon <= lonMax);
                  if (!(lonIn && lat >= latMin && lat <= latMax)) continue;
                }
                if (d3.geoContains(f, [lon, lat])) { countryFeature = f; break; }
              }
              if (!countryFeature) return;
              const countryName = (countryFeature.properties && (countryFeature.properties.name || countryFeature.properties.ADMIN || countryFeature.properties.admin)) || 'Unknown';
              const cachedMesh = admin1OverlayCacheRef.current.get(countryName);
              const cachedFeats = admin1SubsetCacheRef.current.get(countryName);
              if (cachedMesh) {
                setAdmin1OverlayMesh(cachedMesh);
                if (cachedFeats) admin1SubsetFeaturesRef.current = cachedFeats;
                return;
              }
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
                } catch { /* ignore */ }
              }
              if (!subsetGeoms.length) return;
              const subsetObj = { type: 'GeometryCollection', geometries: subsetGeoms } as any;
              const mesh = topojson.mesh(topology, subsetObj, (a: any, b: any) => a !== b);
              const fc = topojson.feature(topology, subsetObj) as any;
              const feats: any[] = fc && fc.type === 'FeatureCollection' ? (fc.features || []) : [];
              feats.forEach((f: any) => { try { (f as any)._bbox = d3.geoBounds(f); } catch { } });
              admin1SubsetFeaturesRef.current = feats;
              admin1SubsetCacheRef.current.set(countryName, feats);
              admin1OverlayCacheRef.current.set(countryName, mesh as any);
              setAdmin1OverlayMesh(mesh as any);
            } catch { /* ignore */ }
          })();
          }, 2600); // Delay until zoom animation completes (max 2500ms + buffer)
        } else {
          // Open side detail panel
          try { onSelectExhibitionRef.current && onSelectExhibitionRef.current(d as Exhibition); } catch { }
        }
      })
      .style('display', 'block');
    // Cluster hover stroke weight
    enter.filter((d: any) => d._cluster)
      .on('mouseover', function (this: SVGGElement) { d3.select(this).select('.cluster-bg').transition().duration(120).attr('stroke-width', 2); })
      .on('mouseout', function (this: SVGGElement) { d3.select(this).select('.cluster-bg').transition().duration(120).attr('stroke-width', 1.5); });

    // Reset animation key after a short delay to allow useEffect to skip during expansion
    // This prevents React state updates from triggering a re-render that kills the animation
    if (animateExpandKeyRef.current) {
      const keyToReset = animateExpandKeyRef.current;
      setTimeout(() => {
        if (animateExpandKeyRef.current === keyToReset) {
          animateExpandKeyRef.current = null;
        }
      }, 400); // After expand animation completes (300ms + stagger + buffer)
    }
  };
  useEffect(() => { 
    // Skip during animation - animation loop handles renderPins directly
    if (animatingRef.current) return;
    // Skip if expand animation is in progress
    if (animateExpandKeyRef.current) return;
    renderPins(); 
  }, [rotation, scale, projTranslate, clusterMode, panOffset]);

  // Helpers for click-to-center zoom

  const shortestDeltaDeg = (from: number, to: number) => {
    let d = to - from;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  };

  // Improved smoother combined animation with slow start
  const animateTo = (targetRot: { x: number; y: number }, targetScale: number, duration = 800, onDone?: () => void) => {
    const startRot = { x: rotationRef.current.x, y: rotationRef.current.y };
    const startScale = scaleRef.current;

    // Also interpolate translation to center to avoid bounce
    const width = window.innerWidth;
    const height = window.innerHeight;
    const startTranslate = translateRef.current || [width / 2, height / 2];
    const targetTranslate: [number, number] = [width / 2, height / 2];

    const dx = shortestDeltaDeg(startRot.x, targetRot.x);
    const dy = shortestDeltaDeg(startRot.y, targetRot.y);
    const dtx = targetTranslate[0] - startTranslate[0];
    const dty = targetTranslate[1] - startTranslate[1];

    const t0 = performance.now();
    animatingRef.current = true;

    // Use standard smooth easing - no discontinuity
    const baseEasing = d3.easeCubicInOut;

    // Rotation completes faster (use compressed time) so we see target early
    const rotationEasing = (t: number) => baseEasing(Math.min(1, t * 1.3));
    // Zoom starts slow and catches up (use stretched time at start)
    const zoomEasing = (t: number) => baseEasing(Math.pow(t, 1.2));
    // Translation tracks rotation
    const translateEasing = rotationEasing;

    const step = (now: number) => {
      const elapsed = now - t0;
      const t = Math.min(1, elapsed / duration);

      // Apply different easings for rotation vs zoom
      const eRot = rotationEasing(t);
      const eZoom = zoomEasing(t);
      const eTrans = translateEasing(t);

      // Rotation interpolation (faster - see destination early)
      rotationRef.current = { x: startRot.x + dx * eRot, y: startRot.y + dy * eRot };

      // Scale interpolation (slower start - cluster stays visible)
      const newScale = startScale + (targetScale - startScale) * eZoom;
      scaleRef.current = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newScale));

      // Translate interpolation (smooth pan to center)
      const newTx = startTranslate[0] + dtx * eTrans;
      const newTy = startTranslate[1] + dty * eTrans;
      translateRef.current = [newTx, newTy];

      // During animation, directly render without React state updates to avoid flicker
      renderGlobe();
      
      // Check if scale crossed the merge threshold (2) - if so, trigger cluster transition animation
      const prevAnimScale = startScale + (targetScale - startScale) * zoomEasing(Math.max(0, (elapsed - 16) / duration));
      const animCrossedThreshold = (prevAnimScale < 2 && scaleRef.current >= 2) || (prevAnimScale >= 2 && scaleRef.current < 2);
      
      if (animCrossedThreshold && !clusterTransitionInProgressRef.current) {
        // Update prevScaleForMergeRef BEFORE calling renderPins so it triggers the animation
        // The animation logic in renderPins will handle the smooth transition
        prevScaleForMergeRef.current = prevAnimScale; // Set to previous value so crossedThreshold is detected
        lastPinsKeyRef.current = '';
        renderPins(false);
      } else {
        renderPins(true);
      }

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        animatingRef.current = false;
        // Sync React state at end of animation
        setRotation({ ...rotationRef.current });
        setScale(scaleRef.current);
        setProjTranslate([...translateRef.current] as [number, number]);
        // Allow caller to update refs (e.g. clear frozen cluster) and optionally render
        // If callback handles rendering itself, we skip the final renderPins call
        const callbackHandledRender = onDone && onDone();
        // Force full re-render after animation completes (unless callback already did it)
        if (!callbackHandledRender) {
          lastPinsKeyRef.current = '';
          renderPins(false);
        }
      }
    };
    requestAnimationFrame(step);
  };
  const computeFitScale = (feature: any, targetRot: { x: number; y: number }, width: number, height: number) => {
    const minWH = Math.min(width, height);
    // Binary search for the largest scale that keeps feature within 85% of minWH
    let lo = MIN_ZOOM, hi = MAX_ZOOM, best = Math.max(scaleRef.current, MIN_ZOOM);
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      const projection = d3.geoOrthographic()
        .scale(mid * 0.5 * minWH)
        .translate([width / 2, height / 2])
        .rotate([targetRot.x, -targetRot.y]);
      const path = d3.geoPath().projection(projection as any);
      const b = path.bounds(feature as any);
      const w = b[1][0] - b[0][0];
      const h = b[1][1] - b[0][1];
      const maxDim = Math.max(w, h);
      if (maxDim <= 0.85 * minWH) { best = mid; lo = mid; } else { hi = mid; }
    }
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, best));
  };

  // Mouse interactions: drag for rotation, wheel for zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let isDragging = false;
    let lastMouse = { x: 0, y: 0 };
    let moved = 0;

    const handleMouseDown = (event: MouseEvent) => {
      const t = event.target as Element | null;
      if (t && (t.closest('.pins-overlay') || t.closest('.pin'))) return; // ignore when interacting with pins
      if (animatingRef.current) return;
      isDragging = true;
      isDraggingRef.current = true; // Track for cluster collapse prevention
      lastMouse = { x: event.clientX, y: event.clientY };
      canvas.style.cursor = 'grabbing';
      moved = 0;
    };

    let hoverRAF = 0;
    const handleMouseMove = (event: MouseEvent) => {
      if (isDragging) {
        const dx = event.clientX - lastMouse.x;
        const dy = event.clientY - lastMouse.y;
        // Rotate with sensitivity reduced as zoom increases
        const base = 0.25;
        const exp = 0.85;
        const k = Math.max(1e-3, Math.pow(scaleRef.current, exp));
        const sensitivity = base / k;

        // Update ref directly (no setState = no React re-render = 60fps)
        rotationRef.current = {
          x: rotationRef.current.x + dx * sensitivity,
          y: Math.max(-90, Math.min(90, rotationRef.current.y + dy * sensitivity))
        };

        // Render directly with ref values
        renderGlobe();
        // Also update pins position
        renderPins();

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
            .scale(scaleRef.current * 0.5 * Math.min(width, height))
            .translate([(translateRef.current?.[0] ?? width / 2), (translateRef.current?.[1] ?? height / 2)])
            .rotate([rotationRef.current.x, -rotationRef.current.y]);
          const inv = (projection as any).invert?.bind(projection);
          const p = inv ? inv([x, y]) : null;
          if (!p || !countriesRef.current.length) {
            setHoverInfo(null);
            setHoverCountry(null);
            setHoverFlagUrl(null);
            if (hoverAbortRef.current) hoverAbortRef.current.abort();
          } else {
            // If admin-1 overlay is active, prefer region hover
            if (admin1OverlayMesh && admin1SubsetFeaturesRef.current && admin1SubsetFeaturesRef.current.length) {
              let regionFound: any = null;
              for (let i = 0; i < admin1SubsetFeaturesRef.current.length; i++) {
                const f: any = admin1SubsetFeaturesRef.current[i];
                const bb = f._bbox as [[number, number], [number, number]] | undefined;
                if (bb) {
                  const lon = p[0], lat = p[1];
                  const lonMin = bb[0][0], latMin = bb[0][1];
                  const lonMax = bb[1][0], latMax = bb[1][1];
                  const lonIn = lonMin <= lonMax ? (lon >= lonMin && lon <= lonMax) : (lon >= lonMin || lon <= lonMax);
                  if (!(lonIn && lat >= latMin && lat <= latMax)) continue;
                }
                if (d3.geoContains(f, p)) { regionFound = f; break; }
              }
              if (regionFound) {
                const prop = regionFound.properties || {};
                const rname = prop.name || prop.NAME || prop.name_en || prop.name_local || prop.nameascii || prop.ADM1NAME || prop.adm1_name || prop.admin || 'Unknown';
                setHoverInfo({ x: event.clientX + 12, y: event.clientY + 12, text: String(rname) });
                setHoverCountry(null);
                setHoverFlagUrl(null); // no flag for regions
                if (hoverAbortRef.current) hoverAbortRef.current.abort();
                return;
              }
            }
            // Fallback: country hover
            let found: any = null;
            for (let i = 0; i < countriesRef.current.length; i++) {
              const f: any = countriesRef.current[i];
              const bb = f._bbox as [[number, number], [number, number]] | undefined;
              if (bb) {
                const lon = p[0], lat = p[1];
                const lonMin = bb[0][0], latMin = bb[0][1];
                const lonMax = bb[1][0], latMax = bb[1][1];
                const lonIn = lonMin <= lonMax ? (lon >= lonMin && lon <= lonMax) : (lon >= lonMin || lon <= lonMax);
                if (!(lonIn && lat >= latMin && lat <= latMax)) continue;
              }
              if (d3.geoContains(f, p)) { found = f; break; }
            }
            if (found) {
              let name = (found.properties && (found.properties.name || found.properties.ADMIN || found.properties.admin)) || 'Unknown';
              setHoverInfo({ x: event.clientX + 12, y: event.clientY + 12, text: name });
              setHoverCountry(found);
              // Map UK countries to UK for flag lookup
              const ukCountryNames = new Set(['england', 'scotland', 'wales', 'northern ireland']);
              const displayNameForFlag = ukCountryNames.has(name.toLowerCase()) ? 'United Kingdom' : name;
              // Resolve flag URL quickly via ISO2 (FlagCDN) or fallback to REST
              const prop = found.properties || {};
              let iso2 = (prop.iso_a2 || prop.ISO_A2 || prop.adm0_a2 || prop.ADM0_A2 || prop.A2) as string | undefined;
              let iso3 = (prop.iso_a3 || prop.ISO_A3 || prop.adm0_a3 || prop.ADM0_A3) as string | undefined;
              // Force UK flag for UK countries
              if (ukCountryNames.has(name.toLowerCase())) {
                iso2 = 'gb';
                iso3 = 'GBR';
              }
              const normalizedISO2 = (iso2 && /^[A-Z]{2}$/i.test(iso2)) ? String(iso2).toLowerCase() : undefined;
              const normalizedISO3 = (iso3 && /^[A-Z]{3}$/i.test(iso3) && iso3 !== '-99') ? String(iso3).toUpperCase() : undefined;
              const kosovoA2 = (normalizedISO3 === 'XKX') ? 'xk' : undefined;
              const key = (normalizedISO2 || kosovoA2 || normalizedISO3 || displayNameForFlag) as string;
              const cached = flagCache.get(key);
              if (cached) {
                setHoverFlagUrl(cached.url);
              } else if (normalizedISO2 || kosovoA2) {
                const code2 = (normalizedISO2 || kosovoA2)!;
                const url = `https://flagcdn.com/w40/${code2}.png`;
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
                    .then((j: any) => {
                      if (!j) return;
                      const entry = Array.isArray(j) ? j[0] : j;
                      const a2 = (entry?.cca2 && typeof entry.cca2 === 'string') ? String(entry.cca2).toLowerCase() : undefined;
                      const url = a2 ? `https://flagcdn.com/w40/${a2}.png` : (entry?.flags?.png as string | undefined);
                      if (url) { flagCache.set(key, { url }); setHoverFlagUrl(url); }
                    })
                    .catch(() => { });
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
                    .then((j: any) => {
                      if (!j || !j[0]) return;
                      const a2 = (j[0]?.cca2 && typeof j[0].cca2 === 'string') ? String(j[0].cca2).toLowerCase() : undefined;
                      const url = a2 ? `https://flagcdn.com/w40/${a2}.png` : (j[0]?.flags?.png as string | undefined);
                      if (url) { flagCache.set(key, { url }); setHoverFlagUrl(url); }
                    })
                    .catch(() => { });
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
      const wasDrag = moved > 5; // Consider it a drag if moved more than 5 pixels
      if (isDragging) {
        // Sync React state with ref values (triggers one final re-render)
        setRotation({ x: rotationRef.current.x, y: rotationRef.current.y });
      }
      isDragging = false;
      isDraggingRef.current = false;
      // If this was a drag, set wasDragging so the click event that follows is ignored
      if (wasDrag) {
        wasDraggingRef.current = true;
      }
      canvas.style.cursor = 'grab';
    };

    const handleClick = async (event: MouseEvent) => {
      const t = event.target as Element | null;
      if (t && (t.closest('.pins-overlay') || t.closest('.pin'))) return; // handled by pins overlay
      if (animatingRef.current) return;
      if (moved > 5) return; // ignore drags
      if (!countriesRef.current.length) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const width = rect.width;
      const height = rect.height;
      const projection = d3.geoOrthographic()
        .scale(scaleRef.current * 0.5 * Math.min(width, height))
        .translate([(translateRef.current?.[0] ?? width / 2), (translateRef.current?.[1] ?? height / 2)])
        .rotate([rotationRef.current.x, -rotationRef.current.y]);
      const inv = (projection as any).invert?.bind(projection);
      const p = inv ? inv([x, y]) : null;
      if (!p) return;
      let countryFeature: any | null = null;
      for (let i = 0; i < countriesRef.current.length; i++) {
        const f: any = countriesRef.current[i];
        const bb = f._bbox as [[number, number], [number, number]] | undefined;
        if (bb) {
          const lon = p[0], lat = p[1];
          const lonMin = bb[0][0], latMin = bb[0][1];
          const lonMax = bb[1][0], latMax = bb[1][1];
          const lonIn = lonMin <= lonMax ? (lon >= lonMin && lon <= lonMax) : (lon >= lonMin || lon <= lonMax);
          if (!(lonIn && lat >= latMin && lat <= latMax)) continue;
        }
        if (d3.geoContains(f, p)) { countryFeature = f; break; }
      }
      if (!countryFeature) return;
      const countryName = (countryFeature.properties && (countryFeature.properties.name || countryFeature.properties.ADMIN || countryFeature.properties.admin)) || 'Unknown';

      // Check if this country has any clusters - if so, ignore background click
      // User should click on the cluster directly
      const clustersList = clustersListRef.current || [];
      
      // Helper to normalize country name for matching
      // Maps UK constituent countries to 'united kingdom'
      const normalizeCountryForMatch = (name: string): string => {
        const n = name.toLowerCase().trim();
        const ukNames = ['england', 'scotland', 'wales', 'northern ireland', 'uk', 'great britain', 'gb'];
        if (ukNames.includes(n) || n.includes('united kingdom')) return 'united kingdom';
        return n;
      };
      
      const normalizedClickedCountry = normalizeCountryForMatch(countryName);
      
      const hasClusterInCountry = clustersList.some((c: any) => {
        if (!c.items || c.items.length === 0) return false;
        // Check if any item in this cluster belongs to this country
        return c.items.some((item: any) => {
          const itemCountry = item.country || extractCountry(item);
          if (!itemCountry) return false;
          const normalizedItemCountry = normalizeCountryForMatch(itemCountry);
          // Exact match after normalization, or partial match for other countries
          return normalizedClickedCountry === normalizedItemCountry ||
                 normalizedClickedCountry.includes(normalizedItemCountry) ||
                 normalizedItemCountry.includes(normalizedClickedCountry);
        });
      });
      
      if (hasClusterInCountry) {
        // Don't respond to background click - user should click on cluster
        return;
      }

      // START ANIMATION IMMEDIATELY (no flicker)
      const centroid = d3.geoCentroid(countryFeature as any) as [number, number];
      const targetRot = { x: -centroid[0], y: centroid[1] };
      const fitScale = computeFitScale(countryFeature, targetRot, width, height);
      const targetScale = Math.max(scaleRef.current, fitScale);
      // Duration: use original 1500ms, but slightly faster (1000ms) if already zoomed in
      const duration = scaleRef.current > 1 ? 1200 : 1500;
      animateTo(targetRot, targetScale, duration);

      // LOAD ADMIN1 OVERLAY IN BACKGROUND (after animation starts)
      const cachedMesh = admin1OverlayCacheRef.current.get(countryName);
      const cachedFeats = admin1SubsetCacheRef.current.get(countryName);
      if (cachedMesh) {
        // Delay setting mesh slightly so it doesn't cause immediate re-render flicker
        setTimeout(() => {
          setAdmin1OverlayMesh(cachedMesh);
          if (cachedFeats) admin1SubsetFeaturesRef.current = cachedFeats;
        }, 100);
        return;
      }

      // Load async - won't block or flicker
      (async () => {
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
          const fc = topojson.feature(topology, subsetObj) as any;
          const feats: any[] = fc && fc.type === 'FeatureCollection' ? (fc.features || []) : [];
          feats.forEach((f: any) => { try { (f as any)._bbox = d3.geoBounds(f); } catch { } });
          admin1SubsetFeaturesRef.current = feats;
          admin1SubsetCacheRef.current.set(countryName, feats);
          admin1OverlayCacheRef.current.set(countryName, mesh as any);
          // Apply after animation completes to avoid visible flash during zoom.
          const applyOverlay = () => {
            if (animatingRef.current) {
              setTimeout(applyOverlay, 120);
              return;
            }
            setAdmin1OverlayMesh(mesh as any);
          };
          setTimeout(applyOverlay, 100);
        } catch (e) {
          console.error('Overlay mesh error', e);
        }
      })();
    };

    let zoomSyncTimeout: number | null = null;

    const handleWheel = (event: WheelEvent) => {
      // If a modal overlay is open, do not hijack wheel events.
      // This prevents the globe's global wheel handler from blocking modal scroll.
      if (typeof document !== 'undefined' && document.body?.dataset?.modalOpen === '1') return;
      // Only zoom if mouse is over canvas
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      if (mouseX >= 0 && mouseX <= rect.width && mouseY >= 0 && mouseY <= rect.height) {
        event.preventDefault();
        // Exponential/multiplicative zoom
        const k = Math.pow(2, -0.0025 * event.deltaY);
        const width = rect.width;
        const height = rect.height;

        // Calculate new scale directly (no setState)
        const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scaleRef.current * k));

        // Compute geographic point under cursor
        const projectionCurrent = d3.geoOrthographic()
          .scale(scaleRef.current * 0.5 * Math.min(width, height))
          .translate([(translateRef.current?.[0] ?? width / 2), (translateRef.current?.[1] ?? height / 2)])
          .rotate([rotationRef.current.x, -rotationRef.current.y]);
        const inv = (projectionCurrent as any).invert?.bind(projectionCurrent);
        const p = inv ? inv([mouseX, mouseY]) : null;

        // Update ref directly
        scaleRef.current = newScale;

        if (p) {
          const projectionZero = d3.geoOrthographic()
            .scale(newScale * 0.5 * Math.min(width, height))
            .translate([0, 0])
            .rotate([rotationRef.current.x, -rotationRef.current.y]);
          const uv = (projectionZero as any)(p) as [number, number] | null;
          if (uv) {
            translateRef.current = [mouseX - uv[0], mouseY - uv[1]];
          }
        }

        // If at min zoom, recenter
        if (newScale === MIN_ZOOM) {
          translateRef.current = [width / 2, height / 2];
        }

        // Render immediately with refs (fast update - no animation)
        renderGlobe();
        renderPins(true);  // true = fast update, positions only

        // Debounced state sync and full re-render (only after zooming stops)
        if (zoomSyncTimeout) window.clearTimeout(zoomSyncTimeout);
        zoomSyncTimeout = window.setTimeout(() => {
          setScale(scaleRef.current);
          setProjTranslate(translateRef.current);
          // Force full re-render to update clusters after zoom stabilizes
          lastPinsKeyRef.current = '';
          renderPins(false);
        }, 200);
      }
    };

    // Touch event handlers for mobile
    let lastTouch = { x: 0, y: 0 };
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        // Pinch zoom start
        event.preventDefault();
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        lastPinchDist = Math.sqrt(dx * dx + dy * dy);
        return;
      }
      if (event.touches.length !== 1) return;
      event.preventDefault();
      const t = event.target as Element | null;
      if (t && (t.closest('.pins-overlay') || t.closest('.pin'))) return;
      if (animatingRef.current) return;
      isDragging = true;
      isDraggingRef.current = true;
      lastTouch = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      moved = 0;
    };

    let lastPinchDist = 0;

    const handleTouchMove = (event: TouchEvent) => {
      // Pinch zoom
      if (event.touches.length === 2) {
        event.preventDefault();
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (lastPinchDist > 0) {
          const delta = dist - lastPinchDist;
          const zoomSensitivity = 0.01;
          const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scaleRef.current * (1 + delta * zoomSensitivity)));
          scaleRef.current = newScale;
          renderGlobe();
          renderPins();
        }
        lastPinchDist = dist;
        return;
      }
      if (!isDragging || event.touches.length !== 1) return;
      event.preventDefault();
      const dx = event.touches[0].clientX - lastTouch.x;
      const dy = event.touches[0].clientY - lastTouch.y;
      const base = 0.25;
      const exp = 0.85;
      const k = Math.max(1e-3, Math.pow(scaleRef.current, exp));
      const sensitivity = base / k;

      rotationRef.current = {
        x: rotationRef.current.x + dx * sensitivity,
        y: Math.max(-90, Math.min(90, rotationRef.current.y + dy * sensitivity))
      };

      renderGlobe();
      renderPins();

      lastTouch = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      moved += Math.abs(dx) + Math.abs(dy);
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) {
        lastPinchDist = 0;
      }
      if (event.touches.length === 0) {
        const wasDrag = moved > 5;
        if (isDragging) {
          setRotation({ x: rotationRef.current.x, y: rotationRef.current.y });
          setScale(scaleRef.current);
        }
        isDragging = false;
        isDraggingRef.current = false;
        wasDraggingRef.current = wasDrag;
      }
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('click', handleClick);
    window.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('click', handleClick);
      window.removeEventListener('wheel', handleWheel);  // passive: false was set on add
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  return (
    <div ref={wrapperRef} style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: '#ffffff',
      overflow: 'hidden',
      touchAction: 'none',
      transform: panOffset ? `translateX(-${panOffset}px)` : 'none',
      transition: 'transform 0.3s ease'
    }}>
      {/* Info panel removed */}

      {/* Globe */}
      <canvas
        ref={canvasRef}
        style={{
          cursor: 'grab',
          display: 'block',
          touchAction: 'none'
        }}
      />

      {/* Pins SVG - rendered in JSX to ensure it's inside wrapper */}
      <svg
        ref={pinsSvgRef}
        className="pins-overlay"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 2
        }}
      >
        <g ref={gPinsRef} className="pins-root" style={{ pointerEvents: 'all' }} />
      </svg>

      {/* Cluster Mode Toggle */}
      <div
        onClick={() => setClusterMode(!clusterMode)}
        style={{
          position: 'fixed',
          top: 16,
          left: 16,
          zIndex: 100,
          width: 44,
          height: 24,
          borderRadius: 12,
          background: clusterMode ? '#111827' : '#d1d5db',
          cursor: 'pointer',
          boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
          transition: 'background 0.25s ease'
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: clusterMode ? 22 : 2,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            transition: 'left 0.25s ease'
          }}
        />
      </div>

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
                decoding="async"
                style={{ display: 'block', height: 12, width: 'auto', borderRadius: 2 }}
                onError={() => setHoverFlagUrl(null)}
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
