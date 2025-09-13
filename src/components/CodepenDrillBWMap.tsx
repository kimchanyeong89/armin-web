import { useEffect, useRef } from 'react';
import * as am5 from "@amcharts/amcharts5";
import * as am5map from "@amcharts/amcharts5/map";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";
import am5geodata_worldLow from "@amcharts/amcharts5-geodata/worldLow";

type Props = { focusLatLng?: { lat: number; lng: number } | null };

// CodePen drilldown behavior: load per-country map from countries2 dataset on click (BW line style)
export default function CodepenDrillBWMap({ focusLatLng = null }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<am5.Root | null>(null);
  const chartRef = useRef<am5map.MapChart | null>(null);
  const worldRef = useRef<am5map.MapPolygonSeries | null>(null);
  const countryRef = useRef<am5map.MapPolygonSeries | null>(null);
  const urbanRef = useRef<am5map.MapPolygonSeries | null>(null);
  const effectsRef = useRef<am5map.MapPointSeries | null>(null);
  const countries2Ref = useRef<any | null>(null);
  const urbanGeoRef = useRef<any | null>(null);
  // Continent coloring similar to CodePen
  const continents: Record<string, number> = { AF: 0, AN: 1, AS: 2, EU: 3, NA: 4, OC: 5, SA: 6 } as any;
  const continentByCountry: Record<string, string> = {
    // Minimal mapping fallback; will be overridden by countries2 if available
  };

  // Load countries2 dataset (as in CodePen, coming from CDN script)
  const ensureCountries2 = async () => {
    if (countries2Ref.current) return countries2Ref.current;
    const url = "https://cdn.amcharts.com/lib/5/geodata/data/countries2.js";
    await new Promise<void>((resolve) => {
      const s = document.createElement('script');
      s.src = url; s.async = true; s.onload = () => resolve();
      document.head.appendChild(s);
    });
    const data = (window as any).am5geodata_data_countries2;
    countries2Ref.current = data || {};
    return countries2Ref.current;
  };

  const getCountryUrl = async (iso2: string): Promise<string | null> => {
    const data = await ensureCountries2();
    const info = data?.[iso2];
    if (!info) return null;
    // Prefer the first map entry if present, else try to compose a CDN URL
    const first = info.maps?.[0];
    if (first && typeof first === 'string') {
      // If it's a full URL, use as-is; else prefix with CDN root
      if (/^https?:\/\//i.test(first)) return first;
      return `https://cdn.amcharts.com/lib/5/geodata/json/${first.replace(/^\//, '')}`;
    }
    // Fallback: if iso3 exists, try countries/{ISO3}/{ISO3}Low.json
    const iso3 = info.iso3 || info.alpha3 || info.country_code3;
    if (iso3) {
      return `https://cdn.amcharts.com/lib/5/geodata/json/countries/${iso3}/${iso3}Low.json`;
    }
    return null;
  };

  const spawnRipple = (lng: number, lat: number) => {
    const root = rootRef.current; const effects = effectsRef.current; if (!root || !effects) return;
    const di = effects.pushDataItem({ longitude: lng, latitude: lat });
    const sprite = ((di as any).bullets?.[0]?.get?.('sprite')) as am5.Circle | undefined;
    if (!sprite) return;
    sprite.setAll({ radius: 2, fill: am5.color(0x000000), stroke: am5.color(0x000000), fillOpacity: 0.35, strokeOpacity: 0.9 });
    sprite.animate({ key: 'radius', to: 22, duration: 600, easing: am5.ease.out(am5.ease.cubic) });
    sprite.animate({ key: 'fillOpacity', to: 0, duration: 600, easing: am5.ease.out(am5.ease.cubic) });
    sprite.animate({ key: 'strokeOpacity', to: 0, duration: 600, easing: am5.ease.out(am5.ease.cubic) })
      .events.on('stopped', () => { try { (effects.data as any)?.removeValue?.(di); } catch {} });
  };

  const highlightPulse = (poly: am5map.MapPolygon) => {
    try {
      poly.animate({ key: 'strokeWidth', to: 2.2, duration: 160, easing: am5.ease.out(am5.ease.cubic) })
          .events.on('stopped', () => {
            poly.animate({ key: 'strokeWidth', to: 1.1, duration: 180, easing: am5.ease.out(am5.ease.cubic) });
          });
    } catch {}
  };

  const getGeomCenter = (geom: any): [number, number] | null => {
    if (!geom) return null; const pts: [number, number][] = [];
    const push=(x:number,y:number)=>pts.push([x,y]);
    if (geom.type==='Polygon') { for (const r of geom.coordinates) for (const [x,y] of r) push(x,y); }
    else if (geom.type==='MultiPolygon') { for (const p of geom.coordinates) for (const r of p) for (const [x,y] of r) push(x,y); }
    else if (geom.type==='Point') { const [x,y]=geom.coordinates; return [x,y]; }
    if (!pts.length) return null; let sx=0,sy=0; for (const [x,y] of pts){sx+=x;sy+=y;} return [sx/pts.length, sy/pts.length];
  };

  const computeBBox = (geo: any): [number, number, number, number] => {
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    const push=(x:number,y:number)=>{ if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; };
    const walk=(g:any)=>{ if(!g) return; if(g.type==='Polygon'){ for(const r of g.coordinates) for(const [x,y] of r) push(x,y);} else if(g.type==='MultiPolygon'){ for(const p of g.coordinates) for(const r of p) for(const [x,y] of r) push(x,y);} };
    if (geo.type==='FeatureCollection') for(const f of geo.features) walk(f.geometry); else if (geo.type==='Feature') walk(geo.geometry); else walk(geo);
    if (!isFinite(minX)) return [-180,-90,180,90]; return [minX,minY,maxX,maxY];
  };

  const filterUrbanBBox = (urban:any, bbox:[number,number,number,number]) => {
    const [minX,minY,maxX,maxY]=bbox; const inb=(x:number,y:number)=>x>=minX&&x<=maxX&&y>=minY&&y<=maxY;
    const keep=(g:any)=>{ if(!g) return false; if(g.type==='Polygon'){ for(const r of g.coordinates) for(const [x,y] of r) if(inb(x,y)) return true;} else if(g.type==='MultiPolygon'){ for(const p of g.coordinates) for(const r of p) for(const [x,y] of r) if(inb(x,y)) return true;} return false; };
    return { type:'FeatureCollection', features:(urban.features||[]).filter((f:any)=>keep(f.geometry)) };
  };

  useEffect(() => {
    if (!ref.current) return;
  const root = am5.Root.new(ref.current); rootRef.current = root; root.setThemes([am5themes_Animated.new(root)]);
  const chart = root.container.children.push(am5map.MapChart.new(root, { panX:'translateX', panY:'translateY', wheelX:'zoom', wheelY:'zoom', projection: am5map.geoMercator(), minZoomLevel:1, maxZoomLevel:32, zoomStep: 2 }));
    chartRef.current = chart;

  // Zoom controls similar to CodePen UX
  const zoomControl = am5map.ZoomControl.new(root, {});
  chart.set('zoomControl', zoomControl);
  // Light tweak to position (bottom-right)
  zoomControl.setAll({ x: am5.p100, centerX: am5.p100, y: am5.p100, centerY: am5.p100, dx: -12, dy: -12 });

  // Subtle graticule grid behind the world
  const graticule = chart.series.push(am5map.GraticuleSeries.new(root, {}));
  graticule.mapLines.template.setAll({ stroke: am5.color(0xcccccc), strokeOpacity: 0.25 });
    const world = chart.series.push(am5map.MapPolygonSeries.new(root, { geoJSON: am5geodata_worldLow as any, exclude: ['AQ'] }));
    worldRef.current = world;
    // Color set for continents (using subtle grayscale to keep near-BW look)
    const colors = am5.ColorSet.new(root, { colors: [am5.color(0x111111), am5.color(0x222222), am5.color(0x333333), am5.color(0x444444), am5.color(0x555555), am5.color(0x666666), am5.color(0x777777)], reuse: true });
    world.mapPolygons.template.setAll({ stroke: am5.color(0x000000), strokeOpacity: 0.9, strokeWidth: 1.1, fillOpacity: 0.08, tooltipText: '{name}', interactive: true, cursorOverStyle: 'pointer' as any });
    // Apply continent-based fill
    world.mapPolygons.template.adapters.add('fill', (fill, target) => {
      try {
        const dc: any = target.dataItem?.dataContext;
        const iso2 = dc?.id || dc?.iso2 || dc?.isoCode;
        const contCode = (countries2Ref.current?.[iso2]?.continent || continentByCountry[iso2]) as string | undefined;
        if (contCode) {
          const idx = continents[contCode];
          if (typeof idx === 'number') return colors.getIndex(idx);
        }
      } catch {}
      return fill;
    });
  world.mapPolygons.template.states.create('hover', { strokeWidth: 1.6 });
  world.mapPolygons.template.states.create('active', { strokeWidth: 2 });

    // Preload countries2 so continent fills show immediately
    (async () => {
      try {
        await ensureCountries2();
        // Force refresh of fills to apply adapter with loaded data
        world.mapPolygons.each((p) => { p.set('fill', p.get('fill')); });
      } catch {}
    })();

    // Load global urban areas once; create overlay series (hidden by default)
    (async () => {
      try {
        const res = await fetch('/atlas/urban-areas.json');
        if (!res.ok) return; const geo = await res.json(); urbanGeoRef.current = geo;
        console.log('Loaded urban areas:', geo.features?.length, 'features');
        const u = chart.series.push(am5map.MapPolygonSeries.new(root, { geoJSON: { type:'FeatureCollection', features: [] } as any }));
        urbanRef.current = u;
        u.mapPolygons.template.setAll({ fill: am5.color(0xff0000), fillOpacity: 0.3, stroke: am5.color(0xff0000), strokeWidth: 1, strokeOpacity: 0.9, interactive: true, tooltipText: '{name}', cursorOverStyle: 'pointer' as any });
        u.mapPolygons.template.events.on('click', (ev) => {
          const di = ev.target.dataItem as am5.DataItem<am5map.IMapPolygonSeriesDataItem> | null; if (!di) return;
          try { u.zoomToDataItem(di); } catch {}
          highlightPulse(ev.target);
          const geom = (di.dataContext as any)?.geometry || (di.get('geometry') as any); const c = getGeomCenter(geom); if (c) spawnRipple(c[0], c[1]);
        });
        u.set('visible', false);
        chart.series.moveValue(u, chart.series.length - 1);
      } catch (err) {
        console.error('Failed to load urban areas:', err);
      }
    })();

    world.mapPolygons.template.events.on('click', async (ev) => {
      const di = ev.target.dataItem as am5.DataItem<am5map.IMapPolygonSeriesDataItem> | null; if (!di) return;
      world.mapPolygons.each(p => p.set('active', false)); ev.target.set('active', true);
      try { world.zoomToDataItem(di); } catch {}
      const id = (di.dataContext as any)?.id || (di.dataContext as any)?.iso2 || (di.dataContext as any)?.isoCode; if (!id) return;
      const url = await getCountryUrl(id);
      if (!url) return;
      try {
        const resp = await fetch(url, { mode: 'cors' }); if (!resp.ok) return; const geo = await resp.json();
        let country = countryRef.current;
        if (!country) {
          country = chart.series.push(am5map.MapPolygonSeries.new(root, { geoJSON: geo as any })); countryRef.current = country;
          country.mapPolygons.template.setAll({ stroke: am5.color(0x000000), strokeWidth: 1.15, strokeOpacity: 1, fillOpacity: 0, interactive: true, tooltipText: '{name}', cursorOverStyle: 'pointer' as any });
          country.mapPolygons.template.states.create('hover', { strokeWidth: 1.6 });
          country.mapPolygons.template.states.create('active', { strokeWidth: 2 });
          country.mapPolygons.template.events.on('click', (ev2) => {
            const di2 = ev2.target.dataItem as am5.DataItem<am5map.IMapPolygonSeriesDataItem> | null; if (!di2) return;
            try { country!.zoomToDataItem(di2); } catch {}
            const geom = (di2.dataContext as any)?.geometry || (di2.get('geometry') as any); const c = getGeomCenter(geom); if (c) spawnRipple(c[0], c[1]);
          });
        } else {
          country.setAll({ geoJSON: geo as any });
        }
        country.set('visible', true);
        world.set('visible', false);
        chart.series.moveValue(country, chart.series.length - 1);

        // Update urban overlay for this country
        const urbanGeo = urbanGeoRef.current;
        if (urbanGeo && urbanRef.current) {
          const bbox = computeBBox(geo);
          const filtered = filterUrbanBBox(urbanGeo, bbox);
          console.log('Country bbox:', bbox, 'Filtered urban features:', filtered.features?.length);
          urbanRef.current.setAll({ geoJSON: filtered as any });
          urbanRef.current.set('visible', true);
          chart.series.moveValue(urbanRef.current, chart.series.length - 1);
        }
      } catch {}
    });

    const home = chart.children.push(am5.Button.new(root, { dx: 12, dy: 12, centerX: am5.p0, centerY: am5.p0, tooltipText: 'Reset', themeTags: ['zoom'] }));
    home.get('background')?.setAll({ fill: am5.color(0xffffff), stroke: am5.color(0x000000) });
    (home as any).children.push(am5.Label.new(root, { text: 'Home', fill: am5.color(0x000000) }));
    home.events.on('click', () => {
      world?.mapPolygons.each(p => p.set('active', false));
      chart.goHome();
      countryRef.current?.set('visible', false);
      world?.set('visible', true);
      urbanRef.current?.set('visible', false);
    });

    root._rootContainer.set('background', am5.Rectangle.new(root, { fill: am5.color(0xffffff), fillOpacity: 1 }));

  const effects = chart.series.push(am5map.MapPointSeries.new(root, {}));
    effects.bullets.push(() => am5.Bullet.new(root, { sprite: am5.Circle.new(root, { radius: 2, fill: am5.color(0x000000), stroke: am5.color(0x000000) }) }));
    effectsRef.current = effects;

  return () => { root.dispose(); rootRef.current=null; chartRef.current=null; worldRef.current=null; countryRef.current=null; urbanRef.current=null; effectsRef.current=null; countries2Ref.current=null; urbanGeoRef.current=null; };
  }, []);

  useEffect(() => { const chart = chartRef.current; if (!chart || !focusLatLng) return; chart.zoomToGeoPoint({ latitude: focusLatLng.lat, longitude: focusLatLng.lng }, 6, true); }, [focusLatLng]);

  return (<div style={{ position:'relative', width:'100%', height:'100%', background:'#fff' }}><div ref={ref} style={{ position:'absolute', inset:0 }} /></div>);
}
