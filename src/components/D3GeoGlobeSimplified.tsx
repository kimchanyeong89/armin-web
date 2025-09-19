import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';

const D3GeoGlobeSimplified: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [loadingStatus, setLoadingStatus] = useState<string>('Ready');
  const [loadedFeatures, setLoadedFeatures] = useState<any[]>([]);

  // Lightweight local boundary linework built via scripts/build-simplified-admin-lines.mjs
  const dataSources = [
    {
      name: '경량화 경계 (전세계 국가)',
      url: '/atlas/simplified-admin0-lines.topo.json',
      size: '~116KB',
      type: 'topojson',
      objectKey: 'admin0'
    },
    {
      name: '경량화 경계 (주/성)',
      url: '/atlas/simplified-admin1-lines.topo.json',
      size: '~112KB',
      type: 'topojson',
      objectKey: 'admin1'
    },
    {
      name: '경량화 경계 GeoJSON (국가)',
      url: '/atlas/simplified-admin0-lines.geojson',
      size: '~108KB',
      type: 'geojson'
    },
    {
      name: '경량화 경계 GeoJSON (주/성)',
      url: '/atlas/simplified-admin1-lines.geojson',
      size: '~109KB',
      type: 'geojson'
    }
  ];

  // Test data loading function
  const loadDataSource = async (source: any) => {
    try {
      setLoadingStatus(`Loading ${source.name} (${source.size})...`);
      console.log(`🔄 Testing: ${source.name}`);
      console.log(`📊 Size: ${source.size}`);
      console.log(`🔗 URL: ${source.url}`);

      const response = await fetch(source.url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json,text/plain,*/*',
          'User-Agent': 'Mozilla/5.0 (compatible; DataLoader/1.0)'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      console.log(`Content-Type: ${contentType}`);

      if (source.type === 'csv' || contentType.includes('text/csv')) {
        // CSV 처리
        const csvText = await response.text();
        console.log(`CSV text length: ${csvText.length}`);
        
        const lines = csvText.split('\n').slice(1).filter(line => line.trim());
        console.log(`CSV lines: ${lines.length}`);
        
        const features = lines.slice(0, 200).map((line, index) => {
          try {
            const columns = line.split(',');
            const name = columns[0]?.replace(/"/g, '') || `City${index}`;
            const country = columns[1]?.replace(/"/g, '') || 'Unknown';
            const lat = parseFloat(columns[2] || '0');
            const lng = parseFloat(columns[3] || '0');
            
            if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
              return null;
            }
            
            return {
              type: 'Feature',
              properties: { name, country },
              geometry: { type: 'Point', coordinates: [lng, lat] }
            };
          } catch (e) {
            return null;
          }
        }).filter(Boolean);
        
        console.log(`✅ CSV loaded: ${features.length} cities`);
        setLoadingStatus(`✅ ${source.name}: ${features.length} cities loaded`);
        setLoadedFeatures(features);
        
      } else if (source.type === 'topojson') {
        // TopoJSON 처리
        const data = await response.json();
        console.log(`TopoJSON objects:`, Object.keys(data.objects || {}));
        
        if (!data.objects) {
          throw new Error('No objects in TopoJSON data');
        }
        
        let objectName = source.objectKey;
        if (!objectName || !data.objects[objectName]) {
          objectName = Object.keys(data.objects)[0];
        }
        
        console.log(`Using TopoJSON object: "${objectName}"`);
        
        const geojson = topojson.feature(data, data.objects[objectName]) as any;
        const features = geojson.type === 'FeatureCollection'
          ? (geojson.features || [])
          : [geojson];
        
        console.log(`✅ TopoJSON converted: ${features.length} features`);
        setLoadingStatus(`✅ ${source.name}: ${features.length} boundaries loaded`);
        setLoadedFeatures(features);
        
      } else {
        // GeoJSON 또는 JSON 처리
        const data = await response.json();
        console.log(`JSON data type:`, typeof data, Array.isArray(data) ? 'array' : 'object');
        
        let features = [];
        
        if (data.features && Array.isArray(data.features)) {
          // 표준 GeoJSON
          features = data.features;
        } else if (Array.isArray(data)) {
          // JSON 배열 (도시 데이터 등)
          features = data.slice(0, 200).map((item: any, index: number) => {
            try {
              const name = item.name || item.city || item.country || `Item${index}`;
              const lat = parseFloat(item.lat || item.latitude || '0');
              const lng = parseFloat(item.lng || item.longitude || '0');
              
              if (isNaN(lat) || isNaN(lng)) return null;
              
              return {
                type: 'Feature',
                properties: { name },
                geometry: { type: 'Point', coordinates: [lng, lat] }
              };
            } catch (e) {
              return null;
            }
          }).filter(Boolean);
        } else if (data.type && (data.type === 'MultiLineString' || data.type === 'LineString')) {
          features = [{ type: 'Feature', properties: {}, geometry: data }];
        } else {
          throw new Error('Unsupported data format');
        }
        
        console.log(`✅ JSON loaded: ${features.length} features`);
        setLoadingStatus(`✅ ${source.name}: ${features.length} items loaded`);
        setLoadedFeatures(features);
      }

    } catch (error) {
      console.error(`❌ Detailed error for ${source.name}:`, error);
      
      if (error instanceof TypeError && error.message.includes('fetch')) {
        setLoadingStatus(`❌ Network Error: ${source.name} - CORS or URL issue`);
      } else if (error instanceof SyntaxError) {
        setLoadingStatus(`❌ Parse Error: ${source.name} - Invalid JSON/data format`);
      } else {
        setLoadingStatus(`❌ Failed: ${source.name} - ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };

  // Render globe and features
  const renderGlobe = () => {
    const svg = d3.select(svgRef.current);
    if (!svgRef.current) return;
    
    svg.selectAll('*').remove();

    // Get full screen size
    const width = window.innerWidth;
    const height = window.innerHeight;
    svg.attr('width', width).attr('height', height);

    // Large orthographic projection
    const projection = d3.geoOrthographic()
      .scale(Math.min(width, height) * 0.4)
      .translate([width / 2, height / 2])
      .rotate([rotation.x, -rotation.y]);

    const path = d3.geoPath().projection(projection);

    // Draw white sphere background
    svg.append('path')
      .datum({ type: 'Sphere' })
      .attr('d', (d: any) => path(d))
      .attr('fill', '#ffffff')
      .attr('stroke', '#000000')
      .attr('stroke-width', 2);

    // Draw graticule with black lines
    const graticule = d3.geoGraticule();
    svg.append('path')
      .datum(graticule())
      .attr('d', (d: any) => path(d))
      .attr('fill', 'none')
      .attr('stroke', '#000000')
      .attr('stroke-width', 0.5)
      .attr('opacity', 0.3);

    // Render loaded features if any
    if (loadedFeatures.length > 0) {
      svg.selectAll('.feature-path')
        .data(loadedFeatures)
        .enter()
        .append('path')
        .attr('class', 'feature-path')
        .attr('d', (d: any) => path(d))
        .attr('fill', loadedFeatures[0]?.geometry?.type === 'Point' ? '#000000' : 'none')
        .attr('stroke', '#000000')
        .attr('stroke-width', loadedFeatures[0]?.geometry?.type === 'Point' ? 2 : 1)
        .attr('opacity', 0.8);
    }
  };

  // Initialize and handle rotation updates
  useEffect(() => {
    renderGlobe();
  }, [rotation, loadedFeatures]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => renderGlobe();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [rotation, loadedFeatures]);

  // Mouse drag for rotation
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    if (!svgRef.current) return;
    
    let isDragging = false;
    let lastMouse = { x: 0, y: 0 };

    const drag = d3.drag<SVGSVGElement, unknown>()
      .on('start', (event) => {
        isDragging = true;
        lastMouse = { x: event.x, y: event.y };
      })
      .on('drag', (event) => {
        if (isDragging) {
          const sensitivity = 0.25;
          const dx = (event.x - lastMouse.x) * sensitivity;
          const dy = (event.y - lastMouse.y) * sensitivity;
          
          setRotation(prev => ({
            x: prev.x + dx,
            y: Math.max(-90, Math.min(90, prev.y + dy))
          }));
          
          lastMouse = { x: event.x, y: event.y };
        }
      })
      .on('end', () => {
        isDragging = false;
      });

    svg.call(drag as any);
  }, []);

  return (
    <div style={{ 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      width: '100vw', 
      height: '100vh', 
      backgroundColor: '#ffffff',
      overflow: 'hidden'
    }}>
      {/* Control panel */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        zIndex: 1000,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        padding: '20px',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        maxWidth: '320px',
        maxHeight: '80vh',
        overflowY: 'auto'
      }}>
        <h2 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 'bold' }}>
          경량화 경계 지구본
        </h2>
        <div style={{ color: '#666', marginBottom: '15px', fontSize: '14px' }}>
          Status: {loadingStatus}
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
          {dataSources.map((source, index) => (
            <button
              key={index}
              onClick={() => loadDataSource(source)}
              style={{ 
                padding: '10px 12px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = '#f1f5f9';
                e.currentTarget.style.borderColor = '#cbd5e1';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = '#f8fafc';
                e.currentTarget.style.borderColor = '#e2e8f0';
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '3px', fontSize: '13px' }}>
                {source.name}
              </div>
              <div style={{ color: '#64748b', fontSize: '11px' }}>
                Size: {source.size}
              </div>
            </button>
          ))}
        </div>
        
        <div style={{ 
          marginTop: '15px', 
          fontSize: '12px', 
          color: '#666',
          lineHeight: '1.4'
        }}>
          마우스로 드래그하여 지구본을 회전할 수 있습니다.
        </div>
      </div>
      
      {/* Globe */}
      <svg 
        ref={svgRef} 
        style={{ 
          cursor: 'grab',
          display: 'block'
        }}
      />
    </div>
  );
};

export default D3GeoGlobeSimplified;
