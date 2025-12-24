import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { geoPath, geoMercator } from 'd3-geo';
import type { Exhibition } from '../types/Exhibition';
import { resolveStaticUrl } from '../utils/staticAssets';

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
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768
  }));
  const viewportRef = useRef(viewport);
  const [filteredStates, setFilteredStates] = useState<any[]>([]);
  const selectedCountryFeatureRef = useRef<any | null>(null);
  const [muniFeatures, setMuniFeatures] = useState<any[] | null>(null);
  const [showMunicipalities, setShowMunicipalities] = useState(false);
  const [muniLoading, setMuniLoading] = useState(false);
  const [muniError, setMuniError] = useState<string | null>(null);
  const onSelectExhibitionRef = useRef<typeof onSelectExhibition | undefined>(onSelectExhibition);
  useEffect(() => { onSelectExhibitionRef.current = onSelectExhibition; }, [onSelectExhibition]);

  // resolveStaticUrl imported from utils/staticAssets

  const municipalStyle = useMemo(() => {
    const normalized = Math.min(1, Math.max(0.55, viewport.width / 1400));
    const baseWidth = 0.9 + 0.6 * normalized;
    const hoverWidth = baseWidth + 0.4;
    const outlineWidth = Math.max(baseWidth + 0.55, baseWidth * 1.35);
    const opacity = 0.75 + 0.1 * normalized;
    const dashLength = Math.max(6, baseWidth * 5.5);
    const gapLength = Math.max(5, baseWidth * 3.4);
    const dashArray = `${dashLength.toFixed(2)} ${gapLength.toFixed(2)}`;
    const dashOffset = (dashLength / 2).toFixed(2);
    return {
      color: '#1f2937',
      baseWidth,
      hoverWidth,
      outlineWidth,
      opacity,
      dashArray,
      dashOffset,
    };
  }, [viewport.width]);

  useEffect(() => {
    const loadAllData = async () => {
      try {
        setLoading(true);
        
        // 모든 지리 데이터를 병렬로 로드 (더 상세한 국가 경계 사용)
        const countriesUrl = resolveStaticUrl('geodata/countries-50m.json');
        const statesUrl = resolveStaticUrl('geodata/admin1-states-10m.json');
        const [countriesResponse, statesResponse] = await Promise.all([
          fetch(countriesUrl), // 50m 해상도로 변경
          fetch(statesUrl)
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
  // Dynamic cluster grid size based on zoom level
  const getClusterGridSize = (zoomK: number) => {
    // 줌 스케일에 따른 그리드 크기 (도 단위)
    // 런던 박물관들 위도 범위: 약 51.4~51.55, 경도 범위: 약 -0.25~0.05
    // 줌 레벨이 낮을 때 (멀리서 볼 때) 큰 그리드로 클러스터링
    if (zoomK < 8) return 20.0;       // 초기/멀리 - 영국 전체가 하나
    if (zoomK < 15) return 5.0;       // 중간 - 대도시 단위
    if (zoomK < 30) return 1.0;       // 가까이 - 도시 내 구역
    if (zoomK < 60) return 0.2;       // 더 가까이
    return 0.05;                       // 아주 가까이 - 개별 표시
  };
  type ClusterInfo = { key: string; items: Exhibition[]; centerLon: number; centerLat: number; sortedByName: Exhibition[] };
  const clustersListRef = useRef<ClusterInfo[] | null>(null);
  const currentZoomKRef = useRef<number>(1);
  
  // Function to rebuild clusters based on current zoom level
  const rebuildClusters = (zoomK: number) => {
    const list = exhibitions || [];
    const gridSize = getClusterGridSize(zoomK);
    const roundToGrid = (v: number) => Math.round(v / gridSize) * gridSize;
    
    const map: Record<string, Exhibition[]> = {};
    for (const d of list) {
      // 좌표 기반 그리드 클러스터링만 사용 (줌에 따라 동적)
      const gridLon = roundToGrid((d as any).longitude);
      const gridLat = roundToGrid((d as any).latitude);
      const key = `grid:${gridLon},${gridLat}`;
      (map[key] ||= []).push(d);
    }
    clustersListRef.current = Object.entries(map).map(([key, items]) => ({
      key,
      items,
      centerLon: d3.mean(items as any, (d: any) => d.longitude) as number,
      centerLat: d3.mean(items as any, (d: any) => d.latitude) as number,
      sortedByName: [...items].sort((a: any, b: any) => String(a.name || a.title).localeCompare(String(b.name || b.title)))
    }));
    console.log(`[Cluster] Built ${clustersListRef.current.length} clusters at zoom ${zoomK.toFixed(2)}, gridSize ${gridSize}`, 
      clustersListRef.current.map(c => `${c.key}: ${c.items.length} items`));
  };
  
  // Initial cluster build
  useEffect(() => {
    rebuildClusters(currentZoomKRef.current);
    expandedClustersRef.current.clear();
  }, [exhibitions]);

  useEffect(() => {
    if ((!countries.length && !states.length) || loading || error) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const { width, height } = viewport;

    svg.attr('width', width).attr('height', height);

    // 투영법 설정 (메르카토르 - 완전 평면 + 무한 스크롤)
    const projection = geoMercator()
      .scale(Math.min(width, height) / 7)
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
          setShowMunicipalities(false);
          setFilteredStates([]); // 선택 해제 시 주/도 경계선 제거
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
          const countryPath = countryGroup.append('path')
            .datum(country)
            .attr('d', path as any)
            .attr('transform', `translate(${offsetX}, 0)`)
            .attr('fill', 'rgba(255, 255, 255, 0.01)') // 거의 투명한 fill 추가 (호버 영역용)
            .attr('stroke', '#000000')
            .attr('stroke-width', 0.4)
      .attr('vector-effect', 'non-scaling-stroke')
            .attr('stroke-opacity', 0.8)
            .style('cursor', 'pointer');

          countryPath
            .on('mouseover', function(event) {
              d3.select(this).attr('stroke-width', 0.8);
              const countryName = getCountryName(country.properties);
              const emoji = getFlagEmoji(country.properties);
              const centroidLonLat = d3.geoCentroid(country as any);
              const projected = projection(centroidLonLat as [number, number]);
              if (projected) {
                let [cx, cy] = projected;
                cx += offsetX;
                const transform = zoomTransformRef.current && (zoomTransformRef.current as any).apply ? zoomTransformRef.current as any : d3.zoomIdentity;
                const [tx, ty] = transform.apply([cx, cy]);
                showTooltip(svg, event, `${emoji} ${countryName}`, { x: tx, y: ty - 14 });
              } else {
                showTooltip(svg, event, `${emoji} ${countryName}`);
              }
            })
            .on('mouseout', function() {
              d3.select(this).attr('stroke-width', 0.4);
              svg.selectAll('.tooltip').remove();
            })
            .on('click', async (event) => {
              event.stopPropagation();
              const iso3 = getISO3(country.properties);
              if (!iso3) {
                setMuniError('No ISO3 code available for this country');
                return;
              }
              try {
                const b = path.bounds(country);
                const dx = b[1][0] - b[0][0];
                const dy = b[1][1] - b[0][1];
                const safeDx = Math.max(dx, 1e-6);
                const safeDy = Math.max(dy, 1e-6);
                const targetW = width * 0.9;
                const targetH = height * 0.9;
                const scale = Math.max(2.2, Math.min(8, 0.9 / Math.max(safeDx / targetW, safeDy / targetH)));

                const svgNode = svgRef.current;
                if (svgNode) {
                  const pointer = d3.pointer(event, svgNode as any);
                  const currentTransform = zoomTransformRef.current || d3.zoomIdentity;
                  const [px] = currentTransform.invert(pointer as [number, number]);

                  const centroid = d3.geoCentroid(country);
                  const projectedCentroid = projection(centroid);
                  if (projectedCentroid) {
                    const [baseX, baseY] = projectedCentroid;
                    const wraps = Math.round((px - baseX) / actualWorldWidth);
                    const wrappedX = baseX + wraps * actualWorldWidth;

                    const transform = d3.zoomIdentity
                      .translate(width / 2, height / 2)
                      .scale(scale)
                      .translate(-wrappedX, -baseY);

                    d3.select(svgNode)
                      .transition()
                      .duration(850)
                      .ease(d3.easeCubicOut)
                      .call(zoom.transform as any, transform);
                  }
                }
              } catch (e) {
                console.warn('fit to country failed', e);
              }
              setSelectedISO3(iso3);
              selectedCountryFeatureRef.current = country; // remember exact clicked country polygon for spatial fallback
              setShowMunicipalities(true);
              const filtered = states.filter((s: any) => {
                const p = s.properties || {};
                const cIso = (p.adm0_a3 || p.ADM0_A3 || p.iso_a3 || p.ISO_A3 || p.GU_A3 || '').toUpperCase();
                return cIso === iso3.toUpperCase();
              });
              setFilteredStates(filtered);
              await loadMunicipalities(iso3);
            });
        } catch (error) {
          console.warn(`국가 ${index} 렌더링 실패:`, error);
        }
      });
    }

    // 2. 주/도 경계선 그룹 (초기에는 비어 있음)
    const stateGroup = svg.append('g').attr('class', 'states').attr('pointer-events','none');

    // 3. 도시/지자체 경계 오버레이 (선택된 국가만 표시)
  const muniGroup = svg.append('g').attr('class', 'municipalities').attr('pointer-events', 'none');
  const CITY_VISIBLE_K = 2.2;

  // 4. Pins/Clusters layer (screen-space rendering)
  const pinsLayer = svg.append('g').attr('class', 'pins-layer').attr('pointer-events','all');
  // ensure pins are on top for interactions
  pinsLayer.raise();
    pinsGroupRef.current = pinsLayer.node() as SVGGElement;

    // 툴팁 표시 함수
    function showTooltip(svg: any, event: any, text: string, position?: { x: number; y: number }) {
      svg.selectAll('.tooltip').remove();
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

      let targetX: number;
      let targetY: number;
      if (position) {
        targetX = position.x;
        targetY = position.y;
      } else {
        const [mouseX, mouseY] = d3.pointer(event, svgRef.current as any);
        targetX = mouseX + 10;
        targetY = mouseY - 10;
      }
      tooltip.attr('transform', `translate(${targetX}, ${targetY})`);
    }

    // 줌 기능 (국가, 주/도 레이어에 적용) - 줌아웃 제한 추가
    // 지도가 화면에 꽉 차는 최소 줌 레벨 계산
    const minZoomForWidth = width / actualWorldWidth; // 가로로 꽉 차는 줌
    const minZoomForHeight = height / (actualWorldWidth * 0.6); // 세로 비율 고려 (지도는 가로가 더 김)
    const baseMinZoom = Math.max(minZoomForWidth, minZoomForHeight * 0.8); // 안전 마진 추가
    const minZoom = baseMinZoom * 0.85; // 중간값: 15% 정도 더 줌아웃 가능하도록 설정
    
  const STATE_VISIBLE_K = 1.6; // 이 배율 이상에서만 주/도 경계 표시
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([minZoom, 100]) // 최소 줌을 동적으로 계산, 최대는 100
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
    muniGroup.attr('display', transform.k >= CITY_VISIBLE_K && selectedISO3 && showMunicipalities ? null : 'none');
    // 확대 정도와 관계없이 도시 경계선 두께/투명도를 일정하게 유지
    try {
      muniGroup
        .selectAll<SVGPathElement, any>('path.municipality-stroke')
        .attr('stroke-width', municipalStyle.baseWidth)
        .attr('stroke-opacity', municipalStyle.opacity)
        .attr('stroke-dasharray', municipalStyle.dashArray)
        .attr('stroke-dashoffset', municipalStyle.dashOffset);
      muniGroup
        .selectAll<SVGPathElement, any>('path.municipality-outline')
        .attr('stroke-width', municipalStyle.outlineWidth)
        .attr('stroke-dasharray', municipalStyle.dashArray)
        .attr('stroke-dashoffset', municipalStyle.dashOffset);
    } catch {}
      });

    console.log('Min Zoom:', minZoom.toFixed(3), 'Base Min Zoom:', baseMinZoom.toFixed(3), 'Width Ratio:', minZoomForWidth.toFixed(3));

    if (svgRef.current) {
      // expose zoom behavior for programmatic transforms (cluster click, country fit, etc.)
      zoomBehaviorRef.current = zoom;
      const svgSelection = d3.select(svgRef.current);
      svgSelection.call(zoom);

      const initialTransform = d3.zoomIdentity
        .scale(baseMinZoom)
        .translate(width * 0.05, -height * 0.25);
      svgSelection.call(zoom.transform as any, initialTransform);
      zoomTransformRef.current = initialTransform;

  // 초기 표시 상태도 배율 기준으로 맞춤
  stateGroup.attr('display', baseMinZoom >= STATE_VISIBLE_K ? null : 'none');
  muniGroup.attr('display', baseMinZoom >= CITY_VISIBLE_K && selectedISO3 && showMunicipalities ? null : 'none');
  }

    console.log('상세 지도 렌더링 완료!');

    // Global outside-click: collapse any expanded cluster unless clicking a pin
    const onDocClick = (e: MouseEvent) => {
      if (!expandedClustersRef.current.size) return;
      const target = e.target as Element | null;
      if (target && target.closest('.pin')) return;
      expandedClustersRef.current.clear();
      renderPins();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!expandedClustersRef.current.size) return;
      expandedClustersRef.current.clear();
      renderPins();
    };
    document.addEventListener('click', onDocClick, true);
    window.addEventListener('keydown', onKeyDown);

    // 초기 1회 렌더 (줌/레이어 준비 직후)
    renderPins();

    // 컴포넌트 언마운트 시 이벤트 리스너 정리
    return () => {
      document.removeEventListener('click', onDocClick, true);
      window.removeEventListener('keydown', onKeyDown);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countries, states, loading, error, focusLatLng, exhibitions, viewport, municipalStyle]);

  // Render pins/clusters using current projection and zoom transform
  function renderPins() {
    if (!pinsGroupRef.current || !clustersListRef.current) return;
    const pins = d3.select(pinsGroupRef.current);
    const { width, height } = viewportRef.current;
    const projection = geoMercator()
      .scale(Math.min(width, height) / 7)
      .translate([width / 2, height / 2])
      .center([0, 35]);
    if (focusLatLng) {
      projection.center([focusLatLng.lng, focusLatLng.lat]).scale(1000);
    }
    const path = geoPath().projection(projection);
    const t: any = zoomTransformRef.current;
    
    // 줌 레벨이 변경되면 클러스터 재계산 (임계값 낮춤)
    const zoomK = t?.k || 1;
    const prevZoomK = currentZoomKRef.current;
    const prevGridSize = getClusterGridSize(prevZoomK);
    const newGridSize = getClusterGridSize(zoomK);
    // 그리드 크기가 바뀌었을 때만 재계산
    if (prevGridSize !== newGridSize) {
      console.log(`[Cluster] Zoom changed: ${prevZoomK.toFixed(2)} → ${zoomK.toFixed(2)}, grid: ${prevGridSize} → ${newGridSize}`);
      currentZoomKRef.current = zoomK;
      rebuildClusters(zoomK);
    }
    
    const applyT = (pt: [number, number]) => (t && t.apply) ? (t.apply(pt) as [number, number]) : pt;
    const leftBound = projection([-180, 0]);
    const rightBound = projection([180, 0]);
    const worldW = rightBound && leftBound ? (rightBound[0] - leftBound[0]) : width;
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
          nodes.push({
            ...n.data,
            _cluster: false,
            px: n.x,
            py: n.y,
            // keep original projected (screen-space) anchor
            _anchorX: n.ax,
            _anchorY: n.ay,
            _delayLabelAfterMove: true
          });
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
        // Use the full key (e.g., 'city:seoul' or 'grid:127.1,37.5'); only strip wrap suffix ':L' / ':R'
        const raw = String(d.key || '');
        const base = raw.endsWith(':L') || raw.endsWith(':R') ? raw.slice(0, -2) : raw;
        return `cluster:${base}:${d._wrap ?? 0}`; // include wrap tag so each copy is clickable
      }
      return `pin:${d.id}`;
    });
    sel.exit().remove();
  const enter = sel.enter().append('g').attr('class','pin').style('cursor','pointer');
    // clusters
  const enterCluster = enter.filter((d: any) => d._cluster).attr('pointer-events','all');
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
    // link line + origin anchor when pin is displaced from original coordinate
    enterPin.each(function(d:any){
      const g = d3.select(this);
      if (d._anchorX != null && d._anchorY != null) {
        const dx = (d._anchorX - d.px);
        const dy = (d._anchorY - d.py);
        if (Math.hypot(dx, dy) > 1) {
          g.append('line')
            .attr('class','pin-link')
            .attr('x1', dx).attr('y1', dy).attr('x2', 0).attr('y2', 0)
            .attr('stroke', '#1f2937').attr('stroke-width', 1).attr('stroke-opacity', 0.55);
          g.append('circle')
            .attr('class','pin-anchor')
            .attr('cx', dx).attr('cy', dy).attr('r', 2.2)
            .attr('fill', '#111827')
            .attr('stroke', '#ffffff').attr('stroke-width', 0.8).attr('stroke-opacity', 0.9).attr('fill-opacity', 0.9);
        }
      }
    });
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
      .each(function(d:any){
        const gEl = d3.select(this as SVGGElement);
        if (d._anchorX != null && d._anchorY != null) {
          const dx = (d._anchorX - d.px);
          const dy = (d._anchorY - d.py);
          const hasOffset = Math.hypot(dx, dy) > 1;
          let link = gEl.select<SVGLineElement>('line.pin-link');
          let anchor = gEl.select<SVGCircleElement>('circle.pin-anchor');
          if (hasOffset) {
            if (link.empty()) {
              link = gEl.insert('line', ':first-child')
                .attr('class','pin-link')
                .attr('stroke','#1f2937').attr('stroke-width',1).attr('stroke-opacity',0.55);
            }
            link.attr('x1', dx).attr('y1', dy).attr('x2', 0).attr('y2', 0).style('display','');
            if (anchor.empty()) {
              anchor = gEl.insert('circle', ':first-child')
                .attr('class','pin-anchor')
                .attr('r',2.2)
                .attr('fill','#111827')
                .attr('stroke','#ffffff').attr('stroke-width',0.8).attr('stroke-opacity',0.9).attr('fill-opacity',0.9);
            }
            anchor.attr('cx', dx).attr('cy', dy).style('display','');
          } else {
            if (!link.empty()) link.style('display','none');
            if (!anchor.empty()) anchor.style('display','none');
          }
        } else {
          // ensure cleaned when not expanded
          gEl.select('line.pin-link').style('display','none');
          gEl.select('circle.pin-anchor').style('display','none');
        }
      })
      .on('click', (evt:any, d:any) => {
        evt?.stopPropagation?.();
        if (d._cluster) {
          try { console.debug('[flat] cluster click', d); } catch {}
          const rk = String(d.key || '');
          const key = rk.endsWith(':L') || rk.endsWith(':R') ? rk.slice(0, -2) : rk;
          // focus and zoom to cluster center (two-stage)
          const { width, height } = viewportRef.current;
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
                // Stage 2: go deeper to MAX_ZOOM and center on the cluster itself
                const k2 = 100; const tx2 = width/2 - k2 * p[0]; const ty2 = height/2 - k2 * p[1];
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
            if (iso3) {
              setSelectedISO3(iso3);
              setShowMunicipalities(true);
              // 클러스터 클릭 시에도 주/도 경계 필터링
              const filtered = states.filter((s: any) => {
                const p = s.properties || {};
                const cIso = (p.adm0_a3 || p.ADM0_A3 || p.iso_a3 || p.ISO_A3 || p.GU_A3 || '').toUpperCase();
                return cIso === iso3.toUpperCase();
              });
              setFilteredStates(filtered);
              loadMunicipalities(iso3);
            }
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

  // 선택된 국가의 주/도 경계선 렌더링
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    if (svg.empty()) return;
    const stateGroup = svg.select('g.states');
    stateGroup.selectAll('*').remove();

    if (!selectedISO3 || filteredStates.length === 0) {
      return;
    }

    const { width, height } = viewportRef.current;
    const projection = geoMercator()
      .scale(Math.min(width, height) / 7)
      .translate([width / 2, height / 2])
      .center([0, 35]);
    const path = geoPath().projection(projection);

    const leftBound = projection([-180, 0]);
    const rightBound = projection([180, 0]);
    const actualWorldWidth = rightBound && leftBound ? rightBound[0] - leftBound[0] : width;

    for (let offset = -1; offset <= 1; offset++) {
      const offsetX = offset * actualWorldWidth;
      filteredStates.forEach((state, index) => {
        try {
          stateGroup.append('path')
            .datum(state)
            .attr('d', path as any)
            .attr('transform', `translate(${offsetX}, 0)`)
            .attr('fill', 'none')
            .attr('stroke', '#888888')
            .attr('stroke-width', 0.6)
            .attr('vector-effect', 'non-scaling-stroke')
            .attr('stroke-opacity', 0.9)
            .style('pointer-events', 'none');
        } catch (error) {
          console.warn(`주/도 ${index} 렌더링 실패:`, error);
        }
      });
    }

    const transform = zoomTransformRef.current;
    stateGroup.attr('transform', transform as any);
    const k = (transform && (transform as any).k) || 1;
    const STATE_VISIBLE_K = 1.6;
    stateGroup.attr('display', k >= STATE_VISIBLE_K ? null : 'none');

  }, [selectedISO3, filteredStates, viewport]);

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
  if (!showMunicipalities || !selectedISO3 || !muniFeatures || muniFeatures.length < 1) {
      return;
    }
    const { width, height } = viewportRef.current;
    const projection = geoMercator()
      .scale(Math.min(width, height) / 7)
      .translate([width / 2, height / 2])
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

    const hoverOpacity = Math.min(1, municipalStyle.opacity + 0.12);

    muniFeatures.forEach((feat: any, idx: number) => {
      try {
        // 흰색 테두리 path (pointer-events 없음)
        muniGroupSel.append('path')
          .datum(feat)
          .attr('d', path as any)
          .attr('class', 'municipality-outline')
          .attr('fill', 'none')
          .attr('stroke', '#ffffff')
          .attr('stroke-width', municipalStyle.outlineWidth)
          .attr('stroke-dasharray', municipalStyle.dashArray)
          .attr('stroke-dashoffset', municipalStyle.dashOffset)
          .attr('vector-effect', 'non-scaling-stroke')
          .attr('stroke-opacity', 1)
          .attr('stroke-linejoin', 'round')
          .attr('stroke-linecap', 'round')
          .style('pointer-events', 'none');

        // 검은색 메인 path
        muniGroupSel.append('path')
          .datum(feat)
          .attr('d', path as any)
          .attr('class', 'municipality-stroke')
          .attr('fill', 'none')
          .attr('stroke', municipalStyle.color)
          .attr('stroke-width', municipalStyle.baseWidth)
          .attr('stroke-dasharray', municipalStyle.dashArray)
          .attr('stroke-dashoffset', municipalStyle.dashOffset)
          .attr('vector-effect', 'non-scaling-stroke')
          .attr('stroke-opacity', municipalStyle.opacity)
          .attr('stroke-linejoin', 'round')
          .attr('stroke-linecap', 'round')
          .style('pointer-events', 'visibleStroke')
          .on('mouseover', function(this: SVGPathElement, event: MouseEvent) {
            d3.select(this)
              .attr('stroke-width', municipalStyle.hoverWidth)
              .attr('stroke-opacity', hoverOpacity)
              .attr('stroke-dasharray', municipalStyle.dashArray)
              .attr('stroke-dashoffset', municipalStyle.dashOffset);
            const p = (feat.properties || {});
            const city = getMunicipalityName(p);
            const parent = p?.ADM1_EN || p?.NAME_1 || p?.region || p?.province || '';
            const txt = parent ? `🏙️ ${city} · ${parent}` : `🏙️ ${city}`;
            // tooltip은 최상위 svg에 렌더
            const rootSvg = d3.select(svgRef.current);
            showLocalTooltip(rootSvg, event, txt);
          })
          .on('mouseout', function(this: SVGPathElement) {
            d3.select(this)
              .attr('stroke-width', municipalStyle.baseWidth)
              .attr('stroke-opacity', municipalStyle.opacity)
              .attr('stroke-dasharray', municipalStyle.dashArray)
              .attr('stroke-dashoffset', municipalStyle.dashOffset);
            d3.select(svgRef.current).select('.tooltip').remove();
          });
      } catch (e) {
        console.warn(`지자체 ${idx} 렌더링 실패:`, e);
      }
    });
    // 현재 줌 상태 반영
    const k = (zoomTransformRef.current && (zoomTransformRef.current as any).k) || 1;
    muniGroupSel.attr('transform', zoomTransformRef.current as any);
    muniGroupSel.attr('display', k >= 2.2 && selectedISO3 && showMunicipalities ? null : 'none');
  }, [selectedISO3, muniFeatures, showMunicipalities, viewport, municipalStyle]);

  // 국가별 도시/지자체 경계 로더
  async function loadMunicipalities(iso3: string) {
    try {
      setMuniLoading(true);
      setMuniError(null);
      setMuniFeatures(null);

      let adm2Features: any[] = [];

      // 1) GeoBoundaries gbRequest로 ADM2 시도 (corsproxy.io 사용)
      try {
        const apiUrl = `https://www.geoboundaries.org/gbRequest.html?ISO=${encodeURIComponent(iso3)}&ADM=ADM2`;
        const reqUrl = `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`;
        
        const req = await fetch(reqUrl);
        if (req.ok) {
          const info: any = await req.json();
          const pick = Array.isArray(info) ? info.find((x: any) => x && typeof x.gjDownloadURL === 'string' && x.gjDownloadURL.includes('.geojson')) : info;
          const dl = pick?.gjDownloadURL || null;

          if (dl) {
            const proxiedDlUrl = `https://corsproxy.io/?${encodeURIComponent(dl)}`;
            const gj = await fetch(proxiedDlUrl);
            if (gj.ok) {
              const data: any = await gj.json();
              if (data?.features?.length) {
                adm2Features = data.features;
              }
            }
          }
        }
      } catch (e) {
        console.warn('ADM2 data fetch failed, will try to fall back to ADM1.', e);
      }

      // 2) ADM2 데이터가 있으면 사용, 없으면 ADM1(주/도) 데이터로 폴백
      if (adm2Features.length > 0) {
        setMuniFeatures(adm2Features);
      } else {
        let adm1Fallback = states.filter((s: any) => {
          const p = s.properties || {};
          const cIso = (p.adm0_a3 || p.ADM0_A3 || p.iso_a3 || p.ISO_A3 || p.GU_A3 || '').toUpperCase();
          return cIso === iso3.toUpperCase();
        });
        // If no direct ISO3 match, spatial fallback: pick features whose centroid lies inside the clicked country geometry
        if (!adm1Fallback.length && selectedCountryFeatureRef.current) {
          try {
            const countryGeom = selectedCountryFeatureRef.current;
            adm1Fallback = states.filter((s: any) => {
              try { const c = d3.geoCentroid(s as any); return d3.geoContains(countryGeom as any, c); } catch { return false; }
            });
          } catch {}
        }
        if (adm1Fallback.length) {
          console.log(`No ADM2 data for ${iso3}, falling back to ADM1 data (${adm1Fallback.length} features).`);
          setFilteredStates(adm1Fallback);
          setMuniFeatures(adm1Fallback);
        } else {
          throw new Error(`No ADM2 or ADM1 data available for ${iso3}`);
        }
      }

    } catch (e: any) {
      console.error('Municipality load failed:', e);
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
    if (s === '---' || s === 'XXX' || s === '-99') return null;
    // 프랑스 및 일부 국가 코드 보정
    if (p?.SOVEREIGNT === 'France' || p?.ADMIN === 'France') return 'FRA';
    if (s === 'CHN' || s === 'CN') return 'CHN';
    return s;
  }
  function getMunicipalityName(p: any): string {
    return (
      p?.shapeName || p?.NAME || p?.NAME_2 || p?.NAME_1 || p?.name || p?.full_name || p?.ENGTYPE_2 || 'Unknown City'
    );
  }
  function getFlagEmoji(p: any): string {
    const iso2 = getISO2(p);
    if (!iso2) return '🏳️';
    return iso2ToFlag(iso2);
  }

  function iso2ToFlag(iso2: string): string {
    if (!iso2 || iso2.length !== 2) return '🏳️';
    const upper = iso2.toUpperCase();
    const codePoints = [...upper].map(ch => 0x1F1E6 + (ch.charCodeAt(0) - 65));
    return String.fromCodePoint(...codePoints);
  }

  function getISO2(p: any): string | null {
    const raw = p?.iso_a2 || p?.ISO_A2 || p?.adm0_a2 || p?.ADM0_A2 || p?.WB_A2 || p?.GU_A2;
    if (raw && typeof raw === 'string' && raw.trim().length === 2) {
      const val = raw.trim().toUpperCase();
      if (val !== '--') return val;
    }
    const iso3 = getISO3(p);
    if (!iso3) return null;
    const mapped = ISO3_TO_ISO2[iso3];
    return mapped || null;
  }

  const ISO3_TO_ISO2: Record<string, string> = {
    FRA: 'FR',
    CHN: 'CN',
    USA: 'US',
    GBR: 'GB',
    KOR: 'KR',
    PRK: 'KP',
    RUS: 'RU',
    DEU: 'DE',
    ESP: 'ES',
    ITA: 'IT',
    BRA: 'BR',
    CAN: 'CA',
    AUS: 'AU',
    JPN: 'JP',
    MEX: 'MX',
    IND: 'IN',
    TUR: 'TR',
    GRC: 'GR',
    LBY: 'LY',
    EGY: 'EG',
    DZA: 'DZ',
    MAR: 'MA',
    SWE: 'SE',
    FIN: 'FI',
    NLD: 'NL',
    PRT: 'PT',
    POL: 'PL',
    ALB: 'AL',
    SRB: 'RS',
    BIH: 'BA',
    MNE: 'ME',
    BGR: 'BG',
    MKD: 'MK'
  };

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
