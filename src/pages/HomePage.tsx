import React, { useEffect, useRef, useState, Suspense, lazy, useMemo, useCallback } from "react";
import { useSearchParams, useNavigate, useLocation, useParams } from "react-router-dom";

// D3GeoGlobeSimplified disabled — Interactive Map is the default entry point
// const D3GeoGlobeSimplified = React.lazy(() => import("../components/D3GeoGlobeSimplified"));
import DrawingGlobe from "../components/DrawingGlobe";
import MiniSpinningGlobe from "../components/MiniSpinningGlobe";

import ExhibitionDetails from "../components/ExhibitionDetails";

import type { SearchableArtwork } from "../components/GlobalSearchBar";
// Filled Globe temporarily hidden
// Removed react-globe.gl Outline mode
// Heavy globe modes removed for performance on homepage
// Removed LeafletInteractiveMap import
import type { Exhibition, ExhibitionItem } from "../types/Exhibition";
const InteractiveGlobeMap = React.lazy(() => import("../components/InteractiveGlobeMap/InteractiveGlobeMap"));

const ExhibitionModal = lazy(() => import("../components/ExhibitionModal"));


import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp, getDocs } from "firebase/firestore";
import { shouldLimitNetwork } from "../utils/network";
import { searchByText, encodeText, searchByVector, searchSimilarTo } from "../utils/siglipSearch";
import { ArtworkLightbox } from "../components/ArtworkLightbox";
import { FadeInImage } from "../components/ProgressiveImage";
import { GlobalNav } from "../components/GlobalNav";
import { useLanguage } from "../contexts/LanguageContext";
import { localizeMuseum } from "../i18n/museumLocalization";


// Admin email whitelist
const ADMIN_EMAILS = ['kietzland@gmail.com'];

type HomePageProps = {
  exhibitions: Exhibition[];
  isOverlayOpen?: boolean;
};

const normalizeToken = (value?: string) => (value || "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[^a-z0-9]+/g, "");

const collectExhibitionTokens = (entry?: ExhibitionItem | null) => {
  const tokens = new Set<string>();
  const addToken = (value?: string | null) => {
    const token = normalizeToken(value || "");
    if (token) tokens.add(token);
  };
  if (!entry) return tokens;
  addToken(entry.id as string);
  addToken((entry as any)?.slug);
  addToken((entry as any)?.collectionId);
  addToken(entry.name as string);
  addToken(entry.title as string);
  const file = (entry as any)?.collectionFile;
  if (typeof file === 'string') addToken(file.replace(/\.json$/i, ''));
  const aliases = (entry as any)?.aliases;
  if (Array.isArray(aliases)) aliases.forEach(alias => addToken(alias));
  return tokens;
};

// ── 벡터 수학 헬퍼 (취향 centroid 계산) ──────────────────────────────────────
function _l2Normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm > 0 ? v.map(x => x / norm) : v;
}
function _cosineSim(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + v * b[i], 0);
}
function _vectorMean(vecs: number[][]): number[] {
  if (vecs.length === 0) return [];
  const mean = vecs[0].map((_, j) => vecs.reduce((s, v) => s + v[j], 0) / vecs.length);
  return _l2Normalize(mean);
}

// ── Module-level cache: Pompidou title → original_image lookup ────────────────
let _pompidouImgMap: Map<string, string> | null = null;
async function getPompidouImageMap(): Promise<Map<string, string>> {
  if (_pompidouImgMap) return _pompidouImgMap;
  try {
    const resp = await fetch('/data/pompidou-painting-collection.json');
    if (!resp.ok) { _pompidouImgMap = new Map(); return _pompidouImgMap; }
    const data = await resp.json();
    const map = new Map<string, string>();
    for (const obj of (data.objects || data)) {
      const title = (obj.title || obj.name || '').toLowerCase().trim();
      const img = obj.original_image || obj.image;
      if (title && img) map.set(title, img);
    }
    _pompidouImgMap = map;
  } catch { _pompidouImgMap = new Map(); }
  return _pompidouImgMap!;
}

