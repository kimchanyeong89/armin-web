import * as am5 from "@amcharts/amcharts5";
import * as am5map from "@amcharts/amcharts5/map";
import am5geodata_worldLow from "@amcharts/amcharts5-geodata/worldLow";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";
import { useEffect, useRef, useState } from "react";
import type { Exhibition } from "../types/Exhibition";

type WorldMapProps = {
  onSelectExhibition: (exhibition: any) => void;
  exhibitions: Exhibition[];  // Expect exhibitions data as a prop
};

function WorldMap({ onSelectExhibition, exhibitions }: WorldMapProps) {
  const chartRef = useRef<am5map.MapChart | null>(null);
  const rootRef = useRef<am5.Root | null>(null);
  const polygonSeriesRef = useRef<am5map.MapPolygonSeries | null>(null);
  const [isGlobe, setIsGlobe] = useState(true);

  useEffect(() => {
    const root = am5.Root.new("chartdiv");
    rootRef.current = root;
    root.setThemes([am5themes_Animated.new(root)]);

    const chart = root.container.children.push(
      am5map.MapChart.new(root, {
        panX: "rotateX",
        panY: "rotateY",
        wheelY: "zoom",
        projection: am5map.geoOrthographic()
      })
    );
    chartRef.current = chart;

    // Removed pointerup event that forcibly resets rotationY on pointer release.

    const polygonSeries = chart.series.push(
      am5map.MapPolygonSeries.new(root, {
        geoJSON: am5geodata_worldLow
      })
    );
    polygonSeriesRef.current = polygonSeries;

    polygonSeries.mapPolygons.template.setAll({
      tooltipText: "{name}",
      interactive: true
    });

    polygonSeries.mapPolygons.template.states.create("hover", {
      fill: am5.color(0xffd700)
    });

    // Removed country click event handler to disable clicking functionality on the map.

    chart.children.push(am5map.ZoomControl.new(root, {}));

    const pointSeries = chart.series.push(
      am5map.MapPointSeries.new(root, {
        latitudeField: "latitude",
        longitudeField: "longitude",
        valueField: "value"
      })
    );

    pointSeries.bullets.push((root) => {
      const container = am5.Container.new(root, {});
      const pin = am5.Picture.new(root, {
        width: 24,
        height: 24,
        centerX: am5.p50,
        centerY: am5.p100,
        y: 0,
        x: 0,
        src: "/images/pin.png",
        tooltipText: "{name}",
        cursorOverStyle: "pointer"
      });

      container.children.push(pin);

      pin.events.on("click", (ev) => {
        const dataItem = ev.target.dataItem;
        if (dataItem) {
          onSelectExhibition(dataItem.dataContext);
        }
      });

      return am5.Bullet.new(root, { sprite: container });
    });


    pointSeries.data.setAll(exhibitions);

    return () => {
      root.dispose();
    };
  }, [onSelectExhibition, exhibitions]);

  const toggleProjection = () => {
    if (!chartRef.current) return;
    chartRef.current.set("rotationX", 0);
    chartRef.current.set("rotationY", 0);
    chartRef.current.set("zoomLevel", 1);
    chartRef.current.chartContainer.set("x", 0);
    chartRef.current.chartContainer.set("y", 0);

    if (isGlobe) {
      chartRef.current.set("projection", am5map.geoMercator());
      chartRef.current.set("panX", "translateX");
      chartRef.current.set("panY", "translateY");
      setIsGlobe(false);
    } else {
      chartRef.current.set("projection", am5map.geoOrthographic());
      chartRef.current.set("panX", "rotateX");
      chartRef.current.set("panY", "rotateY");
      setIsGlobe(true);
    }
  };

  const resetGlobeCenter = () => {
    if (!chartRef.current) return;
    chartRef.current.set("rotationX", 0);
    chartRef.current.set("rotationY", 0);
    chartRef.current.set("zoomLevel", 1);
    chartRef.current.chartContainer.set("x", 0);
    chartRef.current.chartContainer.set("y", 0);
    if (typeof chartRef.current.goHome === "function") {
      chartRef.current.goHome();
    }
  };

  return (
    <div style={{ width: "100vw", overflowX: "hidden", position: "relative" }}>
      <div style={{ width: "100%", position: "relative" }}>
        <div id="chartdiv" style={{ width: "100%", height: "400px" }}></div>

        {isGlobe && (
          <button
            onClick={resetGlobeCenter}
            style={{
              position: "absolute",
              bottom: "50px",
              left: "50%",
              transform: "translateX(-50%)",
              padding: "6px 12px",
              backgroundColor: "rgba(51, 51, 51, 0.7)",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            중앙으로 가기
          </button>
        )}
        <button
          onClick={toggleProjection}
          style={{
            position: "absolute",
            bottom: "10px",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "6px 12px",
            backgroundColor: "rgba(51, 51, 51, 0.7)",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer"
          }}
        >
          {isGlobe ? "평면 지도 보기" : "지구본 보기"}
        </button>
      </div>

      <div
        style={{
          width: "100%",
          height: "100px",
          backgroundColor: "#f5f5f5",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box"
        }}
      >
        <span>광고 자리 (가로 배너)</span>
      </div>
    </div>
  );
}

export default WorldMap;