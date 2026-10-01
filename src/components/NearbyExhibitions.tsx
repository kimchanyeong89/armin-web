// NearbyExhibitions — the "주변 전시 / Nearby" exhibition browser.
//
// Moved out of the AI Recommendation tab so it can live inside the Community
// tab (users browse community + check nearby shows in one place). Fully
// self-contained: reads the live rating totals + the exhibition list,
// sorts/filters, and opens a detail modal on tap. Host only passes the theme
// flag + language, and optionally how to open a museum.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Clock, Navigation } from "lucide-react";
import { LikeIcon } from "./like/LikeIcon";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import NearbyExhibitionModal from "./NearbyExhibitionModal";
import { savedLocation } from "../utils/userLocation";
import { bookingFor, type BookingChannel } from "../data/exhibitionBooking";
import RatingEmblems from "./Ratings/RatingEmblems";
import { averageRating, subjectKey } from "../features/ratings/ratingWrites";
import { useAllRatingStats } from "../features/ratings/useRatings";
import { museumMapPath } from "../utils/museumMapPath";
import { useTasteScores } from "../features/taste/useTasteScores";
import { exhibitions } from "../data/exhibitions";
import { NO_IMAGE_PLACEHOLDER_DARK } from "../utils/noImagePlaceholder";
import { getExhibitionDisplayDescription, getExhibitionDisplayTitle } from "../i18n/exhibitionLocalization";
import { getMuseumDisplayDescription, getMuseumDisplayName } from "../i18n/museumLocalization";

type Copy = { ko: string; en: string };

interface NearbyItem {
  id: string;
  /** Museum this show belongs to, so the modal can route to the venue. */
  museumId: string;
  title: string;
  venue: string;
  image: string;
  period: string;
  distance?: number;
  daysLeft: number;
  /** Opening date in ms — the "newest" sort; 0 when the date is missing or unparseable. */
  startedAt: number;
  /** Filled in from the live rating totals, not stored with the list. */
  communityAvg?: number;
  /** 1–99 match with the signed-in user's liked artworks, from the taste worker. */
  tasteMatch?: number;
  officialUrl: string;
  detailUrl: string;
  /** where to book it, cheapest listed first (data/exhibitionBooking); empty when unknown */
  bookings: BookingChannel[];
  description: string;
}

