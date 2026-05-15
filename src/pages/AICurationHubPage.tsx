import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, MapPin, Calendar, X,
  Heart, Navigation, Clock, Star, BookmarkPlus, MessageCircle, ShoppingBag, Shuffle, RotateCw, BookOpen
} from "lucide-react";
import WeeklyCurationTab from '../components/WeeklyCurationTab';
import { useAuth } from '../contexts/AuthContext';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { exhibitions } from '../data/exhibitions';
import { ArtworkLightbox } from '../components/ArtworkLightbox';
import { ProductModal } from '../components/ProductModal';
import CommentModal from '../components/CommentModal';
import { PlaylistModal } from '../components/PlaylistModal';
import { ExpandableActionMenu } from '../components/ExpandableActionMenu';
import { createFirebaseWebPort } from '../adapters/firebaseWebAdapter';
import { useLanguage } from "../contexts/LanguageContext";
import { NO_IMAGE_PLACEHOLDER_DARK } from '../utils/noImagePlaceholder';
import { localizeCountryName } from "../i18n/geoLocalization";
import { getExhibitionDisplayDescription, getExhibitionDisplayTitle } from "../i18n/exhibitionLocalization";
import { getMuseumDisplayDescription, getMuseumDisplayName } from "../i18n/museumLocalization";
import type { RecommendationMode, RecommendationResponse, RecommendedArtwork } from "../types/Recommendation";

const WORKER = 'https://armin-semantic-search.armin-art.workers.dev';
const firebaseWebPort = createFirebaseWebPort();

type RecommendationCardItem = RecommendedArtwork & Record<string, any> & {
  title?: string;
  venue?: string;
  museum?: string;
  country?: string;
  period?: string;
  description?: string;
  matchScore?: number | null;
  matchPct?: number | null;
  sourceCollection?: string;
  officialUrl?: string;
  detailUrl?: string;
  isArtwork?: boolean;
  distance?: number;
  daysLeft?: number;
  communityAvg?: number;
  finalScore?: number;
};

type WorkerRecommendationRow = Partial<RecommendedArtwork> & Record<string, any> & {
  i?: string;
  n?: string;
  a?: string;
  m?: string;
  e?: string;
  c?: string;
  d?: string;
  u?: string;
  y?: string | number;
  desc?: string;
  museum?: string;
  venue?: string;
  imageUrl?: string;
  sourceCollection?: string;
  officialUrl?: string;
  sourceUrl?: string;
  link?: string;
  year?: string | number;
};

type LikedArtworkRecord = {
  id?: string;
  artworkId?: string;
  semanticId?: string;
  artist?: string;
  a?: string;
  museumName?: string;
  museum?: string;
  venue?: string;
  likedAt?: number | { seconds?: number };
};

// ─── 유틸 ──────────────────────────────────────────────────
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function cosineSim(a: number[] | null | undefined, b: number[] | null | undefined) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  return a.reduce((s, v, i) => s + v * b[i], 0);
}

function normalizeMetaKey(value: unknown) {
  if (!value) return '';
  return String(value).trim().toLowerCase();
}

function normalizeArtworkIdForFirestore(value: unknown) {
  return String(value ?? '').trim().replace(/\//g, '__');
}

const museumCountryIndex = (() => {
  const museumToCountry = new Map<string, string>();
  const collectionToCountry = new Map<string, string>();

  for (const museum of exhibitions as unknown as Array<Record<string, unknown>>) {
    const country = String(museum?.country || '');
    const keys = [museum?.id, museum?.slug, museum?.name, museum?.name_en].filter(Boolean);
    for (const key of keys) {
      museumToCountry.set(normalizeMetaKey(key), country);
    }

    for (const p of ((museum?.permanentExhibitions || []) as Array<Record<string, unknown>>)) {
      const collectionKeys = [
        p?.id,
        typeof p?.collectionFile === 'string' ? p.collectionFile.replace(/\.json$/i, '') : '',
      ].filter(Boolean);
      for (const cKey of collectionKeys) {
        collectionToCountry.set(normalizeMetaKey(cKey), country);
      }
    }
  }

  return { museumToCountry, collectionToCountry };
})();

function resolveCountryFromMeta(museumName: unknown, collectionId: unknown) {
  const mKey = normalizeMetaKey(museumName);
  if (mKey && museumCountryIndex.museumToCountry.has(mKey)) {
    return museumCountryIndex.museumToCountry.get(mKey) || '';
  }

  const cKey = normalizeMetaKey(collectionId);
  if (cKey && museumCountryIndex.collectionToCountry.has(cKey)) {
    return museumCountryIndex.collectionToCountry.get(cKey) || '';
  }

  return '';
}

function buildSearchUrl(query: unknown) {
  return `https://www.google.com/search?q=${encodeURIComponent(String(query || ''))}`;
}

function resolveExhibitionDetailUrl(museumName: unknown, title: unknown, rawUrl: unknown) {
  const trimmedUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!trimmedUrl) {
    return buildSearchUrl(`${museumName || ''} ${title || ''} 전시`);
  }

  if (/mmca\.go\.kr\/exhibitions\/progressList\.do/i.test(trimmedUrl)) {
    return buildSearchUrl(`${museumName || 'MMCA'} ${title || ''} 전시`);
  }

  return trimmedUrl;
}

function resolveArtworkDetailUrl(title: unknown, artist: unknown, museumName: unknown, rawUrl: unknown) {
  const trimmedUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (trimmedUrl) return trimmedUrl;
  return buildSearchUrl(`${title || ''} ${artist || ''} ${museumName || ''} artwork`);
}

type Translator = (copy: { ko: string; en: string }) => string;

type ExhibitionDetailProps = {
  ex: RecommendationCardItem | null;
  t: boolean;
  bg: string;
  fg: string;
  fgMed: string;
  fgLow: string;
  fgFaint: string;
  divider: string;
  imgFilter: string;
  onClose: () => void;
  isArtwork?: boolean;
  tr: Translator;
  language: string;
};

type CurationTabProps = {
  t: boolean;
  language: string;
  tr: Translator;
  fg: string;
  fgLow: string;
  fgMed: string;
  fgFaint: string;
  divider: string;
  imgFilter: string;
  onSelect: (ex: RecommendationCardItem) => void;
  userArtworks: RecommendationCardItem[];
  loading: boolean;
  likedArtworkIds: Set<string>;
  onToggleLike: (artwork: RecommendationCardItem) => void;
  onOpenProduct: (artwork: RecommendationCardItem) => void;
  onOpenComment: (artwork: RecommendationCardItem) => void;
  onOpenPlaylist: (artwork: RecommendationCardItem) => void;
  recommendMode: RecommendationMode;
  onChangeRecommendMode: (mode: RecommendationMode) => void;
  randomArtworks: RecommendationCardItem[];
  randomLoading: boolean;
  onRefreshRandom: (count?: number, append?: boolean) => void;
};

