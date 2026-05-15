import React, { useEffect, useMemo, useState, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import {
  getFirestore,
  collection,
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  getCountFromServer,
  orderBy,
} from "firebase/firestore";
import {
  BookmarkPlus,
  Heart,
  ListMusic,
  MapPin,
  Pencil,
  Play,
  ShoppingBag,
  User,
  Calendar,
  Palette,
  Bookmark,
} from "lucide-react";

import { useSavedCurations } from "../hooks/useSavedCurations";

import { ProductModal } from "./ProductModal";
import { ArtworkLightbox } from "../components/ArtworkLightbox";
import { exhibitions } from "../data/exhibitions";
import { findMuseumForArtwork, getExhibitionTokens, normalizeToken } from "../utils/museumUtils";
import { getOptimizedImageUrl } from "../utils/imageProxy";

import CommentModal from "./CommentModal";
import Slideshow from "./Slideshow";
import { PlaylistModal } from "./PlaylistModal";
import ProfileAvatar from "./ProfileAvatar";
import { createFirebaseWebPort } from "../adapters/firebaseWebAdapter";
import type { ProfileImageCrop } from "../types/Profile";
import { ensureSharedSearchWorkerLoaded } from "../utils/searchWorkerRuntime";

type ViewMode = "artworks" | "exhibitions" | "museums" | "artists" | "playlists" | "curations";
type SortMode = "recent" | "oldest" | "newest";
const SHOW_ARTWORK_COMMENTS = false;

// Persona name lookup for Saved Curations cards. Kept in sync by hand with
// PERSONA_NAMES in WeeklyCurationTab; only the display fields matter here.
const CURATION_PERSONA_NAMES: Record<string, { en: string; ko: string }> = {
  "yuna-choi":     { en: "Yuna Choi",     ko: "최유나" },
  "marco-rinaldi": { en: "Marco Rinaldi", ko: "마르코 리날디" },
  "anika-voss":    { en: "Anika Voss",    ko: "아니카 보스" },
};

const RANKS = [
  { name: "Observer", threshold: 0, short: "Lv.1" },
  { name: "Seeker", threshold: 5, short: "Lv.2" },
  { name: "Collector", threshold: 15, short: "Lv.3" },
  { name: "Curator", threshold: 30, short: "Lv.4" },
  { name: "Gallerist", threshold: 60, short: "Lv.5" },
  { name: "Patron", threshold: 100, short: "Lv.6" },
  { name: "Visionary", threshold: 200, short: "Lv.7" },
];

// Pre-built map: permanentExhibition.id → collectionFile stem
// This resolves cases where exhibitionId saved in Firebase is the pe.id ("tm-perm-1")
// but the JSON file is named after collectionFile ("tate-modern-collection.json")
const _exhibitionIdToCollectionFile: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const museum of exhibitions) {
    for (const pe of museum.permanentExhibitions || []) {
      const peId = (pe as any)?.id as string | undefined;
      const cf = (pe as any)?.collectionFile as string | undefined;
      if (peId && cf) map[peId] = cf.replace(".json", "");
    }
  }
  return map;
})();

export const getFallbackExhibitionIdForJson = (item: any): string => {
  const rawId: string = item.exhibitionId || item.e || item.sourceCollection || "";
  if (rawId) {
    // First, resolve to collectionFile stem via the lookup map
    if (_exhibitionIdToCollectionFile[rawId]) return _exhibitionIdToCollectionFile[rawId];
    // If rawId is already a collectionFile stem (has a matching JSON), use it directly
    return rawId;
  }

  const museum = findMuseumForArtwork(item, exhibitions);
  if (museum && museum.permanentExhibitions && museum.permanentExhibitions.length > 0) {
    const file = museum.permanentExhibitions[0].collectionFile;
    if (file) return file.replace(".json", "");
  }

  // Legacy hardcodes as last resort
  if (item.museumName || item.m) {
    const museumName = (item.museumName || item.m || "").toLowerCase();
    if (museumName.includes("brucke") || museumName.includes("brücke")) return "bruecke-museum-collection";
    if (museumName.includes("ateneum") || museumName.includes("kansallisgalleria") || museumName.includes("finnish national gallery")) return "ateneum-collection";
    if (museumName.includes("courtauld")) return "courtauld-gallery-collection";
    if (museumName.includes("tate")) {
      if (museumName.includes("modern")) return "tate-modern-collection";
      if (museumName.includes("britain")) return "tate-britain-artworks";
      if (museumName.includes("st iv")) return "tate-st-ives-artworks";
      if (museumName.includes("liverpool")) return "tate-liverpool-artworks";
      return "tate-modern-collection";
    }
  }

  return "";
};

const IMAGE_URL_HINT_RE = /(url|image|src|iiif|thumbnail|thumb|large|original|lightbox|download|href)/i;
const IMAGE_PRIORITY_KEYS = [
  "url",
  "src",
  "image",
  "imageUrl",
  "iiifUrl",
  "lightboxImage",
  "originalImage",
  "original",
  "large",
  "downloadUrl",
  "href",
] as const;

const extractImageStrings = (value: unknown, depth = 0): string[] => {
  if (depth > 4 || value == null) return [];

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractImageStrings(entry, depth + 1));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const urls: string[] = [];

    IMAGE_PRIORITY_KEYS.forEach((key) => {
      if (key in record) urls.push(...extractImageStrings(record[key], depth + 1));
    });

    Object.entries(record).forEach(([key, entry]) => {
      if (IMAGE_PRIORITY_KEYS.includes(key as (typeof IMAGE_PRIORITY_KEYS)[number])) return;
      if (!IMAGE_URL_HINT_RE.test(key)) return;
      urls.push(...extractImageStrings(entry, depth + 1));
    });

    return urls;
  }

  return [];
};

const extractVariantImageStrings = (variants: unknown): string[] => {
  if (!variants || typeof variants !== "object") return [];

  const urls: string[] = [];
  ["avif", "webp", "jpeg", "jpg", "png"].forEach((format) => {
    const source = (variants as Record<string, unknown>)[format];
    if (!source) return;

    if (Array.isArray(source)) {
      const maxVariant = source.reduce<Record<string, unknown> | null>((prev, curr) => {
        const prevWidth = Number(prev?.width || 0);
        const currRecord = typeof curr === "object" && curr ? (curr as Record<string, unknown>) : null;
        const currWidth = Number(currRecord?.width || 0);
        return prevWidth > currWidth ? prev : currRecord;
      }, null);
      urls.push(...extractImageStrings(maxVariant?.url));
      return;
    }

    if (typeof source === "object") {
      const entries = Object.entries(source as Record<string, unknown>)
        .map(([key, value]) => ({ width: Number(key), value }))
        .filter((entry) => Number.isFinite(entry.width));

      if (entries.length > 0) {
        const maxEntry = entries.reduce((prev, curr) => (prev.width > curr.width ? prev : curr));
        urls.push(...extractImageStrings(maxEntry.value));
      }
    }
  });

  return urls;
};

const getImageCandidatesFromItem = (item: unknown): string[] => {
  if (!item || typeof item !== "object") return [];
  const record = item as Record<string, unknown>;

  const candidates: string[] = [];
  const add = (value: unknown) => {
    candidates.push(...extractImageStrings(value));
  };

  add(record.image);
  add(record.i);
  add(record.imageUrl);
  add(record.thumbnailUrl);
  add(record.lightboxImage);
  add(record.originalImage);
  add(record.original_imageUrl);
  add(record.thumbnail);
  add(record.images);
  add(record.media);
  add(record.assets);
  add(record.primaryImage);
  add(record.imageUrls);
  add(record.r2Image);
  add(record.r2Url);
  add(record.fallbackImages);
  add(record.iiifUrl);
  add(record.poster);
  add(record.coverImage);

  candidates.push(...extractVariantImageStrings(record.variants));

  return Array.from(new Set(candidates.map((candidate) => candidate.trim()).filter(Boolean)));
};

const getPrimaryImageCandidate = (item: unknown): string => {
  return getImageCandidatesFromItem(item)[0] || "";
};

