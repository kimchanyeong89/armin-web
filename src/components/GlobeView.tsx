import { useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import type { Exhibition } from "../types/Exhibition";

type GlobeViewProps = {
  exhibitions: Exhibition[];
  onSelectExhibition?: (ex: Exhibition) => void;
};

export default function GlobeView({ exhibitions, onSelectExhibition }: GlobeViewProps) {
  const globeRef = useRef<any>(null);
  const [width, setWidth] = useState<number>(window.innerWidth);
  const [height, setHeight] = useState<number>(window.innerHeight);

  useEffect(() => {
    const onResize = () => {
      setWidth(window.innerWidth);
      setHeight(window.innerHeight);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const points = useMemo(() => exhibitions.map(ex => ({
    id: ex.id,
    name: ex.name,
    lat: ex.latitude,
    lng: ex.longitude,
  })), [exhibitions]);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Globe
        ref={globeRef as any}
        width={width}
        height={height}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        pointsData={points}
        pointLat={(d: any) => d.lat}
        pointLng={(d: any) => d.lng}
        pointAltitude={() => 0.02}
        pointRadius={0.6}
        pointColor={() => "#d97706"}
        pointLabel={(d: any) => d.name}
        onPointClick={(d: any) => {
          const found = exhibitions.find(e => e.id === d.id);
          if (found && onSelectExhibition) onSelectExhibition(found);
        }}
      />
    </div>
  );
}
