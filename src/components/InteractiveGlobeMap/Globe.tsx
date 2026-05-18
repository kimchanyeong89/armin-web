import { useRef, useEffect, useState, useCallback } from "react";
import * as d3 from "d3";
import { feature, mesh } from "topojson-client";
import type { AppLanguage } from "../../contexts/LanguageContext";
import { localizeCityName, localizeContinentName, localizeCountryName } from "../../i18n/geoLocalization";

// ─── Types ─────────────────────────────────────────────────
import type { Theme, CityMarker } from "./types";

interface DrilledCountry {
  feature: any;
  name: string;
  id: string;
}

interface MuseumPoint {
  key: string;
  cityKey: string;
  city: CityMarker;
  country: string;
  coordinates: [number, number];
  venueName: string;
  artworkCount: number;
  isMajor: boolean;
}

const MAJOR_MUSEUM_HINTS = [
  "louvre",
  "metropolitan museum",
  "museum of modern art",
  "moma",
  "tate",
  "british museum",
  "national gallery",
  "rijksmuseum",
  "uffizi",
  "prado",
  "pompidou",
  "vatican",
  "hermitage",
  "guggenheim",
  "whitney",
  "orsay",
  "albertina",
  "smithsonian",
];

function isLikelyMajorMuseum(name: string, artworkCount: number): boolean {
  const normalized = String(name || "").toLowerCase();
  if (artworkCount >= 700) return true;
  return MAJOR_MUSEUM_HINTS.some((hint) => normalized.includes(hint));
}

// ─── Country Names (ISO 3166-1 numeric) ────────────────────

const COUNTRY_NAMES: Record<string, string> = {
  "004": "Afghanistan", "008": "Albania", "012": "Algeria", "024": "Angola",
  "032": "Argentina", "036": "Australia", "040": "Austria", "050": "Bangladesh",
  "056": "Belgium", "064": "Bhutan", "068": "Bolivia", "070": "Bosnia and Herzegovina",
  "076": "Brazil", "100": "Bulgaria", "104": "Myanmar", "116": "Cambodia",
  "120": "Cameroon", "124": "Canada", "144": "Sri Lanka", "152": "Chile",
  "156": "China", "158": "Taiwan", "170": "Colombia", "178": "Congo", "180": "DR Congo",
  "188": "Costa Rica", "191": "Croatia", "192": "Cuba", "196": "Cyprus",
  "203": "Czech Republic", "208": "Denmark", "214": "Dominican Republic",
  "218": "Ecuador", "818": "Egypt", "222": "El Salvador", "231": "Ethiopia",
  "232": "Eritrea", "233": "Estonia", "246": "Finland", "250": "France",
  "266": "Gabon", "270": "Gambia", "276": "Germany", "288": "Ghana",
  "300": "Greece", "320": "Guatemala", "324": "Guinea", "332": "Haiti",
  "340": "Honduras", "344": "Hong Kong", "348": "Hungary", "352": "Iceland", "356": "India",
  "360": "Indonesia", "364": "Iran", "368": "Iraq", "372": "Ireland",
  "376": "Israel", "380": "Italy", "384": "Ivory Coast", "388": "Jamaica",
  "392": "Japan", "400": "Jordan", "398": "Kazakhstan", "404": "Kenya",
  "408": "North Korea", "410": "South Korea", "414": "Kuwait", "418": "Laos",
  "422": "Lebanon", "426": "Lesotho", "428": "Latvia", "434": "Libya",
  "440": "Lithuania", "442": "Luxembourg", "450": "Madagascar", "454": "Malawi",
  "458": "Malaysia", "466": "Mali", "478": "Mauritania", "484": "Mexico",
  "496": "Mongolia", "504": "Morocco", "508": "Mozambique", "516": "Namibia",
  "524": "Nepal", "528": "Netherlands", "540": "New Caledonia",
  "554": "New Zealand", "558": "Nicaragua", "562": "Niger", "566": "Nigeria",
  "578": "Norway", "512": "Oman", "586": "Pakistan", "591": "Panama",
  "598": "Papua New Guinea", "600": "Paraguay", "604": "Peru",
  "608": "Philippines", "616": "Poland", "620": "Portugal", "630": "Puerto Rico",
  "634": "Qatar", "642": "Romania", "643": "Russia", "646": "Rwanda",
  "682": "Saudi Arabia", "686": "Senegal", "688": "Serbia", "694": "Sierra Leone",
  "702": "Singapore", "703": "Slovakia", "704": "Vietnam", "705": "Slovenia",
  "706": "Somalia", "710": "South Africa", "716": "Zimbabwe", "724": "Spain",
  "728": "South Sudan", "729": "Sudan", "740": "Suriname", "752": "Sweden",
  "756": "Switzerland", "760": "Syria", "762": "Tajikistan", "764": "Thailand",
  "768": "Togo", "780": "Trinidad and Tobago", "784": "UAE", "788": "Tunisia",
  "792": "Turkey", "795": "Turkmenistan", "800": "Uganda", "804": "Ukraine",
  "807": "North Macedonia", "826": "United Kingdom", "834": "Tanzania",
  "840": "United States", "858": "Uruguay", "860": "Uzbekistan",
  "862": "Venezuela", "887": "Yemen", "894": "Zambia", "-99": "N. Cyprus",
};

const CONTINENT_MAP: Record<string, string> = {
  "Afghanistan": "Asia", "Albania": "Europe", "Algeria": "Africa", "Angola": "Africa",
  "Argentina": "South America", "Australia": "Oceania", "Austria": "Europe", "Bangladesh": "Asia",
  "Belgium": "Europe", "Bhutan": "Asia", "Bolivia": "South America", "Bosnia and Herzegovina": "Europe",
  "Brazil": "South America", "Bulgaria": "Europe", "Myanmar": "Asia", "Cambodia": "Asia",
  "Cameroon": "Africa", "Canada": "North America", "Sri Lanka": "Asia", "Chile": "South America",
  "China": "Asia", "Taiwan": "Asia", "Colombia": "South America", "Congo": "Africa", "DR Congo": "Africa",
  "Costa Rica": "North America", "Croatia": "Europe", "Cuba": "North America", "Cyprus": "Europe",
  "Czech Republic": "Europe", "Denmark": "Europe", "Dominican Republic": "North America",
  "Ecuador": "South America", "Egypt": "Africa", "El Salvador": "North America", "Ethiopia": "Africa",
  "Eritrea": "Africa", "Estonia": "Europe", "Finland": "Europe", "France": "Europe",
  "Gabon": "Africa", "Gambia": "Africa", "Germany": "Europe", "Ghana": "Africa",
  "Greece": "Europe", "Guatemala": "North America", "Guinea": "Africa", "Haiti": "North America",
  "Honduras": "North America", "Hong Kong": "Asia", "Hungary": "Europe", "Iceland": "Europe", "India": "Asia",
  "Indonesia": "Asia", "Iran": "Asia", "Iraq": "Asia", "Ireland": "Europe",
  "Israel": "Asia", "Italy": "Europe", "Ivory Coast": "Africa", "Jamaica": "North America",
  "Japan": "Asia", "Jordan": "Asia", "Kazakhstan": "Asia", "Kenya": "Africa",
  "North Korea": "Asia", "South Korea": "Asia", "Kuwait": "Asia", "Laos": "Asia",
  "Lebanon": "Asia", "Lesotho": "Africa", "Latvia": "Europe", "Libya": "Africa",
  "Lithuania": "Europe", "Luxembourg": "Europe", "Madagascar": "Africa", "Malawi": "Africa",
  "Malaysia": "Asia", "Mali": "Africa", "Mauritania": "Africa", "Mexico": "North America",
  "Mongolia": "Asia", "Morocco": "Africa", "Mozambique": "Africa", "Namibia": "Africa",
  "Nepal": "Asia", "Netherlands": "Europe", "New Caledonia": "Oceania",
  "New Zealand": "Oceania", "Nicaragua": "North America", "Niger": "Africa", "Nigeria": "Africa",
  "Norway": "Europe", "Oman": "Asia", "Pakistan": "Asia", "Panama": "North America",
  "Papua New Guinea": "Oceania", "Paraguay": "South America", "Peru": "South America",
  "Philippines": "Asia", "Poland": "Europe", "Portugal": "Europe", "Puerto Rico": "North America",
  "Qatar": "Asia", "Romania": "Europe", "Russia": "Europe", "Rwanda": "Africa",
  "Saudi Arabia": "Asia", "Senegal": "Africa", "Serbia": "Europe", "Sierra Leone": "Africa",
  "Singapore": "Asia", "Slovakia": "Europe", "Vietnam": "Asia", "Slovenia": "Europe",
  "Somalia": "Africa", "South Africa": "Africa", "Zimbabwe": "Africa", "Spain": "Europe",
  "South Sudan": "Africa", "Sudan": "Africa", "Suriname": "South America", "Sweden": "Europe",
  "Switzerland": "Europe", "Syria": "Asia", "Tajikistan": "Asia", "Thailand": "Asia",
  "Togo": "Africa", "Trinidad and Tobago": "North America", "UAE": "Asia", "Tunisia": "Africa",
  "Turkey": "Asia", "Turkmenistan": "Asia", "Uganda": "Africa", "Ukraine": "Europe",
  "North Macedonia": "Europe", "United Kingdom": "Europe", "Tanzania": "Africa",
  "United States": "North America", "Uruguay": "South America", "Uzbekistan": "Asia",
  "Venezuela": "South America", "Yemen": "Asia", "Zambia": "Africa", "N. Cyprus": "Europe",
};

