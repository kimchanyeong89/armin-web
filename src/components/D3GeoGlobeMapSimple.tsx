import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

export default function D3GeoGlobeMapSimple() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [countries, setCountries] = useState<any>(null);
  const [cities, setCities] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load countries and cities data
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('Starting to load data...');
        const [countriesResponse, citiesResponse] = await Promise.all([
          fetch('/atlas/ne_110m_admin_0_countries.geojson'),
          fetch('/atlas/ne_50m_urban_areas.geojson')
        ]);
        
        if (!countriesResponse.ok) {
          throw new Error(`Failed to fetch countries: ${countriesResponse.status}`);
        }
        
        if (!citiesResponse.ok) {
          throw new Error(`Failed to fetch cities: ${citiesResponse.status}`);
        }
        
        const countriesData = await countriesResponse.json();
        const citiesData = await citiesResponse.json();
        console.log('Countries loaded:', countriesData.features?.length);
        console.log('Urban areas loaded:', citiesData.features?.length);
        
        setCountries(countriesData);
        setCities(citiesData);
        setLoading(false);
      } catch (error) {
        console.error('Error loading data:', error);
        setError(`Failed to load map data: ${error}`);
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // D3 rendering with countries and cities
  useEffect(() => {
    if (!countries || !cities || !svgRef.current) {
      console.log('Waiting for data...', { countries: !!countries, cities: !!cities, svgRef: !!svgRef.current });
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
    const drag = d3.drag().on('drag', (event) => {
      const rotation = projection.rotate();
      projection.rotate([rotation[0] + event.dx * 0.5, rotation[1] - event.dy * 0.5]);
      svg.selectAll('path').attr('d', (d: any) => path(d) || '');
    });
    svg.call(drag as any);

    // Ocean
    svg.append('circle')
      .attr('cx', width / 2)
      .attr('cy', height / 2)
      .attr('r', projection.scale())
      .attr('fill', '#000')
      .attr('stroke', '#333')
      .attr('stroke-width', 1);

    // Countries
    svg.selectAll('.country')
      .data(countries.features)
      .enter()
      .append('path')
      .attr('class', 'country')
      .attr('d', (d: any) => path(d) || '')
      .attr('fill', '#ccc')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1)
      .style('cursor', 'pointer');

    // Urban areas (city boundaries) - filter for large cities only
    const largeCities = cities.features.filter((d: any) => {
      const areaSize = d.properties?.area_sqkm || 0;
      return areaSize > 100; // Only show cities larger than 100 sq km
    });
    
    console.log('Showing', largeCities.length, 'large urban areas out of', cities.features.length, 'total');
    
    svg.selectAll('.city')
      .data(largeCities)
      .enter()
      .append('path')
      .attr('class', 'city')
      .attr('d', (d: any) => path(d) || '')
      .attr('fill', 'none')
      .attr('stroke', '#ff6666')
      .attr('stroke-width', (d: any) => {
        const areaSize = d.properties?.area_sqkm || 0;
        return areaSize > 1000 ? 1.5 : 1.0;
      })
      .attr('opacity', 0.8);

    console.log('D3 rendering complete');
  }, [countries, cities]);

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
    </div>
  );
}
