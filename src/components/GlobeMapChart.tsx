import React, { useEffect } from 'react';
import * as am5 from '@amcharts/amcharts5';
import * as am5map from '@amcharts/amcharts5/map';
import am5geodata_worldLow from "@amcharts/amcharts5-geodata/worldLow";

const GlobeMapChart: React.FC = () => {
  useEffect(() => {
    const root = am5.Root.new('globeDiv');

    const chart = root.container.children.push(
      am5map.MapChart.new(root, {
        projection: am5map.geoOrthographic(),
        panX: 'rotateX',
        panY: 'rotateY',
        wheelX: "none",
        wheelY: "zoom"
      })
    );

    chart.series.push(
      am5map.MapPolygonSeries.new(root, {
        geoJSON: am5geodata_worldLow
      })
    );

    // 초기 rotation (중앙 고정)
    chart.set("rotationX", 0);
    chart.set("rotationY", 0);
    chart.set("zoomLevel", 1);

    return () => {
      root.dispose();
    };
  }, []);

  return <div id="globeDiv" style={{ width: '100%', height: '100%' }}></div>;
};

export default GlobeMapChart;