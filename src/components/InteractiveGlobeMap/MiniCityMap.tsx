import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Theme } from "./types";
import { getCityShape } from "./cityMinimapHelper";

interface VenuePoint {
  name: string;
  category: string;
  latitude?: number;
  longitude?: number;
  museumCity?: string;
  isMainCity?: boolean;
}

interface MiniCityMapProps {
  cityName: string;
  venues: VenuePoint[];
  hoveredIdx: number | null;
  onHoverIdx: (idx: number | null) => void;
  onSelectIdx: (idx: number) => void;
  theme: Theme;
  height?: number;
}

interface GroupedCity {
  key: string;
  city: string;
  lat: number;
  lng: number;
  count: number;
  isMain: boolean;
  venues: Array<{ idx: number; venue: VenuePoint; lat: number; lng: number }>;
}

interface LayoutCity {
  key: string;
  city: string;
  count: number;
  isMain: boolean;
  ox: number;
  oy: number;
  shape: string;
  river: string;
}

interface DotPoint {
  cityKey: string;
  idx: number;
  cx: number;
  cy: number;
  lx: number;
  ly: number;
  labelAngle: number;
  label: string;
  showLabel: boolean;
}

const W = 320;
const DEFAULT_HEIGHT = 420;
const FONT_SIZE = 7.4;
const CHAR_W = 4.62;
const LBL_H = 11;
const LBL_PAD_X = 7;
const DEFAULT_ZOOM = 1.24;
const ZOOM_MIN = 0.82;
const ZOOM_MAX = 1.9;

