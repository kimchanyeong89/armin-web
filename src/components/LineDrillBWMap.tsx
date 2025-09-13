import { useEffect, useRef } from 'react';
import * as am5 from "@amcharts/amcharts5";
import * as am5map from "@amcharts/amcharts5/map";
import am5geodata_worldLow from "@amcharts/amcharts5-geodata/worldLow";

type Props = {
  focusLatLng?: { lat: number; lng: number } | null;
};

// Fresh implementation: Black/white line-drawing drilldown map with city click visuals
export default function LineDrillBWMap({ focusLatLng = null }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<am5.Root | null>(null);
  const chartRef = useRef<am5map.MapChart | null>(null);
  const worldRef = useRef<am5map.MapPolygonSeries | null>(null);
  const detailRef = useRef<am5map.MapPolygonSeries | null>(null);
  const urbanRef = useRef<am5map.MapPolygonSeries | null>(null); // global cities
  const urbanDetailRef = useRef<am5map.MapPolygonSeries | null>(null); // filtered cities per country
  const effectsRef = useRef<am5map.MapPointSeries | null>(null);
  const urbanGeoRef = useRef<any | null>(null);
  const drawingRef = useRef(false);

  // helpers
  const animateDraw = (series: am5map.MapPolygonSeries, baseDelay = 0) => {
    if (!series || drawingRef.current) return;
    drawingRef.current = true;
    let i = 0;
    series.mapPolygons.each((mp) => {
      mp.setAll({ strokeOpacity: 0, strokeWidth: 1.1 });
      (mp as any).set("strokeDasharray", 800);
      (mp as any).set("strokeDashoffset", 800);
      const delayMs = baseDelay + 18 * (i++);
      setTimeout(() => {
        mp.animate({ key: 'strokeOpacity', to: 1, duration: 380, easing: am5.ease.out(am5.ease.cubic) });
        try { (mp as any).animate({ key: 'strokeDashoffset', to: 0, duration: 760, easing: am5.ease.out(am5.ease.cubic) }); } catch {}
      }, delayMs);
    });
    setTimeout(() => { drawingRef.current = false; }, 1200);
  };

  const highlightPulse = (poly: am5map.MapPolygon) => {
    try {
      poly.animate({ key: 'strokeWidth', to: 2.2, duration: 160, easing: am5.ease.out(am5.ease.cubic) })
          .events.on('stopped', () => {
            poly.animate({ key: 'strokeWidth', to: 1.1, duration: 180, easing: am5.ease.out(am5.ease.cubic) });
          });
    } catch {}
  };

  const getCentroid = (geom: any): [number, number] | null => {
    if (!geom) return null;
    const pts: [number, number][] = [];
    const push = (x: number, y: number) => pts.push([x, y]);
    if (geom.type === 'Polygon') { for (const r of geom.coordinates) for (const [x,y] of r) push(x,y); }
    else if (geom.type === 'MultiPolygon') { for (const p of geom.coordinates) for (const r of p) for (const [x,y] of r) push(x,y); }
    else if (geom.type === 'Point') { const [x,y] = geom.coordinates; return [x,y]; }
    if (!pts.length) return null; let sx=0, sy=0; for (const [x,y] of pts) { sx+=x; sy+=y; }
    return [sx/pts.length, sy/pts.length];
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
    const root = am5.Root.new(ref.current); rootRef.current = root;
    root.setThemes([]);

    const chart = root.container.children.push(am5map.MapChart.new(root, {
      panX: 'translateX', panY: 'translateY', wheelX: 'zoom', wheelY: 'zoom',
      projection: am5map.geoMercator(), minZoomLevel: 1, maxZoomLevel: 32,
    }));
    chartRef.current = chart;

    const world = chart.series.push(am5map.MapPolygonSeries.new(root, { geoJSON: am5geodata_worldLow as any, exclude: ['AQ'] }));
    worldRef.current = world;
    world.mapPolygons.template.setAll({ stroke: am5.color(0x000000), strokeOpacity: 0.9, strokeWidth: 1.1, fillOpacity: 0, tooltipText: '{name}', interactive: true });
    world.mapPolygons.template.states.create('hover', { strokeWidth: 1.6 });
    world.mapPolygons.template.states.create('active', { strokeWidth: 2 });
    world.events.on('datavalidated', () => animateDraw(world));

    world.mapPolygons.template.events.on('click', (ev) => {
      const target = ev.target; const di = target.dataItem as am5.DataItem<am5map.IMapPolygonSeriesDataItem> | null; if (!di) return;
      world.mapPolygons.each(p => p.set('active', false)); target.set('active', true); world.zoomToDataItem(di);
      const ctx:any = di.dataContext || {}; const iso2:string|undefined = ctx.id || ctx.iso2 || ctx.isoCode;
      const DETAIL:Record<string,string> = { GB: '/geodata/uk_level1.json' };
      const url = iso2 ? DETAIL[iso2] : undefined;
      if (url) {
        loadDetail(url);
      } else {
        // No detail geo: filter global urban areas to selected country bbox and show
        try {
          const geom = (di.dataContext as any)?.geometry || (di.get('geometry') as any);
          if (geom && urbanGeoRef.current) {
            const bbox = computeBBox(geom);
            const filtered = filterUrbanBBox(urbanGeoRef.current, bbox);
            let udet = urbanDetailRef.current; const root = rootRef.current; const chart = chartRef.current;
            if (root && chart) {
              if (!udet) {
                udet = chart.series.push(am5map.MapPolygonSeries.new(root, { geoJSON: filtered as any })); urbanDetailRef.current = udet;
                udet.mapPolygons.template.setAll({ fillOpacity: 0, stroke: am5.color(0x000000), strokeWidth: 1.1, strokeOpacity: 0.95, interactive: true, tooltipText: '{name}' });
                udet.mapPolygons.template.events.on('click', (ev2) => onCityClick(ev2.target, udet!));
              } else {
                udet.setAll({ geoJSON: filtered as any });
              }
              udet.set('visible', true);
              urbanRef.current?.set('visible', false);
              chart.series.moveValue(udet, chart.series.length - 1);
            }
          } else {
            urbanRef.current?.set('visible', true);
          }
        } catch {
          urbanRef.current?.set('visible', true);
        }
      }
    });

    const home = chart.children.push(am5.Button.new(root, { dx: 12, dy: 12, centerX: am5.p0, centerY: am5.p0, tooltipText: 'Reset', themeTags: ['zoom'] }));
    home.get('background')?.setAll({ fill: am5.color(0xffffff), stroke: am5.color(0x000000) });
    (home as any).children.push(am5.Label.new(root, { text: 'Home', fill: am5.color(0x000000) }));
    home.events.on('click', () => {
      world?.mapPolygons.each(p => p.set('active', false)); chart.goHome();
      detailRef.current?.set('visible', false); urbanRef.current?.set('visible', false); urbanDetailRef.current?.set('visible', false);
    });

    root._rootContainer.set('background', am5.Rectangle.new(root, { fill: am5.color(0xffffff), fillOpacity: 1 }));

    // effects series
    const effects = chart.series.push(am5map.MapPointSeries.new(root, {}));
    effects.bullets.push(() => am5.Bullet.new(root, { sprite: am5.Circle.new(root, { radius: 2, fill: am5.color(0x000000), stroke: am5.color(0x000000) }) }));
    effectsRef.current = effects;

    return () => { root.dispose(); rootRef.current=null; chartRef.current=null; worldRef.current=null; detailRef.current=null; urbanRef.current=null; urbanDetailRef.current=null; effectsRef.current=null; urbanGeoRef.current=null; };
  }, []);

  // load global urban areas overlay
  useEffect(() => {
    const root = rootRef.current; const chart = chartRef.current; if (!root || !chart) return;
    let cancelled=false; (async () => {
      try { const res = await fetch('/atlas/urban-areas.json'); if (!res.ok) return; const geo = await res.json(); if (cancelled) return; urbanGeoRef.current = geo;
        const series = chart.series.push(am5map.MapPolygonSeries.new(root, { geoJSON: geo as any })); urbanRef.current = series;
        series.mapPolygons.template.setAll({ fillOpacity: 0, stroke: am5.color(0x000000), strokeWidth: 1.05, strokeOpacity: 0.9, interactive: true, tooltipText: '{name}' });
        // city click interaction
        series.mapPolygons.template.events.on('click', (ev) => onCityClick(ev.target, series));
        series.set('visible', false); chart.series.moveValue(series, chart.series.length - 1);
      } catch {}
    })();
    return () => { cancelled=true; };
  }, []);

  const onCityClick = (poly: am5map.MapPolygon, series: am5map.MapPolygonSeries) => {
    const di = poly.dataItem as am5.DataItem<am5map.IMapPolygonSeriesDataItem> | null; if (!di) return;
    try { series.zoomToDataItem(di); } catch {}
    highlightPulse(poly);
    const geom = (di.dataContext as any)?.geometry || (di.get('geometry') as any); const c = getCentroid(geom); if (c) spawnRipple(c[0], c[1]);
  };

  const loadDetail = async (url: string) => {
    const root = rootRef.current; const chart = chartRef.current; if (!root || !chart) return;
    try { const res = await fetch(url); if (!res.ok) return; const geo = await res.json();
      let detail = detailRef.current; if (!detail) {
        detail = chart.series.push(am5map.MapPolygonSeries.new(root, { geoJSON: geo as any })); detailRef.current = detail;
        detail.mapPolygons.template.setAll({ stroke: am5.color(0x000000), strokeWidth: 1.15, strokeOpacity: 1, fillOpacity: 0, interactive: false });
      } else { detail.setAll({ geoJSON: geo as any }); }
      detail.set('visible', true); animateDraw(detail, 120);

      const urban = urbanGeoRef.current; if (urban) {
        const bbox = computeBBox(geo); const filtered = filterUrbanBBox(urban, bbox);
        let udet = urbanDetailRef.current; if (!udet) {
          udet = chart.series.push(am5map.MapPolygonSeries.new(root, { geoJSON: filtered as any })); urbanDetailRef.current = udet;
          udet.mapPolygons.template.setAll({ fillOpacity: 0, stroke: am5.color(0x000000), strokeWidth: 1.1, strokeOpacity: 0.95, interactive: true, tooltipText: '{name}' });
          udet.mapPolygons.template.events.on('click', (ev) => onCityClick(ev.target, udet!));
        } else { udet.setAll({ geoJSON: filtered as any }); }
        udet.set('visible', true); chart.series.moveValue(udet, chart.series.length - 1);
      }
    } catch {}
  };

  // programmatic focus
  useEffect(() => { const chart = chartRef.current; if (!chart || !focusLatLng) return; chart.zoomToGeoPoint({ latitude: focusLatLng.lat, longitude: focusLatLng.lng }, 6, true); }, [focusLatLng]);

  return (<div style={{ position:'relative', width:'100%', height:'100%', background:'#fff' }}><div ref={ref} style={{ position:'absolute', inset:0 }} /></div>);
}
