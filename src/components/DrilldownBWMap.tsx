import { useEffect, useRef } from 'react';
import * as am5 from "@amcharts/amcharts5";
import * as am5map from "@amcharts/amcharts5/map";
import am5geodata_worldLow from "@amcharts/amcharts5-geodata/worldLow";

type Props = {
  focusLatLng?: { lat: number; lng: number } | null;
};

// Simple black & white drillable map (country-level zoom on click)
export default function DrilldownBWMap({ focusLatLng = null }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<am5.Root | null>(null);
  const chartRef = useRef<am5map.MapChart | null>(null);
  const seriesRef = useRef<am5map.MapPolygonSeries | null>(null);
  const citySeriesRef = useRef<am5map.MapPolygonSeries | null>(null);
  const detailSeriesRef = useRef<am5map.MapPolygonSeries | null>(null);
  const cityDetailSeriesRef = useRef<am5map.MapPolygonSeries | null>(null);
  const urbanGeoRef = useRef<any | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const root = am5.Root.new(ref.current);
    rootRef.current = root;

    // Minimal theme: no animations, monochrome palette
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

  const polygonSeries = chart.series.push(
      am5map.MapPolygonSeries.new(root, {
        geoJSON: am5geodata_worldLow as any,
        exclude: ["AQ"],
      })
    );
    seriesRef.current = polygonSeries;

    polygonSeries.mapPolygons.template.setAll({
      stroke: am5.color(0x000000),
      fill: am5.color(0xffffff),
      strokeOpacity: 0.8,
      strokeWidth: 1,
      tooltipText: "{name}",
      interactive: true,
    });
    polygonSeries.mapPolygons.template.states.create("hover", {
      fill: am5.color(0xeeeeee),
    });
    polygonSeries.mapPolygons.template.states.create("active", {
      fill: am5.color(0xdddddd),
    });

    polygonSeries.mapPolygons.template.events.on("click", (e) => {
      const target = e.target;
  const dataItem = target.dataItem as am5.DataItem<am5map.IMapPolygonSeriesDataItem> | null;
      if (!dataItem) return;
      polygonSeries.mapPolygons.each(mp => mp.set("active", false));
      target.set("active", true);
  polygonSeries.zoomToDataItem(dataItem);
      // Try country detail load
      const ctx: any = dataItem.dataContext || {};
      const iso2: string | undefined = ctx.id || ctx.iso2 || ctx.isoCode;
      const COUNTRY_DETAIL: Record<string, string> = {
        GB: '/geodata/uk_level1.json',
      };
      const url = iso2 ? COUNTRY_DETAIL[iso2] : undefined;
      if (url) {
        loadCountryDetail(url);
      } else {
        // Fallback: just show global cities overlay
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
      themeTags: ["zoom"]
    }));
  homeBtn.get("background")?.setAll({ fill: am5.color(0xffffff), stroke: am5.color(0x000000) });
  // Add a label inside the button for text
  const label = am5.Label.new(root, { text: "Home", fill: am5.color(0x000000) });
  (homeBtn as any).children.push(label);
    homeBtn.events.on("click", () => {
      polygonSeries?.mapPolygons.each(mp => mp.set("active", false));
      chart.goHome();
  citySeriesRef.current?.set("visible", false);
  // Hide detail
  detailSeriesRef.current?.set("visible", false);
  cityDetailSeriesRef.current?.set("visible", false);
    });

    // Monochrome background
    root._rootContainer.set("background", am5.Rectangle.new(root, { fill: am5.color(0xffffff), fillOpacity: 1 }));

    return () => {
      root.dispose();
      rootRef.current = null;
      chartRef.current = null;
      seriesRef.current = null;
      citySeriesRef.current = null;
  detailSeriesRef.current = null;
  cityDetailSeriesRef.current = null;
  urbanGeoRef.current = null;
    };
  }, []);

  // Load and add city boundaries as a separate polygon series (invisible until drill)
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
          am5map.MapPolygonSeries.new(root, {
            geoJSON: geo as any,
          })
        );
        citySeriesRef.current = citySeries;
        citySeries.mapPolygons.template.setAll({
          fillOpacity: 0,
          stroke: am5.color(0x7c3aed),
          strokeWidth: 1.2,
          strokeOpacity: 0.9,
          tooltipText: "{name}",
          interactive: false,
        });
        citySeries.set("visible", false);
        // Put cities above countries
        chart.series.moveValue(citySeries, chart.series.length - 1);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Helpers to compute bbox of a GeoJSON FeatureCollection
  const computeBBox = (geo: any): [number, number, number, number] => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const pushCoord = (lng: number, lat: number) => {
      if (lng < minX) minX = lng; if (lng > maxX) maxX = lng;
      if (lat < minY) minY = lat; if (lat > maxY) maxY = lat;
    };
    const walk = (geom: any) => {
      if (!geom) return;
      if (geom.type === 'Polygon') {
        for (const ring of geom.coordinates) for (const [lng, lat] of ring) pushCoord(lng, lat);
      } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates) for (const ring of poly) for (const [lng, lat] of ring) pushCoord(lng, lat);
      }
    };
    if (geo.type === 'FeatureCollection') for (const f of geo.features) walk(f.geometry);
    else if (geo.type === 'Feature') walk(geo.geometry); else walk(geo);
    if (!isFinite(minX)) return [-180, -90, 180, 90];
    return [minX, minY, maxX, maxY];
  };

  const filterUrbanByBBox = (urban: any, bbox: [number, number, number, number]) => {
    const [minX, minY, maxX, maxY] = bbox;
    const keep = (geom: any): boolean => {
      if (!geom) return false;
      const testPoint = (lng: number, lat: number) => (lng >= minX && lng <= maxX && lat >= minY && lat <= maxY);
      if (geom.type === 'Polygon') {
        for (const ring of geom.coordinates) for (const [lng, lat] of ring) if (testPoint(lng, lat)) return true;
      } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates) for (const ring of poly) for (const [lng, lat] of ring) if (testPoint(lng, lat)) return true;
      }
      return false;
    };
    const features = (urban.features || []).filter((f: any) => keep(f.geometry));
    return { type: 'FeatureCollection', features };
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
          fill: am5.color(0xffffff),
          strokeOpacity: 0.9,
          strokeWidth: 1,
          tooltipText: "{name}",
          interactive: false,
        });
      } else {
        detail.setAll({ geoJSON: geo as any });
      }
      detail.set("visible", true);

      // Overlay urban areas filtered to country bbox
      const urban = urbanGeoRef.current;
      if (urban) {
        const bbox = computeBBox(geo);
        const filtered = filterUrbanByBBox(urban, bbox);
        let cdetail = cityDetailSeriesRef.current;
        if (!cdetail) {
          cdetail = chart.series.push(am5map.MapPolygonSeries.new(root, { geoJSON: filtered as any }));
          cityDetailSeriesRef.current = cdetail;
          cdetail.mapPolygons.template.setAll({ fillOpacity: 0, stroke: am5.color(0x7c3aed), strokeWidth: 1.6, strokeOpacity: 0.95, interactive: false });
        } else {
          cdetail.setAll({ geoJSON: filtered as any });
        }
        cdetail.set("visible", true);
        // Ensure overlay is on top
        chart.series.moveValue(cdetail, chart.series.length - 1);
      }
    } catch {}
  };

  // Focus programmatically
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
