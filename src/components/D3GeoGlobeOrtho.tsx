import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { feature as topojsonFeature } from 'topojson-client';

interface Props {
  focusLatLng?: { lat: number; lng: number } | null;
  // Disable high-res swap to prevent frame drops (default: false)
  enableHiResSwap?: boolean;
  // If enabled, zoomK threshold to swap countries to hi-res (default: 2.2)
  hiResThreshold?: number;
  // Control Admin1 (states/provinces) layer fetch/rendering
  enableAdmin1?: boolean; // default: true
  // Minimum zoomK required before fetching Admin1 and showing them (default: 3.0)
  admin1MinZoom?: number;
  // Optional Urban Areas layer (city boundaries). Default: enabled but hidden until toggled.
  enableUrbanAreas?: boolean; // default: true
  // Minimum zoomK required before drawing urban areas to avoid clutter/perf (default: 2.2)
  urbanMinZoom?: number;
  // Initial visibility of urban areas (default: false)
  urbanShowDefault?: boolean;
}

// D3GEO-based orthographic globe with Google Earth-style smooth controls
export default function D3GeoGlobeOrtho({
  focusLatLng = null,
  enableHiResSwap = false,
  hiResThreshold = 2.2,
  enableAdmin1 = true,
  admin1MinZoom = 3.0,
  enableUrbanAreas = true,
  urbanMinZoom = 2.2,
  urbanShowDefault = false,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countries, setCountries] = useState<any[]>([]);
  const [states, setStates] = useState<any[]>([]);
  const [urbanAreas, setUrbanAreas] = useState<any[]>([]);
  const [showUrban, setShowUrban] = useState<boolean>(urbanShowDefault);
  // Persist selected country across data reloads (e.g., when states load)
  const selectedCountryRef = useRef<any>(null);
  // Keep latest states without forcing D3 re-init
  const statesRef = useRef<any[]>([]);
  // Expose internal requestRender to react to async data loads
  const requestRenderRef = useRef<() => void>(() => {});
  // Track whether urban areas fetch has started to avoid duplicate requests
  const urbanFetchStartedRef = useRef<boolean>(false);
  // Track admin1 prefetch to avoid duplicate requests
  const admin1PrefetchStartedRef = useRef<boolean>(false);
  // LOD & fetch state
  const hiResCountriesRef = useRef<any[] | null>(null);
  const hiResAppliedRef = useRef<boolean>(false);
  const statesFetchingRef = useRef<boolean>(false);

  useEffect(() => {
  const loadAll = async () => {
      try {
        setLoading(true);
    // Load low-res countries first for fast first paint
    const countriesLowResRes = await fetch('/geodata/countries-110m.json');
    if (!countriesLowResRes.ok) throw new Error('Countries load failed');
    const countriesRaw = await countriesLowResRes.json();
        // Handle both GeoJSON FeatureCollection and TopoJSON Topology
        const toFeatures = (raw: any, preferKeys: string[]): any[] => {
          if (!raw) return [];
          if (raw.type === 'FeatureCollection') return raw.features || [];
          if (raw.type === 'Topology' && raw.objects) {
            const keys = Object.keys(raw.objects);
            let picked: string | null = null;
            for (const pref of preferKeys) {
              const hit = keys.find(k => k.toLowerCase().includes(pref));
              if (hit) { picked = hit; break; }
            }
            if (!picked) picked = keys[0];
            try {
              const fc: any = topojsonFeature(raw, (raw.objects as any)[picked]);
              return (fc.features || []);
            } catch {
              return [];
            }
          }
          return [];
        };

        setCountries(toFeatures(countriesRaw, ['countries', 'admin0', 'ne_50m_admin_0', 'ne_110m_admin_0']));

        // Prefetch high-res countries in background only if enabled
        if (enableHiResSwap) {
          try {
            fetch('/geodata/countries-50m.json').then(r => r.ok ? r.json() : null).then(raw => {
              if (!raw) return;
              const hi = toFeatures(raw, ['countries', 'admin0', 'ne_50m_admin_0']);
              hiResCountriesRef.current = hi;
            }).catch(() => {});
          } catch {}
        }

  // Urban Areas are now fetched on-demand when toggled, to reduce initial load time

        // Defer states loading until needed (on demand)
      } catch (e: any) {
        setError(e?.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    loadAll();
  }, [enableHiResSwap, enableUrbanAreas]);

  useEffect(() => {
    if (!svgRef.current || loading || error) return;
  const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

  // Shared zoom limits
  const MIN_ZOOM = 1.3;
  const MAX_ZOOM = 5;

  // Measure from SVG container to avoid scroll/zoom mismatch
  const measure = () => (svgRef.current as any).getBoundingClientRect();
  let { width, height } = measure();
  svg.attr('width', width).attr('height', height);

  const baseScale = Math.min(width, height) * 0.38;
    const projection = d3.geoOrthographic()
      .scale(baseScale)
      .translate([width / 2, height / 2])
      .clipAngle(90)
      .precision(0.7);

    if (focusLatLng) {
      projection.rotate([-focusLatLng.lng, -focusLatLng.lat, 0]);
    }

    const path = d3.geoPath(projection);
    // Precompute state centroids once
    try {
      for (const s of states as any[]) {
        const ss: any = s;
        if (!ss.__centroid) ss.__centroid = d3.geoCentroid(ss);
      }
    } catch {}

    // Countries merged into a single path (reduces DOM updates)
    const countriesFC = { type: 'FeatureCollection', features: countries } as any;
  const gCountries = svg.append('g').attr('class', 'countries').style('pointer-events', 'none');
    const countriesPath = gCountries
      .append('path')
      .attr('class', 'countries-merged')
      .datum(countriesFC)
      .attr('fill', 'none')
      .attr('stroke', '#000')
      .attr('stroke-width', 0.4)
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round')
      .attr('shape-rendering', 'crispEdges');

    // States merged (선택된 국가에만 표시)
    const gStates = svg.append('g').attr('class', 'states').style('pointer-events', 'none');
    const statesPath = gStates
      .append('path')
      .attr('class', 'states-merged')
      .datum({ type: 'FeatureCollection', features: [] } as any)
      .attr('fill', 'none')
      .attr('stroke', '#888')
      .attr('stroke-width', 0.2)
      .attr('opacity', 0.35)
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('shape-rendering', 'crispEdges')
      .style('display', 'none');

    // Urban Areas layer (merged path). Hidden by default; shows when toggled and zoomed in.
    const gUrban = svg.append('g').attr('class', 'urban').style('pointer-events', 'none');
    const urbanPath = gUrban
      .append('path')
      .attr('class', 'urban-merged')
      .datum({ type: 'FeatureCollection', features: [] } as any)
      .attr('fill', 'none')
  .attr('stroke', '#000')
  .attr('stroke-width', 0.28)
  .attr('opacity', 1.0)
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('shape-rendering', 'crispEdges')
      .style('display', 'none');

    // Hover/Selected layers
    const gHover = svg.append('g').attr('class', 'hover').style('pointer-events', 'none');
    const hoverPath = gHover.append('path')
      .attr('fill', 'none')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1.2)
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('opacity', 0.9)
      .style('display', 'none');

    const gSelected = svg.append('g').attr('class', 'selected').style('pointer-events', 'none');
    const selectedPath = gSelected.append('path')
      .attr('fill', 'none')
      .attr('stroke', '#111827')
      .attr('stroke-width', 1)
      .attr('vector-effect', 'non-scaling-stroke')
      .style('display', 'none');

    // Tooltip
    const tooltip = document.createElement('div');
    Object.assign(tooltip.style, {
      position: 'fixed', zIndex: '5000', padding: '6px 8px', background: 'rgba(17,24,39,0.9)',
      color: '#fff', fontSize: '12px', borderRadius: '6px', pointerEvents: 'none', transform: 'translate(8px, 8px)',
      display: 'none', boxShadow: '0 2px 6px rgba(0,0,0,0.25)'
    } as CSSStyleDeclaration);
    document.body.appendChild(tooltip);

    // Optimized Google Earth-style controls state
    let rafId = 0;
  let zoomK = MIN_ZOOM; // start at new minimum zoom level (more restricted zoom-out)
  let isAnimating = false;
    let hoverVisible = false;
    // Inertial rotation state
    let vx = 0, vy = 0; // velocity in degrees per frame
    let inertiaId = 0;
    const minVel = 0.08; // lower threshold for longer inertia
    // Performance optimization flags
    let needsPathUpdate = true;
    let needsHitUpdate = true;
    let lastUpdateTime = 0;
    const FRAME_BUDGET_MS = 12; // target 60fps with 4ms buffer

    // Lightweight path string cache for countries (limits memory)
  const pathCache = new Map<string, string>();
    const cacheOrder: string[] = [];
    const MAX_CACHE = 32;
    const getCacheKey = (base: string) => {
      const r = projection.rotate();
      const s = projection.scale();
      // Round to reduce key churn
  // Tighter rounding to avoid visible misalignment with hit paths
  const r0 = Math.round(r[0] * 20) / 20; // 0.05°
  const r1 = Math.round(r[1] * 20) / 20; // 0.05°
  const sc = Math.round(s * 10) / 10;    // 0.1 scale
      return `${base}@r${r0},${r1}|s${sc}|w${Math.round(width)}h${Math.round(height)}`;
    };
    const getCountriesD = () => {
      const key = getCacheKey('countries');
      const hit = pathCache.get(key);
      if (hit) return hit;
      const d = (path as any)(countriesFC) as string;
      pathCache.set(key, d);
      cacheOrder.push(key);
      if (cacheOrder.length > MAX_CACHE) {
        const old = cacheOrder.shift();
        if (old) pathCache.delete(old);
      }
      return d;
    };

    const getUrbanD = (urbanFC: any) => {
      const key = getCacheKey('urban');
      const hit = pathCache.get(key);
      if (hit) return hit;
      const d = (path as any)(urbanFC) as string;
      pathCache.set(key, d);
      cacheOrder.push(key);
      if (cacheOrder.length > MAX_CACHE) {
        const old = cacheOrder.shift();
        if (old) pathCache.delete(old);
      }
      return d;
    };

  const render = () => {
      const frameStart = performance.now();
      rafId = 0;
      
      // Budget-based rendering: only update what's necessary
      if (needsPathUpdate || (frameStart - lastUpdateTime > FRAME_BUDGET_MS)) {
        // Countries path via cache (visuals identical)
        countriesPath.attr('d', getCountriesD());
        // Keep hit layer geometry exactly in sync whenever paths update
        hitPaths.attr('d', path as any);
        needsPathUpdate = false;
        needsHitUpdate = false;
        lastUpdateTime = frameStart;
      } else if (needsHitUpdate) {
        // Fallback: update hit layer if explicitly requested
        hitPaths.attr('d', path as any);
        needsHitUpdate = false;
      }
      
      // Hover path - only update when visible
      if (hoverVisible) {
        hoverPath.attr('d', path as any);
      }
      
      // Selected country and states
      const selectedCountry = selectedCountryRef.current;
      if (selectedCountry) {
        selectedPath.style('display', 'block').datum(selectedCountry).attr('d', path as any);
        // Compute filtered states on-demand (only when zoomed in enough)
        const latestStates = statesRef.current;
        if (enableAdmin1 && zoomK >= admin1MinZoom && latestStates.length > 0) {
          let filtered: any[] = [];
          try {
            filtered = latestStates.filter((s: any) => d3.geoContains(selectedCountry, (s as any).__centroid || d3.geoCentroid(s)));
          } catch { filtered = []; }
          if (filtered.length > 0) {
            statesPath
              .style('display', 'block')
              .datum({ type: 'FeatureCollection', features: filtered } as any)
              .attr('d', path as any);
          } else {
            statesPath.style('display', 'none');
          }
        } else {
          statesPath.style('display', 'none');
        }
      } else {
        selectedPath.style('display', 'none');
        statesPath.style('display', 'none');
      }

      // Urban areas: draw only when toggled on and zoom is high enough
      if (enableUrbanAreas && showUrban && zoomK >= urbanMinZoom && urbanAreas.length > 0) {
        const urbanFC = { type: 'FeatureCollection', features: urbanAreas } as any;
        gUrban.style('display', 'block');
        // Cache path for performance
        const d = getUrbanD(urbanFC);
        urbanPath.datum(urbanFC).attr('d', d);
      } else {
        gUrban.style('display', 'none');
      }
    };

  const requestRender = (forcePathUpdate = false, forceHitUpdate = false) => {
      if (rafId) return;
      if (forcePathUpdate) needsPathUpdate = true;
      if (forceHitUpdate) needsHitUpdate = true;
      rafId = requestAnimationFrame(render);
    };
    // Expose a safe external trigger that forces both
    requestRenderRef.current = () => requestRender(true, true);

    // Google Earth-style drag with inertia
    let dragPrev: [number, number] | null = null;
    const onDragStart = (event: any) => {
      if (isAnimating) return;
      dragPrev = [event.x, event.y];
      vx = 0; vy = 0;
      if (inertiaId) { cancelAnimationFrame(inertiaId); inertiaId = 0; }
    };

    const onDragged = (event: any) => {
      if (!dragPrev || isAnimating) return;
      const dx = event.x - dragPrev[0];
      const dy = event.y - dragPrev[1];
      
      // Skip micro-movements to avoid unnecessary renders
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      
      // Scale rotation sensitivity based on zoom level (less sensitive when zoomed in)
      const zoomSensitivity = Math.max(0.15, Math.min(1, 1.2 - zoomK * 0.4)); // ranges from 0.15 to 1
      const rotationScale = 0.5 * zoomSensitivity; // base rotation sensitivity
      
      const r = projection.rotate();
      const newRot: [number, number, number] = [
        r[0] + dx * rotationScale,
        Math.max(-85, Math.min(85, r[1] - dy * rotationScale)), // limit vertical rotation
        r[2]
      ];
      projection.rotate(newRot);
      // dynamic precision based on zoomK
      {
        const t = Math.max(0, Math.min(1, (zoomK - 1.3) / (5 - 1.3)));
        projection.precision(0.55 + 0.4 * t);
      }
      
      dragPrev = [event.x, event.y];
      // Track velocity for inertia (also scaled by zoom sensitivity)
      vx = dx * rotationScale * 0.7; // slightly damped for smoother inertia
      vy = -dy * rotationScale * 0.7;
  // During drag, deprioritize hit updates to avoid extra cost
  requestRender(true, false);
    };

    const onDragEnd = () => {
      dragPrev = null;
      // Start inertial rotation if velocity is significant
      if (isAnimating || (Math.abs(vx) < minVel && Math.abs(vy) < minVel)) return;
      
      const step = () => {
        const r = projection.rotate();
        const newRot: [number, number, number] = [
          r[0] + vx,
          Math.max(-85, Math.min(85, r[1] + vy)), // limit vertical rotation during inertia too
          r[2]
        ];
        projection.rotate(newRot);
        {
          const t = Math.max(0, Math.min(1, (zoomK - 1.3) / (5 - 1.3)));
          projection.precision(0.55 + 0.4 * t);
        }
        
        // Higher decay for smoother deceleration
        vx *= 0.94; // slightly higher decay than before
        vy *= 0.94;
        requestRender(true, false); // only update paths during inertia
        
        if (Math.abs(vx) >= minVel || Math.abs(vy) >= minVel) {
          inertiaId = requestAnimationFrame(step);
        } else {
          inertiaId = 0;
          // Update hit paths once inertia stops
          requestRender(false, true);
        }
      };
      inertiaId = requestAnimationFrame(step);
    };

    svg.call(d3.drag<SVGSVGElement, unknown>()
      .on('start', onDragStart)
      .on('drag', onDragged)
      .on('end', onDragEnd) as any);

  // Smooth zoom with focus rotation (Google Earth style)
    let targetZoomK = zoomK;
    let zoomEaseId = 0;
    
    const smoothZoom = () => {
      zoomEaseId = 0;
      const base = Math.min(width, height) * 0.38;
      const current = projection.scale();
      const target = base * targetZoomK;
  const next = current + (target - current) * 0.12; // slower, smoother convergence
      projection.scale(next);
      zoomK = next / base;
      // Swap to high-res countries when zoomed enough and data is prefetched (if enabled)
      if (enableHiResSwap && !hiResAppliedRef.current && hiResCountriesRef.current && zoomK > hiResThreshold) {
        hiResAppliedRef.current = true;
        setCountries(hiResCountriesRef.current || []);
      }
      // Dynamic precision: lower when zoomed out, higher when zoomed in
      const t = Math.max(0, Math.min(1, (zoomK - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)));
      projection.precision(0.55 + 0.4 * t);
      requestRender(true, true); // keep hit layer in sync during zoom
      
      if (Math.abs(target - next) > 1.0) { // higher threshold to prevent jitter
        zoomEaseId = requestAnimationFrame(smoothZoom);
      } else {
  // Snap to final value and update hit paths
  projection.scale(target);
  zoomK = targetZoomK;
  const tt = Math.max(0, Math.min(1, (zoomK - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)));
  projection.precision(0.55 + 0.4 * tt);
  requestRender(true, true);
      }
    };

    // Custom wheel zoom with cursor focus (throttled)
    let wheelTimeout = 0;
    svg.on('wheel', (event: WheelEvent) => {
      if (isAnimating) return;
      event.preventDefault();
      
      // Throttle wheel events to avoid oversaturation
      if (wheelTimeout) return;
      wheelTimeout = window.setTimeout(() => { wheelTimeout = 0; }, 32); // slower throttle for smoother feel
      
      // Update target zoom smoothly with tighter limits
  const zoomFactor = Math.exp(-event.deltaY * 0.0015); // even less sensitive
  targetZoomK = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoomK * zoomFactor));
      
      if (!zoomEaseId) zoomEaseId = requestAnimationFrame(smoothZoom);
      
      // Remove cursor focus rotation entirely - it was causing aiming issues
      // The zoom will simply zoom in/out at current center point
    }, { passive: false } as any);

    // Pinch zoom for mobile
  const zoom = d3.zoom<SVGSVGElement, unknown>()
      .filter((event) => (event.type === 'touchstart' && (event.touches?.length || 0) === 2))
      .on('zoom', (event) => {
        if (isAnimating) return;
        zoomK = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, event.transform.k));
        projection.scale(Math.min(width, height) * 0.38 * zoomK);
        const t = Math.max(0, Math.min(1, (zoomK - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)));
        projection.precision(0.55 + 0.4 * t);
    requestRender(true, true); // force both updates for pinch
      });
  (svg as any).call(zoom as any).call((zoom as any).transform, d3.zoomIdentity.scale(1));

    // Resize
    const onResize = () => {
      const rect = measure();
      width = rect.width; height = rect.height;
      svg.attr('width', width).attr('height', height);
      const newBase = Math.min(width, height) * 0.38;
      projection.translate([width / 2, height / 2]).scale(newBase * zoomK);
  // Invalidate cache on size change
  pathCache.clear();
  cacheOrder.length = 0;
      requestRender(true, true);
    };
    window.addEventListener('resize', onResize);
    // React to container size changes as well (not only window)
    const ro = new ResizeObserver(onResize);
    if (svgRef.current) ro.observe(svgRef.current);

    // Country hit layer (hover/tooltip + click select)
  const gHit = svg.append('g').attr('class', 'countries-hit');
  const hitPaths = gHit.selectAll('path.hit')
      .data(countries)
      .join('path')
      .attr('class', 'hit')
      .attr('d', path as any)
      .attr('fill', '#000')
      .attr('fill-opacity', 0.001) // near-invisible but captures pointer events
      .attr('stroke', 'none')
      .style('pointer-events', 'all')
      .on('mousemove', (event: any, d: any) => {
        if (isAnimating) return;
        hoverVisible = true;
        hoverPath.style('display', 'block').datum(d).attr('d', path as any);
        const name = d.properties?.name || d.properties?.NAME || d.properties?.NAME_EN || 'Unknown';
        tooltip.textContent = name;
        tooltip.style.display = 'block';
        // Robust positioning using d3.pointer within the SVG
        const [px, py] = d3.pointer(event, svgRef.current as any);
        const rect = (svgRef.current as any).getBoundingClientRect();
        tooltip.style.left = `${rect.left + px + 10}px`;
        tooltip.style.top = `${rect.top + py - 25}px`;
      })
      .on('mouseout', () => {
        hoverVisible = false;
        hoverPath.style('display', 'none');
        tooltip.style.display = 'none';
      })
      .on('click', (event: any, d: any) => {
        if (event && event.stopPropagation) event.stopPropagation();
        selectedCountryRef.current = d;
        // We'll compute target zoom first, then decide on Admin1 fetch based on threshold

        // Smooth animate to center + zoom
        const target = d3.geoCentroid(d) as [number, number];
        const startRot = projection.rotate();
        const endRot: [number, number, number] = [-target[0], -target[1], 0];
        const rotInterp = d3.interpolateArray(startRot, endRot);
        const startScale = projection.scale();
        // Ensure first-click zoom meets admin1MinZoom when enabled
        const minZoomInK = enableAdmin1 ? Math.max(2.2, admin1MinZoom) : 2.2;
        const minZoomIn = Math.min(width, height) * 0.38 * minZoomInK;
        const relativeZoomIn = startScale * 1.25;
        const targetScale = Math.max(minZoomIn, relativeZoomIn);
        const scaleInterp = d3.interpolateNumber(startScale, targetScale);
        
        // Prefetch states data on first click if allowed (independent of target zoom)
        if (enableAdmin1 && states.length === 0 && !statesFetchingRef.current) {
          statesFetchingRef.current = true;
          fetch('/geodata/admin1-states-10m.json')
            .then(r => r.ok ? r.json() : null)
            .then((raw) => {
              if (!raw) return;
              // convert using same helper
              const preferKeys = ['states', 'provinces', 'admin1', 'ne_50m_admin_1'];
              let feats: any[] = [];
              try {
                if (raw.type === 'FeatureCollection') feats = raw.features || [];
                else if (raw.type === 'Topology' && raw.objects) {
                  const keys = Object.keys(raw.objects);
                  let picked: string | null = null;
                  for (const pref of preferKeys) {
                    const hit = keys.find(k => k.toLowerCase().includes(pref));
                    if (hit) { picked = hit; break; }
                  }
                  if (!picked) picked = keys[0];
                  const fc: any = topojsonFeature(raw, (raw.objects as any)[picked]);
                  feats = fc.features || [];
                }
              } catch {}
              setStates(feats);
            })
            .finally(() => { statesFetchingRef.current = false; });
        }

        requestRender();
        
        isAnimating = true;
        const dur = 1200; // slightly longer for smoother feel
        const t0 = performance.now();
        
        const tick = (now: number) => {
          const t = Math.min(1, (now - t0) / dur);
          const e = d3.easeCubicInOut(t);
          const rot = rotInterp(e) as [number, number, number];
          projection.rotate(rot);
          projection.scale(scaleInterp(e));
          zoomK = projection.scale() / (Math.min(width, height) * 0.38);
          requestRender();
          
          if (t < 1 && isAnimating) {
            rafId = requestAnimationFrame(tick);
          } else {
            isAnimating = false;
            // After animation completes, just request a full render; filtered states will compute on-demand
            requestRender(true, true);
          }
        };
        rafId = requestAnimationFrame(tick);
      });

    // Click outside to deselect
    svg.on('click', (event: any) => {
      const targetEl = event?.target as Element | null;
      if (targetEl && targetEl.closest && targetEl.closest('g.countries-hit')) return;
  selectedCountryRef.current = null;
      hoverVisible = false;
      tooltip.style.display = 'none';
      requestRender();
    });

    // Initial render
    requestRender();

    return () => {
      window.removeEventListener('resize', onResize);
      try { ro.disconnect(); } catch {}
      if (rafId) cancelAnimationFrame(rafId);
      if (inertiaId) cancelAnimationFrame(inertiaId);
      if (zoomEaseId) cancelAnimationFrame(zoomEaseId);
      svg.selectAll('*').remove();
      try { document.body.removeChild(tooltip); } catch {}
    };
  }, [countries, loading, error, focusLatLng]);

  // Idle prefetch of Admin1 and Urban Areas after first paint
  useEffect(() => {
    if (loading || error) return;
    const ric: any = (window as any).requestIdleCallback || ((cb: any) => setTimeout(() => cb({ timeRemaining: () => 50 }), 500));
    const cancelRic: any = (window as any).cancelIdleCallback || clearTimeout;
    const id = ric(async () => {
      try {
        // Prefetch Admin1 if enabled and not loaded
        if (enableAdmin1 && !admin1PrefetchStartedRef.current && (!statesRef.current || statesRef.current.length === 0)) {
          admin1PrefetchStartedRef.current = true;
          const r = await fetch('/geodata/admin1-states-10m.json');
          if (r && r.ok) {
            const raw = await r.json();
            const preferKeys = ['states', 'provinces', 'admin1', 'ne_50m_admin_1'];
            let feats: any[] = [];
            try {
              if (raw.type === 'FeatureCollection') feats = raw.features || [];
              else if (raw.type === 'Topology' && raw.objects) {
                const keys = Object.keys(raw.objects);
                let picked: string | null = null;
                for (const pref of preferKeys) {
                  const hit = keys.find((k: string) => k.toLowerCase().includes(pref));
                  if (hit) { picked = hit; break; }
                }
                if (!picked) picked = keys[0];
                const fc: any = topojsonFeature(raw, (raw.objects as any)[picked]);
                feats = fc.features || [];
              }
            } catch {}
            setStates(feats);
          }
        }
        // Prefetch Urban Areas if enabled and not loaded
        if (enableUrbanAreas && !urbanFetchStartedRef.current && (!urbanAreas || urbanAreas.length === 0)) {
          urbanFetchStartedRef.current = true;
          const r = await fetch('/atlas/ne_50m_urban_areas.geojson');
          if (r && r.ok) {
            const raw = await r.json();
            if (raw && raw.type === 'FeatureCollection' && Array.isArray(raw.features)) {
              setUrbanAreas(raw.features);
            }
          }
        }
      } catch {}
    });
    return () => { try { cancelRic(id); } catch {} };
  }, [loading, error, enableAdmin1, enableUrbanAreas]);

  // When states change, precompute centroids, sync ref, and trigger a render without re-initializing D3
  useEffect(() => {
    if (!states) return;
    try {
      for (const s of states as any[]) {
        const ss: any = s;
        if (!ss.__centroid) ss.__centroid = d3.geoCentroid(ss);
      }
    } catch {}
    statesRef.current = states;
    // ask D3 to render with the new states if component is mounted
    try { requestRenderRef.current && requestRenderRef.current(); } catch {}
  }, [states]);

  // On-demand fetch of Urban Areas when toggled on to reduce initial load
  useEffect(() => {
    if (!enableUrbanAreas) return;
    if (!showUrban) return;
    if (urbanAreas.length > 0) return;
    if (urbanFetchStartedRef.current) return;
    urbanFetchStartedRef.current = true;
    fetch('/atlas/ne_50m_urban_areas.geojson')
      .then(r => (r && r.ok ? r.json() : null))
      .then((raw) => {
        if (!raw) return;
        if (raw.type === 'FeatureCollection' && Array.isArray(raw.features)) {
          setUrbanAreas(raw.features);
          // trigger a render in case the globe is already visible/zoomed
          try { requestRenderRef.current && requestRenderRef.current(); } catch {}
        }
      })
      .catch(() => { urbanFetchStartedRef.current = false; });
  }, [enableUrbanAreas, showUrban, urbanAreas.length]);

  if (loading) {
    return (
      <div style={{
        width: '100vw', height: '100vh', background: '#000', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', fontSize: 16
      }}>
        <div>🌐 D3GEO 글로브 데이터 로딩 중...</div>
        <div style={{ fontSize: 12, marginTop: 8, color: '#999' }}>Google Earth 스타일 컨트롤</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        width: '100vw', height: '100vh', background: '#000', color: '#ff6666',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', fontSize: 16
      }}>
        <div>❌ 지도 데이터 로드 실패</div>
        <div style={{ fontSize: 12, marginTop: 8, color: '#ccc' }}>{error}</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block', background: '#fff' }} />
      <div style={{ position: 'absolute', bottom: 20, left: 20, background: 'rgba(255,255,255,0.95)', border: '1px solid #ccc', borderRadius: 6, padding: 12, fontSize: 12, color: '#000', minWidth: 240 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>🌐 D3GEO Globe (Google Earth Style)</div>
        <div>🏳️ 국가 경계: {countries.length}개</div>
        <div style={{ color: '#555' }}>🏛️ 주/도 경계: {states.length}개</div>
        <div style={{ marginTop: 6, color: '#666' }}>드래그: 관성 회전 | 휠: 포커스 줌</div>
        {enableUrbanAreas && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showUrban}
                onChange={(e) => setShowUrban(e.target.checked)}
              />
              <span>도시 경계 표시 (줌 {urbanMinZoom}+)</span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
