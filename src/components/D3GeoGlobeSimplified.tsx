import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { mesh as topojsonMesh, feature as topojsonFeature } from 'topojson-client';

// Minimal orthographic globe rendering ONLY boundary lines (admin-0 and admin-1)
export default function D3GeoGlobeSimplified() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [admin0Lines, setAdmin0Lines] = useState<any | null>(null);
  const [admin1Lines, setAdmin1Lines] = useState<any | null>(null);
  const [countriesFC, setCountriesFC] = useState<any | null>(null);
  const [municipalFC, setMunicipalFC] = useState<any | null>(null);
  const muniCacheRef = useRef<Map<string, any>>(new Map());

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

        // Prefer medium-res for boundary lines; fallbacks available in repo
        let countriesTopo = await fetchJsonSafe('/atlas/countries-50m.json');
        if (!countriesTopo) countriesTopo = await fetchJsonSafe('/atlas/countries-110m.json');
        if (!countriesTopo) countriesTopo = await fetchJsonSafe('/atlas/package/countries-50m.json');

  // Admin-1 states/provinces: prefer TopoJSON (10m) then GeoJSON fallback
  let statesTopo = await fetchJsonSafe('/atlas/states-10m.json');
  const statesGeo = statesTopo ? null : await fetchJsonSafe('/atlas/ne_50m_admin_1_states_provinces.geojson');

        if (!alive) return;
        if (!countriesTopo || countriesTopo.type !== 'Topology') throw new Error('Failed to load TopoJSON for countries');

        const countriesObj = (countriesTopo.objects as any).countries || (Object.values(countriesTopo.objects || {}) as any)[0];
        const admin0 = topojsonMesh(countriesTopo, countriesObj, (a: any, b: any) => a !== b);
        setAdmin0Lines(admin0);
        try {
          const fc = topojsonFeature(countriesTopo, countriesObj as any);
          setCountriesFC(fc);
        } catch {}

        if (statesTopo && statesTopo.type === 'Topology') {
          const objects = statesTopo.objects || {};
          const key = Object.keys(objects).find(k => /state|admin.?1|province/i.test(k)) || null;
          if (key) {
            try {
              const admin1 = topojsonMesh(statesTopo, (objects as any)[key], (a: any, b: any) => a !== b);
              setAdmin1Lines(admin1);
            } catch {
              setAdmin1Lines(null);
            }
          } else {
            setAdmin1Lines(null);
          }
        } else if (statesGeo && statesGeo.type === 'FeatureCollection') {
          // Use polygons as stroke-only outlines
          setAdmin1Lines(statesGeo);
        } else {
          setAdmin1Lines(null);
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
    if (!svgRef.current || loading || error || !admin0Lines) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const width = window.innerWidth;
    const height = window.innerHeight;
    svg.attr('width', width).attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`);
    const base = Math.min(width, height) * 0.52;
    const projection = d3.geoOrthographic().scale(base).translate([width/2, height/2]).clipAngle(90).precision(0.6);
    const path = d3.geoPath(projection);

    // Admin-0 country boundaries
    svg.append('path')
      .datum(admin0Lines)
      .attr('fill', 'none')
      .attr('stroke', '#000')
      .attr('stroke-width', 0.6)
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('shape-rendering', 'crispEdges')
      .attr('d', path as any);

    // Admin-1 state/province boundaries (if available)
    if (admin1Lines) {
      svg.append('path')
        .datum(admin1Lines)
        .attr('fill', 'none')
        .attr('stroke', '#000')
        .attr('stroke-width', 0.35)
        .attr('vector-effect', 'non-scaling-stroke')
        .attr('shape-rendering', 'crispEdges')
        .attr('d', path as any);
    }

    // Country hit layer for click-to-load municipal boundaries
    if (countriesFC) {
      const features: any[] = (countriesFC.features || []) as any[];
      svg.append('g').attr('class', 'countries-hit')
        .selectAll('path')
        .data(features)
        .join('path')
        .attr('d', path as any)
        .attr('fill', '#000')
        .attr('fill-opacity', 0.001)
        .attr('stroke', 'none')
        .style('cursor', 'pointer')
        .on('click', async (_evt: any, d: any) => {
          const props = d?.properties || {};
          const iso2 = props.iso_a2 || props.ISO_A2 || props.iso2 || props.ISO2 || null;
          const iso3 = props.iso_a3 || props.ISO_A3 || props.iso3 || props.ISO3 || d?.id || null;
          const isoCandidates = [iso2, iso3].filter(Boolean) as string[];
          let loaded: any | null = null;
          for (const iso of isoCandidates) {
            if (muniCacheRef.current.has(iso)) {
              loaded = muniCacheRef.current.get(iso);
              break;
            }
            const muni = await fetchMunicipalGeo(iso);
            if (muni && muni.geojson) {
              loaded = muni.geojson;
              muniCacheRef.current.set(iso, loaded);
              break;
            }
          }
          setMunicipalFC(loaded);
          svg.selectAll('path').attr('d', path as any);
        });
    }

    // Municipal (city admin) boundaries overlay as stroke-only lines
    if (municipalFC) {
      svg.append('path')
        .datum(municipalFC)
        .attr('fill', 'none')
        .attr('stroke', '#000')
        .attr('stroke-width', 0.45)
        .attr('vector-effect', 'non-scaling-stroke')
        .attr('shape-rendering', 'crispEdges')
        .attr('d', path as any);
    }

    // Basic drag to rotate
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

    // Resize handling
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
  }, [admin0Lines, admin1Lines, countriesFC, municipalFC, loading, error]);

  // Fetch municipal boundaries helper (GeoBoundaries) — returns GeoJSON polygons rendered as stroke-only outlines
  async function fetchMunicipalGeo(iso: string): Promise<{ level: string; geojson: any } | null> {
    const tryLevels = ["ADM3", "ADM2", "ADM4"];
    for (const level of tryLevels) {
      try {
        const url = `https://www.geoboundaries.org/gbRequest.html?ISO=${encodeURIComponent(iso)}&ADM=${encodeURIComponent(level)}`;
        const resp = await fetch(url, { mode: 'cors' });
        if (!resp.ok) continue;
        const data = await resp.json();
        const item = Array.isArray(data) ? (data[0] || null) : data;
        const gj = item?.gjDownloadURL || item?.gjDownloadUrl || item?.geojson || item?.downloadURL || null;
        if (gj && typeof gj === 'string') {
          const gjResp = await fetch(gj, { mode: 'cors' });
          if (!gjResp.ok) continue;
          const gjData = await gjResp.json();
          return { level, geojson: gjData };
        }
      } catch {}
    }
    return null;
  }

  if (loading) return <div style={{position:'fixed',inset:0,display:'grid',placeItems:'center'}}>로딩…(경계선+행정 라인)</div>;
  if (error) return <div style={{position:'fixed',inset:0,display:'grid',placeItems:'center',color:'#b91c1c'}}>에러: {error}</div>;
  return <svg ref={svgRef} style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',display:'block',background:'#fff'}} />;
}