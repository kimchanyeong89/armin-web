import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { feature as topojsonFeature } from 'topojson-client';

// Minimal orthographic globe using pre-simplified datasets (countries + urban)
export default function D3GeoGlobeSimplified() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countriesFC, setCountriesFC] = useState<any | null>(null);
  const [urbanFC, setUrbanFC] = useState<any | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        setLoading(true);
        const [countriesResp, urbanResp] = await Promise.all([
          fetch('/atlas/simplified-countries-topo.json').then(r => r.ok ? r.json() : null),
          fetch('/atlas/simplified-urban-topo.json').then(r => r.ok ? r.json() : null),
        ]);
        if (!alive) return;
        // fallback to geojson if topo missing
        if (countriesResp && countriesResp.type === 'Topology') {
          setCountriesFC(topojsonFeature(countriesResp, (countriesResp.objects as any).countries));
        } else {
          const fallback = await fetch('/atlas/simplified-countries.geojson').then(r => r.ok ? r.json() : null);
          setCountriesFC(fallback);
        }
        if (urbanResp && urbanResp.type === 'Topology') {
          setUrbanFC(topojsonFeature(urbanResp, (urbanResp.objects as any).urban));
        } else {
          const fallbackU = await fetch('/atlas/simplified-urban.geojson').then(r => r.ok ? r.json() : null);
          setUrbanFC(fallbackU);
        }
      } catch (e: any) {
        setError(e?.message || 'Load failed');
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!svgRef.current || loading || error || !countriesFC) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const rect = (svgRef.current as any).getBoundingClientRect();
    const width = rect.width, height = rect.height;
    svg.attr('width', width).attr('height', height);
    const base = Math.min(width, height) * 0.38;
    const projection = d3.geoOrthographic().scale(base).translate([width/2, height/2]).clipAngle(90).precision(0.6);
    const path = d3.geoPath(projection);

    // Countries
    svg.append('path')
      .datum(countriesFC)
      .attr('fill', 'none')
      .attr('stroke', '#000')
      .attr('stroke-width', 0.4)
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('shape-rendering', 'crispEdges')
      .attr('d', path as any);

    // Urban (optional)
    if (urbanFC) {
      svg.append('path')
        .datum(urbanFC)
        .attr('fill', 'none')
        .attr('stroke', '#000')
        .attr('stroke-width', 0.35)
        .attr('vector-effect', 'non-scaling-stroke')
        .attr('shape-rendering', 'crispEdges')
        .attr('d', path as any);
    }

    // Basic drag
    let prev: [number, number] | null = null;
    svg.call(d3.drag<SVGSVGElement, unknown>()
      .on('start', (ev: any) => { prev = [ev.x, ev.y]; })
      .on('drag', (ev: any) => {
        if (!prev) return;
        const dx = ev.x - prev[0];
        const dy = ev.y - prev[1];
        const r = projection.rotate();
        projection.rotate([r[0] + dx * 0.5, Math.max(-85, Math.min(85, r[1] - dy * 0.5)), r[2]]);
        prev = [ev.x, ev.y];
        svg.selectAll('path').attr('d', path as any);
      })
      .on('end', () => { prev = null; }) as any);

    // Resize
    const onResize = () => {
      const rr = (svgRef.current as any).getBoundingClientRect();
      const w = rr.width, h = rr.height;
      svg.attr('width', w).attr('height', h);
      const s = Math.min(w, h) * 0.38;
      projection.translate([w/2, h/2]).scale(s);
      svg.selectAll('path').attr('d', path as any);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(svgRef.current as any);
    return () => { try { ro.disconnect(); } catch {} };
  }, [countriesFC, urbanFC, loading, error]);

  if (loading) return <div style={{position:'fixed',inset:0,display:'grid',placeItems:'center'}}>로딩…(단순화 지도)</div>;
  if (error) return <div style={{position:'fixed',inset:0,display:'grid',placeItems:'center',color:'#b91c1c'}}>에러: {error}</div>;
  return <svg ref={svgRef} style={{position:'fixed',inset:0,display:'block',background:'#fff'}} />;
}