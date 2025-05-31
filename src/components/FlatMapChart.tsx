import React, { useEffect } from 'react';
import * as am5 from '@amcharts/amcharts5';
import * as am5map from '@amcharts/amcharts5/map';
import am5geodata_worldLow from "@amcharts/amcharts5-geodata/worldLow";

const FlatMapChart: React.FC = () => {
  useEffect(() => {
    const root = am5.Root.new('flatDiv');

    const chart = root.container.children.push(
      am5map.MapChart.new(root, {
        projection: am5map.geoMercator(),
        panX: 'translateX',
        panY: 'translateY',
        wheelX: "none",
        wheelY: "zoom",
        maxZoomLevel: 10,
        minZoomLevel: 1
      })
    );

    const polygonSeries = am5map.MapPolygonSeries.new(root, {
      geoJSON: am5geodata_worldLow
    });

    // Tooltip 설정 추가
    polygonSeries.mapPolygons.template.set("tooltipText", "{name}");

    chart.series.push(polygonSeries);

    // 확대/축소 컨트롤 추가
    const zoomControl = am5map.ZoomControl.new(root, {});
    chart.set("zoomControl", zoomControl);

    chart.set("maxZoomLevel", 5);
    chart.set("minZoomLevel", 1);
    chart.set("pinchZoom", false);

    return () => {
      root.dispose();
    };
  }, []);

  return (
    <div id="flatDiv" style={{ width: '100%', height: '100%' }}></div>
  );
};

export default FlatMapChart;