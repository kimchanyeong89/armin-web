import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Props = {
  focusLatLng?: { lat: number; lng: number } | null;
};

export default function LeafletInteractiveMap({ focusLatLng = null }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    console.log('Initializing Leaflet map...');

    // Create map
    const map = L.map(mapRef.current, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 10,
      worldCopyJump: true,
      zoomControl: true
    });

    mapInstanceRef.current = map;

    // Add dark tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);

    // Load country boundaries
    const loadCountryData = async () => {
      try {
        console.log('Loading country data...');
        const response = await fetch('/atlas/ne_110m_admin_0_countries.geojson');
        const countryData = await response.json();

        const countryLayer = L.geoJSON(countryData, {
          style: {
            fillColor: '#666666',
            weight: 1,
            opacity: 1,
            color: '#ffffff',
            fillOpacity: 0.7
          },
          onEachFeature: (feature, layer) => {
            const countryName = feature.properties.ADMIN || feature.properties.NAME;
            
            layer.bindPopup(`<strong>${countryName}</strong>`);
            
            layer.on({
              mouseover: (e) => {
                const layer = e.target;
                layer.setStyle({
                  weight: 2,
                  fillOpacity: 0.9
                });
              },
              mouseout: (e) => {
                countryLayer.resetStyle(e.target);
              },
              click: () => {
                console.log('Country clicked:', countryName);
                setSelectedCountry(countryName);
                if ('getBounds' in layer) {
                  map.fitBounds((layer as any).getBounds());
                }
              }
            });
          }
        });

        countryLayer.addTo(map);
        console.log('Countries loaded');

        // Load urban areas
        const urbanResponse = await fetch('/atlas/ne_50m_urban_areas.geojson');
        const urbanData = await urbanResponse.json();

        // Filter for large urban areas only
        const largeUrbanAreas = {
          ...urbanData,
          features: urbanData.features.filter((feature: any) => {
            const areaSize = feature.properties?.area_sqkm || 0;
            return areaSize > 100;
          })
        };

        const urbanLayer = L.geoJSON(largeUrbanAreas, {
          style: {
            fillColor: 'none',
            weight: 1.5,
            opacity: 0.8,
            color: '#ff6666',
            fillOpacity: 0
          },
          onEachFeature: (feature, layer) => {
            const areaSize = feature.properties?.area_sqkm || 0;
            layer.bindPopup(`Urban Area: ${Math.round(areaSize)} sq km`);
          }
        });

        urbanLayer.addTo(map);
        console.log('Urban areas loaded:', largeUrbanAreas.features.length, 'large areas');

        setLoading(false);
      } catch (error) {
        console.error('Error loading map data:', error);
        setLoading(false);
      }
    };

    loadCountryData();

    // Cleanup
    return () => {
      console.log('Cleaning up Leaflet map...');
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Handle focus changes
  useEffect(() => {
    if (!mapInstanceRef.current || !focusLatLng) return;
    
    console.log('Focusing to:', focusLatLng);
    mapInstanceRef.current.setView([focusLatLng.lat, focusLatLng.lng], 6);
  }, [focusLatLng]);

  const resetView = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([20, 0], 2);
      setSelectedCountry(null);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {loading && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '20px',
            borderRadius: '5px',
            fontSize: '16px',
            zIndex: 1000
          }}
        >
          Loading interactive map...
        </div>
      )}
      
      <div
        ref={mapRef}
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
        onClick={resetView}
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
        Reset View
      </button>
      
      {/* Country info */}
      {selectedCountry && (
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '10px',
            borderRadius: '5px',
            fontSize: '14px',
            zIndex: 1000
          }}
        >
          Selected: {selectedCountry}
        </div>
      )}
    </div>
  );
}
