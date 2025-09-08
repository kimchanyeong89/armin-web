import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { feature as topojsonFeature } from 'topojson-client';
import type { Exhibition } from '../types/Exhibition';

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
  console.log(`[GlobeD3] build tag: ${buildTag}`);
  try { (window as any).__GlobeD3BuildTag = buildTag; } catch {}
    console.log(`[GlobeD3] exhibitions prop received: ${exhibitions.length} exhibitions`);
    console.log('[GlobeD3] First few exhibitions:', exhibitions.slice(0, 3).map(ex => ({ name: ex.name, lat: ex.latitude, lng: ex.longitude })));
    
    const ukExhibitions = exhibitions.filter(ex => 
      ex.latitude > 50 && ex.latitude < 60 && 
      ex.longitude > -5 && ex.longitude < 2
    );
    console.log(`[GlobeD3] UK exhibitions in props: ${ukExhibitions.length}`);
    ukExhibitions.forEach(ex => {
      console.log(`  - ${ex.name}: lat=${ex.latitude}, lng=${ex.longitude}`);
    });
    
    // 영국 박물관들이 제대로 로드되었는지 확인
    ukExhibitions.forEach(ex => {
      console.log(`  - ${ex.name}: lat=${ex.latitude}, lng=${ex.longitude}`);
    });
    
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
      // larger precision value = fewer segments (faster)
      .precision(0.9);

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

    // Graticule for the outer circle (sphere outline)
    const sphere: d3.GeoSphere = { type: 'Sphere' } as any;

  const gSphere = gViewport.append('g');
  gSphere.append('path')
      .datum(sphere)
      .attr('d', path as any)
      .style('fill', 'none')
      .style('stroke', stroke)
      .style('stroke-width', String(strokeWidth))
  .style('vector-effect', 'non-scaling-stroke')
      .style('stroke-linejoin', 'round')
    .style('stroke-linecap', 'round')
    .style('pointer-events', 'none');
  const gCountries = gViewport.append('g').style('pointer-events', 'none');
  const gAdmin = gViewport.append('g').style('display', 'none'); // admin (states/provinces) boundaries
  const gCities = gViewport.append('g').style('display', 'none'); // city boundaries (from local geo if available)
  const gUrban = gViewport.append('g').style('display', 'none'); // urban fallback (rings), shown only at high zoom
  const gUrbanAreas = gViewport.append('g').style('display', 'none'); // global urban areas polygons (approx city boundaries)
  // Higher-detail atlas layers (TopoJSON)
  const gAtlasCountries = gViewport.append('g').style('display', 'none').style('pointer-events', 'none');
  const gAtlasStates = gViewport.append('g').style('display', 'none').style('pointer-events', 'none');
  let hasAdminGeo = false;
  let hasCityGeo = false;
  let adminLoadAttempted = false;
  let citiesLoadAttempted = false;
  let hasAtlasCountries = false;
  let hasAtlasStates = false;
  let atlasCountriesLoadAttempted = false;
  let atlasStatesLoadAttempted = false;
  let hasUrbanAreas = false;
  let urbanAreasLoadAttempted = false;
  
  // Below this zoom, city-level markers are shown; separate threshold not used anymore
  // 핀 그룹을 가장 먼저 생성하여 다른 요소들 위에 표시되도록 함
  const gPins = gViewport.append('g').style('pointer-events', 'all');

    // Centralized layer visibility (always prefer most detailed layers available, independent of zoom)
    const updateLayerVisibility = () => {
      if (hasAtlasCountries) {
        gAtlasCountries.style('display', 'block');
        gCountries.style('display', 'none');
      } else {
        gAtlasCountries.style('display', 'none');
        gCountries.style('display', 'block');
      }
  // Show US states overlay only if dataset is present
  gAtlasStates.style('display', hasAtlasStates ? 'block' : 'none');
      gAdmin.style('display', hasAdminGeo ? 'block' : 'none');
      if (hasCityGeo) {
        gCities.style('display', 'block');
        gUrbanAreas.style('display', 'none');
        gUrban.style('display', 'none');
      } else if (hasUrbanAreas) {
        gCities.style('display', 'none');
        gUrbanAreas.style('display', 'block');
        gUrban.style('display', 'none');
      } else {
        gCities.style('display', 'none');
        gUrbanAreas.style('display', 'none');
        gUrban.style('display', 'block');
      }
    };

    // Dev guard: detect unexpected external fetches from old bundles (debug only)
    try {
      const origFetch = window.fetch.bind(window);
      (window as any).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : (input as URL).toString();
        if (/world-atlas@|cdn\.jsdelivr\.net\/npm\/world-atlas@/i.test(url)) {
          console.warn('[GlobeD3] BLOCKED external fetch:', url);
          throw new Error('Blocked external fetch: ' + url);
        }
        return origFetch(input as any, init);
      };
    } catch {}


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

  (async () => {
      try {
        console.log('[GlobeD3] loading local /geo/countries.geo.json');
        const res = await fetch('/geo/countries.geo.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const geo = await res.json();
        // Draw borders
        gCountries
          .selectAll('path.country')
          .data(geo.features || [])
          .join('path')
          .attr('class', 'country')
          .attr('d', path as any)
          .style('fill', 'none')
          .style('stroke', stroke)
          .style('stroke-width', String(strokeWidth))
          .style('vector-effect', 'non-scaling-stroke')
          .style('stroke-linejoin', 'round')
          .style('stroke-linecap', 'round');
      } catch (e) {
        console.warn('[GlobeD3] Failed to load local countries geojson, drawing sphere only', e);
      }
    })();

  // Lazy loaders: only fetch when threshold is crossed
    const pickObject = (objects: any, regex: RegExp) => {
      const keys = Object.keys(objects || {});
      return keys.find(k => regex.test(k)) || keys[0];
    };

    const loadAtlasCountriesIfNeeded = async () => {
      if (atlasCountriesLoadAttempted || hasAtlasCountries) return;
      atlasCountriesLoadAttempted = true;
      try {
        const urls = ['/atlas/countries-110m.json', '/atlas/package/countries-110m.json'];
        let json: any | null = null;
        for (const url of urls) {
          try {
            console.log('[GlobeD3] loading atlas', url);
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) continue;
            json = await res.json();
            if (json) break;
          } catch {}
        }
        if (!json) return;
        const key = pickObject(json.objects, /countries|nation|land/i);
        const fc = topojsonFeature(json as any, json.objects[key]) as any;
        gAtlasCountries
          .selectAll('path.atlas-country')
          .data(fc.features || [])
          .join('path')
          .attr('class', 'atlas-country')
          .attr('d', path as any)
          .style('fill', 'none')
          .style('stroke', stroke)
          .style('stroke-width', String(strokeWidth * 0.9))
          .style('vector-effect', 'non-scaling-stroke')
          .style('stroke-linejoin', 'round')
          .style('stroke-linecap', 'round');
        hasAtlasCountries = true;
    // refresh visibility and paths
    updateLayerVisibility();
    svg.selectAll('path').attr('d', path as any);
      } catch {
        // ignore
      }
    };

    const loadAtlasStatesIfNeeded = async () => {
      if (atlasStatesLoadAttempted || hasAtlasStates) return;
      atlasStatesLoadAttempted = true;
      try {
        // Load US states only when a manifest exists under /us; avoids 404s in production
        const idx = await fetch('/us/states-index.json', { cache: 'no-store' });
        if (!idx.ok) return;
        const codes: string[] = await idx.json();
        const features: any[] = [];
        for (const code of codes) {
          try {
            const url = `/us/${code}.geo.json`;
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) continue;
            const geo = await res.json();
            if (geo?.type === 'FeatureCollection' && Array.isArray(geo.features)) {
              for (const f of geo.features) features.push(f);
            } else if (geo?.type === 'Feature') {
              features.push(geo);
            }
          } catch {}
        }
        if (!features.length) return;
        gAtlasStates
          .selectAll('path.atlas-state')
          .data(features)
          .join('path')
          .attr('class', 'atlas-state')
          .attr('d', path as any)
          .style('fill', 'none')
          .style('stroke', '#9CA3AF')
          .style('stroke-width', '0.7')
          .style('vector-effect', 'non-scaling-stroke')
          .style('stroke-linejoin', 'round')
          .style('stroke-linecap', 'round');
        hasAtlasStates = true;
        updateLayerVisibility();
        svg.selectAll('path').attr('d', path as any);
      } catch {
        // ignore
      }
    };
    const loadAdminIfNeeded = async () => {
      if (adminLoadAttempted || hasAdminGeo) return;
      adminLoadAttempted = true;
      try {
        console.log('[GlobeD3] trying admin boundaries');
        // Try local GeoJSON first
        const tryUrls = ['/geo/admin.geo.json', '/atlas/package/admin-1.json', '/atlas/admin-1.json'];
        let data: any | null = null;
        let isTopo = false;
        for (const url of tryUrls) {
          try {
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) continue;
            const ct = (res.headers.get('content-type') || '').toLowerCase();
            if (!/json/.test(ct)) continue;
            const j = await res.json();
            if (j && (j.type === 'FeatureCollection' || j.type === 'Topology')) {
              data = j; isTopo = j.type === 'Topology';
              console.log('[GlobeD3] admin loaded from', url);
              break;
            }
          } catch {}
        }
        if (!data) return;
        let features: any[] = [];
        if (isTopo) {
          const key = (Object.keys(data.objects).find((k) => /admin|states|provinces|subunit/i.test(k)) || Object.keys(data.objects)[0]);
          if (!key) return;
          const fc = topojsonFeature(data as any, data.objects[key]) as any;
          features = fc.features || [];
        } else {
          features = data.features || [];
        }
        if (!features.length) return;
        gAdmin
          .selectAll('path.admin')
          .data(features)
          .join('path')
          .attr('class', 'admin')
          .attr('d', path as any)
          .style('fill', 'none')
          .style('stroke', '#9CA3AF')
          .style('stroke-width', '0.8')
          .style('vector-effect', 'non-scaling-stroke')
          .style('stroke-linejoin', 'round')
          .style('stroke-linecap', 'round');
        hasAdminGeo = true;
    updateLayerVisibility();
    svg.selectAll('path').attr('d', path as any);
      } catch {
        // ignore
      }
    };

    const loadCitiesIfNeeded = async () => {
      if (citiesLoadAttempted || hasCityGeo) return;
      citiesLoadAttempted = true;
      try {
        console.log('[GlobeD3] trying local /geo/cities.geo.json');
        const res = await fetch('/geo/cities.geo.json', { cache: 'no-store' });
  if (!res.ok) return; // silent if missing
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (!/json/.test(ct)) return;
        const geo = await res.json();
        gCities
          .selectAll('path.city')
          .data(geo.features || [])
          .join('path')
          .attr('class', 'city')
          .attr('d', path as any)
          .style('fill', 'none')
          .style('stroke', '#4B5563')
          .style('stroke-width', '0.9')
          .style('vector-effect', 'non-scaling-stroke')
          .style('stroke-linejoin', 'round')
          .style('stroke-linecap', 'round');
        hasCityGeo = true;
    updateLayerVisibility();
    svg.selectAll('path').attr('d', path as any);
      } catch {
        // ignore
      }
    };

    // Optional: load global urban areas (approximate city boundary polygons) if present
    const loadUrbanAreasIfNeeded = async () => {
      if (urbanAreasLoadAttempted || hasUrbanAreas) return;
      urbanAreasLoadAttempted = true;
      try {
        // Try package location first, then top-level
        const urls = ['/atlas/package/urban-areas.json', '/atlas/urban-areas.json'];
        let json: any | null = null;
        for (const url of urls) {
          try {
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) continue;
            const ct = (res.headers.get('content-type') || '').toLowerCase();
            if (!/json/.test(ct)) continue;
            json = await res.json();
            if (json) break;
          } catch {
            // try next
          }
        }
        if (!json) return;
        let features: any[] = [];
        if (json.type === 'Topology' && json.objects) {
          const key = (Object.keys(json.objects).find(k => /urban|areas|city/i.test(k)) || Object.keys(json.objects)[0]);
          if (!key) return;
          const fc = topojsonFeature(json as any, json.objects[key]) as any;
          features = fc.features || [];
        } else if (json.type === 'FeatureCollection') {
          features = json.features || [];
        }
        if (!features.length) return;
        gUrbanAreas
          .selectAll('path.urban-area')
          .data(features)
          .join('path')
          .attr('class', 'urban-area')
          .attr('d', path as any)
          .style('fill', 'none')
          .style('stroke', '#4B5563')
          .style('stroke-width', '0.8')
          .style('vector-effect', 'non-scaling-stroke')
          .style('stroke-linejoin', 'round')
          .style('stroke-linecap', 'round')
          .style('opacity', 0.85);
        hasUrbanAreas = true;
        updateLayerVisibility();
        svg.selectAll('path').attr('d', path as any);
      } catch {
        // ignore
      }
    };

    // Helper: fallback urban visualization using circles around exhibition clusters
  const renderUrbanFallback = () => {
      try {
        const seen = new Set<string>();
        const clusters: { lon: number; lat: number }[] = [];
        const round = (v: number) => Math.round(v * 2) / 2; // 0.5° grid clustering
        for (const ex of exhibitions) {
          if (typeof ex.longitude !== 'number' || typeof ex.latitude !== 'number') continue;
          const key = `${round(ex.longitude)},${round(ex.latitude)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          clusters.push({ lon: ex.longitude, lat: ex.latitude });
        }
        // Outer visible ring ~0.5° (~55km) for stronger visibility
        const rings = clusters.map(({ lon, lat }) => d3.geoCircle().center([lon, lat]).radius(0.5)());
        gUrban
          .selectAll('path.urbanRing')
          .data(rings)
          .join('path')
          .attr('class', 'urban urbanRing')
          .attr('d', path as any)
          .style('fill', 'none')
          .style('stroke', '#111827')
          .style('stroke-width', '1.2')
          .style('vector-effect', 'non-scaling-stroke')
          .style('stroke-dasharray', 'none')
          .style('opacity', 0.9)
          .style('pointer-events', 'none');
        // Inner dot ~0.06° for anchor
        const dots = clusters.map(({ lon, lat }) => d3.geoCircle().center([lon, lat]).radius(0.06)());
        gUrban
          .selectAll('path.urbanDot')
          .data(dots)
          .join('path')
          .attr('class', 'urban urbanDot')
          .attr('d', path as any)
          .style('fill', '#111827')
          .style('stroke', 'none')
          .style('opacity', 0.75)
          .style('pointer-events', 'none');
  // Shown at high zoom only; visibility toggled in zoom handlers
  // gUrban.style('display', 'block');
        // eslint-disable-next-line no-console
  console.log(`Urban fallback rendered: ${rings.length} rings`);
      } catch (err) {
        console.warn('Failed to render urban fallback', err);
      }
    };

    // Load urban areas - use fallback rings instead of external data
    (async () => {
      try {
        console.log('Using urban fallback rings (no external dependencies)');
        renderUrbanFallback();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Urban areas fallback failed', e);
      }
    })();
    // Simple stable hash for deterministic angles per cluster key (kept for potential future use)
    // const hashKey = (s: string) => {
    //   let h = 2166136261 >>> 0;
    //   for (let i = 0; i < s.length; i++) {
    //     h ^= s.charCodeAt(i);
    //     h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    //   }
    //   return h >>> 0;
    // };

    // Pins: geographic-grid clustering with stable centroid spiderfy
    const renderPins = () => {
      const rotate = projection.rotate();
      // const centerLonLat: [number, number] = [-rotate[0], -rotate[1]];
      // Pre-project all pins (do not filter out when projection returns null; keep nodes and hide via visibility)
      const pinData = exhibitions.map((d) => {
        const p = projection([d.longitude, d.latitude]);
        return { ...d, p };
      });

      // 클러스터링: 도시 기준 우선 그룹화, 없으면 0.8° 그리드로 그룹화(더 넓게)
      const CLUSTER_GRID_SIZE = 0.8;
      const roundToGrid = (v: number) => Math.round(v / CLUSTER_GRID_SIZE) * CLUSTER_GRID_SIZE;
      const normalizeCity = (s: unknown) => {
        if (typeof s !== 'string') return '';
        // 쉼표 등으로 분리하고 소문자 정규화
        const raw = s
          .toLowerCase()
          .replace(/[()]/g, '')
          .split(/[,:]/)
          .map(t => t.trim())
          .filter(Boolean);

        if (!raw.length) return '';

        const removeTail = new Set([
          // 영국/국가/광역 단위들
          'uk', 'u.k.', 'united kingdom', 'great britain', 'gb', 'england', 'scotland', 'wales', 'northern ireland',
          // 대한민국/국가들 (최소한만)
          'south korea', 'korea', 'republic of korea', '대한민국',
          'united states', 'united states of america', 'usa', 'us', 'u.s.',
          'canada', 'japan', 'france', 'germany', 'italy', 'spain', 'china', 'australia', 'ireland'
        ]);

  // 뒤쪽에서부터 국가/지역 토큰 제거
  const tokens: string[] = [...raw];
        while (tokens.length && removeTail.has(tokens[tokens.length - 1])) {
          tokens.pop();
        }
        if (!tokens.length) return '';

  // 1) 런던 케이스: 토큰 중에 'london'이 있으면 'london'으로 강제
  const hasLondon = tokens.some(t => /\blondon\b/.test(t));
  if (hasLondon) return 'london';

  // 2) 서울/기타 몇몇 케이스 보정 (선택적; 이미 서울은 잘 동작하지만 안전망)
  const seoulIdx = tokens.findIndex(t => /\bseoul\b|서울|서울특별시/.test(t));
  if (seoulIdx >= 0) return 'seoul';

  // 3) 숫자(우편번호 등) 포함 토큰은 도시 후보에서 제외하고, 남은 것 중 마지막을 사용
  const noDigits = tokens.filter(t => !/[0-9]/.test(t));
  let candidate = (noDigits.length ? noDigits : tokens)[(noDigits.length ? noDigits : tokens).length - 1];

  // 4) 접두어 제거 및 우편번호/코드 꼬리 제거
  candidate = candidate.replace(/^(city of|greater|metropolitan|metropolitan city)\s+/, '');
  candidate = candidate.replace(/\s+\d.*$/, ''); // 뒤쪽 숫자 시작 부분 제거 (예: "london se1 9tg")
  candidate = candidate.replace(/\s+/g, ' ').trim();
  return candidate;
      };

      const clusters: { [key: string]: any[] } = {};
      for (const d of pinData) {
        const cityKey = normalizeCity((d as any).city || (d as any).location);
        let key: string;
        if (cityKey) {
          key = `city:${cityKey}`;
        } else {
          const gridLon = roundToGrid(d.longitude);
          const gridLat = roundToGrid(d.latitude);
          key = `grid:${gridLon},${gridLat}`;
        }
        if (!clusters[key]) clusters[key] = [];
        clusters[key].push(d);
      }

      // 노드 생성
  const nodes: any[] = [];

  for (const [key, items] of Object.entries(clusters)) {
        console.log(`클러스터 ${key}: ${items.length}개 아이템`);
        
    if (items.length === 1) {
          // 단일 아이템은 개별 핀으로
          const d = items[0];
          nodes.push({
            ...d,
      px: d.p ? d.p[0] : 0,
      py: d.p ? d.p[1] : 0,
      _projected: !!d.p,
            _labelVisible: true,
            _cluster: false
          });
          console.log(`  → 단일 핀: ${d.name}`);
  } else if (expandedClustersRef.current.has(key)) {
          // 펼쳐진 클러스터: 개별 핀들을 수직으로 정렬하여 표시
          console.log(`  → 펼쳐진 클러스터(수직 배치): ${items.length}개 핀으로 표시`);
          const centerLon = d3.mean(items, (d: any) => d.longitude) as number;
          const centerLat = d3.mean(items, (d: any) => d.latitude) as number;
          const center = projection([centerLon, centerLat]);

          if (center) {
            const V_SPACING = 28; // 핀 간 수직 간격 (px)
            const sorted = [...items].sort((a: any, b: any) => String(a.name || a.title).localeCompare(String(b.name || b.title)));
            const isExpanding = animateExpandKeyRef.current === key;
            const isCollapsing = collapseAnimKeyRef.current === key;
            if (isCollapsing) {
              collapsePendingRef.current = sorted.length;
            }
            sorted.forEach((d: any, i: number) => {
              // 아래(+1), 위(-1), 아래(+2), 위(-2), ... 순서로 배치 (중앙 0은 사용하지 않음)
              const rank = Math.floor(i / 2) + 1;
              const sign = (i % 2 === 0) ? +1 : -1; // 짝수: 아래, 홀수: 위
              const offsetIndex = sign * rank;
              const px = center[0];
              const py = center[1] + offsetIndex * V_SPACING;
              const shouldAnimate = isExpanding;
              const collapseOrder = (sorted.length - 1 - i); // 역순으로 사라지게
              nodes.push({
                ...d,
                px,
                py,
                ...(shouldAnimate ? { _originX: center[0], _originY: center[1], _delayLabelAfterMove: true } : {}),
                ...(isCollapsing ? { _collapsing: true, _collapseX: center[0], _collapseY: center[1], _collapseOrder: collapseOrder } : {}),
                _labelVisible: true,
                _cluster: false
              });
            });
          }
        } else {
          // 접힌 클러스터: 클러스터 버튼으로
          console.log(`  → 클러스터 버튼: ${items.length}개 아이템`);
          const centerLon = d3.mean(items, (d: any) => d.longitude) as number;
          const centerLat = d3.mean(items, (d: any) => d.latitude) as number;
          const center = projection([centerLon, centerLat]);
          nodes.push({
            _cluster: true,
            key: key,
            count: items.length,
            longitude: centerLon,
            latitude: centerLat,
            px: center ? center[0] : 0,
            py: center ? center[1] : 0,
            _projected: !!center,
            _labelVisible: true,
            _items: items
          });
        }
      }

      console.log(`렌더링할 핀 수: ${nodes.length}`);
      console.log('클러스터 정보:', nodes.filter(n => n._cluster).map(n => `${n.key}: ${n.count}개`));
      
      // 클러스터가 제대로 생성되었는지 확인
      const clusterNodes = nodes.filter(n => n._cluster);
      console.log(`총 클러스터 수: ${clusterNodes.length}`);
      if (clusterNodes.length === 0) {
        console.log('⚠️ 클러스터가 생성되지 않았습니다!');
        console.log('전체 노드:', nodes.map(n => ({ name: n.name, cluster: n._cluster, count: n.count })));
      }
      
      // 영국 박물관 클러스터 확인
      const ukClusters = nodes.filter(n => n._cluster && 
        n.latitude > 50 && n.latitude < 60 && 
        n.longitude > -5 && n.longitude < 2
      );
      console.log(`영국 클러스터 수: ${ukClusters.length}`);
      ukClusters.forEach(cluster => {
        console.log(`  영국 클러스터 ${cluster.key}: ${cluster.count}개 박물관`);
        console.log(`    위치: ${cluster.latitude.toFixed(3)}, ${cluster.longitude.toFixed(3)}`);
      });
      
      // Tate Modern 확인
      const tateModern = nodes.find(n => n.name === 'Tate Modern' || n.id === 'tate-modern');
      if (tateModern) {
        console.log(`Tate Modern 찾음: ${tateModern.name}, 클러스터: ${tateModern._cluster}`);
      } else {
        console.log('Tate Modern을 찾을 수 없음');
      }
      // 핀 렌더링
      console.log('=== 핀 렌더링 시작 ===');
      const sel = gPins.selectAll('g.pin').data(nodes, (d: any) => (d._cluster ? d.key : d.id));
      console.log(`선택된 요소 수: ${sel.size()}`);
      
      sel.exit().remove();
  const enter = sel.enter().append('g').attr('class', 'pin').style('cursor', 'pointer');
      console.log(`새로 생성된 요소 수: ${enter.size()}`);

      // 클러스터 버튼 렌더링 (검정 네모 + 흰색 숫자)
      const enterCluster = enter.filter((d: any) => d._cluster);
      console.log(`클러스터 버튼 생성 수: ${enterCluster.size()}`);

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
        .style('filter', 'drop-shadow(0 3px 6px rgba(0,0,0,0.45))')
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
        .attr('stroke-width', 1.5)
        .style('filter', 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))');

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
        .style('stroke-width', 3)
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
            console.log(`클러스터 ${k} 접기 - ${d.count}개 전시관`);
          } else {
            expandedClustersRef.current.clear();
            expandedClustersRef.current.add(k);
            animateExpandKeyRef.current = k;
            console.log(`클러스터 ${k} 펼치기 - ${d.count}개 전시관`);
            console.log('포함된 전시관들:', d._items.map((item: any) => item.name).join(', '));
          }
          renderPins();
        } else {
          // 개별 핀 클릭
          console.log('전시관 클릭됨:', d.name || d.title);
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
        // 엔터 애니메이션(펼침): 핀은 중앙에서 목표 위치로 이동
        if ((d as any)._originX != null && (d as any)._originY != null) {
          g.attr('transform', `translate(${(d as any)._originX},${(d as any)._originY})`);
          g.transition().duration(PIN_MOVE_DURATION).ease(ease)
            .attr('transform', `translate(${d.px},${d.py})`);
        } else if (isCollapsing) {
          // 닫힘 애니메이션: 라벨 먼저 숨김(아래 라벨 처리에서 딜레이), 그 다음 핀이 중앙으로 수렴
          // 역순으로 사라지도록 collapseOrder 기반 지연 적용
          const delayMs = Math.max(0, COLLAPSE_STAGGER * collapseOrder) + LABEL_SLIDE_DURATION + 10;
          g.attr('transform', `translate(${d.px},${d.py})`)
            .transition()
            .delay(delayMs as any)
            .duration(PIN_MOVE_DURATION)
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
            const delay = (d as any)._delayLabelAfterMove ? (PIN_MOVE_DURATION + 30) : 0;
            label
              .attr('x', 0)
              .style('opacity', 0)
              .transition().delay(delay).duration(LABEL_SLIDE_DURATION).ease(d3.easeCubicOut)
              .attr('x', 12)
              .style('opacity', 1);
          } else {
            label.interrupt().style('opacity', 0).attr('x', 0);
          }
        }

        // 클러스터 hover 효과 (클릭은 중앙 핸들러 사용)
        if (d._cluster) {
          console.log(`클러스터 ${d.key} 위치: (${d.px}, ${d.py}), 표시: ${Math.abs(((d.longitude + rotate[0] + 180) % 360) - 180) <= 90}`);
          g.on('mouseover', function () {
            d3.select(this as SVGGElement).select('.cluster-bg')
              .transition().duration(180)
              .style('filter', 'drop-shadow(0 5px 10px rgba(0,0,0,0.55))');
          })
            .on('mouseout', function () {
              d3.select(this as SVGGElement).select('.cluster-bg')
                .transition().duration(180)
                .style('filter', 'drop-shadow(0 3px 6px rgba(0,0,0,0.45))');
            });
        }
      });
      
  // 애니메이션 키는 한 번 사용 후 초기화 (줌/드래그에서 재애니메이션 방지)
  animateExpandKeyRef.current = null;
  console.log('=== 핀 렌더링 완료 ===');
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
        svg.selectAll('path').attr('d', path as any);
        renderPins();
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
      svg.selectAll('path').attr('d', path as any);
      renderPins();
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
      svg.selectAll('path').attr('d', path as any);
      // keep pins in sync while dragging
      renderPins();
    };
    const onDragEnd = () => {
  const wasActive = dragActive;
  dragPrevPos = null;
  dragStartPos = null;
  dragActive = false;
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
          if (el instanceof Element && (el.classList?.contains('pin') || el.classList?.contains('hit'))) return false;
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

      // Viewport는 고정(중심 기준), 경로/핀 재그리기
      gViewport.attr('transform', null);
      svg.selectAll('path').attr('d', path as any);
      renderPins();
  // Visibility independent of zoom; always prefer the most detailed available
  updateLayerVisibility();
    };

    const onZoomEnd = () => {
      // keep viewport centered
      gViewport.attr('transform', null);
      // zoom 제스처 종료 시 앵커 해제
      zoomAnchorLonLat = null;
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
        svg.selectAll('path').attr('d', path as any);
      }
    // Sync zoom's internal k without applying pan (identity translate)
  (svg as any).call((zoom as any).transform, d3.zoomIdentity.scale(zoomK));
  // Visibility doesn't depend on zoom anymore
  updateLayerVisibility();
    };

    svg.call(zoom as any);
    applyZoomExtents();

  // Eagerly load all optional layers (always-on detail); update visibility as they arrive
  loadAtlasCountriesIfNeeded();
  loadAtlasStatesIfNeeded();
  loadAdminIfNeeded();
  loadCitiesIfNeeded();
  loadUrbanAreasIfNeeded();
  updateLayerVisibility();

    // Initial pin render and focus/autospin
    renderPins();
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
      svg.selectAll('path').attr('d', path as any);
      renderPins();
      applyZoomExtents();
    };
  window.addEventListener('resize', onResize);

    return () => {
  window.removeEventListener('resize', onResize);
  stopSpin();
      container.innerHTML = '';
    };
  }, [focusLatLng, autorotate, stroke, strokeWidth, exhibitions, onSelectExhibition]);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0, background: '#f7f7f7' }} />;
}
