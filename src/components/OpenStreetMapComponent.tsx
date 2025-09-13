import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { geoPath, geoMercator } from 'd3-geo';

interface OpenStreetMapProps {
  focusLatLng?: { lat: number; lng: number };
}

const OpenStreetMapComponent: React.FC<OpenStreetMapProps> = ({ focusLatLng }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countries, setCountries] = useState<any[]>([]);
  const [states, setStates] = useState<any[]>([]);

  useEffect(() => {
    const loadAllData = async () => {
      try {
        setLoading(true);
        
        // 모든 지리 데이터를 병렬로 로드 (더 상세한 국가 경계 사용)
        const [countriesResponse, statesResponse] = await Promise.all([
          fetch('/geodata/countries-50m.json'), // 50m 해상도로 변경
          fetch('/geodata/admin1-states-10m.json')
        ]);

        if (!countriesResponse.ok) throw new Error('Countries data failed to load');
        if (!statesResponse.ok) throw new Error('States data failed to load');

        const [countriesData, statesData] = await Promise.all([
          countriesResponse.json(),
          statesResponse.json()
        ]);

        setCountries(countriesData.features || []);
        setStates(statesData.features || []);

        console.log('지리 데이터 로드 완료:');
        console.log('- 국가:', countriesData.features?.length || 0);
        console.log('- 주/도:', statesData.features?.length || 0);
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        console.error('데이터 로드 실패:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAllData();
  }, []);

  useEffect(() => {
    if ((!countries.length && !states.length) || loading || error) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // 전체 화면 크기 사용
    const width = window.innerWidth;
    const height = window.innerHeight;

    svg.attr('width', width).attr('height', height);

    // 화면 크기 변경 시 리사이즈
    const handleResize = () => {
      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight;
      svg.attr('width', newWidth).attr('height', newHeight);
      
      // 투영법도 새 크기에 맞게 업데이트
      projection
        .scale(Math.min(newWidth, newHeight) / 7)
        .translate([newWidth / 2, newHeight / 2]);
      
      // 모든 경로 다시 그리기
      svg.selectAll('path').attr('d', path as any);
      
      // 새로운 화면 크기에 맞게 줌 제한 업데이트
      const newLeftBound = projection([-180, 0]);
      const newRightBound = projection([180, 0]);
      const newActualWorldWidth = newRightBound ? newRightBound[0] - (newLeftBound ? newLeftBound[0] : 0) : newWidth;
      const newMinZoomForWidth = newWidth / newActualWorldWidth;
      const newMinZoomForHeight = newHeight / (newActualWorldWidth * 0.6);
      const newBaseMinZoom = Math.max(newMinZoomForWidth, newMinZoomForHeight * 0.8);
      const newMinZoom = newBaseMinZoom * 0.85; // 중간값: 15% 정도 더 줌아웃 가능
      
      // 줌 제한 업데이트
      zoom.scaleExtent([newMinZoom, 8]);
    };

    window.addEventListener('resize', handleResize);

    // 투영법 설정 (메르카토르 - 완전 평면 + 무한 스크롤)
    const projection = geoMercator()
      .scale(Math.min(width, height) / 7) // 화면 크기에 맞게 동적 스케일
      .translate([width / 2, height / 2])
      .center([0, 35]); // 중심을 북위 35도로 조정 (지도를 아래로 내림)

    // 포커스 위치가 있으면 중심 이동
    if (focusLatLng) {
      projection
        .center([focusLatLng.lng, focusLatLng.lat])
        .scale(1000);
    }

    const path = geoPath().projection(projection);

    // 배경 (흰색)
    svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', '#ffffff');

    // 1. 국가 경계선 그리기 (매우 얇은 검은색) - 무한 반복을 위해 정확한 측정
    const countryGroup = svg.append('g').attr('class', 'countries');
    
    // 실제 지도 경계 측정 (-180도에서 180도까지)
    const leftBound = projection([-180, 0]);
    const rightBound = projection([180, 0]);
    const actualWorldWidth = rightBound ? rightBound[0] - (leftBound ? leftBound[0] : 0) : width;
    
    console.log('Actual World Width:', actualWorldWidth, 'Screen Width:', width);
    console.log('Left Bound:', leftBound, 'Right Bound:', rightBound);
    
  // 무한 스크롤용 복제 수를 5 -> 3개로 축소 (좌/원/우)
  for (let offset = -1; offset <= 1; offset++) {
      const offsetX = offset * actualWorldWidth;
      countries.forEach((country, index) => {
        try {
          countryGroup.append('path')
            .datum(country)
            .attr('d', path as any)
            .attr('transform', `translate(${offsetX}, 0)`)
            .attr('fill', 'rgba(255, 255, 255, 0.01)') // 거의 투명한 fill 추가 (호버 영역용)
            .attr('stroke', '#000000')
            .attr('stroke-width', 0.4)
      .attr('vector-effect', 'non-scaling-stroke')
            .attr('stroke-opacity', 0.8)
            .style('cursor', 'pointer')
            .on('mouseover', function(event) {
              d3.select(this).attr('stroke-width', 0.8);
              showTooltip(svg, event, `🏳️ ${country.properties?.name || 'Unknown Country'}`);
            })
            .on('mouseout', function() {
              d3.select(this).attr('stroke-width', 0.4);
              svg.select('.tooltip').remove();
            });
        } catch (error) {
          console.warn(`국가 ${index} 렌더링 실패:`, error);
        }
      });
    }

    // 2. 주/도 경계선 그리기 (극도로 얇은 회색) - 무한 반복을 위해 5개 복사본
    const stateGroup = svg.append('g').attr('class', 'states');
    
  // 주/도 경계도 5 -> 3개로 축소 (좌/원/우). 이벤트는 비활성화하여 히트 테스트 비용 절감
  for (let offset = -1; offset <= 1; offset++) {
      const offsetX = offset * actualWorldWidth;
      states.forEach((state, index) => {
        try {
          stateGroup.append('path')
            .datum(state)
            .attr('d', path as any)
            .attr('transform', `translate(${offsetX}, 0)`)
      .attr('fill', 'none')
            .attr('stroke', '#888888')
            .attr('stroke-width', 0.08)
      .attr('vector-effect', 'non-scaling-stroke')
            .attr('stroke-opacity', 0.3)
      .style('pointer-events', 'none');
        } catch (error) {
          console.warn(`주/도 ${index} 렌더링 실패:`, error);
        }
      });
    }

    // 툴팁 표시 함수
    function showTooltip(svg: any, event: any, text: string) {
      const tooltip = svg.append('g').attr('class', 'tooltip');
      const rect = tooltip.append('rect')
        .attr('fill', 'rgba(255, 255, 255, 0.95)')
        .attr('stroke', '#000000')
        .attr('stroke-width', 1)
        .attr('rx', 4);
      
      const textElement = tooltip.append('text')
        .attr('fill', '#000000')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .attr('text-anchor', 'start')
        .text(text);

      const bbox = (textElement.node() as SVGTextElement).getBBox();
      rect.attr('x', bbox.x - 8)
          .attr('y', bbox.y - 4)
          .attr('width', bbox.width + 16)
          .attr('height', bbox.height + 8);

      const [mouseX, mouseY] = d3.pointer(event);
      tooltip.attr('transform', `translate(${mouseX + 10}, ${mouseY - 10})`);
    }

    // 줌 기능 (국가, 주/도 레이어에 적용) - 줌아웃 제한 추가
    // 지도가 화면에 꽉 차는 최소 줌 레벨 계산
    const minZoomForWidth = width / actualWorldWidth; // 가로로 꽉 차는 줌
    const minZoomForHeight = height / (actualWorldWidth * 0.6); // 세로 비율 고려 (지도는 가로가 더 김)
    const baseMinZoom = Math.max(minZoomForWidth, minZoomForHeight * 0.8); // 안전 마진 추가
    const minZoom = baseMinZoom * 0.85; // 중간값: 15% 정도 더 줌아웃 가능하도록 설정
    
  const STATE_VISIBLE_K = 1.6; // 이 배율 이상에서만 주/도 경계 표시
  const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([minZoom, 8]) // 최소 줌을 동적으로 계산
      .on('zoom', (event) => {
        const transform = event.transform;
        
        // 단순히 모든 레이어에 동일한 transform 적용
        countryGroup.attr('transform', transform);
        stateGroup.attr('transform', transform);

    // 낮은 배율에서는 주/도 경계 숨김 (페인트 비용 절감)
    stateGroup.attr('display', transform.k >= STATE_VISIBLE_K ? null : 'none');
      });

    console.log('Min Zoom:', minZoom.toFixed(3), 'Base Min Zoom:', baseMinZoom.toFixed(3), 'Width Ratio:', minZoomForWidth.toFixed(3));

    if (svgRef.current) {
      d3.select(svgRef.current).call(zoom);
      
      // 초기 줌과 위치를 훨씬 아래로, 조금 오른쪽으로 설정
  d3.select(svgRef.current).call(
        zoom.transform,
        d3.zoomIdentity
          .scale(baseMinZoom)
          .translate(width * 0.05, -height * 0.25) // 오른쪽으로 5%, 아래로 25% 이동
      );

  // 초기 표시 상태도 배율 기준으로 맞춤
  stateGroup.attr('display', baseMinZoom >= STATE_VISIBLE_K ? null : 'none');
    }

    console.log('상세 지도 렌더링 완료!');

    // 컴포넌트 언마운트 시 이벤트 리스너 정리
    return () => {
      window.removeEventListener('resize', handleResize);
    };

  }, [countries, states, loading, error, focusLatLng]);

  if (loading) {
    return (
      <div style={{ 
        width: '100vw', 
        height: '100vh', 
        backgroundColor: '#000', 
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '18px',
        flexDirection: 'column'
      }}>
        <div>🌍 상세 지도 데이터 로딩 중...</div>
        <div style={{ fontSize: '14px', marginTop: '10px' }}>
          국가, 주/도 경계 데이터를 불러오고 있습니다
        </div>
        <div style={{ fontSize: '12px', marginTop: '10px', color: '#888' }}>
          Natural Earth 50m 고해상도 데이터
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        width: '100vw', 
        height: '100vh', 
        backgroundColor: '#000', 
        color: '#ff4444',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '16px',
        flexDirection: 'column'
      }}>
        <div>❌ 지도 데이터 로드 실패</div>
        <div style={{ fontSize: '14px', marginTop: '10px', color: '#ccc' }}>
          {error}
        </div>
        <div style={{ fontSize: '12px', marginTop: '10px', color: '#888' }}>
          /geodata/countries-50m.json 파일을 확인해주세요
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      overflow: 'hidden'
    }}>
      <svg ref={svgRef} style={{ 
        backgroundColor: '#ffffff',
        width: '100%',
        height: '100%',
        display: 'block'
      }} />
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        color: '#000',
        fontSize: '12px',
        backgroundColor: 'rgba(255,255,255,0.95)',
        padding: '12px',
        borderRadius: '6px',
        border: '1px solid #ccc',
        zIndex: 1000
      }}>
        <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>🌍 상세 세계 지도</div>
        <div style={{ color: '#000', marginBottom: '4px' }}>
          🏳️ 국가 경계 ({countries.length}개)
        </div>
        <div style={{ color: '#666', marginBottom: '4px' }}>
          🏛️ 주/도 경계 ({states.length}개)
        </div>
        <div style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>
          마우스오버: 상세정보 | 스크롤: 줌 | 드래그: 이동
        </div>
      </div>
    </div>
  );
};

export default OpenStreetMapComponent;
