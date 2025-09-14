import { useEffect, useRef, useState } from 'react';
import { geoOrthographic, geoPath, geoGraticule10 } from 'd3-geo';
import * as d3 from 'd3';

// Orthographic globe that only shows city/municipality boundaries (ADM2), loaded on country click.
export default function D3GeoGlobeSimplified() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countries, setCountries] = useState<any[] | null>(null);
  const [selectedISO3, setSelectedISO3] = useState<string | null>(null);
  const [muniFeatures, setMuniFeatures] = useState<any[] | null>(null);
  const [muniLevel, setMuniLevel] = useState<'ADM2' | 'ADM1' | null>(null);
  const [muniLoading, setMuniLoading] = useState(false);
  const [muniError, setMuniError] = useState<string | null>(null);
  // Cache ISO3 -> { level, features }
  const muniCacheRef = useRef<Map<string, { level: 'ADM2' | 'ADM1'; features: any[] }>>(new Map());
  const hasAutoLoadedRef = useRef<boolean>(false);

  // Load admin-0 countries for click-hit only (not rendered)
  useEffect(() => {
    let alive = true;
    const fetchJsonSafe = async (url: string) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const text = await res.text();
        if (!text || text.trim().startsWith('<!doctype') || text.trim().startsWith('<html')) return null;
        return JSON.parse(text);
      } catch { return null; }
    };
    (async () => {
      try {
        setLoading(true);
        const geo = await fetchJsonSafe('/atlas/ne_110m_admin_0_countries.geojson')
          || await fetchJsonSafe('/geodata/countries-50m.json');
        if (!alive) return;
        if (!geo || geo.type !== 'FeatureCollection') throw new Error('Failed to load countries');
        setCountries(geo.features || []);
      } catch (e: any) {
        if (alive) setError(e?.message || 'Load failed');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!svgRef.current || loading || error || !countries) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const width = window.innerWidth;
    const height = window.innerHeight;
    svg.attr('width', width).attr('height', height);

    const base = Math.min(width, height) * 0.48;
    const projection = geoOrthographic().scale(base).translate([width/2, height/2]).clipAngle(90).precision(0.6);
    const path = geoPath(projection);

  // Groups
  const gOutline = svg.append('g').attr('class', 'country-outline').style('pointer-events', 'none');
  const gCountries = svg.append('g').attr('class', 'hit-countries');
  const gCities = svg.append('g').attr('class', 'cities');

    // Context: sphere outline + light graticule (very subtle)
    svg.append('path')
      .datum({ type: 'Sphere' } as any)
      .attr('d', path as any)
      .attr('fill', '#ffffff')
      .attr('stroke', '#d1d5db')
      .attr('stroke-width', 0.5)
      .attr('vector-effect', 'non-scaling-stroke');
    svg.append('path')
      .datum(geoGraticule10() as any)
      .attr('d', path as any)
      .attr('fill', 'none')
      .attr('stroke', '#e5e7eb')
      .attr('stroke-width', 0.3)
      .attr('vector-effect', 'non-scaling-stroke');

  // Visible country outlines for context (stroke-only)
    if (countries && countries.length) {
      gOutline.append('path')
        .datum({ type: 'FeatureCollection', features: countries } as any)
        .attr('d', path as any)
        .attr('fill', 'none')
    .attr('stroke', '#111827')
    .attr('stroke-width', 0.8)
    .attr('stroke-opacity', 0.85)
        .attr('vector-effect', 'non-scaling-stroke')
        .attr('shape-rendering', 'crispEdges');
    }

    // Invisible hit layer for countries
    gCountries.selectAll('path')
      .data(countries)
      .enter()
      .append('path')
      .attr('d', path as any)
  .attr('fill', 'transparent')
      .attr('stroke', 'none')
      .style('cursor', 'pointer')
  .style('pointer-events', 'all')
  .on('click', async function(_, d: any) {
        const iso3 = getISO3(d?.properties) || '';
        if (!iso3) return;
        // center and fit country tightly
        try {
          const c = d3.geoCentroid(d);
          const r = projection.rotate();
          const target = [-c[0], -c[1]] as [number, number];
          const interpRot = d3.interpolate([r[0], r[1]], target);
          const s0 = projection.scale();
          // prelim rotate to compute bounds
          projection.rotate([target[0], target[1], r[2]]);
          const b = path.bounds(d);
          const dx = Math.max(1, b[1][0] - b[0][0]);
          const dy = Math.max(1, b[1][1] - b[0][1]);
          const margin = 0.10; // leave 10% padding
          const targetW = width * (1 - margin * 2);
          const targetH = height * (1 - margin * 2);
          const fitScale = s0 * Math.min(targetW / dx, targetH / dy);
          const s1 = Math.min(Math.max(fitScale, s0 * 1.15), Math.min(width, height) * 0.9);
          // animate rotate+scale
          const t = svg.transition().duration(900).ease(d3.easeCubicOut);
          t.tween('rotate+scale', () => (u: number) => {
            const rr = interpRot(u);
            projection.rotate([rr[0], rr[1], r[2]]).scale(s0 + (s1 - s0) * u);
            svg.selectAll('path').attr('d', path as any);
          });
        } catch {}
        setSelectedISO3(iso3);
        const loaded = await loadMunicipalities(iso3);
        if (loaded && Array.isArray(loaded.features) && loaded.features.length) {
          setMuniFeatures(loaded.features as any[]);
          setMuniLevel(loaded.level);
          renderCitiesWith(loaded.features as any[]);
        }
      })
      .on('mouseover', function(event: any, d: any){
        const name = getCountryName(d?.properties);
        showTooltip(svg, event, `🏳️ ${name} — click to load city boundaries`);
      })
      .on('mouseout', () => svg.select('.tooltip').remove());

  // Drag rotate
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

    // Render cities (ADM2) when loaded
  function renderCities() {
      gCities.selectAll('*').remove();
      if (!muniFeatures || !muniFeatures.length) return;
      gCities.selectAll('path')
        .data(muniFeatures)
        .enter()
        .append('path')
        .attr('d', path as any)
        .attr('fill', 'none')
        .attr('stroke', '#000')
        .attr('stroke-width', 0.6)
        .attr('vector-effect', 'non-scaling-stroke')
        .attr('stroke-opacity', 0.95)
        .on('mouseover', function(event: any, f: any){
          const city = getMunicipalityName(f?.properties || {});
          showTooltip(svg, event, `🏙️ ${city}`);
          d3.select(this as any).attr('stroke-width', 0.9);
        })
        .on('mouseout', function(){
          svg.select('.tooltip').remove();
          d3.select(this as any).attr('stroke-width', 0.6);
        });
    }
    function renderCitiesWith(feats: any[]) {
      gCities.selectAll('*').remove();
      gCities.selectAll('path')
        .data(feats)
        .enter()
        .append('path')
        .attr('d', path as any)
        .attr('fill', 'none')
        .attr('stroke', '#000')
        .attr('stroke-width', 0.6)
        .attr('vector-effect', 'non-scaling-stroke')
        .attr('stroke-opacity', 0.95)
        .on('mouseover', function(event: any, f: any){
          const city = getMunicipalityName(f?.properties || {});
          showTooltip(svg, event, `🏙️ ${city}`);
          d3.select(this as any).attr('stroke-width', 0.9);
        })
        .on('mouseout', function(){
          svg.select('.tooltip').remove();
          d3.select(this as any).attr('stroke-width', 0.6);
        });
    }

    // Resize
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      svg.attr('width', w).attr('height', h);
      const s = Math.min(w, h) * 0.48;
      projection.translate([w/2, h/2]).scale(s);
      svg.selectAll('path').attr('d', path as any);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(svgRef.current as any);

    // When muniFeatures changes after async load, render
    const observer = new MutationObserver(() => {});
    // simple hook via microtask
    setTimeout(renderCities, 0);

    // Auto-load last selected ISO3 or nearest-to-center country once
    const autoLoadDefault = async () => {
      if (hasAutoLoadedRef.current) return;
      hasAutoLoadedRef.current = true;
      try {
        const saved = localStorage.getItem('cityGlobe.lastISO3');
        const tryISO = saved || (() => {
          if (!countries || countries.length === 0) return null;
          const inv = (projection as any).invert;
          const center = typeof inv === 'function' ? (inv([width/2, height/2]) as [number, number]) : ([0, 0] as [number, number]);
          let best: any = null; let bestD = Infinity;
          for (const f of countries) {
            let c: [number, number] = [0,0];
            try { c = d3.geoCentroid(f) as [number, number]; } catch {}
            let d = Infinity;
            try { d = d3.geoDistance(c as any, center as any); } catch {}
            if (isFinite(d) && d < bestD) { bestD = d; best = f; }
          }
          return best ? getISO3(best.properties) : null;
        })();
        if (!tryISO) return;
        setSelectedISO3(tryISO);
        const loaded = await loadMunicipalities(tryISO);
        if (loaded && loaded.features?.length) {
          setMuniFeatures(loaded.features);
          setMuniLevel(loaded.level);
          renderCitiesWith(loaded.features);
        }
      } catch (e) {
        // network/CORS error; keep silent here, we fall back below
      }
    };
    // kick off shortly after first paint
    setTimeout(autoLoadDefault, 50);

    return () => { try { ro.disconnect(); observer.disconnect(); } catch {} };
  // we intentionally omit muniFeatures here to avoid full re-init; we call renderCities manually
  }, [countries, loading, error]);

  // Loader: ADM2 via GeoBoundaries with cache; fallback to ADM1 if missing
  async function loadMunicipalities(iso3: string): Promise<{ level: 'ADM2' | 'ADM1'; features: any[] } | null> {
    try {
      setMuniLoading(true);
      setMuniError(null);
      setMuniFeatures(null);
      setMuniLevel(null);

      // Cache hit
      const cached = muniCacheRef.current.get(iso3);
      if (cached && Array.isArray(cached.features) && cached.features.length) {
        return cached;
      }
      // GeoBoundaries gbOpen API via Vite proxy (avoids CORS in dev)
      let feats: any[] = [];
      let level: 'ADM2' | 'ADM1' = 'ADM2';
      try {
        const reqUrl = `/geoboundaries/api/current/gbOpen/${encodeURIComponent(iso3)}/ADM2`;
        const req = await fetch(reqUrl, { mode: 'cors' }).catch(() => null);
        if (req && req.ok) {
          let info: any = null;
          try { info = await req.json(); } catch { info = null; }
          const pick = Array.isArray(info) ? (info[0] || null) : info;
          const dl: string | null = pick?.gjDownloadURL || pick?.gjDownloadURLz || null;
          if (dl) {
            const dlUrl = dl.includes('www.geoboundaries.org')
              ? dl.replace('https://www.geoboundaries.org', '/geoboundaries')
              : dl.includes('https://github.com/wmgeolab/geoBoundaries/raw')
                ? dl.replace('https://github.com/wmgeolab/geoBoundaries/raw', '/ghraw/wmgeolab/geoBoundaries')
                : dl;
            const gj = await fetch(dlUrl, { mode: 'cors' }).catch(() => null);
            if (gj && gj.ok) {
              let data: any = null;
              try { data = await gj.json(); } catch { data = null; }
              feats = data?.features || [];
            }
          }
        }
      } catch {}
      // Fallback to ADM1 when ADM2 not available
      if (!feats || feats.length < 2) {
        try {
          const reqUrl = `/geoboundaries/api/current/gbOpen/${encodeURIComponent(iso3)}/ADM1`;
          const req = await fetch(reqUrl, { mode: 'cors' }).catch(() => null);
          if (req && req.ok) {
            let info: any = null;
            try { info = await req.json(); } catch { info = null; }
            const pick = Array.isArray(info) ? (info[0] || null) : info;
            const dl: string | null = pick?.gjDownloadURL || pick?.gjDownloadURLz || null;
            if (dl) {
              const dlUrl = dl.includes('www.geoboundaries.org')
                ? dl.replace('https://www.geoboundaries.org', '/geoboundaries')
                : dl.includes('https://github.com/wmgeolab/geoBoundaries/raw')
                  ? dl.replace('https://github.com/wmgeolab/geoBoundaries/raw', '/ghraw/wmgeolab/geoBoundaries')
                  : dl;
              const gj = await fetch(dlUrl, { mode: 'cors' }).catch(() => null);
              if (gj && gj.ok) {
                let data: any = null;
                try { data = await gj.json(); } catch { data = null; }
                feats = data?.features || [];
                level = 'ADM1';
              }
            }
          }
        } catch (e) {
          // network/CORS error on fallback too
        }
      }
      // Tertiary local fallback: try bundled Admin1 and filter by ISO3
      if (!feats || feats.length < 2) {
        try {
          const local1 = await fetch('/geodata/admin1-states-10m.json').catch(() => null);
          let raw: any = null;
          if (local1 && local1.ok) raw = await local1.json().catch(() => null);
          if (!raw) {
            const local2 = await fetch('/atlas/ne_50m_admin_1_states_provinces.geojson').catch(() => null);
            if (local2 && local2.ok) raw = await local2.json().catch(() => null);
          }
          if (raw) {
            const arr = raw.features || [];
            const pickISO = (p: any) => p?.adm0_a3 || p?.ADM0_A3 || p?.iso_a3 || p?.ISO_A3 || null;
            const filtered = Array.isArray(arr) ? arr.filter((f: any) => (pickISO(f?.properties) || '').toUpperCase() === iso3.toUpperCase()) : [];
            if (filtered.length > 0) {
              feats = filtered;
              level = 'ADM1';
            }
          }
        } catch {}
      }
      if (!feats || feats.length < 2) {
        setMuniError('No boundaries available or blocked by CORS');
        setMuniLoading(false);
        return null;
      }
  setMuniFeatures(feats);
      setMuniLevel(level);
      const payload = { level, features: feats };
      muniCacheRef.current.set(iso3, payload);
  try { localStorage.setItem('cityGlobe.lastISO3', iso3); } catch {}
      return payload;
    } catch (e: any) {
      setMuniError(e?.message || 'Failed to load boundaries');
      return null;
    } finally {
      setMuniLoading(false);
    }
  }

  // Helpers
  function getISO3(p: any): string | null {
    const v = p?.iso_a3 || p?.ISO_A3 || p?.adm0_a3 || p?.ADM0_A3 || p?.WB_A3 || p?.GU_A3;
    if (!v) return null;
    const s = String(v).toUpperCase();
    if (s === '---' || s === 'XXX') return null;
    if (s === 'CHN' || s === 'CN') return 'CHN';
    return s;
  }
  function getCountryName(p: any): string {
    return p?.name || p?.NAME || p?.ADMIN || p?.name_long || p?.SOVEREIGNT || p?.FORMAL_EN || p?.BRK_NAME || 'Unknown Country';
  }
  function getMunicipalityName(p: any): string {
    return p?.shapeName || p?.NAME || p?.NAME_2 || p?.NAME_1 || p?.name || p?.full_name || p?.ENGTYPE_2 || 'Unknown City';
  }

  if (loading) return <div style={{position:'fixed',inset:0,display:'grid',placeItems:'center'}}>로딩…(도시 경계 준비)</div>;
  if (error) return <div style={{position:'fixed',inset:0,display:'grid',placeItems:'center',color:'#b91c1c'}}>에러: {error}</div>;
  return (
    <>
      <svg ref={svgRef} style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',display:'block',background:'#fff'}} />
      <div style={{ position:'fixed', left: 16, bottom: 16, background:'rgba(255,255,255,0.95)', border:'1px solid #ccc', padding:8, borderRadius:6, fontSize:12 }}>
        City globe
        {selectedISO3 && <span style={{ marginLeft: 8 }}>ISO3: {selectedISO3}</span>}
  {muniLevel && <span style={{ marginLeft: 8 }}>level: {muniLevel}</span>}
        {muniLoading && <span style={{ marginLeft: 8, color:'#059669' }}>loading…</span>}
        {muniError && <span style={{ marginLeft: 8, color:'#B91C1C' }}>fail: {muniError}</span>}
        {muniFeatures && <span style={{ marginLeft: 8, color:'#4B5563' }}>features: {muniFeatures.length}</span>}
      </div>
    </>
  );
}

function showTooltip(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, event: any, text: string) {
  svg.select('.tooltip').remove();
  const tooltip = svg.append('g').attr('class', 'tooltip');
  const rect = tooltip.append('rect')
    .attr('fill', 'rgba(255, 255, 255, 0.95)')
    .attr('stroke', '#000000')
    .attr('stroke-width', 1)
    .attr('rx', 4);
  const textElement = tooltip.append('text')
    .attr('fill', '#000000')
    .attr('font-size', '12px')
    .attr('font-weight', 'bold')
    .attr('text-anchor', 'start')
    .text(text);
  const bbox = (textElement.node() as SVGTextElement).getBBox();
  rect.attr('x', bbox.x - 8)
      .attr('y', bbox.y - 4)
      .attr('width', bbox.width + 16)
      .attr('height', bbox.height + 8);
  const [mouseX, mouseY] = d3.pointer(event);
  tooltip.attr('transform', `translate(${mouseX + 10}, ${mouseY - 10})`);
}