import { publicUrl } from "../utils/publicUrl";
import { useMemo, useState } from "react";
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
  const [checking, setChecking] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
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
  // Show URL debug overlay only in dev or when ?debug=1 is present
  const canDebug = (() => {
    try {
      const dev = (import.meta as any)?.env?.DEV;
      const qs = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const q = qs?.get('debug') === '1';
      return !!(dev || q);
    } catch {
      return false;
    }
  })();

  // Categorize temporary (special) exhibitions by date: upcoming / current / expired
  const { upcomingSpecials, currentSpecials, expiredSpecials } = useMemo(() => {
    const temps = exhibition.temporaryExhibitions || [];
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
  }, [exhibition.temporaryExhibitions]);

  // Merge any expired special exhibitions into the past list for display
  const pastList = useMemo(() => {
    const pastFromData = exhibition.pastExhibitions || [];
    return [...pastFromData, ...(expiredSpecials || [])];
  }, [exhibition.pastExhibitions, expiredSpecials]);

  return (
    <div
      style={{
        position: "fixed",
        top: "20px", // Add top margin to create space
        right: 0,
        width: "400px",
        height: "calc(100% - 20px)", // Adjust height to account for top margin
        backgroundColor: "#fff",
        overflowY: "auto",
        paddingLeft: "30px",
        boxShadow: "none",
        transform: isOpen ? "translateX(20px)" : "translateX(100%)",
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
      {/* 전시관 대표 이미지 */}
      <div
        style={{
          width: "calc(100% - 20px)", // 우측 벽과 여백 유지
          aspectRatio: "16 / 9", // 일관된 비율 유지
          marginBottom: "10px",
          marginRight: "20px",
          backgroundColor: "#ccc",
          overflow: "hidden",
          borderRadius: 6
        }}
      >
        {(() => {
          const fallback = "/images/meta-header.svg";
          const raw = (exhibition.representativeImage && String(exhibition.representativeImage).trim())
            || ((exhibition as any).image && String((exhibition as any).image).trim())
            || fallback;
          const cleaned = raw.replace(/^\/+/, "");
          const fb = publicUrl(fallback);
          const candidates = useMemo(() => {
            const list = [
              publicUrl(raw),
              // Ensure a relative form as a second try under sub-path or file://
              publicUrl(`./${cleaned}`),
            ];
            // Deduplicate while preserving order
            return Array.from(new Set(list));
          }, [raw, cleaned]);
          const [idx, setIdx] = useState(0);
          const src = candidates[Math.min(idx, candidates.length - 1)] || fb;
          return (
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
              <img
                src={src}
                alt={exhibition.name}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                loading="eager"
                decoding="async"
                onError={(e) => {
                  // Try next candidate if available; else fall back to placeholder
                  if (idx < candidates.length - 1) {
                    setIdx((v) => v + 1);
                    return;
                  }
                  const target = e.currentTarget as HTMLImageElement;
                  if (target.src !== fb) target.src = fb;
                }}
              />
              {canDebug && showDebug && (
                <div style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>{src}</div>
              )}
              {canDebug && (
                <button onClick={() => setShowDebug(v => !v)} style={{ position: 'absolute', top: 6, right: 6, fontSize: 10, padding: '2px 6px' }}>URL</button>
              )}
            </div>
          );
        })()}
      </div>
  {/* External links removed (by request). Only optional tiny attribution was kept out. */}
  {/* Remote attribution removed — local-only images */}
  <p style={{ fontSize: "0.8rem", fontWeight: 400, color: "#333", marginBottom: "12px" }}>{exhibition.description}</p>

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
  Current exhibitions
      </h3>

      {!isCurrentExhibitionsCollapsed && (
        <>
          {/* Permanent exhibitions */}
          <h4>Permanent</h4>
          {exhibition.permanentExhibitions && exhibition.permanentExhibitions.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              {exhibition.permanentExhibitions.map((item) => (
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
                  {/* Poster (placeholder frame) */}
                  <div
                    style={{
                      width: "80px",
                      height: "100px",
                      backgroundColor: "#eee",
                      marginBottom: "3px" // Reduced margin
                    }}
                  ></div>
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
                  {/* Period */}
                  <div style={{ textAlign: "center", fontSize: "0.6rem", color: "#666" }}>
                    <div>{item.startDate}</div>
                    <div>{item.endDate}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No permanent exhibitions.</p>
          )}

          {/* Special exhibitions (current) */}
          <h4>Special</h4>
          {currentSpecials && currentSpecials.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
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
                  {/* Poster (placeholder frame) */}
                  <div
                    style={{
                      width: "80px",
                      height: "100px",
                      backgroundColor: "#eee",
                      marginBottom: "5px"
                    }}
                  ></div>
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
                  {/* Period */}
                  <div style={{ textAlign: "center", fontSize: "0.6rem", color: "#666" }}>
                    <div>{item.startDate}</div>
                    <div>{item.endDate}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No special exhibitions.</p>
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
  Upcoming exhibitions
        </h3>

        {!isUpcomingExhibitionsCollapsed && (
          upcomingSpecials && upcomingSpecials.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
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
                  <div style={{ width: "80px", height: "100px", backgroundColor: "#eee", marginBottom: "5px" }} />
                  <div style={{ textAlign: "center", fontSize: "0.75rem", fontWeight: 700, width: "80px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                  <div style={{ textAlign: "center", fontSize: "0.6rem", color: "#666" }}>
                    <div>{item.startDate}</div>
                    <div>{item.endDate}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No upcoming exhibitions.</p>
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
  Past exhibitions
      </h3>

      {!isPastExhibitionsCollapsed && (
        pastList && pastList.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
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
                <div
                  style={{
                    width: "80px",
                    height: "100px",
                    backgroundColor: "#eee",
                    marginBottom: "5px"
                  }}
                ></div>
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
                {/* Period */}
                <div style={{ textAlign: "center", fontSize: "0.6rem", color: "#666" }}>
                  <div>{item.startDate}</div>
                  <div>{item.endDate}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p>No past exhibitions.</p>
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