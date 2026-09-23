import { useRef, useEffect, useState, useCallback } from "react";
import * as d3 from "d3";
import { feature, mesh } from "topojson-client";
import type { AppLanguage } from "../../contexts/LanguageContext";
import { localizeCityName, localizeContinentName, localizeCountryName } from "../../i18n/geoLocalization";
import {
  resolveGlobeRenderProfile,
  resolveGlobeVisualPalette,
  type GlobeVisualPresetId,
} from "./globeVisualPresets";
import {
  resolveCollyGlobeVariantProfile,
  resolveCollyMuseumEmphasis,
} from "./collyGlobeVariants";
import {
  drawTechniqueOverlay,
  drawTechniqueUnderlay,
  shouldDrawProductionPreviewMarkers,
  type CollyMapTechniqueRenderArgs,
} from "./collyMapTechniqueRenderer";
import type { CollyGlobeVariantSlug } from "../../globe-lab/model";
import {
  drawGlassOverlay,
  drawGlassUnderlay,
  resolveGlobeGlassProfile,
  type GlobeGlassTweakId,
} from "./globeGlassTweaks";
import { getMainlandFeature, smoothGlobeGeometry } from "./globeGeometrySmoothing";
import {
  countryLabelRevealZoom,
  drawAtmosphereFinish,
  drawContinentLabel,
  drawGlobeCrosshair,
  drawGlobeFurniture,
  drawMuseumPreviewMarker,
  drawSphereSurface,
  drawStyledBorders,
  drawStyledLand,
  resolveGlobeViewportDensity,
  type CountryBoundaryStyle,
} from "./globeCanvasStyles";

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
  venueId: string;
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

