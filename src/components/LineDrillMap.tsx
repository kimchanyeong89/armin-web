import { useEffect, useRef } from 'react';
import * as am5 from "@amcharts/amcharts5";
import * as am5map from "@amcharts/amcharts5/map";
import am5geodata_worldLow from "@amcharts/amcharts5-geodata/worldLow";

type Props = {
  focusLatLng?: { lat: number; lng: number } | null;
};

// Line-drawing style drilldown map: outlines only; on drill, show city boundaries
export default function LineDrillMap({ focusLatLng = null }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<am5.Root | null>(null);
  const chartRef = useRef<am5map.MapChart | null>(null);
  const worldSeriesRef = useRef<am5map.MapPolygonSeries | null>(null);
  const citySeriesRef = useRef<am5map.MapPolygonSeries | null>(null);
  const detailSeriesRef = useRef<am5map.MapPolygonSeries | null>(null);
  const cityDetailSeriesRef = useRef<am5map.MapPolygonSeries | null>(null);
  const urbanGeoRef = useRef<any | null>(null);
  const drawAnimatingRef = useRef(false);
  const effectSeriesRef = useRef<am5map.MapPointSeries | null>(null);

  // Apply a simple line-drawing effect by animating stroke opacity and dashoffset
  const animateSeriesDraw = (series: am5map.MapPolygonSeries) => {
    if (!series) return;
    // prevent overlapping animations
    if (drawAnimatingRef.current) return;
    drawAnimatingRef.current = true;
    let idx = 0;
    series.mapPolygons.each((mp) => {
      mp.setAll({ strokeOpacity: 0, strokeWidth: 1.1 });
      // try dash animation; safe to set even if not visually applied
      (mp as any).set("strokeDasharray", 800);
      (mp as any).set("strokeDashoffset", 800);
      const delayMs = 20 * idx++;
      setTimeout(() => {
        mp.animate({ key: "strokeOpacity", to: 1, duration: 400, easing: am5.ease.out(am5.ease.cubic) });
        try {
          (mp as any).animate({ key: "strokeDashoffset", to: 0, duration: 800, easing: am5.ease.out(am5.ease.cubic) });
        } catch {}
      }, delayMs);
    });
    // allow future runs
    setTimeout(() => { drawAnimatingRef.current = false; }, 1000);
  };

  useEffect(() => {
    if (!ref.current) return;
    const root = am5.Root.new(ref.current);
    rootRef.current = root;

    // Minimal theme
    root.setThemes([]);

    const chart = root.container.children.push(
      am5map.MapChart.new(root, {
        panX: "translateX",
        panY: "translateY",
        wheelX: "zoom",
        wheelY: "zoom",
        projection: am5map.geoMercator(),
        minZoomLevel: 1,
        maxZoomLevel: 32,
      })
    );
    chartRef.current = chart;

    // World outlines only
    const world = chart.series.push(
      am5map.MapPolygonSeries.new(root, {
        geoJSON: am5geodata_worldLow as any,
        exclude: ["AQ"],
      })
    );
    worldSeriesRef.current = world;
  world.mapPolygons.template.setAll({
      stroke: am5.color(0x000000),
      strokeOpacity: 0.85,
      strokeWidth: 1,
      fillOpacity: 0,
      tooltipText: "{name}",
      interactive: true,
    });
    world.mapPolygons.template.states.create("hover", { strokeWidth: 1.6 });
    world.mapPolygons.template.states.create("active", { strokeWidth: 2 });
  // initial draw effect once data is ready
  world.events.on("datavalidated", () => animateSeriesDraw(world));

    world.mapPolygons.template.events.on("click", (e) => {
      const di = e.target.dataItem as am5.DataItem<am5map.IMapPolygonSeriesDataItem> | null;
      if (!di) return;
      world.mapPolygons.each(p => p.set("active", false));
      e.target.set("active", true);
      world.zoomToDataItem(di);

  // Show global city boundaries by default when drilling in
      // If we have a country detail dataset, load it and filter urban areas to bbox
      const ctx: any = di.dataContext || {};
      const iso2: string | undefined = ctx.id || ctx.iso2 || ctx.isoCode;
      const COUNTRY_DETAIL: Record<string, string> = {
        GB: '/geodata/uk_level1.json',
      };
      const url = iso2 ? COUNTRY_DETAIL[iso2] : undefined;
      if (url) {
        loadCountryDetail(url);
      } else {
        citySeriesRef.current?.set("visible", true);
      }
    });

    // Home button
    const homeBtn = chart.children.push(am5.Button.new(root, {
      dx: 12,
      dy: 12,
      centerX: am5.p0,
      centerY: am5.p0,
      tooltipText: "Reset",
      themeTags: ["zoom"],
    }));
    homeBtn.get("background")?.setAll({ fill: am5.color(0xffffff), stroke: am5.color(0x000000) });
    const label = am5.Label.new(root, { text: "Home", fill: am5.color(0x000000) });
    (homeBtn as any).children.push(label);
    homeBtn.events.on("click", () => {
      world?.mapPolygons.each(p => p.set("active", false));
      chart.goHome();
      citySeriesRef.current?.set("visible", false);
      detailSeriesRef.current?.set("visible", false);
      cityDetailSeriesRef.current?.set("visible", false);
    });

    // White background
    root._rootContainer.set("background", am5.Rectangle.new(root, { fill: am5.color(0xffffff), fillOpacity: 1 }));

    // Effects point series for ripple animations
    const effects = chart.series.push(am5map.MapPointSeries.new(root, {}));
    effects.bullets.push(() => {
      const circle = am5.Circle.new(root, { radius: 2, fill: am5.color(0x111827), fillOpacity: 0.35, stroke: am5.color(0x111827), strokeOpacity: 0.9 });
      return am5.Bullet.new(root, { sprite: circle });
    });
    effectSeriesRef.current = effects;

    return () => {
      root.dispose();
      rootRef.current = null;
      chartRef.current = null;
      worldSeriesRef.current = null;
      citySeriesRef.current = null;
      detailSeriesRef.current = null;
      cityDetailSeriesRef.current = null;
      urbanGeoRef.current = null;
    };
  }, []);

  // Load global urban areas as an overlay, initially hidden
  useEffect(() => {
    const root = rootRef.current; const chart = chartRef.current; if (!root || !chart) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/atlas/urban-areas.json');
        if (!res.ok) return;
        const geo = await res.json();
        if (cancelled) return;
        urbanGeoRef.current = geo;
        const citySeries = chart.series.push(
          am5map.MapPolygonSeries.new(root, { geoJSON: geo as any })
        );
        citySeriesRef.current = citySeries;
        citySeries.mapPolygons.template.setAll({
          fillOpacity: 0,
          stroke: am5.color(0x111827),
          strokeWidth: 1.1,
          strokeOpacity: 0.9,
          interactive: true,
          tooltipText: '{name}',
        });
        // City click: zoom + highlight + ripple
        citySeries.mapPolygons.template.events.on("click", (ev) => {
          const target = ev.target;
          const di = target.dataItem as am5.DataItem<am5map.IMapPolygonSeriesDataItem> | null;
          if (!di) return;
          try { citySeries.zoomToDataItem(di); } catch {}
          highlightCityPolygon(target);
          const geom = (di.dataContext as any)?.geometry || (di.get("geometry") as any);
          const c = getGeomCenter(geom);
          if (c) spawnRipple(c[0], c[1]);
        });
        citySeries.set("visible", false);
        chart.series.moveValue(citySeries, chart.series.length - 1);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Helpers
  const computeBBox = (geo: any): [number, number, number, number] => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const push = (lng: number, lat: number) => { if (lng < minX) minX = lng; if (lng > maxX) maxX = lng; if (lat < minY) minY = lat; if (lat > maxY) maxY = lat; };
    const walk = (g: any) => {
      if (!g) return;
      if (g.type === 'Polygon') { for (const r of g.coordinates) for (const [x, y] of r) push(x, y); }
      else if (g.type === 'MultiPolygon') { for (const p of g.coordinates) for (const r of p) for (const [x, y] of r) push(x, y); }
    };
    if (geo.type === 'FeatureCollection') for (const f of geo.features) walk(f.geometry);
    else if (geo.type === 'Feature') walk(geo.geometry); else walk(geo);
    if (!isFinite(minX)) return [-180, -90, 180, 90];
    return [minX, minY, maxX, maxY];
  };

  const filterUrbanByBBox = (urban: any, bbox: [number, number, number, number]) => {
    const [minX, minY, maxX, maxY] = bbox;
    const hit = (lng: number, lat: number) => (lng >= minX && lng <= maxX && lat >= minY && lat <= maxY);
    const keep = (geom: any) => {
      if (!geom) return false;
      if (geom.type === 'Polygon') {
        for (const ring of geom.coordinates) for (const [lng, lat] of ring) if (hit(lng, lat)) return true;
      } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates) for (const ring of poly) for (const [lng, lat] of ring) if (hit(lng, lat)) return true;
      }
      return false;
    };
    const features = (urban.features || []).filter((f: any) => keep(f.geometry));
    return { type: 'FeatureCollection', features };
  };

  // Highlight a clicked city polygon with a brief stroke width pulse
  const highlightCityPolygon = (polygon: am5map.MapPolygon) => {
    try {
      polygon.animate({ key: 'strokeWidth', to: 2.2, duration: 160, easing: am5.ease.out(am5.ease.cubic) })
             .events.on('stopped', () => {
               polygon.animate({ key: 'strokeWidth', to: 1.1, duration: 180, easing: am5.ease.out(am5.ease.cubic) });
             });
    } catch {}
  };

  // Compute centroid/representative point for Polygon/MultiPolygon
  const getGeomCenter = (geom: any): [number, number] | null => {
    if (!geom) return null;
    const collect: [number, number][] = [];
    const push = (lng: number, lat: number) => collect.push([lng, lat]);
    if (geom.type === 'Polygon') {
      for (const ring of geom.coordinates) for (const [lng, lat] of ring) push(lng, lat);
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) for (const ring of poly) for (const [lng, lat] of ring) push(lng, lat);
    } else if (geom.type === 'Point') {
      const [lng, lat] = geom.coordinates; return [lng, lat];
    }
    if (!collect.length) return null;
    let sx = 0, sy = 0; for (const [x, y] of collect) { sx += x; sy += y; }
    return [sx / collect.length, sy / collect.length];
  };

  // Spawn a ripple effect at lon/lat
  const spawnRipple = (lng: number, lat: number) => {
    const root = rootRef.current; const chart = chartRef.current; const effects = effectSeriesRef.current;
    if (!root || !chart || !effects) return;
    const p = effects.pushDataItem({ latitude: lat, longitude: lng });
    const sprite = ((p as any).bullets?.[0]?.get?.("sprite")) as am5.Circle | undefined;
    if (!sprite) return;
    sprite.setAll({ radius: 2, fillOpacity: 0.4, strokeOpacity: 0.9 });
    sprite.animate({ key: 'radius', to: 20, duration: 600, easing: am5.ease.out(am5.ease.cubic) });
    sprite.animate({ key: 'fillOpacity', to: 0, duration: 600, easing: am5.ease.out(am5.ease.cubic) });
    sprite.animate({ key: 'strokeOpacity', to: 0, duration: 600, easing: am5.ease.out(am5.ease.cubic) })
      .events.on('stopped', () => {
        try { (effects.data as any)?.removeValue?.(p); } catch {}
      });
  };

  const loadCountryDetail = async (url: string) => {
    const root = rootRef.current; const chart = chartRef.current; if (!root || !chart) return;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const geo = await res.json();
  let detail = detailSeriesRef.current;
      if (!detail) {
        detail = chart.series.push(am5map.MapPolygonSeries.new(root, { geoJSON: geo as any }));
        detailSeriesRef.current = detail;
        detail.mapPolygons.template.setAll({
          stroke: am5.color(0x000000),
          strokeWidth: 1.2,
          strokeOpacity: 1,
          fillOpacity: 0,
          interactive: false,
        });
      } else {
        detail.setAll({ geoJSON: geo as any });
      }
      detail.set("visible", true);
  // draw animation for detail
  animateSeriesDraw(detail);

      const urban = urbanGeoRef.current;
      if (urban) {
        const bbox = computeBBox(geo);
        const filtered = filterUrbanByBBox(urban, bbox);
  let cdetail = cityDetailSeriesRef.current;
        if (!cdetail) {
          cdetail = chart.series.push(am5map.MapPolygonSeries.new(root, { geoJSON: filtered as any }));
          cityDetailSeriesRef.current = cdetail;
          cdetail.mapPolygons.template.setAll({ fillOpacity: 0, stroke: am5.color(0x111827), strokeWidth: 1.2, strokeOpacity: 0.95, interactive: false });
          // Make city detail interactive too
          cdetail.mapPolygons.template.set("interactive", true);
          cdetail.mapPolygons.template.set("tooltipText", "{name}");
          cdetail.mapPolygons.template.events.on("click", (ev) => {
            const target = ev.target;
            const di = target.dataItem as am5.DataItem<am5map.IMapPolygonSeriesDataItem> | null;
            if (!di) return;
            try { (cdetail as am5map.MapPolygonSeries).zoomToDataItem(di); } catch {}
            highlightCityPolygon(target);
            const geom = (di.dataContext as any)?.geometry || (di.get("geometry") as any);
            const c = getGeomCenter(geom);
            if (c) spawnRipple(c[0], c[1]);
          });
        } else {
          cdetail.setAll({ geoJSON: filtered as any });
        }
        cdetail.set("visible", true);
        chart.series.moveValue(cdetail, chart.series.length - 1);
      }
    } catch {}
  };

  // Programmatic focus
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !focusLatLng) return;
    chart.zoomToGeoPoint({ latitude: focusLatLng.lat, longitude: focusLatLng.lng }, 6, true);
  }, [focusLatLng]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#fff' }}>
      <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}
