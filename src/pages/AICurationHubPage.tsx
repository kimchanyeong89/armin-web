import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, MapPin, Calendar, X,
  Heart, Navigation, Clock, Star, BookmarkPlus, MessageCircle, ShoppingBag, Shuffle, RefreshCcw
} from "lucide-react";
import { useAuth } from '../contexts/AuthContext';
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { exhibitions } from '../data/exhibitions';
import { ArtworkLightbox } from '../components/ArtworkLightbox';
import { ProductModal } from '../components/ProductModal';
import CommentModal from '../components/CommentModal';
import { PlaylistModal } from '../components/PlaylistModal';

const WORKER = 'https://armin-semantic-search.armin-art.workers.dev';

// ─── 유틸 ──────────────────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function cosineSim(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  return a.reduce((s, v, i) => s + v * b[i], 0);
}

function normalizeMetaKey(value) {
  if (!value) return '';
  return String(value).trim().toLowerCase();
}

function normalizeArtworkIdForFirestore(value: unknown) {
  return String(value ?? '').trim().replace(/\//g, '__');
}

const museumCountryIndex = (() => {
  const museumToCountry = new Map();
  const collectionToCountry = new Map();

  for (const museum of exhibitions) {
    const country = museum?.country || '';
    const keys = [museum?.id, museum?.slug, museum?.name, museum?.name_en].filter(Boolean);
    for (const key of keys) {
      museumToCountry.set(normalizeMetaKey(key), country);
    }

    for (const p of (museum?.permanentExhibitions || [])) {
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

function resolveCountryFromMeta(museumName, collectionId) {
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

function buildSearchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function resolveExhibitionDetailUrl(museumName, title, rawUrl) {
  const trimmedUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!trimmedUrl) {
    return buildSearchUrl(`${museumName || ''} ${title || ''} 전시`);
  }

  if (/mmca\.go\.kr\/exhibitions\/progressList\.do/i.test(trimmedUrl)) {
    return buildSearchUrl(`${museumName || 'MMCA'} ${title || ''} 전시`);
  }

  return trimmedUrl;
}

function resolveArtworkDetailUrl(title, artist, museumName, rawUrl) {
  const trimmedUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (trimmedUrl) return trimmedUrl;
  return buildSearchUrl(`${title || ''} ${artist || ''} ${museumName || ''} artwork`);
}

// ─── Exhibition Detail Sheet ────────────────────────────────
function ExhibitionDetail({ ex, t, bg, fg, fgMed, fgLow, fgFaint, divider, imgFilter, onClose, isArtwork }) {
  if (!ex) return null;
  const safeImg = ex.image || 'https://via.placeholder.com/400x500?text=No+Image';
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
            <div style={{ display: "inline-block", padding: "4px 9px", borderRadius: 999, backgroundColor: "#BFFF0A", color: "#000", fontSize: 10, fontWeight: 700, fontFamily: "'Space Mono', monospace", marginBottom: 16 }}>
              AI 모델 추천 등급 {(ex.finalScore / 20).toFixed(1)}
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.15em", color: fgMed, textTransform: "uppercase", marginBottom: 8 }}>
            {ex.venue}
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
                  <div style={{ fontSize: 10, color: fgLow, marginBottom: 2 }}>{isArtwork ? 'Year' : 'Date'}</div>
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
                  <div style={{ fontSize: 10, color: fgLow, marginBottom: 2 }}>Distance</div>
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
                  <div style={{ fontSize: 10, color: fgLow, marginBottom: 2 }}>Community Rating</div>
                  <div style={{ fontSize: 13, color: fg, fontWeight: 500 }}>{ex.communityAvg.toFixed(1)} / 5.0</div>
                </div>
              </div>
            )}
          </div>

          {ex.description && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: fgMed, textTransform: "uppercase", marginBottom: 10 }}>About</div>
              <p style={{ fontSize: 13, color: fgLow, lineHeight: 1.7 }}>
                {ex.description}
              </p>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 32 }}>
            <button style={{
              flex: 1, padding: "14px", borderRadius: 10, cursor: "pointer",
              backgroundColor: "#BFFF0A", color: "#000",
              border: "none", fontSize: 13, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }} onClick={() => {
              const targetUrl = ex.detailUrl || ex.officialUrl || (isArtwork
                ? resolveArtworkDetailUrl(ex.title, ex.artist, ex.venue, '')
                : resolveExhibitionDetailUrl(ex.venue, ex.title, ''));
              window.open(targetUrl, '_blank', 'noopener,noreferrer');
            }}>
              <Navigation size={14} />
              자세히 보기
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
  fg,
  fgLow,
  fgMed,
  fgFaint,
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
}) {
  const isRandomMode = recommendMode === 'random';
  const isLoading = isRandomMode ? randomLoading : loading;
  const displayArtworks = isRandomMode ? randomArtworks : userArtworks;

  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: fgLow, fontSize: 12 }}>
        {isRandomMode ? '랜덤 추천을 불러오는 중입니다...' : '취향 맞춤 추천을 불러오는 중입니다...'}
      </div>
    );
  }

  if (!displayArtworks || displayArtworks.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: fgLow, fontSize: 12 }}>
        {isRandomMode
          ? '랜덤 추천 결과가 없습니다. 다시 뽑기를 눌러보세요.'
          : '추천할 작품이 없습니다. 작품에 좋아요를 눌러 취향을 알려주세요!'}
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* ── Highlight Section ── */}
      <div style={{ padding: "32px 20px 48px", borderBottom: `1px solid ${divider}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
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
                  background: recommendMode === 'taste' ? '#BFFF0A' : 'transparent',
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
                맞춤 추천
              </button>

              <button
                onClick={() => onChangeRecommendMode('random')}
                style={{
                  border: 'none',
                  background: recommendMode === 'random' ? '#BFFF0A' : 'transparent',
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
                랜덤 추천
              </button>
            </div>

            <div style={{ position: 'relative', marginTop: 8, height: 2, backgroundColor: divider }}>
              <motion.div
                animate={{ left: recommendMode === 'taste' ? '0%' : '50%' }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                style={{ position: 'absolute', top: 0, width: '50%', height: '100%', backgroundColor: '#BFFF0A' }}
              />
            </div>
          </div>

          {isRandomMode && (
            <button
              onClick={onRefreshRandom}
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                border: `1px solid ${divider}`,
                background: t ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
                color: fg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
              }}
              title="다시 뽑기"
            >
              <RefreshCcw size={14} strokeWidth={2.2} />
            </button>
          )}
        </div>

        <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", color: fg, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          {isRandomMode ? <Shuffle size={16} color={t ? "#5A7800" : "#BFFF0A"} /> : <Sparkles size={16} color={t ? "#5A7800" : "#BFFF0A"} />}
          {isRandomMode ? '완전 랜덤 추천' : 'AI 취향 맞춤 추천'}
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          {displayArtworks.map((ex, idx) => (
            <motion.div
              key={ex.id + '-' + idx}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.08 }}
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
                  <img src={ex.image || 'https://via.placeholder.com/300x400?text=No+Image'} alt={ex.title} style={{ width: "100%", height: "100%", objectFit: "cover", filter: imgFilter }} onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/300x400?text=No+Image'; }} />
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)" }} />
                  {typeof ex.matchScore === 'number' && (
                    <div style={{ position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)", padding: "4px 8px", borderRadius: 999, color: ex.matchPct >= 90 ? "#BFFF0A" : "#fff", fontSize: 9, fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>
                      {(Math.max(0, Math.min(1, ex.matchScore)) * 100).toFixed(0)}%
                    </div>
                  )}

                  <div style={{ position: "absolute", right: 8, bottom: 8, display: "flex", justifyContent: "flex-end", gap: 6 }}>
                    <button
                      onClick={(event) => { event.stopPropagation(); onOpenProduct(ex); }}
                      style={{ width: 29, height: 29, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.58)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
                      title="굿즈 구매"
                    >
                      <ShoppingBag size={13} strokeWidth={2.1} />
                    </button>

                    <button
                      onClick={(event) => { event.stopPropagation(); onOpenComment(ex); }}
                      style={{ width: 29, height: 29, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.58)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
                      title="댓글"
                    >
                      <MessageCircle size={13} strokeWidth={2.1} />
                    </button>

                    <button
                      onClick={(event) => { event.stopPropagation(); onOpenPlaylist(ex); }}
                      style={{ width: 29, height: 29, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.58)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
                      title="플레이리스트"
                    >
                      <BookmarkPlus size={13} strokeWidth={2.2} />
                    </button>

                    <button
                      onClick={(event) => { event.stopPropagation(); onToggleLike(ex); }}
                      style={{ width: 29, height: 29, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.58)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
                      title="좋아요"
                    >
                      <Heart
                        size={14}
                        strokeWidth={2.2}
                        fill={(likedArtworkIds?.has(String(ex.id)) || likedArtworkIds?.has(normalizeArtworkIdForFirestore(ex.id))) ? "#BFFF0A" : "none"}
                        color={(likedArtworkIds?.has(String(ex.id)) || likedArtworkIds?.has(normalizeArtworkIdForFirestore(ex.id))) ? "#BFFF0A" : "#fff"}
                      />
                    </button>
                  </div>
                </div>
                {/* Meta */}
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 10, color: fgLow, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ex.museum || ex.venue}{ex.country ? ` · ${ex.country}` : ''}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: fg, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {ex.title}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: fgMed, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ex.artist || 'Unknown Artist'}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Nearby Tab ─────────────────────────────────────────────
function NearbyTab({ t, fg, fgLow, fgFaint, divider, imgFilter, onSelect, nearbyExhibitions, loading }) {
  const [sortMode, setSortMode] = useState("taste");

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: fgLow, fontSize: 12 }}>Loading Nearby...</div>;
  }

  const SORT_LABELS = [
    { id: "taste", label: "취향맞춤순" },
    { id: "distance", label: "거리순" },
    { id: "popular", label: "평점순" },
    { id: "deadline", label: "마감임박" },
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
                backgroundColor: isActive ? "#BFFF0A" : (t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.07)"),
                color: isActive ? "#000" : fgLow,
              }}>{s.label}</button>
          );
        })}
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: fgFaint, marginLeft: "auto", flexShrink: 0 }}>{sortedAll.length}개</span>
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
              <img src={ex.image || 'https://via.placeholder.com/300x400?text=No+Image'} alt={ex.title} style={{ width: "100%", height: "100%", objectFit: "cover", filter: imgFilter }} onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/300x400?text=No+Image'; }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 40%)" }} />
              
              {/* Badges UI - Bottom Right */}
              <div style={{ position: "absolute", bottom: 8, right: 8, display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
                {ex.finalScore !== null && ex.finalScore !== undefined && (
                   <span style={{ background: "rgba(191,255,10,0.95)", color: "#000", padding: "3px 6px", borderRadius: 4, fontSize: 9.5, fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>
                     예상 {(ex.finalScore / 20).toFixed(1)}
                   </span>
                )}
                {ex.communityAvg !== null && ex.communityAvg !== undefined && (
                   <span style={{ background: "rgba(255,255,255,0.9)", color: "#000", padding: "3px 6px", borderRadius: 4, fontSize: 9.5, fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>
                     평점 {(ex.communityAvg).toFixed(1)}
                   </span>
                )}
              </div>
            </div>
            {/* Info */}
            <div style={{ padding: "10px 8px", backgroundColor: t ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)" }}>
              <div style={{ fontSize: 10, color: fgLow, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ex.venue}</div>
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

  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark';
    localStorage.setItem('homeTheme', next);
    window.dispatchEvent(new Event('theme-changed'));
    setIsDark(!isDark);
  };

  const t = !isDark;
  const bg      = t ? "#FAFAFA" : "#080808";
  const fg      = t ? "rgba(0,0,0,0.88)" : "rgba(255,255,255,0.88)";
  const fgMed   = t ? "rgba(0,0,0,0.56)" : "rgba(255,255,255,0.56)";
  const fgLow   = t ? "rgba(0,0,0,0.36)" : "rgba(255,255,255,0.36)";
  const fgFaint = t ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.18)";
  const divider = t ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.06)";
  const stickyBg = t ? "rgba(250,250,250,0.97)" : "rgba(8,8,8,0.97)";
  const imgFilter = "none";

  const [activeTab, setActiveTab] = useState("curation");
  const [selectedEx, setSelectedEx] = useState(null);
  const [recommendMode, setRecommendMode] = useState<'taste' | 'random'>('taste');

  // ─── Data Fetching ───
  const { user } = useAuth();
  const [userArtworks, setUserArtworks] = useState([]);
  const [curationLoading, setCurationLoading] = useState(true);
  const [randomArtworks, setRandomArtworks] = useState<any[]>([]);
  const [randomLoading, setRandomLoading] = useState(false);
  const [randomWorkerReady, setRandomWorkerReady] = useState(false);
  const randomWorkerRef = useRef<Worker | null>(null);

  const [nearbyExhibitions, setNearbyExhibitions] = useState([]);
  const [nearbyLoading, setNearbyLoading] = useState(true);

  const [lightboxArtwork, setLightboxArtwork] = useState<any>(null);
  const [likedArtworkIds, setLikedArtworkIds] = useState<Set<string>>(new Set());
  const [commentArtwork, setCommentArtwork] = useState<any | null>(null);
  const [productArtwork, setProductArtwork] = useState<any | null>(null);
  const [playlistArtwork, setPlaylistArtwork] = useState<any | null>(null);

  const [tasteVector, setTasteVector] = useState(null);
  const [exhStatsMap, setExhStatsMap] = useState({});
  const [statsLoaded, setStatsLoaded] = useState(false);

  const mapWorkerRandomArtwork = useCallback((row: any, index: number) => {
    const img = row.i || row.image || row.imageUrl || row.url || '';
    const title = row.n || row.name || 'Untitled';
    const artist = row.a || row.artist || 'Unknown Artist';
    const museum = row.m || row.museumName || row.venue || '';
    const sourceCollection = row.e || row.sourceCollection || row.exhibitionId || '';
    const country = row.c || row.country || resolveCountryFromMeta(museum, sourceCollection);
    const rawUrl = row.u || row.sourceUrl || row.officialUrl || row.url || '';

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

  const requestRandomArtworks = useCallback((count = 36) => {
    if (!randomWorkerRef.current || !randomWorkerReady) return;
    setRandomLoading(true);
    randomWorkerRef.current.postMessage({ type: 'GET_RANDOM_ARTWORKS', count, onlyWithImage: true });
  }, [randomWorkerReady]);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/search.worker.ts', import.meta.url), { type: 'module' });
    randomWorkerRef.current = worker;

    worker.onmessage = (event: MessageEvent) => {
      const { type, results } = event.data || {};
      if (type === 'LOAD_COMPLETE') {
        setRandomWorkerReady(true);
        return;
      }

      if (type === 'RANDOM_ARTWORKS') {
        const mapped = (Array.isArray(results) ? results : [])
          .map((row: any, index: number) => mapWorkerRandomArtwork(row, index))
          .filter((item: any) => typeof item.image === 'string' && item.image.trim().length > 0);
        setRandomArtworks(mapped);
        setRandomLoading(false);
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

  const normalizeArtworkForAction = useCallback((artwork: any) => ({
    id: String(artwork?.id || ''),
    artworkId: String(artwork?.id || ''),
    title: artwork?.title || artwork?.name || 'Untitled',
    name: artwork?.title || artwork?.name || 'Untitled',
    artist: artwork?.artist || 'Unknown',
    image: artwork?.image || artwork?.i || '',
    i: artwork?.image || artwork?.i || '',
    year: artwork?.period || artwork?.year || '',
    museumName: artwork?.museum || artwork?.venue || '',
    country: artwork?.country || '',
    sourceCollection: artwork?.sourceCollection || '',
    officialUrl: artwork?.officialUrl || artwork?.detailUrl || '',
  }), []);

  const handleToggleArtworkLike = useCallback(async (artwork: any) => {
    if (!user) return;
    const normalized = normalizeArtworkForAction(artwork);
    const rawArtworkId = String(normalized.id || '').trim();
    if (!rawArtworkId) return;
    const safeArtworkId = normalizeArtworkIdForFirestore(rawArtworkId);

    try {
      const db = getFirestore();
      const ref = doc(db, `users/${user.uid}/liked_artworks/${safeArtworkId}`);
      const alreadyLiked = likedArtworkIds.has(rawArtworkId) || likedArtworkIds.has(safeArtworkId);

      if (alreadyLiked) {
        await deleteDoc(ref);
        setLikedArtworkIds((prev) => {
          const next = new Set(prev);
          next.delete(rawArtworkId);
          next.delete(safeArtworkId);
          return next;
        });
      } else {
        await setDoc(ref, {
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
        }, { merge: true });
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
        const likedData = snap.docs.map(d => ({id: d.id, ...d.data()}));
        const likedIdsForUi = new Set<string>();
        likedData.forEach((item: any) => {
          const docId = String(item?.id || '').trim();
          const rawArtworkId = String(item?.artworkId || item?.semanticId || '').trim();
          if (docId) likedIdsForUi.add(docId);
          if (rawArtworkId) likedIdsForUi.add(rawArtworkId);
          if (rawArtworkId) likedIdsForUi.add(normalizeArtworkIdForFirestore(rawArtworkId));
        });
        setLikedArtworkIds(likedIdsForUi);

        const rawCandidateIds = Array.from(new Set(
          likedData.flatMap((item: any) => [
            item?.semanticId,
            item?.artworkId,
            item?.id,
            typeof item?.id === 'string' ? item.id.replace(/__/g, '/') : null,
          ]).filter((value: any) => value !== null && value !== undefined && String(value).trim() !== '')
            .map((value: any) => String(value).trim())
        ));

        if (rawCandidateIds.length < 1) {
          setCurationLoading(false);
          return;
        }

        const likedIds = rawCandidateIds;

        const rankedSeedCandidates = likedData
          .map((item: any) => {
            const seedId = String(item?.semanticId || item?.artworkId || item?.id || '').trim();
            const artistKey = normalizeMetaKey(item?.artist || item?.a || 'unknown');
            const museumKey = normalizeMetaKey(item?.museumName || item?.museum || item?.venue || 'unknown');
            const likedAtMs = Number(item?.likedAt?.seconds || 0) * 1000 || Number(item?.likedAt || 0) || 0;
            return { seedId, artistKey, museumKey, likedAtMs };
          })
          .filter((item: any) => item.seedId.length > 0)
          .sort((a: any, b: any) => b.likedAtMs - a.likedAtMs);

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

        let fetchedResults = [];

        try {
            const recRes = await fetch(`${WORKER}/recommend`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: user.uid, likedIds: likedIds.slice(-80), limit: 90 }),
            });
            if (recRes.ok) {
               const data = await recRes.json();
               if (data.results) fetchedResults = data.results;
            }
        } catch (_error) {}

        const merged = new Map();
        const addMergedRow = (row: any, boost: number) => {
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

        fetchedResults.forEach((row: any, rank: number) => {
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
              const rows = Array.isArray(payload?.results) ? payload.results : [];
              rows.forEach((row: any, rank: number) => {
                const rankBoost = Math.max(0, 0.03 - rank * 0.001);
                addMergedRow(row, rankBoost);
              });
            } catch (_seedError) {
              continue;
            }
          }
        }

        fetchedResults = Array.from(merged.values())
          .sort((a: any, b: any) => (b.score + b.freq * 0.02) - (a.score + a.freq * 0.02))
          .map((entry: any) => entry.row);

        if (fetchedResults && fetchedResults.length > 0) {
           const mappedArtworks = fetchedResults.map((r, i) => {
             const img = r.i || r.image || r.imageUrl || r.url || '';
             const title = r.n || r.name || 'Untitled';
             const artist = r.a || r.artist || 'Unknown';
             const museum = r.m || r.museum || r.venue || '';
             const sourceCollection = r.e || r.sourceCollection || '';
             const country = r.c || r.country || resolveCountryFromMeta(museum, sourceCollection);
             const rawUrl = r.u || r.officialUrl || r.sourceUrl || r.link || '';
             return {
               id: String(r.id || i),
               title,
               artist,
               venue: museum || 'Unknown Museum',
               museum,
               country,
               period: r.year || r.y || '',
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
           
           const groupedByArtist = new Map<string, any[]>();
           for (const item of mappedArtworks) {
             const artistKey = normalizeMetaKey(item.artist || 'unknown');
             if (!groupedByArtist.has(artistKey)) groupedByArtist.set(artistKey, []);
             groupedByArtist.get(artistKey)!.push(item);
           }

           const interleaved: any[] = [];
           let hasRemaining = true;
           while (hasRemaining && interleaved.length < 120) {
             hasRemaining = false;
             for (const [, rows] of groupedByArtist) {
               if (!rows.length) continue;
               interleaved.push(rows.shift());
               hasRemaining = true;
               if (interleaved.length >= 120) break;
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
              if ((artistCounter.get(artistKey) || 0) >= 2) continue;
              if ((museumCounter.get(museumKey) || 0) >= 8) continue;

              seen.add(item.id); seen.add(item.title);
              artistCounter.set(artistKey, (artistCounter.get(artistKey) || 0) + 1);
              museumCounter.set(museumKey, (museumCounter.get(museumKey) || 0) + 1);
              unique.push(item);
              if (unique.length >= 40) break;
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
        const smap = {};
        snap.forEach(d => {
            smap[d.id] = d.data();
        });
        setExhStatsMap(smap);
      } catch (e: any) {
        if (e.code !== 'permission-denied') {
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
    let uLat = null;
    let uLng = null;

    const processExhibitions = () => {
        const results = [];
        for (const m of exhibitions) {
            for (const e of (m.temporaryExhibitions || [])) {
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
                
                if (img) {
                    results.push({
                       id: e.id,
                       title: e.title,
                       venue: m.name,
                       image: img,
                       period: e.endDate === "ongoing" || e.endDate === "TBD" ? e.startDate + " - 상시" : e.startDate + " - " + e.endDate,
                       distance: dist,
                       daysLeft: daysLeft,
                       communityAvg,
                       finalScore,
                        officialUrl: e.officialUrl || e.url || '',
                        detailUrl: resolveExhibitionDetailUrl(m.name, e.title, e.officialUrl || e.url || ''),
                       description: e.description,
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
  }, [exhStatsMap, tasteVector, statsLoaded]);

  const tabProps = { t, fg, fgLow, fgMed, fgFaint, divider, imgFilter, onSelect: setSelectedEx };

  return (
    <div style={{ width: "100%", height: "100dvh", overflowY: "auto", backgroundColor: bg, fontFamily: "'Space Grotesk', sans-serif", color: fg }}>
      
      {/* ── Global Theme Toggle (fixed bottom-left) ── */}
      <motion.button
        onClick={toggleTheme}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        style={{
          position: "fixed", bottom: 88, left: 20, zIndex: 50,
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          width: 36, height: 36, borderRadius: "50%",
          backgroundColor: t ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.10)",
          border: t ? "1px solid rgba(0,0,0,0.10)" : "1px solid rgba(255,255,255,0.12)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: t ? "0 2px 12px rgba(0,0,0,0.08)" : "0 2px 12px rgba(0,0,0,0.40)",
          color: t ? "rgba(0,0,0,0.60)" : "rgba(255,255,255,0.60)",
        }}
        title={t ? "Switch to Dark" : "Switch to Light"}
      >
        {t ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        )}
      </motion.button>

      {/* ── Header ── */}
      <div style={{ padding: "48px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
          <div style={{ width: 6, height: 6, backgroundColor: "#BFFF0A" }} />
          <span style={{ fontSize: 9, letterSpacing: "0.28em", textTransform: "uppercase", color: fgFaint }}>Personal Curation</span>
        </div>
        <h1 style={{ fontSize: "clamp(24px,6vw,36px)", letterSpacing: "-0.025em", color: fg, lineHeight: 1.15, marginBottom: 18 }}>
          AI<br />Recommendation
        </h1>
      </div>

      {/* ── Tab Switch ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, padding: "0 20px", backgroundColor: stickyBg, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
        <div style={{ position: 'relative', display: "flex", gap: 0, borderBottom: `1px solid ${divider}` }}>
          {(["curation", "nearby"]).map((tab) => {
            const label = tab === "curation" ? "나의 큐레이션" : "주변 전시";
            const icon  = tab === "curation" ? <Sparkles size={11} strokeWidth={2} /> : <MapPin size={11} strokeWidth={2} />;
            const isActive = activeTab === tab;
            return (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "14px 0", background: "none", border: "none",
                  cursor: "pointer", transition: "color 0.15s",
                  color: isActive ? fg : fgLow, fontSize: 12, fontWeight: isActive ? 600 : 400,
                }}>
                <span style={{ color: isActive ? (t ? "#5A7800" : "#BFFF0A") : fgFaint }}>{icon}</span>
                {label}
              </button>
            );
          })}
          <motion.div
            animate={{ left: activeTab === 'curation' ? '0%' : '50%' }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ position: 'absolute', bottom: -1, width: '50%', height: 2, backgroundColor: '#BFFF0A' }}
          />
        </div>
      </div>

      {/* ── Tab Content ── */}
      <AnimatePresence mode="wait">
        {activeTab === "curation" ? (
          <motion.div key="curation"
            initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}>
            <CurationTab {...tabProps} userArtworks={userArtworks} loading={curationLoading} 
               likedArtworkIds={likedArtworkIds}
               onToggleLike={(artwork: any) => { void handleToggleArtworkLike(artwork); }}
               onOpenProduct={(artwork: any) => setProductArtwork(normalizeArtworkForAction(artwork))}
               onOpenComment={(artwork: any) => setCommentArtwork(normalizeArtworkForAction(artwork))}
               onOpenPlaylist={(artwork: any) => setPlaylistArtwork(normalizeArtworkForAction(artwork))}
               recommendMode={recommendMode}
               onChangeRecommendMode={setRecommendMode}
               randomArtworks={randomArtworks}
               randomLoading={randomLoading}
               onRefreshRandom={() => requestRandomArtworks(36)}
               onSelect={(ex: any) => {
                 if (ex.isArtwork) {
                   setLightboxArtwork(ex);
                 } else {
                   setSelectedEx(ex);
                 }
               }} 
            />
          </motion.div>
        ) : (
          <motion.div key="nearby"
            initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.2 }}>
            <NearbyTab {...tabProps} nearbyExhibitions={nearbyExhibitions} loading={nearbyLoading} 
               onSelect={(ex: any) => setSelectedEx(ex)} 
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
          onPurchase={(artwork: any) => setProductArtwork(normalizeArtworkForAction(artwork || lightboxArtwork))}
          onSaveToPlaylist={(artwork: any) => setPlaylistArtwork(normalizeArtworkForAction(artwork || lightboxArtwork))}
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
          onSelectArtwork={(nextArtwork: any) => setProductArtwork(normalizeArtworkForAction(nextArtwork))}
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
