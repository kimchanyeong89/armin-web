import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { geoPath, geoMercator } from 'd3-geo';
import type { Exhibition } from '../types/Exhibition';

interface OpenStreetMapProps {
  focusLatLng?: { lat: number; lng: number };
  exhibitions?: Exhibition[];
  onSelectExhibition?: (ex: Exhibition) => void;
}

const OpenStreetMapComponent: React.FC<OpenStreetMapProps> = ({ focusLatLng, exhibitions = [], onSelectExhibition }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countries, setCountries] = useState<any[]>([]);
  const [states, setStates] = useState<any[]>([]);
  const [selectedISO3, setSelectedISO3] = useState<string | null>(null);
  const [muniFeatures, setMuniFeatures] = useState<any[] | null>(null);
  const [muniLoading, setMuniLoading] = useState(false);
  const [muniError, setMuniError] = useState<string | null>(null);
  const onSelectExhibitionRef = useRef<typeof onSelectExhibition | undefined>(onSelectExhibition);
  useEffect(() => { onSelectExhibitionRef.current = onSelectExhibition; }, [onSelectExhibition]);

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

  // 현재 줌 변환을 보관 (도시 레이어 표시 게이트/위치에 사용)
  const zoomTransformRef = useRef<any>(d3.zoomIdentity);
  // Pins/groups refs
  const pinsGroupRef = useRef<SVGGElement | null>(null);
  // Keep a handle to the active d3-zoom behavior so we can programmatically zoom
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const expandedClustersRef = useRef<Set<string>>(new Set());
  const animateExpandKeyRef = useRef<string | null>(null);
  const collapseAnimKeyRef = useRef<string | null>(null);
  const collapsePendingRef = useRef<number>(0);
  const collapseFinalizedRef = useRef<boolean>(false);
  // Cluster prep (city normalize + grid)
  const CLUSTER_GRID_SIZE = 0.8;
  const roundToGrid = (v: number) => Math.round(v / CLUSTER_GRID_SIZE) * CLUSTER_GRID_SIZE;
  const normalizeCity = (s: unknown) => {
    if (typeof s !== 'string') return '';
    const raw = s.toLowerCase().replace(/[()]/g, '').split(/[,:]/).map(t => t.trim()).filter(Boolean);
    if (!raw.length) return '';
    const removeTail = new Set(['uk','u.k.','united kingdom','great britain','gb','england','scotland','wales','northern ireland','south korea','korea','republic of korea','대한민국','united states','united states of america','usa','us','u.s.','canada','japan','france','germany','italy','spain','china','australia','ireland']);
    const tokens: string[] = [...raw];
    while (tokens.length && removeTail.has(tokens[tokens.length - 1])) tokens.pop();
    if (!tokens.length) return '';
    if (tokens.some(t => /\blondon\b/.test(t))) return 'london';
    const seoulIdx = tokens.findIndex(t => /\bseoul\b|서울|서울특별시/.test(t));
    if (seoulIdx >= 0) return 'seoul';
    const noDigits = tokens.filter(t => !/[0-9]/.test(t));
    let candidate = (noDigits.length ? noDigits : tokens)[(noDigits.length ? noDigits : tokens).length - 1];
    candidate = candidate.replace(/^(city of|greater|metropolitan|metropolitan city)\s+/, '');
    candidate = candidate.replace(/\s+\d.*$/, '');
    candidate = candidate.replace(/\s+/g, ' ').trim();
    return candidate;
  };
  type ClusterInfo = { key: string; items: Exhibition[]; centerLon: number; centerLat: number; sortedByName: Exhibition[] };
  const clustersListRef = useRef<ClusterInfo[] | null>(null);
  // Rebuild clusters when exhibitions changes
  useEffect(() => {
    const list = exhibitions || [];
    const map: Record<string, Exhibition[]> = {};
    for (const d of list) {
      const cityKey = normalizeCity((d as any).city || (d as any).location);
      let key: string;
      if (cityKey) key = `city:${cityKey}`;
      else {
        const gridLon = roundToGrid((d as any).longitude);
        const gridLat = roundToGrid((d as any).latitude);
        key = `grid:${gridLon},${gridLat}`;
      }
      (map[key] ||= []).push(d);
    }
    clustersListRef.current = Object.entries(map).map(([key, items]) => ({
      key,
      items,
      centerLon: d3.mean(items as any, (d: any) => d.longitude) as number,
      centerLat: d3.mean(items as any, (d: any) => d.latitude) as number,
      sortedByName: [...items].sort((a: any, b: any) => String(a.name || a.title).localeCompare(String(b.name || b.title)))
    }));
    // collapse on data change
    expandedClustersRef.current.clear();
  }, [exhibitions]);

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

    // 배경 (흰색) - 배경 클릭 시 도시 모드 해제
    svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', '#ffffff')
      .attr('pointer-events', 'all')
      .style('cursor', selectedISO3 ? 'pointer' : 'default')
      .on('click', () => {
        // 빈 배경 클릭으로 도시 호버 모드 해제
        if (selectedISO3) {
          setSelectedISO3(null);
          setMuniFeatures(null);
          setMuniError(null);
        }
      });

    // 1. 국가 경계선 그리기 (매우 얇은 검은색) - 무한 반복을 위해 정확한 측정
  const countryGroup = svg.append('g').attr('class', 'countries').attr('pointer-events','all');
    
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
              showTooltip(svg, event, `🏳️ ${getCountryName(country.properties)}`);
            })
            .on('mouseout', function() {
              d3.select(this).attr('stroke-width', 0.4);
              svg.select('.tooltip').remove();
            })
            .on('click', async (event) => {
              event.stopPropagation();
              const iso3 = getISO3(country.properties);
              if (!iso3) {
                setMuniError('No ISO3 code available for this country');
                return;
              }
              // 1) 선택 국가로 확대/중심 이동 (부드러운 트랜지션)
              try {
                // 현재 렌더링된 경계의 경계박스 계산 (wrap된 복제본 클릭에도 동작)
                const b = path.bounds(country);
                const dx = b[1][0] - b[0][0];
                const dy = b[1][1] - b[0][1];
                // fit extent 방식으로 목표 transform 계산 (여백 5%)
                const margin = 0.05;
                const targetW = width * (1 - margin * 2);
                const targetH = height * (1 - margin * 2);
                let k = Math.min(targetW / dx, targetH / dy);
                k = Math.max(k, 2.2, minZoom);
                k = Math.min(k, 8);
                const x = (b[0][0] + b[1][0]) / 2;
                const y = (b[0][1] + b[1][1]) / 2;
                // 클릭한 복제본의 오프셋을 적용하여 정확히 그 복제본을 중앙에 배치
                const tx = width / 2 - k * (x + offsetX);
                const ty = height / 2 - k * y;
                d3.select(svgRef.current)
                  .transition()
                  .duration(800)
                  .ease(d3.easeCubicOut)
                  .call(zoom.transform as any, d3.zoomIdentity.translate(tx, ty).scale(k));
              } catch (e) {
                console.warn('fit to country failed', e);
              }
              setSelectedISO3(iso3);
              await loadMunicipalities(iso3);
            });
        } catch (error) {
          console.warn(`국가 ${index} 렌더링 실패:`, error);
        }
      });
    }

    // 2. 주/도 경계선 그리기 (극도로 얇은 회색) - 무한 반복을 위해 5개 복사본
  const stateGroup = svg.append('g').attr('class', 'states').attr('pointer-events','none');
    
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

    // 3. 도시/지자체 경계 오버레이 (선택된 국가만 표시)
  const muniGroup = svg.append('g').attr('class', 'municipalities').attr('pointer-events', 'none');
  const CITY_VISIBLE_K = 2.2;

    // 4. Pins/Clusters layer (screen-space rendering)
  const pinsLayer = svg.append('g').attr('class', 'pins-layer').attr('pointer-events','all');
  // ensure pins are on top for interactions
  pinsLayer.raise();
    pinsGroupRef.current = pinsLayer.node() as SVGGElement;

    const renderMunicipalities = () => {
      muniGroup.selectAll('*').remove();
      if (!muniFeatures || !muniFeatures.length) return;
      // 중앙에만 렌더 (wrap 미적용)
      muniFeatures.forEach((feat, idx) => {
        try {
          muniGroup.append('path')
            .datum(feat)
            .attr('d', path as any)
            .attr('fill', 'none')
            .attr('stroke', '#000')
            .attr('stroke-width', 0.2)
            .attr('vector-effect', 'non-scaling-stroke')
            .attr('stroke-opacity', 0.9)
            .style('pointer-events', 'visibleStroke')
            .on('mouseover', function(event) {
              d3.select(this).attr('stroke-width', 0.35);
                  const p = feat.properties || {};
                  const city = getMunicipalityName(p);
                  const parent = p?.ADM1_EN || p?.NAME_1 || p?.region || p?.province || '';
                  const txt = parent ? `🏙️ ${city} · ${parent}` : `🏙️ ${city}`;
                  showTooltip(svg, event, txt);
            })
            .on('mouseout', function() {
              d3.select(this).attr('stroke-width', 0.2);
              svg.select('.tooltip').remove();
            });
          // 도시 경계 상호작용만 허용하도록 그룹의 pointer-events는 none으로 두고 각 path만 활성화
        } catch (e) {
          console.warn(`지자체 ${idx} 렌더링 실패:`, e);
        }
      });
    };

    // 툴팁 표시 함수
    function showTooltip(svg: any, event: any, text: string) {
      const tooltip = svg.append('g').attr('class', 'tooltip').attr('pointer-events','none');
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
    zoomTransformRef.current = transform;
        
        // 단순히 모든 레이어에 동일한 transform 적용
        countryGroup.attr('transform', transform);
        stateGroup.attr('transform', transform);
    muniGroup.attr('transform', transform);
    // pins는 화면 좌표로 다시 그리므로 transform 미적용
    renderPins();

    // 낮은 배율에서는 주/도 경계 숨김 (페인트 비용 절감)
    stateGroup.attr('display', transform.k >= STATE_VISIBLE_K ? null : 'none');
    // 도시/지자체는 더 높은 배율에서만 표시
    muniGroup.attr('display', transform.k >= CITY_VISIBLE_K && selectedISO3 ? null : 'none');
      });

    console.log('Min Zoom:', minZoom.toFixed(3), 'Base Min Zoom:', baseMinZoom.toFixed(3), 'Width Ratio:', minZoomForWidth.toFixed(3));

    if (svgRef.current) {
      // expose zoom behavior for programmatic transforms (cluster click, country fit, etc.)
      zoomBehaviorRef.current = zoom;
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
  muniGroup.attr('display', baseMinZoom >= CITY_VISIBLE_K && selectedISO3 ? null : 'none');
  }

    console.log('상세 지도 렌더링 완료!');

    // 초기 1회 렌더 (줌/레이어 준비 직후)
    renderMunicipalities();
    renderPins();

    // 컴포넌트 언마운트 시 이벤트 리스너 정리
    return () => {
      window.removeEventListener('resize', handleResize);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countries, states, loading, error, focusLatLng, exhibitions]);

  // Render pins/clusters using current projection and zoom transform
  function renderPins() {
    if (!pinsGroupRef.current || !clustersListRef.current) return;
    const pins = d3.select(pinsGroupRef.current);
    const projection = geoMercator()
      .scale(Math.min(window.innerWidth, window.innerHeight) / 7)
      .translate([window.innerWidth / 2, window.innerHeight / 2])
      .center([0, 35]);
    if (focusLatLng) {
      projection.center([focusLatLng.lng, focusLatLng.lat]).scale(1000);
    }
    const path = geoPath().projection(projection);
    const t: any = zoomTransformRef.current;
    const applyT = (pt: [number, number]) => (t && t.apply) ? (t.apply(pt) as [number, number]) : pt;
    // Measure wrap width in projection coords
    const leftBound = projection([-180, 0]);
    const rightBound = projection([180, 0]);
    const worldW = rightBound && leftBound ? (rightBound[0] - leftBound[0]) : window.innerWidth;
    // Build nodes
    const nodes: any[] = [];
    const MAX_EXPANDED_ITEMS = 60;
    for (const c of (clustersListRef.current || [])) {
      const items = c.items as any[];
      const center = [c.centerLon, c.centerLat] as [number, number];
      const pCenter = projection(center) as [number, number] | null;
      if (!pCenter) continue;
      const pCenterT = applyT(pCenter);
      const key = c.key;
      if (items.length === 1) {
        const d0 = items[0];
        const p = projection([d0.longitude, d0.latitude]) as [number, number] | null;
        if (!p) continue;
        const [sx, sy] = applyT(p);
        nodes.push({ ...d0, _cluster: false, px: sx, py: sy });
      } else if (expandedClustersRef.current.has(key)) {
        const sorted = c.sortedByName as any[];
        const count = Math.min(sorted.length, MAX_EXPANDED_ITEMS);
  const isCollapsing = collapseAnimKeyRef.current === key;
        if (isCollapsing) collapsePendingRef.current = count;
        const pts: any[] = [];
        for (let i = 0; i < count; i++) {
          const d0 = sorted[i];
          const pp = projection([d0.longitude, d0.latitude]) as [number, number] | null;
          if (!pp) continue;
          const [sx, sy] = applyT(pp);
          pts.push({ data: d0, x: sx, y: sy, ax: sx, ay: sy });
        }
        // Collision + row packing
        if (pts.length > 1) {
          const MIN_SEP_PX = 20;
          const MAX_OFFSET = 40;
          try {
            const sim = (d3 as any).forceSimulation(pts)
              .force('collide', (d3 as any).forceCollide(MIN_SEP_PX))
              .force('x', (d3 as any).forceX((d:any) => d.ax).strength(0.08))
              .force('y', (d3 as any).forceY((d:any) => d.ay).strength(0.08))
              .alpha(0.9)
              .alphaDecay(0.15)
              .stop();
            for (let i = 0; i < 30; i++) sim.tick();
            for (const n of pts) {
              const dx = n.x - n.ax, dy = n.y - n.ay; const dist = Math.hypot(dx, dy);
              if (dist > MAX_OFFSET) { const k = MAX_OFFSET / dist; n.x = n.ax + dx * k; n.y = n.ay + dy * k; }
            }
          } catch {}
          const ROW_H = 20; const ROW_MAX_DRIFT = 60;
          const viewH = Math.max(400, Math.min(window.innerHeight || 800, 2000));
          const maxRow = Math.max(0, Math.floor(viewH / ROW_H) - 1);
          const usedRows = new Set<number>();
          const assignRow = (y:number, ay:number) => {
            let best = Math.round(y / ROW_H);
            if (!usedRows.has(best)) return best;
            const target = Math.round(ay / ROW_H); let dlt = 1;
            while (dlt < 200) {
              const r1 = target - dlt; if (r1 >= 0 && r1 <= maxRow && !usedRows.has(r1)) return r1;
              const r2 = target + dlt; if (r2 >= 0 && r2 <= maxRow && !usedRows.has(r2)) return r2; dlt++;
            }
            return Math.max(0, Math.min(maxRow, best));
          };
          pts.sort((a,b) => a.ay - b.ay);
          for (const n of pts) {
            const row = assignRow(n.y, n.ay); usedRows.add(row); n.y = row * ROW_H;
            const dyy = n.y - n.ay; if (Math.abs(dyy) > ROW_MAX_DRIFT) n.y = n.ay + Math.sign(dyy || 1) * ROW_MAX_DRIFT;
          }
        }
        for (const n of pts) {
          nodes.push({ ...n.data, _cluster: false, px: n.x, py: n.y, _originX: pCenterT[0], _originY: pCenterT[1], _delayLabelAfterMove: true });
        }
      } else {
        nodes.push({ _cluster: true, key, count: items.length, longitude: c.centerLon, latitude: c.centerLat, px: pCenterT[0], py: pCenterT[1], _wrap: 0 });
        // also add wrapped duplicates for -1 and +1
        const left = applyT([pCenter[0] - worldW, pCenter[1]]);
        const right = applyT([pCenter[0] + worldW, pCenter[1]]);
        nodes.push({ _cluster: true, key: key+':L', count: items.length, longitude: c.centerLon, latitude: c.centerLat, px: left[0], py: left[1], _wrap: -1 });
        nodes.push({ _cluster: true, key: key+':R', count: items.length, longitude: c.centerLon, latitude: c.centerLat, px: right[0], py: right[1], _wrap: +1 });
      }
    }
    // Bind
    const sel = pins.selectAll<SVGGElement, any>('g.pin').data(nodes, (d: any) => {
      if (d._cluster) {
        // normalize wrapped duplicates to share same base key for consistent enter/update
        const base = String(d.key || '').split(':')[0];
        return `cluster:${base}:${d._wrap || 0}`; // include wrap tag so each copy is clickable
      }
      return `pin:${d.id}`;
    });
    sel.exit().remove();
  const enter = sel.enter().append('g').attr('class','pin').style('cursor','pointer');
    // clusters
    const enterCluster = enter.filter((d: any) => d._cluster);
    enterCluster.append('rect')
      .attr('class','cluster-bg')
      .attr('rx', 8).attr('ry', 8)
      .attr('fill', '#111827').attr('stroke', '#E5E7EB').attr('stroke-width', 1.2)
      .attr('x', (d:any) => -Math.max(22, 14 + Math.log2(d.count) * 4) / 2)
      .attr('y', (d:any) => -Math.max(22, 14 + Math.log2(d.count) * 4) / 2)
      .attr('width', (d:any) => Math.max(22, 14 + Math.log2(d.count) * 4))
      .attr('height',(d:any) => Math.max(22, 14 + Math.log2(d.count) * 4));
    enterCluster.append('text')
      .attr('class','cluster-count')
      .attr('text-anchor','middle')
      .attr('dy','0.35em')
      .attr('font-size', (d:any) => Math.max(10, 9 + Math.log2(d.count) * 1.1))
      .attr('font-weight','bold')
      .attr('fill','#ffffff')
      .text((d:any) => d.count);
    // pins
    const enterPin = enter.filter((d:any) => !d._cluster);
    enterPin.append('rect')
      .attr('class','pin-bg')
      .attr('x', -4).attr('y', -4).attr('width', 8).attr('height', 8)
      .attr('rx',2).attr('ry',2)
      .attr('fill','#111827').attr('stroke','#111827').attr('stroke-width',1);
    enterPin.append('text')
      .attr('class','pin-label')
      .attr('dy','0.35em').attr('x',8).attr('text-anchor','start')
      .style('font-size','10px').style('font-weight','bold')
      .style('fill','#333').style('stroke','#fff').style('stroke-width',1.5).style('paint-order','stroke')
      .text((d:any) => String(d.title ?? d.name ?? '').toUpperCase());
    // merge
    const merged = enter.merge(sel as any);
    merged.attr('transform', (d:any) => `translate(${d.px},${d.py})`)
      .on('click', (evt:any, d:any) => {
        evt?.stopPropagation?.();
        if (d._cluster) {
          try { console.debug('[flat] cluster click', d); } catch {}
          const rk = String(d.key || '');
          const key = rk.endsWith(':L') || rk.endsWith(':R') ? rk.slice(0, -2) : rk;
          // focus and zoom to cluster center (two-stage)
          const width = window.innerWidth, height = window.innerHeight;
          const p = projection([d.longitude, d.latitude]) as [number, number];
          const tNow: any = zoomTransformRef.current || d3.zoomIdentity;
          // Stage 1: fit to containing country
          let countryFeature: any | null = null;
          for (const f of countries) {
            try { if (d3.geoContains(f as any, [d.longitude, d.latitude])) { countryFeature = f; break; } } catch {}
          }
          const b = countryFeature ? path.bounds(countryFeature) : [[p[0]-50,p[1]-50],[p[0]+50,p[1]+50]];
          const dx = b[1][0] - b[0][0]; const dy = b[1][1] - b[0][1];
          const margin = 0.05; const targetW = width * (1 - margin*2); const targetH = height * (1 - margin*2);
          let k1 = Math.min(targetW / dx, targetH / dy); k1 = Math.max(k1, (tNow.k||1)); k1 = Math.min(k1, 8);
          const cx = (b[0][0] + b[1][0]) / 2; const cy = (b[0][1] + b[1][1]) / 2;
          const tx1 = width/2 - k1 * cx; const ty1 = height/2 - k1 * cy;
          const selSvg = d3.select(svgRef.current);
          const zoomBeh = zoomBehaviorRef.current;
          if (zoomBeh) {
            selSvg.transition().duration(1200).ease(d3.easeCubicOut)
              .call(zoomBeh.transform as any, d3.zoomIdentity.translate(tx1, ty1).scale(k1))
              .on('end', () => {
                const k2 = 8; const tx2 = width/2 - k2 * cx; const ty2 = height/2 - k2 * cy;
                selSvg.transition().duration(1600).ease(d3.easeCubicInOut)
                  .call(zoomBeh.transform as any, d3.zoomIdentity.translate(tx2, ty2).scale(k2));
              });
          } else {
            // Fallback: apply transform immediately without animation if zoom behavior is unavailable
            (svgRef.current as any) && d3.select(svgRef.current)
              .call((zoomBeh as any)?.transform || (()=>{}), d3.zoomIdentity.translate(tx1, ty1).scale(k1));
          }
          // admin overlay by country ISO3
          if (countryFeature) {
            const iso3 = getISO3(countryFeature.properties);
            if (iso3) { setSelectedISO3(iso3); loadMunicipalities(iso3); }
          }
          if (expandedClustersRef.current.has(key)) {
            collapseAnimKeyRef.current = key; collapseFinalizedRef.current = false;
          } else {
            expandedClustersRef.current.clear(); expandedClustersRef.current.add(key); animateExpandKeyRef.current = key;
          }
          renderPins();
        } else {
          try { onSelectExhibitionRef.current && onSelectExhibitionRef.current(d as Exhibition); } catch {}
        }
      });
    // Cluster hover weight
    merged.filter((d:any) => d._cluster)
      .on('mouseover', function(){ d3.select(this as any).select('.cluster-bg').transition().duration(120).attr('stroke-width', 2); })
      .on('mouseout', function(){ d3.select(this as any).select('.cluster-bg').transition().duration(120).attr('stroke-width', 1.2); });
  }

  // 도시/지자체 오버레이만 갱신 (SVG 재초기화 없이)
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    if (svg.empty()) return;
    const svgAny: any = svg as any;
    let muniGroupSel: any = svgAny.select('g.municipalities');
    if (muniGroupSel.empty()) {
      muniGroupSel = svgAny.append('g').attr('class', 'municipalities').attr('pointer-events', 'none');
    }
  muniGroupSel.selectAll('*').remove();
  if (!selectedISO3 || !muniFeatures || muniFeatures.length < 2) {
      return;
    }
    const projection = geoMercator()
      .scale(Math.min(window.innerWidth, window.innerHeight) / 7)
      .translate([window.innerWidth / 2, window.innerHeight / 2])
      .center([0, 35]);
    const path = geoPath().projection(projection);
    // 로컬 툴팁 헬퍼
    const showLocalTooltip = (root: any, evt: any, text: string) => {
      const tooltip = root.append('g').attr('class', 'tooltip').attr('pointer-events','none');
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
      const [mouseX, mouseY] = d3.pointer(evt, svgRef.current as any);
      tooltip.attr('transform', `translate(${mouseX + 10}, ${mouseY - 10})`);
    };

    muniFeatures.forEach((feat: any, idx: number) => {
      try {
        muniGroupSel.append('path')
          .datum(feat)
          .attr('d', path as any)
          .attr('fill', 'none')
          .attr('stroke', '#000')
          .attr('stroke-width', 0.2)
          .attr('vector-effect', 'non-scaling-stroke')
          .attr('stroke-opacity', 0.9)
          .style('pointer-events', 'visibleStroke')
          .on('mouseover', function(this: SVGPathElement, event: MouseEvent) {
            d3.select(this).attr('stroke-width', 0.35);
            const p = (feat.properties || {});
            const city = getMunicipalityName(p);
            const parent = p?.ADM1_EN || p?.NAME_1 || p?.region || p?.province || '';
            const txt = parent ? `🏙️ ${city} · ${parent}` : `🏙️ ${city}`;
            // tooltip은 최상위 svg에 렌더
            const rootSvg = d3.select(svgRef.current);
            showLocalTooltip(rootSvg, event, txt);
          })
          .on('mouseout', function(this: SVGPathElement) {
            d3.select(this).attr('stroke-width', 0.2);
            d3.select(svgRef.current).select('.tooltip').remove();
          });
      } catch (e) {
        console.warn(`지자체 ${idx} 렌더링 실패:`, e);
      }
    });
    // 현재 줌 상태 반영
    const k = (zoomTransformRef.current && (zoomTransformRef.current as any).k) || 1;
    muniGroupSel.attr('transform', zoomTransformRef.current as any);
    muniGroupSel.attr('display', k >= 2.2 && selectedISO3 ? null : 'none');
  }, [selectedISO3, muniFeatures]);

  // 국가별 도시/지자체 경계 로더
  async function loadMunicipalities(iso3: string) {
    try {
      setMuniLoading(true);
      setMuniError(null);
      setMuniFeatures(null);

      // 1) GeoBoundaries gbRequest로 ADM2 시도 (실패해도 폴백 계속)
      try {
        const reqUrl = `https://www.geoboundaries.org/gbRequest.html?ISO=${encodeURIComponent(iso3)}&ADM=ADM2`;
        const req = await fetch(reqUrl, { mode: 'cors' });
        if (req.ok) {
          let info: any = null;
          try {
            info = await req.json();
          } catch {
            info = null;
          }
          const pick = Array.isArray(info) ? info.find((x: any) => x && typeof x.gjDownloadURL === 'string' && x.gjDownloadURL.includes('.geojson')) : info;
          const dl = pick?.gjDownloadURL || null;
          if (dl) {
            const gj = await fetch(dl, { mode: 'cors' });
            if (gj.ok) {
              let data: any = null;
              try {
                data = await gj.json();
              } catch {
                data = null;
              }
              const feats = data?.features || [];
              if (feats.length) {
                setMuniFeatures(feats);
                setMuniLoading(false);
                return;
              }
            }
          }
        }
      } catch (e) {
        // swallow and fallback
      }

      // 2) 실패 시 ADM1(주/도)로 폴백 (기존 states에서 ISO3 일치 필터)
      const filtered = states.filter((s: any) => {
        const p = s.properties || {};
        const cIso = (p.adm0_a3 || p.ADM0_A3 || p.iso_a3 || p.ISO_A3 || p.GU_A3 || '').toUpperCase();
        return cIso === iso3.toUpperCase();
      });
      if (filtered.length) {
        setMuniFeatures(filtered);
        setMuniLoading(false);
        return;
      }

      throw new Error('No municipal/subdivision data available');
    } catch (e: any) {
      console.warn('Municipality load failed:', e);
      setMuniError(e?.message || 'Failed to load city boundaries');
    } finally {
      setMuniLoading(false);
    }
  }

  // 이름 보조 유틸
  function getCountryName(p: any): string {
    return (
      p?.name || p?.NAME || p?.ADMIN || p?.name_long || p?.SOVEREIGNT || p?.FORMAL_EN || p?.BRK_NAME || 'Unknown Country'
    );
  }
  function getISO3(p: any): string | null {
    const v = p?.iso_a3 || p?.ISO_A3 || p?.adm0_a3 || p?.ADM0_A3 || p?.WB_A3 || p?.GU_A3;
    if (!v) return null;
    const s = String(v).toUpperCase();
    if (s === '---' || s === 'XXX') return null;
  // 일부 데이터셋의 중국 표기 보정
  if (s === 'CHN' || s === 'CN') return 'CHN';
  return s;
  }
  function getMunicipalityName(p: any): string {
    return (
      p?.shapeName || p?.NAME || p?.NAME_2 || p?.NAME_1 || p?.name || p?.full_name || p?.ENGTYPE_2 || 'Unknown City'
    );
  }

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
        {selectedISO3 && (
          <div style={{ color: '#111', marginTop: '6px' }}>
            도시 경계 모드: <strong>{selectedISO3}</strong>
            {muniLoading && <span style={{ marginLeft: 8, color: '#059669' }}>불러오는 중…</span>}
            {muniError && <span style={{ marginLeft: 8, color: '#B91C1C' }}>실패: {muniError}</span>}
            {!muniLoading && !muniError && muniFeatures && (
              <span style={{ marginLeft: 8, color: '#4B5563' }}>경계 {muniFeatures.length}개</span>
            )}
          </div>
        )}
        <div style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>
          마우스오버: 상세정보 | 스크롤: 줌 | 드래그: 이동 | 국가 클릭: 도시 경계 보기
        </div>
      </div>
    </div>
  );
};

export default OpenStreetMapComponent;
