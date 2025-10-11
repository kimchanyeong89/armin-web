import { useEffect, useMemo, useRef, useState } from "react";
import { publicUrl } from "../utils/publicUrl";
import type { Exhibition, ExhibitionItem } from "../types/Exhibition";

interface ExhibitionDetailsProps {
  exhibition: Exhibition;
  onClose: () => void;
  isOpen: boolean;
  onSelectExhibition: (exhibitionItem: ExhibitionItem) => void;
}

export default function ExhibitionDetails({
  exhibition,
  onClose,
  isOpen,
  onSelectExhibition
}: ExhibitionDetailsProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  // Format to YYYY-MM-DD from various possible inputs (ISO, yyyy/mm/dd, yyyy.mm.dd, ISO datetime)
  const formatYMD = (input?: string | null): string => {
    if (!input) return "";
    const s = String(input).trim();
    // ISO date-time or date, prefer first 10 chars when in ISO 8601
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
    // yyyy-mm-dd / yyyy.mm.dd / yyyy/mm/dd
    const m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (m) {
      const [, y, mo, d] = m;
      return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    // Fallback: Date parse and format in UTC to avoid TZ shifts
    const dObj = new Date(s);
    if (!isNaN(dObj.getTime())) {
      const y = dObj.getUTCFullYear();
      const mo = String(dObj.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(dObj.getUTCDate()).padStart(2, "0");
      return `${y}-${mo}-${dd}`;
    }
    return s; // As-is fallback
  };
  const [checking, setChecking] = useState(false);
  async function runHealthcheck() {
    setChecking(true);
    try {
      const { testStorageConnection, testFirestoreConnection } = await import("../utils/firebaseHealth");
      const s = await testStorageConnection();
      const f = await testFirestoreConnection();
      alert(
        `Storage: ${s.ok ? "OK" : `FAIL (${s.code || "unknown"}) - ${s.error}`}\n` +
        `Firestore: ${f.ok ? "OK" : `FAIL (${f.code || "unknown"}) - ${f.error}`}`
      );
    } finally {
      setChecking(false);
    }
  }

  // Local-only image policy: always use exhibition.representativeImage (local)
  const [isCurrentExhibitionsCollapsed, setIsCurrentExhibitionsCollapsed] = useState(false);
  const [isPastExhibitionsCollapsed, setIsPastExhibitionsCollapsed] = useState(false);
  const [isUpcomingExhibitionsCollapsed, setIsUpcomingExhibitionsCollapsed] = useState(false);
  // Debug overlay removed with header image

  // Optional auto-feed for National Gallery and Tate Britain: load from local JSON if present
  const [ngOverride, setNgOverride] = useState<Partial<Exhibition> | null>(null);
  useEffect(() => {
    let aborted = false;
    async function loadNG() {
      if (!exhibition || (exhibition.id !== "national-gallery" && exhibition.id !== 'tate-modern' && exhibition.id !== 'tate-britain')) { setNgOverride(null); return; }
      try {
        const feedPath = exhibition.id === 'tate-modern' ? '/data/tate-modern.json' : exhibition.id === 'tate-britain' ? '/data/tate-britain.json' : '/data/national-gallery-exhibitions.json';
        const res = await fetch(feedPath, { cache: "no-store" });
        if (!res.ok) return; // keep defaults when not found
        const data = await res.json();
        if (aborted) return;
        // Validate minimal shape and map to Exhibition fields
        const mapItem = (it: any) => ({
          id: String(it.id || it.slug || cryptoRandom()),
          name: String(it.name || it.title || ""),
          title: String(it.title || it.name || ""),
          description: String(it.description || ""),
          startDate: String(it.startDate || it.start || ""),
          endDate: String(it.endDate || it.end || ""),
          image: typeof it.image === 'string' ? it.image : (typeof it.imageUrl === 'string' ? it.imageUrl : undefined),
          url: typeof it.url === 'string' ? it.url : undefined,
        });
        const over: Partial<Exhibition> = {
          // Always keep local representative image from homepage dataset; do not override from feed
          representativeImage: exhibition.representativeImage,
          description: typeof data.description === 'string' && data.description ? data.description : exhibition.description,
          // For Tate galleries: data.items = all future shows; for NG: use special/upcoming/past
          temporaryExhibitions: exhibition.id.startsWith('tate-')
            ? (Array.isArray(data.items) ? data.items.map(mapItem) : exhibition.temporaryExhibitions)
            : ([
                ...(Array.isArray(data.special) ? data.special.map(mapItem) : []),
                ...(Array.isArray(data.upcoming) ? data.upcoming.map(mapItem) : []),
              ].length ? [
                ...(Array.isArray(data.special) ? data.special.map(mapItem) : []),
                ...(Array.isArray(data.upcoming) ? data.upcoming.map(mapItem) : []),
              ] : exhibition.temporaryExhibitions),
          pastExhibitions: exhibition.id.startsWith('tate-')
            ? (exhibition.pastExhibitions || [])
            : (Array.isArray(data.past) ? data.past.map(mapItem) : (exhibition.pastExhibitions || [])),
        } as Partial<Exhibition>;
        setNgOverride(over);
      } catch {
        // ignore
      }
    }
    loadNG();
    return () => { aborted = true; };
  }, [exhibition]);

  // Load Tate Modern artworks archive (scraped) when viewing tate-modern panel
  useEffect(() => {
    let cancelled = false;
    async function loadTateArtworks() {
      if (!exhibition || (exhibition.id !== 'tate-modern' && exhibition.id !== 'tm-perm-1')) { return; }
      try {
        const dataFile = exhibition.id === 'tm-perm-1' ? '/data/tate-collection-highlights-artworks.json' : '/data/tate-artworks.json';
        const res = await fetch(dataFile, { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const items = Array.isArray(json.items) ? json.items : [];
        // Light filtering: drop entries missing title or image entirely
        items.filter((it: any) => it && it.title && (it.thumb || it.image));
        // Limit to first 60 to keep side panel light; can expand later
        // Removed: setTateArtworks(cleaned.slice(0, 60));
      } catch {
        // ignore failures (keep null)
      }
    }
    loadTateArtworks();
    return () => { cancelled = true; };
  }, [exhibition]);

  function cryptoRandom() {
    try {
      const arr = new Uint32Array(2);
      crypto.getRandomValues(arr);
      return `${arr[0].toString(16)}${arr[1].toString(16)}`;
    } catch { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  }

  // Categorize temporary (special) exhibitions by date: upcoming / current / expired
  const { upcomingSpecials, currentSpecials, expiredSpecials } = useMemo(() => {
    const temps = (ngOverride?.temporaryExhibitions ?? exhibition.temporaryExhibitions) || [];
    const now = new Date();
    // Normalize to start of today for comparisons
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const parseSafe = (s?: string | null) => {
      if (!s) return null;
      const d = new Date(s);
      if (isNaN(d.getTime())) return null;
      return d;
    };
    const upcoming: typeof temps = [];
    const current: typeof temps = [];
    const expired: typeof temps = [];
    for (const item of temps) {
      const start = parseSafe(item.startDate as any);
      const end = parseSafe(item.endDate as any);
      // If end is before todayStart, it's expired
      if (end && end < todayStart) {
        expired.push(item);
        continue;
      }
      // If start is after todayStart, it's upcoming
      if (start && start > todayStart) {
        upcoming.push(item);
        continue;
      }
      // Otherwise, consider it current (also covers missing/invalid dates)
      current.push(item);
    }
    return { upcomingSpecials: upcoming, currentSpecials: current, expiredSpecials: expired };
  }, [ngOverride?.temporaryExhibitions, exhibition.temporaryExhibitions]);

  // Merge any expired special exhibitions into the past list for display
  const pastList = useMemo(() => {
    const pastFromData = (ngOverride?.pastExhibitions ?? exhibition.pastExhibitions) || [];
    return [...pastFromData, ...(expiredSpecials || [])];
  }, [ngOverride?.pastExhibitions, exhibition.pastExhibitions, expiredSpecials]);

  // Defensive: hide any stray heading labeled 'EXHIBITIONS' that may be injected by older markup/styles
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const nodes = root.querySelectorAll('h1,h2,h3,h4,p,span,div');
    nodes.forEach((el) => {
      const txt = (el.textContent || '').trim();
      if (!txt) return;
      const up = txt.toUpperCase();
      if (up === 'EXHIBITIONS' || up === 'EXHIBITION') {
        (el as HTMLElement).style.display = 'none';
      }
    });
  }, [isOpen, exhibition.id]);

  return (
    <div
      ref={rootRef}
      style={{
        position: "fixed",
        top: "20px", // Add top margin to create space
  right: 0,
  width: "min(400px, 90vw)",
        height: "calc(100% - 20px)", // Adjust height to account for top margin
        backgroundColor: "#fff",
        overflowY: "auto",
  paddingLeft: "30px",
  paddingRight: "30px", // Make right spacing equal to left spacing
  boxSizing: "border-box", // Include padding within width to avoid clipping on small screens
        boxShadow: "none",
  // Ensure full visibility when open
  transform: isOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.3s ease",
        zIndex: 2000
      }}
    >
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          fontSize: "1.5rem",
          cursor: "pointer",
          marginBottom: "10px",
          padding: 0,
          color: "#000", // Set arrow color to black
        }}
        aria-label="Back"
      >
        ←
      </button>
  <h2>{exhibition.name}</h2>
  {/* 상단 대표 이미지를 로컬 아카이브에서 표시 (외부 링크/리다이렉트 금지) */}
  {(() => {
    const rep = exhibition.representativeImage || "";
    const cleaned = rep.replace(/^\//, "");
    const isLocal = /^images\//.test(cleaned); // only allow files under public/images
    if (!isLocal) return null;
    const src = publicUrl(rep);
    return (
    <div
        style={{
          width: "100%",
      height: "120px", // Reduce image height to prevent layout cut-off
          margin: "8px 0 10px",
          overflow: "hidden",
          borderRadius: 6,
          background: "#f2f2f2",
          border: "1px solid #e5e5e5"
        }}
        aria-hidden={!src}
      >
        {src ? (
          <img
            src={src}
            alt={`${exhibition.name} building exterior`}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            loading="lazy"
            decoding="async"
          />
        ) : null}
      </div>
    );
  })()}
  {(() => {
    // Build a concise one-line intro from description
    const full = (ngOverride?.description || exhibition.description || "").trim();
    const firstSentence = (() => {
      const match = full.match(/^[^.!?\n]+[.!?]?/);
      return match ? match[0] : full;
    })();
    const intro = firstSentence.length > 140 ? `${firstSentence.slice(0, 137)}…` : firstSentence;
    return (
    <p
        style={{
      fontSize: "0.72rem",
          fontWeight: 400,
      color: "#555",
          marginBottom: "12px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis"
        }}
        title={full}
      >
        {intro}
      </p>
    );
  })()}

  {/* Current exhibitions */}
      <h3>
        <button
          onClick={() => setIsCurrentExhibitionsCollapsed(!isCurrentExhibitionsCollapsed)}
          style={{
            marginRight: "10px",
            fontSize: "0.9rem",
            padding: "2px 6px"
          }}
        >
          {isCurrentExhibitionsCollapsed ? "▶" : "▼"}
        </button>
  Current
      </h3>

      {!isCurrentExhibitionsCollapsed && (
        <>
          {/* Permanent exhibitions */}
          <h4>Permanent</h4>
          {exhibition.permanentExhibitions && exhibition.permanentExhibitions.filter(item => item.id === 'tm-perm-3').length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 100px)",
                gap: "10px",
                justifyContent: "center",
              }}
            >
              {exhibition.permanentExhibitions.filter(item => item.id === 'tm-perm-3').map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    onSelectExhibition(item);
                    // ...existing code...
                  }}
                  style={{
                    width: "100px",
                    height: "160px", // Slightly reduced height
                    border: "1px solid #ccc",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer"
                  }}
                >
                  {/* Poster (image if available) */}
                  <div style={{ width: "80px", height: "100px", backgroundColor: "#eee", marginBottom: "3px", overflow: 'hidden', borderRadius: 3 }}>
                    {item.image ? (
                      <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" decoding="async" />
                    ) : null}
                  </div>
                  {/* Exhibition name */}
                  <div
                    style={{
                      textAlign: "center",
                      fontSize: "0.75rem", // Slightly smaller font
                      fontWeight: "bold",  // Make it bold
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      width: "80px",
                      position: "relative"
                    }}
                  >
                    <div
                      style={{
                        display: "inline-block",
                        animation: "marquee 5s linear infinite",
                        animationPlayState: "paused",
                        whiteSpace: "nowrap"
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.animationPlayState = "running";
                      }}
                      onMouseLeave={(e) => {
                        const target = e.currentTarget as HTMLElement;
                        target.style.animationPlayState = "paused";
                        target.style.animation = "none";  // Reset animation
                        target.offsetHeight;  // Force reflow
                        target.style.animation = "marquee 5s linear infinite";
                        target.style.animationPlayState = "paused";
                        target.style.transform = "translateX(0)"; // Reset to start position
                      }}
                    >
                      {item.name}
                    </div>
                  </div>
                  {/* Period or tag */}
                  <div style={{ textAlign: "center", fontSize: "0.65rem", color: "#555", marginTop: 2 }}>
                    <div style={{ fontWeight: 600 }}>Permanent</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No permanent items.</p>
          )}

          {/* Temporary (time-limited) exhibitions (current) */}
          <h4>Temporary</h4>
          {currentSpecials && currentSpecials.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 100px)",
                gap: "10px",
                justifyContent: "center",
              }}
            >
              {currentSpecials.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    onSelectExhibition(item);
                    // ...existing code...
                  }}
                  style={{
                    width: "100px",
                    height: "180px",
                    border: "1px solid #ccc",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer"
                  }}
                >
                  {/* Poster (image if available) */}
                  <div style={{ width: "80px", height: "100px", backgroundColor: "#eee", marginBottom: "5px", overflow: 'hidden', borderRadius: 3 }}>
                    {item.image ? (
                      <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" decoding="async" />
                    ) : null}
                  </div>
                  {/* Exhibition name */}
                  <div
                    style={{
                      textAlign: "center",
                      fontSize: "0.75rem", // Slightly smaller font
                      fontWeight: "bold",  // Make it bold
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      width: "80px",
                      position: "relative"
                    }}
                  >
                    <div
                      style={{
                        display: "inline-block",
                        animation: "marquee 5s linear infinite",
                        animationPlayState: "paused",
                        whiteSpace: "nowrap"
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.animationPlayState = "running";
                      }}
                      onMouseLeave={(e) => {
                        const target = e.currentTarget as HTMLElement;
                        target.style.animationPlayState = "paused";
                        target.style.animation = "none";  // Reset animation
                        target.offsetHeight;  // Force reflow
                        target.style.animation = "marquee 5s linear infinite";
                        target.style.animationPlayState = "paused";
                        target.style.transform = "translateX(0)"; // Reset to start position
                      }}
                    >
                      {item.name}
                    </div>
                  </div>
                  {/* Period: two lines (start on top, end on bottom) */}
                  <div style={{ textAlign: "center", fontSize: "0.65rem", color: "#555", marginTop: 2, lineHeight: 1.2 }}>
                    <div>{formatYMD(item.startDate as any) || ""}</div>
                    <div>{formatYMD(item.endDate as any) || ""}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No temporary items.</p>
          )}

          {/* upcoming removed from here - it will be rendered as its own top-level section */}
        </>
      )}

        {/* Upcoming exhibitions (top-level) */}
        <h3>
          <button
            onClick={() => setIsUpcomingExhibitionsCollapsed(!isUpcomingExhibitionsCollapsed)}
            style={{
              marginRight: "10px",
              fontSize: "0.9rem",
              padding: "2px 6px"
            }}
          >
            {isUpcomingExhibitionsCollapsed ? "▶" : "▼"}
          </button>
  Upcoming
        </h3>

        {!isUpcomingExhibitionsCollapsed && (
          upcomingSpecials && upcomingSpecials.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 100px)", gap: "10px", justifyContent: "center" }}>
              {upcomingSpecials.map((item) => (
                <div
                  key={`up-${item.id}`}
                  onClick={() => onSelectExhibition(item)}
                  style={{
                    width: "100px",
                    height: "180px",
                    border: "1px solid #ccc",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer"
                  }}
                >
                  <div style={{ width: "80px", height: "100px", backgroundColor: "#eee", marginBottom: "5px", overflow: 'hidden', borderRadius: 3 }}>
                    {item.image ? (
                      <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" decoding="async" />
                    ) : null}
                  </div>
                  <div style={{ textAlign: "center", fontSize: "0.75rem", fontWeight: 700, width: "80px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                  {/* Period: two lines (start on top, end on bottom) */}
                  <div style={{ textAlign: "center", fontSize: "0.65rem", color: "#555", marginTop: 2, lineHeight: 1.2 }}>
                    <div>{formatYMD(item.startDate as any) || ""}</div>
                    <div>{formatYMD(item.endDate as any) || ""}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No upcoming items.</p>
          )
        )}

  {/* ...existing code... */}
      <h3>
        <button
          onClick={() => setIsPastExhibitionsCollapsed(!isPastExhibitionsCollapsed)}
          style={{
            marginRight: "10px",
            fontSize: "0.9rem",
            padding: "2px 6px"
          }}
        >
          {isPastExhibitionsCollapsed ? "▶" : "▼"}
        </button>
  Past
      </h3>

      {!isPastExhibitionsCollapsed && (
        pastList && pastList.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 100px)",
              gap: "10px",
              justifyContent: "center",
            }}
          >
            {pastList.map((item) => (
              <div
                key={item.id}
                onClick={() => onSelectExhibition(item)}
                style={{
                  width: "100px",
                  height: "180px",
                  border: "1px solid #ccc",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer"
                }}
              >
                {/* Poster (placeholder frame) */}
                <div style={{ width: "80px", height: "100px", backgroundColor: "#eee", marginBottom: "5px", overflow: 'hidden', borderRadius: 3 }}>
                  {item.image ? (
                    <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" decoding="async" />
                  ) : null}
                </div>
                {/* Exhibition name */}
                <div
                  style={{
                    textAlign: "center",
                    fontSize: "0.75rem", // Slightly smaller font
                    fontWeight: "bold",  // Make it bold
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    width: "80px",
                    position: "relative"
                  }}
                >
                  <div
                    style={{
                      display: "inline-block",
                      animation: "marquee 5s linear infinite",
                      animationPlayState: "paused",
                      whiteSpace: "nowrap"
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.animationPlayState = "running";
                    }}
                    onMouseLeave={(e) => {
                      const target = e.currentTarget as HTMLElement;
                      target.style.animationPlayState = "paused";
                      target.style.animation = "none";  // Reset animation
                      target.offsetHeight;  // Force reflow
                      target.style.animation = "marquee 5s linear infinite";
                      target.style.animationPlayState = "paused";
                      target.style.transform = "translateX(0)"; // Reset to start position
                    }}
                  >
                    {item.name}
                  </div>
                </div>
                {/* Period: two lines (start on top, end on bottom) */}
                <div style={{ textAlign: "center", fontSize: "0.65rem", color: "#555", marginTop: 2, lineHeight: 1.2 }}>
                  <div>{formatYMD(item.startDate as any) || ""}</div>
                  <div>{formatYMD(item.endDate as any) || ""}</div>
                </div>
              </div>
            ))}
          </div>
  ) : (
          <p>No past items.</p>
        )
      )}

  {/* Dev: Firebase connection healthcheck */}
      <div style={{ marginTop: 12 }}>
        <button onClick={runHealthcheck} disabled={checking} style={{ fontSize: "0.85rem" }}>
          {checking ? "Checking..." : "Check Firebase connection"}
        </button>
      </div>
    </div>
  );
}