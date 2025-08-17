import { useEffect, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
// eslint-disable-next-line import/no-relative-packages
import countriesUrl from '../../world.geo.json-master/countries.geo.json?url';

type Props = {
  // Optional: initial POV targeting
  focusLatLng?: { lat: number; lng: number } | null;
};

export default function GlobeOutline({ focusLatLng }: Props) {
  const globeRef = useRef<GlobeMethods | null>(null);
  const [width, setWidth] = useState<number>(window.innerWidth);
  const [height, setHeight] = useState<number>(window.innerHeight);
  const [countries, setCountries] = useState<any[]>([]);

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
        console.warn('Failed to load countries for outline globe', e);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!focusLatLng || !globeRef.current) return;
    globeRef.current.pointOfView({ lat: focusLatLng.lat, lng: focusLatLng.lng, altitude: 2.0 }, 1200);
  }, [focusLatLng]);

  // Stroke color matching minimal line drawing style
  const strokeColor = '#2b3138';

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#ffffff' }}>
      <Globe
        ref={globeRef as any}
        width={width}
        height={height}
        backgroundColor={'#ffffff'}
        showAtmosphere={false}
  showGlobe={false}
        // Draw only strokes for country borders
        polygonsData={countries}
        polygonGeoJsonGeometry={(d: any) => d.geometry}
  polygonAltitude={0.01}
        polygonCapColor={() => 'rgba(0,0,0,0)'}
        polygonSideColor={() => 'rgba(0,0,0,0)'}
        polygonStrokeColor={strokeColor}
  polygonsTransitionDuration={0}
      />
    </div>
  );
}
