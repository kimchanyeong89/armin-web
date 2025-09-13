import { useEffect, useRef } from 'react';
import * as am5 from "@amcharts/amcharts5";
import * as am5map from "@amcharts/amcharts5/map";
import am5themes_Dark from "@amcharts/amcharts5/themes/Dark";

type Props = {
  focusLatLng?: { lat: number; lng: number } | null;
};

export default function AmChartsGlobeMap({ focusLatLng = null }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<am5.Root | null>(null);
  const chartInstanceRef = useRef<am5map.MapChart | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    console.log('Initializing AmCharts globe...');

    // Create root element
    const root = am5.Root.new(chartRef.current);
    rootRef.current = root;

    // Set themes
    root.setThemes([am5themes_Dark.new(root)]);

    // Create the map chart
    const chart = root.container.children.push(
      am5map.MapChart.new(root, {
        panX: "rotateX",
        panY: "rotateY",
        projection: am5map.geoOrthographic(),
        paddingBottom: 20,
        paddingTop: 20,
        paddingLeft: 20,
        paddingRight: 20
      })
    );
    chartInstanceRef.current = chart;

    // Create main polygon series for countries
    const polygonSeries = chart.series.push(
      am5map.MapPolygonSeries.new(root, {})
    );

    // Load world data
    const loadWorldData = async () => {
      try {
        const response = await fetch('/atlas/ne_110m_admin_0_countries.geojson');
        const worldData = await response.json();
        polygonSeries.set("geoJSON", worldData);
        console.log('World data loaded for AmCharts');
      } catch (error) {
        console.error('Failed to load world data:', error);
      }
    };

    loadWorldData();

    // Configure country polygons
    polygonSeries.mapPolygons.template.setAll({
      tooltipText: "{name}",
      toggleKey: "active",
      interactive: true,
      fill: am5.color("#666666"),
      stroke: am5.color("#ffffff"),
      strokeWidth: 1
    });

    // Set up country interactions
    polygonSeries.mapPolygons.template.states.create("hover", {
      fill: am5.color("#999999")
    });

    polygonSeries.mapPolygons.template.states.create("active", {
      fill: am5.color("#ff6666")
    });

    // Add click functionality for countries
    polygonSeries.mapPolygons.template.events.on("click", function(ev) {
      const polygon = ev.target;
      const dataContext = polygon.dataItem?.dataContext as any;
      
      if (dataContext && dataContext.properties) {
        const countryName = dataContext.properties.ADMIN || dataContext.properties.NAME;
        console.log("Country clicked:", countryName);
        
        // Simple zoom to clicked area
        chart.zoomIn();
      }
    });

    // Create graticule series (grid lines)
    const graticuleSeries = chart.series.push(
      am5map.GraticuleSeries.new(root, {})
    );

    graticuleSeries.mapLines.template.setAll({
      stroke: am5.color("#333333"),
      strokeWidth: 0.5,
      strokeOpacity: 0.5
    });

    // Create background series for ocean
    const backgroundSeries = chart.series.push(
      am5map.MapPolygonSeries.new(root, {})
    );

    backgroundSeries.mapPolygons.template.setAll({
      fill: am5.color("#000000"),
      fillOpacity: 1,
      stroke: am5.color("#333333"),
      strokeWidth: 1
    });

    backgroundSeries.data.push({
      geometry: am5map.getGeoRectangle(90, 180, -90, -180)
    });

    // Enable map interaction
    chart.chartContainer.get("background")?.setAll({
      fill: am5.color("#000000"),
      fillOpacity: 1
    });

    // Set initial rotation
    chart.set("rotationX", 0);
    chart.set("rotationY", 0);

    console.log('AmCharts globe initialized successfully');

    // Cleanup function
    return () => {
      console.log('Disposing AmCharts globe...');
      if (rootRef.current) {
        rootRef.current.dispose();
        rootRef.current = null;
        chartInstanceRef.current = null;
      }
    };
  }, []);

  // Handle focus changes
  useEffect(() => {
    if (!chartInstanceRef.current || !focusLatLng) return;
    
    console.log('Focusing to:', focusLatLng);
    chartInstanceRef.current.zoomToGeoPoint({
      longitude: focusLatLng.lng,
      latitude: focusLatLng.lat
    }, 2);
  }, [focusLatLng]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={chartRef}
        style={{
          width: '800px',
          height: '600px',
          margin: '0 auto',
          border: '1px solid #333',
          borderRadius: '8px',
          overflow: 'hidden'
        }}
      />
      
      {/* Reset button */}
      <button
        onClick={() => {
          if (chartInstanceRef.current) {
            chartInstanceRef.current.goHome();
          }
        }}
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          padding: '10px 20px',
          backgroundColor: '#333',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
          fontSize: '14px',
          zIndex: 1000
        }}
      >
        Reset Globe
      </button>
    </div>
  );
}
