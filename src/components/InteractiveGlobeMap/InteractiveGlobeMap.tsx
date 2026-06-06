import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { Globe } from "./Globe";
import { VenuePanel } from "./VenuePanel";
import { InteractiveGlobeRealModal } from "./InteractiveGlobeRealModal";
import { useLanguage } from "../../contexts/LanguageContext";
import { localizeCityName, localizeContinentName, localizeCountryName, localizeGeoLabel } from "../../i18n/geoLocalization";

import type { CityMarker, Theme, Venue, InteractiveExhibition } from "./types";
import type { Exhibition } from "../../types/Exhibition";
import "./InteractiveGlobe.css"; // Ensure new CSS is imported

// ─── Helpers ───────────────────────────────────────────────

const extractCountry = (d: any): string => {
  let c = d.country;
  if (!c && d.location && typeof d.location === 'string') c = d.location;
  if (!c) return '';
  const raw = c.toLowerCase();
  if (raw === 'usa' || raw === 'us' || raw.includes('united states') || raw.includes('america')) return 'United States';
  if (raw.includes('uk') || raw.includes('united kingdom') || raw.includes('england') || raw.includes('scotland') || raw.includes('wales')) return 'United Kingdom';
  if (raw.includes('서울') || raw.includes('korea') || raw.includes('한국')) return 'South Korea';
  if (raw.includes('france') || raw.includes('paris')) return 'France';
  if (raw.includes('germany') || raw.includes('deutschland')) return 'Germany';
  if (raw.includes('italy') || raw.includes('italia')) return 'Italy';
  if (raw.includes('spain') || raw.includes('españa') || raw.includes('espanya')) return 'Spain';
  if (raw.includes('japan') || raw.includes('日本')) return 'Japan';
  if (raw.includes('hong kong') || raw.includes('香港')) return 'Hong Kong';
  if (raw.includes('taiwan') || raw.includes('台灣') || raw.includes('taipei')) return 'Taiwan';
  if (raw.includes('china') || raw.includes('中国')) return 'China';
  if (raw.includes('netherlands') || raw.includes('holland')) return 'Netherlands';
  if (raw.includes('brazil') || raw.includes('brasil')) return 'Brazil';
  if (raw.includes('india')) return 'India';
  if (raw.includes('denmark')) return 'Denmark';
  if (raw.includes('finland')) return 'Finland';

  if (d.country && typeof d.country === 'string') return d.country;
  return '';
};

// Strip postal codes from city strings
const stripPostalCode = (s: string): string => s.replace(/^\d{3,10}\s+/, '').trim();

// Collapse spelling variants to a single canonical city name so the same place
// (e.g. "St. Petersburg" vs "Saint Petersburg") shares one minimap entry.
const normalizeCityName = (name: string): string => {
  const trimmed = (name || '').trim();
  if (!trimmed) return trimmed;
  if (/^st\.?\s+petersburg$/i.test(trimmed)) return 'Saint Petersburg';
  // Vatican City is a 0.5 km² enclave inside Rome — fold it into the Rome cluster
  // so the Vatican Museums show up as a dot on Rome's minimap.
  if (/^vatican/i.test(trimmed)) return 'Rome';
  return trimmed;
};

