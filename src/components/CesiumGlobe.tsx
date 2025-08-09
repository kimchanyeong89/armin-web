import { useEffect, useMemo, useRef } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { Exhibition } from "../types/Exhibition";

// Requires: VITE_GOOGLE_MAPS_API_KEY in env
type Props = {
  exhibitions: Exhibition[];
  onSelectExhibition?: (ex: Exhibition) => void;
  focusTarget?: Exhibition | null;
};

export default function CesiumGlobe({ exhibitions, onSelectExhibition, focusTarget }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const tilesetRef = useRef<Cesium.Cesium3DTileset | null>(null);

  const points = useMemo(() => exhibitions.map(ex => ({
    id: ex.id,
    name: ex.name,
    lat: ex.latitude,
    lng: ex.longitude,
  })), [exhibitions]);

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;
  // Don't mutate Cesium namespace; we'll pass the API key via the tileset URL

    const viewer = new Cesium.Viewer(containerRef.current, {
      terrain: Cesium.Terrain.fromWorldTerrain(),
      timeline: false,
      animation: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      infoBox: false,
      selectionIndicator: false,
      fullscreenButton: false,
    });
    viewer.scene.globe.depthTestAgainstTerrain = false;
    viewerRef.current = viewer;

    // Load Google Photorealistic 3D Tiles
    (async () => {
      try {
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
        const url = apiKey
          ? `https://tile.googleapis.com/v1/3dtiles/root.json?key=${apiKey}`
          : "https://tile.googleapis.com/v1/3dtiles/root.json";
        const tileset = await Cesium.Cesium3DTileset.fromUrl(url);
        tilesetRef.current = tileset;
        viewer.scene.primitives.add(tileset);
      } catch (e) {
        // ignore load failure to keep globe usable
        // eslint-disable-next-line no-console
        console.warn("Failed to load Google 3D Tiles:", e);
      }
    })();

    // Click handler
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(movement.position);
      if (picked && (picked as any).id && (picked as any).id.properties?.exId) {
        const exId = (picked as any).id.properties.exId.getValue(Cesium.JulianDate.now());
        const found = exhibitions.find(e => e.id === exId);
        if (found && onSelectExhibition) onSelectExhibition(found);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  // Sync exhibition points
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const ds = new Cesium.CustomDataSource("exhibitions");
    points.forEach(p => {
      const entity = new Cesium.Entity({
        position: Cesium.Cartesian3.fromDegrees(p.lng, p.lat, 1000),
        point: new Cesium.PointGraphics({
          color: Cesium.Color.fromCssColorString("#d97706"),
          pixelSize: 10,
          outlineWidth: 2,
          outlineColor: Cesium.Color.BLACK,
        }),
        label: new Cesium.LabelGraphics({
          text: p.name,
          font: "12px sans-serif",
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          pixelOffset: new Cesium.Cartesian2(0, -14),
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString("rgba(0,0,0,0.5)"),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2_000_000),
        }),
        properties: new Cesium.PropertyBag({ exId: p.id }),
      });
      ds.entities.add(entity);
    });

    // Replace old datasource if exists
    const prev = viewer.dataSources.getByName("exhibitions")[0];
    if (prev) viewer.dataSources.remove(prev, true);
    viewer.dataSources.add(ds);
  }, [points]);

  // Initial fly to
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || exhibitions.length === 0) return;
    const avgLat = exhibitions.reduce((s, e) => s + e.latitude, 0) / exhibitions.length;
    const avgLng = exhibitions.reduce((s, e) => s + e.longitude, 0) / exhibitions.length;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(avgLng, avgLat, 2.5e7),
      duration: 1.5,
    });
  }, [exhibitions]);

  // External focus command: fly to exhibition and open details
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !focusTarget) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(focusTarget.longitude, focusTarget.latitude, 2.0e6),
      duration: 1.2,
      complete: () => {
        if (onSelectExhibition) onSelectExhibition(focusTarget);
      },
    });
  }, [focusTarget]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}