function normCityKey(input: string): string {
  return (input || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function safeNum(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatVenueLabel(name: string): string {
  return (name || "").toUpperCase();
}

function getLabelFitWidth(label: string): number {
  const rawWidth = label.length * CHAR_W + LBL_PAD_X * 2;
  // Keep full label text rendering, but softly cap fit impact to avoid extreme zoom-out.
  return Math.min(rawWidth, 84);
}

function getTextAnchor(angle: number): "start" | "end" | "middle" {
  const c = Math.cos(angle);
  if (c < -0.15) return "end";
  if (c > 0.15) return "start";
  return "middle";
}

function labelRectX(lx: number, angle: number, labelWidth: number): number {
  const anchor = getTextAnchor(angle);
  if (anchor === "end") return lx - labelWidth;
  if (anchor === "middle") return lx - labelWidth / 2;
  return lx;
}

function groupCities(venues: VenuePoint[], cityName: string): GroupedCity[] {
  if (!venues.length) return [];

  const mainKey = normCityKey(cityName);
  const cityMap = new Map<string, GroupedCity>();

  venues.forEach((venue, idx) => {
    const city = (venue.museumCity || cityName || "").trim() || cityName;
    const key = normCityKey(city);
    const lat = safeNum(venue.latitude, 0);
    const lng = safeNum(venue.longitude, 0);
    const isMain = typeof venue.isMainCity === "boolean" ? venue.isMainCity : key === mainKey;

    if (!cityMap.has(key)) {
      cityMap.set(key, {
        key,
        city,
        lat: 0,
        lng: 0,
        count: 0,
        isMain,
        venues: [],
      });
    }

    const target = cityMap.get(key)!;
    target.lat += lat;
    target.lng += lng;
    target.count += 1;
    target.isMain = target.isMain || isMain;
    target.venues.push({ idx, venue, lat, lng });
  });

  const cities = Array.from(cityMap.values()).map((city) => ({
    ...city,
    lat: city.count ? city.lat / city.count : 0,
    lng: city.count ? city.lng / city.count : 0,
  }));

  cities.sort((a, b) => b.count - a.count);
  const mainIdx = cities.findIndex((city) => city.key === mainKey || city.isMain);
  if (mainIdx > 0) {
    const main = cities.splice(mainIdx, 1)[0];
    cities.unshift(main);
  }

  if (!cities.length) return [];
  cities[0].isMain = true;

  return cities;
}

function buildLayout(cities: GroupedCity[]): LayoutCity[] {
  if (!cities.length) return [];

  const main = cities[0];
  const others = cities
    .slice(1)
    .map((city, i) => {
      const dx = city.lng - main.lng;
      const dy = -(city.lat - main.lat) * 1.5;
      const fallbackAngle = (i / Math.max(cities.length - 1, 1)) * Math.PI * 2;
      const angle = Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6 ? fallbackAngle : Math.atan2(dy, dx);
      return { ...city, angle };
    })
    .sort((a, b) => a.angle - b.angle);

  for (let iter = 0; iter < 8; iter++) {
    for (let i = 0; i < others.length; i++) {
      const j = (i + 1) % others.length;
      let diff = others[j].angle - others[i].angle;
      if (diff < 0) diff += Math.PI * 2;
      if (diff < Math.PI / 3.5) {
        others[i].angle -= 0.08;
        others[j].angle += 0.08;
      }
    }
  }

  const radius = 110;
  const layout: LayoutCity[] = [];

  const mainShape = getCityShape(main.city, main.lat, main.lng);
  layout.push({
    key: main.key,
    city: main.city,
    count: main.count,
    isMain: true,
    ox: 0,
    oy: 0,
    shape: mainShape.shape,
    river: mainShape.river,
  });

  others.forEach((city) => {
    let ox = Math.round(Math.cos(city.angle) * radius);
    let oy = Math.round(Math.sin(city.angle) * radius);
    if (city.city.toLowerCase().includes("vatican")) {
      ox = 0;
      oy = 0;
    }

    const shape = getCityShape(city.city, city.lat, city.lng);
    layout.push({
      key: city.key,
      city: city.city,
      count: city.count,
      isMain: false,
      ox,
      oy,
      shape: shape.shape,
      river: shape.river,
    });
  });

  return layout;
}

function buildDots(layoutCities: LayoutCity[], groupedCities: GroupedCity[]): DotPoint[] {
  if (!layoutCities.length) return [];

  const byKey = new Map(groupedCities.map((city) => [city.key, city]));
  const dots: DotPoint[] = [];

  layoutCities.forEach((layoutCity) => {
    const grouped = byKey.get(layoutCity.key);
    if (!grouped) return;

    const cityVenues = grouped.venues;
    if (!cityVenues.length) return;

    const lats = cityVenues.map((v) => v.lat || grouped.lat);
    const lngs = cityVenues.map((v) => v.lng || grouped.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latRange = maxLat - minLat;
    const lngRange = maxLng - minLng;

    const spread = Math.min(20, 12 + cityVenues.length * 0.6);
    const cols = Math.ceil(Math.sqrt(Math.max(cityVenues.length, 1)));
    const rows = Math.ceil(cityVenues.length / cols);
    const labelRingRadius = cityVenues.length >= 16 ? 88 : cityVenues.length >= 11 ? 94 : cityVenues.length >= 7 ? 100 : 108;
    const step = cityVenues.length > 1 ? (Math.PI * 2) / cityVenues.length : 0;
    const startAngle = -Math.PI / 2;

    const positioned = cityVenues.map((entry, i) => {
      let cx =
        lngRange < 0.005
          ? 100 + ((i % cols) / Math.max(cols - 1, 1) - 0.5) * spread * 2
          : 100 + ((entry.lng - minLng) / lngRange - 0.5) * spread * 2;
      let cy =
        latRange < 0.005
          ? 100 + (Math.floor(i / cols) / Math.max(rows - 1, 1) - 0.5) * spread * 2
          : 100 - ((entry.lat - minLat) / latRange - 0.5) * spread * 2;

      if (lngRange === 0 && latRange === 0 && cityVenues.length > 1) {
        const jitterAngle = (i / cityVenues.length) * Math.PI * 2;
        cx += Math.cos(jitterAngle) * 15;
        cy += Math.sin(jitterAngle) * 15;
      }

      return {
        ...entry,
        cx,
        cy,
        lx: 100 + Math.cos(startAngle + i * step) * labelRingRadius,
        ly: 100 + Math.sin(startAngle + i * step) * labelRingRadius,
        labelAngle: startAngle + i * step,
      };
    });

    positioned.forEach((entry) => {
      dots.push({
        cityKey: layoutCity.key,
        idx: entry.idx,
        cx: Math.round(entry.cx + layoutCity.ox),
        cy: Math.round(entry.cy + layoutCity.oy),
        lx: Math.round(entry.lx + layoutCity.ox),
        ly: Math.round(entry.ly + layoutCity.oy),
        labelAngle: entry.labelAngle,
        label: formatVenueLabel(entry.venue.name),
        showLabel: true,
      });
    });
  });

  return dots;
}

function computeViewport(
  layoutCities: LayoutCity[],
  allDots: DotPoint[],
  activeCityKey: string | null,
  canvasHeight: number,
) {
  if (!layoutCities.length) return { scale: 1, tx: 0, ty: 0 };

  let viewW = 260;
  let viewH = 260;
  let viewCx = 100;
  let viewCy = 100;

  if (activeCityKey) {
    const activeCity = layoutCities.find((city) => city.key === activeCityKey) || layoutCities[0];
    const activeDots = allDots.filter((dot) => dot.cityKey === activeCityKey);

    let localMinX = 0;
    let localMaxX = 200;
    let localMinY = 0;
    let localMaxY = 200;

    activeDots.forEach((dot) => {
      const labelW = getLabelFitWidth(dot.label);
      const rx = labelRectX(dot.lx - activeCity.ox, dot.labelAngle, labelW);

      localMinX = Math.min(localMinX, dot.cx - activeCity.ox - 6, rx - 1);
      localMaxX = Math.max(localMaxX, dot.cx - activeCity.ox + 6, rx + labelW + 1);
      localMinY = Math.min(localMinY, dot.cy - activeCity.oy - 6, dot.ly - activeCity.oy - 11);
      localMaxY = Math.max(localMaxY, dot.cy - activeCity.oy + 6, dot.ly - activeCity.oy + 11);
    });

    const bw = Math.max(localMaxX - localMinX, 1);
    const bh = Math.max(localMaxY - localMinY, 1);
    viewW = bw + 6;
    viewH = bh + 8;
    viewCx = activeCity.ox + localMinX + bw / 2;
    viewCy = activeCity.oy + localMinY + bh / 2;
  } else {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    layoutCities.forEach((city) => {
      minX = Math.min(minX, city.ox + 30);
      maxX = Math.max(maxX, city.ox + 170);
      minY = Math.min(minY, city.oy + 30);
      maxY = Math.max(maxY, city.oy + 170);
    });

    const bw = Math.max(maxX - minX, 100);
    const bh = Math.max(maxY - minY, 100);
    viewW = bw;
    viewH = bh;
    viewCx = minX + bw / 2;
    viewCy = minY + bh / 2;
  }

  const guardX = activeCityKey ? 0 : 6;
  const guardY = activeCityKey ? 0 : 8;
  const fitScaleX = (W - guardX * 2) / Math.max(viewW, 1);
  const fitScaleY = (canvasHeight - guardY * 2) / Math.max(viewH, 1);
  let scale = Math.min(fitScaleX, fitScaleY);
  scale = Math.max(0.72, Math.min(scale, 3.8));

  const tx = W / 2 - viewCx * scale;
  const ty = canvasHeight / 2 - viewCy * scale;
  return { scale, tx, ty };
}

function getTouchDistance(touches: TouchList): number | null {
  if (touches.length < 2) return null;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

export function MiniCityMap({
  cityName,
  venues,
  hoveredIdx,
  onHoverIdx,
  onSelectIdx,
  theme,
  height = DEFAULT_HEIGHT,
}: MiniCityMapProps) {
  const t = theme === "light";
  const mapHeight = clamp(Math.round(height), 160, 520);

  const groupedCities = useMemo(() => groupCities(venues, cityName), [venues, cityName]);
  const layoutCities = useMemo(() => buildLayout(groupedCities), [groupedCities]);
  const points = useMemo(() => buildDots(layoutCities, groupedCities), [layoutCities, groupedCities]);
  const primaryCityKey = groupedCities[0]?.key || null;
  const citySignature = useMemo(
    () => groupedCities.map((city) => `${city.key}:${city.count}`).join("|"),
    [groupedCities]
  );

  const [selectedCityKey, setSelectedCityKey] = useState<string | null>(null);
  const [hoveredCityKey, setHoveredCityKey] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
  const zoomTrackRef = useRef<HTMLDivElement | null>(null);
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(DEFAULT_ZOOM);

  const isMultiCity = layoutCities.length > 1;
  const activeCityKey = selectedCityKey;

  useEffect(() => {
    setSelectedCityKey(isMultiCity ? null : primaryCityKey);
    setHoveredCityKey(null);
    setZoomLevel(DEFAULT_ZOOM);
    pinchStartDistanceRef.current = null;
    pinchStartZoomRef.current = DEFAULT_ZOOM;
    onHoverIdx(null);
  }, [cityName, citySignature, primaryCityKey, isMultiCity, onHoverIdx]);

  useEffect(() => {
    if (!layoutCities.length) return;
    if (selectedCityKey === null) return;
    if (selectedCityKey && layoutCities.some((city) => city.key === selectedCityKey)) return;
    setSelectedCityKey(layoutCities.length > 1 ? null : primaryCityKey);
  }, [layoutCities, primaryCityKey, selectedCityKey]);

  useEffect(() => {
    if (hoveredIdx === null) return;
    const hoveredPoint = points.find((point) => point.idx === hoveredIdx);
    if (hoveredPoint && hoveredPoint.cityKey !== selectedCityKey) {
      setSelectedCityKey(hoveredPoint.cityKey);
    }
  }, [hoveredIdx, points, selectedCityKey]);

  const visiblePoints = useMemo(() => {
    if (!activeCityKey) return [];
    return points.filter((point) => point.cityKey === activeCityKey);
  }, [points, activeCityKey]);

  const viewport = useMemo(
    () => computeViewport(layoutCities, points, activeCityKey, mapHeight),
    [layoutCities, points, activeCityKey, mapHeight]
  );

  const effectiveViewport = useMemo(() => {
    const z = clamp(zoomLevel, ZOOM_MIN, ZOOM_MAX);
    const cx = W / 2;
    const cy = mapHeight / 2;
    return {
      scale: viewport.scale * z,
      tx: (viewport.tx - cx) * z + cx,
      ty: (viewport.ty - cy) * z + cy,
    };
  }, [viewport, zoomLevel, mapHeight]);

  const zoomRatio = useMemo(
    () => (clamp(zoomLevel, ZOOM_MIN, ZOOM_MAX) - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN),
    [zoomLevel]
  );

  const shapeStroke = t ? "rgba(0,0,0,0.24)" : "rgba(255,255,255,0.20)";
  const shapeHovered = t ? "rgba(90,120,0,0.75)" : "rgba(191,255,10,0.78)";
  const shapeDim = t ? "rgba(0,0,0,0.11)" : "rgba(255,255,255,0.11)";
  const riverStroke = t ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.11)";
  const dotDefault = t ? "rgba(0,0,0,0.50)" : "rgba(255,255,255,0.50)";
  const dotLime = t ? "#5A7800" : "#BFFF0A";
  const limeGlow = t ? "rgba(90,120,0,0.22)" : "rgba(191,255,10,0.20)";
  const lblDefault = t ? "rgba(0,0,0,0.34)" : "rgba(255,255,255,0.33)";
  const lblActive = t ? "#5A7800" : "#BFFF0A";
  const lblBgHover = t ? "rgba(255,255,255,0.94)" : "rgba(10,10,10,0.92)";
  const leaderDef = t ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.18)";
  const leaderHL = t ? "rgba(90,120,0,0.60)" : "rgba(191,255,10,0.56)";
  const vig = t ? "255,255,255" : "12,12,12";
  const liveLabelFontSize = visiblePoints.length >= 18 ? 5.8 : visiblePoints.length >= 12 ? 6.4 : FONT_SIZE;

  const setZoomFromTrack = (clientY: number) => {
    if (!zoomTrackRef.current) return;
    const rect = zoomTrackRef.current.getBoundingClientRect();
    const y = clamp(clientY - rect.top, 0, rect.height);
    const fromBottom = rect.height - y;
    const ratio = rect.height > 0 ? fromBottom / rect.height : 0;
    const nextZoom = ZOOM_MIN + ratio * (ZOOM_MAX - ZOOM_MIN);
    setZoomLevel(clamp(nextZoom, ZOOM_MIN, ZOOM_MAX));
  };

  return (
    <div
      className="relative w-full overflow-hidden select-none"
      style={{ height: `${mapHeight}px`, touchAction: "none" }}
      onWheel={(e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.07 : -0.07;
        setZoomLevel((z) => clamp(z + delta, ZOOM_MIN, ZOOM_MAX));
      }}
      onTouchStart={(event) => {
        if (event.touches.length < 2) {
          pinchStartDistanceRef.current = null;
          return;
        }
        const distance = getTouchDistance(event.touches);
        if (!distance) return;
        pinchStartDistanceRef.current = distance;
        pinchStartZoomRef.current = zoomLevel;
      }}
      onTouchMove={(event) => {
        if (event.touches.length < 2) return;
        const distance = getTouchDistance(event.touches);
        const startDistance = pinchStartDistanceRef.current;
        if (!distance || !startDistance) return;

        event.preventDefault();
        const ratio = distance / startDistance;
        const nextZoom = clamp(pinchStartZoomRef.current * ratio, ZOOM_MIN, ZOOM_MAX);
        setZoomLevel(nextZoom);
      }}
      onTouchEnd={(event) => {
        if (event.touches.length >= 2) {
          const distance = getTouchDistance(event.touches);
          if (distance) {
            pinchStartDistanceRef.current = distance;
            pinchStartZoomRef.current = zoomLevel;
          }
          return;
        }
        pinchStartDistanceRef.current = null;
      }}
    >
      <svg viewBox={`0 0 ${W} ${mapHeight}`} width="100%" height="100%" style={{ display: "block" }}>
        <g
          style={{
            transform: `translate(${effectiveViewport.tx}px, ${effectiveViewport.ty}px) scale(${effectiveViewport.scale})`,
            transformOrigin: "0 0",
            transition: "transform 620ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {layoutCities.map((city) => {
            const cityHovered = hoveredCityKey === city.key;
            const cityActive = activeCityKey === city.key;
            const cityDimmed = !!activeCityKey && activeCityKey !== city.key;

            return (
              <g key={city.key} transform={`translate(${city.ox} ${city.oy})`}>
                {(cityDimmed || !activeCityKey) && (
                  <path
                    d={city.shape}
                    fill="rgba(0,0,0,0.001)"
                    onClick={() => {
                      setSelectedCityKey(city.key);
                      setHoveredCityKey(city.key);
                      onHoverIdx(null);
                    }}
                    onMouseEnter={() => setHoveredCityKey(city.key)}
                    onMouseLeave={() => setHoveredCityKey(null)}
                    style={{ cursor: "pointer" }}
                  />
                )}

                <path
                  d={city.shape}
                  fill="none"
                  stroke={cityDimmed ? shapeDim : cityHovered ? shapeHovered : shapeStroke}
                  strokeWidth={cityActive ? "2.3" : cityHovered ? "2.15" : city.isMain ? "2.05" : "1.8"}
                  strokeLinejoin="round"
                  style={{ transition: "stroke 0.14s, stroke-width 0.14s, opacity 0.14s" }}
                  opacity={cityDimmed ? 0.85 : 1}
                />
                {city.river && (
                  <path
                    d={city.river}
                    fill="none"
                    stroke={riverStroke}
                    strokeWidth="0.95"
                    strokeDasharray="2.8 2.4"
                    opacity={cityDimmed ? 0.5 : 0.95}
                  />
                )}
              </g>
            );
          })}

          {visiblePoints.map((point) => {
              const isActive = hoveredIdx === point.idx;
              const anchor = getTextAnchor(point.labelAngle);

              const labelW = point.label.length * CHAR_W + LBL_PAD_X * 2;
              const rx = labelRectX(point.lx, point.labelAngle, labelW);
              const leaderPath = `M ${point.cx} ${point.cy} L ${point.lx} ${point.ly}`;

              return (
                <g
                  key={`venue-${point.idx}`}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => onHoverIdx(point.idx)}
                  onMouseLeave={() => onHoverIdx(null)}
                  onClick={() => onSelectIdx(point.idx)}
                >
                  {point.showLabel && (
                    <>
                      <path
                        d={leaderPath}
                        fill="none"
                        stroke={isActive ? leaderHL : leaderDef}
                        strokeWidth={isActive ? "1.06" : "0.62"}
                        style={{ transition: "stroke 0.15s, stroke-width 0.15s" }}
                      />
                      <path
                        d={leaderPath}
                        fill="none"
                        stroke="transparent"
                        strokeWidth="10"
                      />
                    </>
                  )}

                  <AnimatePresence>
                    {isActive && point.showLabel && (
                      <motion.rect
                        key="lbg"
                        x={rx - 1}
                        y={point.ly - LBL_H * 0.67}
                        width={labelW + 2}
                        height={LBL_H + 1}
                        fill={lblBgHover}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.11 }}
                      />
                    )}
                  </AnimatePresence>

                  {point.showLabel && (
                    <>
                      <text
                        x={point.lx}
                        y={point.ly + 2.2}
                        textAnchor={anchor}
                        fontSize={liveLabelFontSize}
                        fontFamily="'Space Mono', monospace"
                        letterSpacing={isActive ? "0.04em" : "0.03em"}
                        fill={isActive ? lblActive : lblDefault}
                        style={{
                          transition: "fill 0.15s, letter-spacing 0.15s",
                          userSelect: "none",
                          stroke: isActive ? "transparent" : t ? "rgba(255,255,255,0.96)" : "rgba(8,8,8,0.92)",
                          strokeWidth: isActive ? 0 : 3.1,
                          paintOrder: "stroke fill",
                          strokeLinejoin: "round",
                        }}
                      >
                        {point.label}
                      </text>
                      <rect x={rx - 4} y={point.ly - 8} width={labelW + 8} height={16} fill="transparent" />
                    </>
                  )}

                  <AnimatePresence>
                    {isActive && (
                      <motion.circle
                        key="glow"
                        cx={point.cx}
                        cy={point.cy}
                        r={11}
                        fill={limeGlow}
                        initial={{ scale: 0.1, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 1.35, opacity: 0 }}
                        style={{ transformOrigin: `${point.cx}px ${point.cy}px` }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                      />
                    )}
                  </AnimatePresence>

                  <motion.circle
                    cx={point.cx}
                    cy={point.cy}
                    r={2.45}
                    fill={isActive ? dotLime : dotDefault}
                    initial={false}
                    animate={{
                      scale: isActive ? 2.2 : 1,
                      fill: isActive ? dotLime : dotDefault,
                    }}
                    style={{ transformOrigin: `${point.cx}px ${point.cy}px` }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
                  />

                  <circle cx={point.cx} cy={point.cy} r={14} fill="transparent" />
                </g>
              );
            })}
        </g>
      </svg>

      <div
        className="absolute"
        style={{
          right: 10,
          top: 12,
          zIndex: 20,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 7,
          padding: "8px 8px 9px",
          borderRadius: 14,
          background: t ? "rgba(255,255,255,0.92)" : "rgba(14,14,14,0.9)",
          border: `1px solid ${t ? "rgba(0,0,0,0.24)" : "rgba(255,255,255,0.28)"}`,
          backdropFilter: "blur(12px)",
          boxShadow: t ? "0 8px 22px rgba(0,0,0,0.16)" : "0 8px 24px rgba(0,0,0,0.42)",
        }}
      >
        <div
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 8,
            letterSpacing: "0.12em",
            color: t ? "rgba(0,0,0,0.56)" : "rgba(255,255,255,0.54)",
            userSelect: "none",
          }}
        >
          ZOOM
        </div>
        <button
          onClick={() => setZoomLevel((z) => clamp(z + 0.08, ZOOM_MIN, ZOOM_MAX))}
          style={{
            width: 24,
            height: 24,
            fontSize: 14,
            lineHeight: 1,
            border: `1px solid ${t ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.14)"}`,
            borderRadius: 8,
            background: t ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.05)",
            color: t ? "rgba(0,0,0,0.78)" : "rgba(255,255,255,0.86)",
            cursor: "pointer",
            padding: 0,
          }}
          aria-label="Zoom in minimap"
        >
          +
        </button>

        <div
          ref={zoomTrackRef}
          onClick={(e) => setZoomFromTrack(e.clientY)}
          onPointerDown={(e) => {
            setZoomFromTrack(e.clientY);
            const move = (ev: PointerEvent) => setZoomFromTrack(ev.clientY);
            const up = () => {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
          }}
          style={{
            width: 12,
            height: 120,
            borderRadius: 999,
            position: "relative",
            cursor: "ns-resize",
            background: t ? "rgba(0,0,0,0.16)" : "rgba(255,255,255,0.2)",
            overflow: "hidden",
          }}
          aria-label="Minimap zoom"
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: `${Math.max(0.06, zoomRatio) * 100}%`,
              background: dotLime,
              opacity: 0.9,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: `calc(${zoomRatio * 100}% - 7px)`,
              transform: "translateX(-50%)",
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: t ? "#ffffff" : "#101010",
              border: `1.8px solid ${dotLime}`,
              boxShadow: t ? "0 2px 6px rgba(0,0,0,0.22)" : "0 2px 6px rgba(0,0,0,0.34)",
            }}
          />
        </div>

        <button
          onClick={() => setZoomLevel((z) => clamp(z - 0.08, ZOOM_MIN, ZOOM_MAX))}
          style={{
            width: 24,
            height: 24,
            fontSize: 14,
            lineHeight: 1,
            border: `1px solid ${t ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.14)"}`,
            borderRadius: 8,
            background: t ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.05)",
            color: t ? "rgba(0,0,0,0.78)" : "rgba(255,255,255,0.86)",
            cursor: "pointer",
            padding: 0,
          }}
          aria-label="Zoom out minimap"
        >
          -
        </button>

        <button
          onClick={() => setZoomLevel(DEFAULT_ZOOM)}
          style={{
            marginTop: 2,
            border: "none",
            background: "transparent",
            fontFamily: "'Space Mono', monospace",
            fontSize: 8,
            letterSpacing: "0.08em",
            color: t ? "rgba(0,0,0,0.56)" : "rgba(255,255,255,0.6)",
            cursor: "pointer",
            padding: "1px 0 0",
          }}
          aria-label="Reset minimap zoom"
        >
          AUTO
        </button>
      </div>

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(to bottom,
            rgba(${vig},0.92) 0%,
            transparent 22%,
            transparent 78%,
            rgba(${vig},0.84) 100%)`,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(to right,
            rgba(${vig},0.72) 0%,
            transparent 18%,
            transparent 82%,
            rgba(${vig},0.72) 100%)`,
        }}
      />
    </div>
  );
}
