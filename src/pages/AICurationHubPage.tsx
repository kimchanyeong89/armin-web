import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Calendar, X,
  Navigation, Star, BookmarkPlus, MessageCircle, ShoppingBag, Shuffle, RotateCw
} from "lucide-react";
import { LikeIcon } from "../components/like/LikeIcon";
import WeeklyCurationTab from '../components/WeeklyCurationTab';
import { useAuth } from '../contexts/AuthContext';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { exhibitions } from '../data/exhibitions';
import { ArtworkLightbox } from '../components/ArtworkLightbox';
import { SearchWittyLoader } from '../components/SearchWittyLoader';
import { useLikedArtworkSet } from '../hooks/useLikedArtworkSet';
import { ProductModal } from '../components/ProductModal';
import CommentModal from '../components/CommentModal';
import { PlaylistModal } from '../components/PlaylistModal';
import { ExpandableActionMenu } from '../components/ExpandableActionMenu';
import "./aiHubRedesign.css";
import { useLanguage } from "../contexts/LanguageContext";
import { NO_IMAGE_PLACEHOLDER_DARK } from '../utils/noImagePlaceholder';
import { getOptimizedImageUrl } from '../utils/imageProxy';
import { localizeCountryName } from "../i18n/geoLocalization";
import type { RecommendationMode, RecommendationResponse, RecommendedArtwork } from "../types/Recommendation";

const WORKER = 'https://armin-semantic-search.armin-art.workers.dev';

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
function normalizeMetaKey(value: unknown) {
  if (!value) return '';
  return String(value).trim().toLowerCase();
}

// Evenly sample up to `count` items across an array (always keeps the first and
// last), preserving order. Used to spread recommendation seeds across the user's
// whole like history instead of clumping at the most-recent end — so embedded
// likes anywhere in the history still drive recommendations.
function pickSpread<T>(arr: T[], count: number): T[] {
  if (count <= 0) return [];
  if (arr.length <= count) return arr.slice();
  const out: T[] = [];
  const step = (arr.length - 1) / (count - 1);
  for (let i = 0; i < count; i++) out.push(arr[Math.round(i * step)]);
  return out;
}

