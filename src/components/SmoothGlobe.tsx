import React, { useEffect, useRef, useState, useMemo } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import type { Exhibition } from '../types/Exhibition';

interface SmoothGlobeProps {
    exhibitions: Exhibition[];
    onSelectExhibition: (exhibition: Exhibition | null) => void;
}

const SmoothGlobe: React.FC<SmoothGlobeProps> = ({ exhibitions, onSelectExhibition }) => {
    const globeEl = useRef<GlobeMethods | undefined>(undefined);
    const [hoveredExhibition, setHoveredExhibition] = useState<Exhibition | null>(null);

    // Prepare data for the globe
    // We filter out exhibitions without valid coordinates
    const pointsData = useMemo(() => {
        return exhibitions.filter(ex =>
            typeof ex.latitude === 'number' &&
            typeof ex.longitude === 'number'
        );
    }, [exhibitions]);

    useEffect(() => {
        // Auto-rotation disabled per user request
        if (globeEl.current) {
            globeEl.current.controls().autoRotate = false;
            globeEl.current.controls().autoRotateSpeed = 0.5;

            // Set initial view distance
            globeEl.current.pointOfView({ altitude: 2.0 }, 1000);
        }
    }, []);

    return (
        <div style={{ width: '100vw', height: '100vh', background: '#000011' }}>
            <Globe
                ref={globeEl}
                globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
                bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
                backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"

                pointsData={pointsData}
                pointLat="latitude"
                pointLng="longitude"
                pointColor={() => '#ffcc00'}
                pointAltitude={0.1}
                pointRadius={0.5}
                pointResolution={12} // Higher quality points

                // Label logic (optional, for hover)
                labelsData={pointsData}
                labelLat="latitude"
                labelLng="longitude"
                labelText="name"
                labelSize={1.5}
                labelDotRadius={0.5}
                labelColor={() => 'rgba(255, 255, 255, 0.75)'}
                labelResolution={2}
                labelAltitude={0.1}

                // Interactions
                onPointClick={(point) => {
                    onSelectExhibition(point as Exhibition);
                    // Optional: Fly to the point
                    globeEl.current?.pointOfView({
                        lat: (point as Exhibition).latitude,
                        lng: (point as Exhibition).longitude,
                        altitude: 0.6
                    }, 1500);
                }}
                onPointHover={(point) => {
                    setHoveredExhibition((point as Exhibition) || null);
                    document.body.style.cursor = point ? 'pointer' : 'default';
                }}

                // Atmosphere
                atmosphereColor="#3a228a"
                atmosphereAltitude={0.15}
            />

            {/* Optional Hover Tooltip */}
            {hoveredExhibition && (
                <div style={{
                    position: 'absolute',
                    top: '20%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: 'rgba(0,0,0,0.8)',
                    color: '#fff',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    pointerEvents: 'none',
                    zIndex: 1000
                }}>
                    <strong>{hoveredExhibition.name}</strong><br />
                    {hoveredExhibition.location}
                </div>
            )}
        </div>
    );
};

export default SmoothGlobe;
