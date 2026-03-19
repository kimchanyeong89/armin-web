import { useState, useMemo, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { Globe } from "./Globe";
import { VenuePanel } from "./VenuePanel";
import { GlobeExhibitionPanel } from "./GlobeExhibitionPanel";
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

const normalizeCity = (d: any): string => {
  if (d.city && typeof d.city === 'string') return d.city;

  const s = d.location || d.region || '';
  if (typeof s !== 'string') return '';
  const raw = s.toLowerCase();

  if (raw.includes('london')) return 'London';
  if (raw.includes('seoul') || raw.includes('서울')) return 'Seoul';
  if (raw.includes('jeju') || raw.includes('제주') || raw.includes('서귀포') || raw.includes('seogwipo')) return 'Jeju';
  if (raw.includes('manchester')) return 'Manchester';
  if (raw.includes('liverpool')) return 'Liverpool';
  if (raw.includes('edinburgh')) return 'Edinburgh';
  if (raw.includes('cambridge')) return 'Cambridge';
  if (raw.includes('oxford')) return 'Oxford';
  if (raw.includes('paris')) return 'Paris';
  if (raw.includes('new york')) return 'New York';

  if (d.location && typeof d.location === 'string' && d.location.includes(',')) {
    return d.location.split(',')[0].trim();
  }

  if (d.region && typeof d.region === 'string') return d.region;

  return s.trim();
};

function formatCoord(lat: number, lon: number): string {
  const latD = lat >= 0 ? "N" : "S";
  const lonD = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(1)}\u00b0${latD}  ${Math.abs(lon).toFixed(1)}\u00b0${lonD}`;
}

// ─── App ───────────────────────────────────────────────────

interface InteractiveGlobeMapProps {
  exhibitions: Exhibition[];
  onSelectExhibition?: (ex: Exhibition) => void;
  onSelectExhibitionItem?: (collectionId: string) => void;
  onExit?: () => void;
  onSwitchToDrawing?: () => void;
}

export default function InteractiveGlobeMap({ exhibitions, onSelectExhibition, onSelectExhibitionItem, onExit, onSwitchToDrawing }: InteractiveGlobeMapProps) {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<Theme>("dark");
  const [selectedCity, setSelectedCity] = useState<CityMarker | null>(null);
  const [drilledCountry, setDrilledCountry] = useState<string | null>(null);
  const [rotation, setRotation] = useState<[number, number]>([0, 20]);
  const [zoom, setZoom] = useState(1);
  const [internalExhibition, setInternalExhibition] = useState<Exhibition | null>(null);
  const [artworkCounts, setArtworkCounts] = useState<Record<string, number>>({});

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
      let city = normalizeCity(ex) || 'Unknown';
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
          detail: country !== 'Hong Kong',
          venues: [venue]
        });
      } else {
        cityMap.get(key)!.venues.push(venue);
      }
    }

    const rawCities = Array.from(cityMap.values());
    
    // --- GEOGRAPHIC CLUSTERING ---
    // Merge only truly adjacent cities within ~1.5 degrees (~150km).
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

  const countryMarkerCount = useMemo(() => {
    if (!drilledCountry) return 0;
    return cities.filter((m) => m.country === drilledCountry).length;
  }, [drilledCountry, cities]);

  const totalVenueCount = useMemo(() => {
    if (!drilledCountry) return 0;
    return cities
      .filter((m) => m.country === drilledCountry)
      .reduce((sum, c) => sum + c.venues.length, 0);
  }, [drilledCountry, cities]);

  const globalCityCount = cities.length;

  const handleSelectCity = (city: CityMarker | null) => {
    setSelectedCity(city);
  };

  const toggleTheme = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  const lineBg = t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)";
  const lineSubtleBg = t ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)";

  // Replaces fg classes with inline styles where easily mapping
  const cFg70 = t ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";
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
        onRotationChange={setRotation}
        onZoomChange={setZoom}
      />

      {/* ── Header (top-left) ── */}
      <header className="ig-header">
        <div className="ig-flex-center ig-gap-3">
          <div className="ig-dot" />
          <span className="ig-uppercase-track" style={{ color: cFg70 }}>
            Globe
          </span>
        </div>
        <div className="ig-line" style={{ backgroundColor: lineSubtleBg }} />

        <AnimatePresence mode="wait">
          {drilledCountry ? (
            <motion.div
              key="drilled"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className="ig-subtitle-box"
            >
              <span className="ig-tracking-12" style={{ color: cFg25, fontSize: "10px" }}>
                World
              </span>
              <span style={{ color: cFg10, fontSize: "10px" }}>/</span>
              <span className="ig-tracking-12" style={{ color: cFg50, fontSize: "10px", textTransform: 'uppercase' }}>
                {drilledCountry}
              </span>
              <span
                style={{ color: cFg15, fontFamily: "'Space Mono', monospace", fontSize: "9px", marginLeft: "4px" }}
              >
                {countryMarkerCount} cities &middot; {totalVenueCount} venues
              </span>
            </motion.div>
          ) : (
            <motion.p
              key="global"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className="ig-tracking-12"
              style={{ color: cFg25, fontSize: "10px", marginTop: "10px", marginLeft: "19px" }}
            >
              Interactive World Map
            </motion.p>
          )}
        </AnimatePresence>
      </header>

      {/* Exit button removed — use DRAWING MAP toggle button to switch maps */}

      {/* ── Drawing Map switch — dark digital style matching InteractiveGlobeMap aesthetic ── */}
      {onSwitchToDrawing && (
        <button
          onClick={onSwitchToDrawing}
          style={{
            position: "absolute", bottom: 28, left: 28, zIndex: 30,
            display: "flex", alignItems: "center", gap: 8,
            padding: "9px 16px", cursor: "pointer",
            background: "rgba(8,8,8,0.75)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.55)",
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
            textTransform: "uppercase",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderRadius: 2,
            transition: "all 0.2s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = "rgba(255,255,255,0.9)";
            e.currentTarget.style.border = "1px solid rgba(255,255,255,0.3)";
            e.currentTarget.style.background = "rgba(255,255,255,0.06)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = "rgba(255,255,255,0.55)";
            e.currentTarget.style.border = "1px solid rgba(255,255,255,0.12)";
            e.currentTarget.style.background = "rgba(8,8,8,0.75)";
          }}
        >
          {/* Pencil icon — sketch feel */}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
          </svg>
          Drawing Map
        </button>
      )}

      {/* ── Back button ── */}
      <AnimatePresence>
        {drilledCountry && (
          <motion.button
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="ig-back-world-btn"
            onClick={() => {
              setDrilledCountry(null);
              setSelectedCity(null);
            }}
          >
            <span className="ig-tracking-12" style={{ color: cFg25 }}>
              &larr;
            </span>
            <span className="ig-tracking-15" style={{ color: cFg25, textTransform: 'uppercase' }}>
              Back to World
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Legend (top-right, under exit) ── */}
      <div className="ig-legend-box" style={{ top: onExit ? "80px" : "24px" }}>
        <div className="ig-flex-col ig-gap-2-5">
          {[
            { fill: "#BFFF0A", border: "transparent", label: "1 000+" },
            { fill: t ? "rgba(107,128,0,0.45)" : "rgba(191,255,10,0.45)", border: t ? "rgba(107,128,0,0.3)" : "rgba(191,255,10,0.3)", label: "100 – 999" },
            { fill: t ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.25)", border: "transparent", label: "< 100" },
          ].map((item) => (
            <div key={item.label} className="ig-flex-center ig-gap-2-5">
              <div style={{
                width: 7, height: 7,
                backgroundColor: item.fill,
                border: item.border !== "transparent" ? `0.5px solid ${item.border}` : 'none',
                borderRadius: '1px',
              }} />
              <span className="ig-tracking-15" style={{ color: cFg25, fontSize: "9px", textTransform: 'uppercase', fontFamily: "'Space Mono', monospace" }}>
                {item.label}
              </span>
            </div>
          ))}
          <span className="ig-tracking-15" style={{ color: cFg10, fontSize: "8px", textTransform: 'uppercase', marginTop: '4px' }}>
            Artworks
          </span>
        </div>
      </div>

      {/* ── Theme toggle (bottom-left) ── */}
      <button
        onClick={toggleTheme}
        className="ig-theme-btn"
        style={{ color: cFg25 }}
      >
        <div style={{ width: 14, height: 14, borderRadius: '50%', border: `1px solid ${t ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.15)"}`, overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '50%', backgroundColor: t ? "rgba(0,0,0,0.60)" : "rgba(255,255,255,0.60)" }} />
        </div>
        <span className="ig-tracking-15" style={{ textTransform: 'uppercase' }}>
          {t ? "Light" : "Dark"}
        </span>
      </button>

      {/* ── Venue Panel (right side) ── */}
      <AnimatePresence>
        {selectedCity && !internalExhibition && (
          <VenuePanel
            key={selectedCity.city}
            city={selectedCity}
            theme={theme}
            onClose={() => setSelectedCity(null)}
            onSelectVenue={(venue) => {
              if (onExit) onExit();
              navigate(`/exhibition/${venue.id}`, { state: { fromInteractiveMap: true } });
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Exhibition Details Panel (center overlay) ── */}
      <AnimatePresence>
        {internalExhibition && (
          <GlobeExhibitionPanel
            key="globe-exhibition"
            exhibition={internalExhibition}
            theme={theme}
            onClose={() => setInternalExhibition(null)}
            onViewCollection={(ex, item) => {
              // Exit globe and open the full collection modal on the main page
              if (item && onSelectExhibitionItem) {
                onSelectExhibitionItem(item.id);
                if (onExit) onExit();
              } else {
                if (onSelectExhibition) onSelectExhibition(ex);
                if (onExit) onExit();
              }
            }}
          />
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

      {/* ── Top center count ── */}
      <div className="ig-top-center-hint">
        <div className="ig-flex-center ig-gap-4">
          <div className="ig-line-h" style={{ backgroundColor: lineBg }} />
          <span className="ig-uppercase-track" style={{ color: cFg15, fontSize: "9px" }}>
            {drilledCountry
              ? `${totalVenueCount} Landmarks`
              : `${globalCityCount} Cities`}
          </span>
          <div className="ig-line-h" style={{ backgroundColor: lineBg }} />
        </div>
      </div>
    </div>
  );
}
