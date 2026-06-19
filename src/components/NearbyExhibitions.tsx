// NearbyExhibitions — the "주변 전시 / Nearby" exhibition browser.
//
// Moved out of the AI Recommendation tab so it can live inside the Community
// tab (users browse community + check nearby shows in one place). Fully
// self-contained: fetches community rating stats + the exhibition list,
// sorts/filters, and opens a detail sheet on tap. Host only passes the theme
// flag + language.
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Navigation, MapPin, X, Calendar, Star, Heart } from "lucide-react";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { exhibitions } from "../data/exhibitions";
import { NO_IMAGE_PLACEHOLDER_DARK } from "../utils/noImagePlaceholder";
import { getExhibitionDisplayDescription, getExhibitionDisplayTitle } from "../i18n/exhibitionLocalization";
import { getMuseumDisplayDescription, getMuseumDisplayName } from "../i18n/museumLocalization";

type Copy = { ko: string; en: string };

interface NearbyItem {
  id: string;
  title: string;
  venue: string;
  image: string;
  period: string;
  distance?: number;
  daysLeft: number;
  communityAvg: number;
  finalScore: number;
  officialUrl: string;
  detailUrl: string;
  description: string;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildSearchUrl(query: unknown) {
  return `https://www.google.com/search?q=${encodeURIComponent(String(query || ""))}`;
}

function resolveExhibitionDetailUrl(museumName: unknown, title: unknown, rawUrl: unknown) {
  const trimmedUrl = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!trimmedUrl) return buildSearchUrl(`${museumName || ""} ${title || ""} 전시`);
  if (/mmca\.go\.kr\/exhibitions\/progressList\.do/i.test(trimmedUrl)) {
    return buildSearchUrl(`${museumName || "MMCA"} ${title || ""} 전시`);
  }
  return trimmedUrl;
}