const CONTINENT_CENTERS: Record<string, [number, number]> = {
  "North America": [-100, 40],
  "South America": [-60, -15],
  "Europe": [15, 50],
  "Africa": [20, 0],
  "Asia": [90, 40],
  "Oceania": [135, -25]
};
const COUNTRY_CLUSTER_ZOOM = 1.6;
const COUNTRY_LABEL_ALL_ZOOM = 2.35;
const CONTINENT_FOCUS_ZOOM = 2.25;
const COUNTRY_EXIT_ZOOM = COUNTRY_CLUSTER_ZOOM + 0.05;
const CONTINENT_EXIT_ZOOM = COUNTRY_CLUSTER_ZOOM - 0.1;

// ─── Cities & Venues ───────────────────────────────────────


// ─── Palette ───────────────────────────────────────────────

interface Palette {
  sphereFill: string;
  sphereStroke: string;
  fg: [number, number, number];
  lime: string;
  limeFg: string;   // rgb for strokes/fills
  limeTxt: string;   // rgb for text
  crosshair: string;
}

const PALETTES: Record<Theme, Palette> = {
  dark: {
    sphereFill: "rgba(255,255,255,0.012)",
    sphereStroke: "rgba(255,255,255,0.08)",
    fg: [255, 255, 255],
    lime: "#D4A547",
    limeFg: "212,165,71",
    limeTxt: "212,165,71",
    crosshair: "rgba(255,255,255,0.04)",
  },
  light: {
    sphereFill: "rgba(0,0,0,0.006)",
    sphereStroke: "rgba(0,0,0,0.06)",
    fg: [0, 0, 0],
    lime: "#8A6B1F",
    limeFg: "138,107,31",
    limeTxt: "138,107,31",
    crosshair: "rgba(0,0,0,0.04)",
  },
};

// ─── Helpers ───────────────────────────────────────────────

// For countries with overseas territories (France, Denmark, Netherlands, USA, etc.)
// extract only the largest polygon (mainland) for accurate centroid & zoom.
function getMainlandFeature(feat: any): any {
  if (feat.geometry?.type !== 'MultiPolygon') return feat;
  const polys = feat.geometry.coordinates;
  if (polys.length <= 1) return feat;

  // Find the polygon with the largest bounding-box area (quick proxy for actual area)
  let bestIdx = 0;
  let bestArea = 0;
  for (let i = 0; i < polys.length; i++) {
    // Each polygon is an array of rings; use the outer ring (index 0)
    const ring = polys[i][0];
    if (!ring || ring.length < 3) continue;
    let minLon = 999, maxLon = -999, minLat = 999, maxLat = -999;
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    const area = (maxLon - minLon) * (maxLat - minLat);
    if (area > bestArea) { bestArea = area; bestIdx = i; }
  }

  // Return a synthetic feature with only the largest polygon
  return {
    ...feat,
    geometry: {
      type: 'Polygon',
      coordinates: polys[bestIdx]
    }
  };
}

function calcCountryZoom(feat: any): number {
  const mainland = getMainlandFeature(feat);
  const bounds = d3.geoBounds(mainland);
  let dx = bounds[1][0] - bounds[0][0];
  if (dx < 0) dx += 360;
  const dy = bounds[1][1] - bounds[0][1];
  const extent = Math.max(dx, dy);
  return Math.min(Math.max(80 / extent, 2), 7);
}

function getCountryContinentById(id: string | null | undefined): string | null {
  if (!id) return null;
  const country = COUNTRY_NAMES[id];
  if (!country) return null;
  return CONTINENT_MAP[country] || null;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// Chaikin smoothing algorithm - makes polygon edges curved
function chaikinSmoothClosed(coords: number[][], iterations: number = 2): number[][] {
  if (coords.length < 3) return coords;
  const isClosed = coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1];
  let result = isClosed ? coords.slice(0, coords.length - 1) : coords;

  for (let iter = 0; iter < iterations; iter++) {
    const smoothed: number[][] = [];
    for (let i = 0; i < result.length; i++) {
      const p0 = result[i];
      const p1 = result[(i + 1) % result.length];

      let p1x = p1[0];
      if (p1x - p0[0] > 180) p1x -= 360;
      else if (p0[0] - p1x > 180) p1x += 360;

      let qx = 0.75 * p0[0] + 0.25 * p1x;
      let rx = 0.25 * p0[0] + 0.75 * p1x;

      if (qx > 180) qx -= 360; else if (qx <= -180) qx += 360;
      if (rx > 180) rx -= 360; else if (rx <= -180) rx += 360;

      const q: number[] = [qx, 0.75 * p0[1] + 0.25 * p1[1]];
      const r: number[] = [rx, 0.25 * p0[1] + 0.75 * p1[1]];
      smoothed.push(q, r);
    }
    result = smoothed;
  }
  if (result.length > 0) result.push([result[0][0], result[0][1]]);
  return result;
}

function chaikinSmoothOpen(coords: number[][], iterations: number = 2): number[][] {
  if (coords.length < 3) return coords;
  let result = coords;
  for (let iter = 0; iter < iterations; iter++) {
    const smoothed: number[][] = [];
    smoothed.push(result[0]);
    for (let i = 0; i < result.length - 1; i++) {
      const p0 = result[i];
      const p1 = result[i + 1];

      let p1x = p1[0];
      if (p1x - p0[0] > 180) p1x -= 360;
      else if (p0[0] - p1x > 180) p1x += 360;

      let qx = 0.75 * p0[0] + 0.25 * p1x;
      let rx = 0.25 * p0[0] + 0.75 * p1x;

      if (qx > 180) qx -= 360; else if (qx <= -180) qx += 360;
      if (rx > 180) rx -= 360; else if (rx <= -180) rx += 360;

      const q = [qx, 0.75 * p0[1] + 0.25 * p1[1]];
      const r = [rx, 0.25 * p0[1] + 0.75 * p1[1]];
      smoothed.push(q, r);
    }
    smoothed.push(result[result.length - 1]);
    result = smoothed;
  }
  return result;
}

function smoothGeometry(geometry: any): any {
  if (!geometry) return geometry;
  if (geometry.type === 'Polygon') {
    return { ...geometry, coordinates: geometry.coordinates.map((ring: number[][]) => chaikinSmoothClosed(ring, 2)) };
  } else if (geometry.type === 'MultiPolygon') {
    return { ...geometry, coordinates: geometry.coordinates.map((poly: number[][][]) => poly.map((ring: number[][]) => chaikinSmoothClosed(ring, 2))) };
  } else if (geometry.type === 'LineString') {
    return { ...geometry, coordinates: chaikinSmoothOpen(geometry.coordinates, 2) };
  } else if (geometry.type === 'MultiLineString') {
    return { ...geometry, coordinates: geometry.coordinates.map((line: number[][]) => chaikinSmoothOpen(line, 2)) };
  }
  return geometry;
}

// ─── Component ─────────────────────────────────────────────

