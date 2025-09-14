import { useEffect, useRef, useState } from 'react';
import { geoOrthographic, geoPath } from 'd3-geo';
import * as d3 from 'd3';

// Orthographic globe that only shows city/municipality boundaries (ADM2), loaded on country click.
export default function D3GeoGlobeSimplified() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countries, setCountries] = useState<any[] | null>(null);
  const [selectedISO3, setSelectedISO3] = useState<string | null>(null);
  const [muniFeatures, setMuniFeatures] = useState<any[] | null>(null);
  const [muniLoading, setMuniLoading] = useState(false);
  const [muniError, setMuniError] = useState<string | null>(null);

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
    const gCountries = svg.append('g').attr('class', 'hit-countries');
    const gCities = svg.append('g').attr('class', 'cities');

    // Invisible hit layer for countries
    gCountries.selectAll('path')
      .data(countries)
      .enter()
      .append('path')
      .attr('d', path as any)
      .attr('fill', 'rgba(255,255,255,0.001)')
      .attr('stroke', 'none')
      .style('cursor', 'pointer')
      .on('click', async function(_, d: any) {
        const iso3 = getISO3(d?.properties) || '';
        if (!iso3) return;
        // center globe to country centroid
        try {
          const c = d3.geoCentroid(d);
          const r = projection.rotate();
          const target = [-c[0], -c[1]] as [number, number];
          const interp = d3.interpolate([r[0], r[1]], target);
          const scale0 = projection.scale();
          const scale1 = Math.min(Math.max(scale0 * 1.2, Math.min(width, height) * 0.55), Math.min(width, height) * 0.8);
          const t = svg.transition().duration(900).ease(d3.easeCubicOut);
          t.tween('rotate', () => (u: number) => {
            const rr = interp(u);
            projection.rotate([rr[0], rr[1], r[2]]).scale(scale0 + (scale1 - scale0) * u);
            svg.selectAll('path').attr('d', path as any);
          });
        } catch {}
        setSelectedISO3(iso3);
        await loadMunicipalities(iso3);
        renderCities();
      })
      .on('mouseover', function(event: any, d: any){
        const name = getCountryName(d?.properties);
        showTooltip(svg, event, `🏳️ ${name} — click for cities`);
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
        .attr('stroke-width', 0.25)
        .attr('vector-effect', 'non-scaling-stroke')
        .attr('stroke-opacity', 0.95)
        .on('mouseover', function(event: any, f: any){
          const city = getMunicipalityName(f?.properties || {});
          showTooltip(svg, event, `🏙️ ${city}`);
          d3.select(this as any).attr('stroke-width', 0.4);
        })
        .on('mouseout', function(){
          svg.select('.tooltip').remove();
          d3.select(this as any).attr('stroke-width', 0.25);
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

    return () => { try { ro.disconnect(); observer.disconnect(); } catch {} };
  // we intentionally omit muniFeatures here to avoid full re-init; we call renderCities manually
  }, [countries, loading, error]);

  // Loader: ADM2 via GeoBoundaries, fallback to ADM1-like if missing
  async function loadMunicipalities(iso3: string) {
    try {
      setMuniLoading(true);
      setMuniError(null);
      setMuniFeatures(null);
      // gbRequest
      let feats: any[] = [];
      try {
        const reqUrl = `https://www.geoboundaries.org/gbRequest.html?ISO=${encodeURIComponent(iso3)}&ADM=ADM2`;
        const req = await fetch(reqUrl, { mode: 'cors' });
        if (req.ok) {
          let info: any = null;
          try { info = await req.json(); } catch { info = null; }
          const pick = Array.isArray(info) ? info.find((x: any) => x && typeof x.gjDownloadURL === 'string' && x.gjDownloadURL.includes('.geojson')) : info;
          const dl = pick?.gjDownloadURL || null;
          if (dl) {
            const gj = await fetch(dl, { mode: 'cors' });
            if (gj.ok) {
              let data: any = null;
              try { data = await gj.json(); } catch { data = null; }
              feats = data?.features || [];
            }
          }
        }
      } catch {}
      if (!feats || feats.length < 2) {
        // fallback: none
        setMuniError('No city boundaries available');
        setMuniLoading(false);
        return;
      }
      setMuniFeatures(feats);
    } catch (e: any) {
      setMuniError(e?.message || 'Failed to load city boundaries');
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