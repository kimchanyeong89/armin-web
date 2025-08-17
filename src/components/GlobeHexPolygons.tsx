import { useEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
// Bundle local countries GeoJSON via Vite
// eslint-disable-next-line import/no-relative-packages
import countriesUrl from '../../world.geo.json-master/countries.geo.json?url';
import type { Exhibition } from '../types/Exhibition';

type Props = {
  exhibitions: Exhibition[];
  onSelectExhibition?: (ex: Exhibition) => void;
  focusTarget?: Exhibition | null;
};

export default function GlobeHexPolygons({ exhibitions, onSelectExhibition, focusTarget }: Props) {
  const globeRef = useRef<GlobeMethods | null>(null);
  const [width, setWidth] = useState<number>(window.innerWidth);
  const [height, setHeight] = useState<number>(window.innerHeight);
  // countries features for hexed polygons layer
  const [countries, setCountries] = useState<any[]>([]);
  // hover state for a hexed polygon (per-country/group)
  const [hoverHex, setHoverHex] = useState<any | null>(null);

  useEffect(() => {
    const onResize = () => {
      setWidth(window.innerWidth);
      setHeight(window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(countriesUrl);
        const gj = await res.json();
        if (!active) return;
  const feats = (gj.features || []).filter((f: any) => f?.properties?.ISO_A2 !== 'AQ' && f?.id !== 'ATA');
  setCountries(feats);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Failed to load countries for hex polygons', e);
      }
    })();
    return () => { active = false; };
  }, []);

  // Smooth fly to selected exhibition
  useEffect(() => {
    if (!focusTarget || !globeRef.current) return;
    globeRef.current.pointOfView({ lat: focusTarget.latitude, lng: focusTarget.longitude, altitude: 2.0 }, 1200);
  }, [focusTarget]);

  const globeMaterial = useMemo(() => new THREE.MeshPhongMaterial({
    color: new THREE.Color('#0b1020'),
    emissive: new THREE.Color('#0b1020'),
    shininess: 5,
    flatShading: false
  }), []);

  const points = useMemo(() => exhibitions.map(ex => ({
    id: ex.id,
    name: ex.name,
    lat: ex.latitude,
    lng: ex.longitude,
  })), [exhibitions]);
  // Hexed polygons color: match example's random 24-bit hex style, but seeded per country for stability.
  const hexColor = useMemo(() => {
    const cache = new WeakMap<object, string>();
    const hash = (s: string) => {
      // FNV-1a 32-bit
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    };
    const mulberry32 = (seed: number) => {
      return () => {
        let t = (seed += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    return (feat: any) => {
      if (cache.has(feat)) return cache.get(feat)!;
      const key = feat?.id || feat?.properties?.ISO_A3 || feat?.properties?.ISO_A2 || feat?.properties?.name || JSON.stringify(feat?.properties || {});
      const rnd = mulberry32(hash(String(key)))();
      const colorNum = Math.floor(rnd * Math.pow(2, 24));
      const hex = `#${colorNum.toString(16).padStart(6, '0')}`;
      cache.set(feat, hex);
      return hex;
    };
  }, []);

  // No per-hex generation needed when using the built-in hexed polygons layer

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Globe
        ref={globeRef as any}
        width={width}
        height={height}
        backgroundColor={'#000000'}
        showAtmosphere={true}
        atmosphereColor="lightskyblue"
        atmosphereAltitude={0.12}
        globeMaterial={globeMaterial as any}
        globeImageUrl={"//unpkg.com/three-globe/example/img/earth-dark.jpg"}
        bumpImageUrl={"//unpkg.com/three-globe/example/img/earth-topology.png"}
  // Hexed polygons: group hover lifts all hexes in the polygon
  hexPolygonsData={countries}
  hexPolygonGeoJsonGeometry={(d: any) => d.geometry}
  hexPolygonResolution={3}
  hexPolygonMargin={0.3}
  hexPolygonUseDots={false}
  hexPolygonAltitude={(d: any) => (d === hoverHex ? 0.02 : 0.001)}
  hexPolygonColor={hexColor as any}
  onHexPolygonHover={(d: any) => setHoverHex(d)}
  hexPolygonsTransitionDuration={300}
        // Exhibitions as labels with dots
        labelsData={points}
        labelLat={(d: any) => d.lat}
        labelLng={(d: any) => d.lng}
        labelText={(d: any) => d.name}
        labelColor={() => 'rgba(255,255,255,0.9)'}
        labelSize={1.4}
        labelDotRadius={0.45}
        labelAltitude={0.022}
        onLabelClick={(d: any) => {
          const found = exhibitions.find(e => e.id === d.id);
          if (found && onSelectExhibition) onSelectExhibition(found);
        }}
        waitForGlobeReady
        animateIn
      />
    </div>
  );
}
