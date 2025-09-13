import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

// Minimal orthographic globe rendering ONLY boundary lines (admin-0 and admin-1)
export default function D3GeoGlobeSimplified() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countriesGeo, setCountriesGeo] = useState<any | null>(null);
  const [statesGeo, setStatesGeo] = useState<any | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        setLoading(true);
        const fetchJsonSafe = async (url: string) => {
          try {
            const res = await fetch(url);
            if (!res.ok) return null;
            const text = await res.text();
            if (!text || text.trim().startsWith('<!doctype') || text.trim().startsWith('<html')) return null;
            return JSON.parse(text);
          } catch { return null; }
        };

  // Switch to Natural Earth GeoJSON linework directly (different data path)
  const countriesGeo = await fetchJsonSafe('/atlas/ne_110m_admin_0_countries.geojson');
  const statesGeo = await fetchJsonSafe('/atlas/ne_50m_admin_1_states_provinces.geojson');

        if (!alive) return;
        if (!countriesGeo || countriesGeo.type !== 'FeatureCollection') throw new Error('Failed to load countries GeoJSON');
        setCountriesGeo(countriesGeo);
        if (statesGeo && statesGeo.type === 'FeatureCollection') setStatesGeo(statesGeo);
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
    if (!svgRef.current || loading || error || !countriesGeo) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const width = window.innerWidth;
    const height = window.innerHeight;
    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
    const base = Math.min(width, height) * 0.52;
    const projection = d3.geoOrthographic().scale(base).translate([width/2, height/2]).clipAngle(90).precision(0.6);
    const path = d3.geoPath(projection);

    // Admin-0
    svg.append('path')
      .datum(countriesGeo)
      .attr('fill', 'none')
      .attr('stroke', '#000')
      .attr('stroke-width', 0.6)
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('shape-rendering', 'crispEdges')
      .attr('d', path as any);

    // Admin-1
    if (statesGeo) {
      svg.append('path')
        .datum(statesGeo)
        .attr('fill', 'none')
        .attr('stroke', '#000')
        .attr('stroke-width', 0.35)
        .attr('vector-effect', 'non-scaling-stroke')
        .attr('shape-rendering', 'crispEdges')
        .attr('d', path as any);
    }

    // Drag
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
      const w = window.innerWidth;
      const h = window.innerHeight;
      svg.attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);
      const s = Math.min(w, h) * 0.52;
      projection.translate([w/2, h/2]).scale(s);
      svg.selectAll('path').attr('d', path as any);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(svgRef.current as any);
    return () => { try { ro.disconnect(); } catch {} };
  }, [countriesGeo, statesGeo, loading, error]);

  // No municipal overlay for this SVG revert; using different data (NE GeoJSON) only

  if (loading) return <div style={{position:'fixed',inset:0,display:'grid',placeItems:'center'}}>로딩…(SVG 경계선)</div>;
  if (error) return <div style={{position:'fixed',inset:0,display:'grid',placeItems:'center',color:'#b91c1c'}}>에러: {error}</div>;
  return <svg ref={svgRef} style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',display:'block',background:'#fff'}} />;
}