const expandArtworkIdCandidates = (value: unknown): string[] => {
  if (value == null) return [];
  const raw = String(value).trim();
  if (!raw) return [];

  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();

  return Array.from(new Set([
    raw,
    decoded,
    raw.toLowerCase(),
    raw.toUpperCase(),
    decoded.toLowerCase(),
    decoded.toUpperCase(),
    raw.replace(/__/g, "/"),
    decoded.replace(/__/g, "/"),
    raw.replace(/\//g, "__"),
    decoded.replace(/\//g, "__"),
  ].filter(Boolean)));
};

const extractLooseIdTokens = (values: string[]): string[] => {
  const tokens = new Set<string>();
  for (const value of values) {
    const raw = String(value || "").trim();
    if (!raw) continue;
    const decoded = (() => {
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    })();

    const parts = decoded
      .split(/[^a-zA-Z0-9]+/)
      .map((part) => part.trim())
      .filter(Boolean);

    for (const part of parts) {
      if (part.length >= 4) tokens.add(part.toLowerCase());
    }

    const trailingNumber = decoded.match(/(\d{3,})$/)?.[1];
    if (trailingNumber) tokens.add(trailingNumber);
  }
  return Array.from(tokens);
};

const getArtworkIdCandidates = (item: unknown): string[] => {
  if (!item || typeof item !== "object") return [];
  const record = item as Record<string, unknown>;
  const list = [
    ...expandArtworkIdCandidates(record.artworkId),
    ...expandArtworkIdCandidates(record.semanticId),
    ...expandArtworkIdCandidates(record.id),
  ];
  return Array.from(new Set(list));
};

const getStableArtworkIdentity = (item: unknown): string => {
  if (!item || typeof item !== "object") return "unknown";
  const record = item as Record<string, unknown>;
  const docId = String(record._docId || record.likeDocId || "").trim();
  const artworkId = String(record.artworkId || record.id || "").trim();
  const exhibitionId = String(record.exhibitionId || record.e || record.sourceCollection || "").trim().toLowerCase();
  const source = normalizeToken(String(record.sourceUrl || record.url || record.detailUrl || record.officialUrl || "").toLowerCase());
  const title = normalizeToken(String(record.title || record.name || "").toLowerCase());
  const artist = normalizeToken(String(record.artist || record.a || "").toLowerCase());
  const museum = normalizeToken(String(record.museumName || record.museum || record.m || "").toLowerCase());

  return [docId, artworkId, exhibitionId, source, title, artist, museum].filter(Boolean).join("|") || "unknown";
};

const _brokenImageUrls = new Map<string, { count: number; lastFailureAt: number }>();
const _reportedImageFailures = new Set<string>();
const _reportedSimpleCardMissingPrimary = new Set<string>();
const _loadedImageUrls = new Set<string>();
const _workerImageLookupCache = new Map<string, string | null>();
const _workerImageLookupInFlight = new Map<string, Promise<string | null>>();

const BROKEN_URL_TTL_MS = 30 * 60 * 1000;
const BROKEN_URL_MIN_FAILURES = 1;
const MAX_PRIMARY_IMAGE_ATTEMPTS = 5;

const markBrokenImageUrl = (url: string) => {
  if (!url) return;
  const prev = _brokenImageUrls.get(url);
  _brokenImageUrls.set(url, {
    count: (prev?.count || 0) + 1,
    lastFailureAt: Date.now(),
  });
};

const isMarkedBrokenImageUrl = (url: string): boolean => {
  if (!url) return false;
  const rec = _brokenImageUrls.get(url);
  if (!rec) return false;
  const isExpired = Date.now() - rec.lastFailureAt > BROKEN_URL_TTL_MS;
  if (isExpired) {
    _brokenImageUrls.delete(url);
    return false;
  }
  return rec.count >= BROKEN_URL_MIN_FAILURES;
};

// Unwrap a wsrv.nl URL and return the underlying URL, or null if not a wsrv URL.
// wsrv accepts bare hostnames (no scheme); this restores https:// when needed.
const _unwrapWsrv = (url: string): string | null => {
  if (!url || !/wsrv\.nl|images\.weserv\.nl/.test(url)) return null;
  try {
    const u = new URL(url);
    const underlying = u.searchParams.get("url");
    if (!underlying) return null;
    return /^https?:\/\//i.test(underlying) ? underlying : `https://${underlying}`;
  } catch { return null; }
};

// True for URLs that must be served direct (no proxy needed / proxy known to fail).
// Also unwraps wsrv-wrapped R2 URLs so the check works transparently.
const shouldBypassProxyForUrl = (url: string): boolean => {
  const raw = String(url || "").trim().toLowerCase();
  if (!raw) return false;
  if (raw.startsWith("data:") || raw.startsWith("blob:")) return true;
  if (raw.includes(".r2.dev/")) return true;
  if (raw.includes("r2.cloudflarestorage.com")) return true;
  // wsrv-wrapped R2: the stored image is https://wsrv.nl/?url=...r2.dev...
  // The wsrv URL itself doesn't contain ".r2.dev/" as a path segment, but
  // the underlying URL does. Unwrap and re-check.
  if (raw.includes("wsrv.nl") || raw.includes("images.weserv.nl")) {
    const underlying = _unwrapWsrv(url);
    if (underlying) return shouldBypassProxyForUrl(underlying);
  }
  if (raw.includes("iiif.deutsche-digitale-bibliothek.de")) return true;
  if (raw.includes("www.artic.edu/iiif/2/")) return true;
  if (raw.includes("kansallisgalleria.fi")) return true;
  if (raw.includes("sbirky.ngprague.cz")) return true;
  if (raw.includes("lh3.googleusercontent.com")) return true;
  if (raw.includes("adachi-museum.or.jp")) return true;
  return false;
};

type WorkerImageLookupOptions = {
  idCandidates: string[];
  itemTitle?: string;
  itemArtist?: string;
  museumName?: string;
  sourceUrl?: string;
  exhibitionHints?: string[];
};

const pickBestWorkerImage = (rows: any[], opts: WorkerImageLookupOptions): string | null => {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const idSet = new Set((opts.idCandidates || []).map((id) => String(id || "").trim().toLowerCase()).filter(Boolean));
  const titleNorm = normalizeToken(String(opts.itemTitle || "").toLowerCase().trim());
  const artistNorm = normalizeToken(String(opts.itemArtist || "").toLowerCase().trim());
  const museumNorm = normalizeToken(String(opts.museumName || "").toLowerCase().trim());
  const sourceNorm = normalizeToken(String(opts.sourceUrl || "").toLowerCase().trim());
  const exhibitionSet = new Set((opts.exhibitionHints || []).map((hint) => String(hint || "").trim().toLowerCase()).filter(Boolean));

  const scored = rows
    .map((row) => {
      const image = getPrimaryImageCandidate(row);
      if (!image) return null;

      const rowId = String(row?.id || row?.artworkId || "").toLowerCase().trim();
      const rowExh = String(row?.exhibitionId || row?.e || row?.sourceCollection || "").toLowerCase().trim();
      const rowTitleNorm = normalizeToken(String(row?.title || row?.name || "").toLowerCase().trim());
      const rowArtistNorm = normalizeToken(String(row?.artist || row?.a || "").toLowerCase().trim());
      const rowMuseumNorm = normalizeToken(String(row?.museumName || row?.m || row?.museum || "").toLowerCase().trim());
      const rowSourceNorm = normalizeToken(String(row?.sourceUrl || row?.url || row?.detailUrl || "").toLowerCase().trim());
      let score = 1;

      if (rowId && idSet.has(rowId)) score += 80;
      if (rowExh && exhibitionSet.has(rowExh)) score += 60;
      if (sourceNorm && rowSourceNorm && sourceNorm === rowSourceNorm) score += 160;

      if (titleNorm && rowTitleNorm) {
        if (titleNorm === rowTitleNorm) score += 120;
        else if (rowTitleNorm.includes(titleNorm) || titleNorm.includes(rowTitleNorm)) score += 70;
        else score -= 22;
      }

      if (artistNorm && rowArtistNorm) {
        if (artistNorm === rowArtistNorm) score += 100;
        else if (rowArtistNorm.includes(artistNorm) || artistNorm.includes(rowArtistNorm)) score += 55;
        else score -= 18;
      }

      if (museumNorm && rowMuseumNorm) {
        if (museumNorm === rowMuseumNorm) score += 45;
        else if (rowMuseumNorm.includes(museumNorm) || museumNorm.includes(rowMuseumNorm)) score += 25;
      }

      return { image, score };
    })
    .filter(Boolean) as Array<{ image: string; score: number }>;

  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];
  if (!best) return null;

  const hasStrongAnchor = Boolean(titleNorm || artistNorm || sourceNorm || exhibitionSet.size > 0);
  if (hasStrongAnchor && best.score < 40) return null;
  if (second && best.score < 120 && best.score - second.score < 15) return null;

  return best.image || null;
};

const lookupImageFromSearchWorker = async (opts: WorkerImageLookupOptions): Promise<string | null> => {
  const ids = Array.from(new Set((opts.idCandidates || []).map((id) => String(id || "").trim()).filter(Boolean)));
  const title = String(opts.itemTitle || "").trim();
  if (ids.length === 0 && title.length < 3) return null;
  const hasFallbackAnchor = Boolean(
    (opts.exhibitionHints && opts.exhibitionHints.length > 0)
    || normalizeToken(String(opts.itemArtist || "").toLowerCase())
    || normalizeToken(String(opts.sourceUrl || "").toLowerCase()),
  );
  const canUseTitleSearchFallback = title.length >= 3 && hasFallbackAnchor;

  const cacheKey = [
    ids.join("|"),
    normalizeToken(title.toLowerCase()),
    normalizeToken(String(opts.itemArtist || "").toLowerCase()),
    normalizeToken(String(opts.museumName || "").toLowerCase()),
    normalizeToken(String(opts.sourceUrl || "").toLowerCase()),
    (opts.exhibitionHints || []).join("|"),
  ].join("::");
  if (_workerImageLookupCache.has(cacheKey)) return _workerImageLookupCache.get(cacheKey) || null;

  const inFlight = _workerImageLookupInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const task = new Promise<string | null>((resolve) => {
    const worker = ensureSharedSearchWorkerLoaded();
    if (!worker) {
      _workerImageLookupCache.set(cacheKey, null);
      resolve(null);
      return;
    }

    const requestId = `mypage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    let settled = false;
    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
    };

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      _workerImageLookupCache.set(cacheKey, value || null);
      resolve(value || null);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "DETAILS_RESULTS") {
        if (event.data?.requestId && event.data.requestId !== requestId) return;
        const rows = Array.isArray(event.data?.results) ? event.data.results : [];
        const found = pickBestWorkerImage(rows, opts);
        if (found) {
          finish(found);
          return;
        }
        if (!canUseTitleSearchFallback) {
          finish(null);
          return;
        }
        worker.postMessage({ type: "SEARCH", query: title, requestId });
        return;
      }

      if (event.data?.type === "RESULTS") {
        if (event.data?.requestId && event.data.requestId !== requestId) return;
        if (String(event.data?.query || "") !== title) return;
        if (event.data?.pending) return;
        const rows = Array.isArray(event.data?.results) ? event.data.results : [];
        const found = pickBestWorkerImage(rows, opts);
        finish(found || null);
      }
    };

    worker.addEventListener("message", onMessage);
    if (ids.length > 0) {
      worker.postMessage({ type: "GET_DETAILS_BY_IDS", ids, requestId });
    } else if (canUseTitleSearchFallback) {
      worker.postMessage({ type: "SEARCH", query: title, requestId });
    } else {
      finish(null);
      return;
    }

    window.setTimeout(() => finish(null), 2600);
  }).finally(() => {
    _workerImageLookupInFlight.delete(cacheKey);
  });

  _workerImageLookupInFlight.set(cacheKey, task);
  return task;
};

let _myPageImageAnimationsInjected = false;
const ensureMyPageImageAnimations = () => {
  if (_myPageImageAnimationsInjected || typeof document === "undefined") return;
  const styleId = "mypage-image-animations";
  if (document.getElementById(styleId)) {
    _myPageImageAnimationsInjected = true;
    return;
  }
  const styleEl = document.createElement("style");
  styleEl.id = styleId;
  styleEl.textContent = `
    @keyframes mypageImageShimmer {
      0% { transform: translateX(-100%); opacity: 0.25; }
      50% { opacity: 0.55; }
      100% { transform: translateX(100%); opacity: 0.2; }
    }
  `;
  document.head.appendChild(styleEl);
  _myPageImageAnimationsInjected = true;
};

const _recoveredUrlsCache: Record<string, string | null> = {};
const _datasetCache: Record<string, Promise<unknown[]>> = {};

const fetchDataset = (candidate: string): Promise<unknown[]> => {
  if (!_datasetCache[candidate]) {
    _datasetCache[candidate] = fetch(`/data/${candidate}.json`)
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
  }
  return _datasetCache[candidate];
};
const firebaseWebPort = createFirebaseWebPort();

type MyPageImageProps = {
  item: any;
  width?: number;
  style?: React.CSSProperties;
  disableBlur?: boolean;
};

const MyPageImage = React.memo(({ item, width = 600, style, disableBlur = true }: MyPageImageProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [recoveredSrc, setRecoveredSrc] = useState<string | null>(null);
  const [hasFailedAll, setHasFailedAll] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isResolving, setIsResolving] = useState(true);
  const itemIdCandidates = useMemo(() => getArtworkIdCandidates(item), [item]);
  const stableItemIdentity = useMemo(() => getStableArtworkIdentity(item), [item]);

  const sanitizeImageValue = (value: unknown): string => {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) return "";
    if (raw === "default.jpg" || raw === "/default.jpg") return "";
    if (/iiif\.deutsche-digitale-bibliothek\.de\/image\/2\/[^/]+\/full\/(?:full|!\d+,\d+|max)\/0\/default\.jpg/i.test(raw)) return "";
    if (isMarkedBrokenImageUrl(raw)) return "";
    return raw;
  };

  const exhId = getFallbackExhibitionIdForJson(item);
  const primaryItemId = itemIdCandidates[0] || "";

  useEffect(() => {
    ensureMyPageImageAnimations();
  }, []);

  const imageCandidateFingerprint = useMemo(() => {
    // Width is intentionally excluded: it changes on resize and would reset
    // imageLoaded to false, but most wsrv URLs are width-agnostic so onLoad
    // never fires again → image stays black. Width changes only rebuild urlChain.
    const candidateKey = getImageCandidatesFromItem(item).join("|");
    return `${itemIdCandidates.join("|")}::${candidateKey}`;
  }, [item, itemIdCandidates]);

  // "Known" images come directly from item fields (reliable, usually valid).
  // "Synthetic" R2 guesses are constructed from item IDs and often 404 — they
  // must stay AFTER known images so we don't burn round-trips on guesses before
  // trying the stored working URL.
  const knownImages = useMemo(() => {
    const list: string[] = [];
    getImageCandidatesFromItem(item).forEach((candidate) => {
      const safe = sanitizeImageValue(candidate);
      if (safe) list.push(safe);
    });
    return Array.from(new Set(list));
  }, [item]);

  const syntheticImages = useMemo(() => {
    if (itemIdCandidates.length === 0) return [];
    const seen = new Set<string>();
    const list: string[] = [];
    const push = (url: string) => { if (!seen.has(url)) { seen.add(url); list.push(url); } };
    itemIdCandidates.forEach((idCandidate) => {
      if (!idCandidate) return;
      if (exhId) {
        push(`https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/${exhId}/${idCandidate}.jpg`);
        push(`https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/${exhId}/${idCandidate}.webp`);
        push(`https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/${exhId}/${idCandidate}.jpeg`);
        push(`https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/${exhId}/${idCandidate}.png`);
      }
      push(`https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/${idCandidate}.jpg`);
      push(`https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/${idCandidate}.webp`);
      push(`https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/${idCandidate}.jpeg`);
      push(`https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/${idCandidate}.png`);
    });
    return list;
  }, [itemIdCandidates, exhId]);

  const orderedRawCandidates = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];

    const push = (value: unknown) => {
      const safe = sanitizeImageValue(value);
      if (!safe || seen.has(safe)) return;
      seen.add(safe);
      ordered.push(safe);
    };

    if (recoveredSrc) push(recoveredSrc);

    // Sort only known images: put bypass-proxy (R2, IIIF) ahead of proxied ones.
    const sortedKnown = [...knownImages].sort((a, b) => {
      const aDirect = shouldBypassProxyForUrl(a) ? 1 : 0;
      const bDirect = shouldBypassProxyForUrl(b) ? 1 : 0;
      return bDirect - aDirect;
    });
    sortedKnown.forEach((candidate) => push(candidate));

    // Synthetic R2 guesses (e.g. /artworks/{id}.jpg) almost always 404 because
    // real R2 paths include a hash + collection prefix. Including them inline
    // saturates the browser's per-host connection pool with failed requests
    // before the wsrv.nl fallback can run, so we only fall back to them when
    // there is no known URL at all. Advanced recovery handles the harder cases.
    if (sortedKnown.length === 0) {
      syntheticImages.forEach((candidate) => push(candidate));
    }

    return ordered;
  }, [knownImages, syntheticImages, recoveredSrc]);

  const handleAdvancedRecovery = async (): Promise<string | null> => {
    // Build candidate collections to try: resolved id + raw ids + museum permanent exhibitions.
    const exhCandidatesSet = new Set<string>();
    const addExhCandidate = (value: unknown) => {
      const raw = String(value || "").trim();
      if (!raw) return;
      exhCandidatesSet.add(raw);
      if (!raw.endsWith("-collection")) exhCandidatesSet.add(`${raw}-collection`);
      if (raw.endsWith("-collection")) exhCandidatesSet.add(raw.replace(/-collection$/, ""));
      if (_exhibitionIdToCollectionFile[raw]) {
        const mapped = _exhibitionIdToCollectionFile[raw];
        exhCandidatesSet.add(mapped);
        if (!mapped.endsWith("-collection")) exhCandidatesSet.add(`${mapped}-collection`);
      }
    };

    addExhCandidate(exhId);
    addExhCandidate(item?.exhibitionId);
    addExhCandidate(item?.e);
    addExhCandidate(item?.sourceCollection);

    const matchedMuseum = findMuseumForArtwork(item, exhibitions);
    if (matchedMuseum) {
      for (const pe of matchedMuseum.permanentExhibitions || []) {
        addExhCandidate((pe as any)?.id);
        addExhCandidate((pe as any)?.collectionFile ? String((pe as any).collectionFile).replace(/\.json$/i, "") : "");
      }
    }

    const exhCandidates = Array.from(exhCandidatesSet);
    const itemTitle = String(item.title || item.name || "").toLowerCase().trim();

    if (itemIdCandidates.length === 0 && exhCandidates.length === 0 && itemTitle.length < 3) {
      // Nothing to look up — the caller will mark the tile as failed.
      return null;
    }

    const normalizedItemTitle = normalizeToken(itemTitle);
    const normalizedItemArtist = normalizeToken(String(item?.artist || item?.a || "").toLowerCase());
    const sourceIdentity = normalizeToken(String(item?.sourceUrl || item?.url || item?.detailUrl || ""));
    const recoveryIdentity = [stableItemIdentity, primaryItemId, normalizedItemTitle, sourceIdentity].filter(Boolean).join("|") || "unknown";
    const cacheKey = `${exhId || "no-exh"}_${recoveryIdentity}`;
    const useRecoveryCache = recoveryIdentity !== "unknown";

    if (useRecoveryCache && _recoveredUrlsCache[cacheKey] !== undefined) {
      return _recoveredUrlsCache[cacheKey] || null;
    }

    const normalizedItemIdCandidates = new Set(
      itemIdCandidates
        .flatMap((candidate) => expandArtworkIdCandidates(candidate))
        .map((candidate) => candidate.toLowerCase().trim())
        .filter(Boolean),
    );
    const looseIdTokens = extractLooseIdTokens(Array.from(normalizedItemIdCandidates));

    const searchInData = (data: unknown[]): string | null => {
      if (!Array.isArray(data)) return null;
      // 1) Exact ID match across multiple possible ID fields
      let found = data.find((entry) => {
        const d = (entry && typeof entry === "object") ? (entry as Record<string, unknown>) : {};
        const candidateIds = [d.id, d.objectNumber, d.inventoryNo, d.artworkId]
          .flatMap((candidateId) => expandArtworkIdCandidates(candidateId))
          .map((candidateId) => candidateId.toLowerCase().trim())
          .filter(Boolean);
        if (candidateIds.some((candidateId) => normalizedItemIdCandidates.has(candidateId))) return true;

        const haystack = [d.id, d.objectNumber, d.inventoryNo, d.artworkId, d.sourceUrl, d.url, d.detailUrl]
          .map((value) => String(value || "").toLowerCase())
          .join(" ");
        return looseIdTokens.some((token) => token.length >= 4 && haystack.includes(token));
      }) as Record<string, unknown> | undefined;
      // 2) Restrictive title fallback: only when there is enough contextual anchor.
      const allowTitleFallback = Boolean(itemTitle && itemTitle.length > 3 && (exhCandidates.length > 0 || sourceIdentity || normalizedItemArtist));
      if (!found && allowTitleFallback) {
        found = data.find((entry) => {
          const d = (entry && typeof entry === "object") ? (entry as Record<string, unknown>) : {};
          const rawTitle = String(d.title || d.name || "").toLowerCase().trim();
          if (rawTitle === itemTitle) return true;

          const normalizedRawTitle = normalizeToken(rawTitle);
          const rawArtist = normalizeToken(String(d.artist || d.a || "").toLowerCase());
          const titleMatches = Boolean(
            normalizedRawTitle && normalizedItemTitle && (
              normalizedRawTitle === normalizedItemTitle
              || normalizedRawTitle.includes(normalizedItemTitle)
              || normalizedItemTitle.includes(normalizedRawTitle)
            ),
          );
          if (!titleMatches) return false;

          if (!normalizedItemArtist) return true;
          if (!rawArtist) return false;
          return rawArtist === normalizedItemArtist || rawArtist.includes(normalizedItemArtist) || normalizedItemArtist.includes(rawArtist);
        }) as Record<string, unknown> | undefined;
      }
      if (!found) return null;
      return getPrimaryImageCandidate(found) || null;
    };

    for (const candidate of exhCandidates) {
      try {
        const data = await fetchDataset(candidate);
        if (!data || data.length === 0) continue;
        const realImage = searchInData(data);
        if (realImage) {
          if (useRecoveryCache) _recoveredUrlsCache[cacheKey] = realImage;
          return realImage;
        }
      } catch { /* network error or parse error — try next candidate */ }
    }

    try {
      const workerImage = await lookupImageFromSearchWorker({
        idCandidates: itemIdCandidates,
        itemTitle,
        itemArtist: String(item.artist || item.a || ""),
        museumName: String(item.museumName || item.museum || item.m || ""),
        sourceUrl: String(item.sourceUrl || item.url || item.detailUrl || item.officialUrl || ""),
        exhibitionHints: exhCandidates,
      });
      if (workerImage) {
        if (useRecoveryCache) _recoveredUrlsCache[cacheKey] = workerImage;
        return workerImage;
      }
    } catch {
      // ignore worker lookup errors
    }

    if (useRecoveryCache) _recoveredUrlsCache[cacheKey] = null;
    return null;
  };

  // ─── URL attempt chain ───────────────────────────────────────────────────
  // Build an ordered list of URLs to try. No hidden Image() probes — the
  // visible <img> itself walks the chain via onError. This matches how the
  // ArtworkLightbox loads images (referrerPolicy="no-referrer" + direct src),
  // so any image that displays in the lightbox will also display here.
  //
  // Chain order per raw URL:
  //   • wsrv-wrapped R2    → unwrapped R2 direct → original wsrv → wsrv(r2, width)
  //   • direct R2 / IIIF   → raw direct → wsrv(raw, width)
  //   • everything else    → wsrv(raw, width) → raw direct
  const urlChain = useMemo(() => {
    const seen = new Set<string>();
    const chain: string[] = [];
    const push = (u: string | null | undefined) => {
      if (!u) return;
      const s = String(u).trim();
      if (!s || seen.has(s) || isMarkedBrokenImageUrl(s)) return;
      seen.add(s);
      chain.push(s);
    };

    const raws: string[] = [];
    if (recoveredSrc) raws.push(recoveredSrc);
    raws.push(...orderedRawCandidates);

    for (const raw of raws) {
      if (!raw || isMarkedBrokenImageUrl(raw)) continue;
      const underlying = _unwrapWsrv(raw);
      const isWrappedR2 = underlying && shouldBypassProxyForUrl(underlying);

      if (isWrappedR2 && underlying) {
        push(underlying);                              // direct R2
        push(raw);                                      // original wsrv wrapper
        push(getOptimizedImageUrl(underlying, width));  // wsrv at new width
      } else if (shouldBypassProxyForUrl(raw)) {
        push(raw);                                      // direct (R2, IIIF, etc.)
        push(getOptimizedImageUrl(raw, width));         // wsrv as fallback
      } else {
        push(getOptimizedImageUrl(raw, width));         // wsrv first (resize+CORS)
        push(raw);                                      // direct origin fallback
      }
      if (chain.length >= 6) break;
    }
    return chain;
  }, [orderedRawCandidates, recoveredSrc, width]);

  const [attemptIdx, setAttemptIdx] = useState(0);
  const recoveryTriedRef = useRef(false);
  // Remembers the URL that last loaded successfully. When the urlChain rebuilds
  // (e.g. because the width prop changed on resize), we keep showing the loaded
  // image instead of remounting the <img> and flashing blank for a re-fetch.
  const loadedSrcRef = useRef<string>('');
  const currentSrc = (imageLoaded && loadedSrcRef.current)
    ? loadedSrcRef.current
    : (urlChain[attemptIdx] || '');

  // Reset the state machine whenever the item (or its URLs) changes.
  useEffect(() => {
    setAttemptIdx(0);
    setImageLoaded(false);
    setIsResolving(true);
    setHasFailedAll(false);
    setRecoveredSrc(null);
    loadedSrcRef.current = '';      // clear the pinned-loaded-src too
    recoveryTriedRef.current = false;
  }, [imageCandidateFingerprint]);

  // When a recovered URL arrives, restart the chain from the top — the new
  // chain will include the recovered URL first.
  useEffect(() => {
    if (!recoveredSrc) return;
    setAttemptIdx(0);
    setImageLoaded(false);
    setIsResolving(true);
  }, [recoveredSrc]);

  // If the chain is empty from the start, mark failed immediately.
  useEffect(() => {
    if (urlChain.length === 0 && !hasFailedAll) {
      setHasFailedAll(true);
      setIsResolving(false);
    }
  }, [urlChain, hasFailedAll]);

  const handleImgError = async () => {
    if (currentSrc) markBrokenImageUrl(currentSrc);

    // Try next URL in the chain first.
    if (attemptIdx < urlChain.length - 1) {
      setAttemptIdx((idx) => idx + 1);
      return;
    }

    // Chain exhausted — run advanced recovery once (dataset JSON + search worker).
    if (!recoveryTriedRef.current) {
      recoveryTriedRef.current = true;
      try {
        const recovered = await handleAdvancedRecovery();
        if (recovered && !isMarkedBrokenImageUrl(recovered)) {
          setRecoveredSrc(recovered);   // triggers chain rebuild via useMemo
          return;
        }
      } catch { /* fall through to failure */ }
    }

    setHasFailedAll(true);
    setIsResolving(false);
  };

  const handleImgLoad = () => {
    if (currentSrc) {
      _loadedImageUrls.add(currentSrc);
      loadedSrcRef.current = currentSrc; // pin so resize doesn't remount img
    }
    setImageLoaded(true);
    setIsResolving(false);
  };

  return (
    <div
      ref={rootRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "linear-gradient(145deg, rgba(42,42,42,0.35) 0%, rgba(14,14,14,0.65) 100%)",
        ...style,
      }}
    >
      {/* Shimmer skeleton — fades out once image has loaded */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: imageLoaded ? 0 : 1,
          transition: "opacity 450ms ease",
          pointerEvents: "none",
          zIndex: 1,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(140deg, rgba(58,58,58,0.28) 0%, rgba(18,18,18,0.58) 55%, rgba(48,48,48,0.24) 100%)",
          }}
        />
        {!hasFailedAll && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              overflow: "hidden",
              opacity: isResolving ? 1 : 0,
              transition: "opacity 300ms ease",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: "-40%",
                width: "40%",
                height: "100%",
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.16) 50%, transparent 100%)",
                filter: "blur(6px)",
                animation: "mypageImageShimmer 1.6s ease-in-out infinite",
              }}
            />
          </div>
        )}
      </div>

      {/* Main image — direct <img> that walks the URL chain on error.
          `referrerPolicy="no-referrer"` matches ArtworkLightbox: many museum
          CDNs reject strict-origin-when-cross-origin requests but accept
          no-referrer. The `key={currentSrc}` forces a fresh <img> per attempt
          so onLoad/onError fire reliably. */}
      {!hasFailedAll && currentSrc && (
        <img
          key={currentSrc}
          src={currentSrc}
          alt={item.title || item.name || "Artwork"}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onLoad={handleImgLoad}
          onError={handleImgError}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            opacity: imageLoaded ? 1 : 0,
            transition: "opacity 420ms ease-out",
            zIndex: 2,
          }}
        />
      )}

      {/* Failed placeholder */}
      {hasFailedAll && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background: "linear-gradient(145deg, rgba(50,50,50,0.22) 0%, rgba(14,14,14,0.48) 100%)",
          }}
        >
          <svg width={24} height={24} viewBox="0 0 24 24" fill="none" opacity={0.3}>
            <rect x={3} y={3} width={18} height={18} rx={2} stroke="#999" strokeWidth={1.5} />
            <circle cx={8.5} cy={8.5} r={1.5} stroke="#999" strokeWidth={1.5} />
            <path d="M3 15l5-5 4 4 3-3 6 6" stroke="#999" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontSize: 10, color: "#666", letterSpacing: "0.1em" }}>NO IMAGE</span>
        </div>
      )}
    </div>
  );
}, (prev, next) => {
  if (prev.width !== next.width) return false;
  if (prev.disableBlur !== next.disableBlur) return false;
  if (prev.style !== next.style) return false;

  const prevItem = prev.item || {};
  const nextItem = next.item || {};
  const prevId = String(prevItem.artworkId || prevItem.id || "");
  const nextId = String(nextItem.artworkId || nextItem.id || "");
  if (prevId !== nextId) return false;

  const prevImage = String(prevItem.image || prevItem.i || prevItem.imageUrl || "");
  const nextImage = String(nextItem.image || nextItem.i || nextItem.imageUrl || "");
  if (prevImage !== nextImage) return false;

  const prevExh = String(prevItem.exhibitionId || prevItem.e || prevItem.sourceCollection || "");
  const nextExh = String(nextItem.exhibitionId || nextItem.e || nextItem.sourceCollection || "");
  if (prevExh !== nextExh) return false;

  const prevSource = String(prevItem.sourceUrl || prevItem.url || prevItem.detailUrl || "");
  const nextSource = String(nextItem.sourceUrl || nextItem.url || nextItem.detailUrl || "");
  if (prevSource !== nextSource) return false;

  return String(prevItem.title || prevItem.name || "") === String(nextItem.title || nextItem.name || "");
});

const MyPage: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [likedArtworks, setLikedArtworks] = useState<any[]>([]);
  const [likedExhibitions, setLikedExhibitions] = useState<any[]>([]);
  const [likedMuseums, setLikedMuseums] = useState<any[]>([]);
  const [likedArtists, setLikedArtists] = useState<any[]>([]);

  const [profileData, setProfileData] = useState<any>({});
  const [username, setUsername] = useState("");

  const [showSlideshow, setShowSlideshow] = useState(false);
  const [lightboxYoutubeId, setLightboxYoutubeId] = useState<string | null>(null);
  const [commentArtwork, setCommentArtwork] = useState<any | null>(null);
  const [productArtwork, setProductArtwork] = useState<any>(null);
  const [galleryArtwork, setGalleryArtwork] = useState<any>(null);

  const [playlists, setPlaylists] = useState<any[]>([]);
  const [playlistArtwork, setPlaylistArtwork] = useState<any>(null);
  const [activePlaylist, setActivePlaylist] = useState<any>(null);
  const [activePlaylistItems, setActivePlaylistItems] = useState<any[]>([]);

  const [userScore, setUserScore] = useState(0);
  const [userRank, setUserRank] = useState(RANKS[0]);

  const [viewMode, setViewMode] = useState<ViewMode>("artworks");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [unlikedItems, setUnlikedItems] = useState<Set<string>>(new Set());

  // Live subscription to users/{uid}/saved_curations (newest-first).
  const { items: savedCurations } = useSavedCurations();

  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.innerWidth < 768 : false));
  const [isLightTheme, setIsLightTheme] = useState<boolean>(() => {
    try {
      return localStorage.getItem("homeTheme") === "light";
    } catch {
      return false;
    }
  });
  const [liveProfilePhoto, setLiveProfilePhoto] = useState<string | null>(null);
  const [liveProfileCrop, setLiveProfileCrop] = useState<ProfileImageCrop | null>(null);
  const [isHeroHovered, setIsHeroHovered] = useState(false);
  const [isHeroPickerOpen, setIsHeroPickerOpen] = useState(false);
  const [selectedHeroArtworkId, setSelectedHeroArtworkId] = useState<string | null>(null);
  const [draftHeroArtworkId, setDraftHeroArtworkId] = useState<string | null>(null);
  const [heroFocusY, setHeroFocusY] = useState(50);
  const [draftHeroFocusY, setDraftHeroFocusY] = useState(50);
  const [isSavingHeroPrefs, setIsSavingHeroPrefs] = useState(false);

  const displayPhotoURL = liveProfilePhoto || profileData.photoURL || user?.photoURL;
  // Only apply the stored crop when the rendered URL is actually the
  // user-uploaded custom photo (i.e. data.photoURL is set in Firestore).
  // When showing the OAuth provider fallback (Google etc.), a stale crop
  // would translate that photo off-screen — render uncropped instead.
  // Note: `liveProfilePhoto` is always truthy for signed-in users because
  // it falls back to user.photoURL, so it cannot be used as the signal.
  const hasCustomPhotoSaved = !!profileData?.photoURL;
  const savedCrop = liveProfileCrop || profileData?.profileImageCrop || null;
  const effectiveProfileCrop = hasCustomPhotoSaved ? savedCrop : null;
  const heroPrefsStorageKey = user ? `mypageHeroPrefs:${user.uid}` : null;

  const clampHeroFocusY = (value: number) => {
    if (!Number.isFinite(value)) return 50;
    return Math.min(85, Math.max(15, Math.round(value)));
  };

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Reset scroll to top on mount/remount (e.g. returning from another tab or modal).
  // Without this, the scroll container may retain a stale scrollTop that hides the hero.
  useEffect(() => {
    // Use rAF to ensure the ref is attached after React commits the DOM
    const raf = requestAnimationFrame(() => {
      const el = scrollContainerRef.current;
      if (el) el.scrollTop = 0;
      // Also reset window scroll in case iOS WebView scrolled the document itself
      try { window.scrollTo(0, 0); } catch { /* ignore */ }
    });
    return () => cancelAnimationFrame(raf);
  }, []); // deliberately empty — run exactly once on mount

  useEffect(() => {
    const syncTheme = () => {
      try {
        setIsLightTheme(localStorage.getItem("homeTheme") === "light");
      } catch {
        setIsLightTheme(false);
      }
    };

    window.addEventListener("theme-changed", syncTheme);
    window.addEventListener("storage", syncTheme);
    return () => {
      window.removeEventListener("theme-changed", syncTheme);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  useEffect(() => {
    if (galleryArtwork || showSlideshow) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [galleryArtwork, showSlideshow]);

  const fetchProfile = async () => {
    if (!user) return;

    const db = getFirestore();
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        setProfileData(userDoc.data());
        if (userDoc.data().nickname) setUsername(userDoc.data().nickname);
        return;
      }

      const legacyDoc = await getDoc(doc(db, `users/${user.uid}/profile/info`));
      if (legacyDoc.exists()) {
        setProfileData({ ...legacyDoc.data(), nickname: legacyDoc.data().username });
        setUsername(legacyDoc.data().username || "");
        return;
      }

      setUsername(user.displayName || user.email?.split("@")[0] || "Art Explorer");
    } catch (error) {
      console.error("Error fetching profile", error);
    }
  };

  const fetchPlaylists = async () => {
    if (!user) return;
    const db = getFirestore();

    try {
      const playlistsQ = query(collection(db, `users/${user.uid}/playlists`), orderBy("createdAt", "desc"));
      const snap = await getDocs(playlistsQ);
      const loaded: any[] = snap.docs.map((playlistDoc) => ({ id: playlistDoc.id, ...playlistDoc.data() }));

      await Promise.all(
        loaded.map(async (playlist) => {
          const itemsSnap = await getDocs(collection(db, `users/${user.uid}/playlists/${playlist.id}/items`));
          playlist.items = itemsSnap.docs.map((itemDoc) => ({ id: itemDoc.id, ...itemDoc.data() }));
        }),
      );

      setPlaylists(loaded);
    } catch (error) {
      console.error("Error fetching playlists", error);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.isAnonymous) {
      navigate("/login", { replace: true, state: { from: "/mypage" } });
      return;
    }

    const db = getFirestore();

    const fetchData = async () => {
      try {
        const [artworksSnap, exhibitionsSnap, museumsSnap, artistsSnap] = await Promise.all([
          getDocs(collection(db, `users/${user.uid}/liked_artworks`)),
          getDocs(collection(db, `users/${user.uid}/liked_exhibitions`)),
          getDocs(collection(db, `users/${user.uid}/liked_museums`)),
          getDocs(collection(db, `users/${user.uid}/liked_artists`)),
        ]);

        setLikedArtworks(
          artworksSnap.docs.map((record) => {
            const data = (record.data() || {}) as Record<string, unknown>;
            const docId = String(record.id || "").trim();
            const canonicalArtworkId = String(data.artworkId || data.id || docId).trim();
            return {
              ...data,
              _docId: docId,
              likeDocId: docId,
              artworkId: canonicalArtworkId,
              id: canonicalArtworkId,
              title: String(data.title || data.name || data.n || "Untitled"),
              name: String(data.name || data.title || data.n || "Untitled"),
              artist: String(data.artist || data.a || "Unknown"),
              museumName: String(data.museumName || data.museum || data.m || ""),
              exhibitionId: String(data.exhibitionId || data.e || data.sourceCollection || ""),
              sourceCollection: String(data.sourceCollection || data.exhibitionId || data.e || ""),
              sourceUrl: String(data.sourceUrl || data.url || data.detailUrl || data.officialUrl || ""),
              image: String(data.image || data.i || data.imageUrl || ""),
              i: String(data.i || data.image || data.imageUrl || ""),
            };
          }),
        );
        setLikedExhibitions(exhibitionsSnap.docs.map((record) => ({ id: record.id, ...record.data() })));
        setLikedMuseums(museumsSnap.docs.map((record) => ({ id: record.id, ...record.data() })));
        setLikedArtists(artistsSnap.docs.map((record) => ({ id: record.id, ...record.data() })));

        await Promise.all([fetchPlaylists(), fetchProfile()]);
      } catch (error) {
        console.error("Error fetching mypage data", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user || loading) return;

    const calculateScore = async () => {
      const db = getFirestore();
      let score = 0;

      score += likedArtworks.length;
      score += likedExhibitions.length * 2;

      try {
        const postsQuery = query(collection(db, "community"), where("authorId", "==", user.uid));
        const postsSnapshot = await getCountFromServer(postsQuery);
        score += postsSnapshot.data().count * 5;
      } catch (error) {
        console.warn("Could not fetch community stats for score", error);
      }

      setUserScore(score);

      let currentRank = RANKS[0];
      for (let i = RANKS.length - 1; i >= 0; i -= 1) {
        if (score >= RANKS[i].threshold) {
          currentRank = RANKS[i];
          break;
        }
      }
      setUserRank(currentRank);
    };

    calculateScore();
  }, [user, loading, likedArtworks.length, likedExhibitions.length]);

  useEffect(() => {
    if (!user || user.isAnonymous) {
      setLiveProfilePhoto(null);
      setLiveProfileCrop(null);
      return;
    }

    let mounted = true;

    const stopObserve = firebaseWebPort.profile.observeUserProfile?.(
      user.uid,
      (data) => {
        if (!mounted) return;
        if (data) {
          setProfileData((prev: any) => ({ ...prev, ...data }));
          if (data.nickname) setUsername(data.nickname);
        }
        setLiveProfilePhoto(data?.photoURL || user.photoURL || null);
        setLiveProfileCrop(data?.profileImageCrop || null);
      },
      () => {
        if (!mounted) return;
        setLiveProfilePhoto(user.photoURL || null);
        setLiveProfileCrop(null);
      },
    );

    if (!stopObserve) {
      void firebaseWebPort.profile
        .getUserProfile(user.uid)
        .then((data) => {
          if (!mounted) return;
          if (data) {
            setProfileData((prev: any) => ({ ...prev, ...data }));
            if (data.nickname) setUsername(data.nickname);
          }
          setLiveProfilePhoto(data?.photoURL || user.photoURL || null);
          setLiveProfileCrop(data?.profileImageCrop || null);
        })
        .catch(() => {
          if (!mounted) return;
          setLiveProfilePhoto(user.photoURL || null);
          setLiveProfileCrop(null);
        });
    }

    return () => {
      mounted = false;
      if (typeof stopObserve === "function") stopObserve();
    };
  }, [user]);

  const handleUnlike = async (itemId: string, itemType: "artwork" | "exhibition" | "museum" | "artist") => {
    if (!user) return;

    const db = getFirestore();
    const collectionName =
      itemType === "museum"
        ? "liked_museums"
        : itemType === "exhibition"
          ? "liked_exhibitions"
          : itemType === "artist"
            ? "liked_artists"
            : "liked_artworks";

    const firestoreItemId = String(itemId).includes("/") ? String(itemId).replace(/\//g, "__") : String(itemId);
    const ref = doc(db, `users/${user.uid}/${collectionName}/${firestoreItemId}`);

    try {
      setUnlikedItems((prev) => new Set(prev).add(itemId));
      if (itemType === "artwork") {
        setLikedArtworks((prev) => prev.filter((art) => String(art.artworkId || art.id) !== String(itemId)));
      }
      await deleteDoc(ref);
    } catch (error) {
      console.error("Error unliking item", error);
      setUnlikedItems((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const handleRelike = async (item: any, itemType: "artwork" | "exhibition" | "museum" | "artist") => {
    if (!user) return;

    const db = getFirestore();
    const itemId =
      itemType === "museum"
        ? item.museumId || item.id
        : itemType === "exhibition"
          ? item.exhibitionId || item.id
          : itemType === "artist"
            ? item.artist || item.id
            : item.artworkId || item.id;

    if (!itemId) return;

    const collectionName =
      itemType === "museum"
        ? "liked_museums"
        : itemType === "exhibition"
          ? "liked_exhibitions"
          : itemType === "artist"
            ? "liked_artists"
            : "liked_artworks";

    const firestoreItemId = String(itemId).includes("/") ? String(itemId).replace(/\//g, "__") : String(itemId);
    const ref = doc(db, `users/${user.uid}/${collectionName}/${firestoreItemId}`);

    try {
      setUnlikedItems((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      if (itemType === "artwork") {
        const normalizedId = String(itemId);
        const normalizedLike = {
          ...item,
          id: normalizedId,
          artworkId: normalizedId,
          name: item.name || item.title || item.n || "Untitled",
          artist: item.artist || item.a || "",
          image: item.image || item.i || item.imageUrl || item.thumbnail || "",
          likedAt: new Date(),
        };
        setLikedArtworks((prev) => {
          const filtered = prev.filter((art) => String(art.artworkId || art.id) !== normalizedId);
          return [normalizedLike, ...filtered];
        });
      }
      await setDoc(ref, { ...item, likedAt: new Date() });
    } catch (error) {
      console.error("Error re-liking item", error);
    }
  };

  const resolveCollectionIdForMuseum = (art: any, museum?: any): string | null => {
    if (!museum) return null;

    const normalize = (value?: string) => normalizeToken(value) || "";
    const permanent = museum.permanentExhibitions || [];
    const artExhId = normalize(art.exhibitionId);

    const direct = permanent.find((pe: any) => normalize(pe?.id) === artExhId);
    if (direct?.id) return direct.id;

    if (artExhId) {
      const aliasMatch = permanent.find((pe: any) => getExhibitionTokens(pe).has(artExhId));
      if (aliasMatch?.id) return aliasMatch.id;
    }

    const artId = normalize(art.artworkId || art.id);
    const artImage = normalize(art.image || art.imageUrl || art.thumbnail?.url || art.thumbnail?.src || art.thumbnail?.imageUrl || art.thumbnail?.iiifUrl);
    const artSource = normalize(art.sourceUrl || art.detailUrl || art.url || art.link || art.source);

    let bestMatch: { id: string; score: number } | null = null;

    for (const pe of permanent) {
      const peId = normalize(pe?.id);
      if (!peId) continue;

      let score = 0;
      if (artId) {
        if (artId === peId) score = 1000;
        else if (artId.startsWith(`${peId}-`) || artId.startsWith(`${peId}_`)) score = 900 + peId.length;
        else if (artId.includes(`${peId}-`) || artId.includes(`${peId}_`)) score = 700 + peId.length;
        else if (artId.includes(peId)) score = 500 + peId.length;
      }

      const collectionFile = (pe as any)?.collectionFile as string | undefined;
      if (!score && collectionFile) {
        const base = normalize(String(collectionFile).replace(".json", ""));
        if (base && (artId.includes(base) || artImage.includes(base) || artSource.includes(base))) {
          score = 600 + base.length;
        }
      }

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { id: pe.id, score };
      }
    }

    if (bestMatch?.id) return bestMatch.id;
    return permanent?.[0]?.id || null;
  };

  const resolveCollectionIdAcrossMuseums = (art: any): string | null => {
    const normalize = (value?: string) => normalizeToken(value) || "";
    const artExhId = normalize(art.exhibitionId);

    if (artExhId) {
      for (const museum of exhibitions) {
        for (const pe of museum.permanentExhibitions || []) {
          const peId = normalize(pe?.id);
          if (peId === artExhId || getExhibitionTokens(pe).has(artExhId)) return pe.id;
        }
      }
    }

    const artId = normalize(art.artworkId || art.id);
    const artImage = normalize(art.image || art.imageUrl || art.thumbnail?.url || art.thumbnail?.src || art.thumbnail?.imageUrl || art.thumbnail?.iiifUrl);
    const artSource = normalize(art.sourceUrl || art.detailUrl || art.url || art.link || art.source);

    let bestMatch: { id: string; score: number } | null = null;

    for (const museum of exhibitions) {
      for (const pe of museum.permanentExhibitions || []) {
        const peId = normalize(pe?.id);
        if (!peId) continue;

        let score = 0;
        if (artId) {
          if (artId === peId) score = 1000;
          else if (artId.startsWith(`${peId}-`) || artId.startsWith(`${peId}_`)) score = 900 + peId.length;
          else if (artId.includes(`${peId}-`) || artId.includes(`${peId}_`)) score = 700 + peId.length;
          else if (artId.includes(peId)) score = 500 + peId.length;
        }

        const collectionFile = (pe as any)?.collectionFile as string | undefined;
        if (!score && collectionFile) {
          const base = normalize(String(collectionFile).replace(".json", ""));
          if (base && (artId.includes(base) || artImage.includes(base) || artSource.includes(base))) {
            score = 600 + base.length;
          }
        }

        if (score > 0 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { id: pe.id, score };
        }
      }
    }

    return bestMatch?.id || null;
  };

  const getExhibitionId = (art: any) => {
    if (art.exhibitionId) return art.exhibitionId;

    const direct = resolveCollectionIdAcrossMuseums(art);
    if (direct) return direct;

    const match = findMuseumForArtwork(art, exhibitions);
    const fromMuseum = resolveCollectionIdForMuseum(art, match);
    if (fromMuseum) return fromMuseum;

    const artId = art.artworkId || art.id || "";
    if (artId.startsWith("bruecke-")) return "bruecke-collection";

    return null;
  };

  const handleViewInMuseum = (art: any) => {
    let exhibitionId = getExhibitionId(art);

    if (!exhibitionId) {
      const match = findMuseumForArtwork(art, exhibitions);
      if (match) {
        exhibitionId = resolveCollectionIdForMuseum(art, match) || match.permanentExhibitions?.[0]?.id || null;
      }
    }

    if (!exhibitionId) {
      const targetName = (art.museumName || art.museum || art.source || "").toLowerCase();
      if (targetName.includes("neue nationalgalerie")) exhibitionId = "smb-neue-nationalgalerie-collection";
      else if (targetName.includes("alte nationalgalerie")) exhibitionId = "smb-alte-nationalgalerie-collection";
      else if (targetName.includes("bode-museum") || targetName.includes("bode museum")) exhibitionId = "smb-bode-museum-collection";
      else if (targetName.includes("brucke") || targetName.includes("brücke")) exhibitionId = "bruecke-museum-collection";
      else if (targetName.includes("picasso") && targetName.includes("barcelona")) exhibitionId = "picasso-bcn-collection";
    }

    if (exhibitionId) {
      sessionStorage.setItem(
        "pendingMuseumSearchQuery",
        JSON.stringify({
          artworkTitle: art.title || art.name,
          artworkId: art.artworkId || art.id,
        }),
      );
      setGalleryArtwork(null);
      navigate(`/interactive/world/city/${encodeURIComponent(exhibitionId)}`);
      return;
    }

    const match = findMuseumForArtwork(art, exhibitions);
    if (match) {
      setGalleryArtwork(null);
      if (match.permanentExhibitions?.length > 0) {
        navigate(`/interactive/world/city/${encodeURIComponent(match.id)}`);
      } else {
        navigate(`/interactive/world/city/${encodeURIComponent(match.id)}`);
      }
      return;
    }

    alert("이 작품의 미술관 정보를 찾을 수 없습니다.");
  };

  const pageBg = isLightTheme ? "#FAFAFA" : "#080808";
  const panelBg = isLightTheme ? "rgba(255,255,255,0.84)" : "rgba(8,8,8,0.84)";
  const panelBorder = isLightTheme ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.10)";
  const pageText = isLightTheme ? "rgba(0,0,0,0.88)" : "rgba(255,255,255,0.88)";
  const subText = isLightTheme ? "rgba(0,0,0,0.56)" : "rgba(255,255,255,0.56)";
  const faintText = isLightTheme ? "rgba(0,0,0,0.36)" : "rgba(255,255,255,0.36)";
  const divider = isLightTheme ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)";
  const lime = "#D4A547";
  const heroControlTop = "calc(env(safe-area-inset-top, 0px) - 4px)";
  const heroPickerTop = "calc(env(safe-area-inset-top, 0px) + 34px)";

  const heroImageOptions = useMemo(() => {
    const sanitizeHeroImage = (value: unknown): string => {
      const raw = typeof value === "string" ? value.trim() : "";
      if (!raw) return "";
      if (raw === "default.jpg" || raw === "/default.jpg") return "";
      if (/iiif\.deutsche-digitale-bibliothek\.de\/image\/2\/[^/]+\/full\/(?:full|!\d+,\d+|max)\/0\/default\.jpg/i.test(raw)) return "";
      return raw;
    };

    const buildOptionId = (item: any, index: number) => {
      const directId = String(item.artworkId || item.id || "").trim();
      if (directId) return directId;

      const seed = String(
        item.sourceUrl ||
        item.detailUrl ||
        item.url ||
        item.link ||
        item.title ||
        item.name ||
        `idx-${index}`,
      )
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 120);

      return seed ? `hero-${seed}` : `hero-${index}`;
    };

    return likedArtworks
      .map((item, index) => {
        const image = sanitizeHeroImage(getPrimaryImageCandidate(item));

        const optionId = buildOptionId(item, index);
        return {
          id: optionId,
          image,
          title: item.title || item.name || "Untitled",
          artist: item.artist || item.a || "",
          previewItem: {
            ...item,
            artworkId: item.artworkId || item.id || optionId,
            id: item.id || item.artworkId || optionId,
            image,
          },
        };
      })
      .filter((option) => !!option.id) as Array<{ id: string; image: string; title: string; artist: string; previewItem: any }>;
  }, [likedArtworks]);

  useEffect(() => {
    const serverHeroId = typeof profileData?.heroArtworkId === "string" ? profileData.heroArtworkId : null;
    const serverHeroFocus = clampHeroFocusY(Number(profileData?.heroImageFocusY ?? 50));
    const serverUpdatedAt = Number(profileData?.heroPrefsUpdatedAt || 0);

    let localHeroId: string | null = null;
    let localHeroFocus = 50;
    let localUpdatedAt = 0;

    if (heroPrefsStorageKey) {
      try {
        const raw = localStorage.getItem(heroPrefsStorageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            heroArtworkId?: string | null;
            heroImageFocusY?: number;
            updatedAt?: number;
          };
          localHeroId = typeof parsed.heroArtworkId === "string" ? parsed.heroArtworkId : null;
          localHeroFocus = clampHeroFocusY(Number(parsed.heroImageFocusY ?? 50));
          localUpdatedAt = Number(parsed.updatedAt || 0);
        }
      } catch {
        // Ignore malformed local cache.
      }
    }

    const useLocal = localUpdatedAt > serverUpdatedAt;
    setSelectedHeroArtworkId(useLocal ? localHeroId : serverHeroId);
    setHeroFocusY(useLocal ? localHeroFocus : serverHeroFocus);
  }, [profileData?.heroArtworkId, profileData?.heroImageFocusY, profileData?.heroPrefsUpdatedAt, heroPrefsStorageKey]);

  useEffect(() => {
    if (!isHeroPickerOpen) return;
    setDraftHeroArtworkId(selectedHeroArtworkId);
    setDraftHeroFocusY(heroFocusY);
  }, [isHeroPickerOpen, selectedHeroArtworkId, heroFocusY]);

  useEffect(() => {
    if (!selectedHeroArtworkId) return;
    const exists = heroImageOptions.some((item) => item.id === selectedHeroArtworkId);
    if (!exists) setSelectedHeroArtworkId(null);
  }, [heroImageOptions, selectedHeroArtworkId]);

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node || !isHeroPickerOpen) return;
    const handleScroll = () => setIsHeroPickerOpen(false);
    node.addEventListener("scroll", handleScroll, { passive: true });
    return () => node.removeEventListener("scroll", handleScroll);
  }, [isHeroPickerOpen]);

  useEffect(() => {
    if (!draftHeroArtworkId) return;
    const exists = heroImageOptions.some((item) => item.id === draftHeroArtworkId);
    if (!exists) setDraftHeroArtworkId(null);
  }, [heroImageOptions, draftHeroArtworkId]);

  const previewHeroArtworkId = isHeroPickerOpen ? draftHeroArtworkId : selectedHeroArtworkId;
  const previewHeroFocusY = isHeroPickerOpen ? draftHeroFocusY : heroFocusY;
  const selectedHeroOption = heroImageOptions.find((item) => item.id === previewHeroArtworkId) || null;
  const heroImage =
    selectedHeroOption?.image ||
    heroImageOptions.find((item) => !!item.image)?.image ||
    displayPhotoURL ||
    "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?w=1800&q=80";

  const tabs = useMemo(
    () => [
      { id: "artworks" as const, label: "Artworks", icon: Palette, count: likedArtworks.length },
      { id: "exhibitions" as const, label: "Exhibitions", icon: Calendar, count: likedExhibitions.length },
      { id: "museums" as const, label: "Museums", icon: MapPin, count: likedMuseums.length },
      { id: "artists" as const, label: "Artists", icon: User, count: likedArtists.length },
      { id: "playlists" as const, label: "Playlists", icon: ListMusic, count: playlists.length },
      { id: "curations" as const, label: "Curations", icon: Bookmark, count: savedCurations.length },
    ],
    [likedArtworks.length, likedExhibitions.length, likedMuseums.length, likedArtists.length, playlists.length, savedCurations.length],
  );

  const currentItems = useMemo(() => {
    if (activePlaylist) return activePlaylistItems;
    if (viewMode === "artworks") return likedArtworks;
    if (viewMode === "exhibitions") return likedExhibitions;
    if (viewMode === "museums") return likedMuseums;
    if (viewMode === "artists") return likedArtists;
    return [];
  }, [activePlaylist, activePlaylistItems, likedArtworks, likedExhibitions, likedMuseums, likedArtists, viewMode]);

  const toMillis = (value: any) => {
    if (!value) return 0;
    if (typeof value?.toMillis === "function") return value.toMillis();
    if (typeof value?.seconds === "number") return value.seconds * 1000;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const sortedItems = useMemo(() => {
    const cloned = [...currentItems];
    cloned.sort((a, b) => {
      if (sortMode === "recent") return toMillis(b.likedAt) - toMillis(a.likedAt);
      if (sortMode === "oldest") return (a.year || 0) - (b.year || 0);
      return (b.year || 0) - (a.year || 0);
    });
    return cloned;
  }, [currentItems, sortMode]);

  const initialBatchSize = isMobile ? 48 : 32;
  const loadMoreStep = isMobile ? 8 : 12;

  const [displayedCount, setDisplayedCount] = useState(initialBatchSize);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDisplayedCount(initialBatchSize);
  }, [currentItems, sortMode, viewMode, initialBatchSize]);

  const isArtworkLikeMode = activePlaylist !== null || viewMode === "artworks";

  const resolveItemType = (mode: ViewMode) => {
    if (mode === "museums") return "museum" as const;
    if (mode === "exhibitions") return "exhibition" as const;
    if (mode === "artists") return "artist" as const;
    return "artwork" as const;
  };

  const getItemId = (item: any, mode: ViewMode) => {
    if (mode === "museums") return String(item.museumId || item.id || "");
    if (mode === "exhibitions") return String(item.exhibitionId || item.id || "");
    if (mode === "artists") return String(item.artist || item.id || "");
    return String(item.artworkId || item.id || "");
  };

  const openItem = async (item: any, mode: ViewMode) => {
    if (mode === "museums") {
      const targetId = item.museumId || item.slug || item.id;
      if (targetId) {
        sessionStorage.setItem(
          "pendingMuseum",
          JSON.stringify({ id: targetId, name: item.name || "", image: item.image || "" }),
        );
        navigate(`/?museum=${encodeURIComponent(targetId)}`);
      }
      return;
    }

    if (mode === "exhibitions") {
      const targetId = item.exhibitionId || item.id;
      if (targetId) navigate(`/?exhibition=${encodeURIComponent(targetId)}`);
      return;
    }

    if (item.youtubeId) {
      setLightboxYoutubeId(item.youtubeId);
      return;
    }

    if (mode !== "artworks") return;

    const exhId = getFallbackExhibitionIdForJson(item);
    const itemId = String(item.artworkId || item.id || "").trim();
    const titleIdentity = normalizeToken(String(item.title || item.name || "").toLowerCase().trim());
    const sourceIdentity = normalizeToken(String(item.sourceUrl || item.url || item.detailUrl || "").toLowerCase().trim());
    const stableIdentity = getStableArtworkIdentity(item);
    const recoveryIdentity = [stableIdentity, itemId, titleIdentity, sourceIdentity].filter(Boolean).join("|") || "unknown";
    const cacheKey = `${exhId || "no-exh"}_${recoveryIdentity}`;
    const recoveredSrc = _recoveredUrlsCache[cacheKey];
    const idCandidates = getArtworkIdCandidates(item);
    let fallbackImage = recoveredSrc || getPrimaryImageCandidate(item) || "";

    if (!fallbackImage && idCandidates.length > 0) {
      try {
        const workerImage = await lookupImageFromSearchWorker({
          idCandidates,
          itemTitle: String(item.title || item.name || ""),
          itemArtist: String(item.artist || item.a || ""),
          museumName: String(item.museumName || item.museum || item.m || ""),
          sourceUrl: String(item.sourceUrl || item.url || item.detailUrl || item.officialUrl || ""),
          exhibitionHints: [exhId, item?.exhibitionId, item?.e, item?.sourceCollection].map((v) => String(v || "")).filter(Boolean),
        });
        if (workerImage) fallbackImage = workerImage;
      } catch {
        // ignore worker lookup failures
      }
    }

    setGalleryArtwork({
      ...item,
      image: fallbackImage,
      ...(recoveredSrc && { lightboxImage: recoveredSrc }),
    });
  };

  const displayName = profileData.nickname || username || user?.displayName || "Art Explorer";

  const saveHeroBackgroundPreference = async () => {
    const nextHeroId = draftHeroArtworkId || null;
    const nextFocusY = clampHeroFocusY(draftHeroFocusY);
    const nextUpdatedAt = Date.now();

    setSelectedHeroArtworkId(nextHeroId);
    setHeroFocusY(nextFocusY);

    if (heroPrefsStorageKey) {
      try {
        localStorage.setItem(
          heroPrefsStorageKey,
          JSON.stringify({
            heroArtworkId: nextHeroId,
            heroImageFocusY: nextFocusY,
            updatedAt: nextUpdatedAt,
          }),
        );
      } catch {
        // Ignore storage failures.
      }
    }

    if (!user) {
      setIsHeroPickerOpen(false);
      return;
    }

    setIsSavingHeroPrefs(true);
    try {
      const db = getFirestore();
      await setDoc(
        doc(db, "users", user.uid),
        {
          heroArtworkId: nextHeroId,
          heroImageFocusY: nextFocusY,
          heroPrefsUpdatedAt: nextUpdatedAt,
        },
        { merge: true },
      );

      setProfileData((prev: any) => ({
        ...prev,
        heroArtworkId: nextHeroId,
        heroImageFocusY: nextFocusY,
        heroPrefsUpdatedAt: nextUpdatedAt,
      }));
      window.dispatchEvent(new CustomEvent("profile-updated"));
      setIsHeroPickerOpen(false);
    } catch (error) {
      console.error("Error saving hero background preference", error);
    } finally {
      setIsSavingHeroPrefs(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: pageBg,
          color: pageText,
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      >
        Loading profile...
      </div>
    );
  }

  const renderArtworkCard = (rawItem: any, index: number) => {
    const normalized = {
      ...rawItem,
      image: getPrimaryImageCandidate(rawItem),
      title: rawItem.title || rawItem.name || rawItem.n || "Untitled",
      artist: rawItem.artist || rawItem.a || "",
      museumName: rawItem.museumName || rawItem.m || "",
    };

    const modeForItem: ViewMode = activePlaylist ? "artworks" : viewMode;
    const itemType = resolveItemType(modeForItem);
    const itemId = getItemId(normalized, modeForItem);
    const isUnliked = unlikedItems.has(itemId);

    const stableCardKey = String(
      rawItem?._docId || rawItem?.likeDocId || `${itemType}-${itemId}-${normalizeToken(String(normalized.title || "").toLowerCase()) || index}`,
    );

    return (
      <div
        key={`${modeForItem}-${stableCardKey}`}
        onClick={() => openItem(normalized, modeForItem)}
        style={{
          breakInside: "avoid",
          marginBottom: 2,
          position: "relative",
          overflow: "hidden",
          cursor: "pointer",
          borderRadius: 0,
          aspectRatio: "1 / 1",
          background: isLightTheme ? "#f0f0f0" : "#151515",
        }}
      >
        <MyPageImage item={normalized} width={isMobile ? 260 : 400} disableBlur />

        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, rgba(0,0,0,0.76) 0%, transparent 54%)",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "absolute",
            right: isMobile ? 6 : 7,
            bottom: isMobile ? 6 : 10,
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: isMobile ? 6 : 8,
            zIndex: 2,
          }}
        >
          <button
            onClick={(event) => {
              event.stopPropagation();
              setPlaylistArtwork(normalized);
            }}
            style={{
              width: isMobile ? 28 : 30,
              height: isMobile ? 28 : 30,
              borderRadius: "50%",
              border: "none",
              background: "rgba(0,0,0,0.56)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
            }}
            title="Save to Playlist"
          >
            <BookmarkPlus size={isMobile ? 12 : 14} strokeWidth={2.2} />
          </button>

          <button
            onClick={(event) => {
              event.stopPropagation();
              setProductArtwork(normalized);
            }}
            style={{
              width: isMobile ? 28 : 30,
              height: isMobile ? 28 : 30,
              borderRadius: "50%",
              border: "none",
              background: "rgba(0,0,0,0.56)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
            }}
            title="Purchase Product"
          >
            <ShoppingBag size={isMobile ? 12 : 14} strokeWidth={2.1} />
          </button>

          <button
            onClick={(event) => {
              event.stopPropagation();
              if (isUnliked) handleRelike(normalized, itemType);
              else handleUnlike(itemId, itemType);
            }}
            style={{
              width: isMobile ? 28 : 30,
              height: isMobile ? 28 : 30,
              borderRadius: "50%",
              border: "none",
              background: "rgba(0,0,0,0.56)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
            }}
            title={isUnliked ? "Like again" : "Unlike"}
          >
            <Heart size={isMobile ? 13 : 15} strokeWidth={2.2} fill={isUnliked ? "none" : lime} color={isUnliked ? "#fff" : lime} />
          </button>
        </div>

        {!isMobile && (
          <div style={{ position: "absolute", left: 8, right: 40, bottom: 8, color: "#fff", pointerEvents: "none" }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {normalized.title}
            </div>
            <div
              style={{
                marginTop: 2,
                fontSize: 10,
                opacity: 0.88,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {normalized.artist || normalized.museumName}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSimpleCard = (rawItem: any, index: number) => {
    const normalized = {
      ...rawItem,
      image: getPrimaryImageCandidate(rawItem),
      title: rawItem.title || rawItem.name || rawItem.n || "Untitled",
      subtitle: rawItem.artist || rawItem.museumName || rawItem.location || "",
    };


    const itemType = resolveItemType(viewMode);
    const itemId = getItemId(normalized, viewMode);
    const isUnliked = unlikedItems.has(itemId);

    return (
      <div
        key={`${viewMode}-${itemId}-${index}`}
        onClick={() => openItem(normalized, viewMode)}
        style={{
          position: "relative",
          borderRadius: 10,
          overflow: "hidden",
          border: `1px solid ${divider}`,
          background: isLightTheme ? "#fff" : "rgba(255,255,255,0.03)",
          cursor: "pointer",
        }}
      >
        <div style={{ aspectRatio: "4 / 5", background: isLightTheme ? "#f0f0f0" : "#1a1a1a" }}>
          <MyPageImage item={normalized} width={isMobile ? 240 : 400} disableBlur />
        </div>

        <button
          onClick={(event) => {
            event.stopPropagation();
            if (isUnliked) handleRelike(normalized, itemType);
            else handleUnlike(itemId, itemType);
          }}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: isMobile ? 28 : 28,
            height: isMobile ? 28 : 28,
            borderRadius: "50%",
            border: "none",
            background: "rgba(0,0,0,0.56)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <Heart size={isMobile ? 13 : 13} strokeWidth={2.1} fill={isUnliked ? "none" : lime} color={isUnliked ? "#fff" : lime} />
        </button>

        <div style={{ padding: "8px 9px" }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: pageText,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {normalized.title}
          </div>
          <div
            style={{
              marginTop: 2,
              fontSize: 10,
              color: subText,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {normalized.subtitle}
          </div>
        </div>
      </div>
    );
  };

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    
    // Start loading early and in smaller chunks for smoother visual cadence.
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 1800) {
      setDisplayedCount((prev) => {
        if (prev >= sortedItems.length) return prev;
        return Math.min(prev + loadMoreStep, sortedItems.length);
      });
    }
  };

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      style={{
        width: "100%",
        minHeight: "100dvh",
        height: "100%",
        overflowY: "auto",
        touchAction: "pan-y",
        WebkitOverflowScrolling: "touch",
        overscrollBehaviorY: "contain",
        paddingTop: 0,
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 100px)",
        background: pageBg,
        color: pageText,
        fontFamily: "'Space Grotesk', 'Apple SD Gothic Neo', sans-serif",
      }}
    >
      <div
        style={{
          position: "relative",
          height: isMobile ? "calc(258px + env(safe-area-inset-top, 0px))" : 340,
          overflow: "hidden",
        }}
        onMouseEnter={() => setIsHeroHovered(true)}
        onMouseLeave={() => {
          setIsHeroHovered(false);
          if (!isMobile) setIsHeroPickerOpen(false);
        }}
      >
        <img
          src={getOptimizedImageUrl(heroImage, 1400)}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `50% ${previewHeroFocusY}%` }}
        />

        <div
          style={{
            position: "absolute",
            inset: 0,
            background: isLightTheme
              ? "linear-gradient(to bottom, rgba(255,255,255,0.12) 0%, rgba(250,250,250,0.40) 55%, rgba(250,250,250,0.98) 100%)"
              : "linear-gradient(to bottom, rgba(0,0,0,0.14) 0%, rgba(0,0,0,0.56) 58%, rgba(8,8,8,0.98) 100%)",
          }}
        />

        {heroImageOptions.length > 0 && (
          <>
            <button
              onClick={() => setIsHeroPickerOpen((prev) => !prev)}
              style={{
                position: "absolute",
                top: heroControlTop,
                right: 8,
                width: 34,
                height: 34,
                borderRadius: "50%",
                border: panelBorder,
                background: panelBg,
                color: pageText,
                backdropFilter: isMobile ? "none" : "blur(10px)",
                WebkitBackdropFilter: isMobile ? "none" : "blur(10px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                cursor: "pointer",
                zIndex: 260100,
                opacity: isMobile || isHeroHovered || isHeroPickerOpen ? 1 : 0,
                pointerEvents: isMobile || isHeroHovered || isHeroPickerOpen ? "auto" : "none",
                transition: "opacity 0.18s ease",
              }}
              title={t({ ko: "배경 변경", en: "Change background" })}
            >
              <Palette size={15} strokeWidth={2.2} />
            </button>
          </>
        )}

      </div>

      {isHeroPickerOpen && heroImageOptions.length > 0 && (
        <div
          style={{
            position: "fixed",
            top: heroPickerTop,
            right: 12,
            width: isMobile ? "min(92vw, 360px)" : 360,
            maxHeight: isMobile ? "50vh" : 380,
            overflowY: "auto",
            padding: 10,
            borderRadius: 12,
            border: panelBorder,
            background: panelBg,
            backdropFilter: isMobile ? "none" : "blur(16px)",
            WebkitBackdropFilter: isMobile ? "none" : "blur(16px)",
            boxShadow: isLightTheme ? "0 16px 28px rgba(0,0,0,0.16)" : "0 18px 30px rgba(0,0,0,0.42)",
            zIndex: 260101,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: pageText }}>{t({ ko: "하트 작품 배경", en: "Heart List Backgrounds" })}</span>
            <button
              onClick={() => setDraftHeroArtworkId(null)}
              style={{
                border: panelBorder,
                borderRadius: 999,
                background: "transparent",
                color: subText,
                height: 22,
                padding: "0 8px",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {t({ ko: "자동", en: "Auto" })}
            </button>
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: subText, letterSpacing: "0.02em" }}>
                {t({ ko: "배경 위치", en: "Background position" })}
              </span>
              <span style={{ fontSize: 10, color: pageText }}>{clampHeroFocusY(draftHeroFocusY)}%</span>
            </div>
            <input
              type="range"
              min={15}
              max={85}
              step={1}
              value={clampHeroFocusY(draftHeroFocusY)}
              onChange={(event) => setDraftHeroFocusY(Number(event.currentTarget.value))}
              style={{ width: "100%", accentColor: lime }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {heroImageOptions.slice(0, 120).map((option) => {
              const isSelected = draftHeroArtworkId === option.id;
              return (
                <button
                  key={option.id}
                  onClick={() => {
                    setDraftHeroArtworkId(option.id);
                  }}
                  style={{
                    border: isSelected ? `1px solid ${lime}` : `1px solid ${divider}`,
                    borderRadius: 9,
                    padding: 0,
                    overflow: "hidden",
                    background: "transparent",
                    cursor: "pointer",
                    position: "relative",
                  }}
                  title={option.artist ? `${option.title} - ${option.artist}` : option.title}
                >
                  <div style={{ width: "100%", aspectRatio: "4 / 3", background: isLightTheme ? "#e8e8e8" : "#171717" }}>
                    <MyPageImage item={option.previewItem} width={220} disableBlur />
                  </div>
                  {isSelected && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        border: `2px solid ${lime}`,
                        borderRadius: 9,
                        pointerEvents: "none",
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div
            style={{
              position: "sticky",
              bottom: -10,
              marginTop: 10,
              paddingTop: 10,
              paddingBottom: 2,
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              background: panelBg,
            }}
          >
            <button
              onClick={() => {
                setDraftHeroArtworkId(selectedHeroArtworkId);
                setDraftHeroFocusY(heroFocusY);
                setIsHeroPickerOpen(false);
              }}
              style={{
                border: panelBorder,
                borderRadius: 999,
                background: "transparent",
                color: subText,
                height: 28,
                padding: "0 10px",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {t({ ko: "취소", en: "Cancel" })}
            </button>
            <button
              onClick={saveHeroBackgroundPreference}
              disabled={isSavingHeroPrefs}
              style={{
                border: "none",
                borderRadius: 999,
                background: lime,
                color: "#000",
                height: 28,
                padding: "0 12px",
                fontSize: 11,
                fontWeight: 800,
                cursor: isSavingHeroPrefs ? "default" : "pointer",
                opacity: isSavingHeroPrefs ? 0.7 : 1,
              }}
            >
              {isSavingHeroPrefs ? t({ ko: "저장 중...", en: "Saving..." }) : t({ ko: "저장", en: "Save" })}
            </button>
          </div>
        </div>
      )}

      <div style={{ padding: isMobile ? "0 10px" : "0 24px", marginTop: -34, position: "relative", zIndex: 3 }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <div
                style={{
                  width: isMobile ? 58 : 72,
                  height: isMobile ? 58 : 72,
                  borderRadius: "50%",
                  overflow: "hidden",
                  background: "transparent",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: `0 0 0 4px ${isLightTheme ? "#fafafa" : "#080808"}`,
                }}
              >
                <ProfileAvatar
                  src={displayPhotoURL || null}
                  crop={effectiveProfileCrop}
                  size={isMobile ? 58 : 72}
                  alt="Profile"
                  background={lime}
                  fallback={<span style={{ color: "#000", fontWeight: 700, fontSize: isMobile ? 15 : 18 }}>{displayName.slice(0, 2).toUpperCase()}</span>}
                />
              </div>
            </div>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: isMobile ? 18 : 26,
                  fontWeight: 700,
                  color: pageText,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                {displayName}
                <span
                  style={{
                    fontSize: isMobile ? 10 : 11,
                    fontWeight: 700,
                    borderRadius: 999,
                    background: "rgba(212,165,71,0.14)",
                    border: `1px solid ${isLightTheme ? "rgba(138,107,31,0.24)" : "rgba(212,165,71,0.24)"}`,
                    color: isLightTheme ? "#8A6B1F" : lime,
                    padding: "3px 7px",
                    letterSpacing: "0.04em",
                  }}
                >
                  {userRank.short} {userRank.name}
                </span>
              </div>

              <div
                style={{
                  marginTop: 3,
                  fontSize: isMobile ? 11 : 12,
                  color: subText,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 6,
                }}
              >
                <div
                  style={{
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: isMobile ? 180 : 260,
                  }}
                >
                  {user?.email}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>Score: {userScore}</span>
                  <button
                    onClick={() => navigate('/onboarding')}
                    style={{
                      border: panelBorder,
                      borderRadius: 999,
                      background: panelBg,
                      color: pageText,
                      height: 24,
                      padding: "0 9px",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.02em",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      backdropFilter: "blur(10px)",
                      WebkitBackdropFilter: "blur(10px)",
                    }}
                    title={t({ ko: "프로필 편집", en: "Edit profile" })}
                  >
                    <Pencil size={10} />
                    {t({ ko: "편집", en: "Edit" })}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: isMobile ? "flex-end" : "stretch",
              gap: 7,
              flexShrink: 0,
              width: isMobile ? "auto" : 240,
              maxWidth: "100%",
              marginTop: isMobile ? 14 : 6,
            }}
          >
            <button
              onClick={() => setShowSlideshow(true)}
              style={{
                border: "none",
                borderRadius: isMobile ? "50%" : 999,
                background: lime,
                color: "#000",
                height: isMobile ? 34 : 40,
                width: isMobile ? 34 : "auto",
                minWidth: isMobile ? 34 : 132,
                padding: isMobile ? 0 : "0 14px 0 12px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: isMobile ? 0 : 7,
              }}
                title={t({ ko: "슬라이드쇼 재생", en: "Play slideshow" })}
            >
              <Play size={isMobile ? 13 : 14} strokeWidth={2.4} />
              {!isMobile && (
                <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.03em" }}>
                  {t({ ko: "SLIDESHOW", en: "SLIDESHOW" })}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {!activePlaylist && (
        <div style={{ padding: isMobile ? "16px 10px 0" : "18px 24px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: pageText }}>
            <span style={{ fontSize: isMobile ? 16 : 20, fontWeight: 500, letterSpacing: "-0.03em" }}>My Playlists</span>
            <span style={{ fontSize: isMobile ? 12 : 14, color: subText }}>{playlists.length}</span>
          </div>

          {playlists.length > 0 ? (
            <div
              style={{
                display: "flex",
                gap: 12,
                overflowX: "auto",
                padding: "12px 0 10px",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  onClick={() => {
                    setViewMode("artworks");
                    setActivePlaylist(playlist);
                    setActivePlaylistItems(playlist.items || []);
                  }}
                  style={{
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    minWidth: 84,
                    textAlign: "left",
                    cursor: "pointer",
                    color: pageText,
                  }}
                >
                  <div
                    style={{
                      width: 84,
                      height: 84,
                      borderRadius: 12,
                      overflow: "hidden",
                      background: isLightTheme ? "#ececec" : "#191919",
                      border: `1px solid ${divider}`,
                    }}
                  >
                    {playlist.coverImage ? (
                      <MyPageImage item={{ image: playlist.coverImage }} width={isMobile ? 180 : 300} disableBlur />
                    ) : null}
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 11,
                      color: pageText,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {playlist.name}
                  </div>
                  <div style={{ marginTop: 1, fontSize: 10, color: subText }}>{playlist.items?.length || 0} items</div>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 10, fontSize: 12, color: subText }}>No playlists yet.</div>
          )}
        </div>
      )}

      <div style={{ marginTop: 0, borderTop: `1px solid ${divider}` }} />

      <div
        style={{
          position: "sticky",
          // Stick to the very top of the viewport so the bar's background
          // covers the status-bar / notch area too. The actual tab content
          // sits below the safe-area inset via padding-top — without this
          // the safe-area band is transparent and page content (artwork
          // thumbnails, hero image) bleeds through behind the status bar.
          top: 0,
          paddingTop: "env(safe-area-inset-top, 0px)",
          zIndex: 5,
          background: isLightTheme ? "rgba(250,250,250,0.95)" : "rgba(8,8,8,0.95)",
          backdropFilter: isMobile ? "none" : "blur(20px)",
          WebkitBackdropFilter: isMobile ? "none" : "blur(20px)",
          borderBottom: `1px solid ${divider}`,
        }}
      >
        <div style={{ display: "flex" }}>
          {tabs.map((tab) => {
            const active = viewMode === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setViewMode(tab.id);
                  setActivePlaylist(null);
                }}
                style={{
                  flex: 1,
                  appearance: "none",
                  WebkitAppearance: "none",
                  borderRadius: 0,
                  border: "none",
                  background: "none",
                  padding: isMobile ? "12px 3px 9px" : "8px 3px 9px",
                  cursor: "pointer",
                  borderBottom: `2px solid ${active ? lime : "transparent"}`,
                  color: active ? pageText : faintText,
                }}
              >
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{tab.count}</div>
                <div style={{ marginTop: 3, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <tab.icon size={10} strokeWidth={active ? 2.4 : 1.9} color={active ? (isLightTheme ? "#8A6B1F" : lime) : faintText} />
                  <span style={{ fontSize: 10, fontWeight: active ? 600 : 400 }}>{tab.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "8px 12px 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {activePlaylist ? (
          <button
            onClick={() => setActivePlaylist(null)}
            style={{ border: "none", background: "none", color: subText, cursor: "pointer", fontSize: 12, padding: 0 }}
          >
            ← {activePlaylist.name}
          </button>
        ) : (
          <span />
        )}

        <div style={{ display: "flex", gap: 6 }}>
          {(["recent", "oldest", "newest"] as const).map((mode) => {
            const active = sortMode === mode;
            return (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                style={{
                  border: "none",
                  borderRadius: 999,
                  padding: "5px 10px",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: active ? 600 : 400,
                  background: active ? (isLightTheme ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.13)") : "transparent",
                  color: active ? pageText : faintText,
                }}
              >
                {mode === "recent"
                  ? t({ ko: "최신", en: "Latest" })
                  : mode === "oldest"
                    ? t({ ko: "오래된 순", en: "Oldest" })
                    : t({ ko: "최신 연도", en: "Newest" })}
              </button>
            );
          })}
        </div>
      </div>

      {viewMode === "curations" ? (
        savedCurations.length === 0 ? (
          <div style={{ padding: "48px 20px 90px", textAlign: "center", color: subText }}>
            {t({ ko: "저장한 큐레이션이 없습니다.", en: "No curations saved yet." })}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "repeat(1, 1fr)" : "repeat(3, 1fr)",
              gap: 12,
              padding: "8px 12px 96px",
            }}
          >
            {savedCurations.map((c) => {
              const persona = CURATION_PERSONA_NAMES[c.persona_id];
              const personaName = persona
                ? (t({ ko: persona.ko, en: persona.en }))
                : c.persona_id;
              const title = t({ ko: c.title_ko || c.title_en, en: c.title_en || c.title_ko });
              const savedDate = c.saved_at
                ? c.saved_at.toLocaleDateString(t({ ko: "ko-KR", en: "en-US" }), { year: "numeric", month: "short", day: "numeric" })
                : "";
              const onOpen = () => {
                if (c.type === "special" && c.slug) {
                  navigate(`/ai?special=${encodeURIComponent(c.slug)}`);
                } else if (c.week) {
                  navigate(`/ai?weekly=${encodeURIComponent(c.week)}`);
                } else {
                  navigate(`/ai`);
                }
              };
              return (
                <div
                  key={c.curation_id}
                  onClick={onOpen}
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${divider}`,
                    background: isLightTheme ? "#fff" : "rgba(255,255,255,0.03)",
                    overflow: "hidden",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "4 / 3",
                      background: isLightTheme ? "#efefef" : "#1a1a1a",
                      overflow: "hidden",
                    }}
                  >
                    {c.hero_image_url ? (
                      <img
                        src={c.hero_image_url}
                        alt={title}
                        loading="lazy"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    ) : null}
                  </div>
                  <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                    <div
                      style={{
                        fontFamily: "'Space Mono', monospace",
                        fontSize: 10,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: faintText,
                      }}
                    >
                      {c.type === "special"
                        ? t({ ko: "스페셜", en: "Special" })
                        : t({ ko: "주간 큐레이션", en: "Weekly" })}
                      {" · "}
                      {personaName}
                    </div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: pageText,
                        lineHeight: 1.3,
                      }}
                    >
                      {title}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 2 }}>
                      {c.lens ? (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 999,
                            border: `1px solid ${divider}`,
                            fontFamily: "'Space Mono', monospace",
                            fontSize: 10,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: subText,
                          }}
                        >
                          {c.lens}
                        </span>
                      ) : null}
                      <span style={{ fontSize: 11, color: subText }}>
                        {c.works_count}{t({ ko: "점", en: " works" })}
                      </span>
                      {savedDate ? (
                        <span style={{ fontSize: 11, color: faintText, marginLeft: "auto" }}>
                          {savedDate}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : viewMode === "playlists" && !activePlaylist ? (
        <div style={{ padding: "8px 12px 96px", display: "flex", flexDirection: "column", gap: 10 }}>
          {playlists.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: subText }}>No playlists yet.</div>
          ) : (
            playlists.map((playlist) => (
              <div
                key={playlist.id}
                style={{
                  borderRadius: 12,
                  border: `1px solid ${divider}`,
                  background: isLightTheme ? "#fff" : "rgba(255,255,255,0.03)",
                  padding: 10,
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  cursor: "pointer",
                }}
                onClick={() => {
                  setViewMode("artworks");
                  setActivePlaylist(playlist);
                  setActivePlaylistItems(playlist.items || []);
                }}
              >
                <div
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 8,
                    overflow: "hidden",
                    flexShrink: 0,
                    background: isLightTheme ? "#efefef" : "#1a1a1a",
                  }}
                >
                  {playlist.coverImage ? (
                    <MyPageImage item={{ image: playlist.coverImage }} width={isMobile ? 160 : 220} disableBlur />
                  ) : null}
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: pageText,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {playlist.name}
                  </div>
                  <div style={{ marginTop: 2, fontSize: 11, color: subText }}>{playlist.items?.length || 0} items</div>
                </div>

                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowSlideshow(true);
                    setActivePlaylist(playlist);
                    setActivePlaylistItems(playlist.items || []);
                  }}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    border: "none",
                    background: lime,
                    color: "#000",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <Play size={13} strokeWidth={2.3} />
                </button>
              </div>
            ))
          )}
        </div>
      ) : sortedItems.length === 0 ? (
        <div style={{ padding: "48px 20px 90px", textAlign: "center", color: subText }}>
          No {activePlaylist ? "items in this playlist" : viewMode} saved yet.
        </div>
      ) : isArtworkLikeMode ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "repeat(3, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
            gap: 2,
            padding: "2px 2px 90px",
          }}
        >
          {sortedItems.slice(0, displayedCount).map((item, index) => renderArtworkCard(item, index))}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(4, 1fr)",
            gap: 8,
            padding: "2px 10px 96px",
          }}
        >
          {sortedItems.slice(0, displayedCount).map((item, index) => renderSimpleCard(item, index))}
        </div>
      )}

      {showSlideshow && (
        <Slideshow artworks={activePlaylist ? activePlaylistItems : likedArtworks} onClose={() => setShowSlideshow(false)} />
      )}

      {galleryArtwork && (
        <ArtworkLightbox
          artwork={galleryArtwork}
          onClose={() => setGalleryArtwork(null)}
          isLiked={(() => {
            const id = galleryArtwork.artworkId || galleryArtwork.id;
            const inList = likedArtworks.some((art) => (art.artworkId || art.id) === id);
            return inList && !unlikedItems.has(String(id));
          })()}
          onToggleLike={(_event, artwork) => {
            const id = String(artwork.artworkId || artwork.id);
            const inList = likedArtworks.some((art) => String(art.artworkId || art.id) === id);
            const isLiked = inList && !unlikedItems.has(id);
            if (isLiked) handleUnlike(id, "artwork");
            else handleRelike(artwork, "artwork");
          }}
          onViewInMuseum={handleViewInMuseum}
          onPurchase={(artwork) => setProductArtwork(artwork)}
          hideMuseumAction
          onOpenComments={SHOW_ARTWORK_COMMENTS ? ((artwork) => setCommentArtwork(artwork)) : undefined}
          onSaveToPlaylist={(artwork) => setPlaylistArtwork(artwork)}
          likedArtworksList={likedArtworks}
          onChangeArtwork={setGalleryArtwork}
        />
      )}

      {lightboxYoutubeId && (
        <div
          onClick={() => setLightboxYoutubeId(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.95)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            cursor: "pointer",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{ width: "90vw", maxWidth: 1200, aspectRatio: "16/9" }}
          >
            <iframe
              src={`https://www.youtube.com/embed/${lightboxYoutubeId}?autoplay=1&rel=0&modestbranding=1`}
              title="Video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ width: "100%", height: "100%", border: "none", borderRadius: 8 }}
            />
          </div>
        </div>
      )}

      {productArtwork && (
        <ProductModal
          artwork={{
            id: productArtwork.artworkId || productArtwork.id,
            name: productArtwork.title || productArtwork.name || "Untitled",
            artist: productArtwork.artist || "Unknown",
            image: productArtwork.image || productArtwork.i || "",
            year: productArtwork.year,
            roomId: "",
            exhibitionName: productArtwork.museumName || "",
            exhibitionTitle: "",
          }}
          onSelectArtwork={(nextArtwork) => setProductArtwork(nextArtwork)}
          onClose={() => setProductArtwork(null)}
        />
      )}

      {playlistArtwork && (
        <PlaylistModal
          isOpen={true}
          onClose={() => {
            setPlaylistArtwork(null);
            void fetchPlaylists();
          }}
          item={playlistArtwork}
          itemType={viewMode === "exhibitions" ? "exhibition" : viewMode === "museums" ? "museum" : viewMode === "artists" ? "artist" : "artwork"}
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
};

export default MyPage;
