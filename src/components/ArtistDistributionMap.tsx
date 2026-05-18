import React, { useEffect, useRef, useMemo } from 'react';
import * as am5 from '@amcharts/amcharts5';
import * as am5map from '@amcharts/amcharts5/map';
import am5geodata_worldLow from '@amcharts/amcharts5-geodata/worldLow';
import { exhibitions } from '../data/exhibitions';
import { findMuseumForArtwork } from '../utils/museumUtils';
import type { Artwork } from '../types/Artwork';

interface MuseumPoint {
  name: string;
  shortName: string;
  location: string;
  count: number;
  lat: number;
  lng: number;
}

interface ClusterPoint {
  lat: number;
  lng: number;
  count: number;
  museums: MuseumPoint[]; // sorted by count desc
}

interface Props {
  artworks: Artwork[];
  isDark?: boolean;
  hideLegend?: boolean;
  mapHeight?: string;
  drawingStyle?: 'default' | 'drawing-flat';
}

// Known acronyms for common museums
const ACRONYMS: Record<string, string> = {
  'Museum of Modern Art': 'MoMA',
  'Metropolitan Museum': 'Met',
  'Tate Modern': 'Tate',
  'Tate Britain': 'Tate Br',
  'National Gallery': 'NG',
  'Rijksmuseum': 'Rijks',
  'Louvre': 'Louvre',
  'Hermitage': 'Hermitage',
  'Guggenheim': 'Guggen',
  'Whitney Museum': 'Whitney',
  'Centre Pompidou': 'Pompidou',
  'Stedelijk': 'Stedelijk',
  'Victoria and Albert': 'V&A',
  'British Museum': 'Brit.Mus',
  'Kunsthistorisches': 'KHM',
  'Van Gogh Museum': 'VGM',
  'Kröller-Müller': 'K-M',
  'Art Institute of Chicago': 'AIC',
  'Philadelphia Museum': 'PMA',
  'Städel': 'Städel',
};

function abbrevMuseum(name: string): string {
  for (const [key, abbr] of Object.entries(ACRONYMS)) {
    if (name.includes(key)) return abbr;
  }
  const first = name.split(/[\s,\-]+/)[0];
  return first.length > 8 ? first.slice(0, 7) + '.' : first;
}

/**
 * Greedy spatial clustering — merges museums within `thresholdDeg` (great-circle
 * approximation) into a single cluster marker. Museums are processed in descending
 * count order so the dominant museum anchors each cluster position.
 */
function clusterMuseumPoints(points: MuseumPoint[], thresholdDeg: number): ClusterPoint[] {
  const clusters: ClusterPoint[] = [];
  // Process largest first so dominant museum anchors position
  const sorted = [...points].sort((a, b) => b.count - a.count);

  for (const p of sorted) {
    let bestCluster: ClusterPoint | null = null;
    let bestDist = Infinity;

    for (const c of clusters) {
      // Euclidean approximation — good enough for clustering at this zoom level
      const dlat = p.lat - c.lat;
      const dlng = p.lng - c.lng;
      const dist = Math.sqrt(dlat * dlat + dlng * dlng);
      if (dist < thresholdDeg && dist < bestDist) {
        bestDist = dist;
        bestCluster = c;
      }
    }

    if (bestCluster) {
      // Weighted centroid update
      const totalCount = bestCluster.count + p.count;
      bestCluster.lat = (bestCluster.lat * bestCluster.count + p.lat * p.count) / totalCount;
      bestCluster.lng = (bestCluster.lng * bestCluster.count + p.lng * p.count) / totalCount;
      bestCluster.count = totalCount;
      bestCluster.museums.push(p);
    } else {
      clusters.push({ lat: p.lat, lng: p.lng, count: p.count, museums: [p] });
    }
  }

  return clusters.sort((a, b) => b.count - a.count);
}

let mapIdCounter = 0;

