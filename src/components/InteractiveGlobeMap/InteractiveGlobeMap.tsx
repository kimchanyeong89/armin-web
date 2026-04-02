import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { Globe } from "./Globe";
import { VenuePanel } from "./VenuePanel";
import { InteractiveGlobeRealModal } from "./InteractiveGlobeRealModal";

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

const extractCity = (ex: any): string => {
  if (ex && ex.cityCluster && typeof ex.cityCluster === 'string') return ex.cityCluster;

  const regionRaw = (ex && ex.region && typeof ex.region === 'string') ? ex.region : '';
  if (regionRaw) {
    const r = regionRaw.toLowerCase();

    if (r.includes('san francisco') || r.includes('sfmoma')) return 'San Francisco';
    if (r.includes('los angeles') || r.includes('lacma') || r.includes('getty')) return 'Los Angeles';
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
    return stripPostalCode(firstSeg) || firstSeg;
  }

  if (ex && ex.city && typeof ex.city === 'string') return ex.city.trim();

  if (ex && ex.location && typeof ex.location === 'string') {
    const parts = ex.location.split(',').map((p: string) => p.trim());
    if (parts.length >= 1) {
      const first = parts[0];
      if (!/^\d|^(via|rue|place|piazza|strasse|straße|platz|square|avenue|blvd|boulevard|road|street)/i.test(first)) {
        return stripPostalCode(first);
      }
      return parts[1] ? stripPostalCode(parts[1]) : '';
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
  const [drilledCountry, setDrilledCountry] = useState<string | null>(null);
  const [rotation, setRotation] = useState<[number, number]>([0, 20]);
  const [zoom, setZoom] = useState(1);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);
  
  const [selectedRealExhibition, setSelectedRealExhibition] = useState<any | null>(null);
  const [isOpeningExhibition, setIsOpeningExhibition] = useState(false);
  const [openingExhibitionLabel, setOpeningExhibitionLabel] = useState<string>("Opening Exhibition...");
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
        ex.temporaryExhibitions.forEach(e => {
          interactiveExhibitions.push({ id: e.id, title: e.title || e.name || '', period: `${e.startDate?.slice(0, 4) || ''} - ${e.endDate?.slice(0, 4) || ''}`.replace(/^- | -$/g, ''), type: "current" });
          if (year === "Unknown" && e.startDate) year = e.startDate.split('-')[0];
        });
      }
      if (Array.isArray(ex.pastExhibitions)) {
        ex.pastExhibitions.forEach(e => {
          interactiveExhibitions.push({ id: e.id, title: e.title || e.name || '', period: `${e.startDate?.slice(0, 4) || ''} - ${e.endDate?.slice(0, 4) || ''}`.replace(/^- | -$/g, ''), type: "upcoming" });
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
    // Match DrawingMap behavior to keep adjacent metro clusters consistent.
    const GEO_MERGE_DIST = 1.3;
    
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
            
            const dx = mainCity.coordinates[0] - otherCity.coordinates[0];
            const dy = mainCity.coordinates[1] - otherCity.coordinates[1];
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < GEO_MERGE_DIST) {
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
      if (selectedRealExhibition && !isOpeningExhibition) setSelectedRealExhibition(null);
      setIsOpeningExhibition(false);
      return;
    }

    // Prevent immediate reopen of the same exhibition while close navigation is settling.
    if (
      closingExhibitionIdRef.current &&
      routeExhibitionId === closingExhibitionIdRef.current &&
      !selectedRealExhibition
    ) {
      return;
    }

    if (closingExhibitionIdRef.current && routeExhibitionId !== closingExhibitionIdRef.current) {
      closingExhibitionIdRef.current = null;
    }

    const currentId = String(selectedRealExhibition?._selectedExhibitionId || selectedRealExhibition?.id || '');
    if (currentId === routeExhibitionId) return;

    for (const cityMarker of cities) {
      for (const venue of cityMarker.venues) {
        const matched = venue.exhibitions.find((entry) => entry.id === routeExhibitionId);
        const original = venue.originalExhibition as any;

        if (!matched) {
          const museumRouteId = String(original?.id || venue.id || "");
          if (museumRouteId !== routeExhibitionId) continue;

          const firstSub =
            venue.exhibitions.find((entry) => entry?.id) ||
            venue.exhibitions[0] ||
            null;

          unresolvedRouteExhibitionIdRef.current = null;

          setSelectedCity(cityMarker);
          setSelectedRealExhibition({
            ...original,
            _exhibitionTitle: firstSub?.title || original?.name || venue.name,
            _selectedExhibitionId: firstSub?.id,
            _selectedExhibitionType: firstSub?.type || "permanent",
            _routeCountry: cityMarker.country,
            _routeCity: cityMarker.city,
            _routeVenue: venue.name,
            collectionFile: normalizeCollectionPath((firstSub as any)?.collectionFile || original?.collectionFile),
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
        setSelectedRealExhibition({
          ...original,
          _exhibitionTitle: matched.title,
          _selectedExhibitionId: matched.id,
          _selectedExhibitionType: matched.type,
          _routeCountry: cityMarker.country,
          _routeCity: cityMarker.city,
          _routeVenue: venue.name,
          collectionFile: normalizeCollectionPath(fullSub?.collectionFile),
        });
        setIsOpeningExhibition(false);
        return;
      }
    }

    // Route target not found in current city/venue graph: stop spinner to avoid infinite waiting.
    unresolvedRouteExhibitionIdRef.current = routeExhibitionId;
    if (selectedRealExhibition && currentId !== routeExhibitionId && !isOpeningExhibition) {
      setSelectedRealExhibition(null);
    }
    setIsOpeningExhibition(false);
  }, [location.pathname, cities, selectedRealExhibition, isOpeningExhibition]);

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

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    try { localStorage.setItem('homeTheme', next); } catch { }
    setTheme(next);
    window.dispatchEvent(new Event('theme-changed'));
  };

  const lineBg = t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)";
  const lineSubtleBg = t ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)";

  // Replaces fg classes with inline styles where easily mapping
  const cFg50 = t ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.5)";
  const cFg25 = t ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.2)";
  const cFg15 = t ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.15)";
  const cFg10 = t ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.10)";
  const cFg08 = t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)";
  const cFg06 = t ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.06)";

  return (
    <div
      className="ig-container"
      style={{
        fontFamily: "'Space Grotesk', sans-serif",
        backgroundColor: t ? "#FAFAFA" : "#080808",
        color: t ? "#000" : "#fff",
      }}
    >
      {/* ── Globe ── */}
      <Globe
        cities={cities}
        theme={theme}
        selectedCity={selectedCity}
        onSelectCity={handleSelectCity}
        drilledCountry={drilledCountry}
        onDrillDown={setDrilledCountry}
        onRotationChange={handleRotationChange}
        onZoomChange={handleZoomChange}
        onHoverData={handleHoverDataChange}
        />

      {/* ── Header (top-left) ── */}
      <header className="ig-header" style={{ alignItems: 'flex-start' }}>
        <motion.div 
          className="ig-home-logo"
          initial="initial"
          whileHover="hover"
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
        >
          <motion.span
            variants={{
              initial: { letterSpacing: "0.1em" },
              hover: { letterSpacing: "0.25em" }
            }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            style={{ display: "inline-block" }}
          >
            COLLY
          </motion.span>
          <motion.div
            style={{
              position: "absolute", bottom: "-2px", left: "0%", height: "1px", background: t ? "#111" : "#fff",
            }}
            variants={{
              initial: { width: "0%" },
              hover: { width: "100%" }
            }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          />
        </motion.div>

        <AnimatePresence mode="wait">
          {drilledCountry ? (
            <motion.div
              key="drilled"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.25 }}
              style={{ 
                marginTop: "24px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "6px"
              }}
            >
              <div
                style={{ 
                   color: cFg50, fontSize: "14px", fontWeight: 600, letterSpacing: "0.05em",
                   textTransform: 'uppercase', fontFamily: "'Inter', 'Space Grotesk', sans-serif"
                }}
              >
                 {drilledCountry}
              </div>
              <motion.button
                style={{ 
                  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px",
                  background: "none", border: "none", outline: "none", padding: 0
                }}
                onClick={() => {
                  setDrilledCountry(null);
                  setSelectedCity(null);
                }}
                whileHover={{ opacity: 0.7 }}
              >
                <span style={{ color: cFg25, fontSize: "14px", lineHeight: 1 }}>&larr;</span>
                <span className="ig-tracking-12" style={{ color: cFg25, fontSize: "10px", textTransform: 'uppercase', fontWeight: 500 }}>
                   BACK TO MAP
                </span>
              </motion.button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </header>

      {/* ── 5-item bottom navigation bar — icon + text reveals on hover ── */}
      {(() => {
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
            bottom: 28,
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
              setOpeningExhibitionLabel(ex?._exhibitionTitle ? `Loading ${ex._exhibitionTitle}...` : "Opening Exhibition...");
              setIsOpeningExhibition(true);
              setSelectedRealExhibition(ex);
            }}
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

      <AnimatePresence>
        {isOpeningExhibition && !selectedRealExhibition && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 95,
              background: t ? 'rgba(250,250,250,0.68)' : 'rgba(8,8,8,0.68)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
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
              <motion.div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: `2px solid ${t ? 'rgba(0,0,0,0.20)' : 'rgba(255,255,255,0.22)'}`,
                  borderTopColor: t ? '#5A7800' : '#BFFF0A',
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
              />
              <span>{openingExhibitionLabel}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
          drilledCountry ? (
            <motion.div
              key="country-hint"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.4 }}
              className="ig-bottom-center-hint"
            >
              <p className="ig-tracking-15 ig-nowrap" style={{ color: cFg08, fontSize: "9px" }}>
                Click a pin for details &middot; Zoom out or click ocean to exit
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
                &ldquo;Weniger, aber besser&rdquo; &mdash; Dieter Rams
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
                  <span style={{ color: cFg25, marginRight: "8px", fontWeight: 400 }}>{hoverData.label}</span>
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
