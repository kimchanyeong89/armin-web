import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { mesh as topojsonMesh } from 'topojson-client';
import type { Exhibition } from '../types/Exhibition';
import { resolveStaticUrl } from '../utils/staticAssets';
import { getDataFetchOptions } from '../utils/network';

// Minimal D3 orthographic globe with stroke-only borders on white background
// Props allow focusing a lat/lng and optional auto-rotation
export type GlobeD3Props = {
  focusLatLng?: { lat: number; lng: number } | null;
  autorotate?: boolean; // auto-rotate enabled?
  stroke?: string; // stroke color
  strokeWidth?: number; // px
  exhibitions?: Exhibition[];
  onSelectExhibition?: (ex: Exhibition) => void;
};

export default function GlobeD3({ focusLatLng = null, autorotate = false, stroke = '#2b3138', strokeWidth = 1.5, exhibitions = [], onSelectExhibition }: GlobeD3Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const spinningRef = useRef<boolean>(autorotate);
  const focusAnimRef = useRef<number | null>(null);
  // Keep rotation angles continuous across interactions
  const lastRotateRef = useRef<[number, number, number]>([0, 0, 0]);
  // Track which coarse clusters (city-level) are expanded at low zoom
  const expandedClustersRef = useRef<Set<string>>(new Set());
  // 사용자 클릭으로 방금 펼친 클러스터 키 (해당 렌더에서만 애니메이션)
  const animateExpandKeyRef = useRef<string | null>(null);
  // 빈 공간 클릭 시 역순으로 닫히는 애니메이션 제어
  const collapseAnimKeyRef = useRef<string | null>(null);
  const collapsePendingRef = useRef<number>(0);
  const collapseFinalizedRef = useRef<boolean>(false);

  useEffect(() => {
    const buildTag = 'GlobeD3-no-external-2025-09-05-01';
    // Clear identifier to verify correct build is loaded in the browser
    // console.log(`[GlobeD3] build tag: ${buildTag}`);
    try { (window as any).__GlobeD3BuildTag = buildTag; } catch { }
    // Debug logging trimmed for performance

    const container = containerRef.current;
    if (!container) return;

    // Setup
    // Interaction sensitivity knobs (tweak to taste)
    const WHEEL_ZOOM_SENSITIVITY = 0.006; // higher = faster zoom
    const ROTATE_TO_CURSOR_ALPHA = 0.12; // softer re-centering while zooming (0..1)
    const ROTATE_MAX_STEP_LON = 4; // deg per event
    const ROTATE_MAX_STEP_LAT = 2; // deg per event
    const DRAG_PX_SENS = 0.24; // deg per pixel for drag
    const PIN_MOVE_DURATION = 260; // ms
    const LABEL_SLIDE_DURATION = 220; // ms
    const COLLAPSE_STAGGER = 40; // ms per step (reverse order)
    // Cluster/grid constants
    const CLUSTER_GRID_SIZE = 0.8;
    const roundToGrid = (v: number) => Math.round(v / CLUSTER_GRID_SIZE) * CLUSTER_GRID_SIZE;
    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;
    let baseRadius = Math.min(width, height) * 0.38; // matches the screenshot scale
    let zoomK = 1;

    // Clear container
    container.innerHTML = '';

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .style('display', 'block')
      .style('background', '#fff');

    // Viewport group (kept simple; no transform for center-anchored zoom)
    const gViewport = svg.append('g').attr('class', 'viewport');
    // 빈 공간 클릭 시 펼친 클러스터를 역순 애니메이션으로 닫기
    svg.on('click', () => {
      const expanded = Array.from(expandedClustersRef.current);
      if (!expanded.length) return;
      const key = expanded[0];
      // 시작: 닫힘 애니메이션 상태로 전환
      collapseAnimKeyRef.current = key;
      collapseFinalizedRef.current = false;
      // 렌더하여 각 핀이 중앙으로 수렴하도록 트리거
      renderPins();
    });

    const projection = d3.geoOrthographic()
      .translate([width / 2, height / 2])
      .scale(baseRadius)
      // 성능 최적화: 정밀도를 대폭 낮춤 (더 적은 segments = 훨씬 빠름)
      .precision(2.0);

    const path = d3.geoPath(projection);

    // Initialize last rotation after projection is created
    lastRotateRef.current = projection.rotate() as [number, number, number];

    // (removed versor helpers; reverted to simpler drag)

    const unwrapAngle = (prev: number, next: number) => prev + (((next - prev + 540) % 360) - 180);
    const setRotationContinuous = (next: [number, number, number]) => {
      const prev = lastRotateRef.current;
      let l = unwrapAngle(prev[0], next[0]);
      let p = next[1];
      let g = unwrapAngle(prev[2], next[2] ?? 0);
      // Fold over poles: when |phi| crosses 90°, reflect phi and add 180° to lambda and gamma
      // Repeat to handle multiple pole crossings in one step
      while (p > 90) { p = 180 - p; l += 180; g += 180; }
      while (p < -90) { p = -180 - p; l += 180; g += 180; }
      // Keep l,g continuous relative to previous state
      l = unwrapAngle(prev[0], l);
      g = unwrapAngle(prev[2], g);
      projection.rotate([l, p, g]);
      lastRotateRef.current = [l, p, g];
    };

    // Autorotate controls
    const stopSpin = () => {
      spinningRef.current = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    const startSpin = () => {
      if (!autorotate) return;
      spinningRef.current = true;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      rafRef.current = requestAnimationFrame(step);
    };

    const gCountries = gViewport.append('g').style('pointer-events', 'none');
    // Interactive country hits (transparent paths for hover/click)
    const gCountriesHit = gViewport.append('g').attr('class', 'countries-hit').style('pointer-events', 'all');
    // Selected country highlight
    const gCountryHighlight = gViewport.append('g').attr('class', 'country-highlight').style('pointer-events', 'none');
    // Urban/city boundaries layer (restored)
    const gUrban = gViewport.append('g').style('pointer-events', 'none').style('display', 'none');
    const gAdmin = gViewport.append('g').style('display', 'none'); // admin (states/provinces) boundaries
    // Higher-detail atlas layers (TopoJSON)
    const gAtlasCountries = gViewport.append('g').style('display', 'none').style('pointer-events', 'none');
    const gAtlasStates = gViewport.append('g').style('display', 'none').style('pointer-events', 'none');
    // admin/state layers
    let hasAdminStates = false;
    let adminStatesLoadAttempted = false;
    let adminAllFeatures: any[] = [];
    let hasAtlasCountries = false;
    let atlasCountriesLoadAttempted = false;
    // urban/city boundaries state
    let hasUrbanAreas = false;
    let urbanAllFeatures: any[] = [];
    // country interaction state
    let selectedCountry: any | null = null;

    // 극한 성능 최적화: path 업데이트 공통 함수
    let lightPathMode = false;
    const updateAllPaths = () => {
      // In light mode, update only essential paths for interaction responsiveness
      if (lightPathMode) {
        gCountries.selectAll('path').attr('d', path as any);
        gCountryHighlight.selectAll('path').attr('d', path as any);
        gAtlasCountries.selectAll('path').attr('d', path as any);
        // Skip heavy layers (hits/admin/urban) during continuous interactions
        return;
      }
      gCountries.selectAll('path').attr('d', path as any);
      gCountriesHit.selectAll('path').attr('d', path as any);
      gCountryHighlight.selectAll('path').attr('d', path as any);
      gUrban.selectAll('path').attr('d', path as any);
      gAdmin.selectAll('path').attr('d', path as any);
      gAtlasCountries.selectAll('path').attr('d', path as any);
      gAtlasStates.selectAll('path').attr('d', path as any);
    };

    // 극한 성능 최적화: requestAnimationFrame 기반 렌더링
    let animationFrameId: number | null = null;
    let needsPathUpdate = false;
    let needsPinUpdate = false;
    let isUpdatingPaths = false;
    let isRenderingPins = false;
    // Throttle pin rendering to limit work during continuous interactions
    const PIN_UPDATE_MIN_INTERVAL = 50; // ms
    let lastPinUpdateTs = 0;

    const scheduleRender = () => {
      if (animationFrameId) return; // 이미 스케줄됨

      animationFrameId = requestAnimationFrame(() => {
        if (needsPathUpdate && !isUpdatingPaths) {
          isUpdatingPaths = true;
          updateAllPaths();
          needsPathUpdate = false;
          isUpdatingPaths = false;
        }

        if (needsPinUpdate && !isRenderingPins) {
          const now = performance.now();
          if (now - lastPinUpdateTs >= PIN_UPDATE_MIN_INTERVAL) {
            isRenderingPins = true;
            renderPins();
            needsPinUpdate = false;
            isRenderingPins = false;
            lastPinUpdateTs = now;
          }
        }

        animationFrameId = null;
        // If work remains (e.g., throttled), schedule next frame
        if (needsPathUpdate || needsPinUpdate) {
          scheduleRender();
        }
      });
    };

    const requestPathUpdate = () => {
      needsPathUpdate = true;
      scheduleRender();
    };

    const requestPinUpdate = () => {
      needsPinUpdate = true;
      scheduleRender();
    };

    // --- Precompute clusters once per exhibitions set for faster renders ---
    const normalizeCity = (s: unknown) => {
      if (typeof s !== 'string') return '';
      const raw = s
        .toLowerCase()
        .replace(/[()]/g, '')
        .split(/[,:]/)
        .map(t => t.trim())
        .filter(Boolean);
      if (!raw.length) return '';
      const removeTail = new Set([
        'uk', 'u.k.', 'united kingdom', 'great britain', 'gb', 'england', 'scotland', 'wales', 'northern ireland',
        'south korea', 'korea', 'republic of korea', '대한민국',
        'united states', 'united states of america', 'usa', 'us', 'u.s.',
        'canada', 'japan', 'france', 'germany', 'italy', 'spain', 'china', 'australia', 'ireland'
      ]);
      const tokens: string[] = [...raw];
      while (tokens.length && removeTail.has(tokens[tokens.length - 1])) tokens.pop();
      if (!tokens.length) return '';
      if (tokens.some(t => /\blondon\b/.test(t))) return 'london';
      const seoulIdx = tokens.findIndex(t => /\bseoul\b|서울|서울특별시/.test(t));
      if (seoulIdx >= 0) return 'seoul';
      const noDigits = tokens.filter(t => !/[0-9]/.test(t));
      let candidate = (noDigits.length ? noDigits : tokens)[(noDigits.length ? noDigits : tokens).length - 1];
      candidate = candidate.replace(/^(city of|greater|metropolitan|metropolitan city)\s+/, '');
      candidate = candidate.replace(/\s+\d.*$/, '');
      candidate = candidate.replace(/\s+/g, ' ').trim();
      return candidate;
    };

    type ClusterInfo = {
      key: string;
      items: Exhibition[];
      centerLon: number;
      centerLat: number;
      sortedByName: Exhibition[];
    };
    const clustersList: ClusterInfo[] = (() => {
      const map: Record<string, Exhibition[]> = {};
      for (const d of exhibitions) {
        const cityKey = normalizeCity((d as any).city || (d as any).location);
        let key: string;
        if (cityKey) key = `city:${cityKey}`;
        else {
          const gridLon = roundToGrid(d.longitude);
          const gridLat = roundToGrid(d.latitude);
          key = `grid:${gridLon},${gridLat}`;
        }
        (map[key] ||= []).push(d);
      }
      return Object.entries(map).map(([key, items]) => ({
        key,
        items,
        centerLon: d3.mean(items as any, (d: any) => d.longitude) as number,
        centerLat: d3.mean(items as any, (d: any) => d.latitude) as number,
        sortedByName: [...items].sort((a: any, b: any) => String(a.name || a.title).localeCompare(String(b.name || b.title)))
      }));
    })();

    // Below this zoom, city-level markers are shown; separate threshold not used anymore
    // 핀 그룹을 가장 먼저 생성하여 다른 요소들 위에 표시되도록 함
    const gPins = gViewport.append('g').style('pointer-events', 'all');

    // Centralized layer visibility (always prefer most detailed layers available, independent of zoom)
    const updateLayerVisibility = () => {
      // prefer higher-res atlas data when available

      // Always prefer high-resolution countries data
      if (hasAtlasCountries) {
        gAtlasCountries.style('display', 'block');
        gCountries.style('display', 'none');
      } else {
        gAtlasCountries.style('display', 'none');
        gCountries.style('display', 'block');
      }
      // Show urban boundaries only when a country is selected and data is available
      gUrban.style('display', (hasUrbanAreas && selectedCountry) ? 'block' : 'none');
      // Show admin1 states/provinces only when a country is selected and data is available
      gAdmin.style('display', (hasAdminStates && selectedCountry) ? 'block' : 'none');
      gAtlasStates.style('display', 'none');

      // 도시 관련 레이어들은 모두 제거됨 (도시 경계 표시 기능 제거)
    };

    // Dev guard: detect unexpected external fetches from old bundles (debug only)
    try {
      const origFetch = window.fetch.bind(window);
      (window as any).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : (input as URL).toString();
        if (/world-atlas@|cdn\.jsdelivr\.net\/npm\/world-atlas@/i.test(url)) {
          // console.warn('[GlobeD3] BLOCKED external fetch:', url);
          throw new Error('Blocked external fetch: ' + url);
        }
        return origFetch(input as any, init);
      };
    } catch { }


    // Load countries from local static GeoJSON to draw borders
    // Helper: try multiple URLs until one succeeds (kept for potential future use)
    // const fetchJsonWithFallback = async (urls: string[]) => {
    //   for (const url of urls) {
    //     try {
    //       const res = await fetch(url);
    //       if (!res.ok) continue;
    //       return await res.json();
    //     } catch {
    //       // try next
    //     }
    //   }
    //   throw new Error(`All sources failed: ${urls.join(' | ')}`);
    // };

    // Load high-resolution countries data (same as OpenStreetMapComponent)
    (async () => {
      try {
        const res = await fetch('/geodata/countries-50m.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const geo = await res.json();
        // Draw as a single path to reduce DOM nodes
        gCountries
          .selectAll('path.country-merged')
          .data([geo])
          .join('path')
          .attr('class', 'country-merged')
          .attr('d', path as any)
          .style('fill', 'none')
          .style('stroke', '#000000')
          .style('stroke-width', '0.4px')
          .style('vector-effect', 'non-scaling-stroke')
          .style('stroke-linejoin', 'round')
          .style('stroke-linecap', 'round');

        // Interactive per-country hits for hover/click selection
        const feats = (geo.features || []);
        const hitSel = gCountriesHit
          .selectAll('path.country-hit')
          .data(feats, (d: any) => d.id || d.properties?.name || d.properties?.ADMIN || Math.random());
        hitSel.join('path')
          .attr('class', 'country-hit')
          .attr('d', path as any)
          .style('fill', 'rgba(0,0,0,0)')
          .style('stroke', 'none')
          .style('pointer-events', 'all')
          .each(function (d: any) {
            const sel = d3.select(this as SVGPathElement);
            sel.selectAll('title').remove();
            sel.append('title').text(d.properties?.name || d.properties?.ADMIN || '');
          })
          .on('mouseover', function () {
            d3.select(this as SVGPathElement)
              .style('stroke', '#111')
              .style('stroke-width', '0.6px');
          })
          .on('mouseout', function () {
            d3.select(this as SVGPathElement)
              .style('stroke', 'none')
              .style('stroke-width', null);
          })
          .on('click', (evt: any, d: any) => {
            evt?.stopPropagation?.();
            const same = selectedCountry && ((selectedCountry.id && d.id && selectedCountry.id === d.id) || ((selectedCountry.properties?.name || selectedCountry.properties?.ADMIN) === (d.properties?.name || d.properties?.ADMIN)));
            selectedCountry = same ? null : d;
            // Highlight selection
            gCountryHighlight.selectAll('*').remove();
            if (selectedCountry) {
              gCountryHighlight
                .append('path')
                .datum(selectedCountry)
                .attr('d', path as any)
                .style('fill', 'none')
                .style('stroke', '#111827')
                .style('stroke-width', '1px')
                .style('vector-effect', 'non-scaling-stroke');
            }
            // Update urban layer for selection
            renderUrbanForSelection();
            // Update admin1 states layer for selection
            renderAdminForSelection();
          });
      } catch (e) {
        // Fallback to original
        // Fallback to original
        try {
          const res = await fetch('/geo/countries.geo.json');
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const geo = await res.json();
          gCountries
            .selectAll('path.country-merged')
            .data([geo])
            .join('path')
            .attr('class', 'country-merged')
            .attr('d', path as any)
            .style('fill', 'none')
            .style('stroke', stroke)
            .style('stroke-width', String(strokeWidth))
            .style('vector-effect', 'non-scaling-stroke')
            .style('stroke-linejoin', 'round')
            .style('stroke-linecap', 'round');
        } catch (fallbackError) {
          console.warn('[GlobeD3] All country data loading failed', fallbackError);
        }
      }
    })();

    // Lazy loaders: only fetch when threshold is crossed
    // helper removed (unused)

    // Urban areas: adopt data published by D3GeoGlobeMap (no direct fetch here)
    const adoptUrbanAreasFromGlobal = () => {
      const anyWin: any = window as any;
      const gj = anyWin.__UrbanAreas;
      if (!gj || !gj.features) return;
      urbanAllFeatures = (gj.features || []).filter((d: any) => (d.properties?.area_sqkm || 0) > 100);
      hasUrbanAreas = urbanAllFeatures.length > 0;
      renderUrbanForSelection();
    };

    // Filter and render urban areas for selected country only
    const renderUrbanForSelection = () => {
      if (!hasUrbanAreas) {
        gUrban.style('display', 'none');
        return;
      }
      if (!selectedCountry) {
        gUrban.selectAll('path.urban').data([]).join('path');
        gUrban.style('display', 'none');
        return;
      }
      // Filter urban polygons whose centroid lies within selected country
      const filtered = urbanAllFeatures.filter((u: any) => {
        try {
          const c = d3.geoCentroid(u as any);
          return d3.geoContains(selectedCountry as any, c as any);
        } catch { return false; }
      });
      gUrban
        .selectAll('path.urban')
        .data(filtered, (d: any) => d.properties?.gn_name || d.properties?.name || d.id || Math.random())
        .join('path')
        .attr('class', 'urban')
        .attr('d', path as any)
        .style('fill', 'none')
        .style('stroke', '#666')
        .style('stroke-width', (d: any) => ((d.properties?.area_sqkm || 0) > 1000 ? 1.0 : 0.8))
        .style('opacity', 0.8)
        .style('vector-effect', 'non-scaling-stroke')
        .style('shape-rendering', 'crispEdges')
        .style('pointer-events', 'none');
      gUrban.style('display', filtered.length ? 'block' : 'none');
      updateLayerVisibility();
      requestPathUpdate();
    };

    // Filter and render admin1 states only for selected country
    const renderAdminForSelection = () => {
      if (!hasAdminStates) {
        gAdmin.style('display', 'none');
        return;
      }
      if (!selectedCountry) {
        gAdmin.selectAll('path.state').data([]).join('path');
        gAdmin.style('display', 'none');
        return;
      }
      const filtered = adminAllFeatures.filter((s: any) => {
        try {
          const c = d3.geoCentroid(s as any);
          return d3.geoContains(selectedCountry as any, c as any);
        } catch { return false; }
      });
      gAdmin
        .selectAll('path.state')
        .data(filtered, (d: any) => d.id || d.properties?.name || d.properties?.NAME || Math.random())
        .join('path')
        .attr('class', 'state')
        .attr('d', path as any)
        .style('fill', 'none')
        .style('stroke', '#888888')
        .style('stroke-width', '0.2px')
        .style('opacity', 0.35)
        .style('vector-effect', 'non-scaling-stroke')
        .style('shape-rendering', 'crispEdges')
        .style('pointer-events', 'none');
      gAdmin.style('display', filtered.length ? 'block' : 'none');
      updateLayerVisibility();
      requestPathUpdate();
    };

    const loadAtlasCountriesIfNeeded = async () => {
      if (atlasCountriesLoadAttempted || hasAtlasCountries) return;
      atlasCountriesLoadAttempted = true;
      try {
        const urls = ['/atlas/countries-110m.json', '/atlas/package/countries-110m.json'];
        let json: any | null = null;
        for (const url of urls) {
          try {
            const res = await fetch(url, getDataFetchOptions());
            if (!res.ok) continue;
            json = await res.json();
            if (json) break;
          } catch { }
        }
        if (!json) return;
        // Consolidate using mesh: coastline + borders as 1-2 paths
        const keys = Object.keys(json.objects || {});
        const countriesKey = keys.find(k => /countries|nation/i.test(k)) || keys[0];
        const landKey = keys.find(k => /\bland\b/i.test(k)) || null;
        const borders = topojsonMesh(json as any, (json as any).objects[countriesKey], (a: any, b: any) => a !== b);
        const coastline = landKey ? topojsonMesh(json as any, (json as any).objects[landKey]) : null;
        gAtlasCountries.selectAll('*').remove();
        if (coastline) {
          gAtlasCountries
            .append('path')
            .attr('class', 'atlas-coastline')
            .datum(coastline as any)
            .attr('d', path as any)
            .style('fill', 'none')
            .style('stroke', '#111')
            .style('stroke-width', '0.5px')
            .style('vector-effect', 'non-scaling-stroke');
        }
        gAtlasCountries
          .append('path')
          .attr('class', 'atlas-borders')
          .datum(borders as any)
          .attr('d', path as any)
          .style('fill', 'none')
          .style('stroke', '#000')
          .style('stroke-width', '0.3px')
          .style('vector-effect', 'non-scaling-stroke');
        hasAtlasCountries = true;
        // refresh visibility and paths
        updateLayerVisibility();
        requestPathUpdate();
      } catch {
        // ignore
      }
    };

    // Admin1 states/provinces (from OpenStreetMapComponent) loader
    const loadAdmin1StatesIfNeeded = async () => {
      if (adminStatesLoadAttempted || hasAdminStates) return;
      adminStatesLoadAttempted = true;
      try {
        const res = await fetch(resolveStaticUrl('geodata/admin1-states-10m.json'), getDataFetchOptions());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const fc = await res.json();
        adminAllFeatures = (fc.features || []);
        hasAdminStates = adminAllFeatures.length > 0;
        renderAdminForSelection();
        updateLayerVisibility();
      } catch {
        // ignore
      }
    };

    // heavy optional loaders (admin/states) removed for performance

    // 도시 경계 로딩 기능 제거됨

    // Urban areas 관련 기능 제거됨

    // Simple stable hash for deterministic angles per cluster key (kept for potential future use)
    // const hashKey = (s: string) => {
    //   let h = 2166136261 >>> 0;
    //   for (let i = 0; i < s.length; i++) {
    //     h ^= s.charCodeAt(i);
    //     h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    //   }
    //   return h >>> 0;
    // };

    // 성능 최적화: 간단한 렌더링 스킵 조건
    let lastRotation = '';

    // Pins: geographic-grid clustering with stable centroid spiderfy (precomputed clusters)
    const renderPins = () => {
      const rotate = projection.rotate();
      const rotationKey = `${rotate[0].toFixed(1)},${rotate[1].toFixed(1)},${zoomK.toFixed(2)}`;
      if (lastRotation === rotationKey) return;
      lastRotation = rotationKey;

      // Build nodes from precomputed clusters
      const nodes: any[] = [];
      const MAX_EXPANDED_ITEMS = 40; // cap expanded pins per cluster
      for (const c of clustersList) {
        const key = c.key;
        const items = c.items as any[];
        if (items.length === 1) {
          const d = items[0];
          const p = projection([d.longitude, d.latitude]);
          nodes.push({
            ...d,
            px: p ? p[0] : 0,
            py: p ? p[1] : 0,
            _projected: !!p,
            _labelVisible: true,
            _cluster: false
          });
        } else if (expandedClustersRef.current.has(key)) {
          const center = projection([c.centerLon, c.centerLat]);
          if (center) {
            const sorted = (c.sortedByName as any[]);
            const count = Math.min(sorted.length, MAX_EXPANDED_ITEMS);
            const V_SPACING = Math.max(20, 360 / Math.max(8, count));
            const isExpanding = animateExpandKeyRef.current === key;
            const isCollapsing = collapseAnimKeyRef.current === key;
            if (isCollapsing) collapsePendingRef.current = count;
            for (let i = 0; i < count; i++) {
              const d = sorted[i];
              const rank = Math.floor(i / 2) + 1;
              const sign = (i % 2 === 0) ? +1 : -1;
              const offsetIndex = sign * rank;
              const px = center[0];
              const py = center[1] + offsetIndex * V_SPACING;
              const collapseOrder = (sorted.length - 1 - i);
              nodes.push({
                ...d,
                px,
                py,
                ...(isExpanding ? { _originX: center[0], _originY: center[1], _delayLabelAfterMove: true } : {}),
                ...(isCollapsing ? { _collapsing: true, _collapseX: center[0], _collapseY: center[1], _collapseOrder: collapseOrder } : {}),
                _labelVisible: true,
                _cluster: false
              });
            }
          }
        } else {
          const center = projection([c.centerLon, c.centerLat]);
          nodes.push({
            _cluster: true,
            key: key,
            count: items.length,
            longitude: c.centerLon,
            latitude: c.centerLat,
            px: center ? center[0] : 0,
            py: center ? center[1] : 0,
            _projected: !!center,
            _labelVisible: true,
            _items: items
          });
        }
      }

      const sel = gPins.selectAll('g.pin').data(nodes, (d: any) => (d._cluster ? d.key : d.id));
      sel.exit().remove();
      const enter = sel.enter().append('g').attr('class', 'pin').style('cursor', 'pointer');

      // 클러스터 버튼 렌더링 (검정 네모 + 흰색 숫자)
      const enterCluster = enter.filter((d: any) => d._cluster);

      // 검정 네모(둥근 모서리) 배경 (크기 더 소형화)
      enterCluster.append('rect')
        .attr('class', 'cluster-bg')
        .attr('x', (d: any) => {
          const size = Math.max(26, 18 + Math.log2(d.count) * 5);
          return -size / 2;
        })
        .attr('y', (d: any) => {
          const size = Math.max(26, 18 + Math.log2(d.count) * 5);
          return -size / 2;
        })
        .attr('width', (d: any) => Math.max(26, 18 + Math.log2(d.count) * 5))
        .attr('height', (d: any) => Math.max(26, 18 + Math.log2(d.count) * 5))
        .attr('rx', 10)
        .attr('ry', 10)
        .attr('fill', '#111827')
        .attr('stroke', '#E5E7EB')
        .attr('stroke-width', 1.5)
        .style('cursor', 'pointer');

      // 클러스터 개수 텍스트 (흰색, 굵게)
      enterCluster.append('text')
        .attr('class', 'cluster-count')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('font-size', (d: any) => Math.max(11, 10 + Math.log2(d.count) * 1.4))
        .attr('font-weight', 'bold')
        .attr('fill', '#ffffff')
        .style('text-shadow', '1px 1px 2px rgba(0,0,0,0.6)')
        .style('cursor', 'pointer')
        .text((d: any) => d.count);

      // 클릭 히트영역 확장 (투명 원)
      enterCluster.append('circle')
        .attr('class', 'hit')
        .attr('r', (d: any) => Math.max(16, 12 + Math.log2(d.count) * 4))
        .attr('fill', 'transparent')
        .attr('stroke', 'none')
        .style('pointer-events', 'all');

      // 툴팁
      enterCluster.append('title')
        .text((d: any) => `${d.count}개의 전시관이 있습니다.\n클릭하여 펼쳐보세요.`);

      // 개별 핀 렌더링 (검정 원 + 흰 점)
      const enterPin = enter.filter((d: any) => !d._cluster);

      enterPin.append('circle')
        .attr('class', 'pin-bg')
        .attr('r', 7)
        .attr('fill', '#111827')
        .attr('stroke', '#E5E7EB')
        .attr('stroke-width', 1.5);

      enterPin.append('circle')
        .attr('class', 'pin-dot')
        .attr('r', 2.4)
        .attr('fill', '#ffffff');

      enterPin.append('text')
        .attr('class', 'pin-label')
        .attr('dy', '0.35em')
        .attr('x', 0)
        .attr('text-anchor', 'start')
        .style('font-size', '11px')
        .style('font-weight', 'bold')
        .style('fill', '#333')
        .style('stroke', '#fff')
        .style('stroke-width', 2)
        .style('paint-order', 'stroke')
        .text((d: any) => {
          const t = (d.title ?? d.name ?? '').toString();
          return t.toUpperCase();
        });

      // 클릭 이벤트
      const merged = enter.merge(sel as any);
      merged.on('click', (evt: any, d: any) => {
        evt?.stopPropagation?.();
        spinningRef.current = false;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);

        if (d._cluster) {
          // 클러스터 클릭: 펼치기/접기
          const k = d.key as string;
          if (expandedClustersRef.current.has(k)) {
            expandedClustersRef.current.delete(k);
          } else {
            expandedClustersRef.current.clear();
            expandedClustersRef.current.add(k);
            animateExpandKeyRef.current = k;
          }
          renderPins();
        } else {
          // 개별 핀 클릭
          if (onSelectExhibition) onSelectExhibition(d);
        }
      });

      // 위치 업데이트 및 hover 효과
      merged.each(function (d: any) {
        const g = d3.select(this as SVGGElement);

        // 가시성 (전면/후면)에 따라 표시 제어를 먼저 수행하고, 보이는 경우에만 위치/애니메이션 적용
        const lon = d.longitude; // same for cluster/pin
        const rotatedLon = lon + rotate[0];
        const normalizedLon = ((rotatedLon + 180) % 360) - 180;
        const visible = Math.abs(normalizedLon) <= 90;
        g.style('display', visible ? 'block' : 'none');
        if (!visible) return; // 뒷면에서는 렌더/애니메이션 스킵

        const isCollapsing = (d as any)._collapsing;
        const collapseOrder = (d as any)._collapseOrder ?? 0;
        const ease = d3.easeCubicOut;
        // scale durations by node count to reduce workload when many pins visible
        const visiblePins = nodes.length;
        const PIN_DUR = visiblePins > 200 ? 120 : visiblePins > 100 ? 180 : PIN_MOVE_DURATION;
        const LABEL_DUR = visiblePins > 200 ? 100 : visiblePins > 100 ? 160 : LABEL_SLIDE_DURATION;
        // 엔터 애니메이션(펼침): 핀은 중앙에서 목표 위치로 이동
        if ((d as any)._originX != null && (d as any)._originY != null) {
          g.attr('transform', `translate(${(d as any)._originX},${(d as any)._originY})`);
          g.transition().duration(PIN_DUR).ease(ease)
            .attr('transform', `translate(${d.px},${d.py})`);
        } else if (isCollapsing) {
          // 닫힘 애니메이션: 라벨 먼저 숨김(아래 라벨 처리에서 딜레이), 그 다음 핀이 중앙으로 수렴
          // 역순으로 사라지도록 collapseOrder 기반 지연 적용
          const delayMs = Math.max(0, COLLAPSE_STAGGER * collapseOrder) + LABEL_DUR + 10;
          g.attr('transform', `translate(${d.px},${d.py})`)
            .transition()
            .delay(delayMs as any)
            .duration(PIN_DUR)
            .ease(ease)
            .attr('transform', `translate(${(d as any)._collapseX},${(d as any)._collapseY})`)
            .on('end', () => {
              // 각 핀의 이동 완료 추적
              if (collapsePendingRef.current > 0) {
                collapsePendingRef.current -= 1;
                if (collapsePendingRef.current === 0 && !collapseFinalizedRef.current) {
                  collapseFinalizedRef.current = true;
                  // 실제로 클러스터를 접고 다시 렌더
                  expandedClustersRef.current.clear();
                  collapseAnimKeyRef.current = null;
                  renderPins();
                }
              }
            });
        } else {
          g.attr('transform', `translate(${d.px},${d.py})`);
        }

        // 라벨 표시/숨기기 및 슬라이드 애니메이션 (핀에만 해당; 클러스터는 텍스트가 다름)
        const label = g.select<SVGTextElement>('.pin-label');
        if (!label.empty()) {
          if (isCollapsing) {
            // 닫힘: 라벨을 먼저 좌측으로 슬라이드/페이드아웃
            const delayMs = Math.max(0, COLLAPSE_STAGGER * collapseOrder);
            label.interrupt()
              .attr('x', 12)
              .style('opacity', 1)
              .transition().delay(delayMs).duration(LABEL_SLIDE_DURATION).ease(d3.easeCubicIn)
              .attr('x', 0)
              .style('opacity', 0);
          } else if (d._labelVisible) {
            // 펼침 직후에는 핀 이동 후 라벨 등장
            const delay = (d as any)._delayLabelAfterMove ? (PIN_DUR + 30) : 0;
            label
              .attr('x', 0)
              .style('opacity', 0)
              .transition().delay(delay).duration(LABEL_DUR).ease(d3.easeCubicOut)
              .attr('x', 12)
              .style('opacity', 1);
          } else {
            label.interrupt().style('opacity', 0).attr('x', 0);
          }
        }

        // 클러스터 hover 효과 (클릭은 중앙 핸들러 사용)
        if (d._cluster) {
          g.on('mouseover', function () {
            d3.select(this as SVGGElement).select('.cluster-bg')
              .transition().duration(120)
              .attr('stroke-width', 2);
          })
            .on('mouseout', function () {
              d3.select(this as SVGGElement).select('.cluster-bg')
                .transition().duration(120)
                .attr('stroke-width', 1.5);
            });
        }
      });

      // 애니메이션 키는 한 번 사용 후 초기화 (줌/드래그에서 재애니메이션 방지)
      animateExpandKeyRef.current = null;
    };


    // Focus handling
    const rotateTo = (lng: number, lat: number) => {
      // Cancel any in-flight focus animation
      if (focusAnimRef.current) cancelAnimationFrame(focusAnimRef.current);
      // Pause autorotate during focus animation to avoid competing updates
      stopSpin();
      const startRot = projection.rotate() as [number, number, number]; // [lambda, phi, gamma]
      const endRot: [number, number, number] = [-lng, -lat, 0];
      // Compute shortest longitudinal delta to avoid wrap-around bounce
      const dLambda = ((endRot[0] - startRot[0] + 540) % 360) - 180; // in [-180,180]
      const dPhi = endRot[1] - startRot[1];
      const duration = 800; // ms
      const ease = d3.easeCubic;
      const t0 = performance.now();
      const animate = (ts: number) => {
        const t = Math.min(1, (ts - t0) / duration);
        const e = ease(t);
        const lambda = startRot[0] + dLambda * e;
        const phi = startRot[1] + dPhi * e;
        setRotationContinuous([lambda, phi, 0]);
        requestPathUpdate();
        requestPinUpdate();
        if (t < 1) {
          focusAnimRef.current = requestAnimationFrame(animate);
        } else {
          focusAnimRef.current = null;
          // Resume autorotate if enabled
          startSpin();
        }
      };
      focusAnimRef.current = requestAnimationFrame(animate);
    };

    // Autorotate loop
    function step(_ts: number) {
      if (!spinningRef.current) return;
      const cur = projection.rotate() as [number, number, number];
      const speedDegPerSec = 6; // gentle spin
      // Use ts to derive delta; requestAnimationFrame ~60fps -> ~16ms per frame
      // We can't get previous ts cleanly here without a ref; approximate fixed-step
      const lambda = cur[0] + (speedDegPerSec / 60);
      setRotationContinuous([lambda, cur[1], 0]);
      requestPathUpdate();
      requestPinUpdate();
      rafRef.current = requestAnimationFrame(step);
    }

    // Drag to rotate (pixel-delta with continuous angles)
    let dragPrevPos: [number, number] | null = null;
    let dragStartPos: [number, number] | null = null;
    let dragActive = false; // becomes true after threshold is exceeded
    const onDragStart = (event: any) => {
      dragPrevPos = [event.x, event.y];
      dragStartPos = [event.x, event.y];
      dragActive = false;
      // Do not stop spin yet; wait until user actually drags
    };
    const onDragged = (event: any) => {
      if (!dragPrevPos) return;
      // Activate drag only if movement exceeds a small threshold (avoid interfering with clicks)
      if (!dragActive && dragStartPos) {
        const dx0 = event.x - dragStartPos[0];
        const dy0 = event.y - dragStartPos[1];
        const THRESH = 4; // px
        if ((dx0 * dx0 + dy0 * dy0) < THRESH * THRESH) {
          // below threshold: don’t drag yet
          return;
        }
        dragActive = true;
        stopSpin();
        lightPathMode = true; // enable lightweight path updates while dragging
      }
      if (!dragActive) return;
      // Pixel delta rotation with per-step clamp and pole folding via setRotationContinuous
      const dx = (event.x - dragPrevPos[0]);
      const dy = (event.y - dragPrevPos[1]);
      const STEP_MAX_LON = 24; // deg per event
      const STEP_MAX_LAT = 16; // deg per event
      const dLon = Math.max(-STEP_MAX_LON, Math.min(STEP_MAX_LON, dx * DRAG_PX_SENS));
      const dLat = Math.max(-STEP_MAX_LAT, Math.min(STEP_MAX_LAT, -dy * DRAG_PX_SENS));
      const prev = lastRotateRef.current;
      const nextLambda = prev[0] + dLon;
      const nextPhi = prev[1] + dLat; // folding handled in setRotationContinuous
      setRotationContinuous([nextLambda, nextPhi, 0]);
      dragPrevPos = [event.x, event.y];
      requestPathUpdate();
      requestPinUpdate();
    };
    const onDragEnd = () => {
      const wasActive = dragActive;
      dragPrevPos = null;
      dragStartPos = null;
      dragActive = false;
      // restore full path updates and refresh once
      if (lightPathMode) {
        lightPathMode = false;
        requestPathUpdate();
      }
      if (wasActive) {
        // resume spin if enabled
        startSpin();
      }
      renderPins();
    };
    svg.call(d3.drag<SVGSVGElement, unknown>()
      // Disable drag when interacting with pins so clicks work at low zoom
      .filter((event: any) => {
        const raw = (event?.target as Element) || (event?.sourceEvent?.target as Element);
        let el: Element | null = raw;
        while (el) {
          if (
            el instanceof Element && (
              el.classList?.contains('pin') ||
              el.classList?.contains('hit') ||
              el.classList?.contains('country-hit')
            )
          ) return false;
          el = el.parentElement;
        }
        return true;
      })
      .on('start', onDragStart)
      .on('drag', onDragged)
      .on('end', onDragEnd) as any);

    // Zoom (wheel/pinch): scale the projection, keep center fixed (axis stable)
    // thresholds declared above near group creation
    // no additional zoom gesture state needed for center-anchored zoom

    // Track the geographic point under the cursor at the start of a zoom gesture
    let zoomAnchorLonLat: [number, number] | null = null;
    const getPointerXY = (sourceEvent: any): [number, number] => {
      if (sourceEvent?.touches && sourceEvent.touches.length >= 2) {
        const t0 = d3.pointer(sourceEvent.touches[0], svg.node() as any);
        const t1 = d3.pointer(sourceEvent.touches[1], svg.node() as any);
        return [(t0[0] + t1[0]) / 2, (t0[1] + t1[1]) / 2];
      }
      return d3.pointer(sourceEvent, svg.node() as any) as [number, number];
    };
    const onZoomStart = (event: any) => {
      try {
        const [mx, my] = getPointerXY(event?.sourceEvent);
        const inv = projection.invert!([mx, my]) as [number, number] | null;
        zoomAnchorLonLat = inv && !Number.isNaN(inv[0]) && !Number.isNaN(inv[1]) ? inv : null;
      } catch {
        zoomAnchorLonLat = null;
      }
      // pause autorotate during zoom
      stopSpin();
      lightPathMode = true; // lighten path updates during zoom
    };

    const onZoom = (event: any) => {
      const k = event.transform.k;
      // 확대 제스처 중에는 시작 시점 기준의 앵커 지점을 사용 (지나친 회전 방지)

      // 스케일 업데이트
      zoomK = k;
      projection
        .scale(baseRadius * zoomK)
        .translate([width / 2, height / 2]);

      // 앵커 지점이 유효하면, 그 지점을 천천히 중심으로 옮기도록 회전을 제한적으로 적용
      if (zoomAnchorLonLat) {
        const cur = projection.rotate() as [number, number, number];
        const target: [number, number, number] = [-zoomAnchorLonLat[0], -zoomAnchorLonLat[1], 0];
        let dLambda = ((target[0] - cur[0] + 540) % 360) - 180;
        let dPhi = target[1] - cur[1];
        // 부드러운 보간 + 이벤트별 최대 회전량 제한
        dLambda = Math.max(-ROTATE_MAX_STEP_LON, Math.min(ROTATE_MAX_STEP_LON, dLambda * ROTATE_TO_CURSOR_ALPHA));
        dPhi = Math.max(-ROTATE_MAX_STEP_LAT, Math.min(ROTATE_MAX_STEP_LAT, dPhi * ROTATE_TO_CURSOR_ALPHA));
        const newLambda = cur[0] + dLambda;
        const newPhi = Math.max(-80, Math.min(80, cur[1] + dPhi)); // 과도한 극 회전 방지
        setRotationContinuous([newLambda, newPhi, 0]);
      }

      // Viewport는 고정(중심 기준), 극한 성능 최적화된 렌더링
      gViewport.attr('transform', null);
      // 성능 최적화: requestAnimationFrame 기반 배치 렌더링
      requestPathUpdate();
      requestPinUpdate();
      // 줌 시마다 레이어 가시성 재계산 제거 (성능 향상)
    };

    const onZoomEnd = () => {
      // keep viewport centered
      gViewport.attr('transform', null);
      // zoom 제스처 종료 시 앵커 해제
      zoomAnchorLonLat = null;
      // restore full path updates and refresh once
      if (lightPathMode) {
        lightPathMode = false;
        requestPathUpdate();
      }
    };
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .filter((event) => event.type === 'wheel' || (event.type === 'touchstart' && (event.touches?.length || 0) === 2))
      // Increase wheel zoom sensitivity (faster zoom per wheel step)
      .wheelDelta((event: any) => {
        // Normalize delta across devices (pixels/lines/pages)
        const dy = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode ? event.deltaY * 120 : event.deltaY;
        return -WHEEL_ZOOM_SENSITIVITY * dy; // moderated zoom per wheel step
      })
      .on('start', onZoomStart)
      .on('zoom', onZoom)
      .on('end', onZoomEnd);

    // Compute dynamic min/max zoom and apply; min zoom fits the globe within the viewport
    const applyZoomExtents = () => {
      const fitRadius = Math.max(16, Math.min(width, height) / 2 - 12); // leave a small margin
      const minK = Math.max(0.1, fitRadius / baseRadius);
      const maxK = 120; // allow extreme zoom-in
      (zoom as any).scaleExtent([minK, maxK]);
      const clamped = Math.max(minK, Math.min(maxK, zoomK));
      if (clamped !== zoomK) {
        zoomK = clamped;
        projection.scale(baseRadius * zoomK);
        requestPathUpdate();
      }
      // Sync zoom's internal k without applying pan (identity translate)
      (svg as any).call((zoom as any).transform, d3.zoomIdentity.scale(zoomK));
      // Visibility doesn't depend on zoom anymore
      updateLayerVisibility();
    };

    svg.call(zoom as any);
    applyZoomExtents();

    // Eagerly load optional layers; update visibility as they arrive
    loadAtlasCountriesIfNeeded();
    loadAdmin1StatesIfNeeded();
    adoptUrbanAreasFromGlobal();
    const onUrbanLoaded = () => { adoptUrbanAreasFromGlobal(); };
    window.addEventListener('urban-areas:loaded', onUrbanLoaded as any);

    updateLayerVisibility();

    // Initial pin render and focus/autospin
    requestPinUpdate();
    if (focusLatLng) {
      rotateTo(focusLatLng.lng, focusLatLng.lat);
    }
    if (autorotate) {
      startSpin();
    }

    // Resize handler
    const onResize = () => {
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      baseRadius = Math.min(width, height) * 0.38;
      svg.attr('width', width).attr('height', height);
      // keep projection centered and scaled by zoomK
      projection.translate([width / 2, height / 2]).scale(baseRadius * zoomK);
      requestPathUpdate(); // 배치 업데이트
      requestPinUpdate();
      applyZoomExtents();
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('urban-areas:loaded', onUrbanLoaded as any);
      stopSpin();
      container.innerHTML = '';
    };
  }, [focusLatLng, autorotate, stroke, strokeWidth, exhibitions, onSelectExhibition]);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0, background: '#f7f7f7' }} />;
}
