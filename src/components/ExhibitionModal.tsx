import type { ExhibitionItem } from "../types/Exhibition";
import type { Artwork } from "../types/Artwork";
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { collection, query, where, onSnapshot, getDocs, deleteDoc, doc, setDoc, serverTimestamp, addDoc } from "firebase/firestore";
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { db, auth } from "../firebase";
import { buildSourceSet, useProxy } from "../utils/imageProxy";
import { usePrefetchNeighbors } from "../hooks/usePrefetchNeighbors";
import { LoginButton } from "./LoginButton";
import { HeartOverlay } from "./HeartOverlay";
import { SubmissionForm } from "./SubmissionForm";

const sortNumericKeys = (map?: Record<string, string>) => {
  if (!map) return [] as number[];
  return Object.keys(map)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
};

const pickLowPlaceholder = (artwork: Artwork) => {
  if (artwork.lq) return artwork.lq;
  if (artwork.thumb) return artwork.thumb;
  const jpgKeys = sortNumericKeys(artwork.variants?.jpg);
  if (jpgKeys.length) {
    const url = artwork.variants?.jpg?.[String(jpgKeys[0])];
    if (url) return url;
  }
  const webpKeys = sortNumericKeys(artwork.variants?.webp);
  if (webpKeys.length) {
    const url = artwork.variants?.webp?.[String(webpKeys[0])];
    if (url) return url;
  }
  // Avoid demo placeholder or suspicious '1' filenames
  const img = artwork.image || '';
  if (/exhibition1\.png$/i.test(img) || /\/(?:1|1\.jpg|1\.png)$/i.test(img) || img === '1' || img === '1.jpg' || img === '1.png') {
    return FALLBACK_ARTWORK_IMAGE;
  }
  return img;
};

const buildVariantSourceSet = (
  artwork: Artwork,
  format: keyof NonNullable<Artwork["variants"]>,
  widths: number[],
  fallbackQuality: number
) => {
  const map = artwork.variants?.[format];
  if (map) {
    const rows = widths.filter((w) => map[String(w)]).map((w) => `${map[String(w)]} ${w}w`);
    if (rows.length) return rows.join(", ");
  }
  if (!useProxy) return null;
  if (format === "avif" || format === "webp") {
    return buildSourceSet(artwork.image, widths, format, fallbackQuality);
  }
  return null;
};

// Use a transparent 1x1 PNG as the fallback so no visible '1' placeholder appears
const FALLBACK_ARTWORK_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XjVvcAAAAASUVORK5CYII=";

// R2 이미지 URL 확인 및 축소 버전 생성 헬퍼
const R2_DOMAIN = 'pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const isR2Image = (url: string): boolean => url?.includes(R2_DOMAIN);

// Cloudflare Image Resizing URL 생성 (R2 이미지용)
// 85% 품질로 축소된 이미지 로드, 클릭시 원본 100% 표시
const getOptimizedR2Url = (url: string, quality: number = 85): string => {
  if (!isR2Image(url)) return url;
  // Cloudflare Image Resizing format: /cdn-cgi/image/quality=85,format=auto/URL
  // R2 public bucket은 직접 리사이징이 안 되므로 CSS로 처리
  return url;
};

// Extract YouTube video ID from various URL formats
const extractYouTubeId = (text: string): string | null => {
  if (!text) return null;
  // Match various YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
};

// Remove YouTube URLs from text for cleaner display
const removeYouTubeUrls = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)[a-zA-Z0-9_-]{11}[^\s]*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

// Layout constants (original)
const LAYOUT_LEFT_BASE = 420; // px, push the two-line layout block to the right
const LAYOUT_RIGHT_PAD = 0; // px, stick to the right edge
const META_SHIFT = 205; // px, horizontal shift to move metadata area right
const META_BASE_MARGIN = 8; // px, margin above metadata (raised closer to top)
const META_VERTICAL_PAD = 24; // px, extra vertical space to allow wrapping
const META_HOR_SCALE = 2 / 3; // shrink horizontal allocation to 2/3

// Room type for floor plan boxes
// Room/editor features removed for viewer design

interface ExhibitionModalProps {
  exhibition: ExhibitionItem;
  onClose: () => void;
  initialSelectedIndex?: number;
}



// Room metadata for display exhibitions
interface RoomMeta {
  id: string;
  name: string;
  coverImage?: string;
  description?: string;
  location?: string;
  url?: string;
  hasArtworks: boolean;
}