const extractCity = (ex: any): string => {
  if (ex && ex.cityCluster && typeof ex.cityCluster === 'string') return normalizeCityName(ex.cityCluster);

  const regionRaw = (ex && ex.region && typeof ex.region === 'string') ? ex.region : '';
  if (regionRaw) {
    const r = regionRaw.toLowerCase();

    if (r.includes('san francisco') || r.includes('sfmoma')) return 'San Francisco';
    if (r.includes('los angeles') || r.includes('lacma') || r.includes('getty')) return 'Los Angeles';
    // California state-only fallback: split by latitude (Bay Area ≈ 37+, LA ≈ 34)
    if (r === 'california' || r.startsWith('california,') || r.startsWith('california ')) {
      const lat = Number(ex.latitude);
      if (Number.isFinite(lat) && lat >= 36) return 'San Francisco';
      return 'Los Angeles';
    }
    // US state-only regions that map unambiguously to a single city in current data
    if (r === 'massachusetts' || r.startsWith('massachusetts,')) return 'Boston';
    if (r === 'texas' || r.startsWith('texas,')) return 'Houston';
    if (r === 'arkansas' || r.startsWith('arkansas,')) return 'Bentonville';
    if (r === 'ohio' || r.startsWith('ohio,')) return 'Cleveland';
    if (r === 'pennsylvania' || r.startsWith('pennsylvania,')) return 'Philadelphia';
    if (r === 'georgia' || r.startsWith('georgia,')) return 'Atlanta';
    if (r === 'michigan' || r.startsWith('michigan,')) return 'Detroit';
    if (r === 'quebec' || r.startsWith('quebec,')) return 'Montreal';
    if (r === 'cornwall' || r.startsWith('cornwall,')) return 'St Ives';
    if (r.includes('new south wales')) return 'Sydney';
    if (r === 'victoria' || r === 'victoria, australia') return 'Melbourne';
    if (r === 'queensland' || r.startsWith('queensland,')) return 'Brisbane';
    if (r.includes('cairo governorate')) return 'Cairo';
    if (r.includes('giza governorate')) return 'Giza';
    if (r.includes('western cape')) return 'Cape Town';
    if (r.includes('north jutland') || r.includes('nordjylland')) return 'Skagen';
    if (r === 'gyeonggi' || r.startsWith('gyeonggi') || r.includes('경기')) {
      // Gyeonggi covers many cities; use location field to differentiate before falling back
      const loc = (ex.location || '').toLowerCase();
      if (loc.includes('용인') || loc.includes('yongin')) return 'Yongin';
      if (loc.includes('수원') || loc.includes('suwon')) return 'Suwon';
      if (loc.includes('과천') || loc.includes('gwacheon')) return 'Gwacheon';
      return 'Gwacheon';
    }
    if (r === 'wales' || r.startsWith('wales,')) return 'Cardiff';
    if (r.includes('london')) return 'London';
    if (r.includes('new york')) return 'New York';
    if (r.includes('paris')) return 'Paris';
    if (r.includes('tokyo')) return 'Tokyo';
    if (r.includes('seoul') || r.includes('서울')) return 'Seoul';
    if (r.includes('jeju') || r.includes('제주') || r.includes('서귀포') || r.includes('seogwipo')) return 'Jeju';
    if (r.includes('gwangju') || r.includes('광주')) return 'Gwangju';
    if (r.includes('jeonju') || r.includes('전주')) return 'Jeonju';
    if (r.includes('busan') || r.includes('부산')) return 'Busan';
    if (r.includes('daegu') || r.includes('대구')) return 'Daegu';
    if (r.includes('berlin')) return 'Berlin';
    if (r.includes('amsterdam')) return 'Amsterdam';
    if (r.includes('vienna') || r.includes('wien')) return 'Vienna';
    if (r.includes('rome') || r.includes('roma')) return 'Rome';
    if (r.includes('madrid')) return 'Madrid';
    if (r.includes('barcelona')) return 'Barcelona';
    if (r.includes('munich') || r.includes('münchen')) return 'Munich';
    if (r.includes('hamburg')) return 'Hamburg';
    if (r.includes('edinburgh')) return 'Edinburgh';
    if (r.includes('liverpool')) return 'Liverpool';
    if (r.includes('manchester')) return 'Manchester';
    if (r.includes('oxford')) return 'Oxford';
    if (r.includes('cambridge')) return 'Cambridge';
    if (r.includes('chicago')) return 'Chicago';
    if (r.includes('houston')) return 'Houston';
    if (r.includes('washington')) return 'Washington';
    if (r.includes('philadelphia')) return 'Philadelphia';
    if (r.includes('cleveland')) return 'Cleveland';
    if (r.includes('minneapolis')) return 'Minneapolis';
    if (r.includes('atlanta')) return 'Atlanta';
    if (r.includes('detroit')) return 'Detroit';
    if (r.includes('boston')) return 'Boston';
    if (r.includes('bentonville')) return 'Bentonville';
    if (r.includes('montreal')) return 'Montreal';
    if (r.includes('toronto')) return 'Toronto';
    if (r.includes('beijing') || r.includes('peking') || r.includes('北京')) return 'Beijing';
    if (r.includes('shanghai') || r.includes('上海')) return 'Shanghai';
    if (r.includes('hong kong')) return 'Hong Kong';
    if (r.includes('guangzhou')) return 'Guangzhou';
    if (r.includes('shenzhen')) return 'Shenzhen';
    if (r.includes('nanjing')) return 'Nanjing';
    if (r.includes('hangzhou')) return 'Hangzhou';
    if (r.includes('taipei')) return 'Taipei';
    if (r.includes('osaka')) return 'Osaka';
    if (r.includes('kanazawa')) return 'Kanazawa';
    if (r.includes('sydney')) return 'Sydney';
    if (r.includes('florence') || r.includes('firenze')) return 'Florence';
    if (r.includes('venice') || r.includes('venezia')) return 'Venice';
    if (r.includes('milan') || r.includes('milano')) return 'Milan';
    if (r.includes('brussels') || r.includes('bruxelles')) return 'Brussels';
    if (r.includes('prague') || r.includes('praha')) return 'Prague';
    if (r.includes('warsaw') || r.includes('warszawa')) return 'Warsaw';
    if (r.includes('budapest')) return 'Budapest';
    if (r.includes('stockholm')) return 'Stockholm';
    if (r.includes('oslo')) return 'Oslo';
    if (r.includes('copenhagen') || r.includes('københavn')) return 'Copenhagen';
    if (r.includes('helsinki')) return 'Helsinki';
    if (r.includes('zurich') || r.includes('zürich')) return 'Zurich';
    if (r.includes('moscow') || r.includes('moskva')) return 'Moscow';
    if (r.includes('the hague') || r.includes('den haag')) return 'The Hague';
    if (r.includes('sao paulo') || r.includes('são paulo')) return 'São Paulo';
    if (r.includes('buenos aires')) return 'Buenos Aires';
    if (r.includes('mexico city') || r.includes('ciudad de méxico')) return 'Mexico City';

    const firstSeg = regionRaw.split(',')[0].trim();
    return normalizeCityName(stripPostalCode(firstSeg) || firstSeg);
  }

  if (ex && ex.city && typeof ex.city === 'string') return normalizeCityName(ex.city);

  if (ex && ex.location && typeof ex.location === 'string') {
    const parts = ex.location.split(',').map((p: string) => p.trim());
    if (parts.length >= 1) {
      const first = parts[0];
      if (!/^\d|^(via|rue|place|piazza|strasse|straße|platz|square|avenue|blvd|boulevard|road|street)/i.test(first)) {
        return normalizeCityName(stripPostalCode(first));
      }
      return parts[1] ? normalizeCityName(stripPostalCode(parts[1])) : '';
    }
  }
  return '';
};

function formatCoord(lat: number, lon: number): string {
  const latD = lat >= 0 ? "N" : "S";
  const lonD = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(1)}\u00b0${latD}  ${Math.abs(lon).toFixed(1)}\u00b0${lonD}`;
}

function normalizeCollectionPath(inputPath: unknown): string {
  if (typeof inputPath !== "string") return "";
  const trimmed = inputPath.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("http://")) return `https://${trimmed.slice("http://".length)}`;
  if (trimmed.startsWith("/")) return trimmed;
  if (trimmed.startsWith("data/")) return `/${trimmed}`;
  return `/data/${trimmed.replace(/^\.?\//, "")}`;
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

// ─── App ───────────────────────────────────────────────────

interface InteractiveGlobeMapProps {
  exhibitions: Exhibition[];
  onSelectExhibition?: (ex: Exhibition) => void;
  onExit?: () => void;
  onSwitchToDrawing?: () => void;
}

export default function InteractiveGlobeMap({ exhibitions, onSelectExhibition, onExit, onSwitchToDrawing }: InteractiveGlobeMapProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { language, t: tt } = useLanguage();
  const [theme, setTheme] = useState<Theme>(() => {
    try { return localStorage.getItem('homeTheme') === 'light' ? 'light' : 'dark'; } catch { return 'light'; }
  });

  // Sync with home page dark/light toggle
  useEffect(() => {
    const handleThemeChange = () => {
      try {
        const isDark = localStorage.getItem('homeTheme') !== 'light';
        setTheme(isDark ? 'dark' : 'light');
      } catch { }
    };
    window.addEventListener('theme-changed', handleThemeChange);
    return () => window.removeEventListener('theme-changed', handleThemeChange);
  }, []);
  const [selectedCity, setSelectedCity] = useState<CityMarker | null>(null);
  const [drilledContinent, setDrilledContinent] = useState<string | null>(null);
  const [drilledCountry, setDrilledCountry] = useState<string | null>(null);
  const [rotation, setRotation] = useState<[number, number]>([0, 20]);
  const [zoom, setZoom] = useState(1);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);
  
  const [selectedRealExhibition, setSelectedRealExhibition] = useState<any | null>(null);
  const [isOpeningExhibition, setIsOpeningExhibition] = useState(false);
  const [openingExhibitionLabel, setOpeningExhibitionLabel] = useState<string>(tt({ ko: "전시 여는 중...", en: "Opening Exhibition..." }));
  const closingExhibitionIdRef = useRef<string | null>(null);
  const unresolvedRouteExhibitionIdRef = useRef<string | null>(null);
  const [artworkCounts, setArtworkCounts] = useState<Record<string, number>>({});
  const [hoverData, setHoverData] = useState<{ level: string; label: string; count: number } | null>(null);
  const lastRotationUpdateRef = useRef<{ lon: number; lat: number; ts: number }>({ lon: 0, lat: 20, ts: 0 });
  const lastZoomUpdateRef = useRef<{ zoom: number; ts: number }>({ zoom: 1, ts: 0 });

  const buildInteractivePath = (exhibitionLike: any): string => {
    const exhibitionId = String(exhibitionLike?._selectedExhibitionId || exhibitionLike?.id || "").trim();
    if (!exhibitionId) return "/interactive";

    const country = toSlug(String(exhibitionLike?._routeCountry || selectedCity?.country || "world"));
    const city = toSlug(String(exhibitionLike?._routeCity || selectedCity?.city || "city"));
    return `/interactive/${country}/${city}/${encodeURIComponent(exhibitionId)}`;
  };

  const closeRealModal = () => {
    setIsOpeningExhibition(false);
    unresolvedRouteExhibitionIdRef.current = null;
    closingExhibitionIdRef.current = String(
      selectedRealExhibition?._selectedExhibitionId || selectedRealExhibition?.id || ""
    ).trim() || null;
    setSelectedRealExhibition(null);
    if (location.pathname.startsWith('/interactive/') && location.pathname !== '/interactive') {
      navigate('/interactive', { replace: true });
    } else {
      closingExhibitionIdRef.current = null;
    }
  };

  // Fetch pre-built artwork counts
  useEffect(() => {
    fetch('/data/museum-artwork-counts.json')
      .then(r => r.json())
      .then(data => setArtworkCounts(data))
      .catch(() => { });
  }, []);

  const t = theme === "light";

  const cities = useMemo(() => {
    const cityMap = new Map<string, CityMarker>();

    for (const ex of exhibitions) {
      if (typeof ex.latitude !== 'number' || typeof ex.longitude !== 'number') continue;
      if (ex.latitude === 0 && ex.longitude === 0) continue;

      const country = extractCountry(ex) || 'Unknown';
      let city = extractCity(ex) || 'Unknown';
      if (city.length > 20) city = city.split(',')[0].trim();

      const key = `${country}-${city}`;

      const code = (ex.name.length + city.length) % 3;
      const category: "bauhaus" | "design" | "architecture" =
        code === 0 ? "bauhaus" : code === 1 ? "design" : "architecture";

      let year = "Unknown";
      const interactiveExhibitions: InteractiveExhibition[] = [];

      if (Array.isArray(ex.permanentExhibitions)) {
        ex.permanentExhibitions.forEach(e => {
          interactiveExhibitions.push({ id: e.id, title: e.title || e.name || '', period: 'Permanent', type: "permanent" });
          if (year === "Unknown" && e.startDate) year = e.startDate.split('-')[0];
        });
      }
      if (Array.isArray(ex.temporaryExhibitions)) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const fmtD = (d?: string) => {
          if (!d || d === 'ongoing' || d === 'Permanent') return '';
          // "2026-03-21" → "26.03.21"
          if (d.length >= 10) return d.slice(2,4) + '.' + d.slice(5,7) + '.' + d.slice(8,10);
          if (d.length >= 7)  return d.slice(2,4) + '.' + d.slice(5,7);
          return d.slice(0,4);
        };
        ex.temporaryExhibitions.forEach(e => {
          let exType: "current" | "upcoming" | "past" = "current";
          if (e.endDate && new Date(e.endDate) < today) {
            exType = "past";
          } else if (e.startDate && new Date(e.startDate) > today) {
            exType = "upcoming";
          }
          const s = fmtD(e.startDate); const en = fmtD(e.endDate);
          const period = s && en ? `${s} ~ ${en}` : s || en || e.startDate?.slice(0,4) || '';
          interactiveExhibitions.push({ id: e.id, title: e.title || e.name || '', period, type: exType });
          if (year === "Unknown" && e.startDate) year = e.startDate.split('-')[0];
        });
      }
      if (Array.isArray(ex.pastExhibitions)) {
        const fmtD = (d?: string) => {
          if (!d || d === 'ongoing' || d === 'Permanent') return '';
          if (d.length >= 10) return d.slice(2,4) + '.' + d.slice(5,7) + '.' + d.slice(8,10);
          if (d.length >= 7)  return d.slice(2,4) + '.' + d.slice(5,7);
          return d.slice(0,4);
        };
        ex.pastExhibitions.forEach(e => {
          const s = fmtD(e.startDate); const en = fmtD(e.endDate);
          const period = s && en ? `${s} ~ ${en}` : s || en || e.startDate?.slice(0,4) || '';
          interactiveExhibitions.push({ id: e.id, title: e.title || e.name || '', period, type: "past" });
          if (year === "Unknown" && e.startDate) year = e.startDate.split('-')[0];
        });
      }

      if (year === "Unknown") year = "Recent";

      const venue: Venue = {
        id: ex.id,
        name: ex.name,
        year: year,
        category,
        museumCity: city,
        latitude: ex.latitude,
        longitude: ex.longitude,
        architect: undefined,
        artworkCount: artworkCounts[ex.id] || 0,
        exhibitions: interactiveExhibitions,
        originalExhibition: ex
      };

      if (!cityMap.has(key)) {
        cityMap.set(key, {
          city: city,
          coordinates: [ex.longitude, ex.latitude],
          country: country,
          detail: !['Hong Kong', 'Singapore'].includes(country),
          venues: [venue],
          artworkCount: artworkCounts[ex.id] || 0
        });
      } else {
        const existing = cityMap.get(key)!;
        existing.venues.push(venue);
        existing.artworkCount = (existing.artworkCount || 0) + (artworkCounts[ex.id] || 0);
      }
    }

    const rawCities = Array.from(cityMap.values());
    
    // --- GEOGRAPHIC CLUSTERING ---
    // Merge only cities close enough to read as one metro area; keep genuinely
    // separate cities on their own marker. Distance is real-world kilometres
    // (equirectangular approximation) so the rule behaves the same at every
    // latitude — a fixed degree radius would cover far more ground near the
    // equator than near the poles. 45 km sits in the natural gap between metro
    // satellites that should stay folded in (Seoul–Yongin ~40 km, Paris–
    // Versailles ~17 km, LA–San Marino ~15 km) and distinct cities that should
    // split (Jeonju–Gwangju ~75 km, Liverpool–Manchester ~51 km).
    const GEO_MERGE_DIST_KM = 45;
    const distanceKm = (a: [number, number], b: [number, number]): number => {
        const dLat = a[1] - b[1];
        const dLng = a[0] - b[0];
        const meanLat = ((a[1] + b[1]) / 2) * Math.PI / 180;
        const x = dLng * Math.cos(meanLat);
        return 111.195 * Math.sqrt(dLat * dLat + x * x);
    };

    // Sort by count descending so larger cities consume smaller surrounding towns
    rawCities.sort((a, b) => b.venues.length - a.venues.length);

    const clusteredCities: CityMarker[] = [];
    const mergedIndices = new Set<number>();

    for (let i = 0; i < rawCities.length; i++) {
        if (mergedIndices.has(i)) continue;
        const mainCity = rawCities[i];

        let mergedVenues = [...mainCity.venues];

        for (let j = i + 1; j < rawCities.length; j++) {
            if (mergedIndices.has(j)) continue;
            const otherCity = rawCities[j];

            const dist = distanceKm(mainCity.coordinates, otherCity.coordinates);

            if (dist < GEO_MERGE_DIST_KM) {
                // IMPORTANT: only merge cities within the SAME country
                if (mainCity.country !== otherCity.country) continue;
                
                mergedVenues = mergedVenues.concat(otherCity.venues);
                mergedIndices.add(j);
            }
        }
        
        clusteredCities.push({
            ...mainCity,
            venues: mergedVenues
        });
    }

    return clusteredCities;
  }, [exhibitions, artworkCounts]);

  useEffect(() => {
    if (!location.pathname.startsWith('/interactive')) return;

    const parts = location.pathname.split('/').filter(Boolean);
    const routeExhibitionId = parts.length >= 4 ? decodeURIComponent(parts[3]) : '';

    if (!routeExhibitionId) {
      unresolvedRouteExhibitionIdRef.current = null;
      closingExhibitionIdRef.current = null;
      setSelectedRealExhibition((prev) => {
        if (prev) return null;
        return prev;
      });
      setIsOpeningExhibition(false);
      return;
    }

    if (
      closingExhibitionIdRef.current &&
      routeExhibitionId === closingExhibitionIdRef.current
    ) {
      // Avoid immediate reopen if just closed
      return;
    }

    if (closingExhibitionIdRef.current && routeExhibitionId !== closingExhibitionIdRef.current) {
      closingExhibitionIdRef.current = null;
    }

    for (const cityMarker of cities) {
      for (const venue of cityMarker.venues) {
        const matched = venue.exhibitions.find((entry) => entry.id === routeExhibitionId);
        const original = venue.originalExhibition as any;

        if (!matched) {
          const museumRouteId = String(original?.id || venue.id || "");
          if (museumRouteId !== routeExhibitionId) continue;

          unresolvedRouteExhibitionIdRef.current = null;
          setSelectedCity(cityMarker);
          setSelectedRealExhibition((prev) => {
            // ONLY clear if we just navigated to the museum explicitly.
            // If prev evaluates to true, we return null to clear it safely.
            return null;
          });
          setIsOpeningExhibition(false);
          return;
        }

        const allSubs = [
          ...(original?.permanentExhibitions || []),
          ...(original?.temporaryExhibitions || []),
          ...(original?.pastExhibitions || []),
        ];
        const fullSub = allSubs.find((sub: any) => sub?.id === matched.id) || null;

        unresolvedRouteExhibitionIdRef.current = null;

        setSelectedCity(cityMarker);
        setSelectedRealExhibition((prev) => {
          const currentId = String(prev?._selectedExhibitionId || prev?.id || '');
          if (currentId === matched.id) return prev;
          return {
            ...original,
            _exhibitionTitle: matched.title,
            _selectedExhibitionId: matched.id,
            _selectedExhibitionType: matched.type,
            _routeCountry: cityMarker.country,
            _routeCity: cityMarker.city,
            _routeVenue: venue.name,
            collectionFile: normalizeCollectionPath(fullSub?.collectionFile),
          };
        });
        setIsOpeningExhibition(false);
        return;
      }
    }

    // Route target not found in current city/venue graph
    unresolvedRouteExhibitionIdRef.current = routeExhibitionId;
    setSelectedRealExhibition((prev) => {
      const currentId = String(prev?._selectedExhibitionId || prev?.id || '');
      if (currentId !== routeExhibitionId) return null;
      return prev;
    });
    setIsOpeningExhibition(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, cities]);

  useEffect(() => {
    if (!location.pathname.startsWith('/interactive/')) {
      setIsOpeningExhibition(false);
      return;
    }

    const parts = location.pathname.split('/').filter(Boolean);
    const routeExhibitionId = parts.length >= 4 ? decodeURIComponent(parts[3]) : '';
    if (!routeExhibitionId) {
      setIsOpeningExhibition(false);
      return;
    }

    if (unresolvedRouteExhibitionIdRef.current === routeExhibitionId) {
      setIsOpeningExhibition(false);
      return;
    }

    if (!selectedRealExhibition) {
      setIsOpeningExhibition(true);
      return;
    }

    const currentId = String(selectedRealExhibition?._selectedExhibitionId || selectedRealExhibition?.id || '');
    if (currentId === routeExhibitionId) {
      setIsOpeningExhibition(false);
    }
  }, [location.pathname, selectedRealExhibition]);

  useEffect(() => {
    if (!selectedRealExhibition) return;
    const target = buildInteractivePath(selectedRealExhibition);
    if (location.pathname === target) return;

    const timer = setTimeout(() => {
      navigate(target);
    }, 0);

    return () => clearTimeout(timer);
  }, [selectedRealExhibition, location.pathname, navigate]);


  const handleSelectCity = (city: CityMarker | null) => {
    setSelectedCity(city);
  };

  const handleRotationChange = useCallback((next: [number, number]) => {
    if (selectedRealExhibition) return;
    const now = Date.now();
    const safeLon = Number.isFinite(next[0]) ? next[0] : lastRotationUpdateRef.current.lon;
    const safeLat = Number.isFinite(next[1]) ? next[1] : lastRotationUpdateRef.current.lat;
    const last = lastRotationUpdateRef.current;

    if (
      Math.abs(safeLon - last.lon) < 0.12 &&
      Math.abs(safeLat - last.lat) < 0.12 &&
      now - last.ts < 90
    ) {
      return;
    }

    lastRotationUpdateRef.current = { lon: safeLon, lat: safeLat, ts: now };
    setRotation((prev) => (
      Math.abs(prev[0] - safeLon) < 0.0001 && Math.abs(prev[1] - safeLat) < 0.0001
        ? prev
        : [safeLon, safeLat]
    ));
  }, [selectedRealExhibition]);

  const handleZoomChange = useCallback((nextZoom: number) => {
    if (selectedRealExhibition) return;
    if (!Number.isFinite(nextZoom)) return;

    const now = Date.now();
    const last = lastZoomUpdateRef.current;
    if (Math.abs(nextZoom - last.zoom) < 0.01 && now - last.ts < 90) {
      return;
    }

    lastZoomUpdateRef.current = { zoom: nextZoom, ts: now };
    setZoom((prev) => (Math.abs(prev - nextZoom) < 0.0001 ? prev : nextZoom));
  }, [selectedRealExhibition]);

  const handleHoverDataChange = useCallback((next: { level: string; label: string; count: number } | null) => {
    if (selectedRealExhibition) return;
    setHoverData((prev) => {
      if (!prev && !next) return prev;
      if (
        prev &&
        next &&
        prev.level === next.level &&
        prev.label === next.label &&
        prev.count === next.count
      ) {
        return prev;
      }
      return next;
    });
  }, [selectedRealExhibition]);

  const handleRealModalReady = useCallback(() => {
    setIsOpeningExhibition(false);
  }, []);

  // Belt-and-suspenders: as soon as the modal has an exhibition to render,
  // the opening overlay is no longer needed. This guards against Android
  // Chrome WebView cases where the modal's onReady callback fires but a
  // separate route-sync effect re-flips isOpeningExhibition back on.
  useEffect(() => {
    if (selectedRealExhibition && isOpeningExhibition) {
      setIsOpeningExhibition(false);
    }
  }, [selectedRealExhibition, isOpeningExhibition]);

  // Hard ceiling: never let the opening overlay sit on screen for more than
  // 1.5s. Without this, a stalled framer-motion exit animation on Android
  // can leave the blur layer permanently covering the modal.
  useEffect(() => {
    if (!isOpeningExhibition) return;
    const t = setTimeout(() => setIsOpeningExhibition(false), 1500);
    return () => clearTimeout(t);
  }, [isOpeningExhibition]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    try { localStorage.setItem('homeTheme', next); } catch { }
    setTheme(next);
    window.dispatchEvent(new Event('theme-changed'));
  };

  const lineBg = t ? "rgba(0,0,0,0.09)" : "rgba(255,255,255,0.11)";
  const lineSubtleBg = t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.07)";
  void lineSubtleBg;

  const drilledContinentLabel = drilledContinent ? localizeContinentName(drilledContinent, language) : "";
  const drilledCountryLabel = drilledCountry ? localizeCountryName(drilledCountry, language) : "";

  // Replaces fg classes with inline styles where easily mapping
  const cFg50 = t ? "rgba(0,0,0,0.60)" : "rgba(255,255,255,0.72)";
  const cFg25 = t ? "rgba(0,0,0,0.34)" : "rgba(255,255,255,0.50)";
  const cFg15 = t ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.30)";
  const cFg10 = t ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.20)";
  const cFg08 = t ? "rgba(0,0,0,0.09)" : "rgba(255,255,255,0.15)";
  const cFg06 = t ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.12)";

  return (
    <div
      className="ig-container"
      style={{
        fontFamily: "'Inter', 'Space Grotesk', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
        backgroundColor: t ? "#FAFAFA" : "#0c0c0a",
        color: t ? "#111" : "#f0ede6",
      }}
    >
      {/* ── Globe ── */}
      <Globe
        cities={cities}
        theme={theme}
        language={language}
        selectedCity={selectedCity}
        onSelectCity={handleSelectCity}
        drilledContinent={drilledContinent}
        onDrillContinent={setDrilledContinent}
        drilledCountry={drilledCountry}
        onDrillDown={setDrilledCountry}
        onRotationChange={handleRotationChange}
        onZoomChange={handleZoomChange}
        onHoverData={handleHoverDataChange}
        />

      {/* ── Header (top-left) ──
           Two mutually-exclusive states:
             • Not drilled  → just the COLLY brand logo
             • Drilled      → BACK button + breadcrumb, COLLY hidden
           `flex-direction: column` so children stack vertically and don't
           collide with each other on the same baseline. */}
      <header
        className="ig-header"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }}
      >
        <AnimatePresence mode="wait">
          {drilledContinent || drilledCountry || selectedCity ? (
            <motion.div
              key="drilled-cluster"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}
            >
              <motion.button
                style={{
                  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px",
                  background: "none", border: "none", outline: "none", padding: 0,
                }}
                onClick={() => {
                  // "Back to MAP" means back to the full globe view in one
                  // press — clear every drill level at once. Stepping up one
                  // level at a time was forcing 2-3 taps to reach COLLY.
                  setSelectedCity(null);
                  setDrilledCountry(null);
                  setDrilledContinent(null);
                }}
                whileHover={{ opacity: 0.7 }}
              >
                <span style={{ color: cFg25, fontSize: "14px", lineHeight: 1 }}>&larr;</span>
                <span className="ig-tracking-12" style={{ color: cFg25, fontSize: "10px", textTransform: 'uppercase', fontWeight: 500 }}>
                   {tt({ ko: "지도로 돌아가기", en: "BACK TO MAP" })}
                </span>
              </motion.button>

              <div
                style={{
                  color: cFg50, fontSize: "14px", fontWeight: 600, letterSpacing: "0.05em",
                  textTransform: 'uppercase', fontFamily: "'Inter', 'Space Grotesk', sans-serif"
                }}
              >
                {[drilledContinentLabel, drilledCountryLabel, selectedCity ? localizeCityName(selectedCity.city, language) : null].filter(Boolean).join(' > ')}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="brand-logo"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="ig-home-logo"
              style={{
                cursor: "pointer",
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "18px",
                fontWeight: 500,
                letterSpacing: "0.08em",
                color: t ? "#111" : "#fff",
                position: "relative",
                display: "inline-block"
              }}
              onClick={() => navigate("/")}
              whileHover={{ letterSpacing: "0.25em" }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
            >
              COLLY
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── Region filter pills (from Globe Proposals · Option B) ──
           Surfaces continent drill-down as a visible UI element so the user
           doesn't have to find continent labels on the globe itself. Mobile:
           horizontally scrollable. Web: same row, fits 6 continents + All. */}
      {!selectedCity && !drilledCountry && (
        <div
          className="ig-region-pills"
          style={{
            position: 'absolute',
            top: 'calc(env(safe-area-inset-top, 0px) + 60px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 12,
            display: 'flex',
            gap: 6,
            padding: '4px 12px',
            maxWidth: 'calc(100vw - 32px)',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {[null, "Europe", "Asia", "North America", "South America", "Africa", "Oceania"].map((c) => {
            const isActive = drilledContinent === c;
            const labelKo: Record<string, string> = {
              "Europe": "유럽", "Asia": "아시아",
              "North America": "북미", "South America": "남미",
              "Africa": "아프리카", "Oceania": "오세아니아",
            };
            const labelEn: Record<string, string> = {
              "Europe": "Europe", "Asia": "Asia",
              "North America": "N. America", "South America": "S. America",
              "Africa": "Africa", "Oceania": "Oceania",
            };
            const label = c === null
              ? (language === 'ko' ? '전체' : 'All')
              : (language === 'ko' ? labelKo[c] : labelEn[c]);
            const accent = t ? '#8A6B1F' : '#D4A547';
            return (
              <button
                key={c ?? 'all'}
                onClick={() => {
                  // Dispatch via window event — pure setDrilledContinent
                  // cascades through page-level useEffects that synchronously
                  // reset it back to null on /interactive root. The window
                  // event is handled in Globe.tsx and mutates internal refs
                  // directly, then re-emits the state via onDrillContinent.
                  window.dispatchEvent(new CustomEvent('armin:drill-continent', { detail: c }));
                }}
                style={{
                  flexShrink: 0,
                  padding: '6px 13px',
                  fontFamily: "'Space Mono', monospace",
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  border: `0.5px solid ${isActive ? accent : (t ? 'rgba(0,0,0,0.10)' : 'rgba(244,241,234,0.12)')}`,
                  background: isActive
                    ? (t ? 'rgba(138,107,31,0.10)' : 'rgba(212,165,71,0.10)')
                    : (t ? 'rgba(255,255,255,0.65)' : 'rgba(244,241,234,0.04)'),
                  color: isActive ? accent : (t ? 'rgba(0,0,0,0.70)' : 'rgba(244,241,234,0.78)'),
                  cursor: 'pointer',
                  backdropFilter: 'blur(8px)',
                  borderRadius: 2,
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Legacy dock disabled: main app navigator is now the single bottom nav. */}
      {false && (() => {
        const fg = t ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.55)';
        const fgHov = t ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)';
        const divBg = t ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.12)';

        const navBtns = [
          {
            id: 'drawing',
            label: 'Drawing Map',
            show: !!onSwitchToDrawing,
            onClick: () => onSwitchToDrawing?.(),
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21" />
                <line x1="9" y1="3" x2="9" y2="18" />
                <line x1="15" y1="6" x2="15" y2="21" />
              </svg>
            ),
          },
          {
            id: 'community',
            label: 'Community',
            show: true,
            onClick: () => window.dispatchEvent(new CustomEvent('toggle-community-panel')),
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            ),
          },
          {
            id: 'theme',
            label: t ? 'Dark Mode' : 'Light Mode',
            show: true,
            onClick: toggleTheme,
            icon: t ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                <circle cx="12" cy="12" r="4" />
                <line x1="12" y1="2" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="22" />
                <line x1="4.22" y1="4.22" x2="6.34" y2="6.34" /><line x1="17.66" y1="17.66" x2="19.78" y2="19.78" />
                <line x1="2" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="22" y2="12" />
                <line x1="4.22" y1="19.78" x2="6.34" y2="17.66" /><line x1="17.66" y1="6.34" x2="19.78" y2="4.22" />
              </svg>
            ),
          },
          {
            id: 'mypage',
            label: 'My Page',
            show: true,
            onClick: () => navigate('/mypage'),
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            ),
          },
          {
            id: 'foryou',
            label: 'For You',
            show: true,
            onClick: () => window.dispatchEvent(new CustomEvent('open-for-you')),
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                {/* 액자 */}
                <rect x="2.5" y="4.5" width="14" height="10" rx="1.5" />
                {/* 내부 풍경 라인 */}
                <path d="M5 12 L7 9 L9.5 11 L12 9 L15.5 12" strokeWidth="1.4" />
                {/* 별 스파클 */}
                <path d="M19.5 2.5 L20 3.8 L21.3 4.3 L20 4.8 L19.5 6.1 L19 4.8 L17.7 4.3 L19 3.8 Z" fill="currentColor" stroke="none" />
                <path d="M3 16 L3.3 16.9 L4.2 17.2 L3.3 17.5 L3 18.4 L2.7 17.5 L1.8 17.2 L2.7 16.9 Z" fill="currentColor" stroke="none" />
              </svg>
            ),
          },
        ].filter(b => b.show);

        return (
          <div style={{
            position: 'absolute',
            bottom: 'calc(28px + env(safe-area-inset-bottom, 0px))',
            left: '50%',
            transform: 'translateX(-50%) scale(1.2)',
            transformOrigin: 'bottom center',
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            padding: '0 5px',
            height: 36,
            background: t ? 'rgba(255,255,255,0.22)' : 'rgba(12,10,8,0.22)',
            backdropFilter: 'blur(60px) saturate(260%) brightness(1.06)',
            WebkitBackdropFilter: 'blur(60px) saturate(260%) brightness(1.06)',
            borderRadius: '100px',
            border: t ? '1px solid rgba(255,255,255,0.7)' : '1px solid rgba(255,255,255,0.09)',
            boxShadow: t
              ? '0 2px 20px rgba(0,0,0,0.07), 0 1px 0 rgba(255,255,255,0.9) inset'
              : '0 4px 28px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.05) inset',
          }}>
            {navBtns.map((btn, idx) => (
              <div key={btn.id} style={{ display: 'flex', alignItems: 'center' }}>
                {/* Single div acts as both the hover zone and the clickable element */}
                <div
                  role="button"
                  onClick={btn.onClick as any}
                  onMouseEnter={() => setHoveredBtn(btn.id)}
                  onMouseLeave={() => setHoveredBtn(null)}
                  style={{
                    display: 'flex', alignItems: 'center',
                    gap: hoveredBtn === btn.id ? 6 : 0,
                    paddingLeft: 10,
                    paddingRight: hoveredBtn === btn.id ? 12 : 10,
                    height: 29,
                    borderRadius: '100px',
                    background: hoveredBtn === btn.id
                      ? (t ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.14)')
                      : 'transparent',
                    color: hoveredBtn === btn.id ? fgHov : fg,
                    cursor: 'pointer',
                    flexShrink: 0,
                    overflow: 'hidden',
                    transition: 'background 0.22s ease, color 0.2s ease, padding-right 0.34s cubic-bezier(0.34,1,0.64,1), gap 0.34s cubic-bezier(0.34,1,0.64,1)',
                    userSelect: 'none',
                  }}
                >
                  <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>{btn.icon}</span>
                  {/* Label — slides in smoothly on hover */}
                  <span style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    maxWidth: hoveredBtn === btn.id ? '110px' : '0px',
                    opacity: hoveredBtn === btn.id ? 1 : 0,
                    overflow: 'hidden',
                    pointerEvents: 'none',
                    transition: 'max-width 0.36s cubic-bezier(0.34,1,0.64,1), opacity 0.22s ease',
                  }}>
                    {btn.label}
                  </span>
                </div>

                {/* Divider between items */}
                {idx < navBtns.length - 1 && (
                  <div style={{ width: 1, height: 14, background: divBg, flexShrink: 0 }} />
                )}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Legend Block Removed */}

      {/* ── Venue Panel (right side) ── */}
      <AnimatePresence>
        {selectedCity && (
          <VenuePanel
            key={selectedCity.city}
            city={selectedCity}
            theme={theme}
            onClose={() => setSelectedCity(null)}
            onOpenExhibition={(ex) => {
              closingExhibitionIdRef.current = null;
              // Don't trigger the opening overlay here. The exhibition data is
              // already in hand at click time, so the modal mounts in the same
              // render — the overlay would only flash for one frame. On Android
              // Chrome WebView that one-frame composite layer can stick on the
              // GPU even after React unmounts the element, leaving a permanent
              // dim/spinner overlay covering the modal.
              setSelectedRealExhibition(ex);
            }}
            initialVenueId={location.pathname.split('/').filter(Boolean).length >= 4 ? decodeURIComponent(location.pathname.split('/').filter(Boolean)[3]) : null}
          />
        )}
      </AnimatePresence>


      {/* ── Real Exhibition Modal (full-screen, shown within globe context) ── */}
      <AnimatePresence>
        {selectedRealExhibition && (
          <InteractiveGlobeRealModal
            exhibition={selectedRealExhibition}
            theme={theme}
            onClose={closeRealModal}
            onReady={handleRealModalReady}
          />
        )}
      </AnimatePresence>

      {/* Opening overlay — no AnimatePresence/motion. Framer Motion's
          opacity animation stalls on Android Chrome WebView (probably
          a compositor + UA-spoofed-iOS-Safari interaction), which would
          leave this layer covering the modal indefinitely. Plain JSX
          with a CSS keyframe spinner unmounts cleanly. */}
      {isOpeningExhibition && !selectedRealExhibition && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 95,
            background: t ? 'rgba(250,250,250,0.92)' : 'rgba(8,8,8,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              color: t ? 'rgba(0,0,0,0.68)' : 'rgba(255,255,255,0.74)',
              fontFamily: "'Space Mono', monospace",
              fontSize: '11px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                border: `2px solid ${t ? 'rgba(0,0,0,0.20)' : 'rgba(255,255,255,0.22)'}`,
                borderTopColor: t ? '#8A6B1F' : '#D4A547',
                animation: 'igmap-opening-spin 0.9s linear infinite',
              }}
            />
            <span>{openingExhibitionLabel}</span>
          </div>
          <style>{`@keyframes igmap-opening-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ── Coordinates & zoom (bottom-right) ── */}
      <div className="ig-coords-box">
        <div style={{ color: cFg15, fontFamily: "'Space Mono', monospace", fontSize: "10px", letterSpacing: "0.08em" }}>
          {formatCoord(rotation[1], rotation[0])}
        </div>
        <div style={{ color: cFg10, fontFamily: "'Space Mono', monospace", fontSize: "10px", marginTop: "4px" }}>
          {zoom.toFixed(1)}&times;
        </div>
      </div>

      {/* ── Bottom center info ── */}
      <AnimatePresence mode="wait">
        {!selectedCity && (
          drilledContinent || drilledCountry ? (
            <motion.div
              key="country-hint"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.4 }}
              className="ig-bottom-center-hint"
            >
              <p className="ig-tracking-15 ig-nowrap" style={{ color: cFg08, fontSize: "9px" }}>
                {tt({ ko: '핀을 클릭하면 상세정보를 볼 수 있습니다 · 축소하거나 바다를 클릭하면 종료됩니다', en: 'Click a pin for details · Zoom out or click ocean to exit' })}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="rams-quote"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="ig-bottom-center-hint"
            >
              <p className="ig-tracking-15 ig-nowrap ig-italic" style={{ color: cFg06, fontSize: "10px" }}>
                {tt({ ko: '"적게, 그러나 더 좋게" · 디터 람스', en: '"Weniger, aber besser" — Dieter Rams' })}
              </p>
            </motion.div>
          )
        )}
      </AnimatePresence>

      {/* ── Top center count (HOVER DATA) ── */}
      <div className="ig-top-center-hint">
        <div className="ig-flex-center ig-gap-4">
          <div className="ig-line-h" style={{ backgroundColor: lineBg }} />
          <AnimatePresence mode="wait">
            <motion.span
              key={hoverData?.label || 'global'}
              initial={{ opacity: 0, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              transition={{ duration: 0.2 }}
              className="ig-uppercase-track" 
              style={{ color: cFg15, fontSize: "10px", fontWeight: 600, whiteSpace: "nowrap", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.12em" }}
            >
              {hoverData ? (
                <span>
                  <span style={{ color: cFg25, marginRight: "8px", fontWeight: 400 }}>{localizeGeoLabel(hoverData.level, hoverData.label, language)}</span>
                  {hoverData.count.toLocaleString()}
                </span>
              ) : (
                <span>{(() => {
                  const sum = cities.reduce((s, c) => s + (c.artworkCount || 0), 0);
                  return (sum > 0 && sum < 614746) ? "614,746" : sum.toLocaleString();
                })()}</span>
              )}
            </motion.span>
          </AnimatePresence>
          <div className="ig-line-h" style={{ backgroundColor: lineBg }} />
        </div>
      </div>
    </div>
  );
}