// ─── Detail Sheet ───────────────────────────────────────────
function ExhibitionDetailSheet({
  ex, t, bg, fg, fgMed, fgLow, divider, onClose, tr, language,
}: {
  ex: NearbyItem;
  t: boolean; bg: string; fg: string; fgMed: string; fgLow: string; divider: string;
  onClose: () => void;
  tr: (copy: Copy) => string;
  language: string;
}) {
  const safeImg = ex.image || NO_IMAGE_PLACEHOLDER_DARK;
  return (
    <motion.div
      initial={{ y: "100%", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: "100%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 350, damping: 32 }}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center",
        backgroundColor: t ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        className="no-scrollbars"
        style={{
          width: "100%", maxWidth: 640, height: "85dvh",
          backgroundColor: bg,
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          overflowY: "auto", display: "flex", flexDirection: "column",
          boxShadow: "0 -4px 32px rgba(0,0,0,0.4)",
          scrollbarWidth: "none", msOverflowStyle: "none",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style dangerouslySetInnerHTML={{ __html: `.no-scrollbars::-webkit-scrollbar { display: none; }` }} />
        <div
          style={{
            position: "absolute", top: 18, right: 18, zIndex: 10,
            width: 36, height: 36, borderRadius: "50%",
            backgroundColor: t ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.6)",
            backdropFilter: "blur(12px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", border: `1px solid ${divider}`,
          }}
          onClick={onClose}
        >
          <X size={16} color={fg} />
        </div>

        <div style={{ width: "100%", position: "relative", flexShrink: 0, backgroundColor: "#1a1a1a" }}>
          <img src={safeImg} alt={ex.title} style={{ width: "100%", height: "auto", display: "block" }} />
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to top, ${bg} 0%, transparent 30%)` }} />
        </div>

        <div style={{ padding: "0 24px 110px", marginTop: -20, position: "relative", zIndex: 5 }}>
          {ex.finalScore !== undefined && ex.finalScore !== null && ex.finalScore > 0 && (
            <div style={{ display: "inline-block", padding: "4px 9px", borderRadius: 999, backgroundColor: "#D4A547", color: "#000", fontSize: 10, fontWeight: 700, fontFamily: "'Space Mono', monospace", marginBottom: 16 }}>
              {tr({ ko: "AI 모델 추천 등급", en: "AI Recommendation Score" })} {(ex.finalScore / 20).toFixed(1)}
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.15em", color: fgMed, textTransform: "uppercase", marginBottom: 8 }}>
            {String(ex.venue || "")}
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: fg, lineHeight: 1.25, marginBottom: 20 }}>{ex.title}</h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 28 }}>
            {ex.period && (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: t ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Calendar size={15} color={fgMed} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: fgLow, marginBottom: 2 }}>{tr({ ko: "기간", en: "Date" })}</div>
                  <div style={{ fontSize: 13, color: fg, fontWeight: 500 }}>{ex.period}</div>
                </div>
              </div>
            )}
            {ex.distance !== undefined && (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: t ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <MapPin size={15} color={fgMed} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: fgLow, marginBottom: 2 }}>{tr({ ko: "거리", en: "Distance" })}</div>
                  <div style={{ fontSize: 13, color: fg, fontWeight: 500 }}>{ex.distance}km</div>
                </div>
              </div>
            )}
            {ex.communityAvg !== undefined && ex.communityAvg !== null && ex.communityAvg > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: t ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Star size={15} color={fgMed} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: fgLow, marginBottom: 2 }}>{tr({ ko: "커뮤니티 평점", en: "Community Rating" })}</div>
                  <div style={{ fontSize: 13, color: fg, fontWeight: 500 }}>{ex.communityAvg.toFixed(1)} / 5.0</div>
                </div>
              </div>
            )}
          </div>

          {ex.description && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: fgMed, textTransform: language === "ko" ? "none" : "uppercase", marginBottom: 10 }}>{tr({ ko: "설명", en: "About" })}</div>
              <p style={{ fontSize: 13, color: fgLow, lineHeight: 1.7 }}>{ex.description}</p>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 32 }}>
            <button
              style={{
                flex: 1, padding: "14px", borderRadius: 10, cursor: "pointer",
                backgroundColor: "#D4A547", color: "#000",
                border: "none", fontSize: 13, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
              onClick={() => {
                const targetUrl = ex.detailUrl || ex.officialUrl || resolveExhibitionDetailUrl(ex.venue, ex.title, "");
                window.open(targetUrl, "_blank", "noopener,noreferrer");
              }}
            >
              <Navigation size={14} />
              {tr({ ko: "자세히 보기", en: "View Details" })}
            </button>
            <button
              style={{
                width: 48, height: 48, borderRadius: 10, cursor: "pointer", flexShrink: 0,
                backgroundColor: t ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.06)",
                border: "none", display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Heart size={18} color={fg} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main ───────────────────────────────────────────────────
export default function NearbyExhibitions({ isLight, language }: { isLight: boolean; language: string }) {
  const t = isLight;
  const bg = t ? "#FAFAFA" : "#080808";
  const fg = t ? "rgba(0,0,0,0.92)" : "rgba(244,241,234,0.96)";
  const fgMed = t ? "rgba(0,0,0,0.72)" : "rgba(244,241,234,0.82)";
  const fgLow = t ? "rgba(0,0,0,0.58)" : "rgba(244,241,234,0.64)";
  const fgFaint = t ? "rgba(0,0,0,0.36)" : "rgba(244,241,234,0.40)";
  const divider = t ? "rgba(0,0,0,0.08)" : "rgba(244,241,234,0.08)";

  const tr = (copy: Copy) => (language === "ko" ? copy.ko : copy.en);

  const [items, setItems] = useState<NearbyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState("taste");
  const [selectedEx, setSelectedEx] = useState<NearbyItem | null>(null);
  const [exhStatsMap, setExhStatsMap] = useState<Record<string, any>>({});
  const [statsLoaded, setStatsLoaded] = useState(false);

  // Community rating stats (drives the rating badge + "Top Rated" sort).
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const db = getFirestore();
        const snap = await getDocs(collection(db, "exhibition_stats"));
        const smap: Record<string, any> = {};
        snap.forEach((d) => { smap[d.id] = d.data(); });
        setExhStatsMap(smap);
      } catch (e: unknown) {
        if ((e as { code?: string })?.code !== "permission-denied") {
          console.error("Failed to fetch exhibition stats", e);
        }
      } finally {
        setStatsLoaded(true);
      }
    };
    void fetchStats();
  }, []);

  // Build the nearby exhibition list (geolocation distance + rating score).
  useEffect(() => {
    if (!statsLoaded) return;
    setLoading(true);
    let uLat: number | null = null;
    let uLng: number | null = null;

    const processExhibitions = () => {
      const results: NearbyItem[] = [];
      for (const m of exhibitions as any[]) {
        for (const e of (m.temporaryExhibitions || []) as any[]) {
          if (e.status === "past") continue;
          let dist: number | undefined = undefined;
          if (uLat !== null && uLng !== null && m.latitude && m.longitude) {
            dist = Math.round(haversineKm(uLat, uLng, m.latitude, m.longitude) * 10) / 10;
          }
          let daysLeft = 9999;
          if (e.endDate !== undefined && e.endDate !== "ongoing" && e.endDate !== "TBD") {
            daysLeft = Math.ceil((new Date(e.endDate).getTime() - Date.now()) / 86400000);
          }

          const communityAvg = exhStatsMap[e.id]?.avgRating || 0.0;
          const finalScore = communityAvg > 0
            ? Math.round(Math.min(100, Math.max(0, 75 + (communityAvg - 3.0) * 5)))
            : 0;

          const img = e.coverImage || "";
          const localizedTitle = getExhibitionDisplayTitle(e as any, language);
          const localizedMuseum = getMuseumDisplayName(m as any, language);
          const localizedDescription =
            getExhibitionDisplayDescription(e as any, language) || getMuseumDisplayDescription(m as any, language) || "";
          const localizedPeriod =
            e.endDate === "ongoing" || e.endDate === "TBD"
              ? `${e.startDate} - ${tr({ ko: "상시", en: "Ongoing" })}`
              : `${e.startDate} - ${e.endDate}`;

          if (img) {
            results.push({
              id: e.id,
              title: localizedTitle,
              venue: localizedMuseum,
              image: img,
              period: localizedPeriod,
              distance: dist,
              daysLeft,
              communityAvg,
              finalScore,
              officialUrl: e.officialUrl || e.url || "",
              detailUrl: resolveExhibitionDetailUrl(localizedMuseum, localizedTitle, e.officialUrl || e.url || ""),
              description: localizedDescription,
            });
          }
        }
      }
      setItems(results);
      setLoading(false);
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { uLat = pos.coords.latitude; uLng = pos.coords.longitude; processExhibitions(); },
        () => processExhibitions(),
      );
    } else {
      processExhibitions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exhStatsMap, language, statsLoaded]);

  const SORT_LABELS = [
    { id: "taste", label: tr({ ko: "취향맞춤순", en: "Taste Match" }) },
    { id: "distance", label: tr({ ko: "거리순", en: "Distance" }) },
    { id: "popular", label: tr({ ko: "평점순", en: "Top Rated" }) },
    { id: "deadline", label: tr({ ko: "마감임박", en: "Ending Soon" }) },
  ];

  const sortedAll = useMemo(() => {
    const arr = [...items];
    if (sortMode === "distance") arr.sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));
    else if (sortMode === "deadline") arr.sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
    else if (sortMode === "popular") arr.sort((a, b) => (b.communityAvg ?? 0) - (a.communityAvg ?? 0));
    else arr.sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
    return arr;
  }, [items, sortMode]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: fgLow, fontSize: 12 }}>
        {tr({ ko: "주변 전시를 불러오는 중입니다...", en: "Loading nearby exhibitions..." })}
      </div>
    );
  }

  return (
    <div style={{ padding: "4px 14px 100px" }}>
      {/* Sort sub-navigator */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16, overflowX: "auto", scrollbarWidth: "none" }}>
        <Clock size={11} color={fgFaint} style={{ marginRight: 2, flexShrink: 0 }} />
        {SORT_LABELS.map((s) => {
          const isActive = sortMode === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSortMode(s.id)}
              style={{
                padding: "4px 11px", borderRadius: 999, fontSize: 10, fontWeight: isActive ? 600 : 400,
                cursor: "pointer", flexShrink: 0, border: "none", transition: "all 0.15s",
                backgroundColor: isActive ? "#D4A547" : t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.07)",
                color: isActive ? "#000" : fgLow,
              }}
            >
              {s.label}
            </button>
          );
        })}
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: fgFaint, marginLeft: "auto", flexShrink: 0, paddingLeft: 8 }}>
          {sortedAll.length}{language === "ko" ? "개" : ""}
        </span>
      </div>

      {sortedAll.length === 0 ? (
        <div style={{ padding: "60px 24px", textAlign: "center", color: fgLow, fontSize: 12 }}>
          {tr({ ko: "표시할 주변 전시가 없습니다.", en: "No nearby exhibitions to show." })}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {sortedAll.map((ex, idx) => (
            <motion.div
              key={ex.id + "-" + idx}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(0.1 + idx * 0.03, 0.6) }}
              onClick={() => setSelectedEx(ex)}
              style={{ borderRadius: 12, overflow: "hidden", cursor: "pointer", border: `1px solid ${divider}`, padding: 0, textAlign: "left" }}
            >
              <div style={{ aspectRatio: "3/4", position: "relative", overflow: "hidden", backgroundColor: "#1a1a1a" }}>
                <img
                  src={ex.image || NO_IMAGE_PLACEHOLDER_DARK}
                  alt={ex.title}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={(e) => { e.currentTarget.src = NO_IMAGE_PLACEHOLDER_DARK; }}
                />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 40%)" }} />
                <div style={{ position: "absolute", bottom: 8, right: 8, display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
                  {ex.finalScore !== null && ex.finalScore !== undefined && ex.finalScore > 0 && (
                    <span style={{ background: "rgba(212,165,71,0.95)", color: "#000", padding: "3px 6px", borderRadius: 4, fontSize: 9.5, fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>
                      {tr({ ko: "예상", en: "Pred" })} {(ex.finalScore / 20).toFixed(1)}
                    </span>
                  )}
                  {ex.communityAvg !== null && ex.communityAvg !== undefined && ex.communityAvg > 0 && (
                    <span style={{ background: "rgba(255,255,255,0.9)", color: "#000", padding: "3px 6px", borderRadius: 4, fontSize: 9.5, fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>
                      {tr({ ko: "평점", en: "Rate" })} {ex.communityAvg.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ padding: "10px 8px", backgroundColor: t ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)" }}>
                <div style={{ fontSize: 10, color: fgLow, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(ex.venue || "")}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: fg, lineHeight: 1.25, marginBottom: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{ex.title}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: fgFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ex.period}</div>
                  {ex.distance !== undefined && (
                    <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0, paddingLeft: 4 }}>
                      <Navigation size={9} strokeWidth={1.75} style={{ color: fgFaint }} />
                      <span style={{ fontSize: 9, color: fgFaint }}>{ex.distance}km</span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {selectedEx && (
          <ExhibitionDetailSheet
            ex={selectedEx}
            t={t} bg={bg} fg={fg} fgMed={fgMed} fgLow={fgLow} divider={divider}
            onClose={() => setSelectedEx(null)}
            tr={tr}
            language={language}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
