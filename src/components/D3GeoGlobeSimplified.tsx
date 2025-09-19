import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';

const D3GeoGlobeSimplified: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [loadingStatus, setLoadingStatus] = useState<string>('Ready');
  const [loadedFeatures, setLoadedFeatures] = useState<any[]>([]);
  const [scale, setScale] = useState<number>(1); // 줌 스케일 (0.5 ~ 2.0, 지구 꽉 차는 최소)
  const [currentLevel, setCurrentLevel] = useState<'low' | 'mid' | 'high'>('mid'); // LOD 레벨

  // LOD data sources based on zoom level
  const lodDataSources = {
    low: {
      name: '국가 경계 (멀리)',
      url: '/atlas/simplified-admin0-50pct-mapshaper.topo.json',
      size: '~78KB',
      type: 'topojson' as const,
      objectKey: 'countries'
    },
    mid: {
      name: '주/성 경계 10% (중간)',
      url: '/atlas/simplified-admin1-10m-10pct-mapshaper.topo.json',
      size: '~2.0MB',
      type: 'topojson' as const,
      objectKey: 'ne_10m_admin_1_states_provinces'
    },
    high: {
      name: '주/성 경계 1% (가까이)',
      url: '/atlas/simplified-admin1-10m-1pct-mapshaper.topo.json',
      size: '~1.3MB',
      type: 'topojson' as const,
      objectKey: 'ne_10m_admin_1_states_provinces'
    }
  };

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
        
        const geojson = topojson.feature(data, data.objects[objectName]);
        const features = geojson.features || [];
        
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

  // Render globe and features with Canvas for better performance
  const renderGlobe = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get full screen size
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Large orthographic projection with zoom, fixed center
    const projection = d3.geoOrthographic()
      .scale(scale * Math.min(width, height))
      .translate([width / 2, height / 2])
      .rotate([rotation.x, -rotation.y]);

    const path = d3.geoPath().projection(projection).context(ctx);

    // Draw white sphere background
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    path({ type: 'Sphere' });
    ctx.fill();
    ctx.stroke();

    // Draw graticule with black lines
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.3;
    const graticule = d3.geoGraticule();
    ctx.beginPath();
    path(graticule());
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Render loaded features if any
    if (loadedFeatures.length > 0) {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.fillStyle = 'none';
      ctx.globalAlpha = 0.8;

      loadedFeatures.forEach(feature => {
        ctx.beginPath();
        path(feature);
        ctx.stroke();
      });
    }
  };

  // Initial load of mid level data
  useEffect(() => {
    loadDataSource(lodDataSources.mid);
  }, []);

  // Update LOD level based on scale
  useEffect(() => {
    let newLevel: 'low' | 'mid' | 'high';
    if (scale < 0.7) {
      newLevel = 'low';
    } else if (scale < 1.2) {
      newLevel = 'mid';
    } else {
      newLevel = 'high';
    }
    if (newLevel !== currentLevel) {
      setCurrentLevel(newLevel);
      // Load new data
      loadDataSource(lodDataSources[newLevel]);
    }
  }, [scale, currentLevel]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => renderGlobe();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [rotation, loadedFeatures, scale]);

  // Mouse interactions: drag for rotation, wheel for zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    let isDragging = false;
    let lastMouse = { x: 0, y: 0 };

    const handleMouseDown = (event: MouseEvent) => {
      isDragging = true;
      lastMouse = { x: event.clientX, y: event.clientY };
      canvas.style.cursor = 'grabbing';
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (isDragging) {
        const dx = event.clientX - lastMouse.x;
        const dy = event.clientY - lastMouse.y;
        
        // Rotate
        const sensitivity = 0.25;
        setRotation(prev => ({
          x: prev.x + dx * sensitivity,
          y: Math.max(-90, Math.min(90, prev.y + dy * sensitivity))
        }));
        
        lastMouse = { x: event.clientX, y: event.clientY };
      }
    };

    const handleMouseUp = () => {
      isDragging = false;
      canvas.style.cursor = 'grab';
    };

    const handleWheel = (event: WheelEvent) => {
      // Only zoom if mouse is over canvas
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      if (mouseX >= 0 && mouseX <= rect.width && mouseY >= 0 && mouseY <= rect.height) {
        event.preventDefault();
        const zoomFactor = 0.05;
        const delta = event.deltaY > 0 ? -zoomFactor : zoomFactor;
        setScale(prevScale => {
          const newScale = Math.max(0.5, Math.min(2.0, prevScale + delta));
          // Zoom towards mouse direction by adjusting rotation
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;
          const dirX = (mouseX - centerX) / centerX; // -1 to 1
          const dirY = (mouseY - centerY) / centerY; // -1 to 1
          const rotateFactor = 0.1 * (newScale - prevScale);
          setRotation(prev => ({
            x: prev.x + dirX * rotateFactor,
            y: Math.max(-90, Math.min(90, prev.y - dirY * rotateFactor))
          }));
          return newScale;
        });
      }
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('wheel', handleWheel);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('wheel', handleWheel);
    };
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
          City Boundaries Globe
        </h2>
        <div style={{ color: '#666', marginBottom: '15px', fontSize: '14px' }}>
          Status: {loadingStatus} | LOD: {currentLevel === 'low' ? '멀리 (국가)' : currentLevel === 'mid' ? '중간 (주/성 10%)' : '가까이 (주/성 1%)'}
        </div>
        <div style={{ 
          marginTop: '15px', 
          fontSize: '12px', 
          color: '#666',
          lineHeight: '1.4'
        }}>
          • 드래그: 지구본 회전<br/>
          • 마우스 휠: 커서 방향으로 확대/축소<br/>
          • 줌 레벨에 따라 자동으로 상세도 조절
        </div>
      </div>
      
      {/* Globe */}
      <canvas 
        ref={canvasRef} 
        style={{ 
          cursor: 'grab',
          display: 'block'
        }}
      />
    </div>
  );
};

export default D3GeoGlobeSimplified;
