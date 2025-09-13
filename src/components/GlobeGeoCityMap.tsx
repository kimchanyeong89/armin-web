import { useEffect, useRef } from 'react';
import * as am5 from "@amcharts/amcharts5";
import * as am5map from "@amcharts/amcharts5/map";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";
import { feature } from "topojson-client";

type Props = { focusLatLng?: { lat: number; lng: number } | null };

// A globe built purely from geodata: world country boundaries + city (urban area) boundaries
export default function GlobeGeoCityMap({ focusLatLng = null }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<am5.Root | null>(null);
  const chartRef = useRef<am5map.MapChart | null>(null);
  const worldRef = useRef<am5map.MapPolygonSeries | null>(null);
  const admin1Ref = useRef<am5map.MapPolygonSeries | null>(null);
  const urbanRef = useRef<am5map.MapPolygonSeries | null>(null);
  const municipalRef = useRef<am5map.MapPolygonSeries | null>(null);

  // Fetch municipal boundaries from GeoBoundaries API
  const fetchMunicipalGeo = async (iso2: string) => {
    const tryLevels = ["ADM3", "ADM2", "ADM4"]; // try common municipal levels
    for (const level of tryLevels) {
      try {
        const url = `https://www.geoboundaries.org/gbRequest.html?ISO=${encodeURIComponent(iso2)}&ADM=${encodeURIComponent(level)}`;
        const resp = await fetch(url, { mode: 'cors' });
        if (!resp.ok) continue;
        const data = await resp.json();
        const item = Array.isArray(data) ? (data[0] || null) : data;
        const gj = item?.gjDownloadURL || item?.gjDownloadUrl || item?.geojson || item?.downloadURL || null;
        if (gj && typeof gj === 'string') {
          const gjResp = await fetch(gj, { mode: 'cors' });
          if (!gjResp.ok) continue;
          const gjData = await gjResp.json();
          return { level, geojson: gjData } as { level: string; geojson: any };
        }
      } catch (e) {
        // try next level
      }
    }
    return null;
  };

  useEffect(() => {
    if (!ref.current) return;
    const root = am5.Root.new(ref.current); rootRef.current = root;
    root.setThemes([am5themes_Animated.new(root)]);

    const chart = root.container.children.push(am5map.MapChart.new(root, {
      panX: "rotateX",
      panY: "rotateY",
      wheelX: "zoom",
      wheelY: "zoom",
      projection: am5map.geoOrthographic(),
      minZoomLevel: 0.8,
      maxZoomLevel: 20,
    }));
    chartRef.current = chart;

    // Background
    root._rootContainer.set('background', am5.Rectangle.new(root, { fill: am5.color(0xffffff), fillOpacity: 1 }));

    // Graticule (globe grid)
    const graticule = chart.series.push(am5map.GraticuleSeries.new(root, {}));
    graticule.mapLines.template.setAll({ stroke: am5.color(0x888888), strokeOpacity: 0.25 });

  // Countries from local TopoJSON
  const world = chart.series.push(am5map.MapPolygonSeries.new(root, {}));
    worldRef.current = world;
  // world polygons render in globe projection; no clipBack setting needed
    world.mapPolygons.template.setAll({
      fillOpacity: 0,
      stroke: am5.color(0x000000),
      strokeWidth: 1.0,
      strokeOpacity: 0.95,
      tooltipText: '{name}',
      interactive: true,
      cursorOverStyle: 'pointer' as any,
    });
    world.mapPolygons.template.states.create('hover', { strokeWidth: 1.4 });

    // Load countries TopoJSON -> GeoJSON
    (async () => {
      try {
        const res = await fetch('/atlas/countries-110m.json');
        if (!res.ok) return;
        const topo = await res.json();
        // Attempt to detect objects: 'countries' or first object
        const objName = Object.keys(topo.objects || {})[0];
        const gj = feature(topo, topo.objects[objName]);
        // Remove Antarctica if present
        const fc = { type: 'FeatureCollection', features: (gj as any).features.filter((f: any) => f.id !== 'AQ' && f.properties?.name !== 'Antarctica') };
        world.setAll({ geoJSON: fc as any });
      } catch (err) {
        console.error('Failed to load countries-110m.json', err);
      }
    })();

    // Country click -> fetch municipal boundaries and overlay
    world.mapPolygons.template.events.on('click', async (ev) => {
      const di = ev.target.dataItem as am5.DataItem<am5map.IMapPolygonSeriesDataItem> | null; if (!di) return;
      const dc: any = di.dataContext || {};
      const iso2: string | undefined = dc.id || dc.iso2 || dc.isoCode;
      try { world.zoomToDataItem(di); } catch {}
      if (!iso2) return;

      // Load municipal boundaries from GeoBoundaries
      const muni = await fetchMunicipalGeo(iso2);
      if (muni && muni.geojson) {
        let muniSeries = municipalRef.current; const root = rootRef.current; const chart = chartRef.current;
        if (root && chart) {
          if (!muniSeries) {
            muniSeries = chart.series.push(am5map.MapPolygonSeries.new(root, { geoJSON: muni.geojson as any }));
            municipalRef.current = muniSeries;
            muniSeries.mapPolygons.template.setAll({
              fillOpacity: 0,
              stroke: am5.color(0x000000),
              strokeWidth: 0.8,
              strokeOpacity: 0.85,
              tooltipText: '{name}',
              interactive: true,
            });
            muniSeries.mapPolygons.template.states.create('hover', { strokeWidth: 1.1 });
          } else {
            muniSeries.setAll({ geoJSON: muni.geojson as any });
          }
          // Hide dashed urban layer when true municipal boundaries are available
          urbanRef.current?.set('visible', false);
          muniSeries.set('visible', true);
          chart.series.moveValue(muniSeries, chart.series.length - 1);
        }
      } else {
        // Fallback: keep showing urban/admin1 layers
        municipalRef.current?.set('visible', false);
        urbanRef.current?.set('visible', true);
      }
    });

    // Zoom control (bottom-right)
    const zoomControl = am5map.ZoomControl.new(root, {});
    chart.set('zoomControl', zoomControl);
    zoomControl.setAll({ x: am5.p100, centerX: am5.p100, y: am5.p100, centerY: am5.p100, dx: -12, dy: -12 });

    // Home button (top-left)
    const home = chart.children.push(am5.Button.new(root, { dx: 12, dy: 12, centerX: am5.p0, centerY: am5.p0, tooltipText: 'Reset', themeTags: ['zoom'] }));
    home.get('background')?.setAll({ fill: am5.color(0xffffff), stroke: am5.color(0x000000) });
    (home as any).children.push(am5.Label.new(root, { text: 'Home', fill: am5.color(0x000000) }));
  home.events.on('click', () => { chart.goHome(); municipalRef.current?.set('visible', false); urbanRef.current?.set('visible', true); });

    // Load and add urban areas (city boundaries)
    (async () => {
      try {
        const res = await fetch('/atlas/urban-areas.json');
        if (!res.ok) return;
        const geo = await res.json();
        const urban = chart.series.push(am5map.MapPolygonSeries.new(root, { geoJSON: geo as any }));
        urbanRef.current = urban;
  // urban polygons render in globe projection; no clipBack setting needed
        urban.mapPolygons.template.setAll({
          fillOpacity: 0,
          stroke: am5.color(0x000000),
          strokeWidth: 0.8,
          strokeOpacity: 0.8,
          // visually distinguish city boundaries
          strokeDasharray: [4, 3] as any,
          tooltipText: '{name}',
          interactive: true,
          cursorOverStyle: 'pointer' as any,
        });
        urban.mapPolygons.template.states.create('hover', { strokeWidth: 1.2 });
        // Bring urban lines on top
        chart.series.moveValue(urban, chart.series.length - 1);

        // Optionally replace with precise municipal boundaries if available
        try {
          const resCity = await fetch('/atlas/cities-admin.json');
          if (resCity.ok) {
            const muni = await resCity.json();
            urban.setAll({ geoJSON: muni as any });
            urban.mapPolygons.template.setAll({
              // solid line for exact admin boundaries
              strokeDasharray: undefined as any,
              strokeWidth: 0.9,
              strokeOpacity: 0.9,
            });
          }
        } catch {
          // ignore if not present
        }
      } catch (err) {
        console.error('Failed to load urban areas', err);
      }
    })();

  // Load and add Admin-1 (states/provinces) to partition countries from TopoJSON
    ;(async () => {
      try {
    const res = await fetch('/atlas/states-10m.json');
        if (!res.ok) return;
    const topo = await res.json();
    const objName = Object.keys(topo.objects || {})[0];
    const gj = feature(topo, topo.objects[objName]);
    const admin1 = chart.series.push(am5map.MapPolygonSeries.new(root, { geoJSON: gj as any }));
        admin1Ref.current = admin1;
        admin1.mapPolygons.template.setAll({
          fillOpacity: 0,
          stroke: am5.color(0x000000),
          strokeWidth: 0.6,
          strokeOpacity: 0.6,
          tooltipText: '{name}',
          interactive: true,
        });
        admin1.mapPolygons.template.states.create('hover', { strokeWidth: 0.9, strokeOpacity: 0.9 });
  // Keep below urban lines: insert just before last (urban comes last)
  chart.series.moveValue(admin1, Math.max(0, chart.series.length - 1));
      } catch (err) {
        console.error('Failed to load Admin-1 states', err);
      }
    })();

    return () => {
      root.dispose();
      rootRef.current = null;
      chartRef.current = null;
      worldRef.current = null;
  admin1Ref.current = null;
      urbanRef.current = null;
  municipalRef.current = null;
    };
  }, []);

  // Optional: focus to a lat/lng
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !focusLatLng) return;
    chart.zoomToGeoPoint({ latitude: focusLatLng.lat, longitude: focusLatLng.lng }, chart.get('zoomLevel') || 1.2, true);
  }, [focusLatLng]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#fff' }}>
      <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}