export const CONTINENT_MAP: Record<string, string> = {
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
const CONTINENT_FOCUS_ZOOM = 2.25;
const COUNTRY_EXIT_ZOOM = COUNTRY_CLUSTER_ZOOM + 0.05;
const CONTINENT_EXIT_ZOOM = COUNTRY_CLUSTER_ZOOM - 0.1;

// In country-cluster mode markers/labels are shown by proximity to the current
// view centre (great-circle radians) instead of by continent membership — so
// border countries (Turkey, Qatar…) stay reachable and panning left/right
// reveals/hides neighbours smoothly instead of a hard continent cut.
const COUNTRY_VIEW_INNER = 0.5;  // ≤ ~28.6°: full opacity
const COUNTRY_VIEW_OUTER = 0.72; // ≥ ~41.3°: hidden; fades to 0 between the two
const viewCenterFromRot = (rot: [number, number, number]): [number, number] => [-rot[0], -rot[1]];
const viewProximityAlpha = (coords: [number, number], viewCenter: [number, number]): number => {
  const d = d3.geoDistance(coords, viewCenter);
  if (d <= COUNTRY_VIEW_INNER) return 1;
  if (d >= COUNTRY_VIEW_OUTER) return 0;
  return 1 - (d - COUNTRY_VIEW_INNER) / (COUNTRY_VIEW_OUTER - COUNTRY_VIEW_INNER);
};

// ─── Cities & Venues ───────────────────────────────────────


// ─── Helpers ───────────────────────────────────────────────

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

// ─── Component ─────────────────────────────────────────────

interface GlobeProps {
  cities: CityMarker[];
  language?: AppLanguage;
  theme?: Theme;
  visualPreset?: GlobeVisualPresetId;
  collyVariant?: CollyGlobeVariantSlug;
  glassTweak?: GlobeGlassTweakId;
  countryBoundaryStyle?: CountryBoundaryStyle;
  selectedCity: CityMarker | null;
  onSelectCity: (city: CityMarker | null) => void;
  drilledContinent?: string | null;
  onDrillContinent?: (name: string | null) => void;
  drilledCountry: string | null;
  onDrillDown: (name: string | null) => void;
  onRotationChange?: (coords: [number, number]) => void;
  onZoomChange?: (zoom: number) => void;
  onHoverData?: (data: { level: string; label: string; count: number } | null) => void;
  /** Where the globe sits in its canvas: a horizontal shift (fraction of the
      canvas width, positive moves it right) and a size multiplier. Changes glide. */
  stageShift?: number;
  stageScale?: number;
}

export function Globe({
  cities,
  language = "ko",
  theme = "dark",
  visualPreset,
  collyVariant,
  glassTweak,
  countryBoundaryStyle,
  selectedCity,
  onSelectCity,
  drilledContinent,
  onDrillContinent,
  drilledCountry,
  onDrillDown,
  onRotationChange,
  onZoomChange,
  onHoverData,
  stageShift = 0,
  stageScale = 1,
}: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const continentHoverOpacitiesRef = useRef<Map<string, number>>(new Map());
  const countryLabelOpacitiesRef = useRef<Map<string, number>>(new Map());
  const visualPresetRef = useRef<GlobeVisualPresetId | undefined>(visualPreset);
  const collyVariantRef = useRef<CollyGlobeVariantSlug | undefined>(collyVariant);
  const glassTweakRef = useRef<GlobeGlassTweakId | undefined>(glassTweak);

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
  // Current and wanted stage (stageShift/stageScale); draw() eases one into the other.
  const stageRef = useRef({ shift: stageShift, scale: stageScale });
  const stageTargetRef = useRef({ shift: stageShift, scale: stageScale });
  useEffect(() => {
    stageTargetRef.current = { shift: stageShift, scale: stageScale };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      stageRef.current = { shift: stageShift, scale: stageScale };
    }
    wakeGlobeRef.current?.();
  }, [stageShift, stageScale]);

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
  const reducedMotionRef = useRef(
    typeof window !== "undefined"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const drilledContinentRef = useRef(drilledContinent);
  const lastSyncedContinentRef = useRef<string | null>(drilledContinent || null);
  const suppressContinentSyncRef = useRef(false);
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
      suppressContinentSyncRef.current = continent === null;
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
          venueId: String(venue.id || ""),
          venueName,
          artworkCount,
          isMajor: isLikelyMajorMuseum(venueName, artworkCount),
        });
      });
    });

    museumPointsRef.current = points;
  }, [cities]);
  const selectedRef = useRef(selectedCity);
  useEffect(() => {
    selectedRef.current = selectedCity;
    // Focus the globe on the newly-selected city (e.g. deep-linked from the Search tab genre
    // browse): rotate to the city and zoom in, mirroring the country-click focus animation.
    const coords = selectedCity?.coordinates as [number, number] | undefined;
    if (selectedCity && Array.isArray(coords) && typeof coords[0] === "number" && typeof coords[1] === "number") {
      targetRotRef.current = [-coords[0], -coords[1], 0];
      const country = countriesRef.current.find((c: any) => COUNTRY_NAMES[String(c.id)] === selectedCity.country);
      const cityZoom = country ? calcCountryZoom(country) : CONTINENT_FOCUS_ZOOM;
      if (cityZoom > targetScaleRef.current) targetScaleRef.current = cityZoom;
      velocityRef.current = [0, 0];
    }
    wakeGlobeRef.current?.();
  }, [selectedCity]);

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
  useEffect(() => { visualPresetRef.current = visualPreset; wakeGlobeRef.current?.(); }, [visualPreset]);
  useEffect(() => { collyVariantRef.current = collyVariant; wakeGlobeRef.current?.(); }, [collyVariant]);
  useEffect(() => { glassTweakRef.current = glassTweak; wakeGlobeRef.current?.(); }, [glassTweak]);
  const languageRef = useRef<AppLanguage>(language);
  useEffect(() => { languageRef.current = language; wakeGlobeRef.current?.(); }, [language]);

  const hoveredRef = useRef<CityMarker | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getVisibleCities = useCallback((
    countryClusterMode: boolean,
    viewCenter: [number, number],
    drilled: DrilledCountry | null,
  ) => {
    return citiesRef.current.filter((m) => {
      if (!countryClusterMode) return false;
      if (!drilled && viewProximityAlpha(m.coordinates, viewCenter) <= 0) return false;
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

    // Land geometry: load from the app's OWN copy first (same-origin, reliable) so the continents
    // ALWAYS render. The old code fetched only from the jsdelivr CDN — a single CDN hiccup (with no
    // retry) left the globe as a bare black circle with just the dots/labels. Now: local → CDN fallback.
    const processLand = (data: any) => {
      let landObj = feature(data, data.objects.land) as any;
      if (d3.geoArea(landObj) > 6) fixWinding(landObj);
      const balancedLand = {
        ...landObj,
        geometry: smoothGlobeGeometry(landObj.geometry, "balanced"),
      };
      landRef.current = {
        ...landObj,
        _smoothed: balancedLand,
        _roundedBalanced: balancedLand,
        _roundedSoft: {
          ...landObj,
          geometry: smoothGlobeGeometry(landObj.geometry, "soft"),
        },
        _roundedAtlas: {
          ...landObj,
          geometry: smoothGlobeGeometry(landObj.geometry, "atlas"),
        },
      };

      let bordersObj = mesh(data, data.objects.countries, (a: any, b: any) => a !== b) as any;
      const balancedBorders = smoothGlobeGeometry(bordersObj, "balanced");
      bordersRef.current = {
        ...bordersObj,
        _smoothed: balancedBorders,
        _roundedBalanced: balancedBorders,
        _roundedSoft: smoothGlobeGeometry(bordersObj, "soft"),
        _roundedAtlas: smoothGlobeGeometry(bordersObj, "atlas"),
      };

      const fc = feature(data, data.objects.countries);
      countriesRef.current = (fc as any).features.map((f: any) => {
        let fCopy = { ...f, geometry: JSON.parse(JSON.stringify(f.geometry)) };
        if (d3.geoArea(fCopy) > 6) {
          fixWinding(fCopy);
        }
        const balancedCountry = {
          ...fCopy,
          geometry: smoothGlobeGeometry(fCopy.geometry, "balanced"),
        };
        return {
          ...fCopy,
          _smoothed: balancedCountry,
          _roundedBalanced: balancedCountry,
          _roundedSoft: {
            ...fCopy,
            geometry: smoothGlobeGeometry(fCopy.geometry, "soft"),
          },
          _roundedAtlas: {
            ...fCopy,
            geometry: smoothGlobeGeometry(fCopy.geometry, "atlas"),
          },
        };
      });
      setIsLoading(false);
    };
    const loadLand = (url: string, isFallback: boolean): void => {
      fetch(url)
        .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
        .then(processLand)
        .catch(() => {
          if (!isFallback) loadLand("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json", true);
          else setIsLoading(false);
        });
    };
    loadLand("/atlas/countries-110m.json", false);
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
      // A hidden container measures 0×0. Keep the last size: at radius 0 the
      // glass rim's arc throws inside draw(), and the loop never restarts.
      if (r.width === 0 || r.height === 0) return;
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
    const regularGraticule = d3.geoGraticule10();
    const compactGraticule = d3.geoGraticule().step([30, 30])();
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
      const activeCollyVariant = visualPresetRef.current === "colly-evolved"
        ? (collyVariantRef.current ?? "atlas-index")
        : undefined;
      const renderProfile = resolveGlobeRenderProfile(
        activeCollyVariant ? undefined : visualPresetRef.current,
      );
      const collyProfile = activeCollyVariant
        ? resolveCollyGlobeVariantProfile(activeCollyVariant)
        : null;
      const P = resolveGlobeVisualPalette(
        activeCollyVariant ? undefined : visualPresetRef.current,
        themeRef.current,
      );

      /* One outline for every marker on the globe - the cut-corner square by
         default - so the taste markers below are the same shape as the cities. */
      const drawMarkerShape = (cx: number, cy: number, half: number, bev: number) => {
        ctx.beginPath();
        if (P.markerStyle === "ring") {
          ctx.arc(cx, cy, half, 0, Math.PI * 2);
          return;
        }
        if (P.markerStyle === "diamond") {
          ctx.moveTo(cx, cy - half);
          ctx.lineTo(cx + half, cy);
          ctx.lineTo(cx, cy + half);
          ctx.lineTo(cx - half, cy);
          ctx.closePath();
          return;
        }
        if (P.markerStyle === "square") {
          ctx.rect(cx - half, cy - half, half * 2, half * 2);
          return;
        }
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
      const [R, G, B] = P.label.split(",");

      const stage = stageRef.current;
      stage.shift = lerp(stage.shift, stageTargetRef.current.shift, 0.08);
      stage.scale = lerp(stage.scale, stageTargetRef.current.scale, 0.08);
      const baseScale = baseSizeRef.current * (collyProfile?.scaleRatio ?? renderProfile.scaleRatio) * stage.scale;
      // Higher lerp factor (0.22 vs old 0.07) makes cluster taps feel
      // near-instant: ~167ms to fully zoom into a country/city instead of
      // ~500ms. Pinch and wheel still feel smooth because their input is
      // already incremental.
      currentScaleRef.current = lerp(currentScaleRef.current, targetScaleRef.current, 0.22);

      const offsetScale = Math.min(w, h);
      const activeOffset = collyProfile?.offset ?? renderProfile.offset;
      projection
        .translate([
          w / 2 + activeOffset[0] * offsetScale + stage.shift * w,
          h / 2 + activeOffset[1] * offsetScale,
        ])
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

      const center = projection.translate() as [number, number];
      const radius = projection.scale();
      const density = resolveGlobeViewportDensity(w);
      const canvasStyleArgs = {
        ctx,
        path,
        sphere,
        graticule: density === "compact" ? compactGraticule : regularGraticule,
        center,
        radius,
        palette: P,
        profile: renderProfile,
        collyProfile,
        drillOpacity: dOp,
        density,
      };
      const techniqueMuseums = museumPointsRef.current.map((museum) => ({
        id: museum.key,
        city: museum.city.city,
        country: museum.country,
        coordinates: museum.coordinates,
        artworkCount: museum.artworkCount,
        isMajor: museum.isMajor,
      }));
      const projectedMuseums = museumPointsRef.current.flatMap((museum) => {
        if (
          countryClusterMode
          && viewProximityAlpha(museum.coordinates, viewCenterFromRot(rot)) <= 0
        ) return [];
        if (d3.geoDistance(museum.coordinates, [-rot[0], -rot[1]]) > Math.PI / 2) return [];
        const point = projection(museum.coordinates);
        if (!point) return [];
        return [{
          id: museum.key,
          city: museum.city.city,
          country: museum.country,
          coordinates: museum.coordinates,
          artworkCount: museum.artworkCount,
          isMajor: museum.isMajor,
          x: point[0],
          y: point[1],
          visible: true,
        }];
      });
      const focusedCity = hoveredRef.current ?? selectedRef.current;
      const focusedMuseumId = focusedCity
        ? museumPointsRef.current.find((museum) => museum.city === focusedCity)?.key ?? null
        : null;
      const renderGeometry = (source: any) => {
        if (!source) return source;
        if (collyProfile?.geometrySoftness === "atlas") {
          return source._roundedAtlas || source._roundedSoft || source._smoothed || source;
        }
        if (collyProfile?.geometrySoftness === "soft") {
          return source._roundedSoft || source._smoothed || source;
        }
        return source._smoothed || source;
      };
      const techniqueArgs: CollyMapTechniqueRenderArgs | null = collyProfile
        ? {
            ctx,
            path,
            projection,
            sphere,
            land: renderGeometry(landRef.current),
            borders: renderGeometry(bordersRef.current),
            countryFeatures: countriesRef.current.flatMap((feature) => {
              const name = COUNTRY_NAMES[String(feature.id)];
              return name ? [{ name, feature: renderGeometry(feature) }] : [];
            }),
            palette: P,
            profile: collyProfile,
            museums: techniqueMuseums,
            projectedMuseums,
            activeContinent,
            currentScale: currentScaleRef.current,
            drilled: Boolean(drilled),
            focusedMuseumId,
            reducedMotion: reducedMotionRef.current,
            width: w,
            height: h,
            center,
            radius,
            viewCenter: viewCenterFromRot(rot),
          }
        : null;

      const glassProfile = resolveGlobeGlassProfile(glassTweakRef.current);
      const glassArgs = glassProfile
        ? { ctx, center, radius, currentScale: currentScaleRef.current }
        : null;

      if (glassProfile && glassArgs) drawGlassUnderlay(glassArgs, glassProfile);
      drawSphereSurface(canvasStyleArgs);
      drawGlobeFurniture(canvasStyleArgs);
      if (techniqueArgs) drawTechniqueUnderlay(techniqueArgs);

      // Land
      if (landRef.current) {
        drawStyledLand({
          ...canvasStyleArgs,
          geometry: renderGeometry(landRef.current),
        });
      }
      // Two label systems exist: continent clusters (production behaviour) and
      // the COLLY technique's country labels. They used to draw at the same
      // time and collide, so the technique only takes over once the view is
      // inside a continent - top level stays on continent clusters.
      const techniqueLabelsActive = countryClusterMode || Boolean(drilled);
      const techniqueOverlayDrawn = techniqueArgs && techniqueLabelsActive
        ? drawTechniqueOverlay(techniqueArgs)
        : false;

      // Borders
      if (bordersRef.current) {
        drawStyledBorders({
          ...canvasStyleArgs,
          geometry: renderGeometry(bordersRef.current),
          isMobile: isMobileRef.current,
          boundaryStyle: countryBoundaryStyle,
          viewportWidth: w,
        });
      }

      drawAtmosphereFinish(canvasStyleArgs);
      if (glassProfile && glassArgs) drawGlassOverlay(glassArgs, glassProfile);

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
               ctx.fillStyle = `rgba(${P.accentRgb},0.015)`;
               ctx.beginPath();
               countriesRef.current.forEach((c: any) => {
                   const cName = COUNTRY_NAMES[String(c.id)];
                   if (cName && CONTINENT_MAP[cName] === hovContinent) {
                       path(renderGeometry(c));
                   }
               });
               ctx.fill();
               ctx.restore();
           }
        } else {
           const isDrilledCountry = drilled && drilled.id === hovId;
           if (!isDrilledCountry) {
             ctx.save();
             ctx.globalAlpha = 1 - dOp * 0.5;

             ctx.beginPath();
             path(renderGeometry(hovCountry));
             ctx.fillStyle = `rgba(${P.accentRgb},0.02)`;
             ctx.fill();

             ctx.beginPath();
             path(renderGeometry(hovCountry));
             ctx.strokeStyle = `rgba(${P.accentRgb},0.12)`;
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
        path(renderGeometry(drilled.feature));
        ctx.fillStyle = `rgba(${R},${G},${B},0.04)`;
        ctx.fill();

        ctx.beginPath();
        path(renderGeometry(drilled.feature));
        ctx.strokeStyle = `rgba(${P.accentRgb},0.30)`;
        ctx.lineWidth = 1.2;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke();

        ctx.restore();
      }

      // City markers + zoomed-out museum preview
      const sel = selectedRef.current;
      const viewCenter = viewCenterFromRot(rot);
      // Proximity fade: 1 at the view centre → 0 past the outer radius. Off when
      // not in cluster mode or while drilled into a single country.
      const viewFade = (coords: [number, number]) =>
        (!countryClusterMode || drilled) ? 1 : viewProximityAlpha(coords, viewCenter);
      const visibleCities = getVisibleCities(countryClusterMode, viewCenter, drilled);

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
          } else {
            countryTotals.set(c.country, (countryTotals.get(c.country) || 0) + c.venues.length);
            countryArtworks.set(c.country, (countryArtworks.get(c.country) || 0) + (c.artworkCount || 0));
          }
        });
      }

      // Total country numbers
      if (
        !drilled
        && dOp < 0.5
        && countriesRef.current
        && !(collyProfile && countryClusterMode)
      ) {
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

                const continentLabel = localizeContinentName(name, languageRef.current);
                drawContinentLabel({
                  ctx,
                  x: p[0],
                  y: p[1],
                  continentKey: name,
                  label: continentLabel,
                  total,
                  language: languageRef.current,
                  hoverProgress: op,
                  palette: P,
                  profile: renderProfile,
                  collyProfile,
                  density,
                });
            });
        } else if (activeContinent) {
            const hovCountry = hoveredCountryRef.current;
            const hovId = hovCountry ? String(hovCountry.id) : null;
            const showDenseNames = currentScaleRef.current >= countryLabelRevealZoom(renderProfile);
            const countryLabelBoxes: { x1: number; y1: number; x2: number; y2: number }[] = [];
            const labelOpRef = countryLabelOpacitiesRef.current;

            countriesRef.current.forEach((c: any) => {
              const id = String(c.id);
              const name = COUNTRY_NAMES[id];
              if (!name) return;
              const total = countryTotals.get(name);
              if (!total) return;

              const mainlandC = getMainlandFeature(c);
              if (!mainlandC) return;
              const centroid = d3.geoCentroid(mainlandC);

              const isHovered = (id === hovId);
              const vf = viewFade(centroid);
              if (!isHovered && vf <= 0) return;
              const dist = d3.geoDistance(centroid, viewCenter);
              if (dist > Math.PI / 2) return;
              const p = projection(centroid);
              if (!p) return;

              const qualifiesForDenseLabel = true;
              const targetNameOp = isHovered
                ? 1
                : (showDenseNames && qualifiesForDenseLabel ? 0.9 : 0);
              let nameOp = labelOpRef.get(id) || 0;
              nameOp = lerp(nameOp, targetNameOp, 0.18);
              labelOpRef.set(id, nameOp);

              // Number is always visible (fades with proximity when not hovered).
              const countryNumberSize = renderProfile.labelMode === "accessible" ? 12 : 11;
              ctx.font = `500 ${countryNumberSize}px ${P.labelFont}`;
              const numberAlpha = isHovered ? (0.75 + nameOp * 0.2) : (0.54 + nameOp * 0.18) * vf;
              ctx.fillStyle = isHovered ? `rgba(${P.accentRgb},${numberAlpha})` : `rgba(${R},${G},${B},${numberAlpha})`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(`${total}`, p[0], p[1] + 8);

              let shouldShowName = isHovered
                || (showDenseNames && qualifiesForDenseLabel)
                || nameOp > 0.03;
              if (shouldShowName) {
                const localizedCountry = localizeCountryName(name, languageRef.current);
                const sentenceCase = renderProfile.labelMode === "editorial"
                  || renderProfile.labelMode === "minimal"
                  || renderProfile.labelMode === "accessible";
                const label = languageRef.current === "ko" || sentenceCase
                  ? localizedCountry
                  : localizedCountry.toUpperCase();
                const countryLabelSize = renderProfile.labelMode === "accessible" ? 14 : 12;
                ctx.font = `600 ${countryLabelSize}px ${P.labelFont}`;
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
                  const labelAlpha = isHovered ? Math.max(0.75, nameOp) : (0.82 * nameOp) * vf;
                  if (renderProfile.labelMode === "accessible") {
                    ctx.lineWidth = 4;
                    ctx.strokeStyle = "rgba(220,235,242,0.96)";
                    ctx.strokeText(label, p[0], p[1] - 4 - (1 - nameOp) * 2);
                  } else if (renderProfile.labelMode === "minimal") {
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = "rgba(6,7,13,0.82)";
                    ctx.strokeText(label, p[0], p[1] - 4 - (1 - nameOp) * 2);
                  }
                  ctx.fillStyle = isHovered ? `rgba(${P.accentRgb},${labelAlpha})` : `rgba(${R},${G},${B},${labelAlpha})`;
                  ctx.textAlign = "center";
                  ctx.textBaseline = "middle";
                  ctx.fillText(label, p[0], p[1] - 4 - (1 - nameOp) * 2);
                }
              }
            });

            // City-states (Hong Kong, Singapore) have no topojson country
            // geometry, so the loop above can't place their number — draw it at
            // the marker coordinate instead (same proximity fade as countries).
            citiesRef.current.forEach((m) => {
              if (m.detail) return;
              const total = countryTotals.get(m.country);
              if (!total) return;
              const vf = viewFade(m.coordinates);
              if (vf <= 0) return;
              if (d3.geoDistance(m.coordinates, viewCenter) > Math.PI / 2) return;
              const p = projection(m.coordinates);
              if (!p) return;
              ctx.font = `500 11px ${P.labelFont}`;
              ctx.fillStyle = `rgba(${R},${G},${B},${0.54 * vf})`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(`${total}`, p[0], p[1] + 10);
            });
        }
        ctx.restore();
      }

      // Museum preview dots: visible until a country is drilled (smooth fade in/out).
      const museumPreviewTargetOpacity = drilled ? 0 : 1;
      museumPreviewOpacityRef.current = lerp(museumPreviewOpacityRef.current, museumPreviewTargetOpacity, 0.12);
      const museumPreviewOpacity = museumPreviewOpacityRef.current;

      // The cinematic intro hides all pins until its particles land on them.
      const introHidesPins = typeof window !== "undefined" && (window as any).__arminHidePins;

      const drawProductionPreviewMarkers = !collyProfile
        || !techniqueLabelsActive
        || shouldDrawProductionPreviewMarkers(collyProfile.technique, {
          drilled: Boolean(drilled),
          derivedDataAvailable: techniqueMuseums.length > 0 && techniqueOverlayDrawn,
        });
      if (museumPreviewOpacity > 0.01 && !introHidesPins && drawProductionPreviewMarkers) {
        museumPointsRef.current.forEach((m) => {
          const fade = viewFade(m.coordinates);
          if (fade <= 0) return;
          const dist = d3.geoDistance(m.coordinates, [-rot[0], -rot[1]]);
          if (dist > Math.PI / 2) return;
          const p = projection(m.coordinates);
          if (!p) return;

          const emphasis = resolveCollyMuseumEmphasis(
            activeCollyVariant,
            m.artworkCount,
            m.isMajor,
          );
          const alpha = (m.isMajor ? 0.34 : 0.24)
            * museumPreviewOpacity
            * fade
            * (collyProfile ? emphasis.alphaScale : 1);
          drawMuseumPreviewMarker({
            ctx,
            x: p[0],
            y: p[1],
            isMajor: m.isMajor || (collyProfile !== null && emphasis.level === "primary"),
            alpha,
            palette: P,
            profile: renderProfile,
            sizeScale: collyProfile ? emphasis.sizeScale : 1,
            pulse: false,
          });
        });
      }

      if ((countryClusterMode || drilled) && !introHidesPins) {
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
          const fade = isActive ? 1 : viewFade(m.coordinates);
          const venueCount = m.venues.length;

          ctx.save();
          ctx.globalAlpha = dimFactor * fade;

          if (isActive) {
            drawMarkerShape(p[0], p[1], 8, 2);
            ctx.strokeStyle = P.accent;
            ctx.lineWidth = 0.8;
            ctx.stroke();
            drawMarkerShape(p[0], p[1], 2.5, 0.8);
            ctx.fillStyle = P.accent;
            ctx.fill();
          } else if (venueCount >= 10) {
            drawMarkerShape(p[0], p[1], 4.5, 1);
            ctx.fillStyle = P.accent;
            ctx.globalAlpha *= 0.85;
            ctx.fill();
          } else if (venueCount >= 3) {
            drawMarkerShape(p[0], p[1], 3.8, 0.8);
            ctx.fillStyle = `rgba(${P.majorMarker},0.35)`;
            ctx.fill();
            ctx.strokeStyle = `rgba(${P.majorMarker},0.25)`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          } else {
            drawMarkerShape(p[0], p[1], venueCount > 1 ? 3.5 : 2.2, 0.6);
            ctx.fillStyle = `rgba(${P.minorMarker},0.40)`;
            ctx.fill();
          }

          if (isInDrilledCountry && dOp > 0.1) {
            const labelAlpha = isActive ? dOp * 0.75 : dOp * 0.45;
            ctx.globalAlpha = labelAlpha;
            ctx.fillStyle = `rgba(${R},${G},${B},0.9)`;
            ctx.font = `9px ${P.labelFont}`;
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
                ctx.fillStyle = P.accent;
                ctx.font = '8px "Space Mono", monospace';
                ctx.fillText(`${venueCount}`, finalPos.cx + tw + 5, finalPos.cy + 1);
              }
            }
          }

          ctx.restore();
        });
      }

      drawGlobeCrosshair(canvasStyleArgs);

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
      if (!countryClusterMode) suppressContinentSyncRef.current = false;
      if (countryClusterMode && !suppressContinentSyncRef.current && activeContinent && lastSyncedContinentRef.current !== activeContinent) {
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
           } else if (countryClusterMode && stats.countryTotals.has(name)) {
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
        Math.abs(stageRef.current.shift - stageTargetRef.current.shift) > 0.0005 ||
        Math.abs(stageRef.current.scale - stageTargetRef.current.scale) > 0.0005 ||
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
        suppressContinentSyncRef.current = true;
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

    hoveredRef.current = null;
    if (countryClusterMode) {
      const visibleCities = getVisibleCities(countryClusterMode, viewCenterFromRot(rot), drilled);
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

  const stepZoomOut = useCallback(() => {
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
        targetRotRef.current = centroid ? [-centroid[0], -centroid[1], 0] : null;
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
      suppressContinentSyncRef.current = true;
      cbRefs.current.onDrillContinent?.(null);
      targetRotRef.current = null;
      targetScaleRef.current = 1;
      cbRefs.current.onSelectCity(null);
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const rotationStep = 6;
    let handled = true;
    let clearTargetRotation = true;

    switch (e.key) {
      case "ArrowLeft":
        rotationRef.current[0] -= rotationStep;
        break;
      case "ArrowRight":
        rotationRef.current[0] += rotationStep;
        break;
      case "ArrowUp":
        rotationRef.current[1] = Math.min(80, rotationRef.current[1] + rotationStep);
        break;
      case "ArrowDown":
        rotationRef.current[1] = Math.max(-80, rotationRef.current[1] - rotationStep);
        break;
      case "+":
      case "=":
        targetScaleRef.current = Math.min(8, targetScaleRef.current + 0.4);
        cbRefs.current.onZoomChange?.(targetScaleRef.current);
        break;
      case "-":
        targetScaleRef.current = Math.max(1, targetScaleRef.current - 0.4);
        cbRefs.current.onZoomChange?.(targetScaleRef.current);
        break;
      case "Escape":
        stepZoomOut();
        clearTargetRotation = false;
        break;
      default:
        handled = false;
    }

    if (!handled) return;
    e.preventDefault();
    if (clearTargetRotation) targetRotRef.current = null;
    velocityRef.current = [0, 0];
    wakeGlobeRef.current?.();
  }, [stepZoomOut]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    wakeGlobeRef.current?.();

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
      const visibleCitiesT = getVisibleCities(countryClusterModeT, viewCenterFromRot(rot), drilledRef.current);
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

      // Country cluster mode: ignore clicks on countries far from the current view.
      const mainland = getMainlandFeature(clickedCountry);
      const centroid = d3.geoCentroid(mainland);
      if (countryClusterMode && viewProximityAlpha(centroid, viewCenterFromRot(rotationRef.current)) <= 0) {
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
  }, [getActiveContinentForView, getVisibleCities, stepZoomOut]);

  // ─── Render ───────────────────────────────────────

  const t = theme === "light";
  const activeCollyVariant = visualPreset === "colly-evolved"
    ? (collyVariant ?? "atlas-index")
    : undefined;
  const markupProfile = visualPreset
    ? resolveGlobeRenderProfile(activeCollyVariant ? undefined : visualPreset)
    : null;
  const collyProfile = activeCollyVariant
    ? resolveCollyGlobeVariantProfile(activeCollyVariant)
    : null;

  return (
    <div
      ref={containerRef}
      className="ig-globe-container"
      data-country-boundary-style={countryBoundaryStyle}
      data-globe-visual-preset={visualPreset}
      data-globe-render-style={markupProfile?.renderStyle}
      data-globe-furniture={markupProfile?.furniture}
      data-globe-atmosphere={markupProfile?.atmosphere}
      data-globe-label-mode={markupProfile?.labelMode}
      data-globe-preview-marker={markupProfile?.previewMarker}
      data-colly-globe-variant={activeCollyVariant}
      data-colly-map-technique={collyProfile?.technique}
    >
      <canvas
        ref={canvasRef}
        className="ig-globe-canvas"
        role={visualPreset ? "group" : undefined}
        tabIndex={visualPreset ? 0 : undefined}
        aria-label={visualPreset ? (language === "ko" ? "인터랙티브 미술관 지구본" : "Interactive museum globe") : undefined}
        aria-keyshortcuts={visualPreset ? "ArrowLeft ArrowRight ArrowUp ArrowDown + - Escape" : undefined}
        style={{ cursor: "grab", touchAction: "none" }}
        onKeyDown={visualPreset ? handleKeyDown : undefined}
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
              suppressContinentSyncRef.current = true;
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
