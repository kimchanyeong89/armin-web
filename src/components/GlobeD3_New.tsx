import { useEffect, useRef } from 'react';
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

export default function GlobeD3({ 
  focusLatLng = null, 
  autorotate = false, 
  stroke = '#2b3138', 
  strokeWidth = 1.5, 
  exhibitions = [], 
  onSelectExhibition 
}: GlobeD3Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // mark unused prop as referenced to satisfy noUnusedLocals
    void focusLatLng;
    console.log(`[GlobeD3] exhibitions prop received: ${exhibitions.length} exhibitions`);
    
    const ukExhibitions = exhibitions.filter((ex: any) => 
      ex.country === 'United Kingdom' || ex.country === 'UK' || ex.country === 'England'
    );
    console.log(`영국 박물관 수: ${ukExhibitions.length}`);
    ukExhibitions.forEach((ex: any) => {
      console.log(`영국 박물관: ${ex.title} - 위치: ${ex.city}, 좌표: [${ex.longitude}, ${ex.latitude}]`);
    });

    const container = containerRef.current;
    if (!container) return;

    // 기존 SVG 제거
    d3.select(container).selectAll("*").remove();

    const canvasSize = 600;
    const svg = d3.select(container)
      .append('svg')
      .attr('width', canvasSize)
      .attr('height', canvasSize)
      .style('background', '#fff');

    // 투영법 설정
    const projection = d3.geoOrthographic()
      .scale(250)
      .translate([canvasSize / 2, canvasSize / 2])
      .clipAngle(90);

    const path = d3.geoPath().projection(projection);

    // 회전 상태
  let rotate: [number, number] = [0, 0];
    let zoomK = 1;

    // 지구 배경
    svg.append('circle')
      .attr('cx', canvasSize / 2)
      .attr('cy', canvasSize / 2)
      .attr('r', 250)
      .attr('fill', '#f8fafc')
      .attr('stroke', stroke)
      .attr('stroke-width', strokeWidth);

    // 줌 동작
    const zoom = d3.zoom()
      .scaleExtent([1, 8])
      .on('zoom', (event: any) => {
        zoomK = event.transform.k;
        projection.scale(250 * zoomK);
        renderAll();
      });

    svg.call(zoom as any);

    // 드래그 동작
    const drag = d3.drag()
      .on('drag', (event: any) => {
        const sensitivity = 0.5;
        rotate[0] += event.dx * sensitivity;
        rotate[1] -= event.dy * sensitivity;
        rotate[1] = Math.max(-90, Math.min(90, rotate[1]));
        projection.rotate(rotate);
        renderAll();
      });

    svg.call(drag as any);

    // 그룹 요소들
    const gCountries = svg.append('g').attr('class', 'countries');
    const gPins = svg.append('g').attr('class', 'pins');

    // 지도 데이터 로드 및 렌더링
    const renderCountries = async () => {
      try {
        // 대체 URL들을 시도
        const urls = [
          'https://cdn.jsdelivr.net/npm/world-atlas@1.1.0/countries-110m.json',
          'https://unpkg.com/world-atlas@1.1.0/countries-110m.json'
        ];

        let topo = null;
        for (const url of urls) {
          try {
            console.log(`지도 데이터 로드 시도: ${url}`);
            const response = await fetch(url);
            if (response.ok) {
              topo = await response.json();
              console.log('지도 데이터 로드 성공');
              break;
            }
          } catch (error) {
            console.warn(`URL ${url} 실패:`, error);
          }
        }

        if (!topo) {
          console.warn('모든 지도 데이터 URL 실패. 간단한 대체 지도 사용');
          renderSimpleMap();
          return;
        }

        const countries = feature(topo, topo.objects.countries as any);
        
        gCountries.selectAll('path')
          .data(countries.features)
          .enter().append('path')
          .attr('d', path as any)
          .attr('fill', 'none')
          .attr('stroke', stroke)
          .attr('stroke-width', strokeWidth);

      } catch (error) {
        console.error('지도 렌더링 실패:', error);
        renderSimpleMap();
      }
    };

    // 간단한 대체 지도
    const renderSimpleMap = () => {
      // 간단한 격자 패턴으로 지구 표현
      const graticule = d3.geoGraticule();
      
      gCountries.append('path')
        .datum(graticule())
        .attr('d', path as any)
        .attr('fill', 'none')
        .attr('stroke', '#e2e8f0')
        .attr('stroke-width', 0.5);
    };

    // 클러스터링 상태 관리
    const expandedClusters = new Set<string>();

    // 핀 렌더링
    const renderPins = () => {
      console.log('핀 렌더링 시작');
      
      // 전시회 데이터를 투영 좌표로 변환
      const pinData = exhibitions.map((d: any) => {
        const coords = projection([d.longitude, d.latitude]);
        return { ...d, coords };
      }).filter(d => d.coords); // 유효한 좌표만

      console.log(`투영된 핀 데이터: ${pinData.length}개`);
      
      // 클러스터링: 0.5도 그리드로 그룹화
      const CLUSTER_GRID_SIZE = 0.5;
      const roundToGrid = (v: number) => Math.round(v / CLUSTER_GRID_SIZE) * CLUSTER_GRID_SIZE;
      
      const clusters: { [key: string]: any[] } = {};
      for (const d of pinData) {
        const gridLon = roundToGrid(d.longitude);
        const gridLat = roundToGrid(d.latitude);
        const key = `${gridLon},${gridLat}`;
        if (!clusters[key]) clusters[key] = [];
        clusters[key].push(d);
      }

      // 노드 생성
      const nodes: any[] = [];
      
      for (const [key, items] of Object.entries(clusters)) {
        if (items.length === 1) {
          // 단일 아이템은 개별 핀으로
          const d = items[0];
          nodes.push({
            ...d,
            px: d.coords[0],
            py: d.coords[1],
            _labelVisible: zoomK >= 2,
            _cluster: false
          });
        } else if (expandedClusters.has(key)) {
          // 펼쳐진 클러스터: 개별 핀들로
          const centerLon = d3.mean(items, (d: any) => d.longitude) as number;
          const centerLat = d3.mean(items, (d: any) => d.latitude) as number;
          const center = projection([centerLon, centerLat]);
          if (!center) continue;
          
          items.forEach((d: any, i: number) => {
            const angle = (i / items.length) * 2 * Math.PI;
            const radius = 30 + Math.floor(i / 6) * 20; // 여러 원으로 배치
            const px = center[0] + Math.cos(angle) * radius;
            const py = center[1] + Math.sin(angle) * radius;
            
            nodes.push({
              ...d,
              px,
              py,
              _labelVisible: zoomK >= 2,
              _cluster: false
            });
          });
        } else {
          // 접힌 클러스터: 클러스터 버튼으로
          const centerLon = d3.mean(items, (d: any) => d.longitude) as number;
          const centerLat = d3.mean(items, (d: any) => d.latitude) as number;
          const center = projection([centerLon, centerLat]);
          if (!center) continue;
          
          nodes.push({
            _cluster: true,
            key: key,
            count: items.length,
            longitude: centerLon,
            latitude: centerLat,
            px: center[0],
            py: center[1],
            _labelVisible: true,
            _items: items
          });
        }
      }

      console.log(`렌더링할 노드 수: ${nodes.length}`);
      console.log('클러스터 정보:', nodes.filter(n => n._cluster).map(n => `${n.key}: ${n.count}개`));

      // 핀 그룹 생성
      const pins = gPins.selectAll('.pin')
        .data(nodes, (d: any) => d._cluster ? d.key : d.id || d.title);

      pins.exit().remove();

      const pinsEnter = pins.enter()
        .append('g')
        .attr('class', 'pin')
        .style('cursor', 'pointer');

      // 클러스터 버튼
      const clusterEnter = pinsEnter.filter((d: any) => d._cluster);
      
      clusterEnter.append('circle')
        .attr('class', 'cluster-bg')
        .attr('r', (d: any) => Math.max(15, 10 + Math.log2(d.count) * 3))
        .attr('fill', '#dc2626')
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 2);

      clusterEnter.append('text')
        .attr('class', 'cluster-count')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('font-size', 12)
        .attr('font-weight', 'bold')
        .attr('fill', '#ffffff')
        .text((d: any) => d.count);

      clusterEnter.append('title')
        .text((d: any) => `${d.count}개의 전시관이 있습니다.\n클릭하여 펼쳐보세요.`);

      // 개별 핀
      const pinEnter = pinsEnter.filter((d: any) => !d._cluster);
      
      pinEnter.append('circle')
        .attr('class', 'pin-bg')
        .attr('r', 6)
        .attr('fill', '#dc2626')
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 2);

      pinEnter.append('circle')
        .attr('class', 'pin-dot')
        .attr('r', 2)
        .attr('fill', '#ffffff');

      pinEnter.append('text')
        .attr('class', 'pin-label')
        .attr('dy', -10)
        .attr('text-anchor', 'middle')
        .style('font-size', '10px')
        .style('font-weight', 'bold')
        .style('fill', '#333')
        .style('stroke', '#fff')
        .style('stroke-width', 2)
        .style('paint-order', 'stroke')
        .text((d: any) => d.title || d.name);

      // 클릭 이벤트
      pinsEnter.on('click', (_event: any, d: any) => {
        if (d._cluster) {
          // 클러스터 클릭: 펼치기/접기
          if (expandedClusters.has(d.key)) {
            expandedClusters.delete(d.key);
            console.log(`클러스터 ${d.key} 접기`);
          } else {
            expandedClusters.add(d.key);
            console.log(`클러스터 ${d.key} 펼치기`);
          }
          renderAll();
        } else {
          // 개별 핀 클릭
          console.log('핀 클릭됨:', d.title);
          if (onSelectExhibition) {
            onSelectExhibition(d);
          }
        }
      });

      // 위치 업데이트
      gPins.selectAll('.pin')
        .attr('transform', (d: any) => `translate(${d.px},${d.py})`)
        .style('display', (d: any) => {
          const lon = d._cluster ? d.longitude : d.longitude;
          const rotatedLon = lon + rotate[0];
          const normalizedLon = ((rotatedLon + 180) % 360) - 180;
          const visible = Math.abs(normalizedLon) <= 90;
          return visible ? 'block' : 'none';
        });

      // 라벨 표시/숨기기
      gPins.selectAll('.pin-label')
        .style('opacity', (d: any) => d._labelVisible ? 1 : 0);
    };

    // 전체 렌더링
    const renderAll = () => {
      gCountries.selectAll('path').attr('d', path as any);
      renderPins();
    };

    // 초기 렌더링
    renderCountries().then(() => {
      renderPins();
    });

    // 자동 회전
    if (autorotate) {
      const timer = d3.timer(() => {
        rotate[0] += 0.5;
        projection.rotate(rotate);
        renderAll();
      });

      return () => {
        timer.stop();
      };
    }

  }, [exhibitions, autorotate, stroke, strokeWidth, onSelectExhibition]);

  return <div ref={containerRef} style={{ width: '600px', height: '600px' }} />;
}
