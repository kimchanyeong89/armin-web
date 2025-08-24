import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { feature, mesh } from 'topojson-client';
import type { Exhibition } from '../types/Exhibition';

// Minimal D3 orthographic globe with stroke-only borders on white background
// Props allow focusing a lat/lng and optional auto-rotation
export type GlobeD3Props = {
  focusLatLng?: { lat: number; lng: number } | null;
  autorotate?: boolean;
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Setup
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

    const projection = d3.geoOrthographic()
      .translate([width / 2, height / 2])
      .scale(baseRadius)
      // larger precision value = fewer segments (faster)
      .precision(0.9);

  const path = d3.geoPath(projection);

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
      .style('stroke-linecap', 'round');
  const gCountries = gViewport.append('g');
  const gAdmin = gViewport.append('g').style('display', 'none'); // admin (states/provinces) boundaries
  const gUrban = gViewport.append('g').style('display', 'none'); // urban (city) boundaries
  const gPins = gViewport.append('g');


    // Load TopoJSON world (Natural Earth 110m)
    let stop = false;
  (async () => {
      try {
  const url = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
        const topo = await fetch(url).then(r => r.json());
        if (stop) return;
        const countries = feature(topo, topo.objects.countries) as any;
        // Country outlines (stroke only)
        gCountries
          .selectAll('path.country')
          .data(countries.features)
          .join('path')
          .attr('class', 'country')
          .attr('d', path as any)
          .style('fill', 'none')
          .style('stroke', stroke)
          .style('stroke-width', String(strokeWidth))
          .style('vector-effect', 'non-scaling-stroke')
          .style('stroke-linejoin', 'round')
          .style('stroke-linecap', 'round');
          // keep stroke width constant in screen space while zooming
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Failed to load TopoJSON countries', e);
      }
    })();

  // Load admin-level (states/provinces) boundaries globally from world-atlas 50m if available; fallback to US states-10m
    (async () => {
      try {
        let borders: any | null = null;
        try {
          const topo50 = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/50m.json').then(r => r.json());
          if (!stop && topo50 && topo50.objects) {
            // Try to find an object key that likely contains admin-1 boundaries
            const key = Object.keys(topo50.objects).find(k => /state|province|admin/i.test(k));
            if (key) {
              borders = mesh(topo50, (topo50.objects as any)[key], (a: any, b: any) => a !== b);
            }
          }
        } catch {}
        if (!borders) {
          const topo10 = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/states-10m.json').then(r => r.json());
          if (!stop) {
            borders = mesh(topo10, topo10.objects.states, (a: any, b: any) => a !== b);
          }
        }
        if (!stop && borders) {
          gAdmin
            .selectAll('path.admin')
            .data([borders])
            .join('path')
            .attr('class', 'admin')
            .attr('d', path as any)
            .style('fill', 'none')
            .style('stroke', '#cbd5e1')
            .style('stroke-width', '0.5')
            .style('vector-effect', 'non-scaling-stroke')
            .style('stroke-dasharray', '2,3')
            .style('opacity', 0.7)
            .style('pointer-events', 'none');
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Failed to load admin (states/provinces) boundaries', e);
      }
    })();

    // Load urban areas (city extents) at 50m scale and render as faint dotted outlines when zoomed in
    (async () => {
      try {
        const topo = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/urban-areas-50m.json').then(r => r.json());
        if (stop) return;
        const key = topo?.objects ? Object.keys(topo.objects).find(k => /urban/i.test(k)) : null;
        if (!key) return;
        const urban = feature(topo, (topo.objects as any)[key]) as any;
        gUrban
          .selectAll('path.urban')
          .data(urban.features)
          .join('path')
          .attr('class', 'urban')
          .attr('d', path as any)
          .style('fill', 'none')
          .style('stroke', '#d1d5db')
          .style('stroke-width', '0.5')
          .style('vector-effect', 'non-scaling-stroke')
          .style('stroke-dasharray', '1.5,2.5')
          .style('opacity', 0.7)
          .style('pointer-events', 'none');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Failed to load urban areas', e);
      }
    })();
    // Pins
    const renderPins = () => {
      const rotate = projection.rotate();
      const centerLonLat: [number, number] = [-rotate[0], -rotate[1]];
      // Project all pins and group by screen position (rounded to 1px)
      const pinData = exhibitions.map((d) => {
        const p = projection([d.longitude, d.latitude]);
        return { ...d, p };
      });
      // Group by pixel position
      const posMap = new Map();
      for (const d of pinData) {
        if (!d.p) continue;
        const key = `${Math.round(d.p[0])},${Math.round(d.p[1])}`;
        if (!posMap.has(key)) posMap.set(key, []);
        posMap.get(key).push(d);
      }
      // Spiderfy: for each group of overlapping pins, fan out in a circle if more than 1
      const spiderfied = [];
      const fanRadius = 18; // px
      for (const group of posMap.values()) {
        if (group.length === 1) {
          spiderfied.push({ ...group[0], px: group[0].p[0], py: group[0].p[1] });
        } else {
          const angleStep = (2 * Math.PI) / group.length;
          group.forEach((d: any, i: number) => {
            const angle = i * angleStep;
            spiderfied.push({
              ...d,
              px: d.p[0] + Math.cos(angle) * fanRadius,
              py: d.p[1] + Math.sin(angle) * fanRadius,
            });
          });
        }
      }
      // Render
      const sel = gPins.selectAll('g.pin').data(spiderfied, (d: any) => d.id);
      sel.exit().remove();
      const enter = sel.enter().append('g').attr('class', 'pin').style('cursor', 'pointer');
      enter.append('rect')
        .attr('width', 10).attr('height', 10)
        .attr('x', -5).attr('y', -5)
        .attr('rx', 1.5)
        .attr('fill', '#111827');
      // Visible label text to the right of the pin, black fill
      enter.append('text')
        .attr('x', 12)
        .attr('y', 4)
        .attr('font-size', 11)
        .attr('fill', '#111827')
        .attr('pointer-events', 'none')
        .text((d: any) => d.name);
      const merged = enter.merge(sel as any);
      merged.on('click', (_event: any, d: any) => {
        const { longitude: lng, latitude: lat } = d;
        // recentre and notify
        const prev = spinningRef.current;
        spinningRef.current = false;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rotateTo(lng, lat);
        if (onSelectExhibition) onSelectExhibition(d);
        if (prev && autorotate) rafRef.current = requestAnimationFrame(step);
      });
    merged.each(function (d: any) {
        if (!d.p) { d3.select(this as SVGGElement).attr('display', 'none'); return; }
        const visible = d3.geoDistance([d.longitude, d.latitude], centerLonLat) <= Math.PI / 2 + 1e-6;
        d3.select(this as SVGGElement)
          .attr('transform', `translate(${d.px},${d.py})`)
          .attr('display', visible ? null : 'none')
      .select('text').text(d.name);
      });
    };


    // Focus handling
    const rotateTo = (lng: number, lat: number) => {
      // Cancel any in-flight focus animation
      if (focusAnimRef.current) cancelAnimationFrame(focusAnimRef.current);
      const startRot = projection.rotate() as [number, number, number]; // [lambda, phi, gamma]
      const endRot: [number, number, number] = [-lng, -lat, 0];
      // Compute shortest longitudinal delta to avoid wrap-around bounce
      const dLambda = ((endRot[0] - startRot[0] + 540) % 360) - 180; // in [-180,180]
      const dPhi = endRot[1] - startRot[1];
      const dGamma = endRot[2] - startRot[2];
      const duration = 900;
      const t0 = performance.now();
      const stepFocus = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        const e = d3.easeCubicInOut(t);
        projection.rotate([
          startRot[0] + dLambda * e,
          Math.max(-90, Math.min(90, startRot[1] + dPhi * e)),
          startRot[2] + dGamma * e,
        ]);
        svg.selectAll('path').attr('d', path as any);
        renderPins();
        if (t < 1) {
          focusAnimRef.current = requestAnimationFrame(stepFocus);
        } else {
          focusAnimRef.current = null;
        }
      };
      focusAnimRef.current = requestAnimationFrame(stepFocus);
    };

    if (focusLatLng) {
      // briefly pause spin while focusing
      const prev = spinningRef.current;
      spinningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rotateTo(focusLatLng.lng, focusLatLng.lat);
      if (prev) {
        // resume shortly after focus animation
        setTimeout(() => { spinningRef.current = true; rafRef.current = requestAnimationFrame(step); }, 1300);
      }
    }

    // Optional autorotate
    let angle = 0;
  const step = () => {
      if (spinningRef.current) {
        angle = (angle + 0.02) % 360; // ~ slow spin
        const [, phi] = projection.rotate();
        projection.rotate([angle, phi, 0]);
    svg.selectAll('path').attr('d', path as any);
    renderPins();
      }
      rafRef.current = requestAnimationFrame(step);
    };
    if (autorotate) {
      spinningRef.current = true;
      rafRef.current = requestAnimationFrame(step);
    }

    // Drag to rotate (center-anchored; no viewport transform applied)
  let dragStartRotate: [number, number, number] | null = null;
  let dragStartPos: [number, number] | null = null;
  let dragBaseProjection: d3.GeoProjection | null = null; // fixed during drag for stable invert
  let dragStartLonLat: [number, number] | null = null; // geographic position under cursor at drag start
    const onDragStart = (event: any) => {
      dragStartRotate = projection.rotate() as [number, number, number];
      dragStartPos = [event.x, event.y];
      // create a fixed baseline projection to compute stable inverses relative to start
      dragBaseProjection = d3.geoOrthographic()
        .translate(projection.translate())
        .scale(projection.scale())
        .precision((projection as any).precision?.() ?? 0.1)
        .rotate(dragStartRotate);
      try {
        dragStartLonLat = dragBaseProjection.invert!(dragStartPos) as [number, number];
      } catch {
        dragStartLonLat = null;
      }
      // pause spinning while dragging
      spinningRef.current = false;
    };
    const onDragged = (event: any) => {
      if (!dragStartRotate || !dragStartPos || !dragBaseProjection || !dragStartLonLat) return;
      const dx = event.x - dragStartPos[0];
      const dy = event.y - dragStartPos[1];
      let curLonLat: [number, number] | null = null;
      try {
        curLonLat = dragBaseProjection.invert!([event.x, event.y]) as [number, number];
      } catch {
        curLonLat = null;
      }
      if (!curLonLat) return;
  // Compute geographic delta relative to start under the baseline orientation
      let dLon = curLonLat[0] - dragStartLonLat[0];
      // wrap longitude delta to [-180, 180]
      if (dLon > 180) dLon -= 360; else if (dLon < -180) dLon += 360;
      let dLat = curLonLat[1] - dragStartLonLat[1];
      // Clamp deltas so rotation doesn't exceed mouse movement by much
  const maxLon = dx * 0.24; // increased sensitivity
  const maxLat = -dy * 0.24; // invert so dragging down tilts south
      // clamp with sign kept
      dLon = Math.max(-Math.abs(maxLon), Math.min(Math.abs(maxLon), dLon));
      dLat = Math.max(-Math.abs(maxLat), Math.min(Math.abs(maxLat), dLat));
  const targetLambda = dragStartRotate[0] + dLon;
  const targetPhi = Math.max(-90, Math.min(90, dragStartRotate[1] + dLat));
  // Blend current rotation toward target for smoothness
  const curRot = projection.rotate() as [number, number, number];
  const alpha = 0.25; // smoothing factor (0..1)
  const newLambda = curRot[0] + (targetLambda - curRot[0]) * alpha;
  const newPhi = curRot[1] + (targetPhi - curRot[1]) * alpha;
  projection.rotate([newLambda, newPhi, 0]);
      svg.selectAll('path').attr('d', path as any);
      // keep pins in sync while dragging
      renderPins();
    };
    const onDragEnd = () => {
      dragStartRotate = null;
      dragStartPos = null;
      dragBaseProjection = null;
      dragStartLonLat = null;
      // resume spin if enabled
      if (autorotate) spinningRef.current = true;
      renderPins();
    };
    svg.call(d3.drag<SVGSVGElement, unknown>()
      .on('start', onDragStart)
      .on('drag', onDragged)
      .on('end', onDragEnd) as any);

    // Zoom (wheel/pinch): scale the projection, keep center fixed (axis stable)
    const adminVisibleThreshold = 3.0;
    const urbanVisibleThreshold = 4.0;
  // no additional zoom gesture state needed for center-anchored zoom

    const onZoomStart = (_event: any) => {
      // no-op for center-anchored zoom
    };

    const onZoom = (event: any) => {
      const k = event.transform.k;

      zoomK = k;
      projection
        .scale(baseRadius * zoomK)
        .translate([width / 2, height / 2]);

      // Ensure viewport has no transform (center-anchored axis)
      gViewport.attr('transform', null);
      // Redraw
      svg.selectAll('path').attr('d', path as any);
      renderPins();
      gAdmin.style('display', zoomK >= adminVisibleThreshold ? 'block' : 'none');
      gUrban.style('display', zoomK >= urbanVisibleThreshold ? 'block' : 'none');

    };

    const onZoomEnd = () => {
      // keep viewport centered
      gViewport.attr('transform', null);
    };
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .filter((event) => event.type === 'wheel' || (event.type === 'touchstart' && (event.touches?.length || 0) === 2))
      // Increase wheel zoom sensitivity (faster zoom per wheel step)
      .wheelDelta((event: any) => {
        // Normalize delta across devices (pixels/lines/pages)
        const dy = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode ? event.deltaY * 120 : event.deltaY;
        return -0.006 * dy; // moderated zoom per wheel step
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
      gAdmin.style('display', zoomK >= adminVisibleThreshold ? 'block' : 'none');
      gUrban.style('display', zoomK >= urbanVisibleThreshold ? 'block' : 'none');
    };

    svg.call(zoom as any);
    applyZoomExtents();

  // Initial pin render
  renderPins();

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
      stop = true;
      window.removeEventListener('resize', onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      container.innerHTML = '';
    };
  }, [focusLatLng, autorotate, stroke, strokeWidth, exhibitions, onSelectExhibition]);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0, background: '#fff' }} />;
}