type NearbyTabProps = {
  t: boolean;
  fg: string;
  fgLow: string;
  fgFaint: string;
  divider: string;
  imgFilter: string;
  onSelect: (ex: RecommendationCardItem) => void;
  nearbyExhibitions: RecommendationCardItem[];
  loading: boolean;
  language: string;
  tr: Translator;
};

// ─── Exhibition Detail Sheet ────────────────────────────────
function ExhibitionDetail({ ex, t, bg, fg, fgMed, fgLow, fgFaint: _fgFaint, divider, imgFilter, onClose, isArtwork, tr, language }: ExhibitionDetailProps) {
  if (!ex) return null;
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
        style={{
          width: "100%", maxWidth: 640, height: "85dvh",
          backgroundColor: bg,
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          overflowY: "auto", display: "flex", flexDirection: "column",
          boxShadow: "0 -4px 32px rgba(0,0,0,0.4)",
          scrollbarWidth: "none", msOverflowStyle: "none"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style dangerouslySetInnerHTML={{ __html: `
          .no-scrollbars::-webkit-scrollbar { display: none; }
        `}} />
        <div className="no-scrollbars" style={{ 
          position: "absolute", top: 18, right: 18, zIndex: 10,
          width: 36, height: 36, borderRadius: "50%",
          backgroundColor: t ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.6)",
          backdropFilter: "blur(12px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", border: `1px solid ${divider}`,
        }} onClick={onClose}>
          <X size={16} color={fg} />
        </div>

        <div style={{ width: "100%", position: "relative", flexShrink: 0, backgroundColor: "#1a1a1a" }}>
          <img src={safeImg} alt={ex.title} style={{ width: "100%", height: "auto", display: "block", filter: imgFilter }} />
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to top, ${bg} 0%, transparent 30%)` }} />
        </div>

        <div style={{ padding: "0 24px 110px", marginTop: -20, position: "relative", zIndex: 5 }}>
          {ex.finalScore !== undefined && ex.finalScore !== null && (
            <div style={{ display: "inline-block", padding: "4px 9px", borderRadius: 999, backgroundColor: "#D4A547", color: "#000", fontSize: 10, fontWeight: 700, fontFamily: "'Space Mono', monospace", marginBottom: 16 }}>
              {tr({ ko: 'AI 모델 추천 등급', en: 'AI Recommendation Score' })} {(ex.finalScore / 20).toFixed(1)}
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.15em", color: fgMed, textTransform: "uppercase", marginBottom: 8 }}>
            {String(ex.venue || '')}
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: fg, lineHeight: 1.25, marginBottom: 20 }}>
            {ex.title}
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 28 }}>
            {ex.period && (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: t ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Calendar size={15} color={fgMed} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: fgLow, marginBottom: 2 }}>{isArtwork ? tr({ ko: '연도', en: 'Year' }) : tr({ ko: '기간', en: 'Date' })}</div>
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
                  <div style={{ fontSize: 10, color: fgLow, marginBottom: 2 }}>{tr({ ko: '거리', en: 'Distance' })}</div>
                  <div style={{ fontSize: 13, color: fg, fontWeight: 500 }}>{ex.distance}km</div>
                </div>
              </div>
            )}
            {ex.communityAvg !== undefined && ex.communityAvg !== null && (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: t ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Star size={15} color={fgMed} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: fgLow, marginBottom: 2 }}>{tr({ ko: '커뮤니티 평점', en: 'Community Rating' })}</div>
                  <div style={{ fontSize: 13, color: fg, fontWeight: 500 }}>{ex.communityAvg.toFixed(1)} / 5.0</div>
                </div>
              </div>
            )}
          </div>

          {ex.description && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: fgMed, textTransform: language === 'ko' ? 'none' : 'uppercase', marginBottom: 10 }}>{tr({ ko: '설명', en: 'About' })}</div>
              <p style={{ fontSize: 13, color: fgLow, lineHeight: 1.7 }}>
                {ex.description}
              </p>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 32 }}>
            <button style={{
              flex: 1, padding: "14px", borderRadius: 10, cursor: "pointer",
              backgroundColor: "#D4A547", color: "#000",
              border: "none", fontSize: 13, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }} onClick={() => {
              const targetUrl = ex.detailUrl || ex.officialUrl || (isArtwork
                ? resolveArtworkDetailUrl(ex.title, ex.artist, ex.venue, '')
                : resolveExhibitionDetailUrl(ex.venue, ex.title, ''));
              window.open(targetUrl, '_blank', 'noopener,noreferrer');
            }}>
              <Navigation size={14} />
              {tr({ ko: '자세히 보기', en: 'View Details' })}
            </button>

            <button style={{
              width: 48, height: 48, borderRadius: 10, cursor: "pointer", flexShrink: 0,
              backgroundColor: t ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.06)",
              border: "none", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Heart size={18} color={fg} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Curation Tab ───────────────────────────────────────────
function CurationTab({
  t,
  language,
  tr,
  fg,
  fgLow,
  fgMed,
  fgFaint: _fgFaint,
  divider,
  imgFilter,
  onSelect,
  userArtworks,
  loading,
  likedArtworkIds,
  onToggleLike,
  onOpenProduct,
  onOpenComment,
  onOpenPlaylist,
  recommendMode,
  onChangeRecommendMode,
  randomArtworks,
  randomLoading,
  onRefreshRandom,
}: CurationTabProps) {
  const isRandomMode = recommendMode === 'random';
  const isLoading = isRandomMode ? randomLoading : loading;
  const displayArtworks = isRandomMode ? randomArtworks : userArtworks;
  
  const [displayedCount, setDisplayedCount] = useState(15);
  const [observerNode, setObserverNode] = useState<HTMLDivElement | null>(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  useEffect(() => {
    setDisplayedCount(isMobile ? 15 : 24);
  }, [recommendMode, isMobile]);

  // Latest-state ref so the observer callback can read current props/state
  // without re-creating the observer on every parent render. Re-creating it
  // synchronously re-fired observe()'s initial callback against the still-
  // intersecting target, which looped setDisplayedCount → re-render → new
  // observer → fire → … and froze the page on iOS WebView.
  const intersectStateRef = useRef({
    isRandomMode,
    displayedCount,
    displayArtworksLength: displayArtworks.length,
    isMobile,
    randomLoading,
    onRefreshRandom,
  });
  intersectStateRef.current = {
    isRandomMode,
    displayedCount,
    displayArtworksLength: displayArtworks.length,
    isMobile,
    randomLoading,
    onRefreshRandom,
  };

  // Callback-ref pattern: depend on the actual DOM node rather than a useRef,
  // so the effect re-runs (and the observer attaches) when the target div
  // first mounts — including the case where the user switches from For You
  // (target hidden) to Random mode (target appears).
  useEffect(() => {
    if (!observerNode) return;

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      const s = intersectStateRef.current;
      if (s.isRandomMode && s.displayedCount >= s.displayArtworksLength) {
        if (s.randomLoading) return;
        setDisplayedCount(prev => prev + 12);
        s.onRefreshRandom(12, true);
      } else {
        setDisplayedCount(prev => Math.min(prev + (s.isMobile ? 12 : 24), s.displayArtworksLength));
      }
    }, { root: null, rootMargin: '400px 0px' });

    observer.observe(observerNode);
    return () => observer.disconnect();
  }, [observerNode]);

  const isInitialLoading = isLoading && (!displayArtworks || displayArtworks.length === 0);

  if (isInitialLoading) {
    return (
      <div style={{ padding: 80, display: 'flex', justifyContent: 'center' }}>
        <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke={fgMed} strokeWidth={2}>
          <style>{`@keyframes _hub_spin { 100% { transform: rotate(360deg); } }`}</style>
          <circle cx={12} cy={12} r={10} strokeOpacity={0.2} />
          <path d="M12 2 a10 10 0 0 1 10 10" strokeLinecap="round" style={{ transformOrigin: '12px 12px', animation: '_hub_spin 1s linear infinite' }} />
        </svg>
      </div>
    );
  }

  if (!displayArtworks || displayArtworks.length === 0) {
    if (!isRandomMode) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: fgLow, fontSize: 12 }}>
          {tr({ ko: '추천할 작품이 없습니다. 작품에 좋아요를 눌러 취향을 알려주세요!', en: 'No recommendations yet. Like artworks to train your taste.' })}
        </div>
      );
    }
    return (
      <div style={{ padding: 80, display: 'flex', justifyContent: 'center' }}>
        <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke={fgMed} strokeWidth={2}>
          <style>{`@keyframes _hub_spin { 100% { transform: rotate(360deg); } }`}</style>
          <circle cx={12} cy={12} r={10} strokeOpacity={0.2} />
          <path d="M12 2 a10 10 0 0 1 10 10" strokeLinecap="round" style={{ transformOrigin: '12px 12px', animation: '_hub_spin 1s linear infinite' }} />
        </svg>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 65 }}>
      {/* ── Highlight Section ── */}
      <div style={{
        position: "sticky",
        top: "calc(45px + env(safe-area-inset-top, 0px))",
        zIndex: 15,
        padding: "16px 20px 16px",
        backgroundColor: t ? "rgba(250,250,250,0.97)" : "rgba(8,8,8,0.97)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: `1px solid ${divider}`,
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 8,
              padding: 4,
              borderRadius: 10,
              background: t ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${divider}`,
            }}>
              <button
                onClick={() => onChangeRecommendMode('taste')}
                style={{
                  border: 'none',
                  background: recommendMode === 'taste' ? '#D4A547' : 'transparent',
                  color: recommendMode === 'taste' ? '#000' : fgLow,
                  borderRadius: 8,
                  padding: '10px 8px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  letterSpacing: '0.02em',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Sparkles size={12} strokeWidth={2.1} />
                {tr({ ko: '맞춤 추천', en: 'Taste Match' })}
              </button>

              <button
                onClick={() => onChangeRecommendMode('random')}
                style={{
                  border: 'none',
                  background: recommendMode === 'random' ? '#D4A547' : 'transparent',
                  color: recommendMode === 'random' ? '#000' : fgLow,
                  borderRadius: 8,
                  padding: '10px 8px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  letterSpacing: '0.02em',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Shuffle size={12} strokeWidth={2.1} />
                {tr({ ko: '랜덤 추천', en: 'Random Picks' })}
              </button>
            </div>

            <div style={{ position: 'relative', marginTop: 8, height: 2, backgroundColor: divider }}>
              <motion.div
                animate={{ left: recommendMode === 'taste' ? '0%' : '50%' }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                style={{ position: 'absolute', top: 0, width: '50%', height: '100%', backgroundColor: '#D4A547' }}
              />
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 20px" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", color: fg, display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          {isRandomMode ? <Shuffle size={16} color={t ? "#8A6B1F" : "#D4A547"} /> : <Sparkles size={16} color={t ? "#8A6B1F" : "#D4A547"} />}
          {isRandomMode
            ? tr({ ko: '완전 랜덤 추천', en: 'Pure Random Picks' })
            : tr({ ko: 'AI 취향 맞춤 추천', en: 'AI Taste Recommendations' })}
            
          {isRandomMode && (
            <button
              onClick={() => onRefreshRandom(36, false)}
              style={{
                marginLeft: 'auto',
                width: 32,
                height: 32,
                borderRadius: 8,
                border: `1px solid ${divider}`,
                background: t ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
                color: t ? 'rgba(0,0,0,0.74)' : '#D4A547',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0
              }}
              title={tr({ ko: '다시 뽑기', en: 'Reshuffle' })}
            >
              <RotateCw size={14} strokeWidth={2.4} color={t ? '#111' : '#D4A547'} />
              <span style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}>↻</span>
            </button>
          )}
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          {displayArtworks.slice(0, displayedCount).map((ex, idx) => (
            <motion.div
              key={ex.id + '-' + idx}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: (idx % 12) * 0.05 }}
            >
              <div
                style={{
                  display: "block", width: "100%", background: "none", border: "none", padding: 0,
                  textAlign: "left", cursor: "pointer"
                }}
                onClick={() => onSelect(ex)}
              >
                {/* Cover — poster ratio */}
                <div style={{ aspectRatio: "3/4", position: "relative", overflow: "hidden", borderRadius: 12, marginBottom: 8, backgroundColor: "#1a1a1a" }}>
                  <img src={ex.image || NO_IMAGE_PLACEHOLDER_DARK} alt={ex.title} style={{ width: "100%", height: "100%", objectFit: "cover", filter: imgFilter }} onError={(e) => { e.currentTarget.src = NO_IMAGE_PLACEHOLDER_DARK; }} />
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)" }} />
                  {typeof ex.matchScore === 'number' && (
                      <div style={{ position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)", padding: "4px 8px", borderRadius: 999, color: Number(ex.matchPct ?? 0) >= 90 ? "#D4A547" : "#fff", fontSize: 9, fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>
                      {(Math.max(0, Math.min(1, ex.matchScore)) * 100).toFixed(0)}%
                    </div>
                  )}

                  <ExpandableActionMenu
                    isMobile={isMobile}
                    isLiked={Boolean(likedArtworkIds?.has(String(ex.id)) || likedArtworkIds?.has(normalizeArtworkIdForFirestore(ex.id)))}
                    onToggleLike={(e) => onToggleLike(ex)}
                    onOpenProduct={(e) => onOpenProduct(ex)}
                    onOpenPlaylist={(e) => onOpenPlaylist(ex)}
                    iconSize={13}
                    buttonSize={29}
                  />
                </div>
                {/* Meta */}
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 10, color: fgLow, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {String(ex.museum || ex.venue || '')}{ex.country ? ` · ${localizeCountryName(ex.country, language as any)}` : ''}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: fg, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {ex.title}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: fgMed, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ex.artist || tr({ ko: '알 수 없는 작가', en: 'Unknown Artist' })}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
          {(isRandomMode || displayArtworks.length > displayedCount) && (
            <div ref={setObserverNode} style={{ height: "1px", gridColumn: "1 / -1", pointerEvents: "none" }} />
          )}
          {isLoading && displayArtworks.length > 0 && (
            <div style={{ gridColumn: "1 / -1", padding: 20, display: "flex", justifyContent: "center" }}>
              <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={fgMed} strokeWidth={2}>
                <circle cx={12} cy={12} r={10} strokeOpacity={0.2} />
                <path d="M12 2 a10 10 0 0 1 10 10" strokeLinecap="round" style={{ transformOrigin: "12px 12px", animation: "_hub_spin 1s linear infinite" }} />
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Nearby Tab ─────────────────────────────────────────────
function NearbyTab({ t, fg, fgLow, fgFaint, divider, imgFilter, onSelect, nearbyExhibitions, loading, language, tr }: NearbyTabProps) {
  const [sortMode, setSortMode] = useState("taste");

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: fgLow, fontSize: 12 }}>{tr({ ko: '주변 전시를 불러오는 중입니다...', en: 'Loading nearby exhibitions...' })}</div>;
  }

  const SORT_LABELS = [
    { id: "taste", label: tr({ ko: '취향맞춤순', en: 'Taste Match' }) },
    { id: "distance", label: tr({ ko: '거리순', en: 'Distance' }) },
    { id: "popular", label: tr({ ko: '평점순', en: 'Top Rated' }) },
    { id: "deadline", label: tr({ ko: '마감임박', en: 'Ending Soon' }) },
  ];

  const sortedAll = useMemo(() => {
    const arr = [...(nearbyExhibitions || [])];
    if (sortMode === "distance") arr.sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));
    else if (sortMode === "deadline") arr.sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
    else if (sortMode === "popular") arr.sort((a, b) => (b.communityAvg ?? 0) - (a.communityAvg ?? 0));
    else if (sortMode === "taste") arr.sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
    return arr;
  }, [nearbyExhibitions, sortMode]);

  return (
    <div style={{ padding: "0 20px 100px", marginTop: 24 }}>
      {/* ── Sub Navigator ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        <Clock size={11} color={fgFaint} style={{ marginRight: 2 }} />
        {SORT_LABELS.map((s) => {
          const isActive = sortMode === s.id;
          return (
            <button key={s.id} onClick={() => setSortMode(s.id)}
              style={{
                padding: "4px 11px", borderRadius: 999, fontSize: 10, fontWeight: isActive ? 600 : 400,
                cursor: "pointer", flexShrink: 0, border: "none", transition: "all 0.15s",
                backgroundColor: isActive ? "#D4A547" : (t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.07)"),
                color: isActive ? "#000" : fgLow,
              }}>{s.label}</button>
          );
        })}
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: fgFaint, marginLeft: "auto", flexShrink: 0 }}>{sortedAll.length}{language === 'ko' ? '개' : ''}</span>
      </div>

      {/* 3-column grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {sortedAll.map((ex, idx) => (
          <motion.div
            key={ex.id + '-' + idx}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + idx * 0.03 }}
            onClick={() => onSelect(ex)}
            style={{ borderRadius: 12, overflow: "hidden", cursor: "pointer", border: `1px solid ${divider}`, padding: 0, textAlign: "left" }}
          >
            {/* Cover */}
            <div style={{ aspectRatio: "3/4", position: "relative", overflow: "hidden", backgroundColor: "#1a1a1a" }}>
              <img src={ex.image || NO_IMAGE_PLACEHOLDER_DARK} alt={ex.title} style={{ width: "100%", height: "100%", objectFit: "cover", filter: imgFilter }} onError={(e) => { e.currentTarget.src = NO_IMAGE_PLACEHOLDER_DARK; }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 40%)" }} />
              
              {/* Badges UI - Bottom Right */}
              <div style={{ position: "absolute", bottom: 8, right: 8, display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
                {ex.finalScore !== null && ex.finalScore !== undefined && (
                   <span style={{ background: "rgba(212,165,71,0.95)", color: "#000", padding: "3px 6px", borderRadius: 4, fontSize: 9.5, fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>
                     {tr({ ko: '예상', en: 'Pred' })} {(ex.finalScore / 20).toFixed(1)}
                   </span>
                )}
                {ex.communityAvg !== null && ex.communityAvg !== undefined && (
                   <span style={{ background: "rgba(255,255,255,0.9)", color: "#000", padding: "3px 6px", borderRadius: 4, fontSize: 9.5, fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>
                     {tr({ ko: '평점', en: 'Rate' })} {(ex.communityAvg).toFixed(1)}
                   </span>
                )}
              </div>
            </div>
            {/* Info */}
            <div style={{ padding: "10px 8px", backgroundColor: t ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)" }}>
              <div style={{ fontSize: 10, color: fgLow, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(ex.venue || '')}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: fg, lineHeight: 1.25, marginBottom: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{ex.title}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: fgFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ex.period}</div>
                {ex.distance !== undefined && (
                  <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Navigation size={9} strokeWidth={1.75} style={{ color: fgFaint }} />
                    <span style={{ fontSize: 9, color: fgFaint }}>{ex.distance}km</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────
export default function AICurationHubPage() {
  const { language } = useLanguage();
  const tr = useCallback((copy: { ko: string; en: string }) => (language === 'ko' ? copy.ko : copy.en), [language]);

  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem('homeTheme') !== 'light'; } catch { return true; }
  });

  useEffect(() => {
    const updateTheme = () => {
      try { setIsDark(localStorage.getItem('homeTheme') !== 'light'); } catch { setIsDark(true); }
    };
    window.addEventListener('storage', updateTheme);
    window.addEventListener('theme-changed', updateTheme);
    return () => {
      window.removeEventListener('storage', updateTheme);
      window.removeEventListener('theme-changed', updateTheme);
    };
  }, []);

  const t = !isDark;
  const bg      = t ? "#FAFAFA" : "#080808";
  const fg      = t ? "rgba(0,0,0,0.92)" : "rgba(244,241,234,0.96)";
  const fgMed   = t ? "rgba(0,0,0,0.72)" : "rgba(244,241,234,0.82)";
  const fgLow   = t ? "rgba(0,0,0,0.58)" : "rgba(244,241,234,0.64)";
  const fgFaint = t ? "rgba(0,0,0,0.36)" : "rgba(244,241,234,0.40)";
  const divider = t ? "rgba(0,0,0,0.08)" : "rgba(244,241,234,0.08)";
  const stickyBg = t ? "rgba(250,250,250,0.97)" : "rgba(8,8,8,0.97)";
  const imgFilter = "none";

  const [searchParams] = useSearchParams();
  // `preview` is the admin-side deep-link from /admin/weekly's "Preview"
  // button — same Weekly-tab landing as `weekly` / `special`, just fed by
  // the proposals JSON instead of the published one.
  const initialTab: "curation" | "nearby" | "weekly" =
    searchParams.get('weekly') ||
    searchParams.get('special') ||
    searchParams.get('preview')
      ? 'weekly'
      : 'curation';
  const [activeTab, setActiveTab] = useState<"curation" | "nearby" | "weekly">(initialTab);

  // If the URL gains a deep-link param after mount (e.g. from in-app
  // navigation), jump to the weekly tab. Pure presence-check; we leave
  // tab control to the user otherwise.
  useEffect(() => {
    if (
      searchParams.get('weekly') ||
      searchParams.get('special') ||
      searchParams.get('preview')
    ) {
      setActiveTab('weekly');
    }
  }, [searchParams]);
  const [selectedEx, setSelectedEx] = useState<RecommendationCardItem | null>(null);
  const [recommendMode, setRecommendMode] = useState<RecommendationMode>('taste');

  // ─── Data Fetching ───
  const { user } = useAuth();
  const [userArtworks, setUserArtworks] = useState<RecommendationCardItem[]>([]);
  const [curationLoading, setCurationLoading] = useState(true);
  const [randomArtworks, setRandomArtworks] = useState<RecommendationCardItem[]>([]);
  const [randomLoading, setRandomLoading] = useState(false);
  const [randomWorkerReady, setRandomWorkerReady] = useState(false);
  const randomWorkerRef = useRef<Worker | null>(null);
  const randomAppendRef = useRef(false);
  const randomLoadingRef = useRef(false);

  const [nearbyExhibitions, setNearbyExhibitions] = useState<RecommendationCardItem[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(true);

  const [lightboxArtwork, setLightboxArtwork] = useState<RecommendationCardItem | null>(null);
  const [likedArtworkIds, setLikedArtworkIds] = useState<Set<string>>(new Set());
  const [commentArtwork, setCommentArtwork] = useState<RecommendationCardItem | null>(null);
  const [productArtwork, setProductArtwork] = useState<RecommendationCardItem | null>(null);
  const [playlistArtwork, setPlaylistArtwork] = useState<RecommendationCardItem | null>(null);

  const [tasteVector] = useState<number[] | null>(null);
  const [exhStatsMap, setExhStatsMap] = useState<Record<string, any>>({});
  const [statsLoaded, setStatsLoaded] = useState(false);

  const mapWorkerRandomArtwork = useCallback((row: WorkerRecommendationRow, index: number): RecommendationCardItem => {
    const img = String(row.i || row.image || row.imageUrl || row.url || '');
    const title = String(row.n || row.name || 'Untitled');
    const artist = String(row.a || row.artist || 'Unknown Artist');
    const museum = String(row.m || row.museumName || row.venue || '');
    const sourceCollection = String(row.e || row.sourceCollection || row.exhibitionId || '');
    const country = String(row.c || row.country || resolveCountryFromMeta(museum, sourceCollection));
    const rawUrl = String(row.u || row.sourceUrl || row.officialUrl || row.url || '');

    return {
      id: String(row.id || `random-${index}`),
      title,
      artist,
      venue: museum || 'Unknown Museum',
      museum,
      country,
      period: row.d || row.date || row.y || row.year || '',
      image: img,
      description: row.desc || '',
      matchScore: null,
      matchPct: null,
      sourceCollection,
      officialUrl: rawUrl,
      detailUrl: resolveArtworkDetailUrl(title, artist, museum, rawUrl),
      isArtwork: true,
    };
  }, []);

  const requestRandomArtworks = useCallback((count = 36, append = false) => {
    if (!randomWorkerRef.current || !randomWorkerReady || randomLoadingRef.current) return;
    randomLoadingRef.current = true;
    setRandomLoading(true);
    randomAppendRef.current = append;
    randomWorkerRef.current.postMessage({ type: 'GET_RANDOM_ARTWORKS', count, onlyWithImage: true });
  }, [randomWorkerReady]);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/search.worker.ts', import.meta.url), { type: 'module' });
    randomWorkerRef.current = worker;

    worker.onmessage = (event: MessageEvent) => {
      const { type, results, count } = event.data || {};
      if (type === 'LOAD_PROGRESS') {
        // Random Picks only needs a sample to be useful — mark the worker
        // ready as soon as the first chunk is in memory (~12K items in
        // ~1-3 s on mobile) instead of blocking on the full 16-chunk
        // ~180 MB load that finishes in ~30-60 s. Subsequent chunks expand
        // the pool transparently. Threshold > 100 guards against firing
        // when allArtworks is still effectively empty.
        if (typeof count === 'number' && count > 100) {
          setRandomWorkerReady(prev => prev || true);
        }
        return;
      }
      if (type === 'LOAD_COMPLETE') {
        setRandomWorkerReady(true);
        return;
      }

      if (type === 'RANDOM_ARTWORKS') {
        const mapped = (Array.isArray(results) ? results : [])
          .map((row: WorkerRecommendationRow, index: number) => mapWorkerRandomArtwork(row, index))
          .filter((item: RecommendationCardItem) => typeof item.image === 'string' && item.image.trim().length > 0);
        setRandomArtworks(prev => randomAppendRef.current ? [...prev, ...mapped] : mapped);
        setRandomLoading(false);
        randomLoadingRef.current = false;
      }
    };

    worker.postMessage({ type: 'LOAD' });

    return () => {
      worker.terminate();
      randomWorkerRef.current = null;
    };
  }, [mapWorkerRandomArtwork]);

  useEffect(() => {
    if (recommendMode !== 'random' || !randomWorkerReady) return;
    if (randomArtworks.length > 0) return;
    requestRandomArtworks(36);
  }, [recommendMode, randomArtworks.length, randomWorkerReady, requestRandomArtworks]);

  const normalizeArtworkForAction = useCallback((artwork: RecommendationCardItem) => ({
    id: String(artwork?.id || ''),
    artworkId: String(artwork?.id || ''),
    title: artwork?.title || artwork?.name || 'Untitled',
    name: artwork?.title || artwork?.name || 'Untitled',
    artist: artwork?.artist || 'Unknown',
    image: artwork?.image || artwork?.i || '',
    i: String(artwork?.image || artwork?.i || ''),
    year: String(artwork?.period || artwork?.year || ''),
    museumName: artwork?.museum || artwork?.venue || '',
    country: artwork?.country || '',
    sourceCollection: artwork?.sourceCollection || '',
    officialUrl: artwork?.officialUrl || artwork?.detailUrl || '',
  }), []);

  const handleToggleArtworkLike = useCallback(async (artwork: RecommendationCardItem) => {
    if (!user) return;
    const normalized = normalizeArtworkForAction(artwork);
    const rawArtworkId = String(normalized.id || '').trim();
    if (!rawArtworkId) return;
    const safeArtworkId = normalizeArtworkIdForFirestore(rawArtworkId);

    try {
      const alreadyLiked = likedArtworkIds.has(rawArtworkId) || likedArtworkIds.has(safeArtworkId);

      if (alreadyLiked) {
        await firebaseWebPort.likes.removeLikedArtwork(user.uid, rawArtworkId);
        setLikedArtworkIds((prev) => {
          const next = new Set(prev);
          next.delete(rawArtworkId);
          next.delete(safeArtworkId);
          return next;
        });
      } else {
        await firebaseWebPort.likes.setLikedArtwork(user.uid, rawArtworkId, {
          artworkId: rawArtworkId,
          title: normalized.title,
          name: normalized.name,
          artist: normalized.artist,
          image: normalized.image,
          i: normalized.image,
          year: normalized.year,
          museumName: normalized.museumName,
          country: normalized.country,
          sourceCollection: normalized.sourceCollection,
          officialUrl: normalized.officialUrl,
          likedAt: Date.now(),
        });
        setLikedArtworkIds((prev) => {
          const next = new Set(prev);
          next.add(rawArtworkId);
          next.add(safeArtworkId);
          return next;
        });
      }
    } catch (error) {
      console.error('Failed to toggle artwork like', error);
    }
  }, [likedArtworkIds, normalizeArtworkForAction, user]);

  // Fetch 'For You' artworks
  useEffect(() => {
    const fetchArtworks = async () => {
      if (!user) {
        setLikedArtworkIds(new Set());
        setCurationLoading(false);
        return;
      }
      try {
        const db = getFirestore();
        const snap = await getDocs(collection(db, `users/${user.uid}/liked_artworks`));
        const likedData: LikedArtworkRecord[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as LikedArtworkRecord));
        const likedIdsForUi = new Set<string>();
        likedData.forEach((item: LikedArtworkRecord) => {
          const docId = String(item?.id || '').trim();
          const rawArtworkId = String(item?.artworkId || item?.semanticId || '').trim();
          if (docId) likedIdsForUi.add(docId);
          if (rawArtworkId) likedIdsForUi.add(rawArtworkId);
          if (rawArtworkId) likedIdsForUi.add(normalizeArtworkIdForFirestore(rawArtworkId));
        });
        setLikedArtworkIds(likedIdsForUi);

        const rawCandidateIds = Array.from(new Set(
          likedData.flatMap((item: LikedArtworkRecord) => [
            item?.semanticId,
            item?.artworkId,
            item?.id,
            typeof item?.id === 'string' ? item.id.replace(/__/g, '/') : null,
          ]).filter((value: unknown) => value !== null && value !== undefined && String(value).trim() !== '')
            .map((value: unknown) => String(value).trim())
        ));

        if (rawCandidateIds.length < 1) {
          setCurationLoading(false);
          return;
        }

        const likedIds = rawCandidateIds;

        const rankedSeedCandidates = likedData
          .map((item: LikedArtworkRecord) => {
            const seedId = String(item?.semanticId || item?.artworkId || item?.id || '').trim();
            const artistKey = normalizeMetaKey(item?.artist || item?.a || 'unknown');
            const museumKey = normalizeMetaKey(item?.museumName || item?.museum || item?.venue || 'unknown');
            const likedAtValue = item?.likedAt;
            const likedAtMs =
              typeof likedAtValue === 'object' && likedAtValue !== null && 'seconds' in likedAtValue
                ? Number((likedAtValue as { seconds?: number }).seconds || 0) * 1000
                : Number(likedAtValue || 0) || 0;
            return { seedId, artistKey, museumKey, likedAtMs };
          })
          .filter((item: { seedId: string }) => item.seedId.length > 0)
          .sort((a: { likedAtMs: number }, b: { likedAtMs: number }) => b.likedAtMs - a.likedAtMs);

        const diverseSeeds: string[] = [];
        const seenSeed = new Set<string>();
        const seenArtist = new Map<string, number>();
        const seenMuseum = new Map<string, number>();

        for (const candidate of rankedSeedCandidates) {
          if (seenSeed.has(candidate.seedId)) continue;
          const aCount = seenArtist.get(candidate.artistKey) || 0;
          const mCount = seenMuseum.get(candidate.museumKey) || 0;
          if (aCount >= 2 || mCount >= 3) continue;

          seenSeed.add(candidate.seedId);
          seenArtist.set(candidate.artistKey, aCount + 1);
          seenMuseum.set(candidate.museumKey, mCount + 1);
          diverseSeeds.push(candidate.seedId);
          if (diverseSeeds.length >= 12) break;
        }

        if (diverseSeeds.length < 8) {
          for (const id of likedIds) {
            if (seenSeed.has(id)) continue;
            seenSeed.add(id);
            diverseSeeds.push(id);
            if (diverseSeeds.length >= 12) break;
          }
        }

        let fetchedResults: WorkerRecommendationRow[] = [];

        try {
            const recRes = await fetch(`${WORKER}/recommend`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: user.uid, likedIds: likedIds.slice(-80), limit: 90 }),
            });
            if (recRes.ok) {
               const data = (await recRes.json()) as Partial<RecommendationResponse>;
               if (Array.isArray(data.results)) fetchedResults = data.results as WorkerRecommendationRow[];
            }
        } catch (_error) {}

             const merged = new Map<string, { row: WorkerRecommendationRow; score: number; freq: number }>();
             const addMergedRow = (row: WorkerRecommendationRow, boost: number) => {
          const rowId = String(row?.id || '');
          if (!rowId) return;
          const score = Number(row?.score || 0) + boost;
          const prev = merged.get(rowId);
          if (!prev) {
            merged.set(rowId, { row, score, freq: 1 });
          } else {
            prev.score += score;
            prev.freq += 1;
            if (score > Number(prev.row?.score || 0)) prev.row = row;
          }
        };

        fetchedResults.forEach((row: WorkerRecommendationRow, rank: number) => {
          const rankBoost = Math.max(0, 0.02 - rank * 0.0005);
          addMergedRow(row, rankBoost);
        });

        if (likedIds.length > 0) {
          const recentSeeds = diverseSeeds.length > 0 ? diverseSeeds : likedIds.slice(-12).reverse();
          const seededResponses = await Promise.allSettled(
            recentSeeds.map((seedId) => fetch(`${WORKER}/recommend-by-id`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: seedId, limit: 24 }),
            }))
          );

          for (const res of seededResponses) {
            if (res.status !== 'fulfilled' || !res.value.ok) continue;
            try {
              const payload = await res.value.json();
              const rows = Array.isArray(payload?.results) ? (payload.results as WorkerRecommendationRow[]) : [];
              rows.forEach((row: WorkerRecommendationRow, rank: number) => {
                const rankBoost = Math.max(0, 0.03 - rank * 0.001);
                addMergedRow(row, rankBoost);
              });
            } catch (_seedError) {
              continue;
            }
          }
        }

        fetchedResults = Array.from(merged.values())
          .sort((a, b) => (b.score + b.freq * 0.02) - (a.score + a.freq * 0.02))
          .map((entry) => entry.row);

        if (fetchedResults && fetchedResults.length > 0) {
           const mappedArtworks: RecommendationCardItem[] = fetchedResults.map((r, i) => {
             const img = String(r.i || r.image || r.imageUrl || r.url || '');
             const title = String(r.n || r.name || 'Untitled');
             const artist = String(r.a || r.artist || 'Unknown');
             const museum = String(r.m || r.museum || r.venue || '');
             const sourceCollection = String(r.e || r.sourceCollection || '');
             const country = String(r.c || r.country || resolveCountryFromMeta(museum, sourceCollection));
             const rawUrl = String(r.u || r.officialUrl || r.sourceUrl || r.link || '');
             return {
               id: String(r.id || i),
               title,
               artist,
               venue: museum || 'Unknown Museum',
               museum,
               country,
               period: String(r.year || r.y || ''),
               image: img,
               description: r.desc || '',
               matchScore: Number(r.score || 0),
               matchPct: Math.round(Math.max(0, Math.min(1, Number(r.score || 0))) * 100),
               sourceCollection,
               officialUrl: rawUrl,
               detailUrl: resolveArtworkDetailUrl(title, artist, museum, rawUrl),
               isArtwork: true
             };
           }).filter(x => x && typeof x.image === 'string' && x.image.trim().length > 0);
           
           const groupedByArtist = new Map<string, RecommendationCardItem[]>();
           for (const item of mappedArtworks) {
             const artistKey = normalizeMetaKey(item.artist || 'unknown');
             if (!groupedByArtist.has(artistKey)) groupedByArtist.set(artistKey, []);
             groupedByArtist.get(artistKey)!.push(item);
           }

           const interleaved: RecommendationCardItem[] = [];
           let hasRemaining = true;
           while (hasRemaining && interleaved.length < 300) {
             hasRemaining = false;
             for (const [, rows] of groupedByArtist) {
               if (!rows.length) continue;
               const nextRow = rows.shift();
               if (!nextRow) continue;
               interleaved.push(nextRow);
               hasRemaining = true;
               if (interleaved.length >= 300) break;
             }
           }

           // Remove duplicates and enforce diversity
           const unique = [];
           const seen = new Set();
            const artistCounter = new Map();
            const museumCounter = new Map();
           for (const item of interleaved) {
              if (seen.has(item.id) || seen.has(item.title)) continue;
              const artistKey = normalizeMetaKey(item.artist || 'unknown');
              const museumKey = normalizeMetaKey(item.museum || item.venue || 'unknown');
              // Relax diversity constraints slightly for a larger pool
              if ((artistCounter.get(artistKey) || 0) >= 6) continue;
              if ((museumCounter.get(museumKey) || 0) >= 20) continue;

              seen.add(item.id); seen.add(item.title);
              artistCounter.set(artistKey, (artistCounter.get(artistKey) || 0) + 1);
              museumCounter.set(museumKey, (museumCounter.get(museumKey) || 0) + 1);
              unique.push(item);
              if (unique.length >= 200) break;
           }
           setUserArtworks(unique);
        }

      } catch (e) {
        console.error("Failed to fetch user artworks", e);
      } finally {
        setCurationLoading(false);
      }
    };
    fetchArtworks();
  }, [user]);

  // Fetch Community Exhibition Stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const db = getFirestore();
        const snap = await getDocs(collection(db, 'exhibition_stats'));
        const smap: Record<string, any> = {};
        snap.forEach(d => {
            smap[d.id] = d.data();
        });
        setExhStatsMap(smap);
      } catch (e: unknown) {
        if ((e as { code?: string })?.code !== 'permission-denied') {
          console.error("Failed to fetch exhibition stats", e);
        }
      } finally {
        setStatsLoaded(true);
      }
    };
    fetchStats();
  }, []);

  // Fetch 'Nearby' Exhibitions
  useEffect(() => {
    if (!statsLoaded) return; // wait for stats
    setNearbyLoading(true);
    let uLat: number | null = null;
    let uLng: number | null = null;

    const processExhibitions = () => {
        const results = [];
        for (const m of exhibitions as any[]) {
          for (const e of (m.temporaryExhibitions || []) as any[]) {
                if (e.status === 'past') continue;
                let dist = undefined;
                if (uLat !== null && uLng !== null && m.latitude && m.longitude) {
                    dist = Math.round(haversineKm(uLat, uLng, m.latitude, m.longitude) * 10) / 10;
                }
                let daysLeft = 9999;
                if (e.endDate !== undefined && e.endDate !== "ongoing" && e.endDate !== "TBD") {
                    daysLeft = Math.ceil((new Date(e.endDate).getTime() - Date.now()) / 86400000);
                }

                // AI Expected Score & Community Avg
                let communityAvg = exhStatsMap[e.id]?.avgRating || 0.0;
                let finalScore = 0;
                
                if (tasteVector && e.coverEmbedding) {
                  const taste = cosineSim(tasteVector, e.coverEmbedding);
                    const ts = Math.round(Math.max(0, taste) * 100);
                    const ratingAdj = communityAvg > 0 ? (communityAvg - 3.0) * 5 : 0;
                    finalScore = Math.round(Math.min(100, Math.max(0, ts * 0.85 + ratingAdj * 0.15)));
                } else if (communityAvg > 0) {
                    finalScore = Math.round(Math.min(100, Math.max(0, 75 + (communityAvg - 3.0) * 5))); // fallback guestimate
                }

                const img = e.coverImage || '';
                const localizedTitle = getExhibitionDisplayTitle(e as any, language);
                const localizedMuseum = getMuseumDisplayName(m as any, language);
                const localizedDescription = getExhibitionDisplayDescription(e as any, language) || getMuseumDisplayDescription(m as any, language) || '';
                const localizedPeriod = e.endDate === "ongoing" || e.endDate === "TBD"
                  ? `${e.startDate} - ${tr({ ko: '상시', en: 'Ongoing' })}`
                  : `${e.startDate} - ${e.endDate}`;
                
                if (img) {
                    results.push({
                       id: e.id,
                       title: localizedTitle,
                       venue: localizedMuseum,
                       image: img,
                       period: localizedPeriod,
                       distance: dist,
                       daysLeft: daysLeft,
                       communityAvg,
                       finalScore,
                        officialUrl: e.officialUrl || e.url || '',
                        detailUrl: resolveExhibitionDetailUrl(localizedMuseum, localizedTitle, e.officialUrl || e.url || ''),
                       description: localizedDescription,
                       isArtwork: false
                    });
                }
            }
        }
        setNearbyExhibitions(results);
        setNearbyLoading(false);
    };

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            uLat = pos.coords.latitude;
            uLng = pos.coords.longitude;
            processExhibitions();
        }, () => {
            processExhibitions();
        });
    } else {
        processExhibitions();
    }
  }, [exhStatsMap, language, statsLoaded, tasteVector, tr]);

  const tabProps = { t, fg, fgLow, fgMed, fgFaint, divider, imgFilter, onSelect: setSelectedEx };

  return (
    <div style={{ width: "100%", height: "100dvh", overflowY: "auto", backgroundColor: bg, fontFamily: "'Space Grotesk', sans-serif", color: fg }}>
      
      {/* ── Header ── */}
      <div style={{ padding: "48px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
          <div style={{ width: 6, height: 6, backgroundColor: "#D4A547" }} />
          <span style={{ fontSize: 9, letterSpacing: "0.28em", textTransform: language === 'ko' ? 'none' : 'uppercase', color: fgFaint }}>{tr({ ko: '개인 큐레이션', en: 'Personal Curation' })}</span>
        </div>
        <h1 style={{ fontSize: "clamp(24px,6vw,36px)", letterSpacing: "-0.025em", color: fg, lineHeight: 1.15, marginBottom: 18, whiteSpace: 'nowrap' }}>
          {tr({ ko: 'AI 추천', en: 'AI Recommendation' })}
        </h1>
      </div>

      {/* ── Tab Switch ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, paddingTop: "env(safe-area-inset-top, 0px)", paddingLeft: 20, paddingRight: 20, backgroundColor: stickyBg, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
        <div style={{ position: 'relative', display: "flex", gap: 0, borderBottom: `1px solid ${divider}` }}>
          {([
            { id: "curation", label: tr({ ko: '나의 큐레이션', en: 'My Curation' }), icon: <Sparkles size={11} strokeWidth={2} /> },
            { id: "nearby",   label: tr({ ko: '주변 전시', en: 'Nearby' }),           icon: <MapPin size={11} strokeWidth={2} /> },
            { id: "weekly",   label: tr({ ko: '주간 큐레이션', en: 'Weekly' }),        icon: <BookOpen size={11} strokeWidth={2} /> },
          ]).map(({ id, label, icon }) => {
            const isActive = activeTab === id;
            return (
              <button key={id} onClick={() => setActiveTab(id as "curation" | "nearby" | "weekly")}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "14px 0", background: "none", border: "none",
                  cursor: "pointer", transition: "color 0.15s",
                  color: isActive ? fg : fgLow, fontSize: 12, fontWeight: isActive ? 600 : 400,
                }}>
                <span style={{ color: isActive ? (t ? "#8A6B1F" : "#D4A547") : fgFaint }}>{icon}</span>
                {label}
              </button>
            );
          })}
          <motion.div
            animate={{ left: activeTab === 'curation' ? '0%' : activeTab === 'nearby' ? '33.33%' : '66.67%' }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ position: 'absolute', bottom: -1, width: '33.33%', height: 2, backgroundColor: '#D4A547' }}
          />
        </div>
      </div>

      {/* ── Tab Content ── */}
      <AnimatePresence mode="wait">
        {activeTab === "curation" && (
          <motion.div key="curation"
            initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}>
            <CurationTab {...tabProps} language={language} tr={tr} userArtworks={userArtworks} loading={curationLoading}
               likedArtworkIds={likedArtworkIds}
               onToggleLike={(artwork: RecommendationCardItem) => { void handleToggleArtworkLike(artwork); }}
               onOpenProduct={(artwork: RecommendationCardItem) => setProductArtwork(normalizeArtworkForAction(artwork))}
               onOpenComment={(artwork: RecommendationCardItem) => setCommentArtwork(normalizeArtworkForAction(artwork))}
               onOpenPlaylist={(artwork: RecommendationCardItem) => setPlaylistArtwork(normalizeArtworkForAction(artwork))}
               recommendMode={recommendMode}
               onChangeRecommendMode={setRecommendMode}
               randomArtworks={randomArtworks}
               randomLoading={randomLoading}
               onRefreshRandom={(count = 36, append = false) => requestRandomArtworks(count, append)}
               onSelect={(ex: RecommendationCardItem) => {
                 if (ex.isArtwork) {
                   setLightboxArtwork(ex);
                 } else {
                   setSelectedEx(ex);
                 }
               }}
            />
          </motion.div>
        )}
        {activeTab === "nearby" && (
          <motion.div key="nearby"
            initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.2 }}>
            <NearbyTab {...tabProps} nearbyExhibitions={nearbyExhibitions} loading={nearbyLoading}
               language={language}
               tr={tr}
               onSelect={(ex: RecommendationCardItem) => setSelectedEx(ex)}
            />
          </motion.div>
        )}
        {activeTab === "weekly" && (
          <motion.div key="weekly"
            initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.2 }}>
            <WeeklyCurationTab
              t={t} fg={fg} fgMed={fgMed} fgLow={fgLow} fgFaint={fgFaint} divider={divider}
              language={language} tr={tr}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Exhibition/Artwork Detail ── */}
      <AnimatePresence>
        {selectedEx && (
          <ExhibitionDetail
            ex={selectedEx} t={t} bg={bg} fg={fg} fgMed={fgMed}
            fgLow={fgLow} fgFaint={fgFaint} divider={divider} imgFilter={imgFilter}
            onClose={() => setSelectedEx(null)}
            isArtwork={selectedEx.isArtwork}
            tr={tr}
            language={language}
          />
        )}
      </AnimatePresence>

      {/* ── Native Artwork Lightbox (For Curation) ── */}
      {lightboxArtwork && (
        <ArtworkLightbox 
          artwork={lightboxArtwork}
          isLiked={likedArtworkIds.has(String(lightboxArtwork?.id || ''))}
          onToggleLike={(event: React.MouseEvent, artwork: any) => {
            event.stopPropagation();
            void handleToggleArtworkLike(artwork || lightboxArtwork);
          }}
          onPurchase={(artwork: RecommendationCardItem) => setProductArtwork(normalizeArtworkForAction(artwork || lightboxArtwork))}
          onSaveToPlaylist={(artwork: RecommendationCardItem) => setPlaylistArtwork(normalizeArtworkForAction(artwork || lightboxArtwork))}
          onClose={() => setLightboxArtwork(null)}
        />
      )}

      {productArtwork && (
        <ProductModal
          artwork={{
            id: productArtwork.artworkId || productArtwork.id,
            name: productArtwork.title || productArtwork.name || 'Untitled',
            artist: productArtwork.artist || 'Unknown',
            year: Number(productArtwork.year) || 0,
            image: productArtwork.image || productArtwork.i || '',
            roomId: '',
            exhibitionName: productArtwork.museumName || productArtwork.venue || '',
            exhibitionTitle: '',
          }}
          onClose={() => setProductArtwork(null)}
          onSelectArtwork={(nextArtwork: RecommendationCardItem) => setProductArtwork(normalizeArtworkForAction(nextArtwork))}
        />
      )}

      {playlistArtwork && (
        <PlaylistModal
          isOpen={true}
          onClose={() => setPlaylistArtwork(null)}
          item={playlistArtwork}
          itemType="artwork"
        />
      )}

      {commentArtwork && (
        <CommentModal
          isOpen={true}
          onClose={() => setCommentArtwork(null)}
          artworkId={commentArtwork.id || commentArtwork.artworkId}
        />
      )}
    </div>
  );
}
