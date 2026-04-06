import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Theme } from "./types";
import { getOptimizedImageUrl } from "../../utils/imageProxy";
import { SearchInputWithSuggestions } from "../SearchInputWithSuggestions";
import { HeartOverlay } from "../HeartOverlay";
import { ProductModal } from "../ProductModal";
import CommentModal from "../CommentModal";
import { PlaylistModal } from "../PlaylistModal";
import { ArtworkRecommendations } from "../ArtworkRecommendations";
import type { Artwork as ProductArtwork } from "../../types/Artwork";
import { collection, onSnapshot, doc, deleteDoc, setDoc, serverTimestamp, increment } from "firebase/firestore";
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { db, auth } from "../../firebase";

function typeColor(type: string, t: boolean): string {
  if (type === "current") return t ? "#5A7800" : "#BFFF0A";
  if (type === "upcoming") return t ? "rgba(90,120,0,0.5)" : "rgba(191,255,10,0.5)";
  return t ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.22)";
}

// ─── Column count hook ─────────────────────────────────────

function useColumnCount() {
  const [cols, setCols] = useState(3);
  useEffect(() => {
    const update = () => {
      if (window.innerWidth >= 1024) setCols(5);
      else if (window.innerWidth >= 768) setCols(4);
      else if (window.innerWidth >= 640) setCols(3);
      else setCols(3);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return cols;
}

type ArtworkCategory = string;

type Artwork = {
  title: string;
  artist: string;
  year: string;
  image: string;
  lowImage: string;
  category: string;
  dimensions: string;
  material: string;
  collection: string;
  inventoryNo: string;
  sourceUrl: string;
  semanticId?: string;
};

type SortMode = "default" | "random" | "year_asc" | "year_desc" | "like_desc";

const INITIAL_VISIBLE_ARTWORKS = 40;
const VISIBLE_ARTWORK_BATCH = 40;
const INTERACTIVE_MODAL_STATE_VERSION = 1;
const R2_IMAGE_HOST_HINTS = ["r2.dev", "pub-396fad1f96754c2f816f260faf970e63"];
const UNKNOWN_TEXTS = new Set(["", "unknown", "unknown artist", "n/a", "na", "none", "null", "undefined", "[]", "-"]);

type PersistedInteractiveModalState = {
  version: number;
  activeFilter: ArtworkCategory | null;
  sortBy: SortMode;
  searchQuery: string;
  visibleCount: number;
  activeArtworkId: string | null;
  detailArtworkOverride: Artwork | null;
  detailArtworkOrigin: Artwork | null;
  scrollTop: number;
};

function toPersistedArtwork(input: unknown): Artwork | null {
  if (!input || typeof input !== "object") return null;

  const source = input as Record<string, unknown>;
  const toText = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    return "";
  };

  const image = toText(source.image);
  const lowImage = toText(source.lowImage) || image;

  const normalized: Artwork = {
    title: toText(source.title),
    artist: toText(source.artist),
    year: toText(source.year),
    image,
    lowImage,
    category: toText(source.category),
    dimensions: toText(source.dimensions),
    material: toText(source.material),
    collection: toText(source.collection),
    inventoryNo: toText(source.inventoryNo),
    sourceUrl: toText(source.sourceUrl),
  };

  if (!normalized.title && !normalized.image && !normalized.inventoryNo) return null;
  return normalized;
}

const CATEGORY_ALIASES: Record<string, string> = {
  painting: "Painting",
  paintings: "Painting",
  malarstwo: "Painting",
  peintures: "Painting",
  pintura: "Painting",
  drawing: "Drawing",
  drawings: "Drawing",
  rysunek: "Drawing",
  print: "Print",
  prints: "Print",
  engraving: "Print",
  engravings: "Print",
  lithograph: "Print",
  lithographs: "Print",
  sculpture: "Sculpture",
  sculptures: "Sculpture",
  photography: "Photography",
  photograph: "Photography",
  photographs: "Photography",
  photo: "Photography",
  ceramic: "Ceramics",
  ceramics: "Ceramics",
  pottery: "Ceramics",
  textile: "Textile",
  textiles: "Textile",
  video: "Video",
  "video art": "Video",
  installation: "Installation",
  architecture: "Architecture",
  design: "Design",
};

const normalizeArtworkIdForFirestore = (id: string | number): string => String(id).replace(/\//g, "__");

const normalizeSearchText = (value?: string): string =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff\u0370-\u03ff\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g, " ")
    .trim();

const formatArtworkYear = (value?: string) => {
  if (!value) return "";
  const normalized = value
    .replace(/[a-zA-Z]+/g, " ")
    .replace(/[^0-9\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  const matches = normalized.match(/\d{1,4}/g);
  if (!matches) return "";
  let last = matches[matches.length - 1];
  if (last.length < 4 && matches.length > 1) {
    const donor = [...matches]
      .slice(0, -1)
      .reverse()
      .find((token) => token.length === 4) || matches[matches.length - 2];
    if (donor && donor.length >= last.length) {
      const prefix = donor.slice(0, donor.length - last.length);
      last = `${prefix}${last}`;
    }
  }
  const trimmed = last.replace(/^0+/, "");
  return trimmed || last;
};

function isMeaningfulText(value: string): boolean {
  return !UNKNOWN_TEXTS.has(value.trim().toLowerCase());
}

function collectStrings(input: unknown, depth = 0): string[] {
  if (depth > 2 || input === null || input === undefined) return [];

  if (typeof input === "string" || typeof input === "number") {
    const text = String(input).trim();
    return text ? [text] : [];
  }

  if (Array.isArray(input)) {
    return input.flatMap((entry) => collectStrings(entry, depth + 1));
  }

  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    const preferredKeys = ["name", "title", "label", "value", "text", "id", "type", "kind"];
    const preferredValues = preferredKeys
      .map((key) => obj[key])
      .filter((value) => value !== undefined && value !== null);
    const values = preferredValues.length > 0 ? preferredValues : Object.values(obj);
    return values.flatMap((entry) => collectStrings(entry, depth + 1));
  }

  return [];
}

function pickMeaningfulText(...candidates: unknown[]): string {
  const flattened = candidates.flatMap((candidate) => collectStrings(candidate));
  for (const value of flattened) {
    if (isMeaningfulText(value)) return value;
  }
  return "";
}

function normalizeCategoryLabel(raw: string): string {
  const normalized = raw.toLowerCase().trim();
  if (!normalized) return "Other";
  if (CATEGORY_ALIASES[normalized]) return CATEGORY_ALIASES[normalized];

  const keywordRules: Array<[RegExp, string]> = [
    [/paint|malar|huile|oil on canvas|gouache/, "Painting"],
    [/draw|rysun|pastel|graphite|charcoal|ink on paper/, "Drawing"],
    [/print|etch|engrav|litho|woodcut/, "Print"],
    [/photo|photograph|gelatin|silver print/, "Photography"],
    [/sculpt|bronze|marble|carving/, "Sculpture"],
    [/ceramic|porcelain|pottery|earthenware/, "Ceramics"],
    [/textile|fabric|tapestry|woven/, "Textile"],
    [/video|film|dvd|vhs|quicktime/, "Video"],
    [/install|mixed media/, "Installation"],
    [/architect|model/, "Architecture"],
    [/design|poster/, "Design"],
  ];

  for (const [pattern, label] of keywordRules) {
    if (pattern.test(normalized)) return label;
  }

  return raw;
}

function normalizeSourceUrl(url: unknown): string {
  const raw = pickMeaningfulText(url);
  if (!raw) return "";
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("http://")) return `https://${raw.slice("http://".length)}`;
  if (/^https:\/\//i.test(raw)) return raw;
  return "";
}

const FALLBACK_COLLECTION_BY_MUSEUM: Record<string, string[]> = {
  "hayward-gallery": ["hayward-gallery-collection.json"],
  "musee-du-louvre": ["louvre-painting-collection.json"],
  "musee-dorsay": ["orsay-collection.json"],
  "petit-palais": ["petit-palais-collection.json"],
  "bourse-de-commerce-pinault-collection": ["pinault-collection.json"],
  "musee-marmottan-monet": ["marmottan-collection.json"],
  "centre-pompidou": [
    "pompidou-painting-collection.json",
    "pompidou-drawing-collection.json",
    "pompidou-design-collection.json",
    "pompidou-newmedia-collection.json",
    "pompidou-cinema-collection.json",
  ],
};

function normalizeCollectionPath(inputPath: unknown): string {
  if (typeof inputPath !== "string") return "";
  const trimmed = inputPath.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("http://")) return `https://${trimmed.slice("http://".length)}`;
  if (trimmed.startsWith("/")) return trimmed;
  if (trimmed.startsWith("data/")) return `/${trimmed}`;
  return `/data/${trimmed.replace(/^\.?\//, "")}`;
}

function collectCollectionCandidates(exhibition: any): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const push = (value: unknown) => {
    const normalized = normalizeCollectionPath(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  const selectedExhibitionId = exhibition?._selectedExhibitionId;

  const allSubExhibitions = [
    ...((exhibition?.permanentExhibitions || []) as any[]),
    ...((exhibition?.temporaryExhibitions || []) as any[]),
    ...((exhibition?.pastExhibitions || []) as any[]),
  ];

  push(exhibition?.collectionFile);
  push(exhibition?.collection);

  if (selectedExhibitionId) {
    const selectedSub = allSubExhibitions.find((sub) => sub?.id === selectedExhibitionId);
    push(selectedSub?.collectionFile);
    push(selectedSub?.collection);
  } else {
    allSubExhibitions.forEach((sub) => {
      push(sub?.collectionFile);
      push(sub?.collection);
    });
  }

  const museumFallback = FALLBACK_COLLECTION_BY_MUSEUM[String(exhibition?.id || "")];
  if (museumFallback) museumFallback.forEach(push);

  return candidates;
}

function extractItemsFromPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const topLevelKeys = ["items", "data", "objects", "artworks", "results", "rows", "records", "collection", "list"];
  for (const key of topLevelKeys) {
    const candidate = (payload as any)[key];
    if (Array.isArray(candidate)) return candidate;
  }

  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      for (const nested of Object.values(value as Record<string, unknown>)) {
        if (Array.isArray(nested)) return nested;
      }
    }
  }

  return [];
}