interface GlobeProps {
  cities: CityMarker[];
  language?: AppLanguage;
  theme?: Theme;
  selectedCity: CityMarker | null;
  onSelectCity: (city: CityMarker | null) => void;
  drilledContinent?: string | null;
  onDrillContinent?: (name: string | null) => void;
  drilledCountry: string | null;
  onDrillDown: (name: string | null) => void;
  onRotationChange?: (coords: [number, number]) => void;
  onZoomChange?: (zoom: number) => void;
  onHoverData?: (data: { level: string; label: string; count: number } | null) => void;
}

export function Globe({
  cities,
  language = "ko",
  theme = "dark",
  selectedCity,
  onSelectCity,
  drilledContinent,
  onDrillContinent,
  drilledCountry,
  onDrillDown,
  onRotationChange,
  onZoomChange,
  onHoverData,
}: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const continentHoverOpacitiesRef = useRef<Map<string, number>>(new Map());
  const countryLabelOpacitiesRef = useRef<Map<string, number>>(new Map());

  const landRef = useRef<any>(null);
  const bordersRef = useRef<any>(null);
  const countriesRef = useRef<any[]>([]);

  const projectionRef = useRef(d3.geoOrthographic().precision(0.3).clipAngle(90));
  const rotationRef = useRef<[number, number, number]>([0, -20, 0]);
  const targetScaleRef = useRef(1);
  const currentScaleRef = useRef(1);
  const baseSizeRef = useRef(300);
  const animFrameRef = useRef(0);
  const animRunningRef = useRef(false);
  const wakeGlobeRef = useRef<(() => void) | null>(null);

  const drilledRef = useRef<DrilledCountry | null>(null);
  const targetRotRef = useRef<[number, number, number] | null>(null);
  const drillOpacityRef = useRef(0);
  const museumPreviewOpacityRef = useRef(1);

  const hoveredCountryRef = useRef<any>(null);
  const lastHoverCheckRef = useRef(0);
  const mousePosRef = useRef({ x: -1, y: -1 });
  const lastHoverReportRef = useRef<string>('');
  const lastRotationEmitRef = useRef<{ lon: number; lat: number; ts: number }>({ lon: 0, lat: 20, ts: 0 });
  const lastZoomEmitRef = useRef<{ zoom: number; ts: number }>({ zoom: 1, ts: 0 });

  const isDraggingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const velocityRef = useRef<[number, number]>([0, 0]);
  const dragDistRef = useRef(0);
  const lastPointerTypeRef = useRef<string | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStateRef = useRef<{ startDist: number; startScale: number } | null>(null);
  const isMobileRef = useRef(
    typeof window !== 'undefined' &&
    (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)
  );

  const drilledContinentRef = useRef(drilledContinent);
  const lastSyncedContinentRef = useRef<string | null>(drilledContinent || null);
  useEffect(() => {
    drilledContinentRef.current = drilledContinent;
    lastSyncedContinentRef.current = drilledContinent || null;
    wakeGlobeRef.current?.();
  }, [drilledContinent]);

  // External drill driver (e.g. region filter pills) — bypasses React state
  // because the page-level state cascades back through other useEffects that
  // synchronously reset drilledContinent to null. By mutating refs directly,
  // the globe physically zooms/rotates to the requested continent and we
  // emit the parent callback at the end so the breadcrumb/UI updates.
  useEffect(() => {
    const onExternalDrill = (e: Event) => {
      const detail = (e as CustomEvent).detail as string | null | undefined;
      const continent = detail || null;
      drilledContinentRef.current = continent;
      lastSyncedContinentRef.current = continent;
      if (continent) {
        const centroid = CONTINENT_CENTERS[continent];
        if (centroid) {
          targetRotRef.current = [-centroid[0], -centroid[1], 0];
        }
        targetScaleRef.current = CONTINENT_FOCUS_ZOOM;
      } else {
        targetRotRef.current = null;
        targetScaleRef.current = 1;
      }
      velocityRef.current = [0, 0];
      cbRefs.current.onSelectCity(null);
      cbRefs.current.onDrillContinent?.(continent);
      wakeGlobeRef.current?.();
    };
    window.addEventListener('armin:drill-continent', onExternalDrill);
    return () => window.removeEventListener('armin:drill-continent', onExternalDrill);
  }, []);
  const citiesRef = useRef(cities);
  useEffect(() => { citiesRef.current = cities; wakeGlobeRef.current?.(); }, [cities]);
  const museumPointsRef = useRef<MuseumPoint[]>([]);
  useEffect(() => {
    const points: MuseumPoint[] = [];

    cities.forEach((city) => {
      const cityLat = city.coordinates[1];
      const cityLon = city.coordinates[0];

      city.venues.forEach((venue, idx: number) => {
        let lat = typeof venue.latitude === "number" ? venue.latitude : cityLat;
        let lon = typeof venue.longitude === "number" ? venue.longitude : cityLon;

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        if (lat === 0 && lon === 0) return;

        const usesCityFallback =
          !(typeof venue.latitude === "number" && typeof venue.longitude === "number") ||
          (Math.abs(lat - cityLat) < 1e-7 && Math.abs(lon - cityLon) < 1e-7 && city.venues.length > 1);

        // Make same-city fallback points individually visible without affecting true coordinates.
        if (usesCityFallback) {
          const a = (idx * 137.5 * Math.PI) / 180;
          const r = 0.02 + Math.floor(idx / 8) * 0.018;
          lat += Math.sin(a) * r;
          lon += Math.cos(a) * r;
        }

        lat = Math.max(-89.8, Math.min(89.8, lat));
        if (lon > 180) lon -= 360;
        if (lon < -180) lon += 360;

        const artworkCount = Number(venue.artworkCount || 0);
        const venueName = String(venue.name || city.city || "Museum");
        const cityKey = `${city.country}|${city.city}`;

        points.push({
          key: `${cityKey}|${venue.id || venueName}|${idx}`,
          cityKey,
          city,
          country: city.country,
          coordinates: [lon, lat],
          venueName,
          artworkCount,
          isMajor: isLikelyMajorMuseum(venueName, artworkCount),
        });
      });
    });

    museumPointsRef.current = points;
  }, [cities]);
  const selectedRef = useRef(selectedCity);
  useEffect(() => { selectedRef.current = selectedCity; wakeGlobeRef.current?.(); }, [selectedCity]);

  const getActiveContinentForView = useCallback((rot: [number, number, number], countryClusterMode: boolean) => {
    if (!countryClusterMode) return null;

    const center: [number, number] = [-rot[0], -rot[1]];
    let best: string | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    Object.entries(CONTINENT_CENTERS).forEach(([continent, centroid]) => {
      const dist = d3.geoDistance(center, centroid);
      if (dist < bestDist) {
        bestDist = dist;
        best = continent;
      }
    });

    return best;
  }, []);

  const themeRef = useRef<Theme>(theme);
  useEffect(() => { themeRef.current = theme; wakeGlobeRef.current?.(); }, [theme]);
  const languageRef = useRef<AppLanguage>(language);
  useEffect(() => { languageRef.current = language; wakeGlobeRef.current?.(); }, [language]);

  const hoveredRef = useRef<CityMarker | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getVisibleCities = useCallback((
    countryClusterMode: boolean,
    activeContinent: string | null,
    drilled: DrilledCountry | null,
  ) => {
    return citiesRef.current.filter((m) => {
      if (!countryClusterMode || !activeContinent) return false;
      if (!drilled && m.country && CONTINENT_MAP[m.country] !== activeContinent) return false;
      if (m.detail && !drilled) return false;
      if (m.detail && drilled && m.country !== drilled.name) return false;
      return true;
    });
  }, []);

  const cbRefs = useRef({ onRotationChange, onZoomChange, onSelectCity, onDrillContinent, onDrillDown, onHoverData });
  useEffect(() => {
    cbRefs.current = { onRotationChange, onZoomChange, onSelectCity, onDrillContinent, onDrillDown, onHoverData };
  }, [onRotationChange, onZoomChange, onSelectCity, onDrillContinent, onDrillDown, onHoverData]);

  const prevDrilledProp = useRef<string | null>(null);
  useEffect(() => {
    if (drilledCountry === null && prevDrilledProp.current !== null) {
      drilledRef.current = null;
      // Keep continent-level camera when only country drill is cleared.
      // Full reset is only valid when continent drill is also cleared.
      if (!drilledContinentRef.current) {
        targetRotRef.current = null;
        targetScaleRef.current = 1;
      }
    }
    prevDrilledProp.current = drilledCountry;
  }, [drilledCountry]);

  useEffect(() => {
    const fixWinding = (feature: any) => {
      if (!feature.geometry) return;
      if (feature.geometry.type === 'Polygon') {
        feature.geometry.coordinates.forEach((ring: any) => ring.reverse());
      } else if (feature.geometry.type === 'MultiPolygon') {
        feature.geometry.coordinates.forEach((poly: any) => poly.forEach((ring: any) => ring.reverse()));
      }
    };

    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
      .then((r) => r.json())
      .then((data: any) => {
        let landObj = feature(data, data.objects.land) as any;
        if (d3.geoArea(landObj) > 6) fixWinding(landObj);
        landRef.current = { ...landObj, _smoothed: { ...landObj, geometry: smoothGeometry(landObj.geometry) } };

        let bordersObj = mesh(data, data.objects.countries, (a: any, b: any) => a !== b) as any;
        bordersRef.current = { ...bordersObj, _smoothed: smoothGeometry(bordersObj) };

        const fc = feature(data, data.objects.countries);
        countriesRef.current = (fc as any).features.map((f: any) => {
          let fCopy = { ...f, geometry: JSON.parse(JSON.stringify(f.geometry)) };
          if (d3.geoArea(fCopy) > 6) {
            fixWinding(fCopy);
          }
          return {
            ...fCopy,
            _smoothed: { ...fCopy, geometry: smoothGeometry(fCopy.geometry) }
          };
        });
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  // ─── Canvas, resize, animation ────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    let w = 0, h = 0;

    const resize = () => {
      const r = container.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      baseSizeRef.current = Math.min(w, h);
    };

    resize();
    // Debounced ResizeObserver: iOS Safari fires this on every pixel of URL-bar
    // show/hide, so redrawing geometry for each one is wasteful. Coalesce into
    // a single redraw after the resize settles.
    let resizeTimeout: number | null = null;
    const debouncedResize = () => {
      if (resizeTimeout !== null) window.clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(() => {
        resize();
        wakeGlobeRef.current?.();
      }, 120);
    };
    const obs = new ResizeObserver(debouncedResize);
    obs.observe(container);

    const sphere: d3.GeoPermissibleObjects = { type: "Sphere" };
    const projection = projectionRef.current;

    const updateCountryHover = () => {
      const mx = mousePosRef.current.x;
      const my = mousePosRef.current.y;
      if (mx < 0 || isDraggingRef.current) { hoveredCountryRef.current = null; return; }
      const now = Date.now();
      if (now - lastHoverCheckRef.current < 40) return;
      lastHoverCheckRef.current = now;
      const [cx, cy] = projection.translate();
      const scale = projection.scale();
      if (Math.hypot(mx - cx, my - cy) > scale) { hoveredCountryRef.current = null; return; }
      const geo = projection.invert?.([mx, my]);
      if (!geo || isNaN(geo[0]) || isNaN(geo[1])) { hoveredCountryRef.current = null; return; }
      const prev = hoveredCountryRef.current;
      if (prev && d3.geoContains(prev, geo)) return;
      let found: any = null;
      for (const c of countriesRef.current) {
        if (d3.geoContains(c, geo)) { found = c; break; }
      }
      hoveredCountryRef.current = found;
    };

    const draw = () => {
      const P = PALETTES[themeRef.current];
      const [R, G, B] = P.fg;

      const baseScale = baseSizeRef.current * 0.38;
      // Higher lerp factor (0.22 vs old 0.07) makes cluster taps feel
      // near-instant: ~167ms to fully zoom into a country/city instead of
      // ~500ms. Pinch and wheel still feel smooth because their input is
      // already incremental.
      currentScaleRef.current = lerp(currentScaleRef.current, targetScaleRef.current, 0.22);

      projection
        .translate([w / 2, h / 2])
        .scale(baseScale * currentScaleRef.current)
        .rotate(rotationRef.current);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const path = d3.geoPath(projection, ctx);
      const drilled = drilledRef.current;
      const dTarget = drilled ? 1 : 0;
      drillOpacityRef.current = lerp(drillOpacityRef.current, dTarget, 0.06);
      const dOp = drillOpacityRef.current;
      const rot = rotationRef.current;
      const countryClusterMode = currentScaleRef.current >= COUNTRY_CLUSTER_ZOOM;
      const activeContinent = getActiveContinentForView(rot, countryClusterMode);

      updateCountryHover();

      // Sphere
      ctx.beginPath();
      path(sphere);
      ctx.fillStyle = P.sphereFill;
      ctx.fill();
      ctx.strokeStyle = P.sphereStroke;
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Land
      if (landRef.current) {
        const fillAlpha = lerp(0.05, 0.02, dOp);
        ctx.beginPath();
        path(landRef.current._smoothed);
        ctx.fillStyle = `rgba(${R},${G},${B},${fillAlpha})`;
        ctx.fill();

        const strokeAlpha = lerp(0.10, 0.035, dOp);
        ctx.beginPath();
        path(landRef.current._smoothed);
        ctx.strokeStyle = `rgba(${R},${G},${B},${strokeAlpha})`;
        ctx.lineWidth = 0.6;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke();
      }

      // Borders
      if (bordersRef.current) {
        const mob = isMobileRef.current;
        if (mob) {
          // Mobile: soft ambient glow + fine crisp line — regions readable without harsh grid
          ctx.save();
          ctx.beginPath();
          path(bordersRef.current._smoothed);
          ctx.shadowBlur = 5;
          ctx.shadowColor = `rgba(${R},${G},${B},0.16)`;
          ctx.strokeStyle = `rgba(${R},${G},${B},${lerp(0.06, 0.022, dOp)})`;
          ctx.lineWidth = 1.1;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.stroke();
          ctx.restore();
          ctx.beginPath();
          path(bordersRef.current._smoothed);
          ctx.strokeStyle = `rgba(${R},${G},${B},${lerp(0.09, 0.035, dOp)})`;
          ctx.lineWidth = 0.35;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.stroke();
        } else {
          const bAlpha = lerp(0.04, 0.015, dOp);
          ctx.beginPath();
          path(bordersRef.current._smoothed);
          ctx.strokeStyle = `rgba(${R},${G},${B},${bAlpha})`;
          ctx.lineWidth = 0.3;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.stroke();
        }
      }

      // Country / Continent hover
      const hovCountry = hoveredCountryRef.current;
      if (hovCountry) {
        const hovId = String(hovCountry.id);
        const name = COUNTRY_NAMES[hovId];
        const hovContinent = name ? CONTINENT_MAP[name] : null;

        if (!countryClusterMode) {
           if (hovContinent) {
               ctx.save();
               ctx.globalAlpha = (1 - dOp * 0.5);
               ctx.fillStyle = `rgba(${P.limeFg},0.015)`;
               ctx.beginPath();
               countriesRef.current.forEach((c: any) => {
                   const cName = COUNTRY_NAMES[String(c.id)];
                   if (cName && CONTINENT_MAP[cName] === hovContinent) {
                       path(c._smoothed || c);
                   }
               });
               ctx.fill();
               ctx.restore();
           }
        } else if (activeContinent && activeContinent === hovContinent) {
           const isDrilledCountry = drilled && drilled.id === hovId;
           if (!isDrilledCountry) {
             ctx.save();
             ctx.globalAlpha = 1 - dOp * 0.5;

             ctx.beginPath();
             path(hovCountry._smoothed);
             ctx.fillStyle = `rgba(${P.limeFg},0.02)`;
             ctx.fill();

             ctx.beginPath();
             path(hovCountry._smoothed);
             ctx.strokeStyle = `rgba(${P.limeFg},0.12)`;
             ctx.lineWidth = 0.8;
             ctx.lineJoin = "round";
             ctx.lineCap = "round";
             ctx.stroke();

             ctx.restore();
           }
        }
      }

      // Drilled country
      if (drilled && dOp > 0.01) {
        ctx.save();
        ctx.globalAlpha = dOp;

        ctx.beginPath();
        path(drilled.feature._smoothed || drilled.feature);
        ctx.fillStyle = `rgba(${R},${G},${B},0.04)`;
        ctx.fill();

        ctx.beginPath();
        path(drilled.feature._smoothed || drilled.feature);
        ctx.strokeStyle = `rgba(${P.limeFg},0.30)`;
        ctx.lineWidth = 1.2;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke();

        ctx.restore();
      }

      // City markers + zoomed-out museum preview
      const sel = selectedRef.current;
      const visibleCities = getVisibleCities(countryClusterMode, activeContinent, drilled);

      const continentTotals = new Map<string, number>();
      const continentArtworks = new Map<string, number>();
      const countryTotals = new Map<string, number>();
      const countryArtworks = new Map<string, number>();
      if (!drilled) {
        citiesRef.current.forEach(c => {
          if (!c.country) return;
          const continent = CONTINENT_MAP[c.country] || "Unknown";
          if (!countryClusterMode) {
            continentTotals.set(continent, (continentTotals.get(continent) || 0) + c.venues.length);
            continentArtworks.set(continent, (continentArtworks.get(continent) || 0) + (c.artworkCount || 0));
          } else if (activeContinent === continent) {
            countryTotals.set(c.country, (countryTotals.get(c.country) || 0) + c.venues.length);
            countryArtworks.set(c.country, (countryArtworks.get(c.country) || 0) + (c.artworkCount || 0));
          }
        });
      }

      // Total country numbers
      if (!drilled && dOp < 0.5 && countriesRef.current) {
        ctx.save();
        ctx.globalAlpha = (1 - dOp * 2) * 0.65;

        if (!countryClusterMode) {
            const hovCountry = hoveredCountryRef.current;
            const hovCountryName = hovCountry ? COUNTRY_NAMES[String(hovCountry.id)] : null;
            const hovContinent = hovCountryName ? CONTINENT_MAP[hovCountryName] : null;

            Array.from(continentTotals.entries()).forEach(([name, total]) => {
                const centroid = CONTINENT_CENTERS[name];
                if (!centroid) return;

                const dist = d3.geoDistance(centroid, [-rot[0], -rot[1]]);
                if (dist > Math.PI / 2) return;
                const p = projection(centroid);
                if (!p) return;

                // Animate opacity using lerp
                const isHovered = (name === hovContinent);
                const currentOpRef = continentHoverOpacitiesRef.current;
                let op = currentOpRef.get(name) || 0;
                op = lerp(op, isHovered ? 1 : 0, 0.15);
                currentOpRef.set(name, op);

                const fontSize = name === "Asia" ? 12 : 10;
                const continentLabel = localizeContinentName(name, languageRef.current);
                ctx.font = `600 ${fontSize}px "Space Grotesk", sans-serif`;
                ctx.fillStyle = `rgba(${R},${G},${B},0.85)`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(languageRef.current === "ko" ? continentLabel : continentLabel.toUpperCase(), p[0], p[1] - (op * 4));

                ctx.font = `400 ${fontSize - 2}px "Space Grotesk", sans-serif`;
                ctx.fillStyle = `rgba(${R},${G},${B},${0.45 + op * 0.25})`;
                ctx.fillText(`${total}`, p[0], p[1] + 12 + (op * 2));
            });
        } else if (activeContinent) {
            const hovCountry = hoveredCountryRef.current;
            const hovId = hovCountry ? String(hovCountry.id) : null;
            const showDenseNames = currentScaleRef.current >= COUNTRY_LABEL_ALL_ZOOM;
            const countryLabelBoxes: { x1: number; y1: number; x2: number; y2: number }[] = [];
            const labelOpRef = countryLabelOpacitiesRef.current;

            countriesRef.current.forEach((c: any) => {
              const id = String(c.id);
              const name = COUNTRY_NAMES[id];
              if (!name) return;
              if (CONTINENT_MAP[name] !== activeContinent) return;
              const total = countryTotals.get(name);
              if (!total) return;

              const mainlandC = getMainlandFeature(c);
              if (!mainlandC) return;
              const centroid = d3.geoCentroid(mainlandC);
              
              const dist = d3.geoDistance(centroid, [-rot[0], -rot[1]]);
              if (dist > Math.PI / 2) return;
              const p = projection(centroid);
              if (!p) return;

              const isHovered = (id === hovId);
              const targetNameOp = isHovered ? 1 : (showDenseNames ? 0.9 : 0);
              let nameOp = labelOpRef.get(id) || 0;
              nameOp = lerp(nameOp, targetNameOp, 0.18);
              labelOpRef.set(id, nameOp);

              // Number is always visible.
              ctx.font = `500 11px "Space Grotesk", sans-serif`;
              const numberAlpha = isHovered ? (0.75 + nameOp * 0.2) : (0.54 + nameOp * 0.18);
              ctx.fillStyle = isHovered ? `rgba(${P.limeTxt},${numberAlpha})` : `rgba(${R},${G},${B},${numberAlpha})`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(`${total}`, p[0], p[1] + 8);

              let shouldShowName = isHovered || showDenseNames || nameOp > 0.03;
              if (shouldShowName) {
                const localizedCountry = localizeCountryName(name, languageRef.current);
                const label = languageRef.current === "ko" ? localizedCountry : localizedCountry.toUpperCase();
                ctx.font = `600 12px "Space Grotesk", sans-serif`;
                const tw = ctx.measureText(label).width;
                const box = { x1: p[0] - tw / 2 - 2, y1: p[1] - 14, x2: p[0] + tw / 2 + 2, y2: p[1] - 2 };

                if (!isHovered && showDenseNames) {
                  const overlap = countryLabelBoxes.some((b) => (
                    box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1
                  ));
                  if (overlap) shouldShowName = false;
                }

                if (shouldShowName) {
                  if (!isHovered) countryLabelBoxes.push(box);
                  const labelAlpha = isHovered ? Math.max(0.75, nameOp) : (0.82 * nameOp);
                  ctx.fillStyle = isHovered ? `rgba(${P.limeTxt},${labelAlpha})` : `rgba(${R},${G},${B},${labelAlpha})`;
                  ctx.textAlign = "center";
                  ctx.textBaseline = "middle";
                  ctx.fillText(label, p[0], p[1] - 4 - (1 - nameOp) * 2);
                }
              }
            });
        }
        ctx.restore();
      }

      // Museum preview dots: visible until a country is drilled (smooth fade in/out).
      const museumPreviewTargetOpacity = drilled ? 0 : 1;
      museumPreviewOpacityRef.current = lerp(museumPreviewOpacityRef.current, museumPreviewTargetOpacity, 0.12);
      const museumPreviewOpacity = museumPreviewOpacityRef.current;

      if (museumPreviewOpacity > 0.01) {
        museumPointsRef.current.forEach((m) => {
          if (countryClusterMode && activeContinent && CONTINENT_MAP[m.country] !== activeContinent) return;
          const dist = d3.geoDistance(m.coordinates, [-rot[0], -rot[1]]);
          if (dist > Math.PI / 2) return;
          const p = projection(m.coordinates);
          if (!p) return;

          const r = m.isMajor ? 1.25 : 0.95;
          const alpha = (m.isMajor ? 0.34 : 0.24) * museumPreviewOpacity;
          const fill = m.isMajor
            ? `rgba(${P.limeFg},${alpha})`
            : `rgba(${R},${G},${B},${alpha})`;

          ctx.beginPath();
          ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
          ctx.fillStyle = fill;
          ctx.fill();
        });
      }

      if (countryClusterMode || drilled) {
        const drawnBoxes: { x1: number, y1: number, x2: number, y2: number }[] = [];

        if (drilled && dOp > 0.1) {
          visibleCities.forEach((m) => {
            const dist = d3.geoDistance(m.coordinates, [-rot[0], -rot[1]]);
            if (dist > Math.PI / 2) return;
            const p = projection(m.coordinates);
            if (!p) return;
            drawnBoxes.push({ x1: p[0] - 6, y1: p[1] - 6, x2: p[0] + 6, y2: p[1] + 6 });
          });
        }

        visibleCities.forEach((m) => {
          const dist = d3.geoDistance(m.coordinates, [-rot[0], -rot[1]]);
          if (dist > Math.PI / 2) return;
          const p = projection(m.coordinates);
          if (!p) return;

          const hov = hoveredRef.current;
          const isActive = m === sel || m === hov;
          const isInDrilledCountry = drilled && m.country === drilled.name;
          const dimFactor = drilled && !isInDrilledCountry ? 0.12 : 1;
          const venueCount = m.venues.length;

          ctx.save();
          ctx.globalAlpha = dimFactor;

          const drawBevelRect = (cx: number, cy: number, half: number, bev: number) => {
            ctx.beginPath();
            ctx.moveTo(cx - half + bev, cy - half);
            ctx.lineTo(cx + half - bev, cy - half);
            ctx.lineTo(cx + half, cy - half + bev);
            ctx.lineTo(cx + half, cy + half - bev);
            ctx.lineTo(cx + half - bev, cy + half);
            ctx.lineTo(cx - half + bev, cy + half);
            ctx.lineTo(cx - half, cy + half - bev);
            ctx.lineTo(cx - half, cy - half + bev);
            ctx.closePath();
          };

          if (isActive) {
            drawBevelRect(p[0], p[1], 8, 2);
            ctx.strokeStyle = P.lime;
            ctx.lineWidth = 0.8;
            ctx.stroke();
            drawBevelRect(p[0], p[1], 2.5, 0.8);
            ctx.fillStyle = P.lime;
            ctx.fill();
          } else if (venueCount >= 10) {
            drawBevelRect(p[0], p[1], 4.5, 1);
            ctx.fillStyle = P.lime;
            ctx.globalAlpha *= 0.85;
            ctx.fill();
          } else if (venueCount >= 3) {
            drawBevelRect(p[0], p[1], 3.8, 0.8);
            ctx.fillStyle = `rgba(${P.limeFg},0.35)`;
            ctx.fill();
            ctx.strokeStyle = `rgba(${P.limeFg},0.25)`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          } else {
            drawBevelRect(p[0], p[1], venueCount > 1 ? 3.5 : 2.2, 0.6);
            ctx.fillStyle = `rgba(${R},${G},${B},0.40)`;
            ctx.fill();
          }

          if (isInDrilledCountry && dOp > 0.1) {
            const labelAlpha = isActive ? dOp * 0.75 : dOp * 0.45;
            ctx.globalAlpha = labelAlpha;
            ctx.fillStyle = `rgba(${R},${G},${B},0.9)`;
            ctx.font = '9px "Space Grotesk", sans-serif';
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";

            const offset = isActive ? 12 : 8;
            const localizedCity = localizeCityName(m.city, languageRef.current);
            const textCity = languageRef.current === "ko" ? localizedCity : localizedCity.toUpperCase();
            const tw = ctx.measureText(textCity).width;
            const mw = venueCount > 1 ? ctx.measureText(`${venueCount}`).width + 5 : 0;
            const tw_total = tw + mw;

            const positions = [
               { cx: p[0] + offset + 6, cy: p[1],
                 box: { x1: p[0] + offset, y1: p[1] - 6, x2: p[0] + offset + 6 + tw_total, y2: p[1] + 6 }, linePath: [p[0] + offset - 2, p[1], p[0] + offset + 4, p[1]] },
               { cx: p[0] - offset - 6 - tw_total, cy: p[1],
                 box: { x1: p[0] - offset - 6 - tw_total, y1: p[1] - 6, x2: p[0] - offset, y2: p[1] + 6 }, linePath: [p[0] - offset + 2, p[1], p[0] - offset - 4, p[1]] },
               { cx: p[0] - tw_total/2, cy: p[1] - offset - 6,
                 box: { x1: p[0] - tw_total/2, y1: p[1] - offset - 12, x2: p[0] + tw_total/2, y2: p[1] - offset }, linePath: [p[0], p[1] - offset + 2, p[0], p[1] - offset - 4] },
               { cx: p[0] - tw_total/2, cy: p[1] + offset + 6,
                 box: { x1: p[0] - tw_total/2, y1: p[1] + offset, x2: p[0] + tw_total/2, y2: p[1] + offset + 12 }, linePath: [p[0], p[1] + offset - 2, p[0], p[1] + offset + 4] }
            ];

            let bestPos = null;
            for (const pos of positions) {
               let overlap = false;
               if (!isActive) {
                 for (const b of drawnBoxes) {
                   if (pos.box.x1 < b.x2 && pos.box.x2 > b.x1 && pos.box.y1 < b.y2 && pos.box.y2 > b.y1) {
                      overlap = true; break;
                   }
                 }
               }
               if (!overlap) { bestPos = pos; break; }
            }

            if (bestPos || isActive) {
              const finalPos = bestPos || positions[0];
              if (!isActive) drawnBoxes.push(finalPos.box);

              ctx.beginPath();
              ctx.moveTo(finalPos.linePath[0], finalPos.linePath[1]);
              ctx.lineTo(finalPos.linePath[2], finalPos.linePath[3]);
              ctx.strokeStyle = `rgba(${R},${G},${B},0.06)`;
              ctx.lineWidth = 0.5;
              ctx.stroke();

              ctx.textAlign = 'left';
              ctx.fillText(textCity, finalPos.cx, finalPos.cy + 1);

              if (venueCount > 1) {
                ctx.globalAlpha = labelAlpha * 0.45;
                ctx.fillStyle = P.lime;
                ctx.font = '8px "Space Mono", monospace';
                ctx.fillText(`${venueCount}`, finalPos.cx + tw + 5, finalPos.cy + 1);
              }
            }
          }

          ctx.restore();
        });
      }

      // Crosshair
      const cx = w / 2, cy = h / 2;
      ctx.strokeStyle = P.crosshair;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy); ctx.lineTo(cx - 4, cy);
      ctx.moveTo(cx + 4, cy); ctx.lineTo(cx + 12, cy);
      ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy - 4);
      ctx.moveTo(cx, cy + 4); ctx.lineTo(cx, cy + 12);
      ctx.stroke();

      return { continentTotals, continentArtworks, countryTotals, countryArtworks };
    };

    const animate = () => {
      if (!isDraggingRef.current) {
        const tRot = targetRotRef.current;
        if (tRot) {
          // Faster rotation lerp so cluster click → centred view feels
          // immediate (matches the scale-lerp bump above).
          const speed = 0.18;
          rotationRef.current[0] = lerp(rotationRef.current[0], tRot[0], speed);
          rotationRef.current[1] = lerp(rotationRef.current[1], tRot[1], speed);
          if (Math.hypot(rotationRef.current[0] - tRot[0], rotationRef.current[1] - tRot[1]) < 0.08) {
            rotationRef.current[0] = tRot[0];
            rotationRef.current[1] = tRot[1];
            targetRotRef.current = null;
          }
        } else {
          const vx = velocityRef.current[0];
          const vy = velocityRef.current[1];
          if (Math.abs(vx) > 0.003 || Math.abs(vy) > 0.003) {
            rotationRef.current[0] += vx;
            rotationRef.current[1] += vy;
            velocityRef.current[0] *= 0.955;
            velocityRef.current[1] *= 0.955;
          } else {
            velocityRef.current = [0, 0];
          }
        }
        rotationRef.current[1] = Math.max(-80, Math.min(80, rotationRef.current[1]));
      }
      const stats = draw();
      const countryClusterMode = currentScaleRef.current >= COUNTRY_CLUSTER_ZOOM;
      const activeContinent = getActiveContinentForView(rotationRef.current, countryClusterMode);

      // Keep parent continent state in sync with current viewport in zoomed country-cluster mode.
      if (countryClusterMode && activeContinent && lastSyncedContinentRef.current !== activeContinent) {
        lastSyncedContinentRef.current = activeContinent;
        cbRefs.current.onDrillContinent?.(activeContinent);
      }

      const hovCity = hoveredRef.current;
      const hovCountry = hoveredCountryRef.current;
      let hd: { level: string; label: string; count: number } | null = null;
      if (hovCity) {
         const localizedCity = localizeCityName(hovCity.city, languageRef.current);
         if (hovCity.venues.length === 1) {
           hd = { level: 'VENUE', label: hovCity.venues[0].name, count: hovCity.artworkCount || 0 };
         } else {
           hd = { level: 'CITY', label: localizedCity, count: hovCity.artworkCount || 0 };
         }
      } else if (hovCountry && mousePosRef.current.x > 0 && !isDraggingRef.current) {
         const name = COUNTRY_NAMES[String(hovCountry.id)];
         if (name) {
           const continent = CONTINENT_MAP[name];
           if (!countryClusterMode && continent && stats.continentTotals.has(continent)) {
             const arts = stats.continentArtworks.get(continent) || 0;
             hd = { level: 'CONTINENT', label: localizeContinentName(continent, languageRef.current), count: arts };
           } else if (countryClusterMode && activeContinent === continent && stats.countryTotals.has(name)) {
             const arts = stats.countryArtworks.get(name) || 0;
             hd = { level: 'COUNTRY', label: localizeCountryName(name, languageRef.current), count: arts };
           }
         }
      }

      const hs = hd ? `${hd.level}-${hd.label}` : 'null';
      if (lastHoverReportRef.current !== hs) {
         lastHoverReportRef.current = hs;
         cbRefs.current.onHoverData?.(hd);
      }

      const nextLon = -rotationRef.current[0];
      const nextLat = -rotationRef.current[1];
      const now = Date.now();
      const lastRotation = lastRotationEmitRef.current;
      if (
        Math.abs(nextLon - lastRotation.lon) >= 0.15 ||
        Math.abs(nextLat - lastRotation.lat) >= 0.15 ||
        now - lastRotation.ts >= 100
      ) {
        lastRotationEmitRef.current = { lon: nextLon, lat: nextLat, ts: now };
        cbRefs.current.onRotationChange?.([nextLon, nextLat]);
      }

      // Idle detection: if nothing is animating or interactive, pause the rAF
      // loop to stop burning CPU/GPU. Any subsequent user input (pointer/wheel)
      // calls wake() to restart the loop.
      const drillTarget = drilledRef.current ? 1 : 0;
      const previewTarget = drilledRef.current ? 0 : 1;
      const stillAnimating =
        isDraggingRef.current ||
        pinchStateRef.current !== null ||
        targetRotRef.current !== null ||
        Math.abs(velocityRef.current[0]) > 0.003 ||
        Math.abs(velocityRef.current[1]) > 0.003 ||
        Math.abs(targetScaleRef.current - currentScaleRef.current) > 0.001 ||
        Math.abs(drillOpacityRef.current - drillTarget) > 0.005 ||
        Math.abs(museumPreviewOpacityRef.current - previewTarget) > 0.005 ||
        hoveredCountryRef.current !== null ||
        hoveredRef.current !== null;

      if (stillAnimating) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        animRunningRef.current = false;
      }
    };

    let pageVisible = typeof document === 'undefined' || !document.hidden;

    const wake = () => {
      if (animRunningRef.current || !pageVisible) return;
      animRunningRef.current = true;
      animFrameRef.current = requestAnimationFrame(animate);
    };
    wakeGlobeRef.current = wake;

    // Pause the rAF loop while the tab/app is backgrounded. iOS WebView can
    // keep executing JS when the host app goes to the background, so without
    // this the globe would keep rendering off-screen and heat the device.
    const onVisibility = () => {
      pageVisible = !document.hidden;
      if (pageVisible) wake();
      else {
        animRunningRef.current = false;
        cancelAnimationFrame(animFrameRef.current);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    animRunningRef.current = true;
    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      animRunningRef.current = false;
      cancelAnimationFrame(animFrameRef.current);
      obs.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      if (resizeTimeout !== null) window.clearTimeout(resizeTimeout);
      if (wakeGlobeRef.current === wake) wakeGlobeRef.current = null;
    };
  }, [getActiveContinentForView, getVisibleCities]);

  // ─── Wheel ────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.002;
      const nextScale = Math.max(1.0, Math.min(8.0, targetScaleRef.current + delta));
      targetScaleRef.current = nextScale;
      wakeGlobeRef.current?.();
      const now = Date.now();
      const lastZoom = lastZoomEmitRef.current;
      if (Math.abs(nextScale - lastZoom.zoom) >= 0.01 || now - lastZoom.ts >= 120) {
        lastZoomEmitRef.current = { zoom: nextScale, ts: now };
        cbRefs.current.onZoomChange?.(nextScale);
      }
      if (drilledRef.current && targetScaleRef.current <= COUNTRY_EXIT_ZOOM) {
        drilledRef.current = null;
        targetRotRef.current = null;
        cbRefs.current.onDrillDown(null);
        cbRefs.current.onSelectCity(null);
      }
      if (drilledContinentRef.current && targetScaleRef.current <= CONTINENT_EXIT_ZOOM) {
        cbRefs.current.onDrillContinent?.(null);
      }
    };
    
    // Prevent mobile scrolling when dragging the globe
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault(); // Stop page scrolling
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  useEffect(() => {
    const up = () => { isDraggingRef.current = false; };
    window.addEventListener("mouseup", up);
    window.addEventListener("touchend", up);
    return () => { window.removeEventListener("mouseup", up); window.removeEventListener("touchend", up); };
  }, []);

  // ─── Mouse handlers ───────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true;
    targetRotRef.current = null;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    velocityRef.current = [0, 0];
    dragDistRef.current = 0;
    wakeGlobeRef.current?.();
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    mousePosRef.current = { x: mx, y: my };
    wakeGlobeRef.current?.();

    if (isDraggingRef.current) {
      const dx = e.clientX - lastPosRef.current.x;
      const dy = e.clientY - lastPosRef.current.y;
      dragDistRef.current += Math.abs(dx) + Math.abs(dy);
      const sens = 0.25 / currentScaleRef.current;
      rotationRef.current[0] += dx * sens;
      rotationRef.current[1] -= dy * sens;
      rotationRef.current[1] = Math.max(-80, Math.min(80, rotationRef.current[1]));
      velocityRef.current = [dx * sens * 0.35, -dy * sens * 0.35];
      lastPosRef.current = { x: e.clientX, y: e.clientY };
    }

    const projection = projectionRef.current;
    const rot = rotationRef.current;
    const drilled = drilledRef.current;
    const countryClusterMode = currentScaleRef.current >= COUNTRY_CLUSTER_ZOOM;
    const activeContinent = getActiveContinentForView(rot, countryClusterMode);

    hoveredRef.current = null;
    if (countryClusterMode && activeContinent) {
      const visibleCities = getVisibleCities(countryClusterMode, activeContinent, drilled);
      for (const m of visibleCities) {
        const dist = d3.geoDistance(m.coordinates, [-rot[0], -rot[1]]);
        if (dist > Math.PI / 2) continue;
        const p = projection(m.coordinates);
        if (!p) continue;
        if (Math.hypot(p[0] - mx, p[1] - my) < 22) {
          hoveredRef.current = m;
          break;
        }
      }
    }

    if (hoveredRef.current) canvas.style.cursor = "pointer";
    else if (isDraggingRef.current) canvas.style.cursor = "grabbing";
    else if (hoveredCountryRef.current) canvas.style.cursor = "pointer";
    else canvas.style.cursor = "grab";
  }, [getActiveContinentForView, getVisibleCities]);

  const handleMouseUp = useCallback(() => { isDraggingRef.current = false; }, []);

  const handleMouseLeave = useCallback(() => {
    isDraggingRef.current = false;
    mousePosRef.current = { x: -1, y: -1 };
    hoveredCountryRef.current = null;
    hoveredRef.current = null;
    wakeGlobeRef.current?.();
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    wakeGlobeRef.current?.();
    const stepZoomOut = () => {
      const drilled = drilledRef.current;
      if (drilled) {
        const continent =
          drilledContinentRef.current ||
          getCountryContinentById(drilled.id) ||
          null;
        drilledRef.current = null;
        cbRefs.current.onDrillDown(null);
        cbRefs.current.onSelectCity(null);

        if (continent) {
          const centroid = CONTINENT_CENTERS[continent];
          if (centroid) {
            targetRotRef.current = [-centroid[0], -centroid[1], 0];
          } else {
            targetRotRef.current = null;
          }
          targetScaleRef.current = CONTINENT_FOCUS_ZOOM;
          cbRefs.current.onDrillContinent?.(continent);
        } else {
          targetRotRef.current = null;
          targetScaleRef.current = 1;
          cbRefs.current.onDrillContinent?.(null);
        }
        return;
      }

      if (drilledContinentRef.current) {
        cbRefs.current.onDrillContinent?.(null);
        targetRotRef.current = null;
        targetScaleRef.current = 1;
        cbRefs.current.onSelectCity(null);
      }
    };

    // React onClick may expose MouseEvent even for touch taps; preserve pointerType from pointerdown/up.
    const nativeEvent = e.nativeEvent as any;
    const nativePointerType = typeof nativeEvent?.pointerType === 'string' ? nativeEvent.pointerType : '';
    const isTouchEvent =
      nativePointerType === 'touch' ||
      lastPointerTypeRef.current === 'touch' ||
      Boolean(nativeEvent?.sourceCapabilities?.firesTouchEvents);
    const dragThreshold = isTouchEvent ? 24 : 12;
    if (dragDistRef.current > dragThreshold) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickMx = e.clientX - rect.left;
    const clickMy = e.clientY - rect.top;

    // Direct city hit test in cluster mode (hover effect is disabled).
    const HIT_RADIUS = isTouchEvent ? 28 : 16;
    const findHitCity = (radius: number): CityMarker | null => {
      const rot = rotationRef.current;
      const countryClusterModeT = currentScaleRef.current >= COUNTRY_CLUSTER_ZOOM;
      const activeContinentT = getActiveContinentForView(rot, countryClusterModeT);
      const visibleCitiesT = getVisibleCities(countryClusterModeT, activeContinentT, drilledRef.current);
      let found: CityMarker | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const m of visibleCitiesT) {
        const dist = d3.geoDistance(m.coordinates, [-rot[0], -rot[1]]);
        if (dist > Math.PI / 2) continue;
        const p = projectionRef.current(m.coordinates);
        if (!p) continue;
        const d = Math.hypot(p[0] - clickMx, p[1] - clickMy);
        if (d < radius && d < bestDist) {
          bestDist = d;
          found = m;
        }
      }
      return found;
    };

    const activeCity = findHitCity(HIT_RADIUS);
    if (activeCity) {
      const city = activeCity;
      cbRefs.current.onSelectCity(city === selectedRef.current ? null : city);
      if (!city.detail) {
        const country = countriesRef.current.find(
          (c: any) => COUNTRY_NAMES[String(c.id)] === city.country
        );
        if (country && drilledRef.current?.id !== String(country.id)) {
          const id = String(country.id);
          const name = COUNTRY_NAMES[id] || city.country;
          const continent = CONTINENT_MAP[name];
          if (continent) cbRefs.current.onDrillContinent?.(continent);

          const mainland = getMainlandFeature(country);
          const centroid = d3.geoCentroid(mainland);
          const zoom = calcCountryZoom(country);
          drilledRef.current = { feature: country, name, id };
          targetRotRef.current = [-centroid[0], -centroid[1], 0];
          targetScaleRef.current = zoom;
          velocityRef.current = [0, 0];
          cbRefs.current.onDrillDown(name);
        }
      }
      return;
    }

    const projection = projectionRef.current;
    const [cx, cy] = projection.translate();
    const scale = projection.scale();
    const countryClusterMode = currentScaleRef.current >= COUNTRY_CLUSTER_ZOOM;
    const activeContinent = getActiveContinentForView(rotationRef.current, countryClusterMode);

    if (Math.hypot(clickMx - cx, clickMy - cy) > scale) {
      stepZoomOut();
      return;
    }

    const geoCoords = projection.invert?.([clickMx, clickMy]);
    if (!geoCoords || isNaN(geoCoords[0]) || isNaN(geoCoords[1])) {
      stepZoomOut();
      return;
    }

    let clickedCountry: any = null;
    for (const c of countriesRef.current) {
      if (d3.geoContains(c, geoCoords)) { clickedCountry = c; break; }
    }

    if (clickedCountry) {
      const id = String(clickedCountry.id);
      const name = COUNTRY_NAMES[id] || `Region ${id}`;
      const continent = CONTINENT_MAP[name];

      if (!countryClusterMode && continent) {
        const centroid = CONTINENT_CENTERS[continent];
        if (centroid) {
          targetRotRef.current = [-centroid[0], -centroid[1], 0];
          targetScaleRef.current = CONTINENT_FOCUS_ZOOM;
          velocityRef.current = [0, 0];
          cbRefs.current.onDrillContinent?.(continent);
          cbRefs.current.onSelectCity(null);
        }
        return;
      }

      // Country cluster mode: ignore country clicks outside the active continent.
      if (countryClusterMode && activeContinent && continent !== activeContinent) {
         return;
      }

      // Phase 3: Toggle Country within the drilled continent
      if (drilledRef.current?.id === id) {
        drilledRef.current = null;
        const cCentroid = CONTINENT_CENTERS[(activeContinent || continent || "")] || [0, 0];
        targetRotRef.current = [-cCentroid[0], -cCentroid[1], 0];
        targetScaleRef.current = CONTINENT_FOCUS_ZOOM;
        cbRefs.current.onDrillDown(null);
        cbRefs.current.onSelectCity(null);
        return;
      }

      const mainland = getMainlandFeature(clickedCountry);
      const centroid = d3.geoCentroid(mainland);
      const zoom = calcCountryZoom(clickedCountry);
      drilledRef.current = { feature: clickedCountry, name, id };
      targetRotRef.current = [-centroid[0], -centroid[1], 0];
      targetScaleRef.current = zoom;
      velocityRef.current = [0, 0];
      cbRefs.current.onDrillDown(name);
      cbRefs.current.onSelectCity(null);
    } else {
      stepZoomOut();
    }
  }, [getActiveContinentForView, getVisibleCities]);

  // ─── Render ───────────────────────────────────────

  const t = theme === "light";

  return (
    <div ref={containerRef} className="ig-globe-container">
      <canvas
        ref={canvasRef}
        className="ig-globe-canvas"
        style={{ cursor: "grab", touchAction: "none" }}
        onPointerDown={(e) => {
          lastPointerTypeRef.current = e.pointerType || null;
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
          activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (activePointersRef.current.size >= 2) {
            isDraggingRef.current = false;
            targetRotRef.current = null;
            velocityRef.current = [0, 0];
            dragDistRef.current = 9999;
            const pts = Array.from(activePointersRef.current.values()).slice(0, 2);
            const dx = pts[0].x - pts[1].x;
            const dy = pts[0].y - pts[1].y;
            pinchStateRef.current = {
              startDist: Math.hypot(dx, dy) || 1,
              startScale: targetScaleRef.current,
            };
            wakeGlobeRef.current?.();
            return;
          }
          handleMouseDown(e as any);
        }}
        onPointerMove={(e) => {
          if (activePointersRef.current.has(e.pointerId)) {
            activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          }
          if (pinchStateRef.current && activePointersRef.current.size >= 2) {
            const pts = Array.from(activePointersRef.current.values()).slice(0, 2);
            const dx = pts[0].x - pts[1].x;
            const dy = pts[0].y - pts[1].y;
            const currentDist = Math.hypot(dx, dy) || 1;
            const { startDist, startScale } = pinchStateRef.current;
            const nextScale = Math.max(1.0, Math.min(8.0, startScale * (currentDist / startDist)));
            targetScaleRef.current = nextScale;
            wakeGlobeRef.current?.();
            const now = Date.now();
            const lastZoom = lastZoomEmitRef.current;
            if (Math.abs(nextScale - lastZoom.zoom) >= 0.01 || now - lastZoom.ts >= 120) {
              lastZoomEmitRef.current = { zoom: nextScale, ts: now };
              cbRefs.current.onZoomChange?.(nextScale);
            }
            if (drilledRef.current && targetScaleRef.current <= COUNTRY_EXIT_ZOOM) {
              drilledRef.current = null;
              targetRotRef.current = null;
              cbRefs.current.onDrillDown(null);
              cbRefs.current.onSelectCity(null);
            }
            if (drilledContinentRef.current && targetScaleRef.current <= CONTINENT_EXIT_ZOOM) {
              cbRefs.current.onDrillContinent?.(null);
            }
            return;
          }
          handleMouseMove(e as any);
        }}
        onPointerUp={(e) => {
          lastPointerTypeRef.current = e.pointerType || lastPointerTypeRef.current;
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
          activePointersRef.current.delete(e.pointerId);
          if (activePointersRef.current.size < 2 && pinchStateRef.current) {
            pinchStateRef.current = null;
            dragDistRef.current = 9999;
            isDraggingRef.current = false;
          }
          handleMouseUp();
        }}
        onPointerCancel={(e) => {
          activePointersRef.current.delete(e.pointerId);
          if (activePointersRef.current.size < 2) pinchStateRef.current = null;
          handleMouseUp();
        }}
        onPointerLeave={handleMouseLeave}
        onClick={handleClick}
      />

      {isLoading && (
        <div className="ig-spinner-container">
          <div
            className="ig-spinner"
            style={{
              borderColor: t ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)",
              borderTopColor: t ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.3)"
            }}
          />
        </div>
      )}
    </div>
  );
}