/** "/" would split the Firestore path; My Page reads liked ids with "__" in its place. */
const likeDocId = (id: string) => String(id).replace(/\//g, "__");

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

// ─── Main ───────────────────────────────────────────────────
export default function NearbyExhibitions({
  isLight,
  language,
  onOpenMuseum,
  columns,
}: {
  isLight: boolean;
  language: string;
  /** Opens a museum from the detail modal; without it the modal routes to the museum on the map. */
  onOpenMuseum?: (museumId: string) => void;
  columns?: number;
}) {
  const navigate = useNavigate();
  const t = isLight;
  const fg = t ? "rgba(0,0,0,0.92)" : "rgba(244,241,234,0.96)";
  const fgMed = t ? "rgba(0,0,0,0.72)" : "rgba(244,241,234,0.82)";
  const fgLow = t ? "rgba(0,0,0,0.58)" : "rgba(244,241,234,0.64)";
  const fgFaint = t ? "rgba(0,0,0,0.36)" : "rgba(244,241,234,0.40)";
  const divider = t ? "rgba(0,0,0,0.08)" : "rgba(244,241,234,0.08)";

  const tr = (copy: Copy) => (language === "ko" ? copy.ko : copy.en);

  const [items, setItems] = useState<NearbyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState("taste");
  /* a position granted after the list opened brings the distances in */
  const [locationTick, setLocationTick] = useState(0);
  useEffect(() => {
    const again = () => setLocationTick((n) => n + 1);
    window.addEventListener("colly:location", again);
    return () => window.removeEventListener("colly:location", again);
  }, []);
  /* five across on a wide screen, three on a phone, unless the host sets it */
  const [wide, setWide] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1024));
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const cols = columns ?? (wide >= 1024 ? 5 : wide >= 640 ? 4 : 3);
  const [selectedEx, setSelectedEx] = useState<NearbyItem | null>(null);

  // Likes reuse users/{uid}/liked_exhibitions, which My Page already reads.
  const [uid, setUid] = useState<string | null>(null);
  const [liked, setLiked] = useState<Set<string>>(new Set());

  useEffect(() => onAuthStateChanged(getAuth(), (u) => setUid(u ? u.uid : null)), []);

  useEffect(() => {
    if (!uid) { setLiked(new Set()); return; }
    const db = getFirestore();
    return onSnapshot(collection(db, `users/${uid}/liked_exhibitions`),
      (snap) => setLiked(new Set(snap.docs.map((d) => d.id))), () => {});
  }, [uid]);

  const isLiked = (id: string) => liked.has(likeDocId(id));

  const toggleLike = async (ex: NearbyItem) => {
    if (!uid) {
      window.alert(tr({ ko: "로그인이 필요합니다.", en: "Please sign in first." }));
      return;
    }
    const db = getFirestore();
    const ref = doc(db, `users/${uid}/liked_exhibitions/${likeDocId(ex.id)}`);
    if (isLiked(ex.id)) await deleteDoc(ref).catch(() => {});
    else await setDoc(ref, {
      exhibitionId: ex.id,
      museumId: ex.museumId,
      title: ex.title,
      venue: ex.venue,
      image: ex.image,
      period: ex.period,
      created_at: serverTimestamp(),
    }, { merge: true }).catch(() => {});
  };

  // The modal's museum button: the host's own handler, or the museum's route on the map.
  const museumOpener = (ex: NearbyItem) => {
    const path = museumMapPath(ex.museumId);
    if (!path) return null;
    return () => {
      setSelectedEx(null);
      if (onOpenMuseum) onOpenMuseum(ex.museumId);
      else navigate(path);
    };
  };

  // Live community totals: they drive the sorts and the ratings on every card.
  const statsById = useAllRatingStats();

  // Build the nearby exhibition list (geolocation distance + rating score).
  useEffect(() => {
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
          const startedAt = Number.isFinite(Date.parse(e.startDate)) ? Date.parse(e.startDate) : 0;

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
              museumId: String(m.id || ""),
              title: localizedTitle,
              venue: localizedMuseum,
              image: img,
              period: localizedPeriod,
              distance: dist,
              daysLeft,
              startedAt,
              officialUrl: e.officialUrl || e.url || "",
              detailUrl: resolveExhibitionDetailUrl(localizedMuseum, localizedTitle, e.officialUrl || e.url || ""),
              bookings: bookingFor(String(m.id || ""), String(e.id || ""), e.officialUrl || e.url || ""),
              description: localizedDescription,
            });
          }
        }
      }
      setItems(results);
      setLoading(false);
    };

    /* the position the app asked for on its first visit (utils/userLocation); this
       list never asks itself - in the app's web view the prompt did not even show,
       and the list waited for an answer that never came */
    const here = savedLocation();
    if (here) { uLat = here.lat; uLng = here.lng; }
    processExhibitions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, locationTick]);

  /* by distance only when the visitor shared where they are */
  const hasDistance = items.some((item) => item.distance !== undefined);
  const SORT_LABELS = [
    { id: "taste", label: tr({ ko: "취향맞춤순", en: "Taste Match" }) },
    ...(hasDistance ? [{ id: "distance", label: tr({ ko: "거리순", en: "Distance" }) }] : []),
    { id: "popular", label: tr({ ko: "평점순", en: "Top Rated" }) },
    { id: "deadline", label: tr({ ko: "마감임박", en: "Ending Soon" }) },
    { id: "newest", label: tr({ ko: "최근등록순", en: "Newest" }) },
  ];

  // How each show matches the signed-in user's liked artworks; null until they have a taste.
  const taste = useTasteScores();

  const sortedAll = useMemo(() => {
    const arr = items.map((item) => {
      const communityAvg = averageRating(statsById.get(subjectKey({ kind: "exhibition", id: item.id }))) ?? 0;
      return { ...item, communityAvg, tasteMatch: taste?.exhibitions[item.id] };
    });
    if (sortMode === "distance") arr.sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));
    else if (sortMode === "deadline") arr.sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
    else if (sortMode === "popular") arr.sort((a, b) => (b.communityAvg ?? 0) - (a.communityAvg ?? 0));
    // Newest = most recently opened. The data carries no registration time, so the opening date stands in;
    // shows that opened on the same day fall back to whichever closes first.
    else if (sortMode === "newest") arr.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0) || (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
    // Taste first; shows without a score, or everyone before a taste exists, fall back to their rating.
    else arr.sort((a, b) => (b.tasteMatch ?? -1) - (a.tasteMatch ?? -1) || (b.communityAvg ?? 0) - (a.communityAvg ?? 0));
    return arr;
  }, [items, sortMode, statsById, taste]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: fgLow, fontSize: 12 }}>
        {tr({ ko: "진행 중인 전시를 불러오는 중입니다...", en: "Loading exhibitions on now..." })}
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
          {tr({ ko: "지금 진행 중인 전시가 없습니다.", en: "No exhibitions on right now." })}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 8 }}>
          {sortedAll.map((ex, idx) => (
            <motion.div
              // Keyed by the exhibition, not its position: live ratings re-sort
              // the list, and a position key would remount the card and close
              // a review sheet someone has open on it.
              key={ex.id}
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
                <button
                  type="button"
                  aria-label={tr({ ko: "좋아요", en: "Like" })}
                  aria-pressed={isLiked(ex.id)}
                  title={tr({ ko: "좋아요", en: "Like" })}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLike(ex);
                  }}
                  style={{
                    // No disc or border behind the heart; a soft shadow keeps
                    // the outline readable on light posters.
                    position: "absolute", bottom: 4, right: 4,
                    width: 32, height: 32, padding: 0,
                    border: "none", background: "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))",
                  }}
                >
                  <LikeIcon liked={isLiked(ex.id)} size={18} strokeWidth={2.2} color="#D4A547" emptyColor="#fff" />
                </button>
              </div>
              <div style={{ padding: "10px 8px", backgroundColor: t ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: fgLow, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{String(ex.venue || "")}</div>
                  {ex.tasteMatch !== undefined && (
                    <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 10, fontWeight: 600, color: t ? "#8A6B1F" : "#D4A547" }}>
                      {tr({ ko: `취향 ${ex.tasteMatch}%`, en: `${ex.tasteMatch}% match` })}
                    </span>
                  )}
                </div>
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
                {/* The poster carries only the heart; the shared rating sits under the dates. */}
                <div style={{ display: "flex", marginTop: 7, minWidth: 0 }}>
                  <RatingEmblems subject={{ kind: "exhibition", id: ex.id }} title={ex.title} subtitle={ex.venue} size={11} color={fgMed} />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {selectedEx && (
        <NearbyExhibitionModal
          ex={selectedEx}
          isLight={t}
          language={language}
          liked={isLiked(selectedEx.id)}
          onToggleLike={() => toggleLike(selectedEx)}
          onOpenMuseum={museumOpener(selectedEx)}
          onClose={() => setSelectedEx(null)}
        />
      )}
    </div>
  );
}