const ArtistDistributionMap: React.FC<Props> = ({
  artworks,
  isDark = true,
  hideLegend = false,
  mapHeight,
  drawingStyle = 'default',
}) => {
  const containerId = useRef(`adist-${++mapIdCounter}`);
  const rootRef = useRef<am5.Root | null>(null);
  const isDrawingFlat = drawingStyle === 'drawing-flat';

  // ── Group artworks by museum ───────────────────────────────────────────────
  const museumPoints = useMemo<MuseumPoint[]>(() => {
    const counts = new Map<string, MuseumPoint>();
    for (const artwork of artworks) {
      const enriched = {
        ...artwork,
        museumName:
          (artwork as any).museumName ||
          (artwork as any).museum ||
          (artwork as any).exhibitionName,
        exhibitionId: (artwork as any).exhibitionId,
      };
      const museum = findMuseumForArtwork(enriched, exhibitions);
      if (museum?.latitude && museum?.longitude) {
        const key = museum.id;
        const pt = counts.get(key);
        if (pt) {
          pt.count++;
        } else {
          counts.set(key, {
            name: museum.name,
            shortName: abbrevMuseum(museum.name),
            location: museum.location || '',
            count: 1,
            lat: museum.latitude,
            lng: museum.longitude,
          });
        }
      }
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [artworks]);

  // Cluster nearby museums — threshold scales with map density
  const clusterThresholdDeg = isDrawingFlat ? 6 : 9;
  const clusteredPoints = useMemo(
    () => clusterMuseumPoints(museumPoints, clusterThresholdDeg),
    [museumPoints, clusterThresholdDeg],
  );

  // ── amCharts5 map ──────────────────────────────────────────────────────────
  useEffect(() => {
    const id = containerId.current;
    const root = am5.Root.new(id);
    rootRef.current = root;
    root.setThemes([]);

    // ── Palette ─────────────────────────────────────────────────────────────
    // Drawing mode: light brutalist sketch style
    // Dark mode:    dark luxury (#111 bg, lime accent)
    const bgColor      = isDrawingFlat ? 0xffffff  : (isDark ? 0x111111 : 0xe8e3da);
    const landColor    = isDrawingFlat ? 0xeeece6  : (isDark ? 0x242424 : 0xd4cec4);
    const landStroke   = isDrawingFlat ? 0xc7c2b8  : (isDark ? 0x383838 : 0xbfb9ae);
    const landHover    = isDrawingFlat ? 0xe0ddd6  : (isDark ? 0x2e2e2e : 0xcac4ba);
    // Marker: lime on dark, gold on drawing
    const dotFill      = isDrawingFlat ? 0x8a6420  : 0xd4a547;
    const dotTextColor = isDrawingFlat ? 0xffffff  : 0x111111;
    const tooltipBg    = isDrawingFlat ? 0xffffff  : (isDark ? 0x1a1a1a : 0xffffff);
    const tooltipFg    = isDrawingFlat ? 0x1a1918  : (isDark ? 0xffffff : 0x1a1918);
    const tooltipAccent = isDrawingFlat ? 0x8a6420 : 0xd4a547;

    // ── Chart ───────────────────────────────────────────────────────────────
    const chart = root.container.children.push(
      am5map.MapChart.new(root, {
        projection: am5map.geoMercator(),
        panX: 'translateX',
        panY: 'translateY',
        wheelX: 'none',
        wheelY: 'zoom',
        maxZoomLevel: 8,
        minZoomLevel: 1,
        animationDuration: 400,
        wheelSensitivity: 0.5,
      })
    );
    chart.chartContainer.set('background', am5.Rectangle.new(root, {
      fill: am5.color(bgColor),
      fillOpacity: 1,
    }));

    // ── Country polygons ─────────────────────────────────────────────────────
    const polygonSeries = chart.series.push(
      am5map.MapPolygonSeries.new(root, {
        geoJSON: am5geodata_worldLow,
        exclude: ['AQ'],
      })
    );
    polygonSeries.mapPolygons.template.setAll({
      fill: am5.color(landColor),
      stroke: am5.color(landStroke),
      strokeWidth: isDrawingFlat ? 0.9 : 0.6,
      tooltipText: '',
      interactive: true,
    });
    polygonSeries.mapPolygons.template.states.create('hover', {
      fill: am5.color(landHover),
    });

    // ── Shared tooltip ───────────────────────────────────────────────────────
    const tooltip = am5.Tooltip.new(root, {
      getFillFromSprite: false,
      pointerOrientation: 'up',
      background: am5.RoundedRectangle.new(root, {
        fill: am5.color(tooltipBg),
        fillOpacity: 0.97,
        stroke: am5.color(tooltipAccent),
        strokeOpacity: 0.4,
        strokeWidth: 1,
        cornerRadiusTL: 5,
        cornerRadiusTR: 5,
        cornerRadiusBL: 5,
        cornerRadiusBR: 5,
      }),
    });
    tooltip.label.setAll({
      fill: am5.color(tooltipFg),
      fontSize: 11,
      paddingTop: 7,
      paddingBottom: 7,
      paddingLeft: 10,
      paddingRight: 10,
      lineHeight: 1.5,
    });

    // ── Point markers ────────────────────────────────────────────────────────
    if (clusteredPoints.length > 0) {
      const maxCount = clusteredPoints[0]?.count ?? 1;

      const pointSeries = chart.series.push(
        am5map.MapPointSeries.new(root, {
          latitudeField: 'lat',
          longitudeField: 'lng',
        })
      );

      pointSeries.bullets.push((_root, _series, dataItem) => {
        const d = dataItem.dataContext as ClusterPoint;
        const count = d?.count ?? 1;
        const museums = d?.museums ?? [];

        // Circle diameter: log-scaled, 12px (min) → 30px (max)
        const logRatio  = Math.log(count + 1) / Math.log(maxCount + 1);
        const diameter  = Math.round(12 + 18 * logRatio);
        const radius    = diameter / 2;
        const fontSize  = diameter < 15 ? 7 : diameter < 19 ? 8 : diameter < 24 ? 9 : 10;
        const isCluster = museums.length > 1;

        // ── Tooltip — list every museum with its individual count ────────────
        const fmtCount = (n: number) =>
          n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

        let tooltipText = '';
        const showN  = Math.min(museums.length, 8);
        for (let i = 0; i < showN; i++) {
          const m = museums[i];
          const cStr = fmtCount(m.count);
          if (i === 0) {
            tooltipText += `[bold]${m.name}[/]  ${cStr}`;
          } else {
            tooltipText += `\n${m.name}  ${cStr}`;
          }
        }
        const hiddenMuseums = museums.slice(showN);
        if (hiddenMuseums.length > 0) {
          const hiddenCount = hiddenMuseums.reduce((s, m) => s + m.count, 0);
          tooltipText += `\n[opacity=0.55]+ ${hiddenMuseums.length} more  ${fmtCount(hiddenCount)}[/]`;
        }
        if (isCluster) {
          tooltipText += `\n[opacity=0.4]───────────────────────[/]\n[bold]Total  ${fmtCount(count)}[/]`;
        }

        // ── Container — centered on the map point ────────────────────────────
        const container = am5.Container.new(root, {
          width: diameter,
          height: diameter,
          centerX: am5.p50,
          centerY: am5.p50,
          cursorOverStyle: 'pointer',
          interactive: true,
          tooltipText,
          tooltip,
        });

        // Circle: MUST set x/y at p50 so it centers within the container.
        // Without this the circle's origin sits at the container's (0,0) top-left
        // and the count label renders outside the dot.
        const circle = container.children.push(
          am5.Circle.new(root, {
            radius,
            x: am5.p50,
            y: am5.p50,
            centerX: am5.p50,
            centerY: am5.p50,
            fill: am5.color(dotFill),
            fillOpacity: isCluster ? 0.90 : 0.85,
            stroke: am5.color(isDark && !isDrawingFlat ? 0x111111 : 0x111111),
            strokeOpacity: isCluster ? 0.2 : 0.0,
            strokeWidth: 1,
          })
        );

        // Count label — centered in container, sits on top of circle
        const countLabel = count > 999
          ? `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`
          : String(count);
        container.children.push(
          am5.Label.new(root, {
            text: countLabel,
            x: am5.p50,
            y: am5.p50,
            centerX: am5.p50,
            centerY: am5.p50,
            fontSize,
            fontWeight: '700',
            fill: am5.color(dotTextColor),
          })
        );

        // Hover states
        circle.states.create('hover', {
          fillOpacity: 1,
          strokeOpacity: 0.4,
        });
        container.states.create('hover', {
          scale: 1.2,
        });

        return am5.Bullet.new(root, { sprite: container });
      });

      pointSeries.data.setAll(
        clusteredPoints.map(c => ({
          lat: c.lat,
          lng: c.lng,
          count: c.count,
          museums: c.museums,
        }))
      );
    }

    chart.appear(0, 0);

    return () => {
      root.dispose();
      rootRef.current = null;
    };
  }, [clusteredPoints, isDark, isDrawingFlat]);

  // ── Legend ─────────────────────────────────────────────────────────────────
  const accentLegend = isDark && !isDrawingFlat ? '#d4a547' : '#8a6420';
  const textMain     = isDark && !isDrawingFlat ? '#ffffff' : '#1a1918';
  const textSub      = isDark && !isDrawingFlat ? 'rgba(255,255,255,0.4)' : '#9a9590';
  const borderC      = isDark && !isDrawingFlat ? 'rgba(255,255,255,0.08)' : '#ddd8cf';
  const cardBg       = isDark && !isDrawingFlat ? '#0f0f0f' : '#f5f2ed';

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: mapHeight || '100%',
        overflow: 'hidden',
        filter: isDrawingFlat ? 'url(#dg-sketch-ui)' : 'none',
      }}
    >
      {/* Map canvas */}
      <div id={containerId.current} style={{ flex: 1, minWidth: 0, height: '100%' }} />

      {/* Legend — right panel, scrollable */}
      {!hideLegend && museumPoints.length > 0 && (
        <div
          style={{
            width: 168,
            flexShrink: 0,
            borderLeft: `1px solid ${borderC}`,
            background: cardBg,
            padding: '10px 12px',
            overflowY: 'scroll',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
          } as React.CSSProperties}
        >
          <p
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 11,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: textSub,
              margin: '0 0 10px',
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            Top Museums
          </p>
          {museumPoints.map((m, i) => {
            const pct = Math.round(
              (m.count / (museumPoints[0]?.count ?? 1)) * 100,
            );
            return (
              <div
                key={m.name}
                style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: textMain,
                      lineHeight: 1.35,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                      opacity: Math.max(0.72, 1 - i * 0.025),
                    }}
                  >
                    {m.name}
                  </span>
                  <span
                    style={{
                      fontFamily: "'Space Mono', monospace",
                      fontSize: 12,
                      color: accentLegend,
                      fontVariantNumeric: 'tabular-nums',
                      flexShrink: 0,
                      fontWeight: 700,
                    }}
                  >
                    {m.count >= 1000
                      ? (m.count / 1000).toFixed(1) + 'k'
                      : m.count}
                  </span>
                </div>
                {/* Proportional bar */}
                <div
                  style={{
                    height: 2,
                    background: borderC,
                    borderRadius: 1,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: accentLegend,
                      opacity: Math.max(0.3, 0.8 - i * 0.04),
                      borderRadius: 1,
                      transition: 'width 0.4s',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ArtistDistributionMap;
