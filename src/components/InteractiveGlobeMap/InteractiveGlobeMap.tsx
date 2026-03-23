import { useState, useMemo, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { Globe } from "./Globe";
import { VenuePanel } from "./VenuePanel";

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
  const locationRaw = (ex && ex.location && typeof ex.location === 'string') ? ex.location : '';
  const nameRaw = (ex && ex.name && typeof ex.name === 'string') ? ex.name : '';
  const r = (regionRaw + ' ' + locationRaw + ' ' + nameRaw).toLowerCase();

  if (r) {
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
    
    if (regionRaw) {
      const firstSeg = regionRaw.split(',')[0].trim();
      return stripPostalCode(firstSeg) || firstSeg;
    }
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

// ─── App ───────────────────────────────────────────────────

interface InteractiveGlobeMapProps {
  exhibitions: Exhibition[];
  onSelectExhibition?: (ex: Exhibition) => void;
  onExit?: () => void;
  onSwitchToDrawing?: () => void;
}

export default function InteractiveGlobeMap({ exhibitions, onSelectExhibition, onExit, onSwitchToDrawing }: InteractiveGlobeMapProps) {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<Theme>("light");

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
  
  const [artworkCounts, setArtworkCounts] = useState<Record<string, number>>({});
  const [hoverData, setHoverData] = useState<{ level: string; label: string; count: number } | null>(null);

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
    // Merge only truly adjacent cities within tight space.
    const GEO_MERGE_DIST = 0.3;
    
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


  const handleSelectCity = (city: CityMarker | null) => {
    setSelectedCity(city);
  };

  const toggleTheme = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));

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
        onRotationChange={setRotation}
          onZoomChange={(z) => setZoom(z)}
          onHoverData={setHoverData}
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
            fontSize: "22px", 
            fontWeight: 500, 
            letterSpacing: "0.1em",
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

      {/* Exit button removed — use DRAWING MAP toggle button to switch maps */}

      {/* ── Settings Stack (Bottom Left) ── */}
      <div style={{
          position: "absolute", bottom: 34, left: 34, zIndex: 30,
          display: "flex", alignItems: "center", gap: "16px",
          background: t ? "rgba(255,255,255,0.8)" : "rgba(10,10,10,0.8)",
          backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          padding: "10px 20px", borderRadius: "100px", border: `1px solid ${lineSubtleBg}`,
          boxShadow: t ? "0 4px 20px rgba(0,0,0,0.06)" : "0 4px 20px rgba(0,0,0,0.3)"
      }}>
         {/* Theme Toggle */}
         <button
            onClick={toggleTheme}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              cursor: "pointer", background: "none", border: "none",
              color: cFg50, fontFamily: "'Space Grotesk', sans-serif", fontSize: "10px", 
              textTransform: "uppercase", letterSpacing: "0.15em", outline: "none",
              transition: "color 0.2s"
            }}
            onMouseEnter={e => e.currentTarget.style.color = t ? "#111" : "#FFF"}
            onMouseLeave={e => e.currentTarget.style.color = cFg50}
         >
           <div style={{ width: 12, height: 12, borderRadius: "50%", border: `1px solid ${cFg25}`, position: "relative", overflow: "hidden" }}>
             <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: "50%", background: cFg50 }} />
           </div>
           {t ? "Light Mode" : "Dark Mode"}
         </button>

         <div style={{ width: 1, height: 12, backgroundColor: lineSubtleBg }} />

         {/* Drawing Map switch */}
         {onSwitchToDrawing && (
           <button
             onClick={onSwitchToDrawing}
             style={{
                display: "flex", alignItems: "center", gap: "8px",
                cursor: "pointer", background: "none", border: "none",
                color: cFg50, fontFamily: "'Space Grotesk', sans-serif", fontSize: "10px", 
                textTransform: "uppercase", letterSpacing: "0.15em", outline: "none",
                transition: "color 0.2s"
             }}
             onMouseEnter={e => e.currentTarget.style.color = t ? "#111" : "#FFF"}
             onMouseLeave={e => e.currentTarget.style.color = cFg50}
           >
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
               <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
             </svg>
             Drawing Map
           </button>
         )}
      </div>

      {/* Legend Block Removed */}

      {/* ── Venue Panel (right side) ── */}
      <AnimatePresence>
        {selectedCity && (
          <VenuePanel
            key={selectedCity.city}
            city={selectedCity}
            theme={theme}
            onClose={() => setSelectedCity(null)}
            onSelectVenue={(venue) => {
              if (onSelectExhibition && venue.originalExhibition) {
                onSelectExhibition(venue.originalExhibition);
              }
              if (onExit) onExit();
            }}
            onViewExhibition={(ex) => {
              if (onSelectExhibition) onSelectExhibition(ex);
              if (onExit) onExit();
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
