import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { feature } from 'topojson-client';
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

    const projection = d3.geoOrthographic()
      .translate([width / 2, height / 2])
      .scale(baseRadius)
      .precision(0.1);

    const path = d3.geoPath(projection);

    // Graticule for the outer circle (sphere outline)
    const sphere: d3.GeoSphere = { type: 'Sphere' } as any;


  const gSphere = svg.append('g');
  gSphere.append('path')
      .datum(sphere)
      .attr('d', path as any)
      .style('fill', 'none')
      .style('stroke', stroke)
      .style('stroke-width', String(strokeWidth))
      .style('stroke-linejoin', 'round')
      .style('stroke-linecap', 'round');
    const gCountries = svg.append('g');
    const gPins = svg.append('g');


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
          .style('stroke-linejoin', 'round')
          .style('stroke-linecap', 'round');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Failed to load TopoJSON countries', e);
      }
    })();
    // Pins
    const renderPins = () => {
      const rotate = projection.rotate();
      const centerLonLat: [number, number] = [-rotate[0], -rotate[1]];
      const sel = gPins.selectAll('g.pin').data(exhibitions, (d: any) => d.id);
      sel.exit().remove();
      const enter = sel.enter().append('g').attr('class', 'pin').style('cursor', 'pointer');
      enter.append('rect')
        .attr('width', 10).attr('height', 10)
        .attr('x', -5).attr('y', -5)
        .attr('rx', 1.5)
        .attr('fill', '#111827');
      enter.append('title');
      const merged = enter.merge(sel as any);
      merged.on('click', (_event: any, d: Exhibition) => {
        const { longitude: lng, latitude: lat } = d;
        // recentre and notify
        const prev = spinningRef.current;
        spinningRef.current = false;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rotateTo(lng, lat);
        if (onSelectExhibition) onSelectExhibition(d);
        if (prev && autorotate) rafRef.current = requestAnimationFrame(step);
      });
      merged.each(function (d: Exhibition) {
        const p = projection([d.longitude, d.latitude]);
        if (!p) { d3.select(this as SVGGElement).attr('display', 'none'); return; }
        const visible = d3.geoDistance([d.longitude, d.latitude], centerLonLat) <= Math.PI / 2 + 1e-6;
        d3.select(this as SVGGElement)
          .attr('transform', `translate(${p[0]},${p[1]})`)
          .attr('display', visible ? null : 'none')
          .select('title').text(d.name);
      });
    };


    // Focus handling
    const rotateTo = (lng: number, lat: number) => {
      const currentRotate = projection.rotate(); // [lambda, phi, gamma]
      const target = [-lng, -lat, 0];
  const interp = d3.interpolate(currentRotate as [number, number, number], target);
      const duration = 1200;
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        projection.rotate(interp(t) as [number, number, number]);
        svg.selectAll('path').attr('d', path as any);
        renderPins();
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
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

    // Drag to rotate
    let dragStartRotate: [number, number, number] | null = null;
    let dragStartPos: [number, number] | null = null;
    const sensitivity = 0.25; // deg per px
    const onDragStart = (event: any) => {
      dragStartRotate = projection.rotate() as [number, number, number];
      dragStartPos = [event.x, event.y];
      // pause spinning while dragging
      spinningRef.current = false;
    };
    const onDragged = (event: any) => {
      if (!dragStartRotate || !dragStartPos) return;
      const dx = event.x - dragStartPos[0];
      const dy = event.y - dragStartPos[1];
      const lambda = dragStartRotate[0] + dx * sensitivity;
      const phi = dragStartRotate[1] - dy * sensitivity;
      projection.rotate([lambda, Math.max(-90, Math.min(90, phi)), 0]);
      svg.selectAll('path').attr('d', path as any);
    };
    const onDragEnd = () => {
      dragStartRotate = null;
      dragStartPos = null;
      // resume spin if enabled
      if (autorotate) spinningRef.current = true;
    };
    svg.call(d3.drag<SVGSVGElement, unknown>()
      .on('start', onDragStart)
      .on('drag', onDragged)
      .on('end', onDragEnd) as any);

    // Zoom (wheel/pinch) to change scale only; keep center fixed
    const onZoom = (event: any) => {
      zoomK = event.transform.k;
      projection.scale(baseRadius * zoomK);
      svg.selectAll('path').attr('d', path as any);
      renderPins();
    };
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.6, 2.2])
      .filter((event) => event.type === 'wheel' || (event.type === 'touchstart' && (event.touches?.length || 0) === 2))
      .on('zoom', onZoom);
  svg.call(zoom as any);

  // Initial pin render
  renderPins();

    // Resize handler
    const onResize = () => {
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      baseRadius = Math.min(width, height) * 0.38;
      svg.attr('width', width).attr('height', height);
      projection.translate([width / 2, height / 2]).scale(baseRadius * zoomK);
      svg.selectAll('path').attr('d', path as any);
      renderPins();
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