const ExhibitionModal: React.FC<ExhibitionModalProps> = ({ exhibition, onClose, initialSelectedIndex = 0 }) => {
  const navigate = useNavigate();
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [initialized, setInitialized] = useState<boolean>(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(initialSelectedIndex);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('ALL');
  const [roomMetas, setRoomMetas] = useState<RoomMeta[]>([]);
  const [selectedYearRange, setSelectedYearRange] = useState<string>('ALL');
  const [dateLevel, setDateLevel] = useState<'century' | 'decade'>('century');
  const [selectedCentury, setSelectedCentury] = useState<string | null>(null); // '~17' -> ≤1699, '18' -> 1700s, '19' -> 1800s, etc.
  const [viewMode, setViewMode] = useState<'archive' | 'gallery' | 'panorama'>('gallery');
  // Virtualization state for archive mode
  const [archiveScrollTop, setArchiveScrollTop] = useState(0);
  const [archiveContainerHeight, setArchiveContainerHeight] = useState(600);
  // Liked artworks feature
  const [likedArtworks, setLikedArtworks] = useState<Set<string>>(new Set());
  const [currentUser, setCurrentUser] = useState<any>(null);
  // Submission form for temporary exhibitions
  const [showSubmissionForm, setShowSubmissionForm] = useState(false);
  // Exhibition description expanded state
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  // Enriched exhibition data (with descriptionHtml from JSON)
  const [_enrichedExhibition, setEnrichedExhibition] = useState<any>(null);
  // Hayward Gallery: toggle to show artworks only (hide archival documents)
  const [showArtworksOnly, setShowArtworksOnly] = useState(false);
  // 2D/3D artwork type filter (multi-select)
  const [selectedTypes, setSelectedTypes] = useState<Set<'2D' | '3D'>>(new Set());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        setLikedArtworks(new Set());
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const q = collection(db, `users/${currentUser.uid}/liked_artworks`);
    // Subscribe to the whole collection of likes (assuming < 10k likes, this is fine for now)
    // Optimization: we could load only IDs.
    const unsub = onSnapshot(q, (snap) => {
      const s = new Set<string>();
      snap.forEach(doc => s.add(doc.id));
      setLikedArtworks(s);
    });
    return () => unsub();
  }, [currentUser]);

  const toggleLike = useCallback(async (e: React.MouseEvent, artwork: Artwork) => {
    e.stopPropagation();
    e.preventDefault();

    let userToUse = currentUser;

    // Prompt login if not logged in or is anonymous
    if (!currentUser || currentUser.isAnonymous) {
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const result = await signInWithPopup(auth, provider);
        userToUse = result.user; // Use the newly signed-in user
      } catch (err) {
        console.error("Login failed", err);
        return; // Only return if login actually failed
      }
    }

    if (!userToUse) return; // Safety check

    const artworkId = artwork.id;
    const isLiked = likedArtworks.has(artworkId);
    const ref = doc(db, `users/${userToUse.uid}/liked_artworks/${artworkId}`);
    try {
      if (isLiked) {
        // Optimistic update
        setLikedArtworks(prev => {
          const next = new Set(prev);
          next.delete(artworkId);
          return next;
        });
        await deleteDoc(ref);
      } else {
        // Optimistic update
        setLikedArtworks(prev => {
          const next = new Set(prev);
          next.add(artworkId);
          return next;
        });
        await setDoc(ref, {
          likedAt: serverTimestamp(),
          artworkId,
          title: artwork.name || '',
          artist: artwork.artist || '',
          year: artwork.year || 0,
          image: artwork.image || '',
          youtubeId: artwork.youtubeId || null,
          mediaType: artwork.mediaType || 'image',
        });
      }
    } catch (error) {
      console.error("Failed to toggle like", error);
    }
  }, [currentUser, likedArtworks]);



  useEffect(() => {
    setViewMode((prev) => (prev === 'gallery' ? prev : 'gallery'));
  }, [exhibition.id]);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const infoPanelRef = useRef<HTMLDivElement | null>(null);
  const seededRef = useRef(false);

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<{
    artwork: Artwork;
    start: { left: number; top: number; width: number; height: number };
    target: { left: number; top: number; width: number; height: number };
    animate: boolean;
    natWidth?: number;
    natHeight?: number;
  } | null>(null);
  // Progressive image loading state (Step 1): main stage / panorama
  const [mainLoaded, setMainLoaded] = useState(false);
  // Archive mode: control iframe and thumbnail visibility
  const [archiveVideoReady, setArchiveVideoReady] = useState(false);
  const [archiveThumbnailHidden, setArchiveThumbnailHidden] = useState(false);
  // Gallery mode: control iframe and thumbnail visibility on hover
  const [galleryVideoReadyIdx, setGalleryVideoReadyIdx] = useState<number | null>(null);
  const [galleryThumbnailHiddenIdx, setGalleryThumbnailHiddenIdx] = useState<number | null>(null);
  
  const mainImgRef = useRef<HTMLImageElement | null>(null);
  const idleDecodeHandlesRef = useRef<number[]>([]);
  // Representative image (from local feed or exhibition data)
  const [repImage, setRepImage] = useState<string | null>(null);
  // Close guards
  const isActiveRef = useRef(true);
  const closeGuardRef = useRef(false);
  useEffect(() => {
    return () => { isActiveRef.current = false; };
  }, []);
  const clearModalFlag = () => {
    try {
      const st = { ...(window.history.state || {}) } as any;
      delete st.modal;
      delete st.exhibitionId;
      delete st.selectedIndex;
      window.history.replaceState(st, document.title);
    } catch { }
  };

  // Responsive check for top bar layout
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== "undefined" ? window.innerWidth < 1100 : false);
  // Very narrow detection (between mobile and narrow) for tighter layouts
  const [isVeryNarrow, setIsVeryNarrow] = useState(() => typeof window !== "undefined" ? window.innerWidth < 900 : false);
  // Mobile detection (for touch devices with narrow screens)
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth < 768 : false);
  // Window width for dynamic gap calculation
  const [windowWidth, setWindowWidth] = useState(() => typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const onResize = () => {
      setIsNarrow(window.innerWidth < 1100);
      setIsVeryNarrow(window.innerWidth < 900);
      setIsMobile(window.innerWidth < 768);
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Allow adding simple rooms and compute a list of room buttons (ALL + defaults + custom + discovered)
  const [customRooms, setCustomRooms] = useState<string[]>([]);
  // Load/save custom rooms per exhibition to localStorage so rooms persist between opens
  useEffect(() => {
    try {
      const key = `rooms_${exhibition.id}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) setCustomRooms(parsed);
      }
    } catch { }
  }, [exhibition.id]);

  useEffect(() => {
    try {
      const key = `rooms_${exhibition.id}`;
      localStorage.setItem(key, JSON.stringify(customRooms));
    } catch { }
  }, [customRooms, exhibition.id]);
  
  const roomButtons = useMemo(() => {
    // For display exhibitions (both Tate Britain and Tate Modern), use roomMetas to include all rooms
    const isTateBritainDisplay = exhibition.id.startsWith('tate-britain-display-');
    if ((isTateBritainDisplay || exhibition.id.startsWith('display-')) && roomMetas.length > 0) {
      const buttons: { label: string; id: string }[] = [{ label: 'ALL', id: 'ALL' }];
      for (const meta of roomMetas) {
        buttons.push({ label: meta.id, id: meta.id });
      }
      return buttons;
    }
    
    // For non-display exhibitions: only include rooms that actually have artworks
    const discovered = Array.from(new Set(
      artworks
        .map(a => (a.roomId || '').trim())
        .filter(id => id && id.toLowerCase() !== 'default')
    ));
    const numeric = Array.from(new Set(discovered.filter(id => /^\d+$/.test(id))));
    numeric.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    // Letter rooms (A-G for ground floor)
    const letters = Array.from(new Set(discovered.filter(id => /^[A-G]$/i.test(id))));
    letters.sort();
    const hasC = discovered.some(id => id.toUpperCase() === 'C');
    // Check for both 'n' and 'Not on display' as Archive
    const hasArchive = discovered.some(id => id === 'Not on display' || id === 'n');

    const buttons: { label: string; id: string }[] = [{ label: 'ALL', id: 'ALL' }];
    for (const id of numeric) buttons.push({ label: id, id });
    for (const id of letters) {
      if (id.toUpperCase() !== 'C') buttons.push({ label: id.toUpperCase(), id }); // add letter rooms except C (handled separately)
    }
    if (hasC) buttons.push({ label: 'C', id: 'C' }); // append Central Hall
    if (hasArchive) buttons.push({ label: 'n', id: 'n' }); // append Archive (n) at the end
    return buttons;
  }, [artworks, roomMetas, exhibition.id]);

  // Room-only filtered (for deriving century/decade availability)
  const roomFiltered = useMemo(() => {
    if (selectedRoomId === 'ALL') return artworks;
    return artworks.filter(a => (a.roomId || 'default') === selectedRoomId);
  }, [artworks, selectedRoomId]);

  // Apply date filter: if decade is selected, filter by that decade; otherwise if a century is selected (in decade view), filter by the whole century
  const filteredArtworks = useMemo(() => {
    let filtered = roomFiltered;

    // Filter out archival materials if toggle is on (generic for all collections with isArchival field)
    if (showArtworksOnly) {
      filtered = filtered.filter(a => !a.isArchival);
    }

    // 2D/3D type filter (if any type selected, filter to those types)
    if (selectedTypes.size > 0) {
      filtered = filtered.filter(a => a.type && selectedTypes.has(a.type as '2D' | '3D'));
    }

    // If in decade view and a century is chosen, limit to that century
    if (dateLevel === 'decade' && selectedCentury) {
      if (selectedCentury === '~17') {
        // Pre-1700
        filtered = filtered.filter(a => (a.year || 0) > 0 && (a.year || 0) < 1700);
      } else {
        const cNum = parseInt(selectedCentury);
        const cStart = (cNum - 1) * 100;
        const cEnd = cStart + 100;
        filtered = filtered.filter(a => {
          const y = a.year || 0;
          return y >= cStart && y < cEnd;
        });
      }
    }

    // If a decade/century is explicitly selected, further narrow
    if (selectedYearRange !== 'ALL') {
      const startYear = parseInt(selectedYearRange);
      if (Number.isFinite(startYear)) {
        const dStart = startYear;
        // For ~17c selections, use 100-year range; otherwise 10-year
        const dEnd = (selectedCentury === '~17') ? dStart + 100 : dStart + 10;
        filtered = filtered.filter(a => {
          const y = a.year || 0;
          return y >= dStart && y < dEnd;
        });
      }
    }

    return filtered;
  }, [roomFiltered, dateLevel, selectedCentury, selectedYearRange, likedArtworks, showArtworksOnly, selectedTypes]);

  // Check if any artwork has type field (2D/3D) for showing filter buttons
  const hasTypedArtworks = useMemo(() => {
    return artworks.some(a => a.type === '2D' || a.type === '3D');
  }, [artworks]);

  // Check if any artwork has isArchival field for showing artworks only button
  const hasArchivalArtworks = useMemo(() => {
    return artworks.some(a => a.isArchival === true);
  }, [artworks]);

  // Derive available centuries and decades from roomFiltered
  const availableCenturies = useMemo(() => {
    const set = new Set<string>();
    for (const a of roomFiltered) {
      const y = a.year || 0;
      if (!y) continue;
      if (y < 1700) set.add('~17');      // 17c and earlier
      else if (y < 1800) set.add('18');  // 18c (1700-1799)
      else if (y < 1900) set.add('19');  // 19c (1800-1899)
      else if (y < 2000) set.add('20');  // 20c (1900-1999)
      else set.add('21');                 // 21c (2000+)
    }
    // Sort: ~17 first, then numeric ascending
    return Array.from(set).sort((a, b) => {
      if (a === '~17') return -1;
      if (b === '~17') return 1;
      return Number(a) - Number(b);
    });
  }, [roomFiltered]);

  const availableDecades = useMemo(() => {
    if (!selectedCentury) return [] as number[];
    const present = new Set<number>();
    if (selectedCentury === '~17') {
      // Pre-1700: group by centuries (100-year intervals) instead of decades
      for (const a of roomFiltered) {
        const y = a.year || 0;
        if (y > 0 && y < 1700) {
          // Group by century: 1200-1299 -> 1200, 1300-1399 -> 1300, etc.
          const c = Math.floor(y / 100) * 100;
          present.add(c);
        }
      }
    } else {
      const cNum = parseInt(selectedCentury);
      const start = (cNum - 1) * 100;
      const end = start + 100;
      for (const a of roomFiltered) {
        const y = a.year || 0;
        if (y >= start && y < end) {
          const d = Math.floor(y / 10) * 10;
          present.add(d);
        }
      }
    }
    return Array.from(present).sort((a, b) => a - b);
  }, [roomFiltered, selectedCentury]);

  // Reset date drilldown when room or exhibition changes
  useEffect(() => {
    setDateLevel('century');
    setSelectedCentury(null);
    setSelectedYearRange('ALL');
  }, [selectedRoomId, exhibition.id]);
  // Momentum scroll state
  const momentumRef = useRef<{ vel: number; raf: number }>({ vel: 0, raf: 0 });
  const applyMomentumRef = useRef<((delta: number) => void) | null>(null);
  // Alignment helpers for meta row under top controls
  const galleryRef = useRef<HTMLSpanElement | null>(null);
  const archiveRef = useRef<HTMLSpanElement | null>(null);
  const metaRowRef = useRef<HTMLDivElement | null>(null);
  const topBarRef = useRef<HTMLDivElement | null>(null);
  // descRef removed (description now in left header)
  const titleScrollRef = useRef<HTMLDivElement | null>(null);
  const titleRafRef = useRef<number | null>(null);
  const titleDirRef = useRef<number>(1);
  const didReseedRef = useRef(false);
  // gallerySeedRef removed (gallery extras no longer generated)
  // Fixed symmetric columns to keep metadata spread and avoid overlap
  const META_CREATOR_X = 250; // px
  const META_DATE_X = 500; // px
  const META_GAP = META_DATE_X - META_CREATOR_X; // 250px by default
  const FIXED_META_HEIGHT = 56; // px, lock meta row height to prevent layout shift
  // Narrow screens: center metadata area by computing offset based on windowWidth
  const narrowMetaOffset = isMobile ? 12 : (isVeryNarrow ? Math.max(160, (windowWidth - 400) / 2) : (isNarrow ? Math.max(180, (windowWidth - 500) / 2) : 0));
  const metaPos = isVeryNarrow ? {
    title: narrowMetaOffset,
    creator: narrowMetaOffset,
    date: narrowMetaOffset + 120,
    dimension: narrowMetaOffset + 120
  } : isNarrow ? {
    title: narrowMetaOffset,
    creator: narrowMetaOffset,
    date: narrowMetaOffset + 160,
    dimension: narrowMetaOffset + 160
  } : {
    title: Math.max(0, META_CREATOR_X - META_GAP),
    creator: META_CREATOR_X,
    date: META_DATE_X,
    dimension: META_DATE_X + META_GAP,
  };
  const applyFallbackImage = useCallback((target: HTMLImageElement | null) => {
    if (!target) return;
    if (target.dataset.fallbackApplied === '1') return;
    target.dataset.fallbackApplied = '1';
    target.src = FALLBACK_ARTWORK_IMAGE;
    try {
      target.srcset = '';
    } catch { }
    target.removeAttribute('srcset');
  }, []);

  // Heuristic: try to upgrade known width-constrained URLs to larger sizes
  const upgradeImageUrl = useCallback((url?: string | null) => {
    if (!url) return '';
    let out = url;
    // Tate pattern: ...width-600.jpg → width-2000.jpg
    out = out.replace(/width-(\d+)(?=\.(?:jpg|jpeg|png|webp|avif)(?:$|\?))/i, 'width-2000');
    // Common query params: w= / width=
    out = out.replace(/([?&])(w|width)=(\d+)/i, (_, p1, p2) => `${p1}${p2}=2000`);
    // Heuristic: quality too low? bump q param if present
    out = out.replace(/([?&])(q|quality)=(\d+)/i, (_, p1, p2) => `${p1}${p2}=90`);
    return out;
  }, []);

  const parseIntendedWidth = useCallback((url?: string | null): number | undefined => {
    if (!url) return undefined;
    const m1 = url.match(/width-(\d+)(?=\.(?:jpg|jpeg|png|webp|avif)(?:$|\?))/i);
    if (m1) return parseInt(m1[1], 10);
    const m2 = url.match(/[?&](w|width)=(\d+)/i);
    if (m2) return parseInt(m2[2], 10);
    return undefined;
  }, []);

  const getLargestVariantUrl = useCallback((a: Artwork): { url: string; width: number } | null => {
    const pickMax = (rec?: Record<string, string> | undefined): { url: string; width: number } | null => {
      if (!rec) return null;
      const keys = Object.keys(rec).map((k) => Number(k)).filter((n) => Number.isFinite(n));
      if (keys.length === 0) return null;
      const maxW = Math.max(...keys);
      const url = rec[String(maxW)];
      return url ? { url, width: maxW } : null;
    };
    // Prefer jpg variants for original-like fidelity if available
    const jpg = pickMax(a.variants?.jpg);
    if (jpg) return jpg;
    // Otherwise try webp/avif largest (still better than tiny base)
    const webp = pickMax(a.variants?.webp);
    if (webp) return webp;
    const avif = pickMax(a.variants?.avif);
    if (avif) return avif;
    return null;
  }, []);

  const getBestFullUrl = useCallback((a: Artwork): { url: string; width?: number } => {
    const v = getLargestVariantUrl(a);
    if (v) return { url: v.url, width: v.width };
    const upgraded = upgradeImageUrl(a.image);
    const intended = parseIntendedWidth(upgraded) || parseIntendedWidth(a.image);
    return { url: upgraded || a.image, width: intended };
  }, [getLargestVariantUrl, upgradeImageUrl, parseIntendedWidth]);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const metaTitleValueRef = useRef<HTMLDivElement | null>(null);
  const creatorRef = useRef<HTMLDivElement | null>(null);
  const dateRef = useRef<HTMLDivElement | null>(null);
  const dimensionRef = useRef<HTMLDivElement | null>(null);
  // metaHeight locked; no state
  const [topBarHeight, setTopBarHeight] = useState<number>(36);
  const [metaMarginTop] = useState<number>(META_BASE_MARGIN);
  // description/positioning constants removed — layout now uses fixed left-top positions
  // Left positions now derive from metaPos.dimension
  // Vertical positions now follow the Archive line (top: 14)
  const stageMonitorRef = useRef<HTMLDivElement | null>(null);
  // Panorama drag state
  const [panoramaDragging, setPanoramaDragging] = useState(false);
  const panStartXRef = useRef<number>(0);
  const panStartIndexRef = useRef<number>(0);

  // Lock background scroll when modal is open
  useEffect(() => {
    const original = document.body.style.overflow;
    const prevModalOpen = document.body.dataset.modalOpen;
    document.body.style.overflow = "hidden";
    document.body.dataset.modalOpen = '1';
    return () => {
      document.body.style.overflow = original;
      if (prevModalOpen == null) delete document.body.dataset.modalOpen;
      else document.body.dataset.modalOpen = prevModalOpen;
    };
  }, []);

  // Load header image: prefer current artwork image, fallback to any local representativeImage
  useEffect(() => {
    let aborted = false;
    async function loadRep() {
      setRepImage(null);
      const preferItem = (exhibition as any)?.image && String((exhibition as any).image).trim();
      const localRep = (exhibition as any)?.representativeImage && String((exhibition as any).representativeImage).trim();
      const chosen = preferItem || localRep || null;
      if (!aborted && chosen) setRepImage(chosen);
    }
    loadRep();
    return () => { aborted = true; };
  }, [exhibition]);

  // Reset progressive state & load high-res when selected artwork changes
  useEffect(() => {
    const currentArt = (() => {
      if (!filteredArtworks.length) return null;
      return filteredArtworks[Math.min(selectedIndex, filteredArtworks.length - 1)];
    })();
    setMainLoaded(false);
    if (!currentArt || !currentArt.image) return;
    let cancelled = false;
    const hi = new Image();
    hi.decoding = 'async';
    hi.loading = 'eager';
    hi.src = currentArt.image;
    hi.onload = () => {
      if (cancelled) return;
      setMainLoaded(true);
      if (mainImgRef.current) {
        // Swap to full-res if still on low-res
        if (mainImgRef.current.getAttribute('data-hi') !== '1') {
          mainImgRef.current.src = currentArt.image;
          mainImgRef.current.setAttribute('data-hi', '1');
        }
      }
    };
    hi.onerror = () => { if (!cancelled) setMainLoaded(true); };
    return () => { cancelled = true; };
  }, [selectedIndex, filteredArtworks]);

  // History integration: when modal opens we push a modal state so refresh keeps modal
  // and back navigation can restore the underlying detail panel instead of navigating away.
  const didHistoryInitRef = useRef(false);
  useEffect(() => {
    if (didHistoryInitRef.current) return; // StrictMode-safe: run once per mount
    didHistoryInitRef.current = true;
    // Save the current history state as underlying state (hash/scroll) then push modal state
    try {
      const underlying = {
        hash: window.location.hash,
        scrollY: window.scrollY,
      };
      // merge underlying into current state
      const base = Object.assign({}, window.history.state || {});
      base.underlying = underlying;
      // replace current entry with one that contains underlying metadata
      window.history.replaceState(base, document.title);

      // push modal-specific state once; avoid duplicates to prevent double-close requirement
      const current = (window.history.state as any) || {};
      const guardKey = `modalGuard_${exhibition.id}`;
      const alreadyModal = !!(current.modal && current.exhibitionId === exhibition.id);
      const alreadyPushed = sessionStorage.getItem(guardKey) === '1';
      if (!alreadyModal && !alreadyPushed) {
        const modalState = { ...current, modal: true, exhibitionId: exhibition.id, selectedIndex } as any;
        window.history.pushState(modalState, document.title);
        try { sessionStorage.setItem(guardKey, '1'); } catch { }
      }

      // No extra dispatch here; HomePage reads history.state on mount to auto-open

      const onPop = (_e: PopStateEvent) => {
        // Always treat back like close while modal is mounted
        try { onClose(); } catch { /* ignore */ }
      };

      window.addEventListener('popstate', onPop);
      return () => {
        window.removeEventListener('popstate', onPop);
        try { sessionStorage.removeItem(guardKey); } catch { }
      };
    } catch (e) {
      // ignore any history errors (some browsers restrict replaceState in certain navigations)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep selection reflected in history so forward/back updates selection
  useEffect(() => {
    try {
      const st = Object.assign({}, window.history.state || {});
      st.selectedIndex = selectedIndex;
      window.history.replaceState(st, document.title);
    } catch (e) { }
  }, [selectedIndex]);

  // Subscribe to Firestore artworks for this exhibition
  useEffect(() => {
    // DEBUG: Log exhibition ID
    console.log('[ExhibitionModal] exhibition.id =', exhibition.id);
    
    // British Museum Rooms archive: load from local scraped JSON
    if (exhibition.id === 'bm-archive-rooms') {
      (async () => {
        try {
          const res = await fetch('/data/british-museum-galleries.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Missing british-museum-galleries.json');
          const data = await res.json();
          const rooms: Array<{ id: string; title: string; items: any[] }> = Array.isArray(data.rooms) ? data.rooms : [];
          const list = rooms.flatMap((room) => {
            const rid = (room.id || room.title || 'default').toString();
            return (Array.isArray(room.items) ? room.items : []).map((it: any) => ({
              id: it.id || `${rid}-${Math.random().toString(36).slice(2)}`,
              name: it.name || it.title || 'Object',
              artist: it.artist || '',
              year: typeof it.year === 'number' ? it.year : 0,
              image: it.image || it.thumb || it.thumbnail,
              url: it.url,
              roomId: rid,
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
            }));
          });
          // Keep only those with images to avoid empty tiles
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (e) {
          console.error('Failed to load BM galleries:', e);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // NPG Floor 3 Rooms archive: load from local scraped JSON
    if (exhibition.id === 'npg-floor3-rooms') {
      (async () => {
        try {
          const res = await fetch('/data/npg-floor3.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Missing npg-floor3.json');
          const data = await res.json();
          const rooms: Array<{ id: string; title: string; items: any[] }> = Array.isArray(data.rooms) ? data.rooms : [];
          const list = rooms.flatMap((room) => {
            const rid = (room.id || room.title || 'default').toString();
            return (Array.isArray(room.items) ? room.items : []).map((it: any, idx: number) => ({
              id: it.id || `${rid}-${idx}`,
              name: it.name || it.title || 'Artwork',
              artist: it.artist || '',
              year: typeof it.year === 'number' ? it.year : 0,
              image: it.image || it.thumb || it.thumbnail,
              url: it.url,
              roomId: rid,
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
            }));
          });
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (e) {
          console.error('Failed to load NPG rooms:', e);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // If a random image seed is requested via URL param, skip Firestore subscription and show 20 ephemeral images immediately
    const params = new URLSearchParams(window.location.search);
    const seedMode = params.get("seed");
    const allowSeed = exhibition.title?.trim() === "Korean Classical Art Collection" && (seedMode === "unsplash20" || seedMode === "picsum20");
    if (allowSeed) {
      const now = Date.now();
      const useUnsplash = seedMode === "unsplash20";
      const keywords = "art,antique,artifact,exhibition,museum,asian";
      const list: Artwork[] = Array.from({ length: 20 }, (_, i) => ({
        id: `ephemeral-${now}-${i}`,
        name: `Random ${i + 1}`,
        artist: "Random",
        year: 0,
        image: useUnsplash ? `https://source.unsplash.com/1200x900/?${keywords}&sig=${now + i}` : `https://picsum.photos/seed/${now + i}/1200/900`,
        roomId: "default",
        exhibitionName: exhibition.name,
        exhibitionTitle: exhibition.title,
      }));
      setArtworks(list);
      setInitialized(true);
      return () => { };
    }
    // Special case for Tate Collection feeds: load from local scraped JSON (bypass Firestore)
    if (exhibition.id === 'tm-perm-1' || exhibition.id === 'tm-perm-3') {
      (async () => {
        try {
          const dataFile = exhibition.id === 'tm-perm-1'
            ? '/data/tate-collection-highlights-artworks.json'
            : '/data/tate-artworks.json';
          const res = await fetch(dataFile, { cache: 'no-store' });
          if (!res.ok) throw new Error(`Failed to load ${dataFile}`);
          const data = await res.json();
          const toYear = (dateText: string | undefined) => {
            if (!dateText) return 0;
            const match = dateText.match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          // Helper to convert URL-based ID to Firestore-compatible ID
          const sanitizeId = (rawId: string, idx: number) => {
            if (!rawId) return `tate-${idx}`;
            // If it's a URL, extract the accession number (e.g., "t15912" from the end)
            if (rawId.startsWith('http')) {
              const match = rawId.match(/([a-z]\d+)$/i);
              if (match) return `tate-${match[1]}`;
              // Fallback: use URL path slug
              const slug = rawId.split('/').pop() || '';
              return `tate-${slug.replace(/[^a-zA-Z0-9-_]/g, '')}`;
            }
            // Replace any invalid characters for Firestore document IDs
            return rawId.replace(/[\/\.#$\[\]]/g, '-');
          };
          const list: Artwork[] = Array.isArray(data.items)
            ? data.items.map((item: any, idx: number) => {
              const image = item.image || item.thumb || '';
              return {
                id: sanitizeId(item.id || item.url || '', idx),
                name: item.title || item.name || 'Untitled',
                artist: item.artist || item.creator || 'Unknown',
                year: toYear(item.dateText),
                date: item.dateText,
                image,
                thumb: item.thumb,
                dimension: item.dimensions,
                sourceUrl: item.url,
                roomId: 'default',
                exhibitionName: exhibition.name,
                exhibitionTitle: exhibition.title,
              };
            })
            : [];
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
          try {
            localStorage.setItem(`artworks_${exhibition.id}`, JSON.stringify(withImages));
          } catch { }
        } catch (error) {
          console.error('Failed to load Tate artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Tate St Ives Collection: load from local scraped JSON
    if (exhibition.id === 'tsi-perm-1') {
      (async () => {
        try {
          const res = await fetch('/data/tate-st-ives-artworks.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Tate St Ives artworks');
          const data = await res.json();
          const toYear = (yearText: string | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          const list: Artwork[] = Array.isArray(data)
            ? data.map((item: any, idx: number) => ({
              id: item.id || `tsi-${idx}`,
              name: item.title || item.name || 'Untitled',
              artist: item.artist || 'Unknown',
              year: toYear(item.year),
              date: item.year,
              image: item.image,
              sourceUrl: item.url,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
            }))
            : [];
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Tate St Ives artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Tate Britain Collection: load from local scraped JSON
    if (exhibition.id === 'tbc-perm-1') {
      (async () => {
        try {
          const res = await fetch('/data/tate-britain-artworks.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Tate Britain artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          const list: Artwork[] = Array.isArray(data)
            ? data.map((item: any, idx: number) => ({
              id: item.id || `tbc-${idx}`,
              name: item.title || item.name || 'Untitled',
              artist: item.artist || 'Unknown',
              year: toYear(item.year),
              date: item.year,
              image: item.image,
              sourceUrl: item.sourceUrl,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
            }))
            : [];
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Tate Britain artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Dulwich Picture Gallery Collection: load from local scraped JSON
    if (exhibition.id === 'dpg-1') {
      (async () => {
        try {
          const res = await fetch('/data/dulwich-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Dulwich artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          
          // Detect artwork type: paintings are 2D, sculptures/objects are 3D
          const detectType = (title: string): '2D' | '3D' | 'unknown' => {
            if (/sculpture|bust|statue|figure|relief/i.test(title)) return '3D';
            if (/painting|portrait|landscape|still life|view|scene/i.test(title)) return '2D';
            return '2D'; // Dulwich is primarily a paintings gallery
          };
          
          const list: Artwork[] = Array.isArray(data.objects)
            ? data.objects.map((item: any, idx: number) => ({
              id: item.id || `dpg-${idx}`,
              name: item.title || item.name || 'Untitled',
              artist: item.artist || 'Unknown',
              year: toYear(item.year),
              date: item.year,
              image: item.image,
              sourceUrl: item.url,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              type: detectType(item.title || ''),
            }))
            : [];
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Dulwich artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Hayward Gallery Collection: load from local scraped JSON
    if (exhibition.id === 'hayward-gallery-collection') {
      (async () => {
        try {
          const res = await fetch('/data/hayward-gallery-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Hayward Gallery artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          
          // Patterns for archival/documentary materials (not actual artworks)
          const archivalPatterns = [
            /^installation view/i,
            /installation view:/i,
            /exterior view/i,
            /hayward exterior/i,
            /gallery exterior/i,
            /^maintenance information/i,
            /^letter /i,
            /^draft text/i,
            /^text for /i,
            /^text on /i,
            /^list of /i,
            /^document /i,
            /^sample letter/i,
            /^thank you letter/i,
            /^short exhibition description/i,
            /^exhibition guide/i,
            /^marketing leaflet/i,
            /^press cutting/i,
            /^press release/i,
            /^private view/i,
            /^exhibitions leaflet/i,
            /^diagram /i,
            /^floorplan /i,
            /^freesheet /i,
            /walk guide/i,
            /^notes on /i,
            /^note on /i,
            /^catalogue /i,
          ];
          
          const isArchival = (title: string) => {
            for (const pattern of archivalPatterns) {
              if (pattern.test(title)) return true;
            }
            return false;
          };
          
          // Detect artwork type for Hayward (contemporary art - mix of 2D/3D)
          const detectType = (title: string): '2D' | '3D' | 'unknown' => {
            if (/sculpture|installation|figure|object|astronomer|horse/i.test(title)) return '3D';
            if (/painting|drawing|print|photograph|portrait|canvas|paper/i.test(title)) return '2D';
            // Default to unknown for contemporary art
            return 'unknown';
          };
          
          const allObjects = Array.isArray(data.objects) ? data.objects : [];
          
          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
              id: item.id || `hayward-gac-${idx}`,
              name: item.title || item.name || 'Untitled',
              artist: item.artist === 'Additional Items' ? 'Unknown' : (item.artist || 'Unknown'),
              year: toYear(item.year),
              date: item.year,
              image: item.image,
              sourceUrl: item.url,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              isArchival: isArchival(item.title || ''),
              type: detectType(item.title || ''),
            }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Hayward Gallery artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Royal Academy Collection: load from local scraped JSON
    if (exhibition.id === 'ra-1') {
      (async () => {
        try {
          const res = await fetch('/data/royal-academy-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Royal Academy artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          
          // Patterns for archival/documentary materials
          const archivalPatterns = [
            /^petition of/i,
            /^from '/i,
            /^students working/i,
            /^visitors queuing/i,
            /^working from life/i,
            /^record drawing/i,
            /^watercolour test paper/i,
            /^palette owned by/i,
            /exhibition room/i,
            /life class/i,
            /antique school/i,
            /painting school/i,
            /lecture on/i,
            /lecturing at/i,
            /sending in day/i,
            /photographed by/i,
            /on display with/i,
            /burlington house/i,
            /somerset house$/i,
            /^cast of/i,  // Casts of sculptures
          ];
          
          const isArchival = (title: string) => {
            for (const pattern of archivalPatterns) {
              if (pattern.test(title)) return true;
            }
            return false;
          };
          
          // Detect artwork type: paintings/drawings are 2D, sculptures are 3D
          const detectType = (title: string): '2D' | '3D' | 'unknown' => {
            if (/sculpture|bust|figure|statue|horse|rolling horse|cast of/i.test(title)) return '3D';
            if (/painting|portrait|landscape|seascape|study|drawing|watercolour|sketch/i.test(title)) return '2D';
            // Default to 2D for Royal Academy
            return '2D';
          };
          
          const allObjects = Array.isArray(data.objects) ? data.objects : [];
          
          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
              id: item.id || `ra-gac-${idx}`,
              name: item.title || item.name || 'Untitled',
              artist: item.artist || 'Unknown',
              year: toYear(item.year),
              date: item.year,
              image: item.image,
              sourceUrl: item.sourceUrl,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              isArchival: isArchival(item.title || ''),
              type: detectType(item.title || ''),
              youtubeId: item.youtubeId,
              mediaType: item.mediaType,
            }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Royal Academy artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Serpentine Gallery Collection: load from local scraped JSON
    if (exhibition.id === 'serp-collection') {
      (async () => {
        try {
          const res = await fetch('/data/serpentine-gallery-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Serpentine artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          
          // Patterns for instructional/documentary materials (not visual artworks)
          const archivalPatterns = [
            /instruction/i,  // matches any "instruction" anywhere
            /do it/i,  // matches any "do it" title anywhere (including zero-width chars)
            /^screenshot/i,
            /^roundtable/i,
            /^recipe /i,
            /^untitled$/i,
            /^untitled \(/i,
            /^visas$/i,
            /report/i,
            /^mental floss/i,
            /^#faismoidanser$/i,
            /^cold$/i,
            /^treatment$/i,
            /^tear crystal$/i,
            /^shoot it$/i,
            /^delighted$/i,
            /^precedent piece$/i,
            /^homage to/i,
            /^xxl color/i,
            /^walk walk walk/i,
            /^three how to/i,
            /^how to /i,
            /^the masque-culotte$/i,
            /^what would/i,
            /^study for time$/i,
            /^dig a hole/i,
            /^to create sympathy/i,
            /^art as a generative/i,
            /^the potential for/i,
            /^potential deeper/i,
            /^deeper understanding/i,
            /^moving towards/i,
            /^consideration of/i,
            /^new connections/i,
            /^sheela \(na-gig\)/i,
            /^it's ok for/i,
            /^gilding the lily/i,
            /variations.*gionales/i,  // Variations régionales (handles Unicode normalization)
            /^park nights$/i,
            /^1993$/i,
            /^99 cents$/i,
            /^a snail walk/i,
            /^wish piece$/i,
            /^placing a dream/i,
            /^ten commandments/i,
            /les.*coliers/i,  // Les Écoliers (The Schoolchildren) - text piece
            /chatelet theatre/i,
            // French instruction texts (use flexible apostrophe matching)
            /^donne quelque/i,
            /^supprime un/i,
            /^changement de/i,
            /oublier l.instant/i,  // Oublier l'instant T
            /partage d.intimit/i,  // Partage d'intimité  
            /^vers new york/i,
            /^copier-coller$/i,
            /^protection au/i,
            /^rayon de soleil/i,
            /mesure$/i,  // À mesure, à mesure
            /^affiner la/i,
            /^cinq et cinq/i,
            // Roundtable/AI report illustrations by Jonny Glover
            /jonny glover/i,
          ];
          
          // Known artist-name-only entries (text/portrait cards) - title equals artist
          const artistNameOnlyTitles = [
            'Mohamed Bourouissa', 'Chino Amobi', 'Phillipe Parreno', 'Hans-Ulrich Obrist',
            'Anna Halprin', 'Simone Forti', 'Oscar Murillo', 'Rirkrit Tiravanija',
            'Christodoulos Panayiotou', 'Rachel Rose', 'Kwame Kwei-Armah', 'Evan Ifekoya',
            'Bertrand Lavier', 'Studio Formafantasma', 'Ian Cheng', 'Heman Chong',
            'Arca', 'ES Devlin', 'Aria Dean', 'David Lamelas', 'Geta Bratescu',
            'Rafael Bonachela', 'Carla Juaçaba', 'Edouard Glissant', 'Kelsey Lu',
            'Latai Taumoepeau', 'Saskia Havekes', 'Gerald Murnane', 'Dale Harding',
            'Megan Cope', 'James Bridle', 'Janet Laurence', 'Shilpa Gupta',
            'Nairy Baghramian', 'Complicité', 'Holly Herndon and Mat Dryhurst', 'BTS',
            'Precious Okoyomon, do it', 'Yue Yuan', 'Sophia Al Maria',
          ];
          
          // Detect text-based instruction pieces by checking artist field too
          const isArchival = (title: string, artist: string) => {
            // Check if title is just an artist name
            if (artistNameOnlyTitles.includes(title)) return true;
            // Check patterns
            for (const pattern of archivalPatterns) {
              if (pattern.test(title)) return true;
            }
            // If title equals artist name, it's likely a text card
            if (title === artist && title.length > 0) return true;
            // Check artist field for Jonny Glover illustrations
            if (/jonny glover/i.test(artist)) return true;
            return false;
          };
          
          // Detect artwork type: Pavilions are 3D, most others are 2D or unknown
          const detectType = (title: string): '2D' | '3D' | 'unknown' => {
            if (/pavilion/i.test(title) || /summer house/i.test(title)) return '3D';
            if (/tower/i.test(title) || /sculpture/i.test(title)) return '3D';
            // Zaha Hadid architectural works
            if (/tektonik/i.test(title) || /isometric/i.test(title)) return '2D';
            if (/earth perspectives/i.test(title)) return '2D';
            // Default to unknown for mixed collections
            return 'unknown';
          };
          
          const allObjects = Array.isArray(data.objects) ? data.objects : [];
          
          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
              id: item.id || `serp-gac-${idx}`,
              name: item.title || item.name || 'Untitled',
              artist: item.artist || 'Unknown',
              year: toYear(item.year),
              date: item.year,
              image: item.image,
              sourceUrl: item.sourceUrl,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              isArchival: isArchival(item.title || '', item.artist || ''),
              type: detectType(item.title || ''),
              youtubeId: item.youtubeId,
              mediaType: item.mediaType,
            }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Serpentine artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Courtauld Gallery Collection: load from local scraped JSON
    if (exhibition.id === 'cg-1') {
      (async () => {
        try {
          const res = await fetch('/data/courtauld-gallery-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Courtauld artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          
          // Detect artwork type for Courtauld (mostly paintings, some decorative arts)
          const detectType = (title: string): '2D' | '3D' | 'unknown' => {
            // 3D objects
            if (/sculpture|bust|figure|statue|chest|bowl|dish|jar|jug|vase|pot|box|table|chair|kettle|burner|tile|bucket/i.test(title)) return '3D';
            // 2D works (paintings, drawings, prints)
            if (/painting|portrait|landscape|view|scene|study|drawing|print|album/i.test(title)) return '2D';
            // Default to 2D for Courtauld (primarily paintings)
            return '2D';
          };
          
          const allObjects = Array.isArray(data.objects) ? data.objects : [];
          
          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
              id: item.id || `cg-gac-${idx}`,
              name: item.title || item.name || 'Untitled',
              artist: item.artist || 'Unknown',
              year: toYear(item.year),
              date: item.year,
              image: item.image,
              sourceUrl: item.sourceUrl,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              type: detectType(item.title || ''),
              youtubeId: item.youtubeId,
              mediaType: item.mediaType,
            }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Courtauld artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Walker Art Gallery Collection: load from local scraped JSON
    if (exhibition.id === 'wag-collection') {
      (async () => {
        try {
          const res = await fetch('/data/walker-art-gallery-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Walker artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          const allObjects = Array.isArray(data.objects) ? data.objects : [];
          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
              id: item.id || `wag-gac-${idx}`,
              name: item.title || item.name || 'Untitled',
              artist: item.artist || 'Unknown',
              year: toYear(item.year),
              date: item.year,
              image: item.image,
              sourceUrl: item.sourceUrl,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              type: '2D',
            }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Walker artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Scottish National Gallery Collection: load from local scraped JSON
    if (exhibition.id === 'sng-collection') {
      (async () => {
        try {
          const res = await fetch('/data/scottish-national-gallery-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Scottish National Gallery artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          const allObjects = Array.isArray(data.objects) ? data.objects : [];
          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
              id: item.id || `sng-gac-${idx}`,
              name: item.title || item.name || 'Untitled',
              artist: item.artist || 'Unknown',
              year: toYear(item.year),
              date: item.year,
              image: item.image,
              sourceUrl: item.sourceUrl,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              type: '2D',
            }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Scottish National Gallery artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Scottish National Portrait Gallery Collection: load from local scraped JSON
    if (exhibition.id === 'snpg-collection') {
      (async () => {
        try {
          const res = await fetch('/data/scottish-national-portrait-gallery-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Scottish National Portrait Gallery artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          const allObjects = Array.isArray(data.objects) ? data.objects : [];
          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
              id: item.id || `snpg-gac-${idx}`,
              name: item.title || item.name || 'Untitled',
              artist: item.artist || 'Unknown',
              year: toYear(item.year),
              date: item.year,
              image: item.image,
              sourceUrl: item.sourceUrl,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              type: '2D',
            }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Scottish National Portrait Gallery artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Scottish National Gallery of Modern Art Collection: load from local scraped JSON
    if (exhibition.id === 'sngma-collection') {
      (async () => {
        try {
          const res = await fetch('/data/scottish-national-gallery-of-modern-art-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Scottish National Gallery of Modern Art artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          const allObjects = Array.isArray(data.objects) ? data.objects : [];
          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
              id: item.id || `sngma-gac-${idx}`,
              name: item.title || item.name || 'Untitled',
              artist: item.artist || 'Unknown',
              year: toYear(item.year),
              date: item.year,
              image: item.image,
              sourceUrl: item.sourceUrl,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              type: '2D',
            }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Scottish National Gallery of Modern Art artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // British Museum Collection: load from local scraped JSON
    if (exhibition.id === 'bm-collection') {
      (async () => {
        try {
          const res = await fetch('/data/the-british-museum-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load British Museum artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          
          const allObjects = Array.isArray(data.objects) ? data.objects : [];
          
          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
              id: item.id || `bm-gac-${idx}`,
              name: item.title || item.name || 'Untitled',
              artist: item.artist === 'Additional Items' ? 'Unknown' : (item.artist || 'Unknown'),
              year: toYear(item.year),
              date: item.year,
              image: item.image,
              sourceUrl: item.sourceUrl,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              type: item.type || 'unknown',  // 2D, 3D, or unknown
            }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load British Museum artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Musée d'Orsay Collection: load from local scraped JSON
    if (exhibition.id === 'orsay-collection') {
      (async () => {
        try {
          const res = await fetch('/data/orsay-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Orsay artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          
          const allObjects = Array.isArray(data.objects) ? data.objects : [];
          
          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
              id: item.id || `orsay-${idx}`,
              name: item.title || item.name || 'Untitled',
              artist: item.artist || 'Unknown',
              year: toYear(item.year),
              date: item.year,
              image: item.image,
              dimension: item.dimensions,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
            }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Orsay artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Musée de l'Orangerie Collection: load from local scraped JSON
    if (exhibition.id === 'orangerie-collection') {
      (async () => {
        try {
          const res = await fetch('/data/orangerie-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Orangerie artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          
          const allObjects = Array.isArray(data.objects) ? data.objects : [];
          
          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
              id: item.id || `orangerie-${idx}`,
              name: item.title || item.name || 'Untitled',
              artist: item.artist || 'Unknown',
              year: toYear(item.year),
              date: item.year,
              image: item.image,
              dimension: item.dimensions,
              type: item.type || 'unknown',
              isArchival: item.isArchival || false,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
            }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Orangerie artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Pinault Collection: load from local scraped JSON
    if (exhibition.id === 'pinault-collection') {
      (async () => {
        try {
          const res = await fetch('/data/pinault-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Pinault artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          
          const allObjects = Array.isArray(data.objects) ? data.objects : [];
          
          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
              id: item.id || `pinault-${idx}`,
              name: item.title || item.name || 'Untitled',
              artist: item.artist || 'Unknown',
              year: toYear(item.year),
              date: item.year,
              image: item.image,
              dimension: item.dimensions,
              type: item.type || 'unknown',
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
            }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Pinault artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Centre Pompidou & MAM Paris & Louvre & Jacquemart-André & Marmottan & Picasso & Palais de Tokyo & Petit Palais & Rouen & Lille & MAMCS Collections: load from local scraped JSON
    if (exhibition.id === 'pompidou-cinema' || exhibition.id === 'pompidou-painting' || exhibition.id === 'pompidou-drawing' || exhibition.id === 'pompidou-newmedia' || exhibition.id === 'pompidou-design' || exhibition.id === 'mam-perm-painting' || exhibition.id === 'mam-perm-photography' || exhibition.id === 'louvre-painting' || exhibition.id === 'jacquemart-collection' || exhibition.id === 'marmottan-collection' || exhibition.id === 'picasso-drawings' || exhibition.id === 'picasso-paintings' || exhibition.id === 'picasso-sculptures' || exhibition.id === 'picasso-prints' || exhibition.id === 'palais-de-tokyo-collection' || exhibition.id === 'petit-palais-collection' || exhibition.id === 'rouen-mba-collection' || exhibition.id === 'lille-pba-collection' || exhibition.id === 'mamcs-drawings' || exhibition.id === 'mamcs-paintings' || exhibition.id === 'mamcs-photography' || exhibition.id === 'mamcs-graphic-design') {
      const jsonFiles: Record<string, string> = {
        'pompidou-cinema': '/data/pompidou-cinema-collection.json',
        'pompidou-painting': '/data/pompidou-painting-collection.json',
        'pompidou-drawing': '/data/pompidou-drawing-collection.json',
        'pompidou-newmedia': '/data/pompidou-newmedia-collection.json',
        'pompidou-design': '/data/pompidou-design-collection.json',
        'mam-perm-painting': '/data/mam-painting-collection.json',
        'mam-perm-photography': '/data/mam-photography-collection.json',
        'louvre-painting': '/data/louvre-painting-collection.json',
        'jacquemart-collection': '/data/jacquemart-andre-collection.json',
        'marmottan-collection': '/data/marmottan-collection.json',
        'picasso-drawings': '/data/picasso-drawings-collection.json',
        'picasso-paintings': '/data/picasso-paintings-collection.json',
        'picasso-sculptures': '/data/picasso-sculptures-collection.json',
        'picasso-prints': '/data/picasso-prints-collection.json',
        'palais-de-tokyo-collection': '/data/palais-de-tokyo-collection.json',
        'petit-palais-collection': '/data/petit-palais-collection.json',
        'rouen-mba-collection': '/data/rouen-mba.json',
        'lille-pba-collection': '/data/lille-pba.json',
        'mamcs-drawings': '/data/mamcs-strasbourg-drawings-collection.json',
        'mamcs-paintings': '/data/mamcs-strasbourg-paintings-collection.json',
        'mamcs-photography': '/data/mamcs-strasbourg-photography-collection.json',
        'mamcs-graphic-design': '/data/mamcs-strasbourg-graphic-design-collection.json'
      };
      const jsonFile = jsonFiles[exhibition.id];
      (async () => {
        try {
          const res = await fetch(jsonFile, { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          
          // Handle different JSON structures: array (Rouen/Lille/MAMCS) vs object with artworks/objects
          const isArrayFormat = Array.isArray(data);
          const allObjects = isArrayFormat ? data : (Array.isArray(data.artworks) ? data.artworks : (Array.isArray(data.objects) ? data.objects : []));
          const is2D = exhibition.id === 'pompidou-painting' || exhibition.id === 'pompidou-drawing' || exhibition.id === 'pompidou-design' || exhibition.id === 'mam-perm-painting' || exhibition.id === 'mam-perm-photography' || exhibition.id === 'louvre-painting' || exhibition.id === 'jacquemart-collection' || exhibition.id === 'marmottan-collection' || exhibition.id === 'picasso-drawings' || exhibition.id === 'picasso-paintings' || exhibition.id === 'picasso-prints' || exhibition.id === 'palais-de-tokyo-collection' || exhibition.id === 'petit-palais-collection' || exhibition.id === 'rouen-mba-collection' || exhibition.id === 'lille-pba-collection' || exhibition.id.startsWith('mamcs-');
          const is3D = exhibition.id === 'picasso-sculptures';
          
          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
              id: item.id || `${exhibition.id}-${idx}`,
              name: item.title || item.name || 'Untitled',
              artist: item.artist || item.artistName || 'Unknown',
              year: toYear(item.year),
              date: item.year,
              image: item.image || item.imageUrl,  // Support both image and imageUrl fields
              dimension: item.dimensions,
              duration: item.duration,  // Video/film duration
              medium: item.medium,
              type: is2D ? (item.type || '2D') : (is3D ? (item.type || '3D') : (item.type || 'video')),
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
            }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // MEP Photography Collection: load from local scraped JSON
    if (exhibition.id === 'mep-photography') {
      (async () => {
        try {
          const res = await fetch('/data/mep-photography-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load MEP artworks');
          const data = await res.json();
          const allObjects = Array.isArray(data.objects) ? data.objects : [];
          const list: Artwork[] = allObjects.map((item: any, idx: number) => {
            // 년도 범위인 경우 끝 년도만 사용 (1958-1960 → 1960)
            let yearStr = item.year || '';
            if (yearStr.includes('-')) {
              const parts = yearStr.split('-');
              yearStr = parts[parts.length - 1];
            }
            return {
              id: item.id || `mep-${idx}`,
              name: item.title || item.name || 'Untitled',
              artist: item.artist || 'Unknown',
              year: yearStr,
              date: yearStr,
              image: item.image,
              type: item.video ? 'video' : '2D',
              video: item.video || null,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
            };
          });
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load MEP artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Special case for V&A Painting collection: load from local JSON
    if (exhibition.id === 'vam-painting') {
      (async () => {
        try {
          const res = await fetch('/data/vam-paintings.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load local artworks');
          const data = await res.json();
          const list = (data.items || []).map((item: any) => ({
            id: item.id,
            name: item.name,
            artist: item.artist,
            year: item.year,
            image: item.image,
            roomId: "default",
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
          }));
          setArtworks(list);
          setInitialized(true);
        } catch (e) {
          console.error('Failed to load V&A paintings:', e);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Special case for V&A Posters collection: load from local JSON
    if (exhibition.id === 'vam-posters') {
      (async () => {
        try {
          const res = await fetch('/data/vam-posters.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load local posters');
          const data = await res.json();
          const list = (data.items || []).map((item: any) => ({
            id: item.id,
            name: item.name,
            artist: item.artist,
            year: item.year,
            image: item.image,
            roomId: "default",
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
          }));
          setArtworks(list);
          setInitialized(true);
        } catch (e) {
          console.error('Failed to load V&A posters:', e);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Special case for V&A Photographs collection: load from local JSON
    if (exhibition.id === 'vam-photographs') {
      (async () => {
        try {
          const res = await fetch('/data/vam-photographs.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load local photographs');
          const data = await res.json();
          const list = (data.items || []).map((item: any) => ({
            id: item.id,
            name: item.name,
            artist: item.artist,
            year: item.year,
            image: item.image,
            roomId: "default",
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
          }));
          setArtworks(list);
          setInitialized(true);
        } catch (e) {
          console.error('Failed to load V&A photographs:', e);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Special case for V&A Portraits collection: load from local JSON
    if (exhibition.id === 'vam-portraits') {
      (async () => {
        try {
          const res = await fetch('/data/vam-portraits.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load local portraits');
          const data = await res.json();
          const list = (data.items || []).map((item: any) => ({
            id: item.id,
            name: item.name,
            artist: item.artist,
            year: item.year,
            image: item.image,
            roomId: "default",
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
          }));
          setArtworks(list);
          setInitialized(true);
        } catch (e) {
          console.error('Failed to load V&A portraits:', e);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // National Gallery Permanent Collection: load from local JSON
    if (exhibition.id === 'ng-1') {
      (async () => {
        try {
          const res = await fetch('/data/national-gallery-permanent.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load National Gallery data');
          const data = await res.json();
          const list = (data.items || []).map((item: any) => ({
            id: item.id,
            name: item.name,
            artist: item.artist,
            year: item.year,
            image: item.image,
            roomId: item.roomId || "default",
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            url: item.url
          }));
          setArtworks(list);
          setInitialized(true);
        } catch (e) {
          console.error('Failed to load National Gallery data:', e);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Tate Britain Display exhibitions: load rooms and artworks from tate-britain.json
    if (exhibition.id.startsWith('tate-britain-display-')) {
      (async () => {
        try {
          const res = await fetch('/data/tate-britain.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Missing tate-britain.json');
          const data = await res.json();
          const items = Array.isArray(data.items) ? data.items : [];
          const displayExhibition = items.find((item: any) => item.id === exhibition.id);
          
          if (displayExhibition && Array.isArray(displayExhibition.rooms)) {
            const list: Artwork[] = [];
            const metas: RoomMeta[] = [];
            // Use sequential room numbers (1, 2, 3...) instead of actual building room numbers
            displayExhibition.rooms.forEach((room: any, roomIndex: number) => {
              const roomId = String(roomIndex + 1); // 1-based sequential numbering
              const hasArtworks = Array.isArray(room.artworks) && room.artworks.length > 0;
              
              // Store room metadata (including rooms without artworks)
              metas.push({
                id: roomId,
                name: room.name || `Room ${roomId}`,
                coverImage: room.coverImage,
                description: room.description,
                location: room.location,
                url: room.url,
                hasArtworks,
              });
              
              // Check if cover image represents the same artwork as any in the room
              // Compare by title (normalized) since cover and artwork may have different image URLs
              const coverTitle = room.coverTitle || '';
              const normalizedCoverTitle = coverTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
              const isDuplicateCover = room.coverImage && hasArtworks && 
                room.artworks.some((a: any) => {
                  const artworkTitle = (a.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                  return artworkTitle && normalizedCoverTitle && artworkTitle === normalizedCoverTitle;
                });
              
              // Add coverImage as the first artwork of each room (room intro/cover)
              // Only add if it's not a duplicate of an existing artwork
              if (room.coverImage && !isDuplicateCover) {
                const coverId = `room-cover-${roomId}-${list.length}`;
                // Use coverArtist/coverTitle/coverYear if available, otherwise fallback to room info
                const coverTitleFinal = room.coverTitle || room.name || `Room ${roomId}`;
                const coverArtist = room.coverArtist || room.location || 'Tate Britain';
                const coverYear = room.coverYear || 0;
                list.push({
                  id: coverId,
                  name: coverTitleFinal,
                  artist: coverArtist,
                  year: coverYear,
                  date: coverYear ? String(coverYear) : '',
                  image: room.coverImage,
                  roomId: roomId,
                  exhibitionName: exhibition.name,
                  exhibitionTitle: exhibition.title,
                  sourceUrl: room.url,
                });
              }
              
              if (hasArtworks) {
                for (const artwork of room.artworks) {
                  // Extract Tate work ID from URL
                  const urlMatch = artwork.url?.match(/([a-z]\d+)$/);
                  const tateId = urlMatch ? urlMatch[1] : null;
                  
                  // Use image from JSON, or build from ID as fallback
                  let imageUrl = artwork.image || '';
                  if (!imageUrl && tateId) {
                    const idUpper = tateId.toUpperCase();
                    const prefix = idUpper.charAt(0);
                    const midPart = idUpper.substring(0, 3);
                    imageUrl = `https://media.tate.org.uk/art/images/work/${prefix}/${midPart}/${idUpper}_9.jpg`;
                  }
                  
                  // Get year directly from JSON, or parse from year string if needed
                  let year = 0;
                  if (typeof artwork.year === 'number') {
                    year = artwork.year;
                  } else if (typeof artwork.year === 'string') {
                    const yearMatch = artwork.year.match(/\d{4}/);
                    year = yearMatch ? parseInt(yearMatch[0], 10) : 0;
                  }
                  
                  // Use roomId + list index to ensure completely unique IDs
                  const uniqueId = `${tateId || 'artwork'}-room${roomId}-${list.length}`;
                  list.push({
                    id: uniqueId,
                    name: artwork.title || 'Untitled',
                    artist: artwork.artist || '',
                    year: year,
                    date: artwork.year ? String(artwork.year) : '',
                    image: imageUrl,
                    roomId: roomId,
                    exhibitionName: exhibition.name,
                    exhibitionTitle: exhibition.title,
                    sourceUrl: artwork.url,
                  });
                }
              }
            });
            setRoomMetas(metas);
            setArtworks(list);
            setInitialized(true);
          } else {
            console.error('Display exhibition not found:', exhibition.id);
            setInitialized(true);
          }
        } catch (e) {
          console.error('Failed to load Tate Britain display:', e);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Tate Modern Display exhibitions: load rooms and artworks from tate-modern.json
    if (exhibition.id.startsWith('display-')) {
      (async () => {
        try {
          const res = await fetch('/data/tate-modern.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Missing tate-modern.json');
          const data = await res.json();
          const items = Array.isArray(data.items) ? data.items : [];
          const displayExhibition = items.find((item: any) => item.id === exhibition.id);
          
          if (displayExhibition && Array.isArray(displayExhibition.rooms)) {
            // Save enriched exhibition data (including descriptionHtml)
            setEnrichedExhibition(displayExhibition);
            const list: Artwork[] = [];
            const metas: RoomMeta[] = [];
            
            displayExhibition.rooms.forEach((room: any, roomIndex: number) => {
              const roomId = String(roomIndex + 1);
              const hasArtworks = Array.isArray(room.artworks) && room.artworks.length > 0;
              
              metas.push({
                id: roomId,
                name: room.name || `Room ${roomId}`,
                coverImage: room.coverImage,
                description: room.description,
                location: room.location,
                url: room.url,
                hasArtworks,
              });
              
              if (hasArtworks) {
                for (const artwork of room.artworks) {
                  const urlMatch = artwork.url?.match(/([a-z]\d+)$/i);
                  const tateId = urlMatch ? urlMatch[1] : null;
                  
                  let imageUrl = artwork.image || '';
                  if (!imageUrl && tateId) {
                    const idUpper = tateId.toUpperCase();
                    const prefix = idUpper.charAt(0);
                    const midPart = idUpper.substring(0, 3);
                    imageUrl = `https://media.tate.org.uk/art/images/work/${prefix}/${midPart}/${idUpper}_9.jpg`;
                  }
                  
                  let year = 0;
                  if (typeof artwork.year === 'number') {
                    year = artwork.year;
                  } else if (typeof artwork.year === 'string') {
                    const yearMatch = artwork.year.match(/\d{4}/);
                    year = yearMatch ? parseInt(yearMatch[0], 10) : 0;
                  }
                  
                  const uniqueId = `${tateId || artwork.id || 'artwork'}-room${roomId}-${list.length}`;
                  list.push({
                    id: uniqueId,
                    name: artwork.title || 'Untitled',
                    artist: artwork.artist || '',
                    year: year,
                    date: artwork.year ? String(artwork.year) : '',
                    image: imageUrl,
                    roomId: roomId,
                    exhibitionName: exhibition.name,
                    exhibitionTitle: exhibition.title,
                    sourceUrl: artwork.url,
                  });
                }
              }
            });
            setRoomMetas(metas);
            setArtworks(list);
            setInitialized(true);
          } else {
            console.error('Tate Modern display exhibition not found:', exhibition.id);
            setInitialized(true);
          }
        } catch (e) {
          console.error('Failed to load Tate Modern display:', e);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Temporary exhibitions with artworks array: use directly with proper metadata
    // Per Archive Rule 11 & 12: artworks need name, artist, year, image
    if (Array.isArray((exhibition as any).artworks) && (exhibition as any).artworks.length > 0) {
      const exhibitionArtworks = (exhibition as any).artworks as { id: string; name: string; artist: string; year: number; image: string }[];
      const list: Artwork[] = exhibitionArtworks.map((art) => ({
        id: art.id,
        name: art.name,
        artist: art.artist,
        year: art.year,
        image: art.image,
        roomId: 'gallery',
        exhibitionName: exhibition.name,
        exhibitionTitle: exhibition.title,
      }));
      setArtworks(list);
      setInitialized(true);
      return () => { };
    }
    // Fallback: Temporary exhibitions with galleryImages (legacy support)
    if (Array.isArray((exhibition as any).galleryImages) && (exhibition as any).galleryImages.length > 0) {
      const galleryImages = (exhibition as any).galleryImages as string[];
      const exhibitionName = exhibition.name || exhibition.title || 'Exhibition';
      const list: Artwork[] = galleryImages.map((imgUrl, idx) => {
        const filename = imgUrl.split('/').pop() || '';
        const nameFromFile = filename
          .replace(/\.(jpg|jpeg|png|webp|gif)$/i, '')
          .replace(/\.[a-z0-9]+\.(fill|width)-\d+x?\d*/i, '')
          .replace(/_/g, ' ')
          .replace(/-/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        return {
          id: `gallery-${exhibition.id}-${idx}`,
          name: nameFromFile || `${exhibitionName} - Image ${idx + 1}`,
          artist: (exhibition as any).artist || exhibitionName,
          year: 0,
          image: imgUrl,
          roomId: 'gallery',
          exhibitionName: exhibition.name,
          exhibitionTitle: exhibition.title,
        };
      });
      setArtworks(list);
      setInitialized(true);
      return () => { };
    }
    // 0) Prime from local cache immediately to avoid empty-state flash
    try {
      const cached = localStorage.getItem(`artworks_${exhibition.id}`);
      if (cached) {
        const cachedList = JSON.parse(cached) as Artwork[];
        const withImages = cachedList.filter(a => !!a.image);
        if (withImages.length > 0) {
          setArtworks(withImages);
          setInitialized(true);
        }
      }
    } catch { }
    // Subscribe to Firestore artworks for this exhibition
    const q = query(collection(db, "artworks"), where("exhibitionTitle", "==", exhibition.title));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Artwork[] = [];
        snap.forEach((ds) => {
          const data = ds.data() as Artwork;
          // Ensure stable id exists; fall back to Firestore doc.id if missing
          const id = (data as any)?.id ? String((data as any).id) : ds.id;
          list.push({ ...data, id });
        });
        // Server truth: set directly from snapshot to avoid duplicates
        const withImages = list.filter(a => !!a.image);
        setArtworks(withImages);
        setInitialized(true);
        try {
          localStorage.setItem(`artworks_${exhibition.id}`, JSON.stringify(withImages));
        } catch { }
      },
      (error) => {
        console.error("Firestore onSnapshot error:", error);
        // Fallback to localStorage cache if available
        const cached = localStorage.getItem(`artworks_${exhibition.id}`);
        if (cached) {
          try {
            const cachedList = JSON.parse(cached) as Artwork[];
            setArtworks(cachedList.filter(a => !!a.image));
            setInitialized(true);
          } catch { setInitialized(true); }
        } else {
          setInitialized(true);
        }
      }
    );
    return () => {
      unsub();
    };
  }, [exhibition.id, exhibition.title]);

  // Load user-submitted artworks from exhibition_artworks collection
  useEffect(() => {
    const exhibitionId = exhibition.id;

    // Query exhibition_artworks where exhibitionId matches
    const q = query(
      collection(db, 'exhibition_artworks'),
      where('exhibitionId', '==', exhibitionId)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) return;

      const userSubmissions: Artwork[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        userSubmissions.push({
          id: data.id || docSnap.id,
          name: data.name || data.title || 'User Submission',
          artist: data.artist || '',
          year: data.year || 0,
          image: data.image || '',
          dimensions: data.dimensions || '',
          materials: data.materials || '',
          roomId: 'user-submissions', // Default room for user submissions
          exhibitionName: data.exhibitionName || exhibition.name || '',
          exhibitionTitle: data.exhibitionName || exhibition.title || '',
        } as Artwork);
      });

      if (userSubmissions.length > 0) {
        setArtworks((prev) => {
          // Avoid duplicates by checking IDs
          const existingIds = new Set(prev.map(a => a.id));
          const newOnes = userSubmissions.filter(s => !existingIds.has(s.id));
          if (newOnes.length === 0) return prev;
          return [...prev, ...newOnes];
        });
      }
    }, (err) => {
      console.warn('Failed to load user submissions:', err);
    });

    return () => unsub();
  }, [exhibition.id, exhibition.name, exhibition.title]);

  // Ensure selected index is valid when artworks update
  useEffect(() => {
    if (filteredArtworks.length === 0) { setSelectedIndex(0); return; }
    setSelectedIndex((prev) => Math.min(prev, filteredArtworks.length - 1));
  }, [filteredArtworks.length]);

  // Prefetch neighbor images for smoother stage switching
  usePrefetchNeighbors(filteredArtworks as any[], selectedIndex, 1);


  useEffect(() => {
    if (typeof window === 'undefined') return;
    const supportsIdle = typeof (window as any).requestIdleCallback === 'function';
    const schedule: (cb: () => void) => number = supportsIdle
      ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 800 })
      : (cb) => window.setTimeout(cb, 200);
    const cancel: (handle: number) => void = typeof (window as any).cancelIdleCallback === 'function'
      ? (handle) => (window as any).cancelIdleCallback(handle)
      : (handle) => window.clearTimeout(handle);

    idleDecodeHandlesRef.current.forEach(cancel);
    idleDecodeHandlesRef.current = [];

    const neighbors = [selectedIndex - 1, selectedIndex + 1];
    const seen = new Set<string>();
    neighbors.forEach((idx) => {
      if (idx < 0 || idx >= filteredArtworks.length) return;
      const url = filteredArtworks[idx]?.image;
      if (!url || seen.has(url)) return;
      seen.add(url);
      const handle = schedule(() => {
        try {
          const preload = new Image();
          preload.decoding = 'async';
          preload.loading = 'eager';
          preload.src = url;
          if (preload.decode) preload.decode().catch(() => { });
        } catch { }
      });
      idleDecodeHandlesRef.current.push(handle);
    });

    return () => {
      idleDecodeHandlesRef.current.forEach(cancel);
      idleDecodeHandlesRef.current = [];
    };
  }, [filteredArtworks, selectedIndex]);

  // Static columns; no DOM measurement needed

  // Meta row height locked; skip dynamic measurement to avoid jitter

  // Fix top bar height (stabilize baseline for meta/description Y calculations)
  useEffect(() => {
    const measureTopBar = () => {
      // Fix the top bar height so metadata can move up; description is absolute and won't be clipped
      setTopBarHeight(36);
    };
    const id = window.setTimeout(measureTopBar, 0);
    window.addEventListener('resize', measureTopBar);
    return () => {
      clearTimeout(id);
      window.removeEventListener('resize', measureTopBar);
    };
  }, [exhibition.title, exhibition.description, selectedIndex, metaPos]);

  // Description alignment simplified: using fixed left-top placement instead of dynamic computation.

  // Vertical alignment handled by static top values to match Archive line

  // No visible spacers; we'll clamp selection to first/last at extremes

  // Hover-based auto-scroll (marquee) for long titles: ping-pong left/right while hovered
  const startTitleAutoScroll = () => {
    const el = titleScrollRef.current;
    if (!el) return;
    const inner = el.firstElementChild as HTMLElement | null;
    if (!inner) return;
    const max = inner.scrollWidth - el.clientWidth;
    if (max <= 0) return;
    if (titleRafRef.current) cancelAnimationFrame(titleRafRef.current);
    titleDirRef.current = 1;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(40, now - last); // cap dt for large frames
      last = now;
      const speedPxPerMs = 0.05; // ~50px/sec
      const delta = titleDirRef.current * speedPxPerMs * dt;
      el.scrollLeft = Math.max(0, Math.min(max, el.scrollLeft + delta));
      if (el.scrollLeft >= max - 0.5) {
        titleDirRef.current = -1;
      } else if (el.scrollLeft <= 0.5) {
        titleDirRef.current = 1;
      }
      titleRafRef.current = requestAnimationFrame(step);
    };
    titleRafRef.current = requestAnimationFrame(step);
  };

  const stopTitleAutoScroll = (reset = true) => {
    if (titleRafRef.current) {
      cancelAnimationFrame(titleRafRef.current);
      titleRafRef.current = null;
    }
    const el = titleScrollRef.current;
    if (el && reset) el.scrollLeft = 0;
  };

  // Optional seeding: add placeholder images for a specific exhibition if empty
  useEffect(() => {
    const title = exhibition.title?.trim();
    if (!title || seededRef.current) return;
    const storageKey = `seeded_${exhibition.id}`;
    if (localStorage.getItem(storageKey)) { seededRef.current = true; return; }
    if (title === "Korean Classical Art Collection" && artworks.length === 0) {
      (async () => {
        try {
          seededRef.current = true;
          const ids = [1011, 1025, 1035, 1043, 1050, 1067, 1074, 1084, 109, 110];
          const now = Date.now();
          const batch = ids.map((pid, i) => {
            const artId = `seed-${now}-${i}`;
            const docData = {
              id: artId,
              name: `Seed Image ${i + 1}`,
              artist: "Unknown",
              year: 0,
              image: `https://picsum.photos/id/${pid}/1200/900`,
              roomId: "default",
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
            } as Artwork;
            return addDoc(collection(db, "artworks"), docData);
          });
          await Promise.all(batch);
          localStorage.setItem(storageKey, "1");
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("Seeding failed:", e);
        }
      })();
    }
  }, [artworks.length, exhibition.id, exhibition.name, exhibition.title]);

  // Reseed helper via URL param for Korean Classical Art Collection: ?seed=unsplash20 | picsum20
  useEffect(() => {
    const title = exhibition.title?.trim();
    if (!title) return;
    const params = new URLSearchParams(window.location.search);
    const seedMode = params.get("seed");
    if (!seedMode) return;
    if (title !== "Korean Classical Art Collection") return;
    if (didReseedRef.current) return; // prevent re-run (StrictMode/HMR)
    didReseedRef.current = true;

    (async () => {
      try {
        // 1) Delete existing artworks
        const qDel = query(collection(db, "artworks"), where("exhibitionTitle", "==", exhibition.title));
        const snap = await getDocs(qDel);
        const delJobs: Promise<void>[] = [];
        snap.forEach((ds) => delJobs.push(deleteDoc(doc(db, "artworks", ds.id))));
        await Promise.all(delJobs);

        // 2) Add 20 new images (Unsplash source or Picsum)
        const now = Date.now();
        const count = 20;
        const useUnsplash = seedMode === "unsplash20";
        const keywords = "art,antique,artifact,exhibition,museum,asian";
        const jobs: Promise<any>[] = [];
        for (let i = 0; i < count; i++) {
          const artId = `seed-${now}-${i}`;
          const image = useUnsplash
            ? `https://source.unsplash.com/1200x900/?${keywords}&sig=${now + i}`
            : `https://picsum.photos/seed/${now + i}/1200/900`;
          const docData = {
            id: artId,
            name: `Random ${i + 1}`,
            artist: "Random",
            year: 0,
            image,
            roomId: "default",
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
          } as Artwork;
          jobs.push(addDoc(collection(db, "artworks"), docData));
        }
        await Promise.all(jobs);
        // eslint-disable-next-line no-console
        console.info(`[seed] Replaced with ${count} images via ${useUnsplash ? "Unsplash" : "Picsum"}.`);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Reseed failed:", e);
      }
    })();
  }, [exhibition.name, exhibition.title]);

  // Viewer mode only; editing/upload removed

  const current = filteredArtworks[selectedIndex];
  
  // Archive mode: reset video when current artwork changes (force remount for animation)
  useEffect(() => {
    if (current?.youtubeId) {
      // iframe 바로 마운트, 썸네일은 보여줌
      setArchiveVideoReady(true);
      setArchiveThumbnailHidden(false);
      // 1초 후 썸네일 디졸브 시작
      const timer = setTimeout(() => {
        setArchiveThumbnailHidden(true);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      setArchiveVideoReady(false);
      setArchiveThumbnailHidden(false);
    }
  }, [current?.id, current?.youtubeId]);
  
  // Gallery mode: delay before showing YouTube iframe on hover
  useEffect(() => {
    if (hoveredIndex !== null) {
      const artwork = filteredArtworks[hoveredIndex];
      if (artwork?.youtubeId) {
        // iframe 바로 마운트, 썸네일은 보여줌
        setGalleryVideoReadyIdx(hoveredIndex);
        setGalleryThumbnailHiddenIdx(null);
        // 1초 후 썸네일 디졸브 시작
        const timer = setTimeout(() => {
          setGalleryThumbnailHiddenIdx(hoveredIndex);
        }, 1000);
        return () => clearTimeout(timer);
      }
    } else {
      setGalleryVideoReadyIdx(null);
      setGalleryThumbnailHiddenIdx(null);
    }
  }, [hoveredIndex, filteredArtworks]);
  
  const displayArtwork = useMemo(() => {
    if (viewMode === 'gallery') {
      if (hoveredIndex !== null && filteredArtworks[hoveredIndex]) {
        return filteredArtworks[hoveredIndex];
      }
      // No hover in gallery: show placeholders (—) by returning null
      return null as unknown as Artwork | null;
    }
    return current;
  }, [viewMode, hoveredIndex, current, filteredArtworks]);

  // Open lightbox with simple scale/translate animation
  const openLightbox = (e: React.MouseEvent<HTMLImageElement, MouseEvent>, artwork: Artwork) => {
    const img = e.currentTarget;
    if (!img || !artwork) return;
    const best = getBestFullUrl(artwork);
    const rect = img.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxW = vw * 0.96;
    const maxH = vh * 0.96;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const thumbAspect = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 4 / 3;
    const UPSCALE = 2.2; // increase upscale to make zoom-in more pronounced

    // Preload to get natural dimensions and cap target appropriately
    const probe = new Image();
    probe.decoding = 'async';
    probe.src = best.url;
    const finalize = (natW?: number, natH?: number) => {
      const aspect = natW && natH && natW > 0 && natH > 0 ? natW / natH : thumbAspect;
      // Allowed display caps: permit modest upscale to make zoom noticeable
      const capWByNat = natW ? (natW / dpr) * UPSCALE : (best.width ? (best.width / dpr) * UPSCALE : Number.POSITIVE_INFINITY);
      const capHByNat = natH ? (natH / dpr) * UPSCALE : Number.POSITIVE_INFINITY;
      // Start from width cap
      let targetW = Math.min(maxW, capWByNat);
      let targetH = targetW / aspect;
      // Respect viewport height and natural height cap
      const heightCap = Math.min(maxH, capHByNat);
      if (targetH > heightCap) {
        targetH = heightCap;
        targetW = targetH * aspect;
      }
      // Re-check width against maxW
      if (targetW > maxW) {
        targetW = maxW;
        targetH = targetW / aspect;
      }
      const targetLeft = Math.round((vw - targetW) / 2);
      const targetTop = Math.round((vh - targetH) / 2);
      setLightbox({
        artwork,
        start: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        target: { left: targetLeft, top: targetTop, width: targetW, height: targetH },
        animate: false,
        natWidth: natW,
        natHeight: natH,
      });
      requestAnimationFrame(() => setLightbox((s) => (s ? { ...s, animate: true } : s)));
    };
    probe.onload = () => finalize(probe.naturalWidth || undefined, probe.naturalHeight || undefined);
    probe.onerror = () => finalize(undefined, undefined);
  };

  const closeLightbox = () => {
    setLightbox((s) => (s ? { ...s, animate: false } : s));
    window.setTimeout(() => setLightbox(null), 300);
  };

  // ESC to close lightbox
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') closeLightbox(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);
  // Debug outlines disabled
  const DEBUG_LAYOUT = false;

  // Sync selected index from scroll - now handled inline in JSX onScroll
  // (Removed duplicate useEffect to avoid conflicts)

  // Scroll to middle section when entering archive mode (for infinite loop)
  useEffect(() => {
    if (viewMode !== 'archive') return;
    const el = listRef.current;
    if (!el || filteredArtworks.length === 0) return;

    // For 3x duplication: start in the middle section
    const ITEM_HEIGHT = 120;
    const total = filteredArtworks.length;
    const middleSectionStart = total * ITEM_HEIGHT; // Start of middle copy
    const targetScroll = middleSectionStart + selectedIndex * ITEM_HEIGHT;
    
    // Set scroll position to middle section
    el.scrollTop = targetScroll;
  }, [viewMode]); // Run once on enter archive

  // Momentum scrolling setup (Archive only)
  // ... (Removed redundant effects if combined, but keep momentum separate if cleaner)

  // Route wheel events from the panel to the momentum scroller (archive mode only)
  useEffect(() => {
    if (viewMode !== 'archive') return; // disable in gallery mode so grid scrolls naturally
    const panel = panelRef.current;
    const scroller = listRef.current;
    if (!panel || !scroller || filteredArtworks.length === 0) return;
    const onWheel = (e: WheelEvent) => {
      if (!scroller) return;
      // If the wheel originated inside the scroller, let native scroll handle it
      if (scroller.contains(e.target as Node)) return;
      // Otherwise, route the wheel delta to the scroller to drive image navigation
      e.preventDefault();
      if (applyMomentumRef.current) {
        applyMomentumRef.current(e.deltaY);
      } else {
        scroller.scrollBy({ top: e.deltaY, behavior: 'auto' });
      }
    };
    panel.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      panel.removeEventListener('wheel', onWheel as any);
    };
  }, [filteredArtworks.length, selectedRoomId, viewMode]);

  // Apply inertia/momentum scrolling to the scroller itself (archive mode only)
  useEffect(() => {
    if (viewMode !== 'archive') return; // disable in gallery mode
    const el = listRef.current;
    if (!el || filteredArtworks.length === 0) return;
    const m = momentumRef.current;
    
    // Natural physics: no artificial acceleration, just friction decay
    const MAX_VEL = 35; // Max velocity (lower = slower)
    const GAIN = 0.15; // Response to wheel delta (lower = slower)
    const FRICTION = 0.93; // Smooth exponential decay
    const STOP_THRESHOLD = 0.4; // Stop when velocity is negligible

    const step = () => {
      // Apply friction (exponential decay like real physics)
      m.vel *= FRICTION;

      // Stop when velocity is very small
      if (Math.abs(m.vel) < STOP_THRESHOLD) {
        m.vel = 0;
        m.raf = 0;
        return;
      }
      
      const newScrollTop = el.scrollTop + m.vel;
      const maxScroll = el.scrollHeight - el.clientHeight;
      
      // Clamp to boundaries (no infinite loop for now)
      el.scrollTop = Math.max(0, Math.min(maxScroll, newScrollTop));
      
      m.raf = requestAnimationFrame(step);
    };

    const addVelocity = (delta: number) => {
      // Add velocity proportional to wheel input, clamped to max
      const newVel = m.vel + delta * GAIN;
      m.vel = Math.max(-MAX_VEL, Math.min(MAX_VEL, newVel));
      
      // Start animation if not running
      if (!m.raf) m.raf = requestAnimationFrame(step);
    };
    applyMomentumRef.current = addVelocity;

    const onWheel = (e: WheelEvent) => {
      // Prevent default scroll and handle via momentum logic
      e.preventDefault();
      addVelocity(e.deltaY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel as any);
      if (m.raf) cancelAnimationFrame(m.raf);
      m.raf = 0;
      applyMomentumRef.current = null;
    };
  }, [filteredArtworks.length, selectedRoomId, viewMode]);

  // Selection is driven purely by scroll position

  // Shared layout values for room selector + info text
  // Wide screen: center between thumbnails (~150px) and metadata (~500px) = ~325px
  // Narrow screen: same left margin as grid for alignment
  const selectorLeft = isMobile ? 12 : (isVeryNarrow ? 16 : (isNarrow ? 24 : 250));
  // Wide screen: same top margin as mode tabs (8px)
  // Narrow screen: align with metadata row Y position (after mode tabs)
  const selectorTop = isMobile ? 140 : (isVeryNarrow ? 50 : (isNarrow ? 50 : 8));
  // Info text position (same center as room selector on wide screen)
  const infoTextLeft = isMobile ? 12 : (isVeryNarrow ? 160 : (isNarrow ? 180 : 300));
  // Selector sizing constants: narrower on narrow screens
  const SELECTOR_COL_WIDTH = isVeryNarrow ? 12 : (isNarrow ? 14 : 18); // px
  const SELECTOR_COL_GAP = 0; // px (no gap between buttons)
  // Max 15 rooms per row
  const selectorCols = isMobile ? 10 : 15;
  const selectorWidth = selectorCols * SELECTOR_COL_WIDTH + Math.max(0, selectorCols - 1) * SELECTOR_COL_GAP;
  // Info text X within the info panel should align visually to the selector's X
  // Keep info text inset inside the info panel to avoid clipping; align visually with selector


  // Compute selector data outside JSX and replace the problematic IIFE-based room selector block with simpler JSX using this data to fix the syntax error
  const selectorData = useMemo(() => {
    // Only use actually assigned numeric rooms discovered from buttons (which derive from artworks)
    const numericButtons = roomButtons.filter(b => /^\d+$/.test(b.id));
    const nums: { id: string; label: string; exists: boolean }[] = numericButtons.map(b => ({ id: b.id, label: b.label, exists: true }));
    // Add letter rooms (A-G)
    const letterButtons = roomButtons.filter(b => /^[A-G]$/i.test(b.id) && b.id !== 'C');
    for (const lb of letterButtons) nums.push({ id: lb.id, label: lb.label, exists: true });
    // Add Central Hall (C)
    const central = roomButtons.find(b => b.id === 'C');
    if (central) nums.push({ id: central.id, label: central.label, exists: true });
    // Add Archive (n) at the end
    const archive = roomButtons.find(b => b.id === 'n');
    if (archive) nums.push({ id: archive.id, label: archive.label, exists: true });

    // Chunk for gallery rows of 15
    const rows: typeof nums[] = [];
    for (let i = 0; i < nums.length; i += 15) rows.push(nums.slice(i, i + 15));

    return { nums, rows };
  }, [roomButtons]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        overscrollBehavior: "contain",
      }}
    >
      <div
        ref={panelRef}
        style={{
          position: "relative",
          backgroundColor: "#fff",
          width: "100%",
          height: "100%",
          padding: 0,
          borderRadius: 0,
          boxShadow: "0 12px 28px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          ...(DEBUG_LAYOUT ? { outline: "1px solid #f0f" } : {})
        }}
      >
        {/* Old handle removed; the corner is now curled by default and interactive via the invisible zone above */}
        {/* Absolute full-height exhibition info panel at far left (all modes) */}
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 150, background: "transparent", zIndex: 200, display: 'flex', flexDirection: 'column', pointerEvents: 'none', ...(DEBUG_LAYOUT ? { outline: "1px solid #964B00" } : {}) }}>
          {/* Left header: title + description + room selector */}
          <div style={{ padding: '8px 8px', borderBottom: '0px solid transparent', pointerEvents: 'auto', background: '#fff' }}>
            {repImage && (
              <div style={{ width: '100%', marginBottom: 8, background: '#ddd', borderRadius: 4, overflow: 'hidden' }}>
                <img
                  src={repImage}
                  alt={(exhibition.title || exhibition.name) + ' cover'}
                  style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'cover' }}
                  decoding="async"
                  loading="eager"
                  referrerPolicy="no-referrer"
                  onError={() => setRepImage(null)}
                />
              </div>
            )}
            <div
              ref={titleScrollRef}
              onMouseEnter={() => startTitleAutoScroll()}
              onMouseLeave={() => stopTitleAutoScroll(true)}
              style={{ fontSize: 12, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflowX: 'hidden', textOverflow: 'clip', cursor: 'default' }}
              title={exhibition.title || exhibition.name}
            >
              <span style={{ display: 'inline-block', paddingRight: 18 }}>{exhibition.title || exhibition.name}</span>
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 10,
                color: '#666',
                lineHeight: 1.4,
                maxHeight: isDescriptionExpanded ? 'none' : 72,
                overflow: isDescriptionExpanded ? 'visible' : 'hidden',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget;
                // if content overflows, animate vertical scroll up/down
                const canScroll = el.scrollHeight > el.clientHeight + 2;
                if (!canScroll) return;
                // Prevent duplicate RAFs
                if ((el as any)._raf) cancelAnimationFrame((el as any)._raf);
                let dir = 1; // 1: down, -1: up
                const maxScroll = el.scrollHeight - el.clientHeight;
                let last = performance.now();
                const speed = 18; // px per second
                const step = (now: number) => {
                  const dt = Math.min(40, now - last);
                  last = now;
                  el.scrollTop += dir * (speed * (dt / 1000));
                  if (el.scrollTop <= 0) { el.scrollTop = 0; dir = 1; }
                  else if (el.scrollTop >= maxScroll) { el.scrollTop = maxScroll; dir = -1; }
                  (el as any)._raf = requestAnimationFrame(step);
                };
                (el as any)._raf = requestAnimationFrame(step);
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                if ((el as any)._raf) {
                  cancelAnimationFrame((el as any)._raf);
                  (el as any)._raf = 0;
                }
                // Smoothly return to top so the first lines are visible next time
                el.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              {exhibition.description || `${(exhibition.title || exhibition.name)} — a short introduction to the exhibition.`}
            </div>
            {/* Description button - opens overlay with full exhibition details */}
            {((exhibition as any).detailedDescription || (exhibition as any).descriptionHtml || (exhibition as any).url || (exhibition as any).fullDescription || (Array.isArray((exhibition as any).galleryImages) && (exhibition as any).galleryImages.length > 0) || (Array.isArray((exhibition as any).videos) && (exhibition as any).videos.length > 0)) && (
              <button
                onClick={() => setIsDescriptionExpanded(true)}
                style={{
                  marginTop: 8,
                  fontSize: 10,
                  color: '#fff',
                  background: '#111827',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 10px',
                  borderRadius: 3,
                  fontWeight: 600,
                }}
              >
                Description
              </button>
            )}
            {/* room selector removed from left header; rendered between title/meta instead */}
          </div>
          {/* Centered placeholder area in the left column when no artworks (archive only) */}
          {initialized && filteredArtworks.length === 0 && viewMode === 'archive' && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ color: '#888', fontSize: 13, textAlign: 'center', padding: '20px' }}>
                {((exhibition as any).detailedDescription || exhibition.description) ? (
                  <>SEE DESCRIPTION<br />→</>
                ) : (
                  <>NO ARTWORKS<br />YET .</>
                )}
              </div>
            </div>
          )}
          {/* Scrollable thumbnail strip below header (archive mode only) */}
          {viewMode === 'archive' && filteredArtworks.length > 0 && (() => {
            const total = filteredArtworks.length;
            const useVirtualization = total > 500; // Enable virtualization for large lists
            
            // Item dimensions for virtualization
            const ITEM_HEIGHT = 144; // ~60px thumbnail + 84px margin
            const BUFFER_COUNT = 10; // Extra items above/below viewport
            
            // Create 3x list for infinite loop (only if not virtualized)
            const tripleList = useVirtualization ? filteredArtworks : [...filteredArtworks, ...filteredArtworks, ...filteredArtworks];
            
            const scrollToIndex = (realIdx: number) => {
              const el = listRef.current;
              if (!el) return;
              
              if (useVirtualization) {
                // For virtualized list, calculate scroll position directly
                const targetScroll = realIdx * ITEM_HEIGHT - el.clientHeight / 2 + ITEM_HEIGHT / 2;
                el.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
              } else {
                // Original behavior for non-virtualized
                const items = el.querySelectorAll('[data-base]');
                const targetItem = Array.from(items).find((item, idx) => {
                  const base = parseInt(item.getAttribute('data-base') || '-1');
                  return base === realIdx && idx >= total && idx < total * 2;
                }) as HTMLElement | null;
                
                if (targetItem) {
                  const containerHeight = el.clientHeight;
                  const itemTop = targetItem.offsetTop;
                  const itemHeight = targetItem.offsetHeight;
                  const targetScroll = itemTop + itemHeight / 2 - containerHeight / 2;
                  el.scrollTo({ top: targetScroll, behavior: 'smooth' });
                }
              }
              setSelectedIndex(realIdx);
            };

            return (
              <div
                ref={(el) => {
                  (listRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                  if (el && useVirtualization) {
                    setArchiveContainerHeight(el.clientHeight);
                  }
                }}
                className="no-scrollbar"
                style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 8px", overscrollBehavior: "none", msOverflowStyle: "none", scrollbarWidth: "none" }}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  const currentScrollTop = el.scrollTop;
                  
                  if (useVirtualization) {
                    setArchiveScrollTop(currentScrollTop);
                    // Calculate which item is at center
                    const centerY = currentScrollTop + el.clientHeight / 2;
                    const centerIdx = Math.floor(centerY / ITEM_HEIGHT);
                    const clampedIdx = Math.max(0, Math.min(centerIdx, total - 1));
                    if (clampedIdx !== selectedIndex) {
                      setSelectedIndex(clampedIdx);
                    }
                  } else {
                    // Original non-virtualized scroll handling
                    const elContainerHeight = el.clientHeight;
                    const centerY = currentScrollTop + elContainerHeight / 2;
                    
                    const items = el.querySelectorAll('[data-base]');
                    let closestIdx = 0;
                    let closestDistance = Infinity;
                    
                    items.forEach((item) => {
                      const htmlItem = item as HTMLElement;
                      const itemTop = htmlItem.offsetTop;
                      const itemHeight = htmlItem.offsetHeight;
                      const itemCenter = itemTop + itemHeight / 2;
                      const distance = Math.abs(itemCenter - centerY);
                      
                      if (distance < closestDistance) {
                        closestDistance = distance;
                        closestIdx = parseInt(item.getAttribute('data-base') || '0');
                      }
                    });
                    
                    if (closestIdx !== selectedIndex) {
                      setSelectedIndex(closestIdx);
                    }
                    
                    // Infinite loop
                    const totalHeight = el.scrollHeight;
                    const sectionHeight = totalHeight / 3;
                    
                    if (currentScrollTop < sectionHeight * 0.3) {
                      el.scrollTop = currentScrollTop + sectionHeight;
                    } else if (currentScrollTop > sectionHeight * 1.7) {
                      el.scrollTop = currentScrollTop - sectionHeight;
                    }
                  }
                }}
              >
                {useVirtualization ? (
                  // Virtualized rendering - only render visible items
                  <div style={{ height: total * ITEM_HEIGHT, position: 'relative' }}>
                    {(() => {
                      const startIdx = Math.max(0, Math.floor(archiveScrollTop / ITEM_HEIGHT) - BUFFER_COUNT);
                      const endIdx = Math.min(total, Math.ceil((archiveScrollTop + archiveContainerHeight) / ITEM_HEIGHT) + BUFFER_COUNT);
                      const visibleItems = [];
                      
                      for (let i = startIdx; i < endIdx; i++) {
                        const a = filteredArtworks[i];
                        visibleItems.push(
                          <div
                            key={i}
                            data-base={i}
                            onClick={() => scrollToIndex(i)}
                            role="button"
                            tabIndex={0}
                            style={{
                              position: 'absolute',
                              top: i * ITEM_HEIGHT,
                              left: 0,
                              right: 0,
                              height: ITEM_HEIGHT,
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "flex-start",
                              paddingTop: 0,
                              cursor: "pointer",
                              opacity: i === selectedIndex ? 1 : 0.65
                            }}
                          >
                            <div 
                              style={{ width: "40%", aspectRatio: "1 / 1", background: "#eee", borderRadius: 0, overflow: "hidden" }}
                            >
                              {a.youtubeId ? (
                                <img
                                  src={`https://img.youtube.com/vi/${a.youtubeId}/mqdefault.jpg`}
                                  alt={a.name}
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                  style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
                                  onError={(e) => { e.currentTarget.src = a.image; }}
                                />
                              ) : a.image && (
                                <img
                                  src={a.image}
                                  alt={a.name}
                                  loading="lazy"
                                  decoding="async"
                                  fetchPriority="low"
                                  referrerPolicy="no-referrer"
                                  style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
                                  onError={(e) => applyFallbackImage(e.currentTarget)}
                                />
                              )}
                            </div>
                          </div>
                        );
                      }
                      return visibleItems;
                    })()}
                  </div>
                ) : (
                  // Original 3x list for smaller collections
                  tripleList.map((a, idx) => {
                    const realIdx = idx % total;
                    return (
                      <div
                        key={`${realIdx}-${Math.floor(idx / total)}`}
                        data-base={realIdx}
                        onClick={() => scrollToIndex(realIdx)}
                        role="button"
                        tabIndex={0}
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 36, marginBottom: 84, cursor: "pointer", opacity: realIdx === selectedIndex ? 1 : 0.65 }}
                      >
                        <div 
                          style={{ width: "40%", aspectRatio: "1 / 1", background: "#eee", borderRadius: 0, overflow: "hidden" }}
                        >
                          {a.youtubeId ? (
                            <img
                              src={`https://img.youtube.com/vi/${a.youtubeId}/mqdefault.jpg`}
                              alt={a.name}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
                              onError={(e) => { e.currentTarget.src = a.image; }}
                            />
                          ) : a.image && (
                            <img
                              src={a.image}
                              alt={a.name}
                              loading="lazy"
                              decoding="async"
                              fetchPriority="low"
                              referrerPolicy="no-referrer"
                              style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
                              onError={(e) => applyFallbackImage(e.currentTarget)}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            );
          })()}
        </div>
        {/* Top bar: mode tabs + controls */}
        {/* Top bar: mode tabs + controls */}
        {/* Wide screen: absolute positions at metaPos, Narrow: flex centered with dynamic spacing */}
        {(() => {
          // Wide screen: use absolute positioning
          // Narrow screen: use flex centering
          if (!isNarrow) {
            return (
              <div ref={topBarRef} style={{ position: "relative", padding: "8px 0", minHeight: topBarHeight, marginLeft: LAYOUT_LEFT_BASE + META_SHIFT, marginRight: 80, zIndex: 100, ...(DEBUG_LAYOUT ? { outline: "1px dashed #00f" } : {}) }}>
                <span
                  onClick={() => setViewMode('panorama')}
                  style={{
                    fontSize: 12, lineHeight: 1, fontWeight: 700,
                    color: viewMode === 'panorama' ? "#000" : "#666",
                    cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                    textDecoration: viewMode === 'panorama' ? 'underline' : 'none',
                    position: 'absolute',
                    left: metaPos.title,
                  }}
                >
                  PANORAMA
                </span>
                <span
                  ref={archiveRef}
                  onClick={() => setViewMode('archive')}
                  style={{
                    fontSize: 12, lineHeight: 1, fontWeight: 700,
                    color: viewMode === 'archive' ? "#000" : "#666",
                    cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                    textDecoration: viewMode === 'archive' ? 'underline' : 'none',
                    position: 'absolute',
                    left: metaPos.creator,
                  }}
                >
                  ARCHIVE
                </span>
                <span
                  ref={galleryRef}
                  onClick={() => setViewMode('gallery')}
                  style={{
                    fontSize: 12, lineHeight: 1, fontWeight: 700,
                    color: viewMode === 'gallery' ? "#000" : "#666",
                    cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                    textDecoration: viewMode === 'gallery' ? 'underline' : 'none',
                    position: 'absolute',
                    left: metaPos.date,
                  }}
                >
                  GALLERY
                </span>
                {exhibition.startDate && !String(exhibition.startDate).toLowerCase().includes('permanent') && (
                  <span
                    onClick={() => setShowSubmissionForm(true)}
                    style={{
                      fontSize: 12, lineHeight: 1, fontWeight: 700,
                      color: "#666",
                      cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                      textDecoration: 'none',
                      position: 'absolute',
                      left: metaPos.dimension,
                      display: 'inline-block',
                      padding: '4px 8px',
                    }}
                  >
                    <svg
                      style={{ position: 'absolute', top: -8, left: -12, width: 'calc(100% + 24px)', height: 'calc(100% + 16px)', pointerEvents: 'none' }}
                      viewBox="0 0 100 40"
                      preserveAspectRatio="none"
                    >
                      <ellipse
                        cx="50" cy="20" rx="48" ry="18"
                        fill="none"
                        stroke="#333"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeDasharray="3,2"
                        style={{ transform: 'rotate(-2deg)', transformOrigin: 'center' }}
                      />
                    </svg>
                    + SUBMIT
                  </span>
                )}
              </div>
            );
          }
          
          // Narrow screen: 3-column grid layout
          // Column 1 (PANORAMA): Room selector + year filter
          // Column 2 (ARCHIVE): TITLE + CREATOR
          // Column 3 (GALLERY): DATE + DIMENSION
          // Left margin must clear the left panel (150px) + some padding
          const narrowMarginLeft = 160;
          const narrowMarginRight = isVeryNarrow ? 16 : 24;
          const titleText = displayArtwork?.name || "—";
          const creatorText = displayArtwork?.artist || "—";
          const dateText = displayArtwork?.date || (displayArtwork?.year ? String(displayArtwork.year) : "—");
          const dimensionText = displayArtwork?.dimension || "—";
          const durationText = displayArtwork?.duration || null;  // Video/film duration
          
          return (
            <div ref={topBarRef} style={{ position: "relative", padding: "8px 0", marginLeft: narrowMarginLeft, marginRight: narrowMarginRight, zIndex: 100, ...(DEBUG_LAYOUT ? { outline: "1px dashed #00f" } : {}) }}>
              {/* Row 1: Mode tabs */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                <span
                  onClick={() => setViewMode('panorama')}
                  style={{
                    fontSize: 12, lineHeight: 1, fontWeight: 700,
                    color: viewMode === 'panorama' ? "#000" : "#666",
                    cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                    textDecoration: viewMode === 'panorama' ? 'underline' : 'none',
                  }}
                >
                  PANORAMA
                </span>
                <span
                  ref={archiveRef}
                  onClick={() => setViewMode('archive')}
                  style={{
                    fontSize: 12, lineHeight: 1, fontWeight: 700,
                    color: viewMode === 'archive' ? "#000" : "#666",
                    cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                    textDecoration: viewMode === 'archive' ? 'underline' : 'none',
                  }}
                >
                  ARCHIVE
                </span>
                <span
                  ref={galleryRef}
                  onClick={() => setViewMode('gallery')}
                  style={{
                    fontSize: 12, lineHeight: 1, fontWeight: 700,
                    color: viewMode === 'gallery' ? "#000" : "#666",
                    cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                    textDecoration: viewMode === 'gallery' ? 'underline' : 'none',
                  }}
                >
                  GALLERY
                </span>
              </div>
              
              {/* Row 2: Content under each tab - 3 columns */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, alignItems: "start" }}>
                {/* Column 1: Room selector + Year filter (under PANORAMA) */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {/* ALL button */}
                  {roomButtons.find(b => b.id === 'ALL') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      <button onClick={() => { setSelectedRoomId('ALL'); setSelectedIndex(0); }} style={{ padding: '2px 6px', fontSize: 9.5, borderRadius: 3, border: 'none', background: selectedRoomId === 'ALL' ? '#111' : 'transparent', color: selectedRoomId === 'ALL' ? '#fff' : '#222', cursor: 'pointer' }}>ALL</button>
                      <span style={{ fontSize: 9, color: '#666' }}>({filteredArtworks.length})</span>
                    </div>
                  )}
                  {/* Year/Century buttons */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {dateLevel === 'century' ? (
                      availableCenturies.map((c) => (
                        <button
                          key={`c-${c}`}
                          onClick={() => { setSelectedCentury(c); setSelectedYearRange('ALL'); setDateLevel('decade'); setSelectedIndex(0); }}
                          style={{ padding: '2px 6px', fontSize: 9.5, borderRadius: 3, border: 'none', background: '#f0f0f0', color: '#222', cursor: 'pointer' }}
                        >
                          {`${c}c`}
                        </button>
                      ))
                    ) : null}
                  </div>
                  {/* 2D/3D buttons - only show if artworks have type field */}
                  {hasTypedArtworks && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      {(['2D', '3D'] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => setSelectedTypes(prev => { const next = new Set(prev); if (next.has(t)) next.delete(t); else next.add(t); return next; })}
                          style={{ padding: '2px 6px', fontSize: 9.5, borderRadius: 3, border: selectedTypes.has(t) ? '1px solid #111' : '1px solid #ddd', background: selectedTypes.has(t) ? '#111' : '#f8f8f8', color: selectedTypes.has(t) ? '#fff' : '#222', cursor: 'pointer' }}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Column 2: TITLE + CREATOR (under ARCHIVE) */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 2 }}>TITLE</div>
                    <div style={{ fontSize: 11, color: "#222", fontWeight: 700, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{titleText}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 2 }}>CREATOR</div>
                    <div style={{ fontSize: 11, color: "#222", lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{creatorText}</div>
                  </div>
                </div>
                
                {/* Column 3: DATE + DIMENSION/DURATION (under GALLERY) */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 2 }}>DATE</div>
                    <div style={{ fontSize: 11, color: "#222", lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{dateText}</div>
                  </div>
                  {durationText ? (
                    <div>
                      <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 2 }}>DURATION</div>
                      <div style={{ fontSize: 11, color: "#222", lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{durationText}</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 2 }}>DIMENSION</div>
                      <div style={{ fontSize: 11, color: "#222", lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{dimensionText}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
        {/* Room selector: placed between top bar and meta row (chunked rows of 5) */}
        {/* Room selector: absolute so it doesn't push down the metadata; wraps when it runs out of width */}
        {/* Hide on narrow screens - included in the 3-column layout above */}
        {!isNarrow && (
        <div style={{ position: 'absolute', left: selectorLeft, top: selectorTop, width: selectorWidth, zIndex: 110 }}>
          {roomButtons.find(b => b.id === 'ALL') && (
            <div style={{ marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => { setSelectedRoomId('ALL'); setSelectedIndex(0); }} style={{ padding: '2px 6px', fontSize: 9.5, borderRadius: 3, border: 'none', background: selectedRoomId === 'ALL' ? '#111' : 'transparent', color: selectedRoomId === 'ALL' ? '#fff' : '#222', cursor: 'pointer' }}>ALL</button>
              <span style={{ fontSize: 10, color: '#666' }}>({filteredArtworks.length})</span>
            </div>
          )}
          <div style={{ width: '100%' }}>
            {/* Unified gallery-style room selector for all modes */}
            {(selectorData.rows.length > 0 ? selectorData.rows : []).map((row, rIdx) => (
              <div key={`row-${rIdx}`} style={{ display: 'grid', gridTemplateColumns: `repeat(${row.length}, ${SELECTOR_COL_WIDTH}px)`, columnGap: SELECTOR_COL_GAP, rowGap: 2, justifyContent: 'start', marginBottom: 1 }}>
                {row.map((btn) => (
                  <button key={btn.id} onClick={() => { if (btn.exists) { setSelectedRoomId(btn.id); setSelectedIndex(0); } }} disabled={!btn.exists} style={{ width: '100%', height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontSize: 9.5, borderRadius: 3, border: btn.exists ? 'none' : '1px dashed rgba(0,0,0,0.18)', background: btn.exists ? (selectedRoomId === btn.id ? '#111' : 'transparent') : 'rgba(0,0,0,0.03)', color: btn.exists ? (selectedRoomId === btn.id ? '#fff' : '#222') : 'rgba(0,0,0,0.38)', opacity: btn.exists ? 1 : 0.75, cursor: btn.exists ? 'pointer' : 'default', boxSizing: 'border-box' }}>
                    {btn.label}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Year filtering buttons - moved below room buttons */}
          <div style={{ marginTop: 8, padding: '6px 0' }}>
            {dateLevel === 'century' ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {availableCenturies.map((c) => (
                  <button
                    key={`c-${c}`}
                    onClick={() => { setSelectedCentury(c); setSelectedYearRange('ALL'); setDateLevel('decade'); setSelectedIndex(0); }}
                    style={{
                      padding: '2px 8px',
                      fontSize: 11,
                      borderRadius: 4,
                      border: '1px solid #ddd',
                      background: '#f8f8f8',
                      color: '#222',
                      cursor: 'pointer'
                    }}
                  >
                    {`${c}c`}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => { setDateLevel('century'); setSelectedCentury(null); setSelectedYearRange('ALL'); }}
                    style={{ padding: '2px 8px', fontSize: 11, borderRadius: 4, border: '1px solid #ddd', background: '#fafafa', color: '#222', cursor: 'pointer' }}
                  >
                    Back
                  </button>
                  <span style={{ fontSize: 11, color: '#666' }}>{selectedCentury ? `${selectedCentury}c` : ''}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {availableDecades.map((d) => (
                    <button
                      key={`d-${d}`}
                      onClick={() => { setSelectedYearRange(String(d)); setSelectedIndex(0); }}
                      style={{
                        padding: '2px 8px',
                        fontSize: 11,
                        borderRadius: 4,
                        border: '1px solid ' + (selectedYearRange === String(d) ? '#111' : '#ddd'),
                        background: selectedYearRange === String(d) ? '#111' : '#f8f8f8',
                        color: selectedYearRange === String(d) ? '#fff' : '#222',
                        cursor: 'pointer'
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                {selectedYearRange !== 'ALL' && (
                  <div>
                    <button
                      onClick={() => { setSelectedYearRange('ALL'); setSelectedIndex(0); }}
                      style={{ padding: '2px 8px', fontSize: 11, borderRadius: 4, border: '1px solid #ddd', background: '#fafafa', color: '#222', cursor: 'pointer' }}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            )}
            {/* 2D/3D type filter + ARTWORKS ONLY - shown when relevant */}
            {(hasTypedArtworks || hasArchivalArtworks) && (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {hasTypedArtworks && (['2D', '3D'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => {
                      setSelectedTypes(prev => {
                        const next = new Set(prev);
                        if (next.has(t)) next.delete(t);
                        else next.add(t);
                        return next;
                      });
                      setSelectedIndex(0);
                    }}
                    style={{
                      padding: '2px 8px',
                      fontSize: 11,
                      borderRadius: 4,
                      border: selectedTypes.has(t) ? '1px solid #111' : '1px solid #ddd',
                      background: selectedTypes.has(t) ? '#111' : '#f8f8f8',
                      color: selectedTypes.has(t) ? '#fff' : '#222',
                      cursor: 'pointer',
                    }}
                  >
                    {t}
                  </button>
                ))}
                {hasArchivalArtworks && (
                  <button
                    onClick={() => { setShowArtworksOnly(!showArtworksOnly); setSelectedIndex(0); }}
                    style={{
                      padding: '2px 8px',
                      fontSize: 11,
                      borderRadius: 4,
                      border: showArtworksOnly ? '1px solid #111' : '1px solid #ddd',
                      background: showArtworksOnly ? '#111' : '#f8f8f8',
                      color: showArtworksOnly ? '#fff' : '#222',
                      cursor: 'pointer',
                    }}
                  >
                    ARTWORKS ONLY
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        )}

        {/* Artwork meta info (below the top bar, aligned to Gallery/Archive; dynamic per selected artwork) */}
        {/* Hide on narrow screens - included in the 3-column layout above */}
        {!isNarrow && (viewMode === 'archive' || viewMode === 'gallery' || viewMode === 'panorama') && (
          <div ref={metaRowRef} style={{ position: "relative", padding: "12px 12px 0 0", marginLeft: LAYOUT_LEFT_BASE + META_SHIFT, marginTop: metaMarginTop, marginRight: LAYOUT_RIGHT_PAD, minHeight: FIXED_META_HEIGHT + META_VERTICAL_PAD, ...(DEBUG_LAYOUT ? { outline: "1px solid #f00" } : {}) }}>
            {(() => {
              const titleText = displayArtwork?.name || "—";
              const creatorText = displayArtwork?.artist || "—";
              const dateText = displayArtwork?.date || (displayArtwork?.year ? String(displayArtwork.year) : "—");
              const dimensionText = displayArtwork?.dimension || "—";
              const durationText = displayArtwork?.duration || null;  // Video/film duration
              const gap = Math.max(160, Math.min(360, metaPos.date - metaPos.creator - 12));
              // shrink horizontal allocation to avoid cramped columns; allow content to wrap vertically
              const shrunk = Math.max(80, Math.floor(gap * META_HOR_SCALE));
              const titleW = shrunk;
              const creatorW = shrunk;
              const dateW = shrunk;
              // Wide screens: use absolute positioning
              return (
                <>
                  {/* TITLE */}
                  <div ref={titleRef} style={{ position: "absolute", left: metaPos.title, top: 12, maxWidth: titleW, ...(DEBUG_LAYOUT ? { outline: "1px dashed #f66" } : {}) }}>
                    <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 4 }}>TITLE</div>
                    <div ref={metaTitleValueRef} style={{ fontSize: 12, color: "#222", fontWeight: 700, lineHeight: 1.3, whiteSpace: "normal", wordBreak: "break-word", overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', maxHeight: 36 }}>{titleText}</div>
                  </div>
                  {/* CREATOR */}
                  <div ref={creatorRef} style={{ position: "absolute", left: metaPos.creator, top: 12, maxWidth: creatorW, ...(DEBUG_LAYOUT ? { outline: "1px dashed #6f6" } : {}) }}>
                    <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 4 }}>CREATOR</div>
                    <div style={{ fontSize: 12, color: "#222", lineHeight: 1.3, whiteSpace: "normal", wordBreak: "break-word", overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', maxHeight: 36 }}>{creatorText}</div>
                  </div>
                  {/* DATE */}
                  <div ref={dateRef} style={{ position: "absolute", left: metaPos.date, top: 12, maxWidth: dateW, ...(DEBUG_LAYOUT ? { outline: "1px dashed #66f" } : {}) }}>
                    <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 4 }}>DATE</div>
                    <div style={{ fontSize: 12, color: "#222", lineHeight: 1.3, whiteSpace: "normal", wordBreak: "break-word", overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', maxHeight: 36 }}>{dateText}</div>
                  </div>
                  {/* DIMENSION or DURATION */}
                  <div ref={dimensionRef} style={{ position: "absolute", left: metaPos.dimension, right: 0, top: 12, ...(DEBUG_LAYOUT ? { outline: "1px dashed #f6f" } : {}) }}>
                    <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 4 }}>{durationText ? 'DURATION' : 'DIMENSION'}</div>
                    <div style={{ fontSize: 12, color: "#222", lineHeight: 1.3, whiteSpace: "normal", wordBreak: "break-word", overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', maxHeight: 36 }}>{durationText || dimensionText}</div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Top Right Controls Group: Heart, Login, Close - aligned with mode tabs */}
        <div style={{ position: "absolute", top: 8, right: 0, display: "flex", alignItems: "center", gap: 8, paddingRight: 16, zIndex: 200 }}>
          {/* Heart button to navigate to MyPage */}
          <button
            onClick={() => navigate('/mypage')}
            aria-label="Go to My Page"
            title="Go to My Page"
            style={{
              padding: 6,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#000",
              fontSize: 16,
            }}
          >
            ♡
          </button>

          {/* Login Button */}
          <LoginButton />

          {/* Close Button */}
          <button
            onClick={() => {
              if (closeGuardRef.current) return;
              clearModalFlag();
              closeGuardRef.current = true;
              onClose();
            }}
            aria-label="Close"
            style={{
              padding: "0 8px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#333",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "lowercase",
            }}
          >
            close
          </button>
        </div>

        {/* Content area */}
        <div style={{ 
          flex: 1, 
          display: "flex", 
          flexDirection: viewMode === 'gallery' ? 'column' : 'row', 
          minHeight: 0, 
          maxHeight: '100%',
          paddingLeft: viewMode === 'archive' ? 150 : 0, 
          position: 'relative',
          overflow: viewMode === 'gallery' ? 'hidden' : undefined
        }}>

          {viewMode === 'archive' ? (
            <>
              {/* Middle info panel (floats next to selected thumbnail position) */}
              <div ref={infoPanelRef} style={{ width: 260, background: "#fff", padding: "12px 10px 12px 12px", position: "relative" }}>
                {current ? (
                  <div style={{ position: "fixed", top: "50%", left: infoTextLeft, width: 240, transform: "translateY(-50%)", color: "#222", lineHeight: 1.5, zIndex: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={current.name}>{current.name}</div>
                    <div style={{ fontSize: 11.5, color: "#666" }}>{current.artist}{current.year ? ` (${current.year})` : ""}</div>
                  </div>
                ) : (initialized && filteredArtworks.length === 0 ? (
                  <div style={{ position: 'fixed', top: "50%", left: infoTextLeft, width: 240, transform: 'translateY(-50%)', color: '#999', fontSize: 12, fontWeight: 700, zIndex: 10 }}>
                    update soon
                  </div>
                ) : null)}
              </div>
              {/* Right stage */}
              <div style={{ flex: 1, position: "relative", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {/* Constrain image so it won't overlap metadata/top rows (reserve ~260px) */}
                <div
                  ref={stageMonitorRef}
                  style={{ width: "72%", maxHeight: "calc(100vh - 260px)", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}
                >
                  {(current ? (
                    current.youtubeId ? (
                      // YouTube 영상인 경우 - iframe 아래, 썸네일 위에서 디졸브
                      <div style={{ 
                        width: '100%', 
                        maxWidth: 'calc(100vh - 260px) * 16 / 9',
                        aspectRatio: '16/9',
                        background: '#000',
                        overflow: 'hidden',
                        position: 'relative'
                      }}>
                        {/* iframe - 아래 레이어 (z-index: 1) */}
                        {archiveVideoReady && (
                          <iframe
                            src={`https://www.youtube.com/embed/${current.youtubeId}?autoplay=1&mute=1&controls=0&showinfo=0&loop=1&playlist=${current.youtubeId}&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0&playsinline=1&cc_load_policy=0&origin=${window.location.origin}`}
                            title={current.name}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            style={{ 
                              position: 'absolute',
                              top: '-60px',
                              left: 0,
                              width: '100%', 
                              height: 'calc(100% + 120px)', 
                              border: 'none',
                              pointerEvents: 'none',
                              zIndex: 1
                            }}
                          />
                        )}
                        {/* 썸네일 - 위 레이어 (z-index: 2), 1초 후 디졸브로 사라짐 */}
                        {archiveVideoReady && (
                          <img
                            src={`https://img.youtube.com/vi/${current.youtubeId}/maxresdefault.jpg`}
                            alt={current.name}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              zIndex: 2,
                              opacity: archiveThumbnailHidden ? 0 : 1,
                              transition: 'opacity 0.5s ease-out',
                              pointerEvents: 'none'
                            }}
                            onError={(e) => {
                              e.currentTarget.src = `https://img.youtube.com/vi/${current.youtubeId}/mqdefault.jpg`;
                            }}
                          />
                        )}
                        {/* 초기 썸네일 (영상 준비 전) */}
                        {!archiveVideoReady && (
                          <img
                            src={`https://img.youtube.com/vi/${current.youtubeId}/maxresdefault.jpg`}
                            alt={current.name}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover'
                            }}
                            onError={(e) => {
                              e.currentTarget.src = `https://img.youtube.com/vi/${current.youtubeId}/mqdefault.jpg`;
                            }}
                          />
                        )}
                      </div>
                    ) : (() => {
                      const widths = window.innerWidth < 900 ? [480, 720, 960] : [640, 960, 1280, 1600];
                      const avif = buildVariantSourceSet(current, 'avif', widths, 70);
                      const webp = buildVariantSourceSet(current, 'webp', widths, 75);
                      const sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 82vw, 75vw';
                      const lowSrc = pickLowPlaceholder(current);
                      const isR2 = isR2Image(current.image);
                      return (
                        <picture>
                          {useProxy && avif && <source type="image/avif" srcSet={avif || undefined} sizes={sizes} />}
                          {useProxy && webp && <source type="image/webp" srcSet={webp || undefined} sizes={sizes} />}
                          <img
                            ref={mainImgRef}
                            src={lowSrc}
                            alt={current.name}
                            decoding="async"
                            fetchPriority="high"
                            referrerPolicy="no-referrer"
                            data-hi={lowSrc === current.image ? '1' : '0'}
                            style={{
                              width: "auto",
                              maxWidth: isR2 ? "117.65%" : "100%",
                              maxHeight: "calc(100vh - 260px)",
                              objectFit: "contain",
                              cursor: "zoom-in",
                              display: "block",
                              filter: mainLoaded ? 'none' : 'blur(14px)',
                              transition: 'filter 420ms ease, opacity 420ms ease',
                              opacity: mainLoaded ? 1 : 0.88,
                              background: '#f5f5f5',
                              transform: isR2 ? 'scale(0.85)' : 'none',
                              transformOrigin: 'center center'
                            }}
                            onClick={(e) => openLightbox(e, current)}
                            onLoad={(e) => {
                              if ((e.currentTarget.getAttribute('data-hi') === '1') && !mainLoaded) {
                                setMainLoaded(true);
                              }
                            }}
                            onError={(e) => {
                              applyFallbackImage(e.currentTarget);
                              if (!mainLoaded) setMainLoaded(true);
                            }}
                          />
                        </picture>
                      );
                    })()
                  ) : (
                    initialized && filteredArtworks.length === 0 ? (
                      // Show description and YouTube embed when no artworks
                      (() => {
                        const desc = (exhibition as any).detailedDescription || exhibition.description || '';
                        const youtubeId = extractYouTubeId(desc);
                        const cleanDesc = removeYouTubeUrls(desc);
                        
                        return (
                          <div style={{ 
                            width: '100%', 
                            maxWidth: 700, 
                            padding: '40px 32px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 24,
                            alignItems: 'center'
                          }}>
                            {/* YouTube embed if found */}
                            {youtubeId && (
                              <div style={{ 
                                width: '100%', 
                                maxWidth: 640,
                                aspectRatio: '16/9',
                                borderRadius: 8,
                                overflow: 'hidden',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
                              }}>
                                <iframe
                                  width="100%"
                                  height="100%"
                                  src={`https://www.youtube.com/embed/${youtubeId}?rel=0`}
                                  title="Exhibition Video"
                                  frameBorder="0"
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                  allowFullScreen
                                  style={{ display: 'block' }}
                                />
                              </div>
                            )}
                            {/* Description text */}
                            {cleanDesc ? (
                              <div style={{ 
                                fontSize: 14, 
                                lineHeight: 1.8, 
                                color: '#333',
                                textAlign: 'left',
                                maxWidth: 580,
                                whiteSpace: 'pre-wrap'
                              }}>
                                {cleanDesc}
                              </div>
                            ) : (
                              <div style={{ color: '#999', fontWeight: 700 }}>update soon</div>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <div style={{ color: "#bbb", margin: "auto" }}>No image</div>
                    )
                  ))}
                  {current && (
                    <div style={{ position: "absolute", bottom: 16, right: 16, zIndex: 30 }} className="hover-trigger">
                      <HeartOverlay
                        isLiked={likedArtworks.has(current.id)}
                        onToggle={(e) => toggleLike(e, current)}
                        style={{
                          background: 'none',
                          padding: 0,
                          opacity: 0, // initially hidden
                          transition: 'opacity 0.2s'
                        }}
                        size={20}
                        color="#e11d48"
                        emptyColor="#fff"
                      />
                      <style>{`
                        .hover-trigger:hover .heart-btn { opacity: 1 !important; transform: scale(1.1); }
                        div:hover > .hover-trigger .heart-btn { opacity: 1 !important; }
                      `}</style>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : viewMode === 'gallery' ? (
            // Gallery grid mode - use absolute positioning with explicit dimensions for reliable scroll
            <div className="no-scrollbar gallery-scroll-container" style={{ 
              flex: 1,
              minHeight: 0,
              width: '100%',
              overflowY: 'auto',
              overflowX: 'hidden',
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain'
            }}>
              {(() => {
                const items: Artwork[] = filteredArtworks;
                // Mobile: 3 columns with smaller images, Desktop: 5 columns
                const gridColumns = isMobile ? 'repeat(3, 1fr)' : 'repeat(5, 1fr)';
                const gridGap = isMobile ? 8 : 64;
                // Narrow screens need more top padding to avoid overlapping with room/century selectors
                // Symmetric padding on narrow screens, left padding on wide to clear left panel
                const gridPadding = isMobile ? '100px 8px 60px 8px' : (isVeryNarrow ? '200px 16px 96px 16px' : (isNarrow ? '200px 24px 96px 24px' : '192px 48px 96px 160px'));
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: gridColumns, gap: gridGap, padding: gridPadding }}>
                    {items.map((a, idx) => {
                      // YouTube 영상 여부 확인
                      const isVideo = a.youtubeId || a.mediaType === 'video';
                      const isCurrentlyHovered = hoveredIndex === idx;
                      // 컨포넌트 레벨에서 관리하는 딜레이 상태 사용
                      const showIframe = isCurrentlyHovered && isVideo && galleryVideoReadyIdx === idx;
                      
                      return (
                      <div
                        key={a.id ?? `${idx}`}
                        className="group"
                        style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}
                      >
                        <div
                          style={{ width: isMobile ? '100%' : '60%', background: '#eee', borderRadius: 0, position: 'relative', aspectRatio: isVideo ? '16/9' : undefined }}
                          onMouseEnter={() => setHoveredIndex(idx)}
                          onMouseLeave={() => setHoveredIndex(null)}
                        >
                          {/* YouTube 영상인 경우 - iframe 아래, 썸네일 위에서 디졸브 */}
                          {isVideo && a.youtubeId ? (
                            <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
                              {/* iframe - 아래 레이어 (호버 시 바로 마운트) */}
                              {showIframe && (
                                <iframe
                                  src={`https://www.youtube.com/embed/${a.youtubeId}?autoplay=1&mute=1&controls=0&showinfo=0&loop=1&playlist=${a.youtubeId}&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0&playsinline=1&cc_load_policy=0`}
                                  title={a.name}
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  style={{ 
                                    position: 'absolute',
                                    top: '-60px',
                                    left: '-10%',
                                    width: '120%', 
                                    height: 'calc(100% + 120px)', 
                                    border: 'none',
                                    pointerEvents: 'none',
                                    zIndex: 1
                                  }}
                                />
                              )}
                              {/* 썸네일 - 위 레이어, 1초 후 디졸브로 사라짐 */}
                              {showIframe ? (
                                <img
                                  src={`https://img.youtube.com/vi/${a.youtubeId}/mqdefault.jpg`}
                                  alt={a.name}
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                  style={{ 
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%', 
                                    height: '100%', 
                                    objectFit: 'cover',
                                    zIndex: 2,
                                    opacity: galleryThumbnailHiddenIdx === idx ? 0 : 1,
                                    transition: 'opacity 0.5s ease-out',
                                    pointerEvents: 'none'
                                  }}
                                  onError={(e) => { e.currentTarget.src = a.image; }}
                                />
                              ) : (
                                <img
                                  src={`https://img.youtube.com/vi/${a.youtubeId}/mqdefault.jpg`}
                                  alt={a.name}
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                  onError={(e) => { e.currentTarget.src = a.image; }}
                                />
                              )}
                            </div>
                          ) : (
                            /* 일반 이미지 */
                            a.image && (() => {
                            const widths = window.innerWidth < 900 ? [320, 480, 640] : [360, 540, 720, 900];
                            const avif = buildVariantSourceSet(a, 'avif', widths, 65);
                            const webp = buildVariantSourceSet(a, 'webp', widths, 70);
                            const sizes = '(max-width: 640px) 90vw, (max-width: 1024px) 55vw, 40vw';
                            const preview = pickLowPlaceholder(a);
                            const isR2 = isR2Image(a.image);
                            return (
                              <picture>
                                {useProxy && avif && <source type="image/avif" srcSet={avif || undefined} sizes={sizes} />}
                                {useProxy && webp && <source type="image/webp" srcSet={webp || undefined} sizes={sizes} />}
                                <img
                                  src={preview}
                                  data-full={a.image}
                                  alt={a.name}
                                  loading="lazy"
                                  decoding="async"
                                  fetchPriority="low"
                                  referrerPolicy="no-referrer"
                                  style={{ 
                                    width: isR2 ? '117.65%' : '100%', // 1/0.85 = 117.65% to fill container when scaled
                                    height: 'auto', 
                                    display: 'block', 
                                    cursor: 'zoom-in',
                                    transform: isR2 ? 'scale(0.85)' : 'none',
                                    transformOrigin: 'top left'
                                  }}
                                  onClick={(e) => openLightbox(e, a)}
                                  onError={(e) => applyFallbackImage(e.currentTarget)}
                                />
                              </picture>
                            );
                          })()
                          )}
                        </div>
                        <div style={{ marginTop: 10, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontSize: isMobile ? 10 : 12, fontWeight: 400, color: '#222', display: 'flex', alignItems: 'center', gap: 6 }}>
                              {String(idx + 1).padStart(2, '0')}
                              {/* 영상에는 재생 아이콘 표시 */}
                              {isVideo && (
                                <span style={{ fontSize: 10, color: '#e11d48' }}>▶</span>
                              )}
                              <div style={{ opacity: isMobile ? 1 : 0 }} className="gallery-heart-trigger">
                                <HeartOverlay
                                  isLiked={likedArtworks.has(a.id)}
                                  onToggle={(e) => toggleLike(e, a)}
                                  style={{ padding: 0, background: 'none' }}
                                  size={isMobile ? 12 : 14}
                                  color="#e11d48"
                                  emptyColor="#888"
                                />
                              </div>
                            </div>
                            <div style={{ fontSize: isMobile ? 10 : 12, fontWeight: 700, color: '#222', marginTop: 2 }}>{a.name}{a.year ? ` (${a.year})` : ''}</div>
                            <div style={{ fontSize: isMobile ? 9 : 11, color: '#777', marginTop: 2 }}>{a.artist}</div>
                          </div>
                        </div>
                        <style>{`
                          .group:hover .gallery-heart-trigger { opacity: 1 !important; }
                        `}</style>
                      </div>
                    );
                    })}
                  </div>
                );
              })()}
            </div>
          ) : (
            // Panorama mode
            <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: panoramaDragging ? 'none' : 'auto', cursor: 'ew-resize', touchAction: 'none' }}
              onMouseDown={(e) => {
                e.preventDefault();
                if (filteredArtworks.length === 0) return;
                setPanoramaDragging(true);
                panStartXRef.current = e.clientX;
                panStartIndexRef.current = selectedIndex;
                const onMove = (ev: MouseEvent) => {
                  const dx = ev.clientX - panStartXRef.current;
                  const n = Math.max(1, filteredArtworks.length);
                  const pxPerImage = Math.max(12, Math.min(160, 480 / n));
                  const delta = Math.round(-dx / pxPerImage);
                  const next = Math.max(0, Math.min(n - 1, panStartIndexRef.current + delta));
                  setSelectedIndex(next);
                };
                const onUp = () => {
                  setPanoramaDragging(false);
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
              onTouchStart={(e) => {
                if (filteredArtworks.length === 0) return;
                const t = e.touches[0];
                setPanoramaDragging(true);
                panStartXRef.current = t.clientX;
                panStartIndexRef.current = selectedIndex;
              }}
              onTouchMove={(e) => {
                if (!panoramaDragging) return;
                const t = e.touches[0];
                const dx = t.clientX - panStartXRef.current;
                const n = Math.max(1, filteredArtworks.length);
                const pxPerImage = Math.max(12, Math.min(160, 480 / n));
                const delta = Math.round(-dx / pxPerImage);
                const next = Math.max(0, Math.min(n - 1, panStartIndexRef.current + delta));
                setSelectedIndex(next);
              }}
              onTouchEnd={() => setPanoramaDragging(false)}
            >
              {current ? (
                (() => {
                  const widths = window.innerWidth < 900 ? [800, 1200] : [960, 1280, 1600, 1920];
                  const avif = buildVariantSourceSet(current, 'avif', widths, 70);
                  const webp = buildVariantSourceSet(current, 'webp', widths, 75);
                  const sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 95vw, 90vw';
                  const lowSrc = pickLowPlaceholder(current);
                  return (
                    <div style={{ position: 'relative', width: 'fit-content' }}>
                      <picture>
                        {useProxy && avif && <source type="image/avif" srcSet={avif || undefined} sizes={sizes} />}
                        {useProxy && webp && <source type="image/webp" srcSet={webp || undefined} sizes={sizes} />}
                        <img
                          ref={mainImgRef}
                          src={lowSrc}
                          alt={current.name}
                          decoding="async"
                          fetchPriority="high"
                          draggable={false}
                          referrerPolicy="no-referrer"
                          data-hi={lowSrc === current.image ? '1' : '0'}
                          style={{
                            width: 'auto',
                            maxWidth: '92%',
                            maxHeight: 'calc(100vh - 200px)',
                            objectFit: 'contain',
                            display: 'block',
                            filter: mainLoaded ? 'none' : 'blur(14px)',
                            transition: 'filter 420ms ease, opacity 420ms ease',
                            opacity: mainLoaded ? 1 : 0.88,
                            background: '#111'
                          }}
                          onError={(e) => {
                            applyFallbackImage(e.currentTarget);
                            if (!mainLoaded) setMainLoaded(true);
                          }}
                        />
                      </picture>
                      {current && (
                        <HeartOverlay
                          isLiked={likedArtworks.has(current.id)}
                          onToggle={(e) => toggleLike(e, current)}
                          style={{ position: "absolute", bottom: 16, left: 16, zIndex: 30, padding: 0, background: 'none' }}
                          size={20}
                          color="#e11d48"
                          emptyColor="#fff"
                        />
                      )}
                    </div>
                  );
                })()
              ) : (
                initialized && filteredArtworks.length === 0 ? (
                  <div aria-label="update soon" role="img" title="update soon" style={{ color: '#999', margin: 'auto', fontWeight: 700 }}>update soon</div>
                ) : (
                  <div style={{ color: '#bbb', margin: 'auto' }}>No image</div>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* Animated lightbox (Genie-like) */}
      {
        lightbox && (
          <div
            onClick={closeLightbox}
            style={{
              position: 'fixed',
              inset: 0,
              background: lightbox.animate ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0)',
              transition: 'background 300ms ease',
              zIndex: 11000,
            }}
          >
            <div
              style={{
                position: 'fixed',
                left: 0,
                top: 0,
                width: lightbox.target.width,
                height: lightbox.target.height,
                transformOrigin: 'top left',
                transform: lightbox.animate
                  ? `translate(${lightbox.target.left}px, ${lightbox.target.top}px) scale(1, 1)`
                  : `translate(${lightbox.start.left}px, ${lightbox.start.top}px) scale(${Math.max(0.01, lightbox.start.width / Math.max(1, lightbox.target.width))}, ${Math.max(0.01, lightbox.start.height / Math.max(1, lightbox.target.height))})`,
                transition: 'transform 300ms cubic-bezier(0.22, 0.61, 0.36, 1)',
                overflow: 'hidden',
                background: '#000',
              }}
            >
              {(() => {
                const a = lightbox.artwork;
                const best = getBestFullUrl(a);
                let widths = window.innerWidth < 900 ? [960, 1280] : [1280, 1600, 1920, 2560];
                // Avoid generating src widths larger than the natural width to reduce upscaled picks
                if (lightbox.natWidth && Number.isFinite(lightbox.natWidth)) {
                  widths = widths.filter((w) => w <= (lightbox.natWidth as number));
                  if (widths.length === 0) widths = [Math.min(960, lightbox.natWidth as number)];
                }
                // Build srcsets off the best base URL using proxy (if available)
                const avif = useProxy ? buildSourceSet(best.url, widths, 'avif', 75) : null;
                const webp = useProxy ? buildSourceSet(best.url, widths, 'webp', 80) : null;
                const sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 95vw, 90vw';
                const full = best.url;
                return (
                  <picture>
                    {useProxy && avif && <source type="image/avif" srcSet={avif || undefined} sizes={sizes} />}
                    {useProxy && webp && <source type="image/webp" srcSet={webp || undefined} sizes={sizes} />}
                    <img
                      src={full}
                      alt={a.name}
                      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#000' }}
                      draggable={false}
                      referrerPolicy="no-referrer"
                      onError={(e) => applyFallbackImage(e.currentTarget)}
                    />
                  </picture>
                );
              })()}
            </div>
          </div>
        )
      }

      {/* Upload overlay removed in viewer mode */}
      {/* Hide scrollbars for filmstrip + ensure gallery scroll works */}
      <style>
        {`
          .no-scrollbar::-webkit-scrollbar { width: 0; height: 0; display: none; }
          .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
          .gallery-scroll-container { 
            overflow-y: scroll !important; 
            -webkit-overflow-scrolling: touch !important;
          }
        `}
      </style>

      {/* Submission Form Modal */}
      {showSubmissionForm && (
        <SubmissionForm
          exhibitionId={exhibition.id}
          exhibitionName={exhibition.name || exhibition.title || 'Exhibition'}
          museumName={(exhibition as any).museumName || (exhibition as any).parentMuseum || ''}
          onClose={() => setShowSubmissionForm(false)}
          onSuccess={() => setShowSubmissionForm(false)}
        />
      )}

      {/* Description Overlay Panel */}
      {isDescriptionExpanded && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 20000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setIsDescriptionExpanded(false)}
        >
          <div
            style={{
              background: '#fff',
              width: '90%',
              maxWidth: 600,
              maxHeight: '85vh',
              borderRadius: 8,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111' }}>{exhibition.title || exhibition.name}</h2>
                {(exhibition as any).startDate && (exhibition as any).endDate && (
                  <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                    {(exhibition as any).startDate} – {(exhibition as any).endDate}
                  </div>
                )}
                {(exhibition as any).pricing && (
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{(exhibition as any).pricing}</div>
                )}
              </div>
              <button
                onClick={() => setIsDescriptionExpanded(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 20,
                  cursor: 'pointer',
                  color: '#666',
                  padding: '0 4px',
                }}
              >
                ×
              </button>
            </div>
            {/* Content - scrollable area including cover image */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
              {/* Cover Image - use coverImage first, then image, then first artwork */}
              {(() => {
                const coverImage = (exhibition as any).coverImage;
                const exhibitionImage = (exhibition as any).image;
                const fallbackImage = artworks.length > 0 ? artworks[0].image : null;
                const imageToShow = coverImage || exhibitionImage || fallbackImage;
                
                if (!imageToShow) return null;
                return (
                  <div style={{ width: '100%', background: '#f5f5f5' }}>
                    <img
                      src={imageToShow}
                      alt={exhibition.title || exhibition.name}
                      style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain' }}
                      referrerPolicy="no-referrer"
                    />
                  </div>
                );
              })()}
              {/* Description content */}
              <div style={{ padding: '20px' }}>
                {/* Gallery Images - horizontal scroll */}
                {Array.isArray((exhibition as any).galleryImages) && (exhibition as any).galleryImages.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: 12, fontWeight: 700, color: '#666', textTransform: 'uppercase' }}>Gallery</h4>
                    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
                      {(exhibition as any).galleryImages.map((img: string, idx: number) => (
                        <img
                          key={idx}
                          src={img}
                          alt={`Gallery ${idx + 1}`}
                          style={{ height: 150, width: 'auto', borderRadius: 4, flexShrink: 0, objectFit: 'cover' }}
                          referrerPolicy="no-referrer"
                        />
                      ))}
                    </div>
                  </div>
                )}
                {/* Videos */}
                {Array.isArray((exhibition as any).videos) && (exhibition as any).videos.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: 12, fontWeight: 700, color: '#666', textTransform: 'uppercase' }}>Videos</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {(exhibition as any).videos.map((videoUrl: string, idx: number) => (
                        <div key={idx} style={{ aspectRatio: '16/9', borderRadius: 6, overflow: 'hidden' }}>
                          <iframe
                            width="100%"
                            height="100%"
                            src={videoUrl}
                            title={`Video ${idx + 1}`}
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            style={{ display: 'block' }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Description text - support fullDescription */}
                {(exhibition as any).descriptionHtml ? (
                  <div
                    style={{ fontSize: 14, lineHeight: 1.7, color: '#333' }}
                    className="exhibition-description-html"
                    dangerouslySetInnerHTML={{ __html: (exhibition as any).descriptionHtml }}
                  />
                ) : (
                  <div style={{ fontSize: 14, lineHeight: 1.7, color: '#333', whiteSpace: 'pre-wrap' }}>
                    {(exhibition as any).fullDescription || (exhibition as any).detailedDescription || exhibition.description || 'No description available.'}
                  </div>
                )}
                {/* Date range */}
                {(exhibition as any).dateRange && (
                  <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #eee' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: 12, fontWeight: 700, color: '#666', textTransform: 'uppercase' }}>Date</h4>
                    <div style={{ fontSize: 13, color: '#333' }}>{(exhibition as any).dateRange}</div>
                  </div>
                )}
                {/* External link - hidden but preserved */}
                {false && (exhibition as any).url && (
                  <div style={{ marginTop: 16 }}>
                    <a
                      href={(exhibition as any).url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 13, color: '#3b82f6', textDecoration: 'none' }}
                    >
                      Visit official page →
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExhibitionModal;