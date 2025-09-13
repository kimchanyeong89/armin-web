import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

type Props = {
  focusLatLng?: { lat: number; lng: number } | null;
};

// Pure D3.js globe rendering from raw geodata - no external map tiles
export default function D3GeoGlobeMap({ focusLatLng = null }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [countries, setCountries] = useState<any>(null);
  const [states, setStates] = useState<any>(null);
  const [cities, setCities] = useState<any>(null);
  const [municipalBoundaries, setMunicipalBoundaries] = useState<any>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

    // Load data
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('Loading geodata files...');
        
        const [countriesResponse, statesResponse, citiesResponse, urbanAreasResponse] = await Promise.all([
          fetch('/atlas/ne_110m_admin_0_countries.geojson'),
          fetch('/atlas/ne_50m_admin_1_states_provinces.geojson'),
          fetch('/atlas/ne_50m_populated_places_simple.geojson'),
          fetch('/atlas/ne_50m_urban_areas.geojson')
        ]);

        // Check if all responses are ok
        if (!countriesResponse.ok) throw new Error('Failed to load countries');
        if (!statesResponse.ok) throw new Error('Failed to load states');
        if (!citiesResponse.ok) throw new Error('Failed to load cities');
        if (!urbanAreasResponse.ok) throw new Error('Failed to load urban areas');

        console.log('Parsing JSON data...');
        const countriesData = await countriesResponse.json();
        const statesData = await statesResponse.json();
        const citiesData = await citiesResponse.json();
  const urbanAreasData = await urbanAreasResponse.json();

        console.log('Setting state data...');
        setCountries(countriesData);
        setStates(statesData);
        setCities(urbanAreasData);
        try {
          (window as any).__UrbanAreas = urbanAreasData;
          window.dispatchEvent(new CustomEvent('urban-areas:loaded', { detail: { count: urbanAreasData.features?.length || 0 } }));
        } catch {}
        setLoading(false);

        console.log('Data loaded successfully:');
        console.log('- Countries:', countriesData.features?.length);
        console.log('- States/Provinces:', statesData.features?.length);
        console.log('- Cities:', citiesData.features?.length);
        console.log('- Urban Areas (boundaries):', urbanAreasData.features?.length);
      } catch (error) {
        console.error('Error loading data:', error);
        setError(`Failed to load map data: ${error}`);
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Municipal boundaries fetcher removed for now (performance/scope)

    // Reset globe view
  const resetGlobe = async () => {
    setSelectedCountry(null);
    setMunicipalBoundaries(null);
    setLoading(true);
    
    try {
      const urbanAreasResponse = await fetch('/atlas/ne_50m_urban_areas.geojson');
      const urbanAreasData = await urbanAreasResponse.json();
      setCities(urbanAreasData);
      try {
        (window as any).__UrbanAreas = urbanAreasData;
        window.dispatchEvent(new CustomEvent('urban-areas:loaded', { detail: { count: urbanAreasData.features?.length || 0 } }));
      } catch {}
      setLoading(false);
    } catch (error) {
      console.error('Error reloading urban areas:', error);
      setError('Failed to reload urban areas');
      setLoading(false);
    }
  };

  // D3 rendering
  useEffect(() => {
    if (!countries || !svgRef.current) {
      console.log('Waiting for data or SVG ref...', { countries: !!countries, svgRef: !!svgRef.current });
      return;
    }

    console.log('Starting D3 rendering...');
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 800;
    const height = 600;

    const projection = d3.geoOrthographic()
      .scale(250)
      .translate([width / 2, height / 2])
      .clipAngle(90);

    const path = d3.geoPath().projection(projection);

    // Drag behavior
    const drag = d3.drag()
      .on('drag', (event) => {
        const rotation = projection.rotate();
        projection.rotate([rotation[0] + event.dx * 0.5, rotation[1] - event.dy * 0.5]);
        svg.selectAll('path').attr('d', (d: any) => path(d) || '');
      });

    svg.call(drag as any);
    console.log('Drag behavior added');

    // Graticule (grid lines)
    const graticule = d3.geoGraticule();
    svg.append('path')
      .datum(graticule)
      .attr('class', 'graticule')
      .attr('d', path)
      .attr('fill', 'none')
      .attr('stroke', '#ddd')
      .attr('stroke-width', 0.5);
    console.log('Graticule added');

    // Ocean
    svg.append('circle')
      .attr('cx', width / 2)
      .attr('cy', height / 2)
      .attr('r', projection.scale())
      .attr('fill', '#000')
      .attr('stroke', '#333')
      .attr('stroke-width', 1);
    console.log('Ocean added');

    // Countries
    console.log('Adding countries...', countries.features?.length);
    svg.selectAll('.country')
      .data(countries.features)
      .enter()
      .append('path')
      .attr('class', 'country')
      .attr('d', (d: any) => path(d) || '')
      .attr('fill', '#ccc')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('click', async (_event: any, d: any) => {
        console.log('Country clicked:', d.properties.ADMIN);
        // Country click logic here...
      });
    console.log('Countries added');

    console.log('D3 rendering complete');
  }, [countries, states, cities, municipalBoundaries]);

  // Handle focus changes
  useEffect(() => {
    if (!focusLatLng || !svgRef.current) return;
    
    const svg = d3.select(svgRef.current);
    const width = 800;
    const height = 600;
    
    // Rotate globe to focus point
    const projection = d3.geoOrthographic()
      .scale(250)
      .translate([width / 2, height / 2])
      .rotate([-focusLatLng.lng, -focusLatLng.lat])
      .clipAngle(90);

    const path = d3.geoPath().projection(projection);
    
    // Redraw all paths
    svg.selectAll('path').attr('d', (d: any) => path(d) || '');
  }, [focusLatLng]);

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
          Loading globe data...
        </div>
      )}
      
      {error && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(255, 0, 0, 0.8)',
            color: 'white',
            padding: '20px',
            borderRadius: '5px',
            fontSize: '16px',
            zIndex: 1000
          }}
        >
          Error: {error}
        </div>
      )}
      
      <svg
        ref={svgRef}
        width="800"
        height="600"
        style={{ 
          background: 'black', 
          border: '1px solid #333',
          display: 'block',
          margin: '0 auto'
        }}
      />
      
      {/* Reset button */}
      <button
        onClick={resetGlobe}
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
          fontSize: '14px'
        }}
      >
        Reset Globe
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
            fontSize: '14px'
          }}
        >
          Selected: {selectedCountry}
        </div>
      )}
    </div>
  );
}
