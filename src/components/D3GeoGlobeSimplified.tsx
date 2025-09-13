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
        const fetchJsonSafe = async (url: string) => {
          try {
            const res = await fetch(url);
            if (!res.ok) return null;
            const text = await res.text();
            if (!text || text.trim().startsWith('<!doctype') || text.trim().startsWith('<html')) return null;
            return JSON.parse(text);
          } catch { return null; }
        };

        // Countries: try simplified topo -> simplified geo -> fallback to existing countries-110m (Topo/Geo)
        let countriesRaw = await fetchJsonSafe('/atlas/simplified-countries-topo.json');
        if (!countriesRaw) countriesRaw = await fetchJsonSafe('/atlas/simplified-countries.geojson');
        if (!countriesRaw) countriesRaw = await fetchJsonSafe('/geodata/countries-110m.json');

        // Urban: try simplified topo -> simplified geo -> fallback to ne_50m urban
        let urbanRaw = await fetchJsonSafe('/atlas/simplified-urban-topo.json');
        if (!urbanRaw) urbanRaw = await fetchJsonSafe('/atlas/simplified-urban.geojson');
        if (!urbanRaw) urbanRaw = await fetchJsonSafe('/atlas/ne_50m_urban_areas.geojson');

        if (!alive) return;

        // Normalize countries to FeatureCollection
        if (countriesRaw) {
          if (countriesRaw.type === 'Topology') {
            const fc = topojsonFeature(countriesRaw, (countriesRaw.objects as any).countries || (Object.values(countriesRaw.objects || {}) as any)[0]);
            setCountriesFC(fc);
          } else {
            setCountriesFC(countriesRaw);
          }
        } else {
          throw new Error('Failed to load countries data');
        }

        // Normalize urban to FeatureCollection (optional)
        if (urbanRaw) {
          if (urbanRaw.type === 'Topology') {
            const fcU = topojsonFeature(urbanRaw, (urbanRaw.objects as any).urban || (Object.values(urbanRaw.objects || {}) as any)[0]);
            setUrbanFC(fcU);
          } else {
            setUrbanFC(urbanRaw);
          }
        } else {
          setUrbanFC(null);
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
   const width = window.innerWidth;
   const height = window.innerHeight;
   svg.attr('width', width).attr('height', height)
     .attr('viewBox', `0 0 ${width} ${height}`);
   const base = Math.min(width, height) * 0.52;
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
  }, [countriesFC, urbanFC, loading, error]);

  if (loading) return <div style={{position:'fixed',inset:0,display:'grid',placeItems:'center'}}>로딩…(단순화 지도)</div>;
  if (error) return <div style={{position:'fixed',inset:0,display:'grid',placeItems:'center',color:'#b91c1c'}}>에러: {error}</div>;
  return <svg ref={svgRef} style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',display:'block',background:'#fff'}} />;
}