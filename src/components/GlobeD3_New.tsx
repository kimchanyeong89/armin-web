import { useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import type { Exhibition } from '../types/Exhibition';

export type GlobeD3Props = {
  focusLatLng?: { lat: number; lng: number } | null;
  autorotate?: boolean;
  stroke?: string;
  strokeWidth?: number;
  exhibitions?: Exhibition[];
  onSelectExhibition?: (ex: Exhibition) => void;
};

// 클러스터링 - 국가+도시별로 그룹화 (한 번만 계산)
function clusterByCountryCity(exhibitions: Exhibition[]) {
  const groups: { [key: string]: Exhibition[] } = {};
  
  for (const ex of exhibitions) {
    const country = (ex as any).country || 'unknown';
    const city = (ex as any).city || (ex as any).region || 'default';
    const key = `${country}::${city}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(ex);
  }
  
  return Object.entries(groups).map(([key, exs]) => {
    const centerLat = d3.mean(exs, d => d.latitude) || 0;
    const centerLon = d3.mean(exs, d => d.longitude) || 0;
    return {
      key,
      exhibitions: exs,
      centerLat,
      centerLon,
      isCluster: exs.length > 1,
    };
  });
}

export default function GlobeD3({ 
  focusLatLng = null, 
  autorotate = false, 
  stroke = '#2b3138', 
  strokeWidth = 1.5, 
  exhibitions = [], 
  onSelectExhibition 
}: GlobeD3Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const expandedRef = useRef<Set<string>>(new Set());
  
  // 클러스터 데이터를 메모이제이션
  const clusters = useMemo(() => clusterByCountryCity(exhibitions), [exhibitions]);

  useEffect(() => {
    void focusLatLng;
    
    const container = containerRef.current;
    if (!container) return;

    d3.select(container).selectAll("*").remove();

    const canvasSize = 600;
    const svg = d3.select(container)
      .append('svg')
      .attr('width', canvasSize)
      .attr('height', canvasSize)
      .style('background', '#fff');

    const projection = d3.geoOrthographic()
      .scale(250)
      .translate([canvasSize / 2, canvasSize / 2])
      .clipAngle(90);

    const path = d3.geoPath().projection(projection);

    let rotate: [number, number] = [0, 0];
    let zoomK = 1;

    svg.append('circle')
      .attr('cx', canvasSize / 2)
      .attr('cy', canvasSize / 2)
      .attr('r', 250)
      .attr('fill', '#f8fafc')
      .attr('stroke', stroke)
      .attr('stroke-width', strokeWidth);

    const gCountries = svg.append('g').attr('class', 'countries');
    const gPins = svg.append('g').attr('class', 'pins');

    const renderCountries = async () => {
      try {
        const response = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@1.1.0/countries-110m.json');
        if (!response.ok) return;
        const topo = await response.json();
        const countries = feature(topo, topo.objects.countries as any);
        gCountries.selectAll('path')
          .data(countries.features)
          .enter().append('path')
          .attr('d', path as any)
          .attr('fill', 'none')
          .attr('stroke', stroke)
          .attr('stroke-width', strokeWidth);
      } catch (error) {
        console.error('지도 로드 실패');
      }
    };

    const createPins = () => {
      gPins.selectAll('*').remove();
      
      const expanded = expandedRef.current;
      const nodes: any[] = [];
      
      for (const cluster of clusters) {
        if (!cluster.isCluster || cluster.exhibitions.length === 1) {
          const ex = cluster.exhibitions[0];
          nodes.push({ ...ex, _cluster: false, _key: cluster.key });
        } else if (expanded.has(cluster.key)) {
          cluster.exhibitions.forEach((ex, i) => {
            const angle = (i / cluster.exhibitions.length) * 2 * Math.PI;
            const radius = 0.25 + Math.floor(i / 8) * 0.15;
            nodes.push({
              ...ex,
              latitude: cluster.centerLat + Math.sin(angle) * radius,
              longitude: cluster.centerLon + Math.cos(angle) * radius,
              _cluster: false,
              _key: cluster.key,
              _expanded: true,
            });
          });
        } else {
          nodes.push({
            _cluster: true,
            _key: cluster.key,
            count: cluster.exhibitions.length,
            latitude: cluster.centerLat,
            longitude: cluster.centerLon,
            _items: cluster.exhibitions,
          });
        }
      }
      
      const pinGroups = gPins.selectAll('.pin')
        .data(nodes, (d: any) => d._cluster ? `c-${d._key}` : d.id || d.name)
        .enter()
        .append('g')
        .attr('class', 'pin')
        .style('cursor', 'pointer');
      
      const clusterPins = pinGroups.filter((d: any) => d._cluster);
      clusterPins.append('circle')
        .attr('r', (d: any) => Math.max(14, 10 + Math.log2(d.count) * 4))
        .attr('fill', '#dc2626')
        .attr('stroke', '#fff')
        .attr('stroke-width', 2);
      clusterPins.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('font-size', 11)
        .attr('font-weight', 'bold')
        .attr('fill', '#fff')
        .text((d: any) => d.count);
      
      const singlePins = pinGroups.filter((d: any) => !d._cluster);
      singlePins.append('circle')
        .attr('r', 6)
        .attr('fill', '#dc2626')
        .attr('stroke', '#fff')
        .attr('stroke-width', 2);
      singlePins.append('circle')
        .attr('r', 2)
        .attr('fill', '#fff');
      singlePins.append('text')
        .attr('dy', -10)
        .attr('text-anchor', 'middle')
        .style('font-size', '9px')
        .style('font-weight', 'bold')
        .style('fill', '#333')
        .style('stroke', '#fff')
        .style('stroke-width', 2)
        .style('paint-order', 'stroke')
        .style('opacity', 0)
        .text((d: any) => d.name || d.title);
      
      pinGroups.on('click', (_event: any, d: any) => {
        if (d._cluster) {
          if (expanded.has(d._key)) expanded.delete(d._key);
          else expanded.add(d._key);
          createPins();
          updatePositions();
        } else {
          if (onSelectExhibition) onSelectExhibition(d);
        }
      });
    };

    const updatePositions = () => {
      gCountries.selectAll('path').attr('d', path as any);
      
      gPins.selectAll('.pin')
        .attr('transform', (d: any) => {
          const coords = projection([d.longitude, d.latitude]);
          return coords ? `translate(${coords[0]},${coords[1]})` : 'translate(-9999,-9999)';
        })
        .style('display', (d: any) => {
          const rotatedLon = d.longitude + rotate[0];
          const normalizedLon = ((rotatedLon + 180) % 360) - 180;
          return Math.abs(normalizedLon) <= 90 ? 'block' : 'none';
        });
      
      gPins.selectAll('.pin text')
        .filter((d: any) => !d._cluster)
        .style('opacity', zoomK >= 2.5 ? 1 : 0);
    };

    const zoom = d3.zoom()
      .scaleExtent([1, 8])
      .on('zoom', (event: any) => {
        zoomK = event.transform.k;
        projection.scale(250 * zoomK);
        updatePositions();
      });
    svg.call(zoom as any);

    const drag = d3.drag()
      .on('drag', (event: any) => {
        rotate[0] += event.dx * 0.5;
        rotate[1] -= event.dy * 0.5;
        rotate[1] = Math.max(-90, Math.min(90, rotate[1]));
        projection.rotate(rotate);
        updatePositions();
      });
    svg.call(drag as any);

    renderCountries().then(() => {
      createPins();
      updatePositions();
    });

    if (autorotate) {
      const timer = d3.timer(() => {
        rotate[0] += 0.3;
        projection.rotate(rotate);
        updatePositions();
      });
      return () => timer.stop();
    }
  }, [clusters, autorotate, stroke, strokeWidth, onSelectExhibition, focusLatLng]);

  return <div ref={containerRef} style={{ width: '600px', height: '600px' }} />;
}