function normalizeArtworkIdForFirestore(value: unknown) {
  return String(value ?? '').trim().replace(/\//g, '__');
}

const museumCountryIndex = (() => {
  const museumToCountry = new Map<string, string>();
  const collectionToCountry = new Map<string, string>();
  const collectionToMuseum = new Map<string, string>();

  for (const museum of exhibitions as unknown as Array<Record<string, unknown>>) {
    const country = String(museum?.country || '');
    const museumName = String(museum?.name_en || museum?.name || '');
    const keys = [museum?.id, museum?.slug, museum?.name, museum?.name_en].filter(Boolean);
    for (const key of keys) {
      museumToCountry.set(normalizeMetaKey(key), country);
    }

    for (const p of ((museum?.permanentExhibitions || []) as Array<Record<string, unknown>>)) {
      const collectionKeys = [
        p?.id,
        typeof p?.collectionFile === 'string' ? (p.collectionFile.split('/').pop() || '').replace(/\.json$/i, '') : '', /* 주소로 적힌 것도 파일 이름만 */
      ].filter(Boolean);
      for (const cKey of collectionKeys) {
        const k = normalizeMetaKey(cKey);
        collectionToCountry.set(k, country);
        if (museumName && !collectionToMuseum.has(k)) collectionToMuseum.set(k, museumName);
      }
    }
  }

  return { museumToCountry, collectionToCountry, collectionToMuseum };
})();

/* 추천 데이터 상당수는 미술관 이름(m)이 비어 있다 — 이름이 없는 컬렉션 파일에서 올라왔기 때문이다.
   함께 실려 오는 컬렉션 id(e, 파일 이름)로 미술관 목록에서 이름을 찾는다 */
function resolveMuseumFromCollection(collectionId: unknown) {
  const cKey = normalizeMetaKey(collectionId);
  return (cKey && museumCountryIndex.collectionToMuseum.get(cKey)) || '';
}

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
  onTasteOnboardingSubmit: (selected: RecommendationCardItem[]) => Promise<void>;
  isSignedIn: boolean;
  onBrowseWeekly: () => void;
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
              <LikeIcon liked={false} size={18} emptyColor={fg} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Curation Tab ───────────────────────────────────────────
// ─── First-time Taste Onboarding ────────────────────────────
// 좋아요 이력이 없는 첫 사용자를 위한 취향 픽커. 랜덤 작품을 3개 이상 고르면
// 좋아요로 저장되고 취향 프로파일이 만들어져 추천이 로드된다.
function TasteOnboarding({
  tr, t, fgLow, fgMed, divider,
  pool, poolLoading, onShuffle, onSubmit, onBrowseRandom,
}: {
  tr: Translator;
  t: boolean;
  fgLow: string;
  fgMed: string;
  divider: string;
  pool: RecommendationCardItem[];
  poolLoading: boolean;
  onShuffle: () => void;
  onSubmit: (selected: RecommendationCardItem[]) => Promise<void>;
  onBrowseRandom: () => void;
}) {
  const MIN_PICKS = 3;
  const [selected, setSelected] = useState<RecommendationCardItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set());

  // 한 화면에 들어오는 양(6개)만 노출 — 나머지는 "다른 작품 보기"로 넘겨가며 고른다.
  // 선택(selected)은 풀이 바뀌어도 유지되므로 새로고침하며 누적 선택할 수 있다.
  const visible = pool
    .filter((a) => a.image && !brokenIds.has(String(a.id)))
    .slice(0, 6);

  const toggle = (art: RecommendationCardItem) => {
    if (submitting) return;
    setSelected((prev) =>
      prev.some((a) => a.id === art.id)
        ? prev.filter((a) => a.id !== art.id)
        : [...prev, art],
    );
  };

  const handleSubmit = async () => {
    if (selected.length < MIN_PICKS || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(selected);
    } finally {
      setSubmitting(false);
    }
  };

  const enough = selected.length >= MIN_PICKS;

  return (
    <div style={{ padding: '24px 20px 12px', maxWidth: 620, margin: '0 auto' }}>
      {/* the page's own voice: mono gold kicker, Paperlogy heading,
          Wanted Sans body — left-aligned like the title block above */}
      <div className="hub-lead">
        <p className="hub-lead__meta">{tr({ ko: 'COLLY AI · 취향 분석', en: 'COLLY AI · Taste setup' })}</p>
        <h2>{tr({ ko: '마음에 드는 작품을 골라주세요.', en: 'Pick the artworks you love.' })}</h2>
        <p className="hub-lead__body">
          {tr({
            ko: '세 점부터 시작합니다. 많이 고를수록 추천이 정확해집니다.',
            en: 'Three is the minimum. The more you pick, the closer the picks get.',
          })}
        </p>
      </div>

      {(poolLoading || pool.length === 0) && visible.length === 0 ? (
        <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={fgMed} strokeWidth={2}>
            <style>{`@keyframes _to_spin { 100% { transform: rotate(360deg); } }`}</style>
            <circle cx={12} cy={12} r={10} strokeOpacity={0.2} />
            <path d="M12 2 a10 10 0 0 1 10 10" strokeLinecap="round" style={{ transformOrigin: '12px 12px', animation: '_to_spin 1s linear infinite' }} />
          </svg>
        </div>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
          opacity: submitting ? 0.5 : 1, transition: 'opacity 0.2s',
        }}>
          {visible.map((art) => {
            const isSel = selected.some((a) => a.id === art.id);
            return (
              <button
                key={String(art.id)}
                onClick={() => toggle(art)}
                aria-pressed={isSel}
                style={{
                  position: 'relative', aspectRatio: '1 / 1', padding: 0,
                  cursor: submitting ? 'default' : 'pointer',
                  borderRadius: 10, overflow: 'hidden', background: divider,
                  border: isSel ? '2px solid #D4A547' : '2px solid transparent',
                  boxShadow: isSel ? '0 6px 18px rgba(212,165,71,0.3)' : 'none',
                  transition: 'border-color 0.12s, box-shadow 0.12s',
                }}
              >
                <img
                  src={getOptimizedImageUrl(String(art.image), 240, 70, 'webp')}
                  alt={art.title || ''}
                  loading="lazy"
                  decoding="async"
                  onError={() => setBrokenIds((p) => { const n = new Set(p); n.add(String(art.id)); return n; })}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: isSel ? 1 : 0.9 }}
                />
                {isSel && (
                  <div style={{
                    position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%',
                    background: '#D4A547', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#000', lineHeight: 1 }}>✓</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      <button
        onClick={onShuffle}
        disabled={poolLoading || submitting}
        style={{
          marginTop: 14, width: '100%', padding: '11px', borderRadius: 9,
          background: 'transparent', border: `1px solid ${divider}`, color: fgLow,
          fontSize: 12, fontWeight: 600,
          cursor: poolLoading || submitting ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        }}
      >
        <Shuffle size={13} strokeWidth={2.1} />
        {tr({ ko: '다른 작품 보기', en: 'Show different artworks' })}
      </button>
      <p style={{ margin: '8px 0 0', textAlign: 'center', fontSize: 11, lineHeight: 1.5, color: fgMed }}>
        {tr({
          ko: '새 작품을 불러와요 · 고른 작품은 그대로 유지돼요',
          en: 'Loads new artworks — your picks are kept',
        })}
      </p>

      <div style={{
        position: 'sticky', bottom: 0, marginTop: 16, paddingTop: 12,
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        background: `linear-gradient(to top, ${t ? '#fafafa' : '#080808'} 60%, transparent)`,
      }}>
        <button
          onClick={handleSubmit}
          disabled={!enough || submitting}
          style={{
            width: '100%', padding: '15px', borderRadius: 11, border: 'none',
            background: enough && !submitting ? '#D4A547' : divider,
            color: enough && !submitting ? '#000' : fgMed,
            fontSize: 13.5, fontWeight: 800,
            cursor: enough && !submitting ? 'pointer' : 'not-allowed',
          }}
        >
          {submitting
            ? tr({ ko: '취향을 분석하는 중…', en: 'Analyzing your taste…' })
            : enough
              ? tr({ ko: `이 작품들로 추천받기 (${selected.length})`, en: `Get recommendations (${selected.length})` })
              : tr({ ko: `${MIN_PICKS}개 이상 골라주세요 · 현재 ${selected.length}개`, en: `Pick ${MIN_PICKS}+ · ${selected.length} selected` })}
        </button>
        <button
          onClick={onBrowseRandom}
          disabled={submitting}
          style={{
            marginTop: 8, width: '100%', padding: '8px', background: 'none', border: 'none',
            color: fgMed, fontSize: 11.5, fontWeight: 600,
            cursor: submitting ? 'default' : 'pointer', textDecoration: 'underline', textUnderlineOffset: 3,
          }}
        >
          {tr({ ko: '아직은 둘러보기만 할게요', en: 'Just browse for now' })}
        </button>
      </div>
    </div>
  );
}

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
  onTasteOnboardingSubmit,
  isSignedIn,
  onBrowseWeekly,
}: CurationTabProps) {
  const isRandomMode = recommendMode === 'random';
  const isLoading = isRandomMode ? randomLoading : loading;
  /* works already in the member's likes are left out. The likes are read
     when a list arrives, not on every change, so a work liked here stays put
     until the next list instead of vanishing under the finger. */
  const likedNow = useRef(likedArtworkIds);
  likedNow.current = likedArtworkIds;
  const sourceArtworks = isRandomMode ? randomArtworks : userArtworks;
  const displayArtworks = React.useMemo(
    () => sourceArtworks.filter((ex) => {
      const liked = likedNow.current;
      return !(liked?.has(String(ex.id)) || liked?.has(normalizeArtworkIdForFirestore(ex.id)));
    }),
    // also once the likes themselves have loaded, if the list came first
    [sourceArtworks, likedArtworkIds.size > 0], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // The cold-start taste picker is ONLY for users with zero likes. A user who
  // already has likes but got no recommendations (e.g. their liked artworks
  // aren't in the recommendation vector index yet, or a transient worker miss)
  // must never be sent back to the picker — show the search loader instead.
  const hasLikes = likedArtworkIds.size > 0;

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
      // Has likes but nothing to show → keep showing the search loader, never
      // the cold-start picker (which wrongly implies "you have no taste yet").
      if (hasLikes) {
        return <SearchWittyLoader dark={!t} />;
      }
      // The picker writes the chosen works to the signed-in user's taste
      // profile; without an account there is nowhere to put them, so it
      // used to collect picks and silently drop them. Ask for sign-in.
      if (!isSignedIn) {
        return (
          <div className="hub-lead hub-signin">
            <p className="hub-lead__meta">{tr({ ko: 'COLLY AI · 로그인 필요', en: 'COLLY AI · Sign in' })}</p>
            <h2>{tr({ ko: '로그인하면 AI 추천을 받을 수 있습니다.', en: 'Sign in to get AI picks.' })}</h2>
            <p className="hub-lead__body">
              {tr({
                ko: '작품을 많이 저장할수록 추천이 정밀해집니다. 주간 큐레이션은 로그인하지 않아도 볼 수 있습니다.',
                en: 'The more works you save, the sharper the picks get. The weekly curation is open to everyone.',
              })}
            </p>
            <div className="hub-signin__row">
              <a className="hub-signin__go" href="/login">{tr({ ko: '로그인', en: 'Sign in' })} <span aria-hidden="true">↗</span></a>
              <button type="button" onClick={onBrowseWeekly}>{tr({ ko: '주간 큐레이션 보기', en: 'See the weekly curation' })}</button>
            </div>
          </div>
        );
      }
      return (
        <TasteOnboarding
          tr={tr}
          t={t}
          fgLow={fgLow}
          fgMed={fgMed}
          divider={divider}
          pool={randomArtworks}
          poolLoading={randomLoading}
          onShuffle={() => onRefreshRandom(36, false)}
          onSubmit={onTasteOnboardingSubmit}
          onBrowseRandom={() => onChangeRecommendMode('random')}
        />
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
        padding: "8px 20px 8px",
        backgroundColor: t ? "rgba(250,250,250,0.97)" : "rgba(8,8,8,0.97)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: `1px solid ${divider}`,
        marginBottom: 12,
      }}>
        <div className="hub-mode">
          <div className="hub-mode__group" role="group">
            <button type="button" className={recommendMode === 'taste' ? 'is-active' : ''} onClick={() => onChangeRecommendMode('taste')}>
              {tr({ ko: '맞춤 추천', en: 'Taste Match' })}
            </button>
            <button type="button" className={recommendMode === 'random' ? 'is-active' : ''} onClick={() => onChangeRecommendMode('random')}>
              {tr({ ko: '랜덤 추천', en: 'Random Picks' })}
            </button>
          </div>
          <i className="hub-mode__rule" />
          {isRandomMode && (
            <button type="button" className="hub-mode__reshuffle" onClick={() => onRefreshRandom(36, false)} title={tr({ ko: '다시 뽑기', en: 'Reshuffle' })}>
              <RotateCw size={14} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: "0 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 3 : 5}, minmax(0, 1fr))`, gap: 5 }}>
          {displayArtworks.slice(0, displayedCount).map((ex, idx) => (
            <motion.div
              key={ex.id + '-' + idx}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: (idx % 12) * 0.05 }}
            >
              <div
                className="hub-card"
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
                  {/* the match, small in the cover's upper right - off the artist's line, which it used to crowd */}
                  {typeof ex.matchScore === 'number' && (
                    <span className="hub-read hub-read--cover">
                      <i className="hub-dot" aria-hidden="true"><i /></i>
                      <em>{(Math.max(0, Math.min(1, ex.matchScore)) * 100).toFixed(0)}%</em>
                    </span>
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
  const initialTab: "curation" | "weekly" =
    searchParams.get('weekly') ||
    searchParams.get('special') ||
    searchParams.get('preview')
      ? 'weekly'
      : 'curation';
  const [activeTab, setActiveTab] = useState<"curation" | "weekly">(initialTab);

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
  // 첫 사용자 취향 온보딩 완료 시 bump → fetchArtworks 재실행 트리거
  const [tasteRefreshKey, setTasteRefreshKey] = useState(0);
  const [randomArtworks, setRandomArtworks] = useState<RecommendationCardItem[]>([]);
  const [randomLoading, setRandomLoading] = useState(false);
  const [randomWorkerReady, setRandomWorkerReady] = useState(false);
  const randomWorkerRef = useRef<Worker | null>(null);
  const randomAppendRef = useRef(false);
  const randomLoadingRef = useRef(false);

  const [lightboxArtwork, setLightboxArtwork] = useState<RecommendationCardItem | null>(null);
  const { likedIds, isLiked, toggleLike } = useLikedArtworkSet();
  const [commentArtwork, setCommentArtwork] = useState<RecommendationCardItem | null>(null);
  const [productArtwork, setProductArtwork] = useState<RecommendationCardItem | null>(null);
  const [playlistArtwork, setPlaylistArtwork] = useState<RecommendationCardItem | null>(null);

  const mapWorkerRandomArtwork = useCallback((row: WorkerRecommendationRow, index: number): RecommendationCardItem => {
    const img = String(row.i || row.image || row.imageUrl || row.url || '');
    const title = String(row.n || row.name || 'Untitled');
    const artist = String(row.a || row.artist || 'Unknown Artist');
    const sourceCollection = String(row.e || row.sourceCollection || row.exhibitionId || '');
    const museum = String(row.m || row.museumName || row.venue || '') || resolveMuseumFromCollection(sourceCollection);
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
    if (!randomWorkerReady || randomArtworks.length > 0) return;
    // 랜덤 탭이거나, 취향 탭인데 추천이 비어(첫 사용자) 취향 픽커를 띄워야 할 때 풀을 채운다.
    const needsTastePicker =
      recommendMode === 'taste' && !curationLoading && userArtworks.length === 0;
    if (recommendMode === 'random' || needsTastePicker) {
      requestRandomArtworks(36);
    }
  }, [recommendMode, randomArtworks.length, randomWorkerReady, requestRandomArtworks, curationLoading, userArtworks.length]);

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

  // 첫 사용자 취향 온보딩 — 고른 작품을 좋아요로 저장하고 추천을 로드한다.
  const handleTasteOnboardingSubmit = useCallback(async (selected: RecommendationCardItem[]) => {
    if (!user || selected.length === 0) return;
    // 1) 고른 작품을 모두 좋아요 → Firestore liked_artworks 에 기록된다.
    await Promise.all(selected.map((art) => toggleLike(art)));
    // 2) 취향 프로파일을 worker KV 에 저장. id 형태(원본/__/슬래시)를 모두 보내
    //    Vectorize 키와 어긋나지 않게 한다. 실패해도 /recommend 가 즉석 계산으로 대체.
    const likedIdList = Array.from(new Set(
      selected.flatMap((art) => {
        const raw = String(art?.id || '').trim();
        return raw ? [raw, raw.replace(/\//g, '__'), raw.replace(/__/g, '/')] : [];
      }),
    ));
    try {
      await fetch(`${WORKER}/taste-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, likedIds: likedIdList }),
      });
    } catch {
      /* 프로파일 저장 실패는 무시 — /recommend 가 즉석 계산으로 처리 */
    }
    // 3) 추천 다시 로드 (fetchArtworks 가 tasteRefreshKey 의존성으로 재실행)
    setTasteRefreshKey((k) => k + 1);
  }, [user, toggleLike]);

  // Fetch 'For You' artworks
  useEffect(() => {
    const fetchArtworks = async () => {
      if (!user) {
        setCurationLoading(false);
        return;
      }
      setCurationLoading(true);
      try {
        const db = getFirestore();
        const snap = await getDocs(collection(db, `users/${user.uid}/liked_artworks`));
        const likedData: LikedArtworkRecord[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as LikedArtworkRecord));

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

        // Build a diverse candidate pool across the user's FULL like history
        // (recency-ordered), capping per artist/museum so one cluster can't
        // dominate. Crucially we collect candidates from the WHOLE history, not
        // just the most-recent picks: a recently-liked batch may be from a
        // collection not yet in the recommendation vector index, and a
        // recency-only seed set would then miss every embedded like and return
        // empty. (The backend silently drops unindexed ids, so spreading seeds
        // across history keeps embedded likes — old or new — in play.)
        const diverseCandidates: string[] = [];
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
          diverseCandidates.push(candidate.seedId);
        }

        // Top up from any remaining likes if diversity caps left us too few.
        if (diverseCandidates.length < 8) {
          for (const id of likedIds) {
            if (seenSeed.has(id)) continue;
            seenSeed.add(id);
            diverseCandidates.push(id);
          }
        }

        // Sample seeds spread evenly newest→oldest. SEED_COUNT stays at/under
        // the backend's ~20-id /recommend ceiling so the centroid call below
        // can reuse this exact set.
        const SEED_COUNT = 18;
        const diverseSeeds = pickSpread(diverseCandidates, SEED_COUNT);

        let fetchedResults: WorkerRecommendationRow[] = [];

        try {
            const recRes = await fetch(`${WORKER}/recommend`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              // The backend silently returns [] when likedIds exceeds ~20, or
              // when limit exceeds ~1.5× the id count. Sending all likes with
              // limit 90 (as before) always tripped this → no recommendations
              // for anyone with 20+ likes. Send the spread seed set (≤20) and
              // keep limit at the id count.
              body: JSON.stringify({ userId: user.uid, likedIds: diverseSeeds, limit: Math.max(1, diverseSeeds.length) }),
            });
            if (recRes.ok) {
               const data = (await recRes.json()) as Partial<RecommendationResponse>;
               if (Array.isArray(data.results)) fetchedResults = data.results as WorkerRecommendationRow[];
            }
        } catch (_error) {}

        // /recommend 결과를 1차 백본으로 사용한다. worker가 이미 취향 군집별로
        // 공정하게 인터리브해 반환하므로, 절대 cosine 점수로 재정렬하면
        // 가장 밀집된 한 군집(예: 화병/화분)이 상위를 독식한다.
        const mergedIds = new Set<string>();
        const orderedRows: WorkerRecommendationRow[] = [];
        const pushRow = (row: WorkerRecommendationRow) => {
          const rowId = String(row?.id || '');
          if (!rowId || mergedIds.has(rowId)) return;
          mergedIds.add(rowId);
          orderedRows.push(row);
        };

        fetchedResults.forEach(pushRow);

        // /recommend-by-id (history-spanning 좋아요 기반 유사작) — 백본 뒤에 덧붙인다.
        // 단일 id 호출이라 ~20개 입력 제한이 없고, 시드가 전 이력에 분산돼 있어
        // 임베딩된 좋아요(과거 것 포함)가 반드시 추천에 반영된다.
        if (likedIds.length > 0) {
          const seeds = diverseSeeds.length > 0 ? diverseSeeds : likedIds.slice(-12).reverse();
          const seededResponses = await Promise.allSettled(
            seeds.map((seedId) => fetch(`${WORKER}/recommend-by-id`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: seedId, limit: 24 }),
            }))
          );

          // 시드(취향)별 리스트를 모아 라운드로빈으로 덧붙인다 →
          // 보충분도 특정 시드 하나가 독식하지 않게.
          const seededLists: WorkerRecommendationRow[][] = [];
          for (const res of seededResponses) {
            if (res.status !== 'fulfilled' || !res.value.ok) continue;
            try {
              const payload = await res.value.json();
              const rows = Array.isArray(payload?.results) ? (payload.results as WorkerRecommendationRow[]) : [];
              seededLists.push(rows);
            } catch (_seedError) {
              continue;
            }
          }
          const maxSeedRank = seededLists.reduce((mx, l) => Math.max(mx, l.length), 0);
          for (let rank = 0; rank < maxSeedRank; rank++) {
            for (const list of seededLists) {
              if (list[rank]) pushRow(list[rank]);
            }
          }
        }

        fetchedResults = orderedRows;

        if (fetchedResults && fetchedResults.length > 0) {
           const mappedArtworks: RecommendationCardItem[] = fetchedResults.map((r, i) => {
             const img = String(r.i || r.image || r.imageUrl || r.url || '');
             const title = String(r.n || r.name || 'Untitled');
             const artist = String(r.a || r.artist || 'Unknown');
             const sourceCollection = String(r.e || r.sourceCollection || '');
             const museum = String(r.m || r.museum || r.venue || '') || resolveMuseumFromCollection(sourceCollection);
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
  }, [user, tasteRefreshKey]);

  const tabProps = { t, fg, fgLow, fgMed, fgFaint, divider, imgFilter, onSelect: setSelectedEx };

  return (
    <div
      className="hub"
      style={{
        width: "100%", height: "100dvh", overflowY: "auto", backgroundColor: bg, color: fg,
        ["--hub-fg" as any]: fg, ["--hub-dim" as any]: fgFaint, ["--hub-line" as any]: divider,
      } as React.CSSProperties}
    >
      {/* ── the title block: one left-aligned column ── */}
      <section className="hub-statement colly-rise">
        <p className="hub-statement__meta">AI</p>
        <h1>{tr({ ko: '당신의 취향을 읽는 큐레이션.', en: 'Curation that reads your taste.' })}</h1>
        <p>{tr({
          ko: '좋아요와 컬렉션 기록을 바탕으로, 세계 미술관 소장품 가운데 지금 당신에게 맞는 작품을 골라 보여드립니다.',
          en: 'Built from your likes and collections, picked from museum holdings around the world.',
        })}</p>
      </section>

      {/* ── the curation switch: one bordered track, split in half ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, padding: "6px 20px 6px", paddingTop: "calc(6px + env(safe-area-inset-top, 0px))", backgroundColor: stickyBg, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
        <div className="hub-switch" role="tablist">
          {([
            { id: "curation", label: tr({ ko: '나의 큐레이션', en: 'My Curation' }) },
            { id: "weekly",   label: tr({ ko: '주간 큐레이션', en: 'Weekly' }) },
          ]).map(({ id, label }) => (
            <button key={id} type="button" role="tab" aria-selected={activeTab === id}
              className={activeTab === id ? "is-active" : ""}
              onClick={() => setActiveTab(id as "curation" | "weekly")}>
              <span className="hub-switch__inner">
                <i className="hub-switch__dot" aria-hidden="true" />
                <span className="hub-switch__label">{label}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ── */}
      <AnimatePresence mode="wait">
        {activeTab === "curation" && (
          <motion.div key="curation"
            initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}>
            <CurationTab {...tabProps} language={language} tr={tr} userArtworks={userArtworks} loading={curationLoading}
               likedArtworkIds={likedIds}
               onToggleLike={(artwork: RecommendationCardItem) => { void toggleLike(artwork); }}
               onOpenProduct={(artwork: RecommendationCardItem) => setProductArtwork(normalizeArtworkForAction(artwork))}
               onOpenComment={(artwork: RecommendationCardItem) => setCommentArtwork(normalizeArtworkForAction(artwork))}
               onOpenPlaylist={(artwork: RecommendationCardItem) => setPlaylistArtwork(normalizeArtworkForAction(artwork))}
               recommendMode={recommendMode}
               onChangeRecommendMode={setRecommendMode}
               onTasteOnboardingSubmit={handleTasteOnboardingSubmit}
               isSignedIn={Boolean(user && !user.isAnonymous)}
               onBrowseWeekly={() => setActiveTab('weekly')}
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
          isLiked={isLiked(lightboxArtwork?.id)}
          likedArtworksList={Array.from(likedIds).map((id) => ({ id, artworkId: id }))}
          onToggleLike={(event: React.MouseEvent, artwork: any) => {
            event.stopPropagation();
            void toggleLike(artwork || lightboxArtwork);
          }}
          onChangeArtwork={(art: any) => setLightboxArtwork(art)}
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