function normalizeImageUrl(url: unknown): string {
  if (typeof url !== "string") return "";
  let normalized = url.trim();
  if (!normalized || normalized === "null" || normalized === "undefined") return "";
  if (normalized.startsWith("//")) normalized = `https:${normalized}`;
  if (normalized.startsWith("http://")) normalized = `https://${normalized.slice("http://".length)}`;
  if (normalized.startsWith("images/")) normalized = `/${normalized}`;
  return normalized;
}

function getCollectionSlugFromPath(inputPath: unknown): string {
  if (typeof inputPath !== "string") return "";
  const trimmed = inputPath.trim();
  if (!trimmed) return "";

  let pathname = trimmed;
  try {
    const parsed = new URL(trimmed);
    pathname = parsed.pathname || trimmed;
  } catch {
    pathname = trimmed;
  }

  const normalized = pathname.split("?")[0].split("#")[0].replace(/\\/g, "/");
  const lastSegment = normalized.split("/").filter(Boolean).pop() || "";
  return lastSegment.replace(/\.jsonl?$/i, "").trim();
}

export function InteractiveGlobeRealModal({
  exhibition,
  theme,
  onClose,
  onReady,
}: {
  exhibition: import('../../types/Exhibition').Exhibition;
  theme: Theme;
  onClose: () => void;
  onReady?: () => void;
}) {
  const t = theme === "light";
  const [activeArtwork, setActiveArtwork] = useState<number | null>(null);
  const [hoveredArtwork, setHoveredArtwork] = useState<number | null>(null);
  const [detailArtworkOverride, setDetailArtworkOverride] = useState<Artwork | null>(null);
  const [detailArtworkOrigin, setDetailArtworkOrigin] = useState<Artwork | null>(null);
  const [playlistArtwork, setPlaylistArtwork] = useState<any | null>(null);
  const [activeFilter, setActiveFilter] = useState<ArtworkCategory | null>(null);
  const [sortBy, setSortBy] = useState<SortMode>("default");
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [likedArtworks, setLikedArtworks] = useState<Set<string>>(new Set());
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [productArtwork, setProductArtwork] = useState<ProductArtwork | null>(null);
  const [commentArtworkId, setCommentArtworkId] = useState<string | null>(null);
  const colCount = useColumnCount();
  const [realArtworks, setRealArtworks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ARTWORKS);
  const [resolvedCollectionCandidate, setResolvedCollectionCandidate] = useState<string>("");
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const onReadyRef = useRef(onReady);
  const randomOrderRef = useRef<Map<string, number>>(new Map());
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const latestScrollTopRef = useRef(0);
  const pendingRestoreArtworkIdRef = useRef<string | null>(null);
  const pendingRestoreScrollTopRef = useRef<number | null>(null);
  const didApplyScrollRestoreRef = useRef(false);

  const modalStateStorageKey = useMemo(() => {
    const selectedId = String((exhibition as any)?._selectedExhibitionId || exhibition?.id || "unknown").trim();
    return `armin:interactive-modal-state:${selectedId || "unknown"}`;
  }, [exhibition]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onReadyRef.current?.();
  }, [exhibition]);

  useEffect(() => {
    randomOrderRef.current.clear();

    let restored: PersistedInteractiveModalState | null = null;
    try {
      const raw = sessionStorage.getItem(modalStateStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedInteractiveModalState>;
        if (parsed && typeof parsed === "object") {
          const parsedSortBy = typeof parsed.sortBy === "string" ? parsed.sortBy : "default";
          const safeSortBy: SortMode = ["default", "random", "year_asc", "year_desc", "like_desc"].includes(parsedSortBy)
            ? (parsedSortBy as SortMode)
            : "default";

          restored = {
            version: typeof parsed.version === "number" ? parsed.version : 0,
            activeFilter: typeof parsed.activeFilter === "string" && parsed.activeFilter.trim() ? parsed.activeFilter : null,
            sortBy: safeSortBy,
            searchQuery: typeof parsed.searchQuery === "string" ? parsed.searchQuery : "",
            visibleCount: typeof parsed.visibleCount === "number" && Number.isFinite(parsed.visibleCount)
              ? Math.max(1, Math.floor(parsed.visibleCount))
              : INITIAL_VISIBLE_ARTWORKS,
            activeArtworkId: typeof parsed.activeArtworkId === "string" && parsed.activeArtworkId.trim()
              ? parsed.activeArtworkId
              : null,
            detailArtworkOverride: toPersistedArtwork(parsed.detailArtworkOverride),
            detailArtworkOrigin: toPersistedArtwork(parsed.detailArtworkOrigin),
            scrollTop: typeof parsed.scrollTop === "number" && Number.isFinite(parsed.scrollTop)
              ? Math.max(0, parsed.scrollTop)
              : 0,
          };
        }
      }
    } catch {
      restored = null;
    }

    setActiveArtwork(null);
    setHoveredArtwork(null);
    setProductArtwork(null);
    setCommentArtworkId(null);
    setIsSortMenuOpen(false);

    if (restored && restored.version === INTERACTIVE_MODAL_STATE_VERSION) {
      setDetailArtworkOverride(restored.detailArtworkOverride);
      setDetailArtworkOrigin(restored.detailArtworkOrigin);
      setActiveFilter(restored.activeFilter);
      setSortBy(restored.sortBy);
      setSearchQuery(restored.searchQuery);
      setDebouncedQuery(restored.searchQuery);
      setVisibleCount(restored.visibleCount);

      pendingRestoreArtworkIdRef.current = restored.activeArtworkId;
      pendingRestoreScrollTopRef.current = restored.scrollTop;
      didApplyScrollRestoreRef.current = false;
      latestScrollTopRef.current = restored.scrollTop;
    } else {
      setDetailArtworkOverride(null);
      setDetailArtworkOrigin(null);
      setActiveFilter(null);
      setSortBy("default");
      setSearchQuery("");
      setDebouncedQuery("");
      setVisibleCount(INITIAL_VISIBLE_ARTWORKS);

      pendingRestoreArtworkIdRef.current = null;
      pendingRestoreScrollTopRef.current = null;
      didApplyScrollRestoreRef.current = true;
      latestScrollTopRef.current = 0;
    }
  }, [exhibition, modalStateStorageKey]);

  useEffect(() => {
    const onDocMouseDown = (event: MouseEvent) => {
      if (!sortMenuRef.current) return;
      if (!sortMenuRef.current.contains(event.target as Node)) {
        setIsSortMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) setLikedArtworks(new Set());
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const likesRef = collection(db, `users/${currentUser.uid}/liked_artworks`);
    const unsub = onSnapshot(likesRef, (snap) => {
      const next = new Set<string>();
      snap.forEach((docSnap) => {
        const data = docSnap.data() as any;
        const originalId = typeof data.artworkId === "string" && data.artworkId.trim().length > 0
          ? data.artworkId.trim()
          : docSnap.id;
        next.add(originalId);
      });
      setLikedArtworks(next);
    }, (error) => {
      console.warn("[InteractiveGlobeRealModal] Failed to subscribe likes:", error);
    });
    return () => unsub();
  }, [currentUser]);

  useEffect(() => {
    const candidates = collectCollectionCandidates(exhibition as any);
    if (!candidates.length) {
      setIsLoading(false);
      setRealArtworks([]);
      setResolvedCollectionCandidate("");
      return;
    }

    const abortController = new AbortController();
    setIsLoading(true);

    const loadArtworks = async () => {
      let firstKnownItems: any[] | null = null;
      let firstKnownCandidate = "";
      let resolvedItems: any[] = [];
      let resolvedCandidate = "";

      for (const candidate of candidates) {
        try {
          const response = await fetch(candidate, { cache: "no-cache", signal: abortController.signal });
          if (!response.ok) continue;

          const rawText = await response.text();
          let payload: any;
          try {
            payload = JSON.parse(rawText);
          } catch {
            if (!candidate.endsWith(".jsonl")) continue;
            payload = rawText
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => {
                try {
                  return JSON.parse(line);
                } catch {
                  return null;
                }
              })
              .filter(Boolean);
          }

          const items = extractItemsFromPayload(payload);
          if (firstKnownItems === null) {
            firstKnownItems = items;
            firstKnownCandidate = candidate;
          }
          if (items.length > 0) {
            resolvedItems = items;
            resolvedCandidate = candidate;
            break;
          }
        } catch {
          if (abortController.signal.aborted) return;
        }
      }

      if (!abortController.signal.aborted) {
        setRealArtworks(resolvedItems.length > 0 ? resolvedItems : (firstKnownItems || []));
        setResolvedCollectionCandidate(resolvedCandidate || firstKnownCandidate || "");
        setIsLoading(false);
      }
    };

    loadArtworks();

    return () => abortController.abort();
  }, [exhibition]);

  const venueName = exhibition.name || "Gallery";
  const selectedType = (exhibition as any)._selectedExhibitionType || exhibition.type;
  const mappedType = selectedType === "permanent" ? "permanent" : (exhibition as any).startDate ? "current" : "current";

  const collectionSlug = useMemo(() => {
    const selected = getCollectionSlugFromPath(resolvedCollectionCandidate);
    if (selected) return selected;
    const fromExhibition = getCollectionSlugFromPath((exhibition as any)?.collectionFile || (exhibition as any)?.collection);
    if (fromExhibition) return fromExhibition;
    const fallback = String(exhibition?.id || "").trim();
    return fallback ? `${fallback}-collection` : "collection";
  }, [resolvedCollectionCandidate, exhibition]);
  
  const mappedArtworks = useMemo(() => {
      const getImg = (url: string) => {
        const safeUrl = normalizeImageUrl(url);
        if (!safeUrl) return '';
        return getOptimizedImageUrl(safeUrl, 600, 75, 'webp') || safeUrl;
      };

      const normalizeImageCandidate = (candidate: unknown): string => {
        if (candidate && typeof candidate === "object") {
          const obj = candidate as Record<string, unknown>;
          return normalizeImageUrl(
            obj.imageUrl ?? obj.url ?? obj.src ?? obj.iiifThumbUrl ?? obj.iiifUrl ?? obj.iiifurl ?? obj.thumbnailUrl ?? obj.thumbnail ?? obj.lqip
          );
        }

        return normalizeImageUrl(candidate);
      };

      const isR2ImageUrl = (url: string): boolean => {
        return R2_IMAGE_HOST_HINTS.some((hint) => url.includes(hint));
      };

      const isLikelyLogoAsset = (url: string): boolean => {
        const lower = url.toLowerCase();
        return /\/logo([_-][a-z]{2})?\.svg$/i.test(lower) || lower.includes('/images/logo_');
      };

      const resolveImg = (a: any): string => {
        const imageCandidates: unknown[] = [
          a?.originalImage,
          a?.original_image,
          a?.i,
          a?.image,
          a?.imageUrl,
          a?.original_imageUrl,
          a?.thumbnailUrl,
          a?.thumb,
          a?.rawUrl,
          a?.downloadUrl,
          a?.generated_image_url,
          a?.primaryImage?.iiifThumbUrl,
          a?.thumbnail?.lqip,
          Array.isArray(a?.images) ? a.images[0] : '',
        ];

        if (Array.isArray(a?.images)) imageCandidates.push(...a.images);

        const normalizedCandidates = imageCandidates
          .map(normalizeImageCandidate)
          .filter(Boolean) as string[];

        const artworkCandidates = normalizedCandidates.filter((url) => !isLikelyLogoAsset(url));

        const r2Url = artworkCandidates.find(isR2ImageUrl);
        if (r2Url) return r2Url;

        return artworkCandidates[0] || normalizedCandidates[0] || '';
      };

      const resolveArtist = (a: any): string => {
        return pickMeaningfulText(
          a?.artist,
          a?.maker,
          a?.attribution,
          a?.creator,
          a?.author,
          a?.a,
          a?.authors,
          a?.autor,
          a?.raw?.authors,
          a?.raw?.artist,
          a?.raw?.author
        ) || "Unknown Artist";
      };

      const resolveCategory = (a: any): string => {
        const categoryRaw = pickMeaningfulText(
          a?.category,
          a?.artworkType,
          a?.classification,
          a?.type,
          a?.typeName,
          a?.objectType,
          a?.genre,
          a?.kind,
          a?.raw?.type,
          a?.raw?.classification,
          a?.raw?.types,
          a?.raw?.category,
          a?.raw?.kind
        );

        const mediumRaw = pickMeaningfulText(
          a?.medium,
          a?.materials,
          a?.material,
          a?.technique,
          a?.technika,
          a?.technikaMUSNET,
          a?.materialMUSNET,
          a?.raw?.medium,
          a?.raw?.materials
        );

        const merged = [categoryRaw, mediumRaw].filter(Boolean).join(" ").trim();
        if (!merged) return "Other";
        return normalizeCategoryLabel(merged);
      };

      const resolveMaterial = (a: any): string => {
        return pickMeaningfulText(
          a?.medium,
          a?.materials,
          a?.material,
          a?.technique,
          a?.technika,
          a?.technikaMUSNET,
          a?.materialMUSNET,
          a?.raw?.medium,
          a?.raw?.materials,
          a?.raw?.material
        );
      };

      const resolveDimensions = (a: any): string => {
        return pickMeaningfulText(
          a?.dimensions,
          a?.dimension,
          a?.size,
          a?.measurements,
          a?.extent,
          a?.raw?.dimensions,
          a?.raw?.size,
          a?.raw?.measurements
        );
      };

      const resolveSourceUrl = (a: any): string => {
        const candidates: unknown[] = [
          a?.url,
          a?.detailUrl,
          a?.detailURL,
          a?.objectUrl,
          a?.objectURL,
          a?.permalink,
          a?.sourceUrl,
          a?.u,
          a?.raw?.url,
          a?.raw?.link,
        ];

        for (const candidate of candidates) {
          if (candidate && typeof candidate === "object") {
            const obj = candidate as Record<string, unknown>;
            const nested = normalizeSourceUrl(
              obj.url ?? obj.href ?? obj.link ?? obj.permalink ?? obj.detailUrl ?? obj.objectUrl
            );
            if (nested) return nested;
            continue;
          }

          const normalized = normalizeSourceUrl(candidate);
          if (normalized) return normalized;
        }

        return "";
      };

      const resolveYear = (a: any): string => {
        return pickMeaningfulText(
          a?.year,
          a?.date,
          a?.displayDate,
          a?.creationDate,
          a?.createDate,
          a?.raw?.date,
          a?.raw?.year,
          a?.raw?.createDates
        );
      };

      const resolveTitle = (a: any): string => {
        return pickMeaningfulText(a?.title, a?.name, a?.tytul, a?.raw?.title) || "Untitled";
      };

      return realArtworks.map((a, i) => {
          const imgUrl = resolveImg(a);
          const semanticId = pickMeaningfulText(a?.semanticId, a?.semantic_id, a?.vectorId, a?.vector_id) || `${collectionSlug}-${i}`;
          return {
              title: resolveTitle(a),
              artist: resolveArtist(a),
              year: resolveYear(a),
              image: imgUrl,
              lowImage: getImg(imgUrl) || imgUrl,
              category: resolveCategory(a),
              dimensions: resolveDimensions(a),
              material: resolveMaterial(a),
              collection: venueName,
              inventoryNo: String(a.id || a.objectNumber || a.registrationNumber || a.inventoryNumber || a.accessionNum || `AW-${i}`),
              sourceUrl: resolveSourceUrl(a),
              semanticId,
          }
      }).filter(a => a.image).sort((a, b) => {
          const isTextOrLetter = (art: any) => {
              const name = String(art.title || '').toLowerCase();
              const cat = String(art.category || '').toLowerCase();
              const mat = String(art.material || '').toLowerCase();
              const inv = String(art.inventoryNo || '').toLowerCase();
              return /\bletter[s]?\b|\blettre[s]?\b|\bbrief[e]?\b|\bcorrespondence\b|\bmanuscript\b/.test(name)
                  || /\bletter[s]?\b|\blettre[s]?\b|\bbrief[e]?\b/.test(cat)
                  || /\bletter[s]?\b|\blettre[s]?\b|\bbrief[e]?\b/.test(mat)
                  || /^b\d+v\d{4}/.test(inv);
          };
          return (isTextOrLetter(a) ? 1 : 0) - (isTextOrLetter(b) ? 1 : 0);
      });
  }, [realArtworks, venueName, collectionSlug]);


  const bgColor = t ? "#FAFAFA" : "#080808";
  const bgSticky = t ? "rgba(250,250,250,0.97)" : "rgba(8,8,8,0.97)";
  const fgHigh = t ? "rgba(0,0,0,0.90)" : "rgba(255,255,255,0.92)";
  const fgMed = t ? "rgba(0,0,0,0.68)" : "rgba(255,255,255,0.72)";
  const fgLow = t ? "rgba(0,0,0,0.50)" : "rgba(255,255,255,0.55)";
  const fgMute = t ? "rgba(0,0,0,0.32)" : "rgba(255,255,255,0.38)";
  const fgFaint = t ? "rgba(0,0,0,0.16)" : "rgba(255,255,255,0.20)";
  const dividerColor = t ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.06)";
  const limeColor = t ? "#5A7800" : "#BFFF0A";
  const limeBg = t ? "rgba(90,120,0,0.08)" : "rgba(191,255,10,0.08)";
  const limeBorder = t ? "rgba(90,120,0,0.25)" : "rgba(191,255,10,0.2)";

  const artworkIdFrom = useCallback((artwork: Artwork): string => {
    return String(
      artwork.inventoryNo ||
      artwork.sourceUrl ||
      `${artwork.title}-${artwork.artist}-${artwork.year}`
    );
  }, []);

  const recommendationIdFrom = useCallback((artwork: Artwork): string => {
    return String(
      artwork.semanticId ||
      artwork.inventoryNo ||
      artwork.sourceUrl ||
      `${artwork.title}-${artwork.artist}-${artwork.year}`
    );
  }, []);

  const toProductArtwork = useCallback((artwork: Artwork): ProductArtwork => {
    const numericYear = Number(formatArtworkYear(artwork.year));
    return {
      id: recommendationIdFrom(artwork),
      name: artwork.title,
      artist: artwork.artist,
      year: Number.isFinite(numericYear) ? numericYear : 0,
      image: artwork.image,
      date: artwork.year,
      dimension: artwork.dimensions,
      sourceUrl: artwork.sourceUrl,
      roomId: (exhibition as any)?._selectedExhibitionId || String(exhibition.id || ""),
      exhibitionName: venueName,
      exhibitionTitle: exhibition.title || exhibition.name || "",
      medium: artwork.material,
      category: artwork.category,
      mediaType: "image",
      semanticId: artwork.semanticId,
    };
  }, [recommendationIdFrom, exhibition, venueName]);

  const toInteractiveArtworkFromProduct = useCallback((artwork: ProductArtwork): Artwork => {
    const normalizedImage = String(artwork.image || "");
    return {
      title: String((artwork as any).name || "Untitled"),
      artist: String(artwork.artist || "Unknown Artist"),
      year: String(artwork.date || artwork.year || ""),
      image: normalizedImage,
      lowImage: getOptimizedImageUrl(normalizedImage, 600, 75, "webp") || normalizedImage,
      category: String(artwork.category || ""),
      dimensions: String(artwork.dimension || ""),
      material: String(artwork.medium || artwork.materials || artwork.technique || ""),
      collection: String(artwork.exhibitionName || venueName),
      inventoryNo: String(artwork.id || `${artwork.name}-${artwork.artist}-${artwork.year}`),
      sourceUrl: String(artwork.sourceUrl || ""),
      semanticId: String((artwork as any).semanticId || artwork.id || ""),
    };
  }, [venueName]);

  const openPlaylistForArtwork = useCallback((artwork: Artwork) => {
    const normalized = toProductArtwork(artwork);
    setPlaylistArtwork({
      ...normalized,
      artworkId: normalized.id,
      title: normalized.name,
      museumName: normalized.exhibitionName || venueName,
      imageUrl: normalized.image,
    });
  }, [toProductArtwork, venueName]);

  const recommendedTerms = useMemo(() => {
    const artistCounts = new Map<string, number>();
    mappedArtworks.forEach((art) => {
      const artist = String(art.artist || "").trim();
      if (!artist || artist.toLowerCase() === "unknown artist") return;
      artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
    });
    return Array.from(artistCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([artist]) => artist);
  }, [mappedArtworks]);

  const toggleLike = useCallback(async (e: React.MouseEvent, artwork: Artwork) => {
    e.stopPropagation();
    e.preventDefault();

    let userToUse = currentUser;

    if (!currentUser || currentUser.isAnonymous) {
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        const result = await signInWithPopup(auth, provider);
        userToUse = result.user;
      } catch (err) {
        console.error("[InteractiveGlobeRealModal] Login failed:", err);
        return;
      }
    }

    if (!userToUse) return;

    const artworkId = artworkIdFrom(artwork);
    const statsDocId = normalizeArtworkIdForFirestore(artworkId);
    const isLiked = likedArtworks.has(statsDocId) || likedArtworks.has(artworkId);

    const likeRef = doc(db, `users/${userToUse.uid}/liked_artworks/${statsDocId}`);
    const statsRef = doc(db, "artwork_stats", statsDocId);

    try {
      if (isLiked) {
        setLikedArtworks((prev) => {
          const next = new Set(prev);
          next.delete(artworkId);
          next.delete(statsDocId);
          return next;
        });
        await deleteDoc(likeRef);
        await setDoc(statsRef, { likeCount: increment(-1), artworkId }, { merge: true });
      } else {
        setLikedArtworks((prev) => {
          const next = new Set(prev);
          next.add(artworkId);
          return next;
        });
        await setDoc(likeRef, {
          likedAt: serverTimestamp(),
          artworkId,
          title: artwork.title,
          artist: artwork.artist,
          year: formatArtworkYear(artwork.year) || artwork.year || "",
          image: artwork.image,
          mediaType: "image",
          museum: venueName,
          exhibitionId: exhibition.id || "",
          exhibitionName: exhibition.name || exhibition.title || "",
        });
        await setDoc(statsRef, { likeCount: increment(1), artworkId }, { merge: true });
      }
    } catch (error) {
      console.error("[InteractiveGlobeRealModal] Failed to toggle like:", error);
    }
  }, [artworkIdFrom, currentUser, exhibition, likedArtworks, venueName]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    mappedArtworks.forEach((artwork) => {
      const category = String(artwork.category || "").trim();
      if (!category || category === "undefined" || category === "Other") return;
      counts.set(category, (counts.get(category) || 0) + 1);
    });
    return counts;
  }, [mappedArtworks]);

  const availableCategories = useMemo(() => {
    return Array.from(categoryCounts.keys()).slice(0, 8);
  }, [categoryCounts]);

  const getSortStableId = useCallback((artwork: Artwork): string => {
    return String(artwork.inventoryNo || `${artwork.title}-${artwork.artist}-${artwork.year}`);
  }, []);

  const toSortableYear = useCallback((artwork: Artwork): number => {
    const numeric = Number(formatArtworkYear(artwork.year));
    return Number.isFinite(numeric) ? numeric : NaN;
  }, []);

  const handleSortChange = useCallback((mode: SortMode) => {
    setSortBy(mode);
    setActiveArtwork(null);
    setHoveredArtwork(null);
    setIsSortMenuOpen(false);
  }, []);

  const sortOptions: { value: SortMode; label: string }[] = useMemo(() => ([
    { value: "default", label: "Default" },
    { value: "random", label: "Random" },
    { value: "year_asc", label: "Year: Oldest" },
    { value: "year_desc", label: "Year: Newest" },
    { value: "like_desc", label: "Most Liked" },
  ]), []);

  const selectedSortLabel = useMemo(() => {
    return sortOptions.find((option) => option.value === sortBy)?.label || "Default";
  }, [sortBy, sortOptions]);

  const filterResultArtworks = useMemo(() => {
    let filtered = !activeFilter
      ? mappedArtworks
      : mappedArtworks.filter((artwork) => artwork.category === activeFilter);

    const normalizedQuery = normalizeSearchText(debouncedQuery);
    if (normalizedQuery) {
      filtered = filtered.filter((artwork) => {
        const haystack = normalizeSearchText([
          artwork.title,
          artwork.artist,
          artwork.year,
          artwork.category,
          artwork.material,
          artwork.dimensions,
          artwork.inventoryNo,
        ].join(" "));
        return haystack.includes(normalizedQuery);
      });
    }

    const list = [...filtered];
    if (sortBy === "default") return list;

    if (sortBy === "random") {
      return list.sort((a, b) => {
        const idA = getSortStableId(a);
        const idB = getSortStableId(b);
        if (!randomOrderRef.current.has(idA)) randomOrderRef.current.set(idA, Math.random());
        if (!randomOrderRef.current.has(idB)) randomOrderRef.current.set(idB, Math.random());
        return (randomOrderRef.current.get(idA) || 0) - (randomOrderRef.current.get(idB) || 0);
      });
    }

    if (sortBy === "year_asc") {
      return list.sort((a, b) => {
        const yearA = toSortableYear(a);
        const yearB = toSortableYear(b);
        const safeA = Number.isNaN(yearA) ? Number.POSITIVE_INFINITY : yearA;
        const safeB = Number.isNaN(yearB) ? Number.POSITIVE_INFINITY : yearB;
        if (safeA !== safeB) return safeA - safeB;
        return a.title.localeCompare(b.title);
      });
    }

    if (sortBy === "year_desc") {
      return list.sort((a, b) => {
        const yearA = toSortableYear(a);
        const yearB = toSortableYear(b);
        const safeA = Number.isNaN(yearA) ? Number.NEGATIVE_INFINITY : yearA;
        const safeB = Number.isNaN(yearB) ? Number.NEGATIVE_INFINITY : yearB;
        if (safeA !== safeB) return safeB - safeA;
        return a.title.localeCompare(b.title);
      });
    }

    if (sortBy === "like_desc") {
      return list.sort((a, b) => {
        const idA = getSortStableId(a);
        const idB = getSortStableId(b);
        const likedA = likedArtworks.has(idA) || likedArtworks.has(normalizeArtworkIdForFirestore(idA));
        const likedB = likedArtworks.has(idB) || likedArtworks.has(normalizeArtworkIdForFirestore(idB));
        if (likedA && !likedB) return -1;
        if (!likedA && likedB) return 1;
        return a.title.localeCompare(b.title);
      });
    }

    return list;
  }, [mappedArtworks, activeFilter, debouncedQuery, sortBy, likedArtworks, getSortStableId, toSortableYear]);

  const activeArtworkStableId = useMemo(() => {
    if (activeArtwork === null) return null;
    const selected = filterResultArtworks[activeArtwork];
    return selected ? artworkIdFrom(selected) : null;
  }, [activeArtwork, filterResultArtworks, artworkIdFrom]);

  useEffect(() => {
    const pendingId = pendingRestoreArtworkIdRef.current;
    if (!pendingId) return;

    const nextIndex = filterResultArtworks.findIndex((artwork) => artworkIdFrom(artwork) === pendingId);
    setActiveArtwork(nextIndex >= 0 ? nextIndex : null);
    pendingRestoreArtworkIdRef.current = null;
  }, [filterResultArtworks, artworkIdFrom]);

  useEffect(() => {
    setVisibleCount((prev) => {
      if (filterResultArtworks.length <= 0) return 0;
      const minVisible = Math.min(INITIAL_VISIBLE_ARTWORKS, filterResultArtworks.length);
      if (prev <= 0) return minVisible;
      const clamped = Math.min(prev, filterResultArtworks.length);
      return Math.max(clamped, minVisible);
    });
  }, [filterResultArtworks.length]);

  useEffect(() => {
    if (didApplyScrollRestoreRef.current) return;
    const nextScrollTop = pendingRestoreScrollTopRef.current;
    if (nextScrollTop === null) return;
    if (!scrollContainerRef.current) return;
    if (isLoading) return;

    const raf = requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const appliedTop = Math.max(0, Math.min(nextScrollTop, maxTop));
      container.scrollTop = appliedTop;
      latestScrollTopRef.current = appliedTop;
      pendingRestoreScrollTopRef.current = null;
      didApplyScrollRestoreRef.current = true;
    });

    return () => cancelAnimationFrame(raf);
  }, [filterResultArtworks.length, visibleCount, isLoading]);

  useEffect(() => {
    return () => {
      try {
        const payload: PersistedInteractiveModalState = {
          version: INTERACTIVE_MODAL_STATE_VERSION,
          activeFilter: activeFilter || null,
          sortBy,
          searchQuery,
          visibleCount,
          activeArtworkId: activeArtworkStableId,
          detailArtworkOverride: detailArtworkOverride || null,
          detailArtworkOrigin: detailArtworkOrigin || null,
          scrollTop: latestScrollTopRef.current,
        };
        sessionStorage.setItem(modalStateStorageKey, JSON.stringify(payload));
      } catch {
        // ignore storage failures
      }
    };
  }, [
    modalStateStorageKey,
    activeFilter,
    sortBy,
    searchQuery,
    visibleCount,
    activeArtworkStableId,
    detailArtworkOverride,
    detailArtworkOrigin,
  ]);

  const hasMoreArtworks = visibleCount < filterResultArtworks.length;

  const loadMoreArtworks = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + VISIBLE_ARTWORK_BATCH, filterResultArtworks.length));
  }, [filterResultArtworks.length]);

  useEffect(() => {
    if (!hasMoreArtworks || !loadMoreRef.current) return;
    const element = loadMoreRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreArtworks();
      },
      { rootMargin: "500px 0px" }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMoreArtworks, loadMoreArtworks, visibleCount]);

  const displayedArtworks = useMemo(() => {
    return filterResultArtworks.slice(0, visibleCount);
  }, [filterResultArtworks, visibleCount]);

  useEffect(() => {
    if (activeArtwork !== null && activeArtwork >= displayedArtworks.length) setActiveArtwork(null);
    if (hoveredArtwork !== null && hoveredArtwork >= displayedArtworks.length) setHoveredArtwork(null);
  }, [displayedArtworks.length, activeArtwork, hoveredArtwork]);

  useEffect(() => {
    if (activeArtwork === null) {
      setDetailArtworkOverride(null);
      setDetailArtworkOrigin(null);
    }
  }, [activeArtwork]);

  const baseSelectedArtworkDetail = useMemo(() => {
    if (activeArtwork === null) return null;
    return filterResultArtworks[activeArtwork] || null;
  }, [activeArtwork, filterResultArtworks]);

  const selectedArtworkDetail = useMemo(() => {
    return detailArtworkOverride || baseSelectedArtworkDetail;
  }, [detailArtworkOverride, baseSelectedArtworkDetail]);

  const inspectedArt = hoveredArtwork !== null
    ? (displayedArtworks[hoveredArtwork] || null)
    : selectedArtworkDetail;

  const selectedRecommendationArtwork = useMemo(() => {
    if (!selectedArtworkDetail) return null;
    return toProductArtwork(selectedArtworkDetail);
  }, [selectedArtworkDetail, toProductArtwork]);

  const selectedRecommendationRelatedArtworks = useMemo(() => {
    if (!selectedArtworkDetail) return [] as ProductArtwork[];
    const selectedId = artworkIdFrom(selectedArtworkDetail);
    return mappedArtworks
      .filter((candidate) => {
        const candidateId = artworkIdFrom(candidate);
        if (candidateId === selectedId) return false;
        return candidate.artist === selectedArtworkDetail.artist;
      })
      .slice(0, 12)
      .map(toProductArtwork);
  }, [artworkIdFrom, mappedArtworks, selectedArtworkDetail, toProductArtwork]);

  const handleRecommendationSelect = useCallback((selected: ProductArtwork) => {
    const selectedId = String(selected.id || "").trim();
    const selectedTitle = normalizeSearchText(String((selected as any).name || ""));
    const selectedArtist = normalizeSearchText(String(selected.artist || ""));

    const localIndex = filterResultArtworks.findIndex((art) => {
      const localId = artworkIdFrom(art);
      const localRecommendationId = recommendationIdFrom(art);
      if (selectedId && (localId === selectedId || localRecommendationId === selectedId)) return true;
      return selectedTitle !== "" && selectedArtist !== ""
        && normalizeSearchText(art.title) === selectedTitle
        && normalizeSearchText(art.artist) === selectedArtist;
    });

    const nextArtwork = localIndex >= 0
      ? filterResultArtworks[localIndex]
      : toInteractiveArtworkFromProduct(selected);

    setDetailArtworkOrigin((prev) => prev || baseSelectedArtworkDetail || null);
    setDetailArtworkOverride(nextArtwork);
    setHoveredArtwork(null);

    if (activeArtwork === null && localIndex >= 0) {
      setActiveArtwork(localIndex);
    }
  }, [activeArtwork, artworkIdFrom, recommendationIdFrom, baseSelectedArtworkDetail, filterResultArtworks, toInteractiveArtworkFromProduct]);

  const resetRecommendationDrilldown = useCallback(() => {
    setDetailArtworkOverride(null);
    setDetailArtworkOrigin(null);
  }, []);

  // Group artworks into rows for inline expansion
  const artworkRows = useMemo(() => {
    const rows: { aw: Artwork; globalIdx: number }[][] = [];
    for (let i = 0; i < displayedArtworks.length; i += colCount) {
      rows.push(
        displayedArtworks.slice(i, i + colCount).map((aw, j) => ({ aw, globalIdx: i + j }))
      );
    }
    return rows;
  }, [displayedArtworks, colCount]);

  const selectedRow = activeArtwork !== null ? Math.floor(activeArtwork / colCount) : -1;
  const handleArtworkMouseEnter = useCallback((index: number) => {
    setHoveredArtwork((prev) => (prev === index ? prev : index));
  }, []);

  const handleArtworkMouseLeave = useCallback(() => {
    setHoveredArtwork((prev) => (prev === null ? prev : null));
  }, []);

  const handleSearchChange = useCallback((val: string) => {
    setSearchQuery(val);
    setActiveArtwork(null);
    setHoveredArtwork(null);
    setDetailArtworkOverride(null);
    setDetailArtworkOrigin(null);
  }, []);

  const pad = '40px';

  const heroImage = useMemo(() => {
    if (mappedArtworks.length > 0) return mappedArtworks[0].lowImage || mappedArtworks[0].image;
    return normalizeImageUrl(exhibition.representativeImage || '');
  }, [mappedArtworks]);

  const relatedProductArtworks = useMemo(() => {
    if (!productArtwork) return [];
    return mappedArtworks
      .filter((a) => a.artist === productArtwork.artist && artworkIdFrom(a) !== productArtwork.id)
      .slice(0, 10)
      .map(toProductArtwork);
  }, [artworkIdFrom, mappedArtworks, productArtwork, toProductArtwork]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100, overflow: 'hidden',
        fontFamily: "'Space Grotesk', sans-serif", backgroundColor: bgColor,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.35, ease: "easeOut", delay: 0.05 }}
        ref={scrollContainerRef}
        onScroll={(event) => {
          latestScrollTopRef.current = event.currentTarget.scrollTop;
        }}
        style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden' }}
      >
        {/* ── Hero ── */}
        <div style={{ position: 'relative', width: '100%', height: '52vh', minHeight: '340px' }}>
          <motion.img
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            src={heroImage}
            alt={exhibition.title || exhibition.name}
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: 'cover', 
              display: 'block',
              WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 40%, rgba(0,0,0,0.8) 68%, rgba(0,0,0,0.38) 88%, rgba(0,0,0,0) 100%)',
              maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 40%, rgba(0,0,0,0.8) 68%, rgba(0,0,0,0.38) 88%, rgba(0,0,0,0) 100%)'
            }}
          />
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to bottom, ${bgColor}00 0%, ${bgColor}00 68%, ${bgColor}33 88%, ${bgColor}66 100%)` }} />
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to bottom, ${bgColor}1A 0%, ${bgColor}00 28%)` }} />
          {/* Nav bar */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `24px ${pad}` }}>
            <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '10px', background: 'none', borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none', outline: 'none' }}>
              <span style={{ color: fgLow }}>&larr;</span>
              <span style={{ color: fgLow, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Back</span>
            </button>
            <span style={{ padding: '4px 10px', fontSize: '8px', letterSpacing: '0.15em', textTransform: 'uppercase', backgroundColor: t ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.55)", color: typeColor(mappedType, t), backdropFilter: 'blur(8px)' }}>{mappedType}</span>
          </div>
          {/* Title overlay */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: `0 ${pad} 8px` }}>
            <h1 style={{ fontSize: 'clamp(24px, 4vw, 40px)', color: fgHigh, lineHeight: 1.15, letterSpacing: '0.02em', margin: 0, maxWidth: '720px' }}>
              {exhibition.title || exhibition.name}
            </h1>
          </div>
        </div>

        {/* ── Info ── */}
        <div style={{ padding: `24px ${pad} 0`, maxWidth: '900px' }}>
          {isLoading && mappedArtworks.length === 0 && (
            <div
              style={{
                marginBottom: '16px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                fontSize: '10px',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: fgLow,
                background: t ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.07)',
                borderTop: `1px solid ${dividerColor}`,
                borderRight: `1px solid ${dividerColor}`,
                borderBottom: `1px solid ${dividerColor}`,
                borderLeft: `1px solid ${dividerColor}`,
              }}
            >
              <span>Loading Collection</span>
              <span style={{ fontFamily: "'Space Mono', monospace" }}>...</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: fgLow }}>{venueName}</span>
            <span style={{ fontSize: '11px', color: fgFaint }}>&middot;</span>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '11px', color: fgLow }}>
              {mappedArtworks.length.toLocaleString()} works
            </span>
            {exhibition.curator && (
              <><span style={{ fontSize: '11px', color: fgFaint }}>&middot;</span>
              <span style={{ fontSize: '11px', color: fgMute }}>Curated by {exhibition.curator}</span></>
            )}
          </div>
          <div style={{ marginTop: '20px', height: '1px', backgroundColor: dividerColor }} />
          <div style={{ marginTop: '24px', maxWidth: '600px' }}>
            <p style={{ fontSize: '14px', lineHeight: 1.85, color: fgMed, margin: 0 }}>
              {exhibition.description || exhibition.name + " Exhibition details"}
            </p>
          </div>
        </div>

        {/* ── Works section header + filters ── */}
        <div style={{ padding: `56px ${pad} 0` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
            <div style={{ width: '24px', height: '1px', backgroundColor: dividerColor }} />
            <span style={{ fontSize: '9px', color: fgMute, letterSpacing: '0.25em', textTransform: 'uppercase' }}>Featured Works</span>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '9px', color: fgFaint }}>
              {filterResultArtworks.length}{activeFilter ? ` / ${mappedArtworks.length}` : ""}
            </span>
            <div style={{ flex: 1, height: '1px', backgroundColor: dividerColor }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  setActiveFilter(null);
                  setActiveArtwork(null);
                  setHoveredArtwork(null);
                  setDetailArtworkOverride(null);
                  setDetailArtworkOrigin(null);
                }}
                style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: !activeFilter ? limeColor : fgMute, backgroundColor: !activeFilter ? limeBg : 'transparent', borderTop: `1px solid ${!activeFilter ? limeBorder : (t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)")}`, borderRight: `1px solid ${!activeFilter ? limeBorder : (t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)")}`, borderBottom: `1px solid ${!activeFilter ? limeBorder : (t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)")}`, borderLeft: `1px solid ${!activeFilter ? limeBorder : (t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)")}`, outline: 'none' }}
              >All</button>
              {availableCategories.map((cat) => {
                const count = mappedArtworks.filter((a) => a.category === cat).length;
                const isActive = activeFilter === cat;
                const bColor = isActive ? limeBorder : (t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)");
                return (
                  <button key={cat}
                    onClick={() => {
                      setActiveFilter(isActive ? null : cat);
                      setActiveArtwork(null);
                      setHoveredArtwork(null);
                      setDetailArtworkOverride(null);
                      setDetailArtworkOrigin(null);
                    }}
                    style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px', color: isActive ? limeColor : fgMute, backgroundColor: isActive ? limeBg : 'transparent', borderTop: `1px solid ${bColor}`, borderRight: `1px solid ${bColor}`, borderBottom: `1px solid ${bColor}`, borderLeft: `1px solid ${bColor}`, outline: 'none' }}
                  >
                    {cat}<span style={{ fontFamily: "'Space Mono', monospace", fontSize: '8px', opacity: 0.6 }}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Sticky metadata panel ── */}
        <div style={{ padding: `0 ${pad} 0`, position: 'sticky', top: 0, zIndex: 20, backgroundColor: bgSticky, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: `1px solid ${inspectedArt ? limeBorder : dividerColor}`, transition: 'border-color 0.2s' }}>
          <div style={{ padding: '12px 20px', borderLeft: `2px solid ${inspectedArt ? limeColor : 'transparent'}`, minHeight: '92px', transition: 'border-color 0.2s' }}>
            <AnimatePresence mode="wait">
              {inspectedArt ? (
                <motion.div key={inspectedArt.title + inspectedArt.inventoryNo} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '24px', rowGap: '8px' }}>
                    {[
                      { label: "Title", value: inspectedArt.title },
                      { label: "Artist", value: inspectedArt.artist },
                      { label: "Year", value: formatArtworkYear(inspectedArt.year) || inspectedArt.year },
                      { label: "Category", value: inspectedArt.category },
                      { label: "Medium", value: inspectedArt.material },
                      { label: "Dimensions", value: inspectedArt.dimensions },
                    ].map((m) => (
                      <div key={m.label}>
                        <div style={{ fontSize: '7px', color: fgMute, letterSpacing: '0.15em', textTransform: 'uppercase' }}>{m.label}</div>
                        <div style={{ fontSize: '11px', color: fgLow, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.value || '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} style={{ display: 'flex', alignItems: 'center', minHeight: '56px' }}>
                  <span style={{ fontSize: '10px', color: fgFaint, letterSpacing: '0.12em' }}>
                    {isLoading ? "Loading artworks..." : "Hover over a work to see details"}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginTop: '14px', paddingTop: '12px', borderTop: `1px solid ${dividerColor}`, flexWrap: 'nowrap' }}>
              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <SearchInputWithSuggestions
                  value={searchQuery}
                  onChange={handleSearchChange}
                  suggestions={recommendedTerms}
                  inputId="interactive-sticky-search"
                  inputName="interactiveStickySearch"
                  placeholder="Search in this collection · Artist, title, year"
                  recommendedLabel="Recommended"
                  style={{ width: '100%' }}
                  inputStyle={{
                    fontSize: 12,
                    color: fgHigh,
                    borderTop: `1px solid ${dividerColor}`,
                    borderRight: `1px solid ${dividerColor}`,
                    borderBottom: `1px solid ${dividerColor}`,
                    borderLeft: `1px solid ${dividerColor}`,
                    outline: 'none',
                    background: t ? 'rgba(0,0,0,0.015)' : 'rgba(255,255,255,0.02)',
                    padding: '9px 28px 9px 10px',
                    lineHeight: 1.2,
                  }}
                  clearButtonStyle={{ right: 6, color: fgMute }}
                  dropdownStyle={{
                    background: t ? 'rgba(250,250,250,0.95)' : 'rgba(12,12,12,0.92)',
                    borderTop: `1px solid ${dividerColor}`,
                    borderRight: `1px solid ${dividerColor}`,
                    borderBottom: `1px solid ${dividerColor}`,
                    borderLeft: `1px solid ${dividerColor}`,
                    borderRadius: 0,
                    boxShadow: t ? '0 8px 20px rgba(0,0,0,0.06)' : '0 12px 24px rgba(0,0,0,0.36)',
                  }}
                  dropdownHeaderStyle={{
                    color: fgMute,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    borderBottom: `1px solid ${dividerColor}`,
                    background: t ? 'rgba(0,0,0,0.015)' : 'rgba(255,255,255,0.02)',
                  }}
                  dropdownItemStyle={{
                    color: fgMed,
                    borderBottom: `1px solid ${dividerColor}`,
                    background: 'transparent',
                  }}
                  dropdownItemHoverStyle={{
                    background: t ? 'rgba(90,120,0,0.07)' : 'rgba(191,255,10,0.09)',
                    color: fgHigh,
                  }}
                  dropdownScrollbarTrackColor={t ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'}
                  dropdownScrollbarThumbColor={t ? 'rgba(90,120,0,0.35)' : 'rgba(191,255,10,0.40)'}
                  dropdownScrollbarThumbHoverColor={t ? 'rgba(90,120,0,0.52)' : 'rgba(191,255,10,0.62)'}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '0 0 auto', minWidth: 0 }}>
                <span style={{ fontSize: '9px', letterSpacing: '0.14em', color: fgMute, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Sort by</span>
                <div ref={sortMenuRef} style={{ position: 'relative', width: 'clamp(124px, 28vw, 198px)' }}>
                  <button
                    type="button"
                    onClick={() => setIsSortMenuOpen((prev) => !prev)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      background: t ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
                      borderTop: `1px solid ${dividerColor}`,
                      borderRight: `1px solid ${dividerColor}`,
                      borderBottom: `1px solid ${dividerColor}`,
                      borderLeft: `1px solid ${dividerColor}`,
                      borderRadius: 0,
                      padding: '8px 12px',
                      fontSize: 11,
                      letterSpacing: '0.01em',
                      color: fgMed,
                      lineHeight: 1.2,
                      cursor: 'pointer',
                    }}
                  >
                    <span>{selectedSortLabel}</span>
                    <span style={{ color: fgMute, transform: isSortMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.18s ease' }}>▾</span>
                  </button>

                  {isSortMenuOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: 0,
                        width: '100%',
                        background: t ? 'rgba(245,245,245,0.98)' : 'rgba(12,12,12,0.98)',
                        borderTop: `1px solid ${dividerColor}`,
                        borderRight: `1px solid ${dividerColor}`,
                        borderBottom: `1px solid ${dividerColor}`,
                        borderLeft: `1px solid ${dividerColor}`,
                        boxShadow: t ? '0 10px 26px rgba(0,0,0,0.10)' : '0 12px 28px rgba(0,0,0,0.45)',
                        zIndex: 30,
                        overflow: 'hidden',
                      }}
                    >
                      {sortOptions.map((option, optionIndex) => {
                        const isActive = option.value === sortBy;
                        return (
                          <button
                            type="button"
                            key={option.value}
                            onClick={() => handleSortChange(option.value)}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              fontSize: 11,
                              letterSpacing: '0.01em',
                              color: isActive ? (t ? '#2D3B00' : '#D7FF5A') : fgMed,
                              background: isActive
                                ? (t ? 'rgba(90,120,0,0.14)' : 'rgba(191,255,10,0.12)')
                                : 'transparent',
                              borderTop: 'none',
                              borderRight: 'none',
                              borderBottom: optionIndex < sortOptions.length - 1 ? `1px solid ${dividerColor}` : 'none',
                              borderLeft: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            <span>{option.label}</span>
                            {isActive && <span style={{ fontSize: 10 }}>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Row-based artwork grid ── */}
        <div style={{ padding: `24px ${pad} 16px` }}>
          {artworkRows.map((row, rowIdx) => (
            <React.Fragment key={`row-${rowIdx}`}>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`, 
                columnGap: '8px', 
                rowGap: '12px', 
                marginBottom: colCount >= 4 ? '80px' : '24px', 
                alignItems: 'start' 
              }}>
                {row.map(({ aw, globalIdx }) => {
                  const isSelected = activeArtwork === globalIdx;
                  const isHovered = hoveredArtwork === globalIdx;
                  return (
                    <div
                      role="button"
                      tabIndex={0}
                      key={aw.inventoryNo + globalIdx}
                      onClick={() => {
                        setActiveArtwork(isSelected ? null : globalIdx);
                        setDetailArtworkOverride(null);
                        setDetailArtworkOrigin(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setActiveArtwork(isSelected ? null : globalIdx);
                          setDetailArtworkOverride(null);
                          setDetailArtworkOrigin(null);
                        }
                      }}
                      onMouseEnter={() => handleArtworkMouseEnter(globalIdx)}
                      onMouseLeave={handleArtworkMouseLeave}
                      style={{ textAlign: 'left', cursor: 'pointer', position: 'relative', background: 'none', borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none', outline: 'none', padding: 0 }}
                    >
                      <div style={{ position: 'relative', overflow: 'hidden', width: '100%' }}>
                        <img
                          src={aw.lowImage}
                          alt={aw.title}
                          loading="lazy"
                          style={{ width: '100%', height: 'auto', display: 'block', transform: isHovered ? 'scale(1.04)' : 'scale(1)', transition: 'transform 0.4s' }}
                        />
                        <div style={{ position: 'absolute', inset: 0, transition: 'border 0.2s', borderTop: isSelected ? `2px solid ${limeColor}` : isHovered ? `1px solid ${t ? "rgba(0,0,0,0.20)" : "rgba(255,255,255,0.20)"}` : '1px solid transparent', borderRight: isSelected ? `2px solid ${limeColor}` : isHovered ? `1px solid ${t ? "rgba(0,0,0,0.20)" : "rgba(255,255,255,0.20)"}` : '1px solid transparent', borderBottom: isSelected ? `2px solid ${limeColor}` : isHovered ? `1px solid ${t ? "rgba(0,0,0,0.20)" : "rgba(255,255,255,0.20)"}` : '1px solid transparent', borderLeft: isSelected ? `2px solid ${limeColor}` : isHovered ? `1px solid ${t ? "rgba(0,0,0,0.20)" : "rgba(255,255,255,0.20)"}` : '1px solid transparent' }} />
                        <div style={{ position: 'absolute', right: 8, bottom: 8, display: 'flex', alignItems: 'center', gap: 6, opacity: isHovered || isSelected ? 1 : 0, transform: isHovered || isSelected ? 'translateY(0)' : 'translateY(3px)', transition: 'opacity 0.2s, transform 0.2s' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setProductArtwork(toProductArtwork(aw));
                            }}
                            title="상품으로 구매하기"
                            style={{ cursor: 'pointer', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.42)', borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none', borderRadius: 12, padding: 0, color: '#fff' }}
                          >
                            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              <rect x="7" y="7" width="10" height="10" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setCommentArtworkId(artworkIdFrom(aw));
                            }}
                            title="Comments"
                            style={{ cursor: 'pointer', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.42)', borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none', borderRadius: 12, padding: 0, color: '#fff' }}
                          >
                            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              openPlaylistForArtwork(aw);
                            }}
                            title="Add to playlist"
                            style={{ cursor: 'pointer', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.42)', borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none', borderRadius: 12, padding: 0, color: '#fff' }}
                          >
                            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                              <path d="M12 7v6" />
                              <path d="M9 10h6" />
                            </svg>
                          </button>
                          <HeartOverlay
                            isLiked={likedArtworks.has(artworkIdFrom(aw)) || likedArtworks.has(normalizeArtworkIdForFirestore(artworkIdFrom(aw)))}
                            onToggle={(e) => toggleLike(e, aw)}
                            size={16}
                            color={limeColor}
                            emptyColor="#fff"
                            style={{ width: 24, height: 24, borderRadius: 12, background: 'rgba(0,0,0,0.42)' }}
                          />
                        </div>
                      </div>
                      <div style={{ marginTop: '6px', padding: '0 2px' }}>
                        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '8px', color: fgMute }}>
                          {String(globalIdx + 1).padStart(2, '0')}
                        </div>
                        <div style={{ fontSize: '10px', color: isSelected || isHovered ? fgHigh : fgMed, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px', transition: 'color 0.15s' }}>
                          {aw.title} <span style={{ color: fgMute }}>({formatArtworkYear(aw.year) || aw.year})</span>
                        </div>
                        <div style={{ fontSize: '9px', color: fgMute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
                          {aw.artist}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Inline row expansion */}
              <AnimatePresence>
                {selectedRow === rowIdx && activeArtwork !== null && selectedArtworkDetail && (
                  <motion.div
                    key={`exp-${activeArtwork}-${artworkIdFrom(selectedArtworkDetail)}`}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.32, ease: 'easeOut' }}
                    style={{ overflow: 'hidden', marginBottom: '8px' }}
                  >
                    <div style={{ height: '1px', backgroundColor: dividerColor }} />
                    <div style={{ padding: '28px 0', display: 'flex', flexDirection: 'row', gap: '32px' }}>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <img
                          src={selectedArtworkDetail.image}
                          alt={selectedArtworkDetail.title}
                          loading="lazy"
                          style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '58vh', objectFit: 'contain' }}
                        />
                      </div>
                      <div style={{ width: '240px', flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '17px', color: fgHigh, lineHeight: 1.3 }}>
                            {selectedArtworkDetail.title}
                          </div>
                          <div style={{ marginTop: '10px', fontSize: '13px', color: fgMed }}>
                            {selectedArtworkDetail.artist}
                          </div>
                          <div style={{ marginTop: '4px', fontFamily: "'Space Mono', monospace", fontSize: '11px', color: fgLow }}>
                            {formatArtworkYear(selectedArtworkDetail.year) || selectedArtworkDetail.year}
                          </div>
                          {detailArtworkOverride && detailArtworkOrigin && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                resetRecommendationDrilldown();
                              }}
                              style={{
                                marginTop: '10px',
                                cursor: 'pointer',
                                padding: '4px 10px',
                                fontSize: '8px',
                                letterSpacing: '0.14em',
                                textTransform: 'uppercase',
                                color: limeColor,
                                background: limeBg,
                                borderTop: `1px solid ${limeBorder}`,
                                borderRight: `1px solid ${limeBorder}`,
                                borderBottom: `1px solid ${limeBorder}`,
                                borderLeft: `1px solid ${limeBorder}`,
                              }}
                              title="원래 보고 있던 작품으로 돌아가기"
                            >
                              Back to Current
                            </button>
                          )}
                          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setProductArtwork(toProductArtwork(selectedArtworkDetail));
                              }}
                              title="상품으로 구매하기"
                              style={{ cursor: 'pointer', width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: t ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)', borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none', borderRadius: 15, padding: 0, color: fgHigh }}
                            >
                              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <rect x="7" y="7" width="10" height="10" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setCommentArtworkId(artworkIdFrom(selectedArtworkDetail));
                              }}
                              title="Comments"
                              style={{ cursor: 'pointer', width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: t ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)', borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none', borderRadius: 15, padding: 0, color: fgHigh }}
                            >
                              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openPlaylistForArtwork(selectedArtworkDetail);
                              }}
                              title="Add to playlist"
                              style={{ cursor: 'pointer', width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: t ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)', borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none', borderRadius: 15, padding: 0, color: fgHigh }}
                            >
                              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                                <path d="M12 7v6" />
                                <path d="M9 10h6" />
                              </svg>
                            </button>
                            <HeartOverlay
                              isLiked={likedArtworks.has(artworkIdFrom(selectedArtworkDetail)) || likedArtworks.has(normalizeArtworkIdForFirestore(artworkIdFrom(selectedArtworkDetail)))}
                              onToggle={(e) => toggleLike(e, selectedArtworkDetail)}
                              size={16}
                              color={limeColor}
                              emptyColor={fgHigh}
                              style={{ width: 30, height: 30, borderRadius: 15, background: t ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)' }}
                            />
                          </div>
                          <div style={{ marginTop: '16px', height: '1px', backgroundColor: dividerColor }} />
                          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {[
                              { label: "Category", value: selectedArtworkDetail.category },
                              { label: "Material", value: selectedArtworkDetail.material },
                              { label: "Dimensions", value: selectedArtworkDetail.dimensions },
                            ].map((m) => (
                              <div key={m.label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
                                <span style={{ fontSize: '8px', color: fgMute, letterSpacing: '0.15em', textTransform: 'uppercase', flexShrink: 0 }}>{m.label}</span>
                                <span style={{ fontSize: '11px', color: fgLow, textAlign: 'right' }}>{m.value}</span>
                              </div>
                            ))}
                          </div>
                          {selectedArtworkDetail.sourceUrl && (
                            <a
                              href={selectedArtworkDetail.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                marginTop: '16px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                color: limeColor,
                                textDecoration: 'none',
                                fontSize: '10px',
                                letterSpacing: '0.1em',
                                textTransform: 'uppercase'
                              }}
                            >
                              <span>View Original</span>
                              <span>&nearr;</span>
                            </a>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setActiveArtwork(null);
                            setDetailArtworkOverride(null);
                            setDetailArtworkOrigin(null);
                          }}
                          style={{ marginTop: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', background: 'none', borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none', outline: 'none' }}
                        >
                          <span style={{ color: fgMute, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Close</span>
                          <span style={{ color: fgMute }}>&times;</span>
                        </button>
                      </div>
                    </div>

                    {selectedRecommendationArtwork && (
                      <div style={{ marginTop: '2px', paddingTop: '14px', borderTop: `1px solid ${dividerColor}` }}>
                        <ArtworkRecommendations
                          artwork={selectedRecommendationArtwork}
                          relatedArtworks={selectedRecommendationRelatedArtworks}
                          onSelectArtwork={handleRecommendationSelect}
                          mode="compact-horizontal"
                          theme={t ? 'light' : 'dark'}
                          likedArtworks={likedArtworks}
                          onToggleLike={(e, artwork) => toggleLike(e, toInteractiveArtworkFromProduct(artwork))}
                          onOpenProduct={(artwork) => setProductArtwork(toProductArtwork(toInteractiveArtworkFromProduct(artwork)))}
                        />
                      </div>
                    )}

                    <div style={{ height: '1px', backgroundColor: dividerColor }} />
                  </motion.div>
                )}
              </AnimatePresence>
            </React.Fragment>
          ))}

          {hasMoreArtworks && (
            <div
              ref={loadMoreRef}
              style={{
                marginTop: '20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <button
                onClick={loadMoreArtworks}
                style={{
                  cursor: 'pointer',
                  padding: '8px 14px',
                  fontSize: '9px',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: fgLow,
                  background: 'transparent',
                  borderTop: `1px solid ${dividerColor}`,
                  borderRight: `1px solid ${dividerColor}`,
                  borderBottom: `1px solid ${dividerColor}`,
                  borderLeft: `1px solid ${dividerColor}`,
                }}
              >
                Load More Works ({Math.min(VISIBLE_ARTWORK_BATCH, filterResultArtworks.length - visibleCount)})
              </button>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: `64px ${pad} 40px`, maxWidth: '900px' }}>
          <div style={{ height: '1px', backgroundColor: dividerColor }} />
          <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '8px', color: fgFaint, letterSpacing: '0.15em', textTransform: 'uppercase' }}>{venueName}</span>
              <span style={{ fontSize: '9px', color: fgFaint }}>&middot;</span>
              <span style={{ fontSize: '8px', color: fgFaint, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {mappedArtworks.length.toLocaleString()} works
              </span>
              <span style={{ fontSize: '9px', color: fgFaint }}>&middot;</span>
              <span style={{ fontSize: '8px', color: fgFaint, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {mappedType}
              </span>
            </div>
            <button onClick={onClose} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', background: 'none', borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none', outline: 'none' }}>
              <span style={{ color: fgMute, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Back to venue</span>
              <span style={{ color: fgMute }}>&rarr;</span>
            </button>
          </div>
        </div>

        {productArtwork && (
          <ProductModal
            key={productArtwork.id}
            artwork={productArtwork}
            relatedArtworks={relatedProductArtworks}
            onSelectArtwork={setProductArtwork}
            onClose={() => setProductArtwork(null)}
          />
        )}

        {commentArtworkId && (
          <CommentModal
            isOpen={true}
            artworkId={commentArtworkId}
            onClose={() => setCommentArtworkId(null)}
          />
        )}

        {playlistArtwork && (
          <PlaylistModal
            isOpen={true}
            onClose={() => setPlaylistArtwork(null)}
            item={playlistArtwork}
            itemType="artwork"
            theme={t ? "light" : "dark"}
          />
        )}
      </motion.div>
    </motion.div>
  );
}
