import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { Exhibition } from '../types/Exhibition';
import { exhibitions as exhibitionsData } from '../data/exhibitions';
import * as topojson from 'topojson-client';

type D3GeoGlobeSimplifiedProps = {
  exhibitions?: Exhibition[];
  onSelectExhibition?: (ex: Exhibition) => void;
};

const D3GeoGlobeSimplified: React.FC<D3GeoGlobeSimplifiedProps> = ({ exhibitions, onSelectExhibition }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  // Removed UI status panel
  // Legacy holder removed; we render directly from datasets
  const MIN_ZOOM = 0.9; // 가장 줌아웃
  const MAX_ZOOM = 10.0; // 최대 확대를 살짝 제한
  const [scale, setScale] = useState<number>(MIN_ZOOM); // 첫 로드 시 최저 배율로 시작

  // Always-available datasets for interactions
  const [countries, setCountries] = useState<any[]>([]);
  const [admin1Topo, setAdmin1Topo] = useState<any | null>(null);
  // Removed selectedCountry panel state
  const admin1OverlayCacheRef = useRef<Map<string, any>>(new Map());
  const admin1SubsetCacheRef = useRef<Map<string, any[]>>(new Map());
  const admin1SubsetFeaturesRef = useRef<any[] | null>(null);
  const [admin1OverlayMesh, setAdmin1OverlayMesh] = useState<any | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{x:number;y:number;text:string}|null>(null);
  const [hoverCountry, setHoverCountry] = useState<any | null>(null);
  const [flagCache] = useState<Map<string, {url:string}>>(new Map());
  const [hoverFlagUrl, setHoverFlagUrl] = useState<string | null>(null);
  const animatingRef = useRef(false);
  const hoverFetchTimeoutRef = useRef<number | null>(null);
  const hoverAbortRef = useRef<AbortController | null>(null);
  const [projTranslate, setProjTranslate] = useState<[number, number] | null>(null);
  const pinsSvgRef = useRef<SVGSVGElement | null>(null);
  const gPinsRef = useRef<SVGGElement | null>(null);
  const expandedClustersRef = useRef<Set<string>>(new Set());
  const animateExpandKeyRef = useRef<string | null>(null);
  const collapseAnimKeyRef = useRef<string | null>(null);
  const collapsePendingRef = useRef<number>(0);
  const collapseFinalizedRef = useRef<boolean>(false);
  const lastPinsKeyRef = useRef<string>('');
  const onSelectExhibitionRef = useRef<typeof onSelectExhibition | undefined>(onSelectExhibition);
  useEffect(() => { onSelectExhibitionRef.current = onSelectExhibition; }, [onSelectExhibition]);

  // Refs to keep latest values inside event handlers without reattaching listeners
  const rotationRef = useRef(rotation);
  const scaleRef = useRef(scale);
  const countriesRef = useRef(countries);
  const admin1TopoRef = useRef(admin1Topo);
  const translateRef = useRef<[number, number] | null>(null);

  useEffect(() => { rotationRef.current = rotation; }, [rotation]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { countriesRef.current = countries; }, [countries]);
  useEffect(() => { admin1TopoRef.current = admin1Topo; }, [admin1Topo]);
  useEffect(() => { translateRef.current = projTranslate; }, [projTranslate]);

  // 자동 LOD 전환은 사용하지 않습니다. (클릭 시 디테일 표시)

  // Dedicated loaders to keep base datasets available
  const loadCountries = async () => {
    try {
  // status: loading countries
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
      // Precompute lon/lat bounding boxes for quick reject on hit-tests
      feats.forEach((f: any) => {
        try { (f as any)._bbox = d3.geoBounds(f); } catch { /* ignore */ }
      });
  setCountries(feats);
    } catch (e:any) {
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
    } catch (e:any) {
  console.error('Failed to load admin-1', e);
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
    const tx = (projTranslate?.[0] ?? (width / 2));
    const ty = (projTranslate?.[1] ?? (height / 2));
    const projection = d3.geoOrthographic()
      .scale(scale * 0.5 * Math.min(width, height))
      .translate([tx, ty])
      .rotate([rotation.x, -rotation.y]);

    const path = d3.geoPath().projection(projection).context(ctx);

  // Draw white sphere background
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
  ctx.lineWidth = 0.8; // 글로브 테두리 더 얇게
    ctx.beginPath();
    path({ type: 'Sphere' });
    ctx.fill();
    ctx.stroke();

  // Graticule removed per request

    // Base: draw country boundaries
    if (countries.length > 0) {
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 1;
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
        ctx.strokeStyle = isHover ? '#ffffff' : '#111111';
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
      ctx.globalAlpha = 0.8; // 80% 불투명도
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
    renderGlobe();
    const handleResize = () => renderGlobe();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [rotation, scale, countries, admin1OverlayMesh, hoverCountry, projTranslate]);

  // Build projection for external uses (pins)
  const getProjection = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const tx = (translateRef.current?.[0] ?? width / 2);
    const ty = (translateRef.current?.[1] ?? height / 2);
    return d3.geoOrthographic()
      .scale(scaleRef.current * 0.5 * Math.min(width, height))
      .translate([tx, ty])
      .rotate([rotationRef.current.x, -rotationRef.current.y])
      .precision(2.0);
  };

  // Cluster preparation (borrowed from GlobeD3)
  const CLUSTER_GRID_SIZE = 0.8;
  const roundToGrid = (v: number) => Math.round(v / CLUSTER_GRID_SIZE) * CLUSTER_GRID_SIZE;
  const normalizeCity = (s: unknown) => {
    if (typeof s !== 'string') return '';
    const raw = s.toLowerCase().replace(/[()]/g, '').split(/[,:]/).map(t => t.trim()).filter(Boolean);
    if (!raw.length) return '';
    const removeTail = new Set(['uk','u.k.','united kingdom','great britain','gb','england','scotland','wales','northern ireland','south korea','korea','republic of korea','대한민국','united states','united states of america','usa','us','u.s.','canada','japan','france','germany','italy','spain','china','australia','ireland']);
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
  type ClusterInfo = { key: string; items: Exhibition[]; centerLon: number; centerLat: number; sortedByName: Exhibition[] };
  const clustersListRef = useRef<ClusterInfo[] | null>(null);
  if (!clustersListRef.current) {
    const list = (exhibitions && exhibitions.length ? exhibitions : (exhibitionsData as Exhibition[]));
    const map: Record<string, Exhibition[]> = {};
    for (const d of list) {
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
    clustersListRef.current = Object.entries(map).map(([key, items]) => ({
      key,
      items,
      centerLon: d3.mean(items as any, (d: any) => d.longitude) as number,
      centerLat: d3.mean(items as any, (d: any) => d.latitude) as number,
      sortedByName: [...items].sort((a: any, b: any) => String(a.name || a.title).localeCompare(String(b.name || b.title)))
    }));
  }

  // Initialize pins SVG once
  useEffect(() => {
    if (pinsSvgRef.current) return;
    const svg = d3.select(document.createElementNS('http://www.w3.org/2000/svg','svg'))
      .attr('class', 'pins-overlay')
      .attr('width', window.innerWidth)
      .attr('height', window.innerHeight)
      .style('position', 'fixed')
      .style('inset', '0')
      .style('pointer-events', 'none')
      .style('z-index', '2');
    const g = svg.append('g').attr('class', 'pins-root').style('pointer-events', 'all');
    gPinsRef.current = g.node() as SVGGElement;
    document.body.appendChild(svg.node() as any);
    pinsSvgRef.current = svg.node() as SVGSVGElement;
    const onResize = () => {
      if (!pinsSvgRef.current) return;
      d3.select(pinsSvgRef.current).attr('width', window.innerWidth).attr('height', window.innerHeight);
      renderPins();
    };
    const onDocClick = (e: MouseEvent) => {
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
      try { svg.remove(); } catch {}
      pinsSvgRef.current = null;
      gPinsRef.current = null;
    };
  }, []);
  // Render pins on view changes
  const renderPins = () => {
    if (!pinsSvgRef.current || !gPinsRef.current || !clustersListRef.current) return;
    const proj = getProjection();
    const rot = proj.rotate() as [number, number, number];
    const key = `${rot[0].toFixed(1)},${rot[1].toFixed(1)},${scaleRef.current.toFixed(2)},${(translateRef.current||[]).join(',')}`;
    if (lastPinsKeyRef.current === key) return;
    lastPinsKeyRef.current = key;
    const g = d3.select(gPinsRef.current);
    // Build nodes
    const nodes: any[] = [];
    const MAX_EXPANDED_ITEMS = 40;
    for (const c of clustersListRef.current) {
      const key = c.key;
      const items = c.items as any[];
      if (items.length === 1) {
        const d0 = items[0];
        const p = proj([d0.longitude, d0.latitude]) as [number, number] | null;
        if (!p) continue;
        nodes.push({ ...d0, _cluster: false, px: p[0], py: p[1] });
      } else if (expandedClustersRef.current.has(key)) {
        const center = proj([c.centerLon, c.centerLat]) as [number, number] | null;
        if (!center) continue;
        const sorted = c.sortedByName as any[];
  const count = Math.min(sorted.length, MAX_EXPANDED_ITEMS);
  // Normalize spacing independent of zoom using viewport height and count
  const vh = Math.max(400, Math.min(window.innerHeight || 800, 1200));
  const perItem = Math.floor((vh * 0.5) / Math.max(6, count));
  const V_SPACING = Math.max(12, Math.min(20, perItem));
        const isExpanding = animateExpandKeyRef.current === key;
        const isCollapsing = collapseAnimKeyRef.current === key;
        if (isCollapsing) collapsePendingRef.current = count;
        for (let i = 0; i < count; i++) {
          const d0 = sorted[i];
          const rank = Math.floor(i / 2) + 1;
          const sign = (i % 2 === 0) ? +1 : -1;
          const offsetIndex = sign * rank;
          const py = center[1] + offsetIndex * V_SPACING;
          const px = center[0];
          nodes.push({
            ...d0,
            _cluster: false,
            px,
            py,
            ...(isExpanding ? { _originX: center[0], _originY: center[1], _delayLabelAfterMove: true } : {}),
            ...(isCollapsing ? { _collapsing: true, _collapseX: center[0], _collapseY: center[1], _collapseOrder: (count - 1 - i) } : {}),
          });
        }
      } else {
        const center = proj([c.centerLon, c.centerLat]) as [number, number] | null;
        if (!center) continue;
        nodes.push({ _cluster: true, key, count: items.length, longitude: c.centerLon, latitude: c.centerLat, px: center[0], py: center[1] });
      }
    }
    const sel = g.selectAll<SVGGElement, any>('g.pin').data(nodes, (d: any) => (d._cluster ? d.key : d.id));
    sel.exit().remove();
    const enter = sel.enter().append('g').attr('class', 'pin').style('cursor', 'pointer').style('pointer-events','auto');
    const enterCluster = enter.filter((d: any) => d._cluster);
    enterCluster.append('rect')
      .attr('class', 'cluster-bg')
      .attr('rx', 8).attr('ry', 8)
      .attr('fill', '#111827').attr('stroke', '#E5E7EB').attr('stroke-width', 1.2)
      .attr('x', (d: any) => -Math.max(22, 14 + Math.log2(d.count) * 4) / 2)
      .attr('y', (d: any) => -Math.max(22, 14 + Math.log2(d.count) * 4) / 2)
      .attr('width', (d: any) => Math.max(22, 14 + Math.log2(d.count) * 4))
      .attr('height', (d: any) => Math.max(22, 14 + Math.log2(d.count) * 4));
    enterCluster.append('text')
      .attr('class', 'cluster-count')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', (d: any) => Math.max(10, 9 + Math.log2(d.count) * 1.1))
      .attr('font-weight', 'bold')
      .attr('fill', '#ffffff')
      .text((d: any) => d.count);
    enterCluster.append('title').text((d: any) => `${d.count}개의 전시관`);

    const enterPin = enter.filter((d: any) => !d._cluster);
    // Single black rounded square marker (smaller)
    enterPin.append('rect')
      .attr('class', 'pin-bg')
      .attr('x', -4).attr('y', -4)
      .attr('width', 8).attr('height', 8)
      .attr('rx', 2).attr('ry', 2)
      .attr('fill', '#111827')
      .attr('stroke', '#111827')
      .attr('stroke-width', 1);
    enterPin.append('text')
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

    const merged = enter.merge(sel as any);
    merged
      .each(function(d: any){
        const gEl = d3.select(this as SVGGElement);
        const isCollapsing = !!(d as any)._collapsing;
        const collapseOrder = (d as any)._collapseOrder ?? 0;
        const easeOut = d3.easeCubicOut;
        const easeIn = d3.easeCubicIn;
        // Determine durations based on node count to reduce jank
        const visiblePins = nodes.length;
        const PIN_DUR = visiblePins > 200 ? 120 : visiblePins > 100 ? 180 : 260;
        const LABEL_DUR = visiblePins > 200 ? 100 : visiblePins > 100 ? 160 : 220;
        // Enter/expand animation
        if ((d as any)._originX != null && (d as any)._originY != null) {
          gEl.attr('transform', `translate(${(d as any)._originX},${(d as any)._originY})`)
             .transition().duration(PIN_DUR).ease(easeOut)
             .attr('transform', `translate(${d.px},${d.py})`);
        } else if (isCollapsing) {
          const delayMs = Math.max(0, 40 * collapseOrder) + LABEL_DUR + 10;
          gEl.attr('transform', `translate(${d.px},${d.py})`)
             .transition().delay(delayMs as any).duration(PIN_DUR).ease(easeOut)
             .attr('transform', `translate(${(d as any)._collapseX},${(d as any)._collapseY})`)
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
          gEl.attr('transform', `translate(${d.px},${d.py})`);
        }
        // Label slide/fade for pins
        const label = gEl.select<SVGTextElement>('.pin-label');
        if (!label.empty()) {
          if (isCollapsing) {
            const delayMs = Math.max(0, 40 * collapseOrder);
            label.interrupt().attr('x', 8).style('opacity', 1)
                 .transition().delay(delayMs).duration(LABEL_DUR).ease(easeIn)
                 .attr('x', 0).style('opacity', 0);
          } else if ((d as any)._delayLabelAfterMove) {
            label.interrupt().attr('x', 0).style('opacity', 0)
                 .transition().delay(260 + 30).duration(LABEL_DUR).ease(easeOut)
                 .attr('x', 8).style('opacity', 1);
          } else {
            label.interrupt().attr('x', 8).style('opacity', 1);
          }
        }
      })
      .on('click', (evt: any, d: any) => {
        evt?.stopPropagation?.();
        if (d._cluster) {
          const k = d.key as string;
          if (expandedClustersRef.current.has(k)) {
            // collapse with animation
            collapseAnimKeyRef.current = k;
            collapseFinalizedRef.current = false;
          } else {
            expandedClustersRef.current.clear();
            expandedClustersRef.current.add(k);
            animateExpandKeyRef.current = k;
          }
          lastPinsKeyRef.current = '';
          renderPins();
        } else {
          // Open side detail panel
          try { onSelectExhibitionRef.current && onSelectExhibitionRef.current(d as Exhibition); } catch {}
        }
      })
      .style('display', 'block');
    // Cluster hover stroke weight
    merged.filter((d: any) => d._cluster)
      .on('mouseover', function(){ d3.select(this as any).select('.cluster-bg').transition().duration(120).attr('stroke-width', 2); })
      .on('mouseout', function(){ d3.select(this as any).select('.cluster-bg').transition().duration(120).attr('stroke-width', 1.5); });

    // Reset animation key after use to avoid re-animating on simple redraws
    animateExpandKeyRef.current = null;
  };
  useEffect(() => { renderPins(); }, [rotation, scale, projTranslate]);

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
	setScale(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, startScale + ds * e)));
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
  const exp = 0.85; // stronger damping at high zoom (e.g., 12x → ~8.3x slower)
        const k = Math.max(1e-3, Math.pow(scaleRef.current, exp));
        const sensitivity = base / k;
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
                const bb = f._bbox as [[number,number],[number,number]] | undefined;
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
              const bb = f._bbox as [[number,number],[number,number]] | undefined;
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
                    .then((j:any) => {
                      if (!j) return;
                      const entry = Array.isArray(j) ? j[0] : j;
                      const a2 = (entry?.cca2 && typeof entry.cca2 === 'string') ? String(entry.cca2).toLowerCase() : undefined;
                      const url = a2 ? `https://flagcdn.com/w40/${a2}.png` : (entry?.flags?.png as string | undefined);
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
                      const url = a2 ? `https://flagcdn.com/w40/${a2}.png` : (j[0]?.flags?.png as string | undefined);
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
        const bb = f._bbox as [[number,number],[number,number]] | undefined;
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

      const cachedMesh = admin1OverlayCacheRef.current.get(countryName);
      const cachedFeats = admin1SubsetCacheRef.current.get(countryName);
      if (cachedMesh) {
        setAdmin1OverlayMesh(cachedMesh);
        if (cachedFeats) admin1SubsetFeaturesRef.current = cachedFeats;
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
  // Build features for hover
  const fc = topojson.feature(topology, subsetObj) as any;
  const feats: any[] = fc && fc.type === 'FeatureCollection' ? (fc.features || []) : [];
  feats.forEach((f: any) => { try { (f as any)._bbox = d3.geoBounds(f); } catch {} });
  admin1SubsetFeaturesRef.current = feats;
  admin1SubsetCacheRef.current.set(countryName, feats);
  admin1OverlayCacheRef.current.set(countryName, mesh as any);
  setAdmin1OverlayMesh(mesh as any);
      } catch (e) {
        console.error('Overlay mesh error', e);
      }

      // Recenter translate to canvas center before animating to country
      setProjTranslate([width / 2, height / 2]);
      // Animate center/zoom to the clicked country (next frame to avoid initial jump)
      requestAnimationFrame(() => {
        try {
          const centroid = d3.geoCentroid(countryFeature as any) as [number, number];
          const targetRot = { x: -centroid[0], y: centroid[1] };
          const fitScale = computeFitScale(countryFeature, targetRot, width, height);
          const targetScale = Math.max(scaleRef.current, fitScale);
          animateTo(targetRot, targetScale, 900);
        } catch {}
      });
    };

    const handleWheel = (event: WheelEvent) => {
      // Only zoom if mouse is over canvas
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      if (mouseX >= 0 && mouseX <= rect.width && mouseY >= 0 && mouseY <= rect.height) {
        event.preventDefault();
        // Exponential/multiplicative zoom for consistent sensitivity at high levels
        // Similar to d3-zoom: k *= 2^(−0.002 * deltaY)
        const k = Math.pow(2, -0.0025 * event.deltaY);
        // Compute geographic point under cursor with current projection
        const width = rect.width;
        const height = rect.height;
        const projectionCurrent = d3.geoOrthographic()
          .scale(scaleRef.current * 0.5 * Math.min(width, height))
          .translate([(translateRef.current?.[0] ?? width / 2), (translateRef.current?.[1] ?? height / 2)])
          .rotate([rotationRef.current.x, -rotationRef.current.y]);
        const inv = (projectionCurrent as any).invert?.bind(projectionCurrent);
        const p = inv ? inv([mouseX, mouseY]) : null;
        setScale(prevScale => {
          const targetScale = prevScale * k;
          const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetScale));
          if (p) {
            // Project geographic point with zero-translate under new scale to compute required translate
            const projectionZero = d3.geoOrthographic()
              .scale(newScale * 0.5 * Math.min(width, height))
              .translate([0, 0])
              .rotate([rotationRef.current.x, -rotationRef.current.y]);
            const uv = (projectionZero as any)(p) as [number, number] | null;
            if (uv) {
              setProjTranslate([mouseX - uv[0], mouseY - uv[1]]);
            }
          }
          // If at min zoom, recenter translate to keep globe centered
          if (newScale === MIN_ZOOM) {
            setProjTranslate([width / 2, height / 2]);
          }
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
      {/* Info panel removed */}
      
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
