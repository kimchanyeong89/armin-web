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

interface Props {
  artworks: Artwork[];
  isDark?: boolean;
  hideLegend?: boolean;
  mapHeight?: string;
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
  // First word, max 8 chars
  const first = name.split(/[\s,\-]+/)[0];
  return first.length > 8 ? first.slice(0, 7) + '.' : first;
}

let mapIdCounter = 0;

const ArtistDistributionMap: React.FC<Props> = ({ artworks, isDark = true, hideLegend = false, mapHeight }) => {
  const containerId = useRef(`adist-${++mapIdCounter}`);
  const rootRef = useRef<am5.Root | null>(null);

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

  // ── amCharts5 map ──────────────────────────────────────────────────────────
  useEffect(() => {
    const id = containerId.current;
    const root = am5.Root.new(id);
    rootRef.current = root;
    root.setThemes([]);

    const bgColor = isDark ? 0x0a0a09 : 0xe8e3da;
    const landColor = isDark ? 0x1d1c1b : 0xd4cec4;
    const landStroke = isDark ? 0x2e2d2b : 0xbfb9ae;
    const dotFill = isDark ? 0xc9a55a : 0x8a6420;
    const dotTextColor = isDark ? 0x0a0800 : 0xffffff;
    const tooltipBg = isDark ? 0x1a1918 : 0xffffff;
    const tooltipFg = isDark ? 0xf0ede6 : 0x1a1918;

    // Chart
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

    // Countries
    const polygonSeries = chart.series.push(
      am5map.MapPolygonSeries.new(root, {
        geoJSON: am5geodata_worldLow,
        exclude: ['AQ'],
      })
    );
    polygonSeries.mapPolygons.template.setAll({
      fill: am5.color(landColor),
      stroke: am5.color(landStroke),
      strokeWidth: 0.5,
      tooltipText: '',
      interactive: false,
    });

    // Shared tooltip (styled to match luxury theme)
    const tooltip = am5.Tooltip.new(root, {
      getFillFromSprite: false,
      pointerOrientation: 'up',
      background: am5.RoundedRectangle.new(root, {
        fill: am5.color(tooltipBg),
        fillOpacity: 0.97,
        stroke: am5.color(dotFill),
        strokeOpacity: 0.5,
        strokeWidth: 1,
        cornerRadiusTL: 6, cornerRadiusTR: 6,
        cornerRadiusBL: 6, cornerRadiusBR: 6,
      }),
    });
    tooltip.label.setAll({
      fill: am5.color(tooltipFg),
      fontSize: 11,
      paddingTop: 6,
      paddingBottom: 6,
      paddingLeft: 8,
      paddingRight: 8,
    });

    // Points — squares with count labels
    if (museumPoints.length > 0) {
      const visiblePoints = museumPoints.slice(0, 40);
      const maxCount = visiblePoints[0]?.count ?? 1;

      const pointSeries = chart.series.push(
        am5map.MapPointSeries.new(root, {
          latitudeField: 'lat',
          longitudeField: 'lng',
        })
      );

      pointSeries.bullets.push((_root, _series, dataItem) => {
        const d = dataItem.dataContext as MuseumPoint;
        const count = d?.count ?? 1;

        // Square size: log-scaled, compact range 10–22px
        const size = Math.round(10 + 12 * Math.log(count + 1) / Math.log(maxCount + 1));
        const fontSize = size < 14 ? 6 : size < 17 ? 7 : 9;

        // Container holds rect + label — centerX/Y centers it on the map point
        const container = am5.Container.new(root, {
          width: size,
          height: size,
          centerX: am5.p50,
          centerY: am5.p50,
          cursorOverStyle: 'pointer',
          interactive: true,
          tooltipText: '[bold]{name}[/]\n{count} works',
          tooltip: tooltip,
        });

        // Gold square background (slightly rounded corners)
        const rect = container.children.push(
          am5.RoundedRectangle.new(root, {
            width: size,
            height: size,
            cornerRadiusTL: 2,
            cornerRadiusTR: 2,
            cornerRadiusBL: 2,
            cornerRadiusBR: 2,
            fill: am5.color(dotFill),
            fillOpacity: 0.88,
            stroke: am5.color(isDark ? 0xf0d898 : 0xffffff),
            strokeWidth: 1,
            strokeOpacity: 0.35,
          })
        );

        // Count label — x/y at 50% positions it at container center, centerX/Y aligns label anchor
        container.children.push(
          am5.Label.new(root, {
            text: count > 999 ? `${Math.round(count / 1000)}k` : count > 99 ? '99+' : String(count),
            x: am5.p50,
            y: am5.p50,
            centerX: am5.p50,
            centerY: am5.p50,
            fontSize,
            fontWeight: '700',
            fill: am5.color(dotTextColor)
          })
        );

        // Hover state
        rect.states.create('hover', {
          fillOpacity: 1,
          strokeOpacity: 0.8,
        });
        container.states.create('hover', {
          scale: 1.3,
        });

        return am5.Bullet.new(root, { sprite: container });
      });

      pointSeries.data.setAll(
        visiblePoints.map(m => ({
          lat: m.lat,
          lng: m.lng,
          name: m.name,
          shortName: m.shortName,
          location: m.location,
          count: m.count,
        }))
      );
    }

    chart.appear(0, 0);

    return () => {
      root.dispose();
      rootRef.current = null;
    };
  }, [museumPoints, isDark]);

  // ── Legend: ALL museums (scrollable) ──────────────────────────────────────
  const accent = isDark ? '#c9a55a' : '#8a6420';
  const textMain = isDark ? '#e8e3da' : '#1a1918';
  const textSub = isDark ? '#7a7570' : '#9a9590';
  const borderC = isDark ? '#2a2927' : '#ddd8cf';
  const cardBg = isDark ? '#111009' : '#f5f2ed';

  return (
    <div style={{ display: 'flex', width: '100%', height: mapHeight || '100%', overflow: 'hidden' }}>
      {/* Map canvas */}
      <div id={containerId.current} style={{ flex: 1, minWidth: 0, height: '100%' }} />

      {/* Legend — right panel, scrollable (scrollbar hidden visually) */}
      {!hideLegend && museumPoints.length > 0 && (
        <div
          style={{
            width: 168,
            flexShrink: 0,
            borderLeft: `1px solid ${borderC}`,
            background: cardBg,
            padding: '10px 12px',
            /* ↓ scroll works, bar hidden */
            overflowY: 'scroll',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
          } as React.CSSProperties}
        >
          <style>{`#adist-legend-${containerId.current.replace(/[^a-z0-9]/g, '')}::-webkit-scrollbar{display:none}`}</style>
          <p style={{
            fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: textSub, margin: '0 0 6px', fontWeight: 600, flexShrink: 0,
          }}>
            Top Museums
          </p>
          {museumPoints.map((m, i) => {
            const pct = Math.round((m.count / (museumPoints[0]?.count ?? 1)) * 100);
            return (
              <div key={m.name} style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                  <span style={{
                    fontSize: 10, color: textMain, lineHeight: 1.3,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                    opacity: Math.max(0.45, 1 - i * 0.05),
                  }}>{m.name}</span>
                  <span style={{
                    fontSize: 10, color: accent, fontVariantNumeric: 'tabular-nums',
                    flexShrink: 0, fontWeight: 600,
                  }}>
                    {m.count >= 1000 ? (m.count / 1000).toFixed(1) + 'k' : m.count}
                  </span>
                </div>
                {/* Proportional bar */}
                <div style={{ height: 2, background: borderC, borderRadius: 1, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`, background: accent,
                    opacity: Math.max(0.25, 0.7 - i * 0.04),
                    borderRadius: 1, transition: 'width 0.4s',
                  }} />
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
