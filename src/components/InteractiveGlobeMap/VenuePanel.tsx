import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate, useLocation } from "react-router-dom";
import type { CityMarker, Venue, Theme } from "./types";
import { computeClusterLayout } from "./cityMinimapHelper";

// ─── Helpers ───────────────────────────────────────────────

// Category labels removed — replaced by exhibition-count-based tier system

function formatCoord(lat: number, lon: number): string {
  const latD = lat >= 0 ? "N" : "S";
  const lonD = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(1)}\u00b0${latD}  ${Math.abs(lon).toFixed(1)}\u00b0${lonD}`;
}

// Artwork-count based dot styling (uses real collection sizes)
function venueDotStyle(venue: { artworkCount?: number }, t: boolean): React.CSSProperties {
  const count = (venue as any).artworkCount || 0;
  if (count >= 1000) {
    return { backgroundColor: "#BFFF0A", borderRadius: '1px' };
  } else if (count >= 100) {
    return {
      backgroundColor: t ? "rgba(107,128,0,0.45)" : "rgba(191,255,10,0.45)",
      border: `0.5px solid ${t ? "rgba(107,128,0,0.3)" : "rgba(191,255,10,0.3)"}`,
      borderRadius: '1px'
    };
  }
  return {
    backgroundColor: t ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.25)",
    borderRadius: '1px'
  };
}

// ─── Component ─────────────────────────────────────────────

interface VenuePanelProps {
  city: CityMarker;
  theme: Theme;
  onClose: () => void;
  onSelectVenue?: (venue: Venue) => void;
}

export function VenuePanel({ city, theme, onClose, onSelectVenue }: VenuePanelProps) {
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [hoveredVenueId, setHoveredVenueId] = useState<string | null>(null);
  const [zoomedCity, setZoomedCity] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const t = theme === "light";

  const { layoutCities, minimapDots } = computeClusterLayout(city.city, city.coordinates[1], city.coordinates[0], city.venues);

  const exhibitions = selectedVenue ? selectedVenue.exhibitions : [];

  // base colors
  const borderColor = t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)";
  const fg90 = t ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.75)";
  const fg60 = t ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.50)";
  const fg35 = t ? "rgba(0,0,0,0.30)" : "rgba(255,255,255,0.25)";
  const fg20 = t ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.12)";
  const fg12 = t ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)";
  const divider = t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.04)";
  const limeAccent = t ? "#5A7800" : "#BFFF0A";

  const handleSelectVenue = (v: Venue) => {
    setSelectedVenue(v);
    if (onSelectVenue) onSelectVenue(v);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, x: 0, y: "-50%" }}
      animate={{ opacity: 1, scale: 1, x: 0, y: "-50%" }}
      exit={{ opacity: 0, scale: 0.95, x: 0, y: "-50%" }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`ig-venue-panel`}
      style={{
        backgroundColor: t ? "rgba(255,255,255,0.92)" : "rgba(12,12,12,0.92)",
        borderColor: borderColor
      }}
    >
      <AnimatePresence mode="wait">
        {!selectedVenue ? (
          /* ── Venue list ── */
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.15 }}
            className="ig-flex-col"
            style={{ height: '100%' }}
          >
            {/* Header */}
            <div className="ig-vp-header">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ color: fg90, letterSpacing: "0.18em", textTransform: "uppercase", fontSize: "14px" }}>
                    {city.city}
                  </div>
                  <div style={{ color: fg35, marginTop: '4px', fontSize: "11px" }}>
                    {city.country}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="ig-vp-btn-close"
                  style={{ color: fg35 }}
                >
                  &times;
                </button>
              </div>

              {layoutCities.length > 1 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px' }}>
                  <button
                    onClick={() => setZoomedCity(null)}
                    style={{
                      background: zoomedCity === null ? (t ? '#000' : '#FFF') : 'transparent',
                      color: zoomedCity === null ? (t ? '#FFF' : '#000') : fg60,
                      border: `1px solid ${zoomedCity === null ? 'transparent' : divider}`,
                      borderRadius: '100px', padding: '4px 10px', fontSize: '9px', fontWeight: zoomedCity === null ? 'bold' : 'normal',
                      textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer', transition: 'all 0.2s', 
                    }}
                  >
                    ALL
                  </button>
                  {layoutCities.map(lc => (
                    <button
                      key={lc.city}
                      onClick={() => setZoomedCity(lc.city)}
                      style={{
                        background: zoomedCity === lc.city ? (t ? '#000' : '#FFF') : 'transparent',
                        color: zoomedCity === lc.city ? (t ? '#FFF' : '#000') : fg60,
                        border: `1px solid ${zoomedCity === lc.city ? 'transparent' : divider}`,
                        borderRadius: '100px', padding: '4px 10px', fontSize: '9px', fontWeight: zoomedCity === lc.city ? 'bold' : 'normal',
                        textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer', transition: 'all 0.2s', 
                      }}
                    >
                      {lc.city}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 mt-3">
                <span style={{ color: fg20, fontSize: "10px" }}>
                  {formatCoord(city.coordinates[1], city.coordinates[0])}
                </span>
                <span style={{ color: fg12, fontSize: "10px" }}>&middot;</span>
                <span style={{ color: fg20, fontSize: "10px" }}>
                  {city.venues.length} {city.venues.length === 1 ? "venue" : "venues"}
                </span>
              </div>

              <div className="ig-vp-divider" style={{ backgroundColor: divider }} />

              {/* Venue Minimap Interactive */}
              <div 
                style={{
                  flex: 1,
                  minHeight: '450px',
                  position: 'relative',
                  width: '100%',
                  marginTop: '16px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: t ? "rgba(0,0,0,0.015)" : "rgba(255,255,255,0.015)"
                }}
              >
                {(() => {
                  // Compute dynamic viewbox based on zoomed city
                  let minX = 0, maxX = 0, minY = 0, maxY = 0;
                  let isFirst = true;

                  if (zoomedCity) {
                    // Only consider the zoomed city and its labels
                    const activeLc = layoutCities.find(c => c.city === zoomedCity);
                    if (activeLc) {
                        minX = activeLc.ox + 50; maxX = activeLc.ox + 150;
                        minY = activeLc.oy + 50; maxY = activeLc.oy + 150;
                        isFirst = false;
                    }
                    minimapDots.filter(m => m.lc.city === zoomedCity).forEach(m => {
                        const textLen = (m.venue?.name || '').length * 4.5;
                        minX = Math.min(minX, m.lx - textLen - 15);
                        maxX = Math.max(maxX, m.lx + textLen + 15);
                        minY = Math.min(minY, m.ly - 15);
                        maxY = Math.max(maxY, m.ly + 15);
                    });
                  } else if (layoutCities.length === 1) {
                    // 단일 city 클러스터: zoomed 로직으로 dot 위치 기준 계산
                    const lc = layoutCities[0];
                    minX = lc.ox + 50; maxX = lc.ox + 150;
                    minY = lc.oy + 50; maxY = lc.oy + 150;
                    isFirst = false;
                    minimapDots.forEach(m => {
                        const textLen = (m.venue?.name || '').length * 4.5;
                        minX = Math.min(minX, m.lx - textLen - 15);
                        maxX = Math.max(maxX, m.lx + textLen + 15);
                        minY = Math.min(minY, m.ly - 15);
                        maxY = Math.max(maxY, m.ly + 15);
                    });
                  } else {
                    // Global view, just the city shapes
                    layoutCities.forEach(lc => {
                      if (isFirst) {
                          minX = lc.ox; maxX = lc.ox + 200;
                          minY = lc.oy; maxY = lc.oy + 200;
                          isFirst = false;
                      } else {
                          minX = Math.min(minX, lc.ox);
                          maxX = Math.max(maxX, lc.ox + 200);
                          minY = Math.min(minY, lc.oy);
                          maxY = Math.max(maxY, lc.oy + 200);
                      }
                    });
                  }

                  // Minimum dimensions to prevent extreme zoom-ins/outs
                  let tempW = maxX - minX;
                  let tempH = maxY - minY;
                  if (zoomedCity || layoutCities.length === 1) {
                    // 도시 선택 or 단일 city: 적당한 확대 유지
                    const minTarget = 450;
                    if (tempW < minTarget) { const m = (minTarget - tempW) / 2; minX -= m; maxX += m; }
                    if (tempH < minTarget) { const m = (minTarget - tempH) / 2; minY -= m; maxY += m; }
                  } else {
                    // Slight extra zoom out in whole-view state
                    const wExtra = tempW * 0.35;
                    const hExtra = tempH * 0.35;
                    minX -= wExtra; maxX += wExtra;
                    minY -= hExtra; maxY += hExtra;
                  }

                  const pad = (zoomedCity || layoutCities.length === 1) ? 40 : 60;
                  minX -= pad; maxX += pad;
                  minY -= pad; maxY += pad;

                  const vw = maxX - minX;
                  const vh = maxY - minY;
                  
                  return (
                    <motion.svg 
                       width="100%" height="100%" 
                       animate={{ viewBox: `${minX} ${minY} ${vw} ${vh}` }} 
                       transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
                       style={{ display: 'block', overflow: 'hidden' }}
                    >
                      <rect 
                        x={minX - 500} y={minY - 500} width={vw + 1000} height={vh + 1000} 
                        fill="none" 
                        pointerEvents="all"
                        onClick={() => zoomedCity && setZoomedCity(null)}
                      />
                      {layoutCities.map((lc, idx) => {
                        const isZoomed = zoomedCity === lc.city;
                        const isHidden = zoomedCity && !isZoomed;
                        return (
                        <motion.g 
                          key={`lc-${idx}`}
                          animate={{ 
                              x: lc.ox, y: lc.oy, 
                              opacity: isHidden ? 0.1 : 1,
                              scale: isHidden ? 0.98 : 1
                          }}
                          transition={{ duration: 0.5 }}
                          style={{ cursor: zoomedCity ? 'default' : 'pointer' }}
                          onClick={() => !zoomedCity && setZoomedCity(lc.city)}
                        >
                          <path 
                            d={lc.river} 
                            fill="none" 
                            stroke={t ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.15)"} 
                            strokeWidth="1.2" 
                            strokeDasharray="4 3"
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                          />
                          <path 
                            d={lc.shape} 
                            fill={t ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)"} 
                            stroke={t ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.15)"} 
                            strokeWidth="1" 
                            strokeLinejoin="round" 
                          />
                          {!zoomedCity && (
                            <text
                              x="100" y="100"
                              fill={t ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.4)"}
                              fontSize="10"
                              fontWeight="600"
                              letterSpacing="0.25em"
                              textAnchor="middle"
                              fontFamily="'Space Grotesk', sans-serif"
                              style={{ pointerEvents: 'none' }}
                            >
                              {lc.city.toUpperCase()}
                            </text>
                          )}
                          {zoomedCity && !isZoomed && lc.city !== city.city && (
                            <text
                              x="100" y="100"
                              fill={t ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"}
                              fontSize="9"
                              letterSpacing="0.25em"
                              textAnchor="middle"
                              fontFamily="'Space Grotesk', sans-serif"
                              style={{ pointerEvents: 'none' }}
                            >
                              {lc.city.toUpperCase()}
                            </text>
                          )}
                        </motion.g>
                      )})}
                      
                      <AnimatePresence>
                      {minimapDots.map((dot, idx) => {
                        if (zoomedCity && dot.lc.city !== zoomedCity) return null;

                        // 단일 도시 클러스터이거나, 도시가 선택(zoom)된 경우 인터랙티브
                        const isSingleCity = layoutCities.length === 1;
                        const isInteractive = !!zoomedCity || isSingleCity;
                        // 레이블은 zoomedCity 됐거나 단일 도시일 때 표시
                        const showLabels = isInteractive;

                        const lAngle = dot.labelAngle ?? 0;
                        let anchor: "start"|"middle"|"end" = "middle";
                        if (Math.cos(lAngle) < -0.15) anchor = "end";
                        else if (Math.cos(lAngle) > 0.15) anchor = "start";
                        
                        const isHovered = isInteractive && hoveredVenueId === dot.venue?.id;
                        const isDimmed = isInteractive && hoveredVenueId !== null && !isHovered;
                        
                        return (
                          <motion.g 
                            key={`dot-${idx}`} 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: isDimmed ? 0.25 : 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            onClick={() => { if(isInteractive && dot.venue) handleSelectVenue(dot.venue); }}
                            onMouseEnter={() => isInteractive && setHoveredVenueId(dot.venue?.id || null)}
                            onMouseLeave={() => isInteractive && setHoveredVenueId(null)}
                            style={{ cursor: isInteractive ? 'pointer' : 'default', pointerEvents: isInteractive ? 'auto' : 'none' }}
                            className="ig-minimap-venue-group"
                          >
                            {/* 연결선: 인터랙티브 + 레이블 표시될 때만 */}
                            {showLabels && (
                              <line 
                                x1={dot.cx} y1={dot.cy} 
                                x2={dot.lx} y2={dot.ly} 
                                stroke={isHovered
                                  ? (t ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.55)")
                                  : (t ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.2)")}
                                strokeWidth={isHovered ? "1" : "0.7"}
                                style={{ transition: 'stroke 0.2s, stroke-width 0.2s' }}
                              />
                            )}

                            {/* 글로우 링 (호버시) */}
                            {isHovered && (
                              <>
                                <circle 
                                  cx={dot.cx} cy={dot.cy} r="14" 
                                  fill={t ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.06)"}
                                />
                                <circle 
                                  cx={dot.cx} cy={dot.cy} r="10" 
                                  fill="none"
                                  stroke={t ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.2)"}
                                  strokeWidth="1"
                                  strokeDasharray="3 2"
                                />
                              </>
                            )}

                            {/* 메인 도트 */}
                            <circle 
                              cx={dot.cx} 
                              cy={dot.cy} 
                              r={!isInteractive ? 2 : isHovered ? 5.5 : 3.5}
                              fill={
                                !isInteractive
                                  ? (t ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.45)")
                                  : isHovered
                                    ? (t ? "#000" : "#BFFF0A")
                                    : (t ? "#222" : "#BFFF0A")
                              }
                              stroke={isInteractive ? (t ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.5)") : "none"}
                              strokeWidth={isInteractive ? "1.5" : "0"}
                              style={{ transition: 'r 0.25s cubic-bezier(0.34,1.56,0.64,1), fill 0.2s' }}
                            />

                            {/* 레이블 (인터랙티브 + showLabels) */}
                            {showLabels && (
                              <text 
                                x={dot.lx} 
                                y={dot.ly}
                                fontSize={isHovered ? "11.5" : "9.5"} 
                                fontWeight={isHovered ? "600" : "400"}
                                fontFamily="'Space Grotesk', sans-serif"
                                letterSpacing={isHovered ? "0.04em" : "0.06em"}
                                fill={
                                  t
                                    ? (isHovered ? "rgba(0,0,0,0.9)" : "rgba(0,0,0,0.45)")
                                    : (isHovered ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.5)")
                                }
                                textAnchor={anchor} 
                                alignmentBaseline="middle"
                                style={{ transition: 'all 0.2s' }}
                              >
                                {dot.venue?.name}
                              </text>
                            )}

                            {/* 호버시 전시 수 표시 */}
                            {showLabels && isHovered && dot.venue?.exhibitions?.length > 0 && (
                              <text
                                x={dot.lx}
                                y={dot.ly + 14}
                                fontSize="8"
                                fontFamily="'Space Mono', monospace"
                                letterSpacing="0.08em"
                                fill={t ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.35)"}
                                textAnchor={anchor}
                                alignmentBaseline="middle"
                              >
                                {dot.venue.exhibitions.length} {dot.venue.exhibitions.length === 1 ? 'exhibition' : 'exhibitions'}
                              </text>
                            )}
                          </motion.g>
                        );
                      })}
                      </AnimatePresence>
                    </motion.svg>
                  );
                })()}
              </div>

            </div>
          </motion.div>
        ) : (
          /* ── Venue detail ── */
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="ig-flex-col"
            style={{ height: '100%' }}
          >
            {/* Back */}
            <div className="ig-vp-detail-header">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button
                  onClick={() => setSelectedVenue(null)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', color: fg35, fontSize: "10px", background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  <span>&larr;</span>
                  <span style={{ letterSpacing: '0.12em', textTransform: 'uppercase' }}>{city.city}</span>
                </button>
                <button
                  onClick={onClose}
                  className="ig-vp-btn-close"
                  style={{ color: fg35 }}
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Venue info */}
            <div className="ig-vp-detail-info">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div
                  className="ig-dot"
                  style={{ marginTop: '6px', flexShrink: 0, ...venueDotStyle(selectedVenue, t) }}
                />
                <div className="ig-min-w-0" style={{ flex: 1 }}>
                  <div style={{ color: fg90, letterSpacing: '0.06em', fontSize: "16px" }}>
                    {selectedVenue.name}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '16px', marginLeft: '19px' }}>
                <span style={{ color: fg20, fontSize: "12px" }}>
                  {selectedVenue.year}
                </span>
                {selectedVenue.architect && (
                  <>
                    <span style={{ color: fg12 }}>&middot;</span>
                    <span style={{ color: fg35, fontSize: "12px" }}>
                      {selectedVenue.architect}
                    </span>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px', marginLeft: '19px' }}>
                <span style={{ color: fg20, letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: "9px" }}>
                  {selectedVenue.exhibitions.length} {selectedVenue.exhibitions.length === 1 ? 'Exhibition' : 'Exhibitions'}
                </span>
              </div>

              <div className="ig-vp-divider" style={{ backgroundColor: divider, marginTop: '24px' }} />
            </div>

            {/* Exhibitions section */}
            <div className="ig-vp-exhibitions">
              {exhibitions.length > 0 ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <span style={{ color: fg20, letterSpacing: '0.2em', textTransform: 'uppercase', fontSize: "9px" }}>
                      Exhibitions
                    </span>
                    <span style={{ color: fg12, fontSize: "9px" }}>
                      {exhibitions.length}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {exhibitions.map((ex, i) => (
                      <div 
                        key={ex.title + i} 
                        className="ig-exhibition-card" 
                        onClick={() => {
                          // 직접 collection 페이지로 라우팅. 뒤로가기시 인터랙티브맵 복귀
                          navigate(`/collection/${encodeURIComponent(ex.id)}`, {
                            state: { fromInteractiveMap: true, returnPath: location.pathname + location.search }
                          });
                        }}
                        style={{ cursor: "pointer", backgroundColor: t ? "rgba(0,0,0,0.015)" : "rgba(255,255,255,0.015)" }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                          <div style={{ flexShrink: 0, marginTop: '6px' }}>
                            <div
                              style={{
                                width: '5px', height: '5px', borderRadius: '50%',
                                backgroundColor:
                                  ex.type === "current"
                                    ? (t ? "#6B8A00" : "#BFFF0A")
                                    : ex.type === "upcoming"
                                      ? (t ? "rgba(107,138,0,0.4)" : "rgba(191,255,10,0.35)")
                                      : (t ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.15)"),
                              }}
                            />
                          </div>
                          <div className="ig-min-w-0" style={{ flex: 1 }}>
                            <div style={{ color: fg60, fontSize: "13px" }}>
                              {ex.title}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                              <span style={{ color: fg20, fontSize: "10px" }}>
                                {ex.period}
                              </span>
                              <span
                                style={{
                                  letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: "8px",
                                  color: ex.type === "current" ? limeAccent
                                    : ex.type === "upcoming" ? (t ? "rgba(90,120,0,0.6)" : "rgba(191,255,10,0.5)")
                                      : fg12
                                }}
                              >
                                {ex.type === "permanent" ? "Permanent" : ex.type === "current" ? "Current" : "Upcoming"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ color: fg12, letterSpacing: '0.1em', marginTop: '16px', fontSize: "11px" }}>
                  No exhibition data available
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="ig-vp-footer" style={{ borderColor: borderColor }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: fg12, fontSize: "9px" }}>
                  {formatCoord(city.coordinates[1], city.coordinates[0])}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}