// 텍스트/문서/편지 등 순수 예술작품이 아닌 항목 감지
const isTextOrDocument = (title: string): boolean => {
  if (!title) return false;
  const t = title.toLowerCase().trim();
  // 단독 키워드 (제목 자체가 이런 단어인 경우)
  const exactBlacklist = new Set(['text', 'texts', 'letter', 'letters', 'document', 'documents', 'manuscript', 'page', 'pages', 'folio', 'typescript']);
  if (exactBlacklist.has(t)) return true;
  // 패턴 매칭
  return (
    /^(letter (to|from|of|by|dated)|lettre (à|de|du|d'|au)|brief (an|von|des)|manuscript of|page from|leaf from|document (of|relating)|deed of|certificate of|contract (of|for)|bill of|minutes of)/.test(t) ||
    /\b(autograph letter signed|letter signed|handwritten document|hand-written letter|circular letter|open letter signed|official document|typed letter|tls\b)\b/.test(t) ||
    /^(folio |recto |verso |ms\. |ms |col\. )/.test(t)
  );
};

export default function HomePage({ exhibitions, isOverlayOpen = false }: HomePageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { collectionId } = useParams<{ collectionId?: string }>();
  const { language, t } = useLanguage();
  // Live total artwork count — read from the search manifest (`c`), which is regenerated whenever the
  // index is rebuilt, so the headline number stays in sync as collections grow. Museum count is just
  // the number of registered museums (exhibitions), so it updates with the data too.
  const [totalArtworks, setTotalArtworks] = useState<number | null>(null);
  useEffect(() => {
    fetch('/data/search-manifest.json').then((r) => r.json()).then((m) => { if (m && typeof m.c === 'number') setTotalArtworks(m.c); }).catch(() => {});
  }, []);
  // Compute initial modal/detail state from history synchronously to avoid first-paint flicker
  const initialFromHistory = (() => {
    if (typeof window === 'undefined') return { item: null as ExhibitionItem | null, parent: null as Exhibition | null };
    try {
      const st = (window.history.state || {}) as any;
      if (st && st.modal && st.exhibitionId) {
        for (const ex of exhibitions) {
          const items = (ex as any).permanentExhibitions || [];
          if (Array.isArray(items)) {
            const hit = items.find((it: any) => it && (it.id === st.exhibitionId));
            if (hit) return { item: hit as ExhibitionItem, parent: ex };
          }
        }
      }
    } catch { }
    return { item: null as ExhibitionItem | null, parent: null as Exhibition | null };
  })();
  // Approximate dark green used on the map style (adjust if needed)
  const MAP_DARK_GREEN = "#0B3D02";
  const [toggleOnColor, setToggleOnColor] = useState<string>(() => {
    try {
      return localStorage.getItem('toggleOnColor') || MAP_DARK_GREEN;
    } catch {
      return MAP_DARK_GREEN;
    }
  });
  const [selectedExhibition, setSelectedExhibition] = useState<Exhibition | null>(initialFromHistory.parent);
  const [selectedModalExhibition, setSelectedModalExhibition] = useState<ExhibitionItem | null>(initialFromHistory.item);
  const [showInteractiveGlobe, setShowInteractiveGlobe] = useState(() => {
    try {
      const fromDrawingParam = new URLSearchParams(window.location.search).get('drawingMap') === 'true';
      if (fromDrawingParam) return false;
      if (window.location.pathname.startsWith('/interactive')) return true;
      // /collection/:id로 이동할 때 fromInteractiveMap state가 있으면 인터랙티브맵 자동 열기
      if (window.history.state?.usr?.fromInteractiveMap) return true;
      // 첫 진입은 인터랙티브 맵을 기본으로 표시
      return true;
    } catch {
      return true;
    }
  });
  // Landing page hover state (for animated globe previews)
  const [landingHover, setLandingHover] = useState<'interactive' | 'drawing' | null>(null);
  // Landing selection page is disabled: app now opens directly in Interactive Map.
  const [showLanding, setShowLanding] = useState(false);
  const [showDrawingGlobe, setShowDrawingGlobe] = useState(() => {
    // Don't show any map until user picks from landing
    const fromInteractive = !!(window.history.state?.usr?.fromInteractiveMap);
    const fromDrawingParam = new URLSearchParams(window.location.search).get('drawingMap') === 'true';
    if (fromDrawingParam) return true;
    if (fromInteractive) return false;
    return false; // landing page handles the initial choice
  });

  useEffect(() => {
    if (!location.pathname.startsWith('/interactive')) return;
    setShowLanding(false);
    setShowDrawingGlobe(false);
    setShowInteractiveGlobe(true);
  }, [location.pathname]);
  const [isDrawingMiniPanelOpen, setIsDrawingMiniPanelOpen] = useState(false);
  const [isCommunityPanelVisible, setIsCommunityPanelVisible] = useState(false);
  const showDrawingQuickDock = false;
  // Trigger for opening ForYou panel from Interactive Map (avoids stale closure)
  const [forYouTrigger, setForYouTrigger] = useState(0);
  const localizedExhibitions = useMemo(
    () => exhibitions.map((ex) => localizeMuseum(ex as any, language)),
    [exhibitions, language],
  );

  useEffect(() => {
    const onMiniPanelVisibility = (e: Event) => {
      const detail = (e as CustomEvent).detail as { open?: boolean } | undefined;
      setIsDrawingMiniPanelOpen(!!detail?.open);
    };
    const onCommunityVisibility = (e: Event) => {
      const detail = (e as CustomEvent).detail as { open?: boolean } | undefined;
      setIsCommunityPanelVisible(!!detail?.open);
    };
    const onOpenForYou = () => setForYouTrigger(t => t + 1);
    window.addEventListener('drawing-mini-panel-visibility', onMiniPanelVisibility);
    window.addEventListener('community-panel-visibility', onCommunityVisibility);
    window.addEventListener('open-for-you', onOpenForYou);
    return () => {
      window.removeEventListener('drawing-mini-panel-visibility', onMiniPanelVisibility);
      window.removeEventListener('community-panel-visibility', onCommunityVisibility);
      window.removeEventListener('open-for-you', onOpenForYou);
    };
  }, []);

  // React to forYouTrigger with fresh closure (fixes stale closure from [] useEffect)
  useEffect(() => {
    if (forYouTrigger === 0) return;
    const w = 0;
    setForYouWeek(w);
    setShowForYou(true);
    fetchForYouRecommendations(w);
  }, [forYouTrigger]);

  // Dispatch map mode event whenever the active map changes
  useEffect(() => {
    const mode = showLanding ? 'landing' : showDrawingGlobe ? 'drawing' : showInteractiveGlobe ? 'interactive' : 'default';
    window.dispatchEvent(new CustomEvent('map-mode-changed', { detail: mode }));
  }, [showLanding, showDrawingGlobe, showInteractiveGlobe]);

  // Dark / light mode for home globe (persisted in localStorage)
  const [homeIsDark, setHomeIsDark] = useState<boolean>(() => {
    try { return localStorage.getItem('homeTheme') !== 'light'; } catch { return true; }
  });
  const toggleHomeTheme = () => {
    setHomeIsDark(v => {
      const next = !v;
      try { localStorage.setItem('homeTheme', next ? 'dark' : 'light'); } catch { }
      // Notify GlobalNav and other components that listen for theme changes
      window.dispatchEvent(new CustomEvent('theme-changed'));
      return next;
    });
  };

  useEffect(() => {
    const syncTheme = () => {
      try {
        setHomeIsDark(localStorage.getItem('homeTheme') !== 'light');
      } catch {
        setHomeIsDark(true);
      }
    };

    window.addEventListener('theme-changed', syncTheme);
    window.addEventListener('storage', syncTheme);
    return () => {
      window.removeEventListener('theme-changed', syncTheme);
      window.removeEventListener('storage', syncTheme);
    };
  }, []);


  // Removed Outline Globe toggle
  // D3 globe is the only globe mode when Globe is ON
  // Globe view uses react-globe.gl only (Cesium removed)
  // Hide the banner on a user's very first visit; remember preference afterwards

  // userLocation and resetZoomKey removed - My location button was removed
  const lastFlowIdRef = useRef<string | null>(null);
  // URL param handling for exhibition navigation from MyPage
  const [searchParams, setSearchParams] = useSearchParams();
  // Header reveal toggle state
  const [headerOn, setHeaderOn] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [dragPos, setDragPos] = useState(0); // 0..MAX range
  // Admin check
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<any>(null);
  // Separate Lightbox State for Fallback
  const [lightboxArtwork, setLightboxArtwork] = useState<any>(null);
  const [likedArtworks, setLikedArtworks] = useState<any[]>([]);

  // For You 추천 패널
  const [showForYou, setShowForYou] = useState(false);
  const [forYouResults, setForYouResults] = useState<any[]>([]);
  const [forYouLoading, setForYouLoading] = useState(false);
  const [forYouReason, setForYouReason] = useState<'ok' | 'no_index' | 'no_profile' | 'service_unavailable' | 'error' | null>(null);
  const [forYouWeek, setForYouWeek] = useState(0);
  const [forYouWeekCache, setForYouWeekCache] = useState<Record<number, any[]>>({});
  const [forYouCurrentIdx, setForYouCurrentIdx] = useState(0);
  const [forYouImageHovered, setForYouImageHovered] = useState(false);
  const filmstripRef = useRef<HTMLDivElement | null>(null);
  const forYouTouchRef = useRef<{x: number; y: number} | null>(null);
  const lastFilmstripScrollRef = useRef(0);

  const WORKER = 'https://armin-semantic-search.armin-art.workers.dev';

  // raw ID 형태 감지: "versailles-4939", "lacma-12345" 같은 컬렉션ID-숫자 패턴만 제거
  // 정상 제목: "Three Grizzlies", "La Liseuse" 등은 통과
  const KNOWN_COLLECTION_PREFIXES = /^(versailles|lacma|moma|aic|ngv|agnsw|hermitage|rijks|met|louvre|armin|pompidou|belvedere|albertina|nga|tate|vam|guggenheim|sfmoma|whitney|hirshhorn|walker|cleveland|detroit|boston|chicago|philly|dallas|denver|seattle|portland|mca|qagoma|tepapa|ngprague|bordeaux|lyon|madrid|berlin|vienna|florence|venice|rome|naples|amsterdam|brussels|stockholm|oslo|copenhagen|helsinki|warsaw|prague|budapest|bucharest|sofia|athens|lisbon|zurich|basel|geneva|lausanne|bern)-\d{3,}$/i;
  const isRawId = (name?: string): boolean => {
    if (!name) return false;
    const t = name.trim();
    return KNOWN_COLLECTION_PREFIXES.test(t);
  };

  const FORYOU_SEEN_KEY = 'armin_foryou_seen_v1';
  const getSeenForYouIds = (): Set<string> => {
    try {
      const raw = localStorage.getItem(FORYOU_SEEN_KEY);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch { return new Set(); }
  };
  const markForYouSeen = (ids: string[]) => {
    if (!ids.length) return;
    try {
      const seen = getSeenForYouIds();
      ids.forEach(id => seen.add(id));
      const arr = [...seen];
      const trimmed = arr.length > 3000 ? arr.slice(-3000) : arr;
      localStorage.setItem(FORYOU_SEEN_KEY, JSON.stringify(trimmed));
    } catch {}
  };

  // Upgrade stale Vectorize image URLs to higher quality where possible
  const upgradeImageUrl = (url: string): string => {
    if (!url) return url;
    // Pompidou: Vectorize indexed thumb_small at crawl time → upgrade to thumb_large (~40x resolution)
    if (url.includes('centrepompidou.fr') && url.includes('thumb_small')) {
      return url.replace(/thumb_small/g, 'thumb_large');
    }
    return url;
  };

  const fetchForYouRecommendations = useCallback(async (week: number = 0) => {
    if (!user || likedArtworks.length < 3) return;
    if (forYouWeekCache[week] && forYouWeekCache[week].length > 0) {
      setForYouResults(forYouWeekCache[week]);
      setForYouReason('ok');
      return;
    }
    setForYouLoading(true);
    setForYouReason(null);
    const likedIds = likedArtworks.map((a: any) => String(a.artworkId || a.id)).filter(Boolean);
    const likedSet = new Set(likedIds);
    const seenIds = getSeenForYouIds();
    const weekSeed = week * 137 + 42;

    try {
      // ── Step 1: Vectorize 기반 취향 추천 (vector ID 있는 경우) ──
      const tpRes = await fetch(`${WORKER}/taste-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, likedIds }),
      });

      if (tpRes.ok) {
        const recRes = await fetch(`${WORKER}/recommend`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.uid, likedIds, limit: 30 }),
        });
        if (recRes.ok) {
          const data = await recRes.json() as { results?: any[]; reason?: string };
          const step1candidates = (data.results || [])
            .filter((r: any) => !likedSet.has(String(r.id)))
            .filter((r: any) => !isRawId(r.n || r.name))
            .filter((r: any) => !isTextOrDocument(r.n || r.name || ''))
            .filter((r: any) => (r.i || '').trim().length > 0);
          let results = step1candidates.filter((r: any) => !seenIds.has(String(r.id))).slice(0, 30);
          if (results.length < 8) results = step1candidates.slice(0, 30);
          if (results.length >= 3) {
            markForYouSeen(results.map((r: any) => String(r.id)));
            setForYouResults(results);
            setForYouWeekCache((prev: Record<number, any[]>) => ({ ...prev, [week]: results }));
            setForYouReason('ok');
            setForYouLoading(false);
            return;
          }
        }
      }

      // ── Step 2: 50% 임베딩 + 50% 작가 메타데이터 기반 추천 ──

      // 아티스트명 정제
      const cleanArtistName = (raw: string): string => raw
        .replace(/\s*[-–—]\s*(ontwerper|designer|architect|sculptor|painter|printmaker|photographer|illustrator|\w{1,12})\s*$/i, '')
        .replace(/\s*\([^)]*\)\s*$/g, '')
        .replace(/^([A-Z]{2,}(?:\s+[A-Z]{2,})+)$/, s => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()))
        .trim();

      // 전체 좋아요에서 작가 빈도 분석 (제한 없음)
      const artistFreq = new Map<string, number>();
      likedArtworks.forEach((a: any) => {
        const artist = cleanArtistName((a.artist || a.a || '').trim());
        if (artist && artist !== 'Unknown' && artist.length > 2 && artist.length < 60)
          artistFreq.set(artist, (artistFreq.get(artist) || 0) + 1);
      });
      const allArtistsSorted = [...artistFreq.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);

      if (allArtistsSorted.length === 0) {
        setForYouReason('no_index'); setForYouResults([]); setForYouLoading(false); return;
      }

      // ── 공통 필터 함수 ──
      const baseFilter = (r: any) =>
        !likedSet.has(String(r.id)) &&
        !isRawId(r.n || r.name) &&
        !isTextOrDocument(r.n || r.name || '') &&
        (r.i || '').trim().length > 0;

      // ── 취향 centroid 계산 (상위 8명 개별 인코딩 → 2-cluster 분석) ──
      const embArtists = allArtistsSorted.slice(0, 8);
      console.log(`[ForYou week=${week}] encoding ${embArtists.length} artists for taste centroid...`);
      const artistVectors = (await Promise.all(
        embArtists.map(a => encodeText(`${a}, oil painting on canvas, fine art museum masterpiece`))
      )).filter((v): v is number[] => v !== null && v.length === 768);

      if (artistVectors.length < 1) {
        setForYouReason('service_unavailable'); setForYouResults([]); setForYouLoading(false); return;
      }

      // 2-cluster 주차 교차 제거: cluster B가 동양화 등 특정 취향에 100% 편향되는 문제.
      // Next Week 신선함은 seenIds로 이미 보장됨 → 항상 global centroid 사용.
      const weekCentroid = _vectorMean(artistVectors);
      console.log(`[ForYou] global centroid from ${artistVectors.length} artist vectors`);

      // ── Half A: 취향 centroid → 새로운 발견 (emb) ──
      const embCandidates = await searchByVector(weekCentroid, 80);
      const embPool = embCandidates.filter(r => baseFilter(r) && !seenIds.has(String(r.id)));
      console.log(`[ForYou] emb pool (centroid): ${embPool.length} / ${embCandidates.length}`);

      // ── Half B: 좋아요 작품과 유사한 작품 찾기 (meta) ──
      // centroid는 "평균 스타일" → Henri Rousseau 같은 평균적 작가 반환.
      // 실제 좋아요 작품 ID → /similar-to → 이미지 벡터 직접 비교
      // → 같은 작가 작품이 상위에 오는 것이 보장됨.
      const allLikedIds = likedArtworks
        .map((lw: any) => String(lw.id || '')).filter(Boolean);
      // 주차별 결정론적 샘플링: 매주 다른 좋아요 작품 10개 선택
      const SAMPLE_SIZE = 10;
      const weekSampled = allLikedIds
        .map((id: string, i: number) => ({ id, key: (i * 1013 + week * 9907) % 1000000 }))
        .sort((a: any, b: any) => a.key - b.key)
        .slice(0, SAMPLE_SIZE)
        .map((x: any) => x.id);
      console.log(`[ForYou] meta: similar-to ${weekSampled.length} liked artworks (week ${week})`);

      const similarResults = await Promise.all(
        weekSampled.map((id: string) => searchSimilarTo(id, 12))
      );

      // 중복 제거 + 기본 필터 적용
      const metaPool: any[] = [];
      const metaPoolIds = new Set<string>();
      for (const results of similarResults) {
        for (const r of results) {
          const rid = String(r.id);
          if (!metaPoolIds.has(rid) && baseFilter(r) && !seenIds.has(rid)) {
            metaPoolIds.add(rid);
            metaPool.push(r);
          }
        }
      }
      console.log(`[ForYou] meta pool (similar-to): ${metaPool.length}`
        + ` | artists: ${[...new Set(metaPool.slice(0, 8).map((r: any) => r.a).filter(Boolean))].join(', ')}`);

      // ── seenIds 리셋: 둘 다 너무 적으면 초기화 ──
      let workingEmb = embPool, workingMeta = metaPool;
      if (embPool.length < 5 && metaPool.length < 5) {
        console.log('[ForYou] Not enough fresh results — resetting seen history');
        try { localStorage.removeItem('armin_foryou_seen_v1'); } catch {}
        workingEmb  = embCandidates.filter(baseFilter);
        // meta는 seenIds 없이 재필터
        const resetMeta: any[] = [];
        const resetMetaIds = new Set<string>();
        for (const results of similarResults) {
          for (const r of results) {
            const rid = String(r.id);
            if (!resetMetaIds.has(rid) && baseFilter(r)) {
              resetMetaIds.add(rid); resetMeta.push(r);
            }
          }
        }
        workingMeta = resetMeta;
      }

      // ── 30개 보장: meta 부족분은 emb로 채움 ──
      const metaHalf = workingMeta.slice(0, 15);
      const embHalf  = workingEmb.slice(0, 30 - metaHalf.length);

      // ── 홀짝 인터리빙: 홀수=emb(발견), 짝수=meta(좋아요 작가) ──
      const filtered: any[] = [];
      const maxLen = Math.max(embHalf.length, metaHalf.length);
      for (let i = 0; i < maxLen; i++) {
        if (embHalf[i])  filtered.push({ ...embHalf[i],  _src: 'emb' });
        if (metaHalf[i]) filtered.push({ ...metaHalf[i], _src: 'meta' });
      }
      console.log(`[ForYou] final: ${filtered.filter(r=>r._src==='emb').length} emb + ${filtered.filter(r=>r._src==='meta').length} meta = ${filtered.length} total`);

      if (filtered.length === 0) {
        setForYouReason('service_unavailable'); setForYouResults([]); setForYouLoading(false); return;
      }

      // Pompidou 작품 이미지 URL을 컬렉션 JSON의 original_image로 업그레이드
      let finalResults = filtered;
      const hasPompidou = finalResults.some((r: any) => (r.m || '').toLowerCase().includes('pompidou'));
      if (hasPompidou) {
        const pompMap = await getPompidouImageMap();
        if (pompMap.size > 0) {
          finalResults = finalResults.map((r: any) => {
            if ((r.m || '').toLowerCase().includes('pompidou')) {
              const betterImg = pompMap.get((r.n || '').toLowerCase().trim());
              if (betterImg) return { ...r, i: betterImg };
            }
            return r;
          });
        }
      }

      markForYouSeen(finalResults.map((r: any) => String(r.id)));
      setForYouResults(finalResults);
      setForYouWeekCache((prev: Record<number, any[]>) => ({ ...prev, [week]: finalResults }));
      setForYouCurrentIdx(0);
      setForYouReason(finalResults.length > 0 ? 'ok' : 'no_index');
    } catch (err) {
      console.error('[ForYou] unexpected error:', err);
      setForYouResults([]);
      setForYouReason('error');
    } finally {
      setForYouLoading(false);
    }
  }, [user, likedArtworks, forYouWeekCache]);
  // Filmstrip: auto-scroll horizontally to center the active thumbnail
  useEffect(() => {
    const el = filmstripRef.current;
    if (!el || !forYouResults.length) return;
    const ITEM_W = 90; // 78px thumb + 12px gap
    const target = forYouCurrentIdx * ITEM_W - el.clientWidth / 2 + ITEM_W / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [forYouCurrentIdx]);

  const isNetworkConstrained = shouldLimitNetwork();

  useEffect(() => {
    let unsubLikes: (() => void) | null = null;
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAdmin(!!(u && ADMIN_EMAILS.includes(u.email || '')));
      if (unsubLikes) {
        unsubLikes();
        unsubLikes = null;
      }
      if (u) {
        if (isNetworkConstrained) {
          getDocs(collection(db, `users/${u.uid}/liked_artworks`)).then((snap) => {
            const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
            setLikedArtworks(list);
          }).catch(() => {
            setLikedArtworks([]);
          });
          return;
        }
        // Listen to likes
        unsubLikes = onSnapshot(collection(db, `users/${u.uid}/liked_artworks`), (snap) => {
          const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
          setLikedArtworks(list);
        });
      } else {
        setLikedArtworks([]);
      }
    });
    return () => {
      if (unsubLikes) unsubLikes();
      unsub();
    };
  }, [isNetworkConstrained]);
  // removed pulse to keep a single, smooth grow animation
  const trackRef = useRef<HTMLDivElement | null>(null);
  const KNOB_SIZE = 24; // px
  const TRACK_H = 28; // px
  const TRACK_W = 54; // px
  const TRACK_PAD = 2; // px
  const MAX_POS = TRACK_W - KNOB_SIZE - TRACK_PAD * 2; // slide range
  const KNOB_SLIDE_MS = 240; // fast slide duration
  const [scaleActive, setScaleActive] = useState(false); // trigger grow after slide completes

  // Tag body to apply homepage-specific font
  useEffect(() => {
    document.body.setAttribute('data-home', 'true');
    return () => { document.body.removeAttribute('data-home'); };
  }, []);

  // Sync dragPos to state when headerOn changes (if not actively dragging)
  useEffect(() => {
    if (!dragActive) setDragPos(headerOn ? MAX_POS : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headerOn]);

  // Pointer handlers for sliding knob
  useEffect(() => {
    if (!dragActive) return;
    let startX = 0;
    let base = dragPos;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = (e as TouchEvent).touches?.[0]?.clientX ?? (e as MouseEvent).clientX;
      if (startX === 0) return;
      const delta = clientX - startX;
      const next = Math.max(0, Math.min(MAX_POS, base + delta));
      setDragPos(next);
    };
    const onUp = () => {
      setDragActive(false);
      const turnedOn = dragPos > MAX_POS / 2;
      setHeaderOn(turnedOn);
      window.removeEventListener("mousemove", onMove as any);
      window.removeEventListener("touchmove", onMove as any);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
    const onDown = (e: MouseEvent | TouchEvent) => {
      // initialize startX when first move occurs
      const clientX = (e as TouchEvent).touches?.[0]?.clientX ?? (e as MouseEvent).clientX;
      startX = clientX;
      base = dragPos;
    };
    window.addEventListener("mousemove", onMove as any);
    window.addEventListener("touchmove", onMove as any, { passive: false });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    window.addEventListener("mousedown", onDown as any, { once: true });
    window.addEventListener("touchstart", onDown as any, { once: true });
    return () => {
      window.removeEventListener("mousemove", onMove as any);
      window.removeEventListener("touchmove", onMove as any);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragActive]);

  const collectionIndex = useMemo(() => {
    const map = new Map<string, { museum: Exhibition; exhibition: ExhibitionItem }>();
    const register = (museum: Exhibition, entry?: ExhibitionItem) => {
      if (!entry) return;
      const tokens = collectExhibitionTokens(entry);
      if (tokens.size === 0) return;
      tokens.forEach((token) => {
        if (!map.has(token)) {
          map.set(token, { museum, exhibition: entry });
        }
      });
    };
    exhibitions.forEach((ex) => {
      ((ex as any).permanentExhibitions || []).forEach((entry: ExhibitionItem) => register(ex, entry));
      ((ex as any).temporaryExhibitions || []).forEach((entry: ExhibitionItem) => register(ex, entry));
      ((ex as any).pastExhibitions || []).forEach((entry: ExhibitionItem) => register(ex, entry));
    });
    return map;
  }, [exhibitions]);

  const getCollectionEntry = useCallback((collectionId?: string | null) => {
    if (!collectionId) return null;
    const token = normalizeToken(collectionId);
    if (!token) return null;
    const cached = collectionIndex.get(token);
    if (cached) return cached;

    for (const museum of exhibitions) {
      const buckets = [
        ...((museum as any).permanentExhibitions || []),
        ...((museum as any).temporaryExhibitions || []),
        ...((museum as any).pastExhibitions || []),
      ];
      for (const entry of buckets) {
        const tokens = collectExhibitionTokens(entry);
        if (tokens.has(token)) {
          console.warn('[collection-index] late-resolved entry', collectionId);
          return { museum, exhibition: entry as ExhibitionItem };
        }
      }
    }

    console.warn('[collection-index] missing entry', collectionId);
    return null;
  }, [collectionIndex, exhibitions]);

  const guessCollectionFromArtwork = useCallback((artwork?: SearchableArtwork | null) => {
    if (!artwork) return null;
    const candidates = new Set<string>();
    if (artwork.exhibitionId) candidates.add(artwork.exhibitionId);
    if (artwork.id) {
      const parts = artwork.id.split(/[-_]/);
      for (let len = parts.length; len > 1; len--) {
        candidates.add(parts.slice(0, len).join("-"));
      }
    }
    for (const candidate of candidates) {
      const entry = getCollectionEntry(candidate);
      if (entry) return entry;
    }
    return null;
  }, [getCollectionEntry]);

  const openCollectionModal = useCallback((collectionId?: string | null, artwork?: SearchableArtwork | null, opts?: { skipNavigate?: boolean; replace?: boolean }) => {
    const entry = getCollectionEntry(collectionId || undefined);
    if (!entry) return false;
    setSelectedExhibition(entry.museum);
    setSelectedModalExhibition({
      ...entry.exhibition,
      initialArtwork: artwork || undefined,
    } as ExhibitionItem & { initialArtwork?: SearchableArtwork });
    if (!opts?.skipNavigate) {
      const target = `/collection/${encodeURIComponent(entry.exhibition.id)}`;
      if (location.pathname !== target) {
        navigate(target, { replace: !!opts?.replace });
      }
    }
    return true;
  }, [getCollectionEntry, location.pathname, navigate]);

  const closeCollectionModal = useCallback(() => {
    setSelectedModalExhibition(null);
    if (location.pathname.startsWith('/collection/')) {
      // Prefer history.back so the user returns to wherever they opened
      // the modal from (e.g. /ai weekly curation, /search results). Only
      // fall back to '/' when there's no in-app history to pop — that's
      // the deep-link / direct-load case where '/' is the safest landing.
      if (window.history.length > 1) navigate(-1);
      else navigate('/', { replace: true });
    }
  }, [location.pathname, navigate]);

  // Handle exhibition URL params from MyPage navigation
  useEffect(() => {
    const exhibitionId = searchParams.get('exhibition');
    if (exhibitionId) {
      const decodedId = decodeURIComponent(exhibitionId);

      // Find the exhibition item and its parent museum
      for (const ex of exhibitions) {
        // Check permanent exhibitions
        const permItems = (ex as any).permanentExhibitions || [];
        const permHit = permItems.find((it: any) => it && it.id === decodedId);
        if (permHit) {
          openCollectionModal(permHit.id, null);
          setSearchParams({}); // Clear param after handling
          sessionStorage.removeItem('pendingExhibition');
          return;
        }
        // Check temporary exhibitions
        const tempItems = (ex as any).temporaryExhibitions || [];
        const tempHit = tempItems.find((it: any) => it && it.id === decodedId);
        if (tempHit) {
          openCollectionModal(tempHit.id, null);
          setSearchParams({});
          sessionStorage.removeItem('pendingExhibition');
          return;
        }
        // Check past exhibitions
        const pastItems = (ex as any).pastExhibitions || [];
        const pastHit = pastItems.find((it: any) => it && it.id === decodedId);
        if (pastHit) {
          openCollectionModal(pastHit.id, null);
          setSearchParams({});
          sessionStorage.removeItem('pendingExhibition');
          return;
        }
      }

      // If not found in exhibitions, try to use data from sessionStorage
      const pendingData = sessionStorage.getItem('pendingExhibition');
      if (pendingData) {
        try {
          const exhibitionData = JSON.parse(pendingData);
          // Create a minimal exhibition object for the modal
          const minimalExhibition = {
            id: exhibitionData.id,
            name: exhibitionData.name,
            title: exhibitionData.name,
            image: exhibitionData.image,
            description: '',
            startDate: '',
            endDate: '',
          };
          // Find the parent museum by name if available
          const parentMuseum = exhibitions.find((ex: any) =>
            ex.name === exhibitionData.museumName
          );
          if (parentMuseum) {
            setSelectedExhibition(parentMuseum);
          }
          setSelectedModalExhibition(minimalExhibition as any);
          setSearchParams({});
          sessionStorage.removeItem('pendingExhibition');
        } catch (e) {
          console.error('Failed to parse pending exhibition data', e);
          setSearchParams({});
        }
      } else {
        // Clear the param if we can't find the exhibition
        setSearchParams({});
      }
    }
  }, [searchParams, exhibitions, setSearchParams, openCollectionModal]);

  // Handle ?selectMuseum=ID for direct navigation to museum pin
  useEffect(() => {
    const museumId = searchParams.get('selectMuseum');
    if (museumId) {
      const museum = exhibitions.find(e => e.id === museumId);
      if (museum) {
        setSelectedExhibition(museum);
        setSelectedModalExhibition(null);
      }
      // Remove the param without removing other potential params (though usually this navigation is exclusive)
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('selectMuseum');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, exhibitions, setSearchParams]);

  // Open/close collection modal based on route
  useEffect(() => {
    if (!collectionId) {
      setSelectedModalExhibition(null);
      return;
    }
    const decodedId = decodeURIComponent(collectionId);
    openCollectionModal(decodedId, null, { skipNavigate: true, replace: true });
  }, [collectionId, openCollectionModal]);
  // One-shot Flow is handled directly in the Flow button onClick

  // Control Navbar visibility via CSS var
  useEffect(() => {
    const root = document.documentElement;
    // ensure hidden on first render (no white bar)
    root.style.setProperty('--navbar-translateY', headerOn ? 'translateY(0)' : 'translateY(-100%)');
    // sequence grow after fast knob slide on ON
    let scaleTimer: number | undefined;
    if (headerOn) {
      // grow after knob slides to the right
      if (scaleTimer) window.clearTimeout(scaleTimer);
      scaleTimer = window.setTimeout(() => setScaleActive(true), KNOB_SLIDE_MS + 40);
    } else {
      // shrink after knob slides back to the left
      if (scaleTimer) window.clearTimeout(scaleTimer);
      scaleTimer = window.setTimeout(() => setScaleActive(false), KNOB_SLIDE_MS + 40);
    }
    // notify Navbar for per-element animations
    try {
      window.dispatchEvent(new CustomEvent('header-toggle', { detail: { on: headerOn } }));
    } catch { }
    return () => {
      // restore default when leaving page
      root.style.setProperty('--navbar-translateY', 'translateY(0)');
      if (scaleTimer) window.clearTimeout(scaleTimer);
    };
  }, [headerOn]);

  // Auto-open modal after refresh if history.state indicates a modal was open.
  useEffect(() => {
    const openFromHistory = () => {
      try {
        const st = (window.history.state || {}) as any;
        if (st && st.modal && st.exhibitionId) {
          // find the ExhibitionItem by id across all exhibitions
          let foundItem: ExhibitionItem | null = null;
          let parent: Exhibition | null = null;
          for (const ex of exhibitions) {
            const items = (ex as any).permanentExhibitions || [];
            if (Array.isArray(items)) {
              const hit = items.find((it: any) => it && (it.id === st.exhibitionId));
              if (hit) { foundItem = hit; parent = ex; break; }
            }
          }
          if (foundItem) {
            // Open underlying details (right panel) and the modal on top
            // Avoid overriding if already set from initial state
            setSelectedExhibition(prev => prev ?? parent);
            setSelectedModalExhibition(prev => prev ?? foundItem);
          }
        }
      } catch { }
    };

    // If not already seeded from initial state, attempt once on mount
    if (!selectedModalExhibition) openFromHistory();

    const onLoadedWithModal = () => openFromHistory();
    window.addEventListener('exhibitionModal:loadedWithModal', onLoadedWithModal as any);
    return () => {
      window.removeEventListener('exhibitionModal:loadedWithModal', onLoadedWithModal as any);
    };
  }, [exhibitions, selectedModalExhibition]);

  const handleToggleLike = async (_e: any, art: any) => {
    if (!user) {
      // Silent fail or prompt
      return;
    }
    const id = art.artworkId || art.id;
    const isLiked = likedArtworks.some(a => (a.artworkId || a.id) === id);
    const ref = doc(db, `users/${user.uid}/liked_artworks/${id}`);

    if (isLiked) {
      await deleteDoc(ref);
    } else {
      const normalizedArt = {
        ...art,
        id,
        image: art.image || art.i || '',
        title: art.title || art.n || art.name || 'Untitled',
        artist: art.artist || art.a || 'Unknown',
        museumName: art.museumName || art.m || '',
        url: art.url || art.u || '',
        exhibitionId: art.exhibitionId || art.e || '',
      };
      
      await setDoc(ref, {
        ...normalizedArt,
        likedAt: serverTimestamp(),
      });
    }
  };

  // ── Landing selection overlay ────────────────────────────────────────────
  if (showLanding) {
    const hovI = landingHover === 'interactive';
    const hovD = landingHover === 'drawing';

    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        display: 'flex',
        fontFamily: "'Space Grotesk', 'Inter', sans-serif",
        userSelect: 'none',
        overflow: 'hidden',
      }}>
        <style>{`
          @keyframes lp-lon-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
          @keyframes lp-lon-spin-rev {
            from { transform: rotate(0deg); }
            to   { transform: rotate(-360deg); }
          }
          @keyframes lp-dot-pulse {
            0%, 100% { opacity: 0.55; r: 3; }
            50%       { opacity: 1; r: 4.5; }
          }
          @keyframes lp-draw-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
          @keyframes lp-draw-spin-rev {
            from { transform: rotate(0deg); }
            to   { transform: rotate(-360deg); }
          }
        `}</style>

        {/* ── LEFT PANEL — Interactive Globe ── */}
        <div
          onClick={() => { setShowLanding(false); setShowInteractiveGlobe(true); }}
          onMouseEnter={() => setLandingHover('interactive')}
          onMouseLeave={() => setLandingHover(null)}
          style={{
            flex: hovD ? '0.60' : '1',
            transition: 'flex 0.78s cubic-bezier(0.22, 1, 0.36, 1)',
            background: '#07060a',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            overflow: 'hidden',
          }}
        >
          {/* COLLY label top-left */}
          <div style={{
            position: 'absolute', top: 30, left: 34,
            fontSize: 11, letterSpacing: '0.32em', textTransform: 'uppercase',
            color: hovI ? 'rgba(201,165,90,0.65)' : 'rgba(201,165,90,0.28)',
            fontWeight: 500, fontFamily: "'Space Grotesk', sans-serif",
            transition: 'color 0.4s ease',
          }}>COLLY</div>

          {/* Ambient hover glow */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(201,165,90,0.055) 0%, transparent 70%)',
            opacity: hovI ? 1 : 0, transition: 'opacity 0.8s ease',
          }} />

          {/* Interactive Globe — real D3 spinning globe */}
          <div style={{
            transform: hovI ? 'scale(1.06)' : 'scale(0.80)',
            opacity: hovI ? 1 : 0.55,
            transition: 'transform 0.9s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.7s ease',
            marginBottom: 38,
          }}>
            <MiniSpinningGlobe size={220} variant="interactive" speed={8} />
          </div>

          {/* Text — Space Grotesk matching actual Interactive Globe */}
          <div style={{
            textAlign: 'center',
            opacity: hovI ? 1 : 0.35,
            transform: hovI ? 'translateY(0)' : 'translateY(10px)',
            transition: 'opacity 0.55s ease, transform 0.68s cubic-bezier(0.22, 1, 0.36, 1)',
            fontFamily: "'Space Grotesk', sans-serif",
          }}>
            <div style={{
              fontSize: 19, fontWeight: 500, letterSpacing: '0.08em',
              color: 'rgba(201,165,90,0.95)', marginBottom: 9,
            }}>{t({ ko: '인터랙티브 글로브', en: 'Interactive Globe' })}</div>
            <div style={{ fontSize: 11, lineHeight: 1.75, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.04em' }}>
              {t({ ko: '확대 가능한 3D 지구본 · 지역 필터', en: 'Zoomable 3D globe · Filter by region' })}<br />
              {t({ ko: '도시 단위 미술관 탐색', en: 'City-level museum discovery' })}
            </div>
            <div style={{
              marginTop: 20, fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase',
              color: hovI ? 'rgba(201,165,90,0.75)' : 'rgba(201,165,90,0.18)',
              transition: 'color 0.45s ease',
            }}>{t({ ko: '입장 →', en: 'Enter →' })}</div>
          </div>

          {/* Right edge separator */}
          <div style={{
            position: 'absolute', right: 0, top: '6%', bottom: '6%', width: 1,
            background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.05) 75%, transparent)',
          }} />
        </div>

        {/* ── RIGHT PANEL — Drawing Map ── */}
        <div
          onClick={() => { setShowLanding(false); setShowDrawingGlobe(true); }}
          onMouseEnter={() => setLandingHover('drawing')}
          onMouseLeave={() => setLandingHover(null)}
          style={{
            flex: hovI ? '0.60' : '1',
            transition: 'flex 0.78s cubic-bezier(0.22, 1, 0.36, 1)',
            background: '#F2EEE4',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            overflow: 'hidden',
          }}
        >
          {/* Hidden SVG filter for text warp */}
          <svg style={{ position: 'absolute', width: 0, height: 0 }}>
            <defs>
              <filter id="lp-text-warp" x="-10%" y="-20%" width="120%" height="140%">
                <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="7" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" xChannelSelector="R" yChannelSelector="G" />
              </filter>
            </defs>
          </svg>

          {/* COLLY label top-right — pill shape matching Drawing Map's actual COLLY logo */}
          <div style={{ position: 'absolute', top: 24, right: 28, opacity: hovD ? 0.8 : 0.35, transition: 'opacity 0.4s ease' }}>
            <svg width="72" height="30" viewBox="0 0 72 30" style={{ overflow: 'visible' }}>
              <defs>
                <filter id="lp-colly-sketch" x="-8%" y="-20%" width="116%" height="140%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="5" result="noise" />
                  <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.8" xChannelSelector="R" yChannelSelector="G" />
                </filter>
              </defs>
              <g filter="url(#lp-colly-sketch)">
                <rect x="1.5" y="1.5" width="69" height="27" rx="13.5"
                  fill="white" stroke="#111111" strokeWidth="2.2" />
                <text x="36" y="16" textAnchor="middle" dominantBaseline="middle"
                  fontFamily="'Space Mono', monospace" fontWeight="700"
                  fontSize="11" letterSpacing="2" fill="#111111">COLLY</text>
              </g>
            </svg>
          </div>

          {/* Drawing Map — real D3 spinning globe */}
          <div style={{
            transform: hovD ? 'scale(1.06)' : 'scale(0.80)',
            opacity: hovD ? 1 : 0.55,
            transition: 'transform 0.9s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.7s ease',
            marginBottom: 38,
          }}>
            <MiniSpinningGlobe size={220} variant="drawing" speed={8} />
          </div>

          {/* Text — Space Mono matching actual DrawingGlobe, with hand-drawn warp */}
          <div style={{
            textAlign: 'center',
            opacity: hovD ? 1 : 0.32,
            transform: hovD ? 'translateY(0)' : 'translateY(10px)',
            transition: 'opacity 0.55s ease, transform 0.68s cubic-bezier(0.22, 1, 0.36, 1)',
            fontFamily: "'Space Mono', monospace",
          }}>
            <div style={{
              fontSize: 19, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
              color: '#111', marginBottom: 9,
              filter: hovD ? 'url(#lp-text-warp)' : 'none',
              transition: 'filter 0.3s ease',
              display: 'inline-block',
            }}>{t({ ko: '드로잉 맵', en: 'DRAWING MAP' })}</div>
            <div style={{
              fontSize: 11, lineHeight: 1.75, color: 'rgba(0,0,0,0.36)',
              letterSpacing: '0.04em', fontFamily: "'Space Mono', monospace",
            }}>
              {t({ ko: '브루탈리스트 스케치 글로브 · 흑백', en: 'Brutalist sketch globe · Black & white' })}<br />
              {t({ ko: '손그림 감성 내비게이션', en: 'Hand-drawn tactile navigation' })}
            </div>
            <div style={{
              marginTop: 20, fontSize: 10, letterSpacing: '0.24em',
              textTransform: 'uppercase',
              color: hovD ? '#111' : 'rgba(0,0,0,0.18)',
              transition: 'color 0.45s ease',
              fontFamily: "'Space Mono', monospace",
            }}>{t({ ko: '입장 →', en: 'ENTER →' })}</div>
          </div>
        </div>

        {/* Bottom center stats */}
        <div style={{
          position: 'absolute', bottom: 26, left: 0, right: 0,
          display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <div style={{
            fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase',
            color: 'rgba(128,122,108,0.32)', fontFamily: "'Space Mono', monospace",
          }}>{(() => {
            const a = (totalArtworks ?? 614746).toLocaleString();
            const m = exhibitions.length;
            return t({ ko: `${a} 작품 · 전 세계 미술관 ${m}곳`, en: `${a} artworks · ${m} museums worldwide` });
          })()}</div>
        </div>
      </div>
    );
  }

  const memoizedSearchProps = useMemo(() => ({
    onOpenLightbox: (artwork: any, openLightbox = true) => {
      if (!openLightbox) return;
      if (artwork.exhibitionId && openCollectionModal(artwork.exhibitionId, artwork)) return;
      const guessed = guessCollectionFromArtwork(artwork);
      if (guessed && openCollectionModal(guessed.exhibition.id, artwork)) return;
      setLightboxArtwork(artwork);
    },
    museums: exhibitions.map(ex => {
      const localized = localizeMuseum(ex as any, language);
      return {
        ...(localized as any),
        id: ex.id,
        name: (ex as any).name,
        country: (ex as any).country || '',
        region: (ex as any).region,
        latitude: (ex as any).latitude || 0,
        longitude: (ex as any).longitude || 0,
        representativeImage: (ex as any).representativeImage,
        permanentExhibitions: (ex as any).permanentExhibitions || [],
      };
    }),
    onNavigateToMuseum: (museum: any, collectionId?: string, artwork?: any) => {
      if (openCollectionModal(collectionId, artwork)) return;
      if (artwork && openCollectionModal(artwork.exhibitionId, artwork)) return;
      const guessedEntry = guessCollectionFromArtwork(artwork);
      if (guessedEntry && openCollectionModal(guessedEntry.exhibition.id, artwork)) return;
      const fallbackMuseum = exhibitions.find(e => e.id === museum.id) || guessedEntry?.museum;
      if (fallbackMuseum) {
        setSelectedExhibition(fallbackMuseum);
        const firstPermanent = ((fallbackMuseum as any).permanentExhibitions || [])[0];
        if (collectionId && firstPermanent && firstPermanent.id === collectionId) {
          setSelectedModalExhibition({ ...firstPermanent, initialArtwork: artwork });
          return;
        }
        setSelectedModalExhibition(null);
        return;
      }
      setSelectedModalExhibition({
        id: artwork?.id || museum.id,
        name: museum.name,
        title: museum.name,
        image: artwork?.image,
        description: artwork?.name || '',
        startDate: '',
        endDate: '',
        initialArtwork: artwork,
      } as any);
    },
  }), [exhibitions, language]); // Functions inside refer to mostly stable hooks

  return (
    <>
      <div style={{ position: "relative", width: "100vw", height: "100dvh", minHeight: "100svh", overflow: "hidden" }}>
        {/* Toggle hidden per user request */}
        <div style={{ position: "fixed", top: 12, left: 12, zIndex: 4500, display: 'none' }}>
          <div
            ref={trackRef}
            onClick={() => !dragActive && setHeaderOn(v => !v)}
            onContextMenu={async (e) => {
              e.preventDefault();
              try {
                const EyeDropperCtor = (window as any).EyeDropper;
                if (!EyeDropperCtor) {
                  alert(t({ ko: '현재 브라우저는 EyeDropper를 지원하지 않습니다. 최신 크로미움 기반 브라우저를 사용해주세요.', en: 'This browser does not support EyeDropper. Please use a recent Chromium-based browser.' }));
                  return;
                }
                const eyeDropper = new EyeDropperCtor();
                const res = await eyeDropper.open();
                if (res && res.sRGBHex) {
                  setToggleOnColor(res.sRGBHex);
                  try { localStorage.setItem('toggleOnColor', res.sRGBHex); } catch { }
                }
              } catch (err) {
                // silently ignore cancellation
                console.warn('EyeDropper cancelled or failed', err);
              }
            }}
            style={{
              width: TRACK_W,
              height: TRACK_H,
              borderRadius: TRACK_H / 2,
              background: headerOn || dragPos > MAX_POS / 2 ? toggleOnColor : "#d1d5db",
              position: "relative",
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)",
              cursor: "pointer",
              // single smooth grow/shrink (starts after knob slide completes)
              transition: dragActive ? "none" : "background-color 220ms ease, transform 1200ms ease-in-out",
              transform: scaleActive ? 'scale(3.2)' : 'scale(1)',
              transformOrigin: 'left top',
              willChange: 'transform',
              userSelect: "none",
            }}
          >
            <div
              role="button"
              aria-label="Reveal header"
              onMouseDown={(e) => { e.preventDefault(); setDragActive(true); }}
              onTouchStart={(e) => { e.preventDefault(); setDragActive(true); }}
              style={{
                position: "absolute",
                top: TRACK_PAD,
                left: TRACK_PAD + dragPos,
                width: KNOB_SIZE,
                height: KNOB_SIZE,
                borderRadius: "50%",
                background: "#fff",
                boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
                // fast slide first
                transition: dragActive ? "none" : `left ${KNOB_SLIDE_MS}ms ease-out`,
                transform: 'scale(1)',
                transformOrigin: 'left top',
                touchAction: "none",
              }}
            />
          </div>
        </div>
        {/* Fullscreen map */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100dvh",
            minHeight: "100svh",
            zIndex: 1,
            touchAction: 'none',
            overflow: 'hidden'
          }}
        >
          {/* D3GeoGlobeSimplified intentionally disabled — Drawing Map is the default entry */}
          {/* 'My location' button moved to bottom-center controls to align with Globe/2D toggle */}
        </div>
        {/* Bottom center controls: Flow + Globe toggle + map modes - HIDDEN per user request */}
        <div style={{ position: "fixed", bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 4000, display: 'none', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {/* Flow button - moved first */}
          <button
            onClick={() => {
              if (!exhibitions.length) return;
              let candidate: Exhibition | null = null;
              for (let i = 0; i < 5; i++) {
                const idx = Math.floor(Math.random() * exhibitions.length);
                const ex = exhibitions[idx];
                if (ex.id !== lastFlowIdRef.current) { candidate = ex; break; }
              }
              candidate = candidate || exhibitions[Math.floor(Math.random() * exhibitions.length)];
              lastFlowIdRef.current = candidate.id;
              setSelectedExhibition(candidate);
            }}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: '1px solid rgba(201, 165, 90, 0.3)',
              background: 'rgba(8, 8, 7, 0.82)',
              color: '#f0ede6',
              cursor: "pointer",
              boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
              minWidth: 96,
              fontWeight: 700,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              letterSpacing: '0.04em',
            }}
          >
            Flow
          </button>
        </div>
        {/* Selected museum details */}
        {selectedExhibition && !showDrawingGlobe && (
          <ExhibitionDetails
            exhibition={localizeMuseum(selectedExhibition as any, language)}
            onClose={() => setSelectedExhibition(null)}
            isOpen={!!selectedExhibition && !selectedModalExhibition && !lightboxArtwork && !isOverlayOpen}
            onSelectExhibition={item => openCollectionModal(item?.id, null)}
          />
        )}
        {/* Exhibition modal */}
        {
          selectedModalExhibition && (
            <Suspense fallback={null}>
              <ExhibitionModal
                exhibition={selectedModalExhibition}
                museumName={selectedExhibition ? localizeMuseum(selectedExhibition as any, language).name : undefined}
                onClose={closeCollectionModal}
                variant={homeIsDark ? 'default' : 'sketch'}
                theme={homeIsDark ? 'dark' : 'light'}
              />
            </Suspense>
          )
        }

        {/* Unified Artwork Lightbox for Search Results */}
        {
          lightboxArtwork && (
            <ArtworkLightbox
              artwork={lightboxArtwork}
              onClose={() => setLightboxArtwork(null)}
              isLiked={likedArtworks.some(a => (a.artworkId || a.id) === (lightboxArtwork.artworkId || lightboxArtwork.id))}
              onToggleLike={handleToggleLike}
              likedArtworksList={likedArtworks}
              onChangeArtwork={setLightboxArtwork}
            />
          )
        }



        {/* ── Map toggle buttons — bottom-left stack, each styled to its destination ── */}
        {!selectedModalExhibition && !lightboxArtwork && !isOverlayOpen && !showDrawingGlobe && !showInteractiveGlobe && (
          <div style={{
            position: "fixed",
            bottom: 24,
            left: 20,
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            alignItems: "flex-start",
          }}>
            {/* Interactive Globe — dark luxury style */}
            <button
              onClick={() => setShowInteractiveGlobe(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "9px 16px",
                background: "rgba(8,8,7,0.82)",
                border: "1px solid rgba(201,165,90,0.35)",
                color: "rgba(201,165,90,0.9)",
                borderRadius: 3,
                fontFamily: "'Space Grotesk', 'Helvetica Neue', sans-serif",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                cursor: "pointer",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                boxShadow: "0 0 0 1px rgba(201,165,90,0.08), 0 4px 20px rgba(0,0,0,0.45)",
                transition: "all 0.2s ease",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "rgba(201,165,90,0.1)";
                e.currentTarget.style.borderColor = "rgba(201,165,90,0.65)";
                e.currentTarget.style.color = "#c9a55a";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "rgba(8,8,7,0.82)";
                e.currentTarget.style.borderColor = "rgba(201,165,90,0.35)";
                e.currentTarget.style.color = "rgba(201,165,90,0.9)";
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" />
                <ellipse cx="12" cy="12" rx="4" ry="9" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="4.5" y1="7.5" x2="19.5" y2="7.5" />
                <line x1="4.5" y1="16.5" x2="19.5" y2="16.5" />
              </svg>
              Interactive Globe
            </button>

            {/* Drawing Map — brutalist sketch style */}
            <button
              onClick={() => setShowDrawingGlobe(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "9px 16px",
                background: "#FFFFFF",
                border: "2px solid #111111",
                color: "#111111",
                borderRadius: 0,
                fontFamily: "'Space Mono', 'Courier New', monospace",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                cursor: "pointer",
                boxShadow: "3px 3px 0 #111111",
                transition: "box-shadow 0.1s, transform 0.1s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = "1px 1px 0 #111111";
                e.currentTarget.style.transform = "translate(2px,2px)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = "3px 3px 0 #111111";
                e.currentTarget.style.transform = "none";
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
              </svg>
              {t({ ko: '드로잉 맵', en: 'Drawing Map' })}
            </button>
          </div>
        )}


        {/* Interactive Globe Modal layer */}
        {showInteractiveGlobe && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 12500 }}>
            <React.Suspense fallback={<div style={{ width: '100%', height: '100%', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', fontSize: 12, letterSpacing: '0.2em' }}>{t({ ko: '지도 로딩 중…', en: 'LOADING MAP…' })}</div>}>
            <InteractiveGlobeMap
              exhibitions={localizedExhibitions}
              onSelectExhibition={(ex) => {
                setSelectedExhibition(ex);
                setShowInteractiveGlobe(false); // Exit globe to show details
              }}
              onExit={() => {
                setShowInteractiveGlobe(false);
                if (location.pathname.startsWith('/interactive')) {
                  navigate('/');
                }
              }}
              onSwitchToDrawing={() => {
                setShowInteractiveGlobe(false);
                setShowDrawingGlobe(true);
                if (location.pathname.startsWith('/interactive')) {
                  navigate('/');
                }
              }}
            />
            </React.Suspense>
          </div>
        )}

        {/* Drawing Globe Modal layer */}
        {showDrawingGlobe && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 2000 }}>
            <DrawingGlobe
              exhibitions={localizedExhibitions}
              onClose={() => { setShowDrawingGlobe(false); }}
              onSelectExhibition={(ex) => {
                navigate(`/exhibition/${ex.id}?mode=drawing`);
              }}
            />
          </div>
        )}

      </div>

      {/* For You 버튼은 DrawingGlobe 하단 바에 통합됨 (아래 참조) */}

      {/* ── For You 전체화면 전시 패널 ── */}
      {showForYou && (showDrawingGlobe || showInteractiveGlobe) && (() => {
        const isDark = showInteractiveGlobe;
        const wallBg  = isDark ? '#0d0d0d' : '#f0ece4';
        const fg      = isDark ? 'rgba(255,255,255,0.88)' : '#111';
        const fgDim   = isDark ? 'rgba(255,255,255,0.32)' : 'rgba(17,17,17,0.38)';
        const divider = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(17,17,17,0.08)';
        const fontMain = "'Space Grotesk','Inter',sans-serif";
        const fontMono = "'Space Mono','Courier New',monospace";
        const weekLabel = forYouWeek === 0 ? 'This Week' : `Week +${forYouWeek}`;
        const cur   = forYouResults[forYouCurrentIdx];
        const total = forYouResults.length;
        const isFirst = forYouCurrentIdx === 0;
        const isLast  = forYouCurrentIdx === total - 1;

        const goTo = (i: number) => setForYouCurrentIdx(Math.max(0, Math.min(total - 1, i)));

        return (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 290000, background: wallBg, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: fontMain }}
            onWheel={(e) => {
              if (Math.abs(e.deltaY) > 20) goTo(forYouCurrentIdx + (e.deltaY > 0 ? 1 : -1));
            }}
            onTouchStart={(e) => { forYouTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
            onTouchEnd={(e) => {
              if (!forYouTouchRef.current) return;
              const dx = forYouTouchRef.current.x - e.changedTouches[0].clientX;
              const dy = forYouTouchRef.current.y - e.changedTouches[0].clientY;
              if (Math.abs(dy) > 40) goTo(forYouCurrentIdx + (dy > 0 ? 1 : -1));
              else if (Math.abs(dx) > 40) goTo(forYouCurrentIdx + (dx > 0 ? 1 : -1));
              forYouTouchRef.current = null;
            }}
          >
            {/* ── Header ── */}
            <div style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', borderBottom: `1px solid ${divider}`, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill={fgDim}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: fg }}>Curated For You</span>
                {!forYouLoading && total > 0 && (
                  <span style={{ fontFamily: fontMono, fontSize: 9, color: fgDim }}>
                    {String(forYouCurrentIdx + 1).padStart(2, '0')} / {String(total).padStart(2, '0')} · {weekLabel}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {!forYouLoading && forYouWeek > 0 && (
                  <button onClick={() => { const w = forYouWeek - 1; setForYouWeek(w); fetchForYouRecommendations(w); }}
                    style={{ background: 'transparent', border: `1px solid ${divider}`, color: fgDim, padding: '4px 12px', fontSize: 9, fontFamily: fontMain, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: isDark ? 20 : 0 }}>← Prev</button>
                )}
                {!forYouLoading && (
                  <button onClick={() => { const w = forYouWeek + 1; setForYouWeek(w); fetchForYouRecommendations(w); }}
                    style={{ background: isDark ? 'rgba(255,255,255,0.09)' : '#111', border: 'none', color: isDark ? 'rgba(255,255,255,0.72)' : '#fff', padding: '4px 14px', fontSize: 9, fontFamily: fontMain, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: isDark ? 20 : 0 }}>Next Week →</button>
                )}
                <button onClick={() => setShowForYou(false)}
                  style={{ background: 'transparent', border: `1px solid ${divider}`, color: fgDim, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, cursor: 'pointer', borderRadius: isDark ? '50%' : 0, marginLeft: 4 }}>✕</button>
              </div>
            </div>

            {/* ── Loading ── */}
            {forYouLoading && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontFamily: fontMono, fontSize: 10, color: fgDim, letterSpacing: '0.1em' }}>Analyzing your taste…</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: fgDim, opacity: 0.6, animation: `pulse 1.2s ${i*0.2}s ease-in-out infinite` }} />
                  ))}
                </div>
              </div>
            )}

            {/* ── Empty / Error ── */}
            {!forYouLoading && total === 0 && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 48 }}>
                {(forYouReason === 'service_unavailable' || forYouReason === 'error') ? (
                  <>
                    <div style={{ fontSize: 28, marginBottom: 16, opacity: 0.2 }}>△</div>
                    <div style={{ fontFamily: fontMain, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.16em', color: fg, marginBottom: 10 }}>AI Loading</div>
                    <div style={{ fontFamily: fontMono, fontSize: 10, color: fgDim, lineHeight: 1.9, marginBottom: 24 }}>SigLIP 모델 초기화 중입니다.<br/>30초 후 다시 시도해주세요.</div>
                    <button onClick={() => fetchForYouRecommendations(forYouWeek)}
                      style={{ background: isDark ? 'rgba(255,255,255,0.08)':'#111', border:'none', color: isDark ? 'rgba(255,255,255,0.7)':'#fff', padding:'9px 22px', fontSize:10, fontWeight:700, fontFamily:fontMain, letterSpacing:'0.14em', textTransform:'uppercase', cursor:'pointer', borderRadius: isDark ? 20 : 0 }}>↻ 다시 시도</button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 28, marginBottom: 16, opacity: 0.15 }}>♡</div>
                    <div style={{ fontFamily: fontMain, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.16em', color: fg, marginBottom: 10 }}>Building Your Taste</div>
                    <div style={{ fontFamily: fontMono, fontSize: 10, color: fgDim, lineHeight: 1.9 }}>더 많은 작품에 하트를 눌러보세요.<br/>취향을 분석해 작품을 큐레이션합니다.</div>
                  </>
                )}
              </div>
            )}

            {/* ── Main: 이미지 + 캡션 ── */}
            {!forYouLoading && total > 0 && cur && (() => {
              const imgSrc = upgradeImageUrl(cur.i || cur.image || '');
              const title  = cur.n || cur.name || '';
              const artist = cur.a || cur.artist || '';
              const date   = cur.d || cur.date ? String(cur.d || cur.date).slice(0, 4) : '';
              const museum = cur.m || cur.museumName || '';
              return (
                <>
                  {/* 이미지 + 캡션 영역 */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 100px 20px', minHeight: 0, overflow: 'hidden' }}>
                    {/* 이미지 래퍼 — 호버 시 액션 버튼 노출 */}
                    <div
                      style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}
                      onMouseEnter={() => setForYouImageHovered(true)}
                      onMouseLeave={() => setForYouImageHovered(false)}
                    >
                      <FadeInImage
                        key={`main-${forYouCurrentIdx}`}
                        src={imgSrc}
                        alt={title}
                        onClick={() => {
                          setShowForYou(false);
                          setLightboxArtwork({ id: cur.id, name: title, artist, image: imgSrc, date: cur.d || cur.date || '', museumName: museum, exhibitionId: cur.e || cur.exhibitionId || '' });
                        }}
                        style={{
                          maxHeight: 'calc(100vh - 280px)',
                          maxWidth: '100%',
                          objectFit: 'contain',
                          cursor: 'pointer',
                          display: 'block',
                          boxShadow: isDark
                            ? '0 28px 80px rgba(0,0,0,0.97), 0 6px 24px rgba(0,0,0,0.7)'
                            : '0 12px 52px rgba(0,0,0,0.22), 0 2px 10px rgba(0,0,0,0.09)',
                        }}
                      />
                      {/* 호버 액션 버튼 (♡ 하트 · 댓글 · 액자) */}
                      {forYouImageHovered && (() => {
                        const artObj = { artworkId: cur.id, id: cur.id, image: imgSrc, title, name: title, artist, museumName: museum, url: cur.u || '', exhibitionId: cur.e || '' };
                        const isLiked = likedArtworks.some((a: any) => (a.artworkId || a.id) === cur.id);
                        const btnBase: React.CSSProperties = {
                          width: 40, height: 40, borderRadius: '50%', border: 'none',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                          transition: 'transform 0.15s',
                          background: 'rgba(0,0,0,0.62)',
                        };
                        return (
                          <div style={{
                            position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
                            display: 'flex', gap: 10,
                            background: 'rgba(0,0,0,0.55)', borderRadius: 40, padding: '6px 14px',
                            backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                          }}>
                            {/* ♡ 하트 */}
                            <button
                              title={isLiked ? '좋아요 취소' : '좋아요'}
                              onClick={(e) => { e.stopPropagation(); handleToggleLike(e, artObj); }}
                              style={{ ...btnBase, background: isLiked ? 'rgba(220,50,50,0.85)' : 'rgba(255,255,255,0.12)' }}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill={isLiked ? '#fff' : 'none'} stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                              </svg>
                            </button>
                            {/* 💬 댓글 — 작품 원본 URL 오픈 */}
                            <button
                              title="작품 원본 보기"
                              onClick={(e) => { e.stopPropagation(); if (cur.u) window.open(cur.u, '_blank'); }}
                              style={{ ...btnBase, background: 'rgba(255,255,255,0.12)' }}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                              </svg>
                            </button>
                            {/* 🖼 액자/구매 — lightbox 오픈 */}
                            <button
                              title="작품 상세 보기"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowForYou(false);
                                setLightboxArtwork({ id: cur.id, name: title, artist, image: imgSrc, date: cur.d || cur.date || '', museumName: museum, exhibitionId: cur.e || '' });
                              }}
                              style={{ ...btnBase, background: 'rgba(255,255,255,0.12)' }}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <rect x="7" y="7" width="10" height="10" rx="1" />
                              </svg>
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                    {/* 작품 캡션 */}
                    <div style={{ marginTop: 22, textAlign: 'center', flexShrink: 0, maxWidth: 560 }}>
                      <div style={{
                        fontSize: isDark ? 16 : 17, color: fg, lineHeight: 1.35,
                        fontWeight: isDark ? 500 : 400,
                        fontStyle: isDark ? 'normal' : 'italic',
                        fontFamily: isDark ? fontMain : "'Times New Roman','Georgia',serif",
                        marginBottom: 7,
                      }}>{title}</div>
                      <div style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.58)' : '#555', fontWeight: 500 }}>
                        {artist}{date ? `, ${date}` : ''}
                      </div>
                      {museum && (
                        <div style={{ fontSize: 9, color: fgDim, marginTop: 5, fontFamily: fontMono, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                          {museum}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── 하단 필름스트립 ── */}
                  <div style={{ height: 112, borderTop: `1px solid ${divider}`, display: 'flex', alignItems: 'center', flexShrink: 0, background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.03)' }}>
                    {/* ← 이전 */}
                    <button
                      onClick={() => goTo(forYouCurrentIdx - 1)}
                      disabled={isFirst}
                      style={{
                        width: 52, height: '100%', flexShrink: 0,
                        background: 'transparent', border: 'none',
                        borderRight: `1px solid ${divider}`,
                        color: isFirst ? 'transparent' : fg,
                        fontSize: 22, cursor: isFirst ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'color 0.15s',
                      }}>‹</button>

                    {/* 썸네일 스트립 */}
                    <div
                      ref={filmstripRef}
                      style={{
                        flex: 1, height: '100%',
                        display: 'flex', alignItems: 'center',
                        gap: 12,
                        padding: '0 20px',
                        overflowX: 'auto', overflowY: 'hidden',
                        scrollbarWidth: 'none',
                      } as React.CSSProperties}
                    >
                      {forYouResults.map((art: any, idx: number) => {
                        const isActive = idx === forYouCurrentIdx;
                        const thumbSrc = upgradeImageUrl(art.i || art.image || '');
                        return (
                          <div
                            key={idx}
                            onClick={() => goTo(idx)}
                            style={{
                              width: 78, height: 78, flexShrink: 0,
                              overflow: 'hidden',
                              outline: isActive ? `2px solid ${fg}` : '2px solid transparent',
                              outlineOffset: 2,
                              opacity: isActive ? 1 : 0.35,
                              transition: 'opacity 0.18s, outline-color 0.15s',
                              cursor: 'pointer',
                              background: isDark ? '#1a1a1a' : '#ccc8bf',
                            }}
                          >
                            {thumbSrc && (
                              <img src={thumbSrc} alt="" loading="lazy"
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* → 다음 */}
                    <button
                      onClick={() => goTo(forYouCurrentIdx + 1)}
                      disabled={isLast}
                      style={{
                        width: 52, height: '100%', flexShrink: 0,
                        background: 'transparent', border: 'none',
                        borderLeft: `1px solid ${divider}`,
                        color: isLast ? 'transparent' : fg,
                        fontSize: 22, cursor: isLast ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'color 0.15s',
                      }}>›</button>
                  </div>
                </>
              );
            })()}

          </div>
        );
      })()}

      {/* ── GlobalNav — OUTSIDE overflow:hidden so it's always visible ── */}
      <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          pointerEvents: 'none',
          zIndex: 200000, // Must be above ExhibitionModal (13000) and all overlays
        }}>
        <GlobalNav
          skin={showDrawingGlobe ? 'drawing' : 'default'}
          isAdmin={isAdmin}
          isModalOpen={!!selectedModalExhibition}
          searchProps={memoizedSearchProps}
        />
      </div>

      {showDrawingGlobe && showDrawingQuickDock && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%) scale(0.9)',
            transformOrigin: 'bottom center',
            zIndex: 2001,
            pointerEvents: 'auto',
            opacity: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            background: '#FFFFFF',
            border: '3px solid #111111',
            borderRadius: 10,
            boxShadow: '6px 6px 0 #111111',
            filter: 'url(#dg-sketch-ui)',
          }}
        >
          <button
            onClick={() => {
              setShowDrawingGlobe(false);
              setShowInteractiveGlobe(true);
            }}
            title="Interactive Map"
            style={{
              width: 58,
              height: 58,
              border: '2px solid #111111',
              borderRadius: 11,
              background: '#111111',
              color: '#D4A547',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.15" strokeLinecap="round" strokeLinejoin="round" style={{ width: 23, height: 23, display: 'block', flexShrink: 0 }}>
              <path d="M3 7 L8 5 L14 7 L20 5 L20 17 L14 19 L8 17 L3 19 Z" />
              <path d="M8 5 L8 17" />
              <path d="M14 7 L14 19" />
              <path d="M12 9 C13.8 9 15 10.2 15 11.7 C15 13.5 13.2 14.7 12 16 C10.8 14.7 9 13.5 9 11.7 C9 10.2 10.2 9 12 9 Z" fill="currentColor" stroke="none" />
            </svg>
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-community-panel'))}
            title="Community"
            style={{
              width: 58,
              height: 58,
              border: '2px solid #111111',
              borderRadius: 11,
              background: '#D4A547',
              color: '#111111',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 23, height: 23, display: 'block', flexShrink: 0 }}>
              <path d="M4 6.5 C4 5.4 4.8 4.6 5.9 4.6 H18.4 C19.5 4.6 20.3 5.4 20.3 6.5 V14.3 C20.3 15.4 19.5 16.2 18.4 16.2 H11 L7.2 19.4 L7.7 16.2 H5.9 C4.8 16.2 4 15.4 4 14.3 Z" />
              <circle cx="9" cy="10.5" r="1" fill="currentColor" stroke="none" />
              <circle cx="12.2" cy="10.5" r="1" fill="currentColor" stroke="none" />
              <circle cx="15.4" cy="10.5" r="1" fill="currentColor" stroke="none" />
            </svg>
          </button>
          <button
            onClick={toggleHomeTheme}
            title={homeIsDark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              width: 58,
              height: 58,
              border: '2px solid #111111',
              borderRadius: 11,
              background: '#FFFFFF',
              color: '#111111',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            {homeIsDark ? (
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.15" strokeLinecap="round" strokeLinejoin="round" style={{ width: 23, height: 23, display: 'block', flexShrink: 0 }}>
                <path d="M16.8 3.8 C14.2 4.1 12 6.4 12 9.8 C12 13.7 15.2 16.8 19 16.8 C19.8 16.8 20.6 16.7 21.2 16.4 C20 19.6 16.9 21.8 13.3 21.8 C8.7 21.8 5 18.1 5 13.5 C5 8.8 8.8 5 13.5 5 C14.7 5 15.8 5.2 16.8 5.7 Z" />
                <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
              </svg>
            ) : (
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.15" strokeLinecap="round" strokeLinejoin="round" style={{ width: 23, height: 23, display: 'block', flexShrink: 0 }}>
                <circle cx="12" cy="12" r="4.2" />
                <line x1="12" y1="2.2" x2="12" y2="5.2" />
                <line x1="12" y1="18.8" x2="12" y2="21.8" />
                <line x1="2.2" y1="12" x2="5.2" y2="12" />
                <line x1="18.8" y1="12" x2="21.8" y2="12" />
                <line x1="5" y1="5" x2="7" y2="7" />
                <line x1="17" y1="17" x2="19" y2="19" />
              </svg>
            )}
          </button>
          <button
            onClick={() => navigate('/mypage')}
            title="My Page"
            style={{
              width: 58,
              height: 58,
              border: '2px solid #111111',
              borderRadius: 11,
              background: '#FFFFFF',
              color: '#111111',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.15" strokeLinecap="round" strokeLinejoin="round" style={{ width: 23, height: 23, display: 'block', flexShrink: 0 }}>
              <circle cx="12" cy="8" r="3.6" />
              <path d="M4.5 20.2 C6.5 16.4 9.1 15 12 15 C14.9 15 17.5 16.4 19.5 20.2" />
              <path d="M17.2 5.2 L18.1 6.7 L19.8 6.5 L18.7 7.7 L19.3 9.2 L17.7 8.5 L16.4 9.5 L16.6 7.9 L15.3 6.9 L17 6.7 Z" fill="currentColor" stroke="none" />
            </svg>
          </button>
          {/* ── For You: 5번째 아이콘 (큐레이션 전시) ── */}
          {user && (
            <button
              onClick={() => { const w = 0; setForYouWeek(w); setShowForYou(true); fetchForYouRecommendations(w); }}
              title="Curated For You"
              style={{
                width: 58,
                height: 58,
                border: '2px solid #111111',
                borderRadius: 11,
                background: likedArtworks.length >= 3 ? '#F5C84C' : '#F0ECD8',
                color: '#111111',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                position: 'relative',
              }}
            >
              {/* 큐레이션 전시 아이콘: 액자+별 */}
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" style={{ width: 23, height: 23, display: 'block', flexShrink: 0 }}>
                {/* 액자 */}
                <rect x="2.5" y="4.5" width="16" height="12" rx="1.5" />
                {/* 액자 내부 풍경 */}
                <path d="M5 13.5 L7.5 9.5 L10.5 12 L13 10 L16.5 13.5" strokeWidth="1.6" />
                {/* 별/스파클 1 — 우상단 */}
                <path d="M21 2.5 L21.5 4 L23 4.5 L21.5 5 L21 6.5 L20.5 5 L19 4.5 L20.5 4 Z" fill="currentColor" stroke="none" />
                {/* 별/스파클 2 — 좌하단 (소) */}
                <path d="M3 18.5 L3.35 19.5 L4.35 19.85 L3.35 20.2 L3 21.2 L2.65 20.2 L1.65 19.85 L2.65 19.5 Z" fill="currentColor" stroke="none" />
              </svg>
              {/* 활성화 점 (liked 3개 이상일 때) */}
              {likedArtworks.length >= 3 && (
                <span style={{ position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: '50%', background: '#111', border: '1.5px solid #F5C84C' }} />
              )}
            </button>
          )}
        </div>
      )}

    </>
  );
  // Removed leftover Flow effect: single-click behavior only
}