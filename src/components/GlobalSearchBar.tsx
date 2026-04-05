import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { searchByText, preloadEncoder, onEncoderStatusChange, getEncoderStatus } from '../utils/siglipSearch';
import { getSearchThumbnail, getLightboxImage, getOptimizedImageUrl, normalizeImageUrl } from '../utils/imageProxy';
import { getWorkerNetworkMode, shouldLimitNetwork } from '../utils/network';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, setDoc, deleteDoc, onSnapshot, getDocs } from 'firebase/firestore';
import { HeartOverlay } from './HeartOverlay';
import { ProductModal } from './ProductModal';
import ArtistWikiPanel from './ArtistWikiPanel';
import { artists } from '../data/artists';
const ArtistDistributionMap = lazy(() => import('./ArtistDistributionMap'));

function buildFallbackAscii(name: string) {
    const clean = (name || 'Artist').trim() || 'Artist';
    const displayable = clean.length > 18 ? `${clean.slice(0, 15)}...` : clean;
    const padded = ` ${displayable} `;
    const border = '─'.repeat(padded.length);
    return `┌${border}┐\n│${padded}│\n└${border}┘`;
}



export type SearchableArtwork = {
    id: string;
    name: string;
    artist: string;
    image: string;
    date?: string;
    museumName: string;
    exhibitionId: string;
    searchName?: string;
    searchArtist?: string;
    sourceUrl?: string;
};

export type Museum = {
    id: string;
    name: string;
    country: string;
    region?: string;
    latitude: number;
    longitude: number;
    representativeImage?: string;
    permanentExhibitions?: { id: string, name: string }[];
};

type GlobalSearchBarProps = { forceWidth?: string;
    onOpenLightbox?: (artwork: SearchableArtwork, openLightbox?: boolean) => void;
    onNavigateToMuseum?: (museum: { id: string, name: string }, collectionId?: string, artwork?: SearchableArtwork) => void;
    museums?: Museum[];
    isModalOpen?: boolean;
    initialQuery?: string;
    isMobile?: boolean;
    inlineMode?: boolean;
    isDark?: boolean;
    drawingSkin?: boolean;
};

const normalizeToken = (value?: string) => (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '');

const getExhibitionTokens = (entry?: { [key: string]: any } | null) => {
    const tokens = new Set<string>();
    const addToken = (value?: string | null) => {
        const token = normalizeToken(value || undefined);
        if (token) tokens.add(token);
    };
    if (!entry) return tokens;
    addToken(entry.id);
    addToken(entry.name);
    addToken(entry.title);
    addToken(entry.slug);
    addToken(entry.collectionId);
    const file = entry.collectionFile;
    if (typeof file === 'string') {
        addToken(file.replace(/\.json$/i, ''));
    }
    const aliases = entry.aliases;
    if (Array.isArray(aliases)) aliases.forEach(addToken);
    return tokens;
};

const formatArtworkYear = (value?: string) => {
    if (!value) return '';
    const normalized = value
        .replace(/[a-zA-Z]+/g, ' ')
        .replace(/[^0-9\- ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized) return '';
    const matches = normalized.match(/\d{1,4}/g);
    if (!matches) return '';
    let last = matches[matches.length - 1];
    if (last.length < 4 && matches.length > 1) {
        const donor = [...matches]
            .slice(0, -1)
            .reverse()
            .find(token => token.length === 4) || matches[matches.length - 2];
        if (donor && donor.length >= last.length) {
            const prefix = donor.slice(0, donor.length - last.length);
            last = `${prefix}${last}`;
        }
    }
    const trimmed = last.replace(/^0+/, '');
    return trimmed || last;
};

const describeArtworkHighlight = (art?: SearchableArtwork) => {
    if (!art) return '';
    const yearLabel = formatArtworkYear(art.date);
    const museumLabel = art.museumName?.trim();
    if (yearLabel && museumLabel) return `${art.name} (${yearLabel}, ${museumLabel})`;
    if (yearLabel) return `${art.name} (${yearLabel})`;
    if (museumLabel) return `${art.name} - ${museumLabel}`;
    return art.name;
};

// Fallback image for broken images
const FALLBACK_IMG = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23f3f4f6" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%23999" font-size="12">No Image</text></svg>';

const normalizeKnownBrokenImageUrl = (value?: string): string => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    // Ignore malformed placeholders coming from legacy datasets.
    if (raw === 'default.jpg' || raw === '/default.jpg') return '';

    return normalizeImageUrl(raw);
};

const getSafeImageUrl = (value?: string): string => normalizeKnownBrokenImageUrl(value) || FALLBACK_IMG;

const normalizeLookupText = (value?: string) =>
    String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

const ARTIST_INTENT_STOP_TOKENS = new Set([
    'a', 'an', 'the', 'of', 'and', 'or', 'to', 'for', 'in', 'on', 'at', 'by', 'with',
    'de', 'la', 'le', 'du', 'des', 'van', 'von', 'da', 'di', 'del', 'della'
]);

const extractYearToken = (value?: string) => {
    const m = String(value || '').match(/(\d{4})/);
    return m ? m[1] : '';
};

const buildBrueckeLookupKeyCandidates = (art: any): string[] => {
    const title = normalizeLookupText(art?.name || art?.title);
    const artist = normalizeLookupText(art?.artist);
    const year = extractYearToken(art?.date || art?.year);
    const keys = [
        `${title}__${artist}__${year}`,
        `${title}__${artist}`,
        `${title}__${year}`,
        `${title}`,
    ];
    return keys.filter((k) => k && !k.startsWith('__'));
};

export default function GlobalSearchBar({ forceWidth, onOpenLightbox, onNavigateToMuseum, museums = [], isModalOpen, inlineMode = false, drawingSkin = false }: GlobalSearchBarProps) {
    void onOpenLightbox; // Deprecated callback (kept for prop compatibility)
    const navigate = useNavigate();
    const location = useLocation();
    const { artistName: routeArtistSlug } = useParams<{ artistName?: string }>();
    // Restore query from sessionStorage if available
    const [query, setQuery] = useState(() => {
        try {
            const saved = sessionStorage.getItem('globalSearchQuery');
            return saved || '';
        } catch {
            return '';
        }
    });
    const [isExpanded, setIsExpanded] = useState(false);
    const [filteredArtworks, setFilteredArtworks] = useState<SearchableArtwork[]>([]);
    const [suggestedArtists, setSuggestedArtists] = useState<{ artist: string; count: number }[]>([]);
    const [filteredMuseums, setFilteredMuseums] = useState<Museum[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const workerRef = useRef<Worker | null>(null);
    const pendingRouteArtistRef = useRef<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isNetworkConstrained] = useState(() => shouldLimitNetwork());
    // Restore artistGallery from sessionStorage if available
    const [artistGallery, setArtistGallery] = useState<{ artist: string; artworks: SearchableArtwork[] } | null>(() => {
        try {
            const saved = sessionStorage.getItem('artistGallery');
            if (saved) {
                const data = JSON.parse(saved);
                // Sanitize/Fix IDs on load (Critical for MAMCS navigation fix)
                let works = data.artworks || [];
                works = works.map((art: any) => {
                    if (art.id && (art.id.startsWith('mamcs-') || art.id.startsWith('mamcs_'))) {
                        if (art.id.startsWith('mamcs-paintings-')) art.exhibitionId = 'mamcs-strasbourg-paintings-collection';
                        else if (art.id.startsWith('mamcs-drawings-')) art.exhibitionId = 'mamcs-strasbourg-drawings-collection';
                        else if (art.id.startsWith('mamcs-photography-')) art.exhibitionId = 'mamcs-strasbourg-photography-collection';
                        else if (art.id.startsWith('mamcs-graphic-design-')) art.exhibitionId = 'mamcs-strasbourg-graphic-design-collection';
                    }
                    return art;
                });
                works = works.filter((art: any) => {
                    const museumName = (art.museumName || '').toLowerCase();
                    const exhibitionId = (art.exhibitionId || '').toLowerCase();
                    if (museumName.includes('serpentine gallery') || museumName.includes('british museum')) return false;
                    if (exhibitionId.includes('serpentine') || exhibitionId.includes('british-museum') || exhibitionId.includes('the-british-museum') || exhibitionId.includes('bm-collection')) return false;
                    return true;
                });
                if (works.length === 0) return null;
                return { artist: data.artist, artworks: works };
            }
        } catch {
            // Ignore parse errors
        }
        return null;
    });
    const [lightboxArtwork, setLightboxArtwork] = useState<SearchableArtwork | null>(null);
    const [productArtwork, setProductArtwork] = useState<SearchableArtwork | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const queryRef = useRef(query);

    // AI Semantic Search (Transformers.js 브라우저 WASM + HF API 폴백)
    const [isAIMode, setIsAIMode] = useState(false);
    const [aiResults, setAiResults] = useState<SearchableArtwork[]>([]);
    const [isAILoading, setIsAILoading] = useState(false);
    const [isClipLoading, setIsClipLoading] = useState(false); // 호환성 유지 (항상 false)
    const [encoderStatus, setEncoderStatusState] = useState<'idle' | 'loading' | 'ready' | 'error'>(getEncoderStatus);

    // Recommendation Mode
    const [isRecommendMode, setIsRecommendMode] = useState(false);
    const [recommendResults, setRecommendResults] = useState<SearchableArtwork[]>([]);
    const [isRecommendLoading, setIsRecommendLoading] = useState(false);

    const [aiFilteredCount, setAiFilteredCount] = useState(0);
    const [videoEmbedIdsReady, setVideoEmbedIdsReady] = useState(false);
    const videoEmbedIdsRef = useRef<Set<string>>(new Set());

    const knownArtistTokenSet = useMemo(() => {
        const tokens = new Set<string>();
        for (const entry of artists as Array<{ name?: string }>) {
            const normalizedName = normalizeLookupText(entry?.name || '');
            if (!normalizedName) continue;
            for (const token of normalizedName.split(' ')) {
                if (token.length < 3) continue;
                if (ARTIST_INTENT_STOP_TOKENS.has(token)) continue;
                tokens.add(token);
            }
        }
        return tokens;
    }, []);

    // 인코더 상태 구독 (모델 로딩 진행 UI)
    useEffect(() => {
        const unsub = onEncoderStatusChange(setEncoderStatusState);
        return unsub;
    }, []);

    const requestLoginModal = useCallback(() => {
        if (typeof window === 'undefined') return;
        try {
            window.dispatchEvent(new CustomEvent('auth:request-login'));
        } catch (err) {
            console.error('Failed to dispatch login modal request', err);
        }
    }, []);

    const sanitizeArtistId = (value: string) => {
        // Revert to allow parentheses for DB consistency
        return (value || '')
            .replace(/[\/\\#\[\].*?]/g, '_')
            .trim()
            .slice(0, 200);
    };

    const toArtistSlug = (value: string) => {
        // Strip parentheses for cleaner URLs
        return sanitizeArtistId(value)
            .replace(/[()]/g, '')
            .replace(/[\s_]+/g, '-')
            .replace(/-+/g, '-')
            .toLowerCase();
    };

    const getRouteArtistName = useCallback(() => {
        const params = new URLSearchParams(location.search);
        let nameFromQuery = params.get('name')?.trim();
        if (nameFromQuery) {
            nameFromQuery = nameFromQuery.split('?')[0].split('&')[0];
            return nameFromQuery;
        }
        if (!routeArtistSlug) return '';
        return decodeURIComponent(routeArtistSlug).replace(/[-_]+/g, ' ').trim();
    }, [location.search, routeArtistSlug]);

    const isDrawingGalleryMode = useMemo(() => {
        const params = new URLSearchParams(location.search);
        return drawingSkin || params.get('mode') === 'drawing';
    }, [drawingSkin, location.search]);

    const GALLERY_Z_BASE = 4500;
    const GALLERY_Z_BELOW_MODAL = 3400;
    // Dynamic Z-Index for ArtistGallery window management
    const [galleryZIndex, setGalleryZIndex] = useState(GALLERY_Z_BASE);
    const [galleryVisibleCount, setGalleryVisibleCount] = useState(160);
    const [galleryTheme, setGalleryTheme] = useState<'dark' | 'light'>(() => {
        try { return localStorage.getItem('homeTheme') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
    });
    const [galleryCategory, setGalleryCategory] = useState<string | null>(null);
    const [galleryWikiUrl, setGalleryWikiUrl] = useState('');
    const [galleryAsciiArt, setGalleryAsciiArt] = useState('');
    const [galleryMapSlide, setGalleryMapSlide] = useState(0);
    const [brueckeR2Lookup, setBrueckeR2Lookup] = useState<Record<string, string>>({});
    const slideDragStartX = useRef<number | null>(null);
    const slideDragPointerId = useRef<number | null>(null);
    const galleryContainerRef = useRef<HTMLDivElement>(null);

    const moveGallerySlideByDelta = (delta: number) => {
        if (Math.abs(delta) < 22) return;
        setGalleryMapSlide(prev => delta < 0 ? Math.min(2, prev + 1) : Math.max(0, prev - 1));
    };

    // Nav/dropdown theme — synced with the global homeTheme preference
    const [isNavDark, setIsNavDark] = useState(() => {
        try { return localStorage.getItem('homeTheme') !== 'light'; } catch { return true; }
    });
    useEffect(() => {
        const sync = () => {
            try {
                const isLight = localStorage.getItem('homeTheme') === 'light';
                setIsNavDark(!isLight);
                setGalleryTheme(isLight ? 'light' : 'dark');
            } catch { /* ignore */ }
        };
        window.addEventListener('storage', sync);
        window.addEventListener('theme-changed', sync as EventListener);
        return () => {
            window.removeEventListener('storage', sync);
            window.removeEventListener('theme-changed', sync as EventListener);
        };
    }, []);

    useEffect(() => {
        setGalleryVisibleCount(isMobile ? 80 : 160);
    }, [isMobile, artistGallery?.artist, galleryCategory]);

    useEffect(() => {
        if (isDrawingGalleryMode) {
            setGalleryTheme('light');
        }
    }, [isDrawingGalleryMode]);

    useEffect(() => {
        // When Artist Gallery opens or content updates, bring to front
        if (artistGallery) {
            setGalleryZIndex(GALLERY_Z_BASE);
        }
    }, [artistGallery]);

    // ── Category normalization for filter pills ────────────────────────────
    const normalizeArtworkCategory = useCallback((art: SearchableArtwork): string => {
        const raw = (
            (art as any).category ||
            (art as any).artworkType ||
            (art as any).medium ||
            ''
        ).toLowerCase();
        const exhId = (art.exhibitionId || '').toLowerCase();
        // Also check museum name for category clues (e.g., "Gemäldegalerie" → Painting)
        const musName = (art.museumName || '').toLowerCase();
        const combined = raw + ' ' + exhId + ' ' + musName;
        if (/paint|peinture|pittura|油画|회화|gemälde|pinacoth|pinakoth|malerei/.test(combined)) return 'Painting';
        if (/watercolor|watercolour|aquarell|gouache/.test(combined)) return 'Watercolor';
        if (/draw|sketch|dessin|素描|zeichnung/.test(combined)) return 'Drawing';
        if (/print|etching|lithograph|engraving|woodcut|druckgraphik/.test(combined)) return 'Print';
        if (/photo/.test(combined)) return 'Photography';
        if (/sculpt|bronze|marble|terracotta|relief|plastik/.test(combined)) return 'Sculpture';
        if (/film|video/.test(combined)) return 'Film & Video';
        if (/textile|fashion|costume|fabric/.test(combined)) return 'Textile';
        if (/ceramic|porcelain|glass|decor|applied|craft|furniture/.test(combined)) return 'Decorative Arts';
        if (/poster/.test(combined)) return 'Poster';
        if (/manuscript|letter|document/.test(combined)) return 'Works on Paper';
        // Fallback: use museum name as the grouping key so pills always appear
        return art.museumName || 'Other';
    }, []);

    // Available categories for this artist (keyword-based or museum-based fallback)
    const galleryCategories = useMemo(() => {
        if (!artistGallery?.artworks?.length) return [];
        const counts = new Map<string, number>();
        for (const art of artistGallery.artworks) {
            const cat = normalizeArtworkCategory(art);
            counts.set(cat, (counts.get(cat) || 0) + 1);
        }
        return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .filter(([cat, cnt]) => cnt >= 2 && cat !== 'Other')
            .slice(0, 7)  // max 7 pills
            .map(([cat, cnt]) => ({ cat, cnt }));
    }, [artistGallery, normalizeArtworkCategory]);

    // Reset category filter and map slide when artist changes
    useEffect(() => {
        setGalleryCategory(null);
        setGalleryMapSlide(0);
    }, [artistGallery?.artist]);

    const artworkSortPriority = (art: any): number => {
        const name = String(art.name || '').toLowerCase();
        const id = String(art.id || '');
        const exhibitionId = String(art.exhibitionId || '').toLowerCase();
        const category = String((art as any).category || '').toLowerCase();
        // Letters/text: lowest priority (pushed to end)
        const isLetter = /\bletter[s]?\b|\blettre[s]?\b|\bbrief[e]?\b|\bcorrespondence\b|\bmanuscript\b/.test(name)
            || /^b[a-z]?\d+[a-z]*v\d{4}/i.test(id)
            || /^ba?\d+$/.test(id.toLowerCase())
            || category === 'letter' || category === 'letters';
        if (isLetter) return 2;
        // Paintings: highest priority (pushed to front)
        const isPainting = category === 'painting' || category === 'paintings'
            || exhibitionId.includes('painting')
            || /\bpainting\b|\bpeinture\b|\bgemälde\b|\bschilderij\b/.test(category);
        if (isPainting) return 0;
        return 1;
    };

    const filteredGalleryArtworks = useMemo(() => {
        if (!artistGallery?.artworks?.length) return [] as SearchableArtwork[];
        const list = galleryCategory
            ? artistGallery.artworks.filter(art => normalizeArtworkCategory(art) === galleryCategory)
            : artistGallery.artworks;
        // Paintings first, letters/text last
        return [...list].sort((a, b) => artworkSortPriority(a) - artworkSortPriority(b));
    }, [artistGallery, galleryCategory, normalizeArtworkCategory]);

    const visibleGalleryArtworks = useMemo(() => {
        return filteredGalleryArtworks.slice(0, galleryVisibleCount);
    }, [filteredGalleryArtworks, galleryVisibleCount]);

    const artistGalleryColumns = useMemo(() => {
        if (!artistGallery || !artistGallery.artworks?.length) return [];
        if (!visibleGalleryArtworks.length) return [];
        const desiredCount = isMobile ? 2 : 4;
        const safeCount = Math.min(desiredCount, Math.max(1, visibleGalleryArtworks.length));
        const columns = Array.from({ length: safeCount }, () => [] as SearchableArtwork[]);
        visibleGalleryArtworks.forEach((art, index) => {
            columns[index % safeCount].push(art);
        });
        return columns;
    }, [artistGallery, isMobile, visibleGalleryArtworks]);

    const artistFallbackDescription = useMemo(() => {
        if (!artistGallery?.artworks?.length) return '';
        const highlights = artistGallery.artworks
            .slice(0, 3)
            .map(describeArtworkHighlight)
            .filter(Boolean)
            .join(' · ');
        const countLabel = artistGallery.artworks.length.toLocaleString();
        let base = `${artistGallery.artist}의 작품 ${countLabel}점이 아르민 라이브러리에 등록되어 있습니다.`;
        if (highlights) {
            base += ` 대표 작품: ${highlights}.`;
        }
        return base;
    }, [artistGallery]);

    const museumCountryMap = useMemo(() => {
        const map = new Map<string, string>();
        (museums || []).forEach((museum) => {
            if (museum?.name) {
                map.set(museum.name, museum.country || '');
            }
        });
        return map;
    }, [museums]);

    const galleryFoundArtist = useMemo(() => {
        if (!artistGallery?.artist) return null;
        const name = artistGallery.artist.toLowerCase();
        return artists.find(a => a.name.toLowerCase() === name) || null;
    }, [artistGallery?.artist]);


    useEffect(() => {
        if (isModalOpen) {
            setGalleryZIndex(GALLERY_Z_BELOW_MODAL);
        } else if (!artistGallery) {
            setGalleryZIndex(GALLERY_Z_BASE);
        }
    }, [isModalOpen, artistGallery]);

    const overlayActive = !!artistGallery || !!isModalOpen;
    const overlayStateRef = useRef(false);

    useEffect(() => {
        if (overlayActive && !overlayStateRef.current) {
            // Collapse once when a modal/gallery first opens, but allow manual reopen
            setIsExpanded(false);
        }
        overlayStateRef.current = overlayActive;
    }, [overlayActive]);

    // Wiki URL for artist gallery hero
    useEffect(() => {
        if (!artistGallery?.artist) { setGalleryWikiUrl(''); return; }
        const controller = new AbortController();
        const encoded = encodeURIComponent(artistGallery.artist);
        fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`, { signal: controller.signal })
            .then(r => r.json())
            .then(data => { if (!controller.signal.aborted) setGalleryWikiUrl(data.content_urls?.desktop?.page || ''); })
            .catch(() => {});
        return () => controller.abort();
    }, [artistGallery?.artist]);

    // ASCII art for artist gallery bio
    useEffect(() => {
        if (!artistGallery?.artist) {
            setGalleryAsciiArt('');
            return;
        }
        // Avoid cross-origin fetch noise and stalls from artii.herokuapp.com CORS errors.
        setGalleryAsciiArt(buildFallbackAscii(artistGallery.artist));
    }, [artistGallery?.artist]);

    const loadMoreGalleryArtworks = useCallback(() => {
        setGalleryVisibleCount((prev) => {
            if (prev >= filteredGalleryArtworks.length) return prev;
            return Math.min(filteredGalleryArtworks.length, prev + (isMobile ? 60 : 120));
        });
    }, [filteredGalleryArtworks.length, isMobile]);

    const handleGalleryScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        if (el.scrollHeight - (el.scrollTop + el.clientHeight) < 500) {
            loadMoreGalleryArtworks();
        }
    }, [loadMoreGalleryArtworks]);

    useEffect(() => {
        const shouldLoadLookup = !!artistGallery?.artworks?.some((art) => {
            const museum = String(art.museumName || '').toLowerCase();
            const image = String(art.image || '').toLowerCase();
            return museum.includes('brücke') || museum.includes('brucke') || image.includes('deutsche-digitale-bibliothek.de');
        });
        if (!shouldLoadLookup) return;

        let cancelled = false;
        fetch('/data/bruecke-museum-collection.json', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (cancelled || !data) return;
                const items = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
                const next: Record<string, string> = {};
                for (const item of items) {
                    const image = String(item?.imageUrl || item?.image || '').trim();
                    if (!image || !/\.r2\.dev\//i.test(image)) continue;
                    const keys = buildBrueckeLookupKeyCandidates({
                        name: item?.title,
                        artist: item?.artist,
                        date: item?.date,
                        year: item?.year,
                    });
                    for (const k of keys) {
                        if (!next[k]) next[k] = image;
                    }
                }
                setBrueckeR2Lookup(next);
            })
            .catch(() => { /* ignore */ });

        return () => { cancelled = true; };
    }, [artistGallery?.artist, artistGallery?.artworks]);

    const resolveGalleryImageUrl = useCallback((art: SearchableArtwork) => {
        const normalized = normalizeKnownBrokenImageUrl(art.image);
        const museum = String(art.museumName || '').toLowerCase();
        const looksBruecke = museum.includes('brücke') || museum.includes('brucke');
        const isDdb = /deutsche-digitale-bibliothek\.de/i.test(normalized);
        if (looksBruecke && (!normalized || isDdb)) {
            const keys = buildBrueckeLookupKeyCandidates(art);
            for (const k of keys) {
                if (brueckeR2Lookup[k]) return brueckeR2Lookup[k];
            }
        }
        return normalized || FALLBACK_IMG;
    }, [brueckeR2Lookup]);



    // User & Likes Logic
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [likedArtworks, setLikedArtworks] = useState<Set<string>>(new Set());
    const [likedArtists, setLikedArtists] = useState<Set<string>>(new Set());

    const artistGalleryLikeKey = artistGallery?.artist ? sanitizeArtistId(artistGallery.artist) : '';
    const artistGalleryIsLiked = artistGalleryLikeKey ? likedArtists.has(artistGalleryLikeKey) : false;

    useEffect(() => {
        let unsubArt: (() => void) | null = null;
        let unsubArtist: (() => void) | null = null;
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            if (unsubArt) {
                unsubArt();
                unsubArt = null;
            }
            if (unsubArtist) {
                unsubArtist();
                unsubArtist = null;
            }
            if (user) {
                if (shouldLimitNetwork()) {
                    getDocs(collection(db, `users/${user.uid}/liked_artworks`)).then((snap) => {
                        const ids = new Set(snap.docs.map(doc => doc.id));
                        setLikedArtworks(ids);
                    }).catch(() => {
                        setLikedArtworks(new Set());
                    });
                    getDocs(collection(db, `users/${user.uid}/liked_artists`)).then((snap) => {
                        const ids = new Set(snap.docs.map(doc => doc.id));
                        setLikedArtists(ids);
                    }).catch(() => {
                        setLikedArtists(new Set());
                    });
                    return;
                }
                // Subscribe to liked artworks
                unsubArt = onSnapshot(collection(db, `users/${user.uid}/liked_artworks`), (snap) => {
                    const ids = new Set(snap.docs.map(doc => doc.id));
                    setLikedArtworks(ids);
                });
                // Subscribe to liked artists
                unsubArtist = onSnapshot(collection(db, `users/${user.uid}/liked_artists`), (snap) => {
                    const ids = new Set(snap.docs.map(doc => doc.id));
                    setLikedArtists(ids);
                });
            } else {
                setLikedArtworks(new Set());
                setLikedArtists(new Set());
            }
        });
        return () => {
            if (unsubArt) unsubArt();
            if (unsubArtist) unsubArtist();
            unsubscribe();
        };
    }, []);

    // ── 취향 프로파일 업데이트 (3초 디바운스) ──────────────────────────────────
    const tasteProfileUpdateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const scheduleTasteProfileUpdate = useCallback((userId: string, likedIds: string[]) => {
        // 최소 3개 이상 하트가 있어야 의미있는 프로파일 생성
        if (likedIds.length < 3) return;

        if (tasteProfileUpdateTimer.current) {
            clearTimeout(tasteProfileUpdateTimer.current);
        }
        tasteProfileUpdateTimer.current = setTimeout(async () => {
            try {
                await fetch('https://armin-semantic-search.armin-art.workers.dev/taste-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, likedIds }),
                });
            } catch {
                // 취향 프로파일 업데이트 실패 시 무시 (사용자 경험에 영향 없음)
            }
        }, 3000); // 3초 디바운스
    }, []);

    // ── 추천 작품 로드 ────────────────────────────────────────────────────────
    const fetchRecommendations = useCallback(async (userId: string, likedIds: string[]) => {
        if (likedIds.length < 3) {
            setRecommendResults([]);
            return;
        }
        setIsRecommendLoading(true);
        try {
            const res = await fetch('https://armin-semantic-search.armin-art.workers.dev/recommend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, likedIds, limit: 30 }),
            });
            if (!res.ok) throw new Error('recommend failed');
            const data: { results?: { id: string; name: string; artist: string; date: string; museumName: string; image: string; score: number }[] } = await res.json();
            const results: SearchableArtwork[] = (data.results || []).map(r => ({
                id: r.id,
                name: r.name,
                artist: r.artist,
                image: r.image,
                date: r.date,
                museumName: r.museumName,
                exhibitionId: '',
            }));
            setRecommendResults(results);
        } catch {
            setRecommendResults([]);
        } finally {
            setIsRecommendLoading(false);
        }
    }, []);

    const toggleLikeArtwork = async (e: React.MouseEvent, art: SearchableArtwork) => {
        e.stopPropagation();
        if (!currentUser) {
            requestLoginModal();
            return;
        }
        if (!art.id) {
            console.warn('Cannot like artwork without ID');
            return;
        }
        try {
            const ref = doc(db, `users/${currentUser.uid}/liked_artworks/${art.id}`);
            if (likedArtworks.has(art.id)) {
                await deleteDoc(ref);
            } else {
                await setDoc(ref, {
                    ...art,
                    artworkId: art.id,
                    id: art.id,
                    title: art.name || art.n || art.title || 'Untitled',
                    artist: art.artist || art.a || 'Unknown',
                    image: art.image || art.i || '',
                    museumName: art.museumName || art.m || '',
                    year: art.date || art.d || '',
                    exhibitionId: art.exhibitionId || art.e || '',
                    likedAt: new Date()
                });
            }

            // 취향 프로파일 비동기 업데이트 (하트 결과 반영)
            const newLikedIds = likedArtworks.has(art.id)
                ? Array.from(likedArtworks).filter(id => id !== art.id)
                : [...Array.from(likedArtworks), art.id];
            scheduleTasteProfileUpdate(currentUser.uid, newLikedIds);

        } catch (error) {
            console.error('Failed to toggle artwork like:', error);
        }
    };

    const toggleLikeArtist = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!artistGallery) return;
        if (!currentUser) {
            requestLoginModal();
            return;
        }
        const artistName = artistGallery.artist;
        if (!artistName) return;

        const artistId = sanitizeArtistId(artistName);

        try {
            const ref = doc(db, `users/${currentUser.uid}/liked_artists/${artistId}`);
            if (likedArtists.has(artistId)) {
                await deleteDoc(ref);
            } else {
                await setDoc(ref, {
                    artist: artistName,
                    count: artistGallery.artworks.length,
                    image: artistGallery.artworks[0]?.image || '',
                    likedAt: new Date()
                });
            }
        } catch (error) {
            console.error('Failed to toggle artist like:', error);
        }
    };

    useEffect(() => { queryRef.current = query; }, [query]);

    // Save query to sessionStorage whenever it changes
    useEffect(() => {
        try {
            if (query) {
                sessionStorage.setItem('globalSearchQuery', query);
            } else {
                sessionStorage.removeItem('globalSearchQuery');
            }
        } catch (e) {
            console.error('Failed to save query to sessionStorage', e);
        }
    }, [query]);

    // Height animation logic
    const contentRef = useRef<HTMLDivElement>(null);
    const [containerHeight, setContainerHeight] = useState(50); // Default collapsed height

    useEffect(() => {
        if (!contentRef.current) return;

        // Measure function
        const updateHeight = () => {
            if (!isExpanded) {
                setContainerHeight(50);
                return;
            }
            if (contentRef.current) {
                const contentH = contentRef.current.scrollHeight;
                // Clamp max height
                // Mobile: 100vh - 80px (header + gap)
                // Desktop: 80vh
                const maxH = window.innerWidth < 768
                    ? window.innerHeight - 80
                    : window.innerHeight * 0.8;

                const target = Math.min(contentH + 60, maxH);
                setContainerHeight(target);
            }
        };

        // Run immediately
        updateHeight();

        // Also run on window resize
        window.addEventListener('resize', updateHeight);
        return () => window.removeEventListener('resize', updateHeight);
    }, [isExpanded, filteredArtworks, suggestedArtists, filteredMuseums, aiResults, query, isAIMode, isLoading]);

    // Detect mobile
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, [videoEmbedIdsReady]);

    const lastProgressAtRef = useRef(0);

    const ensureWorker = useCallback(() => {
        if (workerRef.current) return;

        workerRef.current = new Worker(new URL('../workers/search.worker.ts', import.meta.url), { type: 'module' });

        workerRef.current.onmessage = (e) => {
            const { type, results, artists, count, artist, works } = e.data;

            // --- PRECISE COLLECTION RESOLVER ---
            // Helper to fix exhibitionId based on artwork ID patterns (for MAMCS, etc)
            const resolvePreciseCollectionId = (art: SearchableArtwork) => {
                // MAMCS Strasbourg Logic — guard: id may be numeric from some sources
                const id = String(art.id ?? '');
                if (id && (id.startsWith('mamcs-') || id.startsWith('mamcs_'))) {
                    if (id.startsWith('mamcs-paintings-')) return 'mamcs-strasbourg-paintings-collection';
                    if (id.startsWith('mamcs-drawings-')) return 'mamcs-strasbourg-drawings-collection';
                    if (id.startsWith('mamcs-photography-')) return 'mamcs-strasbourg-photography-collection';
                    if (id.startsWith('mamcs-graphic-design-')) return 'mamcs-strasbourg-graphic-design-collection';
                }
                return art.exhibitionId;
            };

            if (type === 'LOAD_PROGRESS') {
                const now = Date.now();
                // Throttle progress UI updates to avoid global jank.
                if (now - lastProgressAtRef.current > 350) {
                    lastProgressAtRef.current = now;
                    setTotalCount(count);
                }
            } else if (type === 'LOAD_COMPLETE') {
                setTotalCount(count);
                setIsLoading(false);
                // Run one final refresh only after full index load.
                if (queryRef.current && queryRef.current.length >= 2) {
                    workerRef.current?.postMessage({ type: 'SEARCH', query: queryRef.current });
                }
                if (pendingRouteArtistRef.current) {
                    workerRef.current?.postMessage({ type: 'GET_ARTIST_WORKS', query: pendingRouteArtistRef.current });
                }
            } else if (type === 'RESULTS') {
                const preciseResults = (results || [])
                    .map((art: SearchableArtwork) => ({
                        ...art,
                        exhibitionId: resolvePreciseCollectionId(art)
                    }))
                    .filter((art: SearchableArtwork) => {
                        const museumName = (art.museumName || '').toLowerCase();
                        const exhibitionId = (art.exhibitionId || '').toLowerCase();
                        if (museumName.includes('serpentine gallery') || museumName.includes('british museum')) return false;
                        if (exhibitionId.includes('serpentine') || exhibitionId.includes('british-museum') || exhibitionId.includes('the-british-museum') || exhibitionId.includes('bm-collection')) return false;
                        return true;
                    });
                setFilteredArtworks(preciseResults);
                setSuggestedArtists(artists);
            } else if (type === 'ARTIST_WORKS') {
                if (artist) {
                    const preciseWorks = (works || [])
                        .map((art: SearchableArtwork) => ({
                            ...art,
                            exhibitionId: resolvePreciseCollectionId(art)
                        }))
                        .filter((art: SearchableArtwork) => {
                            const museumName = (art.museumName || '').toLowerCase();
                            const exhibitionId = (art.exhibitionId || '').toLowerCase();
                            if (museumName.includes('serpentine gallery') || museumName.includes('british museum')) return false;
                            if (exhibitionId.includes('serpentine') || exhibitionId.includes('british-museum') || exhibitionId.includes('the-british-museum') || exhibitionId.includes('bm-collection')) return false;
                            return true;
                        });
                    if (preciseWorks.length === 0) return;
                    const gallery = { artist, artworks: preciseWorks };
                    setArtistGallery((prev) => {
                        if (prev?.artist === gallery.artist && prev?.artworks?.length === gallery.artworks.length) {
                            return prev;
                        }
                        return gallery;
                    });
                    // Save to sessionStorage
                    try {
                        sessionStorage.setItem('artistGallery', JSON.stringify(gallery));
                    } catch (e) {
                        console.error('Failed to save artistGallery to sessionStorage', e);
                    }
                }
            } else if (type === 'ERROR') {
                console.error('Worker error:', e.data.error);
                setIsLoading(false);
            }
        };

        workerRef.current.postMessage({ type: 'SET_MODE', mode: getWorkerNetworkMode() });
        setIsLoading(true);
        workerRef.current.postMessage({ type: 'LOAD' });

        if (pendingRouteArtistRef.current) {
            workerRef.current.postMessage({ type: 'GET_ARTIST_WORKS', query: pendingRouteArtistRef.current });
        }
    }, []);

    useEffect(() => {
        if (!isNetworkConstrained) {
            ensureWorker();
        }

        return () => {
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
        };
    }, [ensureWorker, isNetworkConstrained]);

    const loadedRouteNameRef = useRef<string | null>(null);

    useEffect(() => {
        const routeName = getRouteArtistName();
        if (!routeName) {
            pendingRouteArtistRef.current = null;
            loadedRouteNameRef.current = null;
            setArtistGallery(prev => {
                if (prev) {
                    setLightboxArtwork(null);
                    return null;
                }
                return prev;
            });
            return;
        }

        pendingRouteArtistRef.current = routeName;
        if (loadedRouteNameRef.current === routeName) return;
        loadedRouteNameRef.current = routeName;

        setIsExpanded(false);
        setLightboxArtwork(null);
        setArtistGallery(null);
        try {
            sessionStorage.removeItem('artistGallery');
        } catch {
            // ignore
        }
        ensureWorker();
        workerRef.current?.postMessage({ type: 'GET_ARTIST_WORKS', query: routeName });
    }, [getRouteArtistName, ensureWorker]);

    useEffect(() => {
        fetch('/data/video-embed-ids.json')
            .then(res => res.ok ? res.json() : null)
            .then((data) => {
                if (data && Array.isArray(data.ids)) {
                    videoEmbedIdsRef.current = new Set(data.ids);
                }
                setVideoEmbedIdsReady(true);
            })
            .catch(() => {
                setVideoEmbedIdsReady(true);
            });
    }, []);
    // AI 모델 로딩 상태

    const resolveCollectionIdForMuseum = useCallback((artworkItem: Partial<SearchableArtwork>, museum?: Museum) => {
        if (!museum) return artworkItem.exhibitionId || '';

        const normalize = (value?: string) => normalizeToken(value);
        const permanent = museum.permanentExhibitions || [];
        const artExhId = normalize(artworkItem.exhibitionId);
        const direct = permanent.find((pe: any) => normalize(pe?.id) === artExhId);
        if (direct?.id) return direct.id;

        if (artExhId) {
            const aliasMatch = permanent.find((pe: any) => getExhibitionTokens(pe).has(artExhId));
            if (aliasMatch?.id) return aliasMatch.id;
        }

        const artId = normalize(artworkItem.id);
        const artImage = normalize(artworkItem.image);
        const artSource = normalize(artworkItem.sourceUrl);

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
                const base = normalize(String(collectionFile).replace('.json', ''));
                if (base && (artId.includes(base) || artImage.includes(base) || artSource.includes(base))) {
                    score = 600 + base.length;
                }
            }

            if (score > 0 && (!bestMatch || score > bestMatch.score)) {
                bestMatch = { id: pe.id, score };
            }
        }

        if (bestMatch?.id) return bestMatch.id;
        return artworkItem.exhibitionId || permanent?.[0]?.id || '';
    }, []);

    const findMuseumForArtwork = useCallback((artworkItem: Partial<SearchableArtwork>) => {
        const artExhibitionToken = normalizeToken(artworkItem.exhibitionId);
        if (artExhibitionToken) {
            const byCollection = museums.find((museum) =>
                (museum.permanentExhibitions || []).some((pe: any) => getExhibitionTokens(pe).has(artExhibitionToken))
            );
            if (byCollection) return byCollection;
        }

        const artMuseumToken = normalizeToken(artworkItem.museumName);
        if (artMuseumToken) {
            const byName = museums.find((museum) => {
                const nameToken = normalizeToken(museum.name);
                return nameToken && (nameToken === artMuseumToken || nameToken.includes(artMuseumToken) || artMuseumToken.includes(nameToken));
            });
            if (byName) return byName;
        }

        const artIdPrefix = normalizeToken((artworkItem.id || '').split('-')[0]) || normalizeToken((artworkItem.id || '').split('_')[0]);
        if (artIdPrefix) {
            const byId = museums.find((museum) => normalizeToken(museum.id) === artIdPrefix);
            if (byId) return byId;
        }

        return undefined;
    }, [museums]);


    // Semantic search function - 브라우저에서 CLIP 텍스트 임베딩 생성
    const performSemanticSearch = useCallback(async (searchQuery: string) => {
        console.log('Performing semantic search with query:', searchQuery, 'videoReady:', videoEmbedIdsReady);
        if (searchQuery.length < 3) {
            setAiResults([]);

            setAiFilteredCount(0);
            return;
        }

        if (!videoEmbedIdsReady) {
            setAiResults([]);

            setAiFilteredCount(0);
            return;
        }

        setIsAILoading(true);

        try {
            const normalizeForMatch = (value: string) =>
                (value || '')
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-z0-9\uac00-\ud7a3\s]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

            const queryNorm = normalizeForMatch(searchQuery);
            const metadataStopTokens = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'to', 'for', 'in', 'on', 'at', 'by', 'with', 'de', 'la', 'le', 'du', 'des', 'van', 'von', 'da', 'di', 'del', 'della', 'painting', 'paintings', 'artwork', 'artworks', 'work', 'works', 'piece', 'pieces']);
            const nonArtistHintTokens = new Set(['flower', 'flowers', 'painting', 'paintings', 'portrait', 'landscape', 'still', 'life', 'sunflower', 'sunflowers', 'blossom', 'blossoms', 'parasol', 'umbrella', 'woman', 'man', 'self', 'study', 'untitled']);
            const lowQualityTitleRegex = /^(painting|untitled|study|object|work|image|photo|drawing)(\b|$)/;
            const trustedArtistExceptions = new Set(['man ray']);

            const isLowQualityArtistLabel = (value: string) => {
                const artistNorm = normalizeForMatch(value);
                if (!artistNorm) return true;
                if (trustedArtistExceptions.has(artistNorm)) return false;
                if (artistNorm === 'unknown' || artistNorm === 'unknown artist' || artistNorm === 'artist unknown') return true;
                if (artistNorm.includes('portrait miniature of an unknown woman')) return true;
                if (artistNorm.includes('portrait of an unknown woman')) return true;
                if (/\bunknown woman\b/.test(artistNorm)) return true;
                if (/^(painting|paintings|woman|women|unknown|artist|anonymous|anon|unidentified|school|workshop|atelier|follower|circle|manner|style)(\b|$)/.test(artistNorm)) return true;
                if (/^man\b/.test(artistNorm) && artistNorm !== 'man ray') return true;
                return false;
            };

            const getMetadataReliability = (artistValue: string, titleValue: string) => {
                const artistNorm = normalizeForMatch(artistValue);
                const titleNorm = normalizeForMatch(titleValue);
                let reliability = 1;
                if (isLowQualityArtistLabel(artistValue)) reliability -= 0.7;
                if (!titleNorm || lowQualityTitleRegex.test(titleNorm)) reliability -= 0.25;
                if (/\bunknown\b/.test(artistNorm) || /\bunknown\b/.test(titleNorm)) reliability -= 0.2;
                return Math.max(0.1, Math.min(1, reliability));
            };
            const queryTokens = queryNorm
                .split(' ')
                .map((token) => token.trim())
                .filter((token) => token.length >= 2 && !metadataStopTokens.has(token));
            const strongArtistQueryTokens = queryTokens
                .filter((token) => token.length >= 4 && !nonArtistHintTokens.has(token));

            const hasMeaningfulArtistIntent = strongArtistQueryTokens.some((token) => knownArtistTokenSet.has(token));
            let shouldApplyMetadataFusion = hasMeaningfulArtistIntent;

            // SigLIP 서버사이드 검색: 텍스트를 Worker로 전송, 브라우저 모델 다운로드 없음
            let rawResults: any[];
            try {
                rawResults = await searchByText(searchQuery, 100);
            } catch (err) {
                console.warn('SigLIP search failed:', err);
                setIsAILoading(false);
                return;
            }

            // Vectorize 결과는 {id, score, e} 만 포함 — Worker idMap에서 full 메타데이터 조회
            const vectorizeIds = rawResults.map(r => r.id);
            const scoreMap: Record<string, number> = {};
            rawResults.forEach(r => { if (r.id) scoreMap[r.id] = r.score; });

            const enrichedResults = await new Promise<any[]>((resolve) => {
                if (!workerRef.current || vectorizeIds.length === 0) {
                    resolve(rawResults); // Worker 없으면 원본 그대로
                    return;
                }
                const onMsg = (ev: MessageEvent) => {
                    if (ev.data?.type === 'DETAILS_RESULTS') {
                        workerRef.current?.removeEventListener('message', onMsg);
                        const matched = ev.data.results as any[];
                        // Search index에 있는 항목만 표시 (삭제된/미인덱스 항목 제외)
                        // fallback(Vectorize에만 있는 항목)은 placeholder 이미지 등 문제가 있을 수 있어 제외
                        const all = matched
                            .map((r: any) => ({ ...r, score: scoreMap[r.id] || 0 }))
                            .sort((a, b) => (b.score || 0) - (a.score || 0));
                        resolve(all.length > 0 ? all : rawResults);
                    }
                };
                workerRef.current.addEventListener('message', onMsg);
                workerRef.current.postMessage({ type: 'GET_DETAILS_BY_IDS', ids: vectorizeIds });
                // 2초 타임아웃 — search index 조회 실패 시 rawResults로 폴백
                setTimeout(() => {
                    workerRef.current?.removeEventListener('message', onMsg);
                    resolve(rawResults);
                }, 2000);
            });

            const data = { results: enrichedResults };

            if (data.results) {
                // Deduplicate by ID while preserving score order from Vectorize
                const seenRawIds = new Set<string>();
                const filteredRaw = data.results.filter((r: any) => {
                    const id = String(r?.id || '');
                    if (!id || seenRawIds.has(id)) return false;
                    seenRawIds.add(id);
                    return true;
                });

                const results = filteredRaw.map((r: any) => {
                    const museumMatch = findMuseumForArtwork({
                        id: r.id,
                        museumName: r.museum,
                        exhibitionId: r.e || r.exhibitionId,
                        image: r.i || r.image || r.url || '',
                        sourceUrl: r.sourceUrl || r.url || ''
                    });

                    const exhibitionId = r.e || r.exhibitionId || resolveCollectionIdForMuseum({
                        id: r.id,
                        exhibitionId: r.e || r.exhibitionId,
                        image: r.i || r.image || r.url || '',
                        sourceUrl: r.sourceUrl || r.url || ''
                    }, museumMatch);

                    const resolvedName = r.name || r.n || '';
                    const resolvedArtistRaw = r.artist || r.a || '';
                    const resolvedArtist = isLowQualityArtistLabel(resolvedArtistRaw) ? 'Unknown' : resolvedArtistRaw;
                    const resolvedImage = r.i || r.image || r.url || '';
                    const resolvedMuseum = r.museum || r.m || museumMatch?.name || '';
                    const metaReliability = getMetadataReliability(resolvedArtist, resolvedName);
                    return {
                        id: r.id,
                        name: resolvedName || 'Untitled',
                        artist: resolvedArtist || 'Unknown',
                        image: resolvedImage,
                        museumName: resolvedMuseum,
                        exhibitionId: exhibitionId || '',
                        sourceUrl: r.sourceUrl || '',
                        __semanticScore: Number(r.score || 0),
                        __metaReliability: metaReliability,
                    } as SearchableArtwork & { __semanticScore?: number; __metaReliability?: number };
                });

                const dedupedResults: SearchableArtwork[] = [];
                const seenResultIds = new Set<string>();
                for (const item of results) {
                    const id = String(item.id || '');
                    if (!id || seenResultIds.has(id)) continue;
                    seenResultIds.add(id);
                    dedupedResults.push(item);
                }

                if (!shouldApplyMetadataFusion && strongArtistQueryTokens.length > 0) {
                    const runtimeArtistTokenSet = new Set<string>();
                    for (const item of dedupedResults.slice(0, 60)) {
                        const artistRaw = item.artist || '';
                        if (isLowQualityArtistLabel(artistRaw)) continue;
                        const artistNorm = normalizeForMatch(artistRaw);
                        if (!artistNorm) continue;
                        for (const token of artistNorm.split(' ')) {
                            if (token.length < 3) continue;
                            if (metadataStopTokens.has(token)) continue;
                            runtimeArtistTokenSet.add(token);
                        }
                    }
                    shouldApplyMetadataFusion = strongArtistQueryTokens.some((token) => runtimeArtistTokenSet.has(token));
                }

                let finalResults = dedupedResults;
                if (shouldApplyMetadataFusion) {
                    const rerankedSemantic = [...dedupedResults]
                        .map((item, index) => {
                            const title = normalizeForMatch(item.name || '');
                            const artistRaw = item.artist || '';
                            const artist = isLowQualityArtistLabel(artistRaw) ? '' : normalizeForMatch(artistRaw);
                            const semanticScore = Number((item as any).__semanticScore || 0);
                            const metaReliability = Number((item as any).__metaReliability || 1);

                            let titleTokenMatches = 0;
                            let artistTokenMatches = 0;
                            for (const token of queryTokens) {
                                if (title.includes(token)) titleTokenMatches += 1;
                                if (artist.includes(token)) artistTokenMatches += 1;
                            }

                            let strongArtistMatches = 0;
                            for (const token of strongArtistQueryTokens) {
                                if (artist.includes(token)) strongArtistMatches += 1;
                            }

                            let metadataBoost = 0;
                            if (title && queryNorm && title.includes(queryNorm)) metadataBoost += 70;
                            if (artist && queryNorm && artist.includes(queryNorm)) metadataBoost += 55;
                            metadataBoost += titleTokenMatches * 11;
                            metadataBoost += artistTokenMatches * 18;
                            metadataBoost += strongArtistMatches * 72;

                            if (strongArtistQueryTokens.length > 0) {
                                if (strongArtistMatches === 0) {
                                    metadataBoost -= 96;
                                } else if (strongArtistMatches >= strongArtistQueryTokens.length) {
                                    metadataBoost += 36;
                                }
                            }

                            const totalTokenMatches = titleTokenMatches + artistTokenMatches;
                            if (queryTokens.length >= 2 && totalTokenMatches >= queryTokens.length) {
                                metadataBoost += 24;
                            } else if (queryTokens.length >= 2 && totalTokenMatches >= queryTokens.length - 1) {
                                metadataBoost += 12;
                            }

                            metadataBoost *= metaReliability;

                            const rankPrior = Math.max(0, 100 - index) * 0.02;
                            const combinedScore = (semanticScore * 95) + (metadataBoost * 0.45) + rankPrior;
                            return { item, combinedScore };
                        })
                        .sort((a, b) => b.combinedScore - a.combinedScore)
                        .map(({ item }) => item);

                    // Rescue exact/strong lexical title matches when pure vector ranking misses them.
                    // This keeps AI mode useful for explicit title queries like "woman with a parasol".
                    let lexicalRescue: SearchableArtwork[] = [];
                    if (workerRef.current && queryNorm.length >= 3) {
                        lexicalRescue = await new Promise<SearchableArtwork[]>((resolve) => {
                            const timeoutMs = 2500;
                            let latestWarmRows: SearchableArtwork[] = [];

                            const mapRows = (payload: any): SearchableArtwork[] =>
                                (payload?.results || []).map((r: any) => ({
                                    id: r.id,
                                    name: r.name || 'Untitled',
                                    artist: r.artist || 'Unknown',
                                    image: r.image || '',
                                    museumName: r.museumName || '',
                                    exhibitionId: r.exhibitionId || '',
                                    sourceUrl: r.sourceUrl || '',
                                } as SearchableArtwork));

                            const onMsg = (ev: MessageEvent) => {
                                if (ev.data?.type !== 'RESULTS' || ev.data?.query !== searchQuery) return;

                                const rows = mapRows(ev.data);
                                const source = String(ev.data?.source || '');
                                const pending = Boolean(ev.data?.pending);

                                // search.worker sends warm results first and full results later.
                                // Wait for full/non-pending payload to avoid missing strong lexical hits.
                                if (source === 'full' || pending === false) {
                                    workerRef.current?.removeEventListener('message', onMsg);
                                    resolve(rows.length > 0 ? rows : latestWarmRows);
                                    return;
                                }

                                if (rows.length > 0) {
                                    latestWarmRows = rows;
                                }
                            };

                            workerRef.current?.addEventListener('message', onMsg);
                            workerRef.current?.postMessage({ type: 'SEARCH', query: searchQuery });
                            setTimeout(() => {
                                workerRef.current?.removeEventListener('message', onMsg);
                                resolve(latestWarmRows);
                            }, timeoutMs);
                        });
                    }

                    finalResults = rerankedSemantic;
                    if (lexicalRescue.length > 0) {
                        const scoredLexical = lexicalRescue
                            .map((item) => {
                                const title = normalizeForMatch(item.name || '');
                                const artistRaw = item.artist || '';
                                const artist = isLowQualityArtistLabel(artistRaw) ? '' : normalizeForMatch(artistRaw);
                                let boost = 0;
                                if (title && queryNorm && title.includes(queryNorm)) boost += 100;
                                if (artist && queryNorm && queryNorm.includes(artist)) boost += 20;

                                let tokenMatches = 0;
                                for (const token of queryTokens) {
                                    if (title.includes(token)) tokenMatches += 1;
                                }

                                if (tokenMatches > 0) boost += tokenMatches * 12;
                                if (queryTokens.length >= 3 && tokenMatches >= Math.ceil(queryTokens.length * 0.6)) {
                                    boost += 28;
                                }

                                const hasArtistTokenHit = queryTokens.some((token) => artist.includes(token));
                                if (hasArtistTokenHit) boost += 24;

                                let strongArtistMatches = 0;
                                for (const token of strongArtistQueryTokens) {
                                    if (artist.includes(token)) strongArtistMatches += 1;
                                }
                                if (strongArtistMatches > 0) boost += strongArtistMatches * 74;
                                if (strongArtistQueryTokens.length > 0 && strongArtistMatches === 0) boost -= 90;

                                return { item, boost, tokenMatches };
                            })
                            .filter(({ boost, tokenMatches }) => boost >= 28 || tokenMatches >= 2)
                            .sort((a, b) => b.boost - a.boost)
                            .map(({ item }) => item)
                            .slice(0, 20);

                        const merged = [...scoredLexical, ...rerankedSemantic];
                        const seenMergedIds = new Set<string>();
                        finalResults = merged.filter((item) => {
                            const id = String(item.id || '');
                            if (!id || seenMergedIds.has(id)) return false;
                            seenMergedIds.add(id);
                            return true;
                        });
                    }

                    if (strongArtistQueryTokens.length > 0 && finalResults.length > 0) {
                        const subjectTokens = queryTokens.filter((token) => !strongArtistQueryTokens.includes(token));
                        finalResults = [...finalResults]
                            .map((item) => {
                                const title = normalizeForMatch(item.name || '');
                                const artistRaw = item.artist || '';
                                const artist = isLowQualityArtistLabel(artistRaw) ? '' : normalizeForMatch(artistRaw);

                                let strongArtistMatches = 0;
                                for (const token of strongArtistQueryTokens) {
                                    if (artist.includes(token)) strongArtistMatches += 1;
                                }

                                let subjectMatches = 0;
                                for (const token of subjectTokens) {
                                    if (title.includes(token)) subjectMatches += 1;
                                }

                                let priority = strongArtistMatches * 140 + subjectMatches * 28;
                                if (strongArtistMatches === 0) priority -= 1000;
                                return { item, priority };
                            })
                            .sort((a, b) => b.priority - a.priority)
                            .map(({ item }) => item);
                    }
                }

                setAiFilteredCount(0);
                const cleanedResults = finalResults
                    .map((item: any) => {
                        const { __semanticScore, __metaReliability, ...rest } = item;
                        return rest as SearchableArtwork;
                    });
                setAiResults(cleanedResults.slice(0, 100));

            } else if ((data as any).error) {
                console.error('Search error:', (data as any).error);
                setAiResults([]);
            } else {
                setAiResults([]);
            }
        } catch (error: any) {
            console.error('Semantic search error:', error);
            setAiResults([{
                id: 'error-msg',
                name: `Connection Error: ${error.message || 'Unknown'}`,
                artist: 'System Check',
                image: 'https://placehold.co/100x100?text=Error',
                museumName: 'Check Console & Network',
                exhibitionId: '',
                sourceUrl: '',
            }]);
        } finally {
            setIsAILoading(false);
            setIsClipLoading(false);
        }
    }, [videoEmbedIdsReady, museums, resolveCollectionIdForMuseum, findMuseumForArtwork, knownArtistTokenSet]);

    // Debounced search - artworks + museums
    useEffect(() => {
        const timer = setTimeout(() => {
            if (isAIMode) {
                performSemanticSearch(query);
            } else {
                if (query.length >= 2) {
                    ensureWorker();
                    workerRef.current?.postMessage({ type: 'SEARCH', query });
                } else {
                    setFilteredArtworks([]);
                    setSuggestedArtists([]);
                }
            }

            // Also search museums locally (always)
            if (query.length >= 2 && museums.length > 0) {
                const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const matched = museums.filter(m => {
                    const name = m.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    const country = m.country?.toLowerCase() || '';
                    return name.includes(q) || country.includes(q);
                }).slice(0, 5);
                setFilteredMuseums(matched);
            } else {
                setFilteredMuseums([]);
            }
        }, isAIMode ? 800 : 150);  // AI 모드: 800ms 디바운스 (인코딩 요청 최소화)

        return () => clearTimeout(timer);
    }, [query, museums, isAIMode, performSemanticSearch, ensureWorker]);

    // videoEmbedIdsReady 변경시 검색 (중복 방지: query가 있고 AI모드일 때만)
    // 주의: 위 useEffect와 이중 실행 방지 위해 isAIMode && query 조건 엄격히
    useEffect(() => {
        if (!videoEmbedIdsReady || !isAIMode || query.length < 3) return;
        // debounce 없이 즉시 실행하면 위 useEffect와 중복 — 제거하고 위 useEffect에 의존
    }, [videoEmbedIdsReady, isAIMode]);  // query, performSemanticSearch 제거로 이중실행 방지



    // Click outside - collapse preview but keep query
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (lightboxArtwork) return;
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsExpanded(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [lightboxArtwork]);

    // Dispatch events so GlobalNav can react + listen for collapse from GlobalNav
    useEffect(() => {
        if (inlineMode) {
            if (isExpanded) {
                window.dispatchEvent(new CustomEvent('global-search-expanded'));
            } else {
                window.dispatchEvent(new CustomEvent('global-search-collapsed'));
            }
        }
    }, [isExpanded, inlineMode]);

    useEffect(() => {
        if (!inlineMode) return;
        const onCloseSearch = () => setIsExpanded(false);
        window.addEventListener('global-nav-close-search', onCloseSearch);
        return () => window.removeEventListener('global-nav-close-search', onCloseSearch);
    }, [inlineMode]);

    // Listen for search trigger from Navbar or other sources
    useEffect(() => {
        const onTrigger = (e: Event) => {
            const detail = (e as CustomEvent<{ query?: string }>).detail;
            const q = detail?.query || '';
            setQuery(q);
            setIsExpanded(true);
            if (q) {
                workerRef.current?.postMessage({ type: 'SEARCH', query: q });
            }
            setTimeout(() => inputRef.current?.focus(), 50);
        };
        window.addEventListener('global-search-trigger', onTrigger);
        return () => window.removeEventListener('global-search-trigger', onTrigger);
    }, []);

    useEffect(() => {
        if (isExpanded && inputRef.current) inputRef.current.focus();
    }, [isExpanded]);

    const handleOpenInMuseum = useCallback((artworkInput: SearchableArtwork) => {
        // JIT Correction: Ensure we have the precise collection ID
        // This fixes cases where the loaded data still has generic Museum IDs
        const artwork = { ...artworkInput };
        if (artwork.id && (artwork.id.startsWith('mamcs-') || artwork.id.startsWith('mamcs_'))) {
            if (artwork.id.startsWith('mamcs-paintings-')) artwork.exhibitionId = 'mamcs-strasbourg-paintings-collection';
            else if (artwork.id.startsWith('mamcs-drawings-')) artwork.exhibitionId = 'mamcs-strasbourg-drawings-collection';
            else if (artwork.id.startsWith('mamcs-photography-')) artwork.exhibitionId = 'mamcs-strasbourg-photography-collection';
            else if (artwork.id.startsWith('mamcs-graphic-design-')) artwork.exhibitionId = 'mamcs-strasbourg-graphic-design-collection';
        }
        setLightboxArtwork(null);
        const searchValue = artwork.searchName || artwork.name || '';
        try {
            if (searchValue) {
                sessionStorage.setItem('pendingMuseumSearchQuery', JSON.stringify({ artworkTitle: searchValue }));
            } else {
                sessionStorage.removeItem('pendingMuseumSearchQuery');
            }
        } catch {
            // Silently ignore storage errors
        }
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('navbar:prefill-search', { detail: { query: searchValue } }));
        }

        setIsExpanded(false);

        const museumMatch = findMuseumForArtwork(artwork);

        const targetMuseum = museumMatch
            ? { id: museumMatch.id, name: museumMatch.name }
            : { id: artwork.exhibitionId || artwork.id || 'unknown', name: artwork.museumName || 'Museum' };

        const artCollectionToken = normalizeToken(artwork.exhibitionId);
        const collectionBelongsToMuseum = !!museumMatch && (museumMatch.permanentExhibitions || []).some((pe: any) => normalizeToken(pe?.id) === artCollectionToken);
        const needsResolver = !artwork.exhibitionId || !collectionBelongsToMuseum;
        const targetCollectionId = needsResolver
            ? resolveCollectionIdForMuseum(artwork, museumMatch)
            : artwork.exhibitionId;

        onNavigateToMuseum?.(targetMuseum, targetCollectionId || undefined, artwork);
    }, [findMuseumForArtwork, resolveCollectionIdForMuseum, onNavigateToMuseum]);

    const handleSelectArtwork = useCallback((artwork: SearchableArtwork) => {
        setLightboxArtwork(artwork);
    }, []);

    const handleSelectArtist = useCallback((artist: string) => {
        setIsExpanded(false);
        setLightboxArtwork(null);
        setArtistGallery(null);
        try {
            sessionStorage.removeItem('artistGallery');
        } catch {
            // ignore
        }
        const slug = toArtistSlug(artist);
        const modeQuery = drawingSkin ? '&mode=drawing' : '';
        const target = `/artist-gallery/${encodeURIComponent(slug)}?name=${encodeURIComponent(artist)}${modeQuery}`;
        const current = `${location.pathname}${location.search}`;
        if (current !== target) {
            navigate(target);
        }
    }, [location.pathname, location.search, navigate, toArtistSlug, drawingSkin]);

    const handleSelectMuseum = useCallback((museum: Museum) => {
        setIsExpanded(false);
        setLightboxArtwork(null);
        setArtistGallery(null);
        try {
            sessionStorage.removeItem('artistGallery');
        } catch {
            // ignore
        }
        onNavigateToMuseum?.({ id: museum.id, name: museum.name }, museum.permanentExhibitions?.[0]?.id);
    }, [onNavigateToMuseum]);

    const closeArtistGallery = useCallback(() => {
        setArtistGallery(null);
        setLightboxArtwork(null);

        pendingRouteArtistRef.current = null;
        try {
            sessionStorage.removeItem('artistGallery');
        } catch {
            // ignore
        }
        if (location.pathname.startsWith('/artist-gallery/')) {
            navigate('/', { replace: true });
        }
    }, [location.pathname, navigate]);

    const closeLightbox = useCallback(() => {
        setLightboxArtwork(null);
    }, []);

    const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement, Event>) => {
        const target = e.currentTarget;
        if (target.src === FALLBACK_IMG) {
            target.style.opacity = '1';
            target.style.transform = 'scale(1)';
            target.style.filter = 'blur(0)';
            return;
        }
        target.onerror = null;
        target.src = FALLBACK_IMG;
        target.style.opacity = '1';
        target.style.transform = 'scale(1)';
        target.style.filter = 'blur(0)';
    }, []);

    const lightboxYearLabel = lightboxArtwork ? formatArtworkYear(lightboxArtwork.date) : '';

    // Dropdown theme colors (derived from isNavDark)
    const drawingPalette = drawingSkin ? {
        dropBg: '#FFFFFF',
        dropShadow: '6px 8px 0 rgba(17,17,17,1)',
        dropBorder: '#111111',
        sectionBg: '#FFFFFF',
        sectionBorder: 'rgba(17,17,17,0.22)',
        labelColor: '#4B443B',
        pillText: '#1A1918',
        titleColor: '#1A1918',
        subColor: '#36312B',
        museumColor: '#4D4741',
        thumbBg: '#F2F2F2',
        divider: 'rgba(17,17,17,0.14)',
        hintColor: '#555047',
        itemHover: '#F6F6F6',
    } : null;

    const navDropBg       = drawingPalette?.dropBg ?? (isNavDark ? 'rgba(18,17,16,0.94)'     : 'rgba(255,255,255,0.92)');
    const navDropShadow   = drawingPalette?.dropShadow ?? (isNavDark ? '0 12px 40px rgba(0,0,0,0.45), inset 0 1px 1px rgba(255,255,255,0.04)'
                                      : '0 12px 40px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255,255,255,0.7)');
    const navDropBorder   = drawingPalette?.dropBorder ?? (isNavDark ? 'rgba(255,255,255,0.06)'   : 'rgba(0,0,0,0.08)');
    const navSectionBg    = drawingPalette?.sectionBg ?? (isNavDark ? 'rgba(10,10,8,0.5)'        : 'rgba(245,242,237,0.75)');
    const navSectionBorder= drawingPalette?.sectionBorder ?? (isNavDark ? 'rgba(201,165,90,0.15)'    : 'rgba(180,155,100,0.2)');
    const navLabelColor   = drawingPalette?.labelColor ?? (isNavDark ? '#8a867d'                   : '#7a7268');
    const navPillText     = drawingPalette?.pillText ?? (isNavDark ? '#f0ede6'                   : '#1a1918');
    const navTitleColor   = drawingPalette?.titleColor ?? (isNavDark ? '#f0ede6'                   : '#1a1918');
    const navSubColor     = drawingPalette?.subColor ?? (isNavDark ? '#8a867d'                   : '#6b6560');
    const navMuseumColor  = drawingPalette?.museumColor ?? (isNavDark ? '#5a5650'                   : '#8a8278');
    const navThumbBg      = drawingPalette?.thumbBg ?? (isNavDark ? '#1a1918'                   : '#eae6df');
    const navDivider      = drawingPalette?.divider ?? (isNavDark ? 'rgba(201,165,90,0.12)'     : 'rgba(180,155,100,0.18)');
    const navHintColor    = drawingPalette?.hintColor ?? (isNavDark ? '#7a7570'                   : '#8a8278');
    const navItemHover    = drawingPalette?.itemHover ?? (isNavDark ? 'rgba(201,165,90,0.08)'     : 'rgba(180,155,100,0.1)');
    const drawingHumanFont = "'Courier Prime', 'Courier New', 'Lucida Console', monospace";

    return (
        <>
            {lightboxArtwork && createPortal(
                <div
                    onClick={closeLightbox}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.85)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 15000,
                        padding: 30,
                    }}
                >
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            closeLightbox();
                        }}
                        style={{
                            position: 'fixed',
                            top: isMobile ? 16 : 32,
                            right: isMobile ? 16 : 40,
                            width: 44,
                            height: 44,
                            borderRadius: '50%',
                            border: '1px solid rgba(255,255,255,0.3)',
                            background: 'rgba(0,0,0,0.65)',
                            color: '#fff',
                            fontSize: 24,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        ✕
                    </button>
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            position: 'relative',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 20,
                        }}
                    >
                        {/* Image container with icons inside */}
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                            <img
                                src={getLightboxImage(lightboxArtwork.image)}
                                alt={lightboxArtwork.name}
                                onError={handleImageError}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    maxWidth: '90vw',
                                    maxHeight: '70vh',
                                    objectFit: 'contain',
                                    borderRadius: 8,
                                    boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
                                    display: 'block'
                                }}
                            />
                            {/* Icons inside image - bottom right (Frame left, Heart right) */}
                            <div style={{
                                position: 'absolute',
                                bottom: 12,
                                right: 12,
                                display: 'flex',
                                gap: 12,
                                zIndex: 15001
                            }}>
                                {/* POD Product Purchase Button - Left */}
                                <div
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        setProductArtwork(lightboxArtwork);
                                    }}
                                    style={{
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'transform 0.15s ease'
                                    }}
                                    title="상품으로 구매하기"
                                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.15)'}
                                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                >
                                    <svg
                                        width={24}
                                        height={24}
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="#fff"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        style={{ filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.6))' }}
                                    >
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                        <rect x="7" y="7" width="10" height="10" />
                                    </svg>
                                </div>
                                {/* Heart - Right */}
                                <HeartOverlay
                                    isLiked={likedArtworks.has(lightboxArtwork.id)}
                                    onToggle={(e) => toggleLikeArtwork(e, lightboxArtwork)}
                                    style={{ padding: 0, background: 'none' }}
                                    size={24}
                                    color="#e11d48"
                                    emptyColor="#fff"
                                />
                            </div>
                        </div>
                        <div style={{ textAlign: 'center', color: '#fff', maxWidth: '80vw' }}>
                            <div style={{ fontSize: 20, fontWeight: 600 }}>{lightboxArtwork.name}</div>
                            <div style={{ fontSize: 14, opacity: 0.8, marginTop: 8 }}>
                                {lightboxArtwork.artist}{lightboxYearLabel ? ` • ${lightboxYearLabel}` : ''}
                            </div>
                            <div style={{ fontSize: 13, opacity: 0.6, marginTop: 4 }}>{lightboxArtwork.museumName}</div>

                            <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
                                <button
                                    onClick={() => handleOpenInMuseum(lightboxArtwork)}
                                    style={{
                                        padding: '10px 20px',
                                        background: '#fff',
                                        border: 'none',
                                        borderRadius: 20,
                                        color: '#000',
                                        cursor: 'pointer',
                                        fontSize: 13,
                                        fontWeight: 500,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6
                                    }}
                                >
                                    View in Museum
                                </button>
                                {lightboxArtwork.sourceUrl && (
                                    <a
                                        href={lightboxArtwork.sourceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            padding: '10px 20px',
                                            background: 'transparent',
                                            border: '1px solid rgba(255,255,255,0.5)',
                                            borderRadius: 20,
                                            color: '#fff',
                                            textDecoration: 'none',
                                            fontSize: 13,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            transition: 'background 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        Original Source ↗
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}




            <div
                ref={containerRef}
                onClick={() => setIsExpanded(true)}
                onWheel={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    position: inlineMode ? (drawingSkin ? 'relative' : 'static') : 'fixed',
                    zIndex: (!!artistGallery) && !lightboxArtwork && !isModalOpen ? 14000 : 5000,
                    transition: inlineMode
                        ? (drawingSkin ? 'width 260ms ease-out, opacity 180ms linear' : 'width 450ms ease, background 300ms ease, border-radius 350ms ease')
                        : 'height 600ms ease-in-out, bottom 600ms ease-in-out, transform 600ms ease-in-out, width 600ms ease-in-out, border-radius 600ms ease-in-out',

                    ...(inlineMode ? {
                        // When collapsed: golden circle | When expanded: full-width transparent pill inside GlobalNav
                        width: forceWidth ? forceWidth : (isExpanded ? 'min(420px, 85vw)' : (drawingSkin ? '44px' : '48px')),
                        height: drawingSkin ? '44px' : '48px', // always fixed height; dropdown is separate
                        background: isExpanded ? 'transparent' : (drawingSkin ? '#111111' : '#e8fb36'),
                        borderRadius: isExpanded ? '100px' : '48px',
                        boxShadow: 'none',
                        backdropFilter: 'none',
                        WebkitBackdropFilter: 'none',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'visible',
                    } : {
                        ...(isMobile ? {
                            top: 60,
                            bottom: 'auto',
                            left: '50%',
                            transform: (() => {
                                const isBottomMode = isModalOpen || !!artistGallery;
                                if (!isBottomMode || isExpanded) {
                                    return 'translateX(-50%) translateY(0)';
                                }
                                return 'translateX(-50%) translateY(calc(100dvh - 130px))';
                            })(),
                            width: isExpanded ? '94vw' : 'min(320px, 80vw)',
                            height: isExpanded ? `${containerHeight}px` : '50px',
                            borderRadius: isExpanded ? 20 : 30,
                            marginTop: 0,
                        } : {
                            top: 120,
                            bottom: 'auto',
                            left: '50%',
                            transform: isExpanded
                                ? 'translateX(-50%) translateY(0)'
                                : 'translateX(-50%) translateY(calc(100dvh - 120px - 50px - 20px))',
                            width: isExpanded ? 'min(600px, 94vw)' : 'min(320px, 80vw)',
                            borderRadius: isExpanded ? 16 : 30,
                            height: isExpanded ? `${containerHeight}px` : '50px',
                        }),
                        background: isExpanded ? 'rgba(10, 10, 8, 0.82)' : 'rgba(10, 10, 8, 0.72)',
                        backdropFilter: 'blur(30px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(30px) saturate(180%)',
                        border: isExpanded ? '1px solid rgba(201,165,90,0.25)' : '1px solid rgba(201,165,90,0.2)',
                        boxShadow: isExpanded ? '0 8px 40px rgba(0,0,0,0.5)' : '0 4px 20px rgba(0,0,0,0.4)',
                        overflow: 'hidden',
                    }),
                    cursor: isExpanded ? 'default' : 'pointer',
                }}
            >
                {/* Scrollbar Styles */}
                <style>{`
                    .interactive-dropdown-scrollbar::-webkit-scrollbar {
                        width: 6px;
                    }
                    .interactive-dropdown-scrollbar::-webkit-scrollbar-track {
                        background: transparent;
                        margin: 12px 0;
                    }
                    .interactive-dropdown-scrollbar::-webkit-scrollbar-thumb {
                        background: rgba(201,165,90,0.25);
                        border-radius: 10px;
                    }
                    .interactive-dropdown-scrollbar::-webkit-scrollbar-thumb:hover {
                        background: rgba(201,165,90,0.5);
                    }
                    .drawing-dropdown-scrollbar::-webkit-scrollbar {
                        width: 6px;
                    }
                    .drawing-dropdown-scrollbar::-webkit-scrollbar-track {
                        background: transparent;
                        margin: 12px 0;
                    }
                    .drawing-dropdown-scrollbar::-webkit-scrollbar-thumb {
                        background: #111111;
                        border-radius: 10px;
                    }
                `}</style>
                
                {/* Input */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: isExpanded ? '0 12px' : (inlineMode ? '0' : '10px 16px'),
                    gap: 8,
                    width: '100%',
                    height: inlineMode ? (drawingSkin ? '44px' : '48px') : 'auto',
                    position: (inlineMode && drawingSkin && isExpanded) ? 'relative' : 'static',
                    zIndex: (inlineMode && drawingSkin && isExpanded) ? 2 : 'auto',
                    justifyContent: (inlineMode && !isExpanded) ? 'center' : 'flex-start',
                    boxSizing: 'border-box' as const,
                    border: 'none',
                    borderRadius: 0,
                    background: 'transparent',
                }}>
                    <svg width={inlineMode && drawingSkin ? 20 : 22} height={inlineMode && drawingSkin ? 20 : 22} viewBox="0 0 24 24" fill="none" stroke={inlineMode && !isExpanded ? (drawingSkin ? "#FFFFFF" : "#000") : (drawingSkin ? "#000000" : "#c9a55a")} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>

                    {(isExpanded || !inlineMode) && (
                        <>
                            {/* AI Mode Toggle moved to left side */}
                            <button
                                onClick={(e) => { e.stopPropagation(); preloadEncoder(); setIsAIMode(!isAIMode); setAiResults([]); setIsRecommendMode(false); }}
                                style={drawingSkin ? {
                                    background: isAIMode ? '#111111' : '#ffffff',
                                    border: '2px solid #111111',
                                    borderRadius: 999,
                                    width: 60,
                                    height: 30,
                                    fontSize: 12,
                                    fontWeight: 800,
                                    color: isAIMode ? '#ffffff' : '#111111',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 4,
                                    transition: 'all 0.2s ease',
                                    fontFamily: "'Space Mono', 'Courier New', monospace",
                                    flexShrink: 0,
                                } : {
                                    background: isAIMode ? '#c9a55a' : 'rgba(255,255,255,0.05)',
                                    border: isAIMode ? 'none' : '1px solid rgba(255,255,255,0.15)',
                                    borderRadius: '50px',
                                    padding: '5px 12px',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: isAIMode ? '#111111' : '#a3a3a3',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    transition: 'all 0.3s ease',
                                    fontFamily: "'Inter', Arial, sans-serif",
                                    flexShrink: 0,
                                }}
                                onMouseEnter={(e) => {
                                    preloadEncoder();
                                    if (!isAIMode) {
                                        e.currentTarget.style.color = drawingSkin ? '#111111' : '#c9a55a';
                                        e.currentTarget.style.borderColor = drawingSkin ? '#111111' : 'rgba(201,165,90,0.3)';
                                        e.currentTarget.style.background = drawingSkin ? '#ffffff' : 'rgba(201,165,90,0.08)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!isAIMode) {
                                        e.currentTarget.style.color = drawingSkin ? '#888' : '#a3a3a3';
                                        e.currentTarget.style.borderColor = drawingSkin ? '#ddd' : 'rgba(255,255,255,0.15)';
                                        e.currentTarget.style.background = drawingSkin ? 'transparent' : 'rgba(255,255,255,0.05)';
                                    }
                                }}
                                title={isAIMode ? 'Switch to text search' : 'Switch to AI semantic search'}
                            >
                                {drawingSkin ? 'A.I' : 'AI'}
                            </button>

                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onFocus={() => {
                                    setIsExpanded(true);
                                }}
                                placeholder={isLoading ? 'Loading...' : (isExpanded ? 'Search artworks, artists...' : 'Search artworks...')}
                                style={{
                                    flex: 1,
                                    border: 'none',
                                    background: 'transparent',
                                    fontSize: 16,
                                    outline: 'none',
                                    color: drawingSkin ? '#111111' : (inlineMode ? navTitleColor : '#f0ede6'),
                                    fontFamily: drawingSkin ? drawingHumanFont : 'inherit',
                                    letterSpacing: drawingSkin ? '0.01em' : 0,
                                    minWidth: 0,
                                    touchAction: 'manipulation',  // prevent double-tap zoom on iOS
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                }}
                            />

                            {query && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setQuery(''); inputRef.current?.focus(); }}
                                    style={drawingSkin ? {
                                        background: 'transparent',
                                        border: 'none',
                                        width: 24,
                                        height: 24,
                                        display: 'grid',
                                        placeItems: 'center',
                                        cursor: 'pointer',
                                        flexShrink: 0,
                                        padding: 0,
                                        marginRight: 4,
                                    } : {
                                        background: 'rgba(201,165,90,0.15)',
                                        border: '1px solid rgba(201,165,90,0.25)',
                                        borderRadius: '50%',
                                        width: 20,
                                        height: 20,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        fontSize: 12,
                                        color: '#c9a55a',
                                        marginRight: drawingSkin ? 0 : 20, // Push X button much further left natively
                                        flexShrink: 0,
                                        transition: 'all 0.2s ease'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!drawingSkin) {
                                            e.currentTarget.style.background = 'rgba(201,165,90,0.3)';
                                            e.currentTarget.style.color = '#fff';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!drawingSkin) {
                                            e.currentTarget.style.background = 'rgba(201,165,90,0.15)';
                                            e.currentTarget.style.color = '#c9a55a';
                                        }
                                    }}
                                >
                                    {drawingSkin ? (
                                        <span style={{ position: 'relative', width: 14, height: 14, display: 'block', pointerEvents: 'none' }}>
                                            <span style={{ position: 'absolute', top: '50%', left: '50%', width: 14, height: 2.3, background: '#111111', borderRadius: 2, transform: 'translate(-50%, -50%) rotate(45deg)', transformOrigin: 'center' }} />
                                            <span style={{ position: 'absolute', top: '50%', left: '50%', width: 14, height: 2.3, background: '#111111', borderRadius: 2, transform: 'translate(-50%, -50%) rotate(-45deg)', transformOrigin: 'center' }} />
                                        </span>
                                    ) : '✕'}
                                </button>
                            )}
                            {/* For You 버튼은 홈 지도 화면으로 이동됨 */}
                            {!isExpanded && !isMobile && !inlineMode && (
                                <span style={{ fontSize: 10, color: '#8a867d', marginLeft: 4, whiteSpace: 'nowrap', letterSpacing: '0.04em' }}>TAB</span>
                            )}
                            {isExpanded && !query && (
                                <button onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }} style={{ background: 'transparent', border: 'none', padding: 4, cursor: 'pointer', color: '#8a867d', fontSize: 12, marginRight: drawingSkin ? 0 : 16 }}>▼</button>
                            )}
                        </>
                    )}
                </div>

                {/* Content Wrapper for smooth height measurement */}
                <div
                    ref={contentRef}
                    className={inlineMode ? (drawingSkin ? 'drawing-dropdown-scrollbar' : 'interactive-dropdown-scrollbar') : ''}
                    style={{
                        maxHeight: 'calc(80vh - 60px)',
                        overflowY: 'auto',
                        overscrollBehavior: 'contain',
                        WebkitOverflowScrolling: 'touch',
                        ...(inlineMode ? (() => {
                            // 1. Drawing Skin (Interactive Globe Mode)
                            if (drawingSkin) {
                                return {
                                    position: 'absolute' as const,
                                    top: 'calc(100% + 16px)',
                                    left: '-6px', // Align with the left edge of the entire Pill (accounting for GlobalNav 6px padding)
                                    marginTop: 0,
                                    background: navDropBg,
                                    backdropFilter: 'none',
                                    WebkitBackdropFilter: 'none',
                                    boxShadow: '0 6px 0 rgba(17,17,17,0.95)',
                                    borderRadius: '14px',
                                    border: `2.5px solid ${navDropBorder}`,
                                    opacity: isExpanded ? 1 : 0,
                                    pointerEvents: isExpanded ? 'auto' as const : 'none' as const,
                                    transition: 'opacity 180ms linear, transform 190ms ease-out',
                                    transform: isExpanded ? 'translateY(0)' : 'translateY(-4px)',
                                    minWidth: '100%',
                                    width: 'calc(100% + 66px)', // Exactly span SearchInput (100%) + Hamburger(48) + gap(4) + margin(2) + Nav Padding Left/Right(12)
                                    maxWidth: 'calc(100vw - 64px)',
                                    zIndex: 1,
                                };
                            }
                            
                            // 2. Interactive Map (Normal Dark/Light Nav Pill Mode)
                            return {
                                position: 'absolute' as const,
                                top: '100%',
                                left: '0',
                                right: 'auto',
                                marginTop: 0,
                                background: navDropBg,
                                backdropFilter: 'blur(30px) saturate(200%)',
                                WebkitBackdropFilter: 'blur(30px) saturate(200%)',
                                boxShadow: navDropShadow,
                                borderRadius: '0 0 26px 26px',
                                borderTop: 'none',
                                opacity: isExpanded ? 1 : 0,
                                pointerEvents: isExpanded ? 'auto' as const : 'none' as const,
                                transition: 'opacity 180ms linear, transform 190ms ease-out',
                                transform: isExpanded ? 'translateY(0)' : 'translateY(-4px)',
                                zIndex: 1,
                                minWidth: '100%', // Naturally unify with the exact length of the Nav Pill container
                                width: '100%',
                            };
                        })() : {})
                    }}
                >
                    {/* Artist suggestions */}
                    {isExpanded && suggestedArtists.length > 0 && (
                        <div style={{ padding: '8px 16px', borderTop: `1px solid ${navSectionBorder}`, background: navSectionBg }}>
                            <div style={{ fontSize: 10, color: navLabelColor, marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Artists</div>
                            <div style={{ display: 'flex', overflowX: 'auto', gap: 6, paddingBottom: 4, scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
                                {suggestedArtists.map(({ artist, count }) => (
                                    <button
                                        key={artist}
                                        onClick={(e) => { e.stopPropagation(); handleSelectArtist(artist); }}
                                        style={{ background: 'rgba(201,165,90,0.12)', border: '1px solid rgba(201,165,90,0.3)', borderRadius: 16, padding: '5px 12px', fontSize: 12, color: navPillText, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, transition: 'all 150ms ease', whiteSpace: 'nowrap', flexShrink: 0 }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(201,165,90,0.25)'; e.currentTarget.style.borderColor = '#c9a55a'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(201,165,90,0.12)'; e.currentTarget.style.borderColor = 'rgba(201,165,90,0.3)'; }}
                                    >
                                        {artist} <span style={{ fontSize: 10, opacity: 0.5 }}>({count})</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Museum suggestions */}
                    {isExpanded && filteredMuseums.length > 0 && (
                        <div style={{ padding: '8px 16px', borderTop: `1px solid ${navSectionBorder}`, background: navSectionBg }}>
                            <div style={{ fontSize: 10, color: navLabelColor, marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Museums</div>
                            <div style={{ display: 'flex', overflowX: 'auto', gap: 6, paddingBottom: 4, scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
                                {filteredMuseums.map((museum) => (
                                    <button
                                        key={museum.id}
                                        onClick={(e) => { e.stopPropagation(); handleSelectMuseum(museum); }}
                                        style={{ background: 'rgba(201,165,90,0.08)', border: '1px solid rgba(201,165,90,0.25)', borderRadius: 16, padding: '5px 12px', fontSize: 12, color: '#c9a55a', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 150ms ease', whiteSpace: 'nowrap', flexShrink: 0 }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(201,165,90,0.2)'; e.currentTarget.style.borderColor = '#c9a55a'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(201,165,90,0.08)'; e.currentTarget.style.borderColor = 'rgba(201,165,90,0.25)'; }}
                                    >
                                        🏛️ {museum.name} <span style={{ fontSize: 10, opacity: 0.6 }}>• {museum.country}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* AI Mode Results */}
                    {isExpanded && isAIMode && (
                        <div style={{ padding: '8px 16px', borderTop: `1px solid ${navDivider}`, background: navSectionBg }}>
                            <div style={{ fontSize: 11, color: navLabelColor, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span>✨</span>
                                <span>
                                    {isAILoading
                                        ? (encoderStatus === 'loading' ? 'Loading AI model (~70MB, cached after first use)...' : 'Searching with SigLIP...')
                                        : `AI Semantic Search (${aiResults.length} results${aiFilteredCount > 0 ? `, filtered ${aiFilteredCount}` : ''})`}
                                </span>
                            </div>
                            {query.length >= 3 && !isAILoading && !isClipLoading && aiResults.length === 0 && (
                                <div style={{ fontSize: 12, color: navSubColor, padding: '8px 0' }}>No AI results for "{query}". Try: "impressionist landscape", "portrait of woman", "religious painting"</div>
                            )}
                        </div>
                    )}

                    {/* AI Results Grid */}
                    {isExpanded && isAIMode && aiResults.length > 0 && (
                        <div
                            onWheel={(e) => e.stopPropagation()}
                            onTouchMove={(e) => e.stopPropagation()}
                            style={{
                                borderTop: `1px solid ${navDivider}`,
                            }}
                        >
                            {aiResults.map((art, idx) => (
                                <div
                                    key={`ai-${art.id}-${idx}`}
                                    className="search-result-item"
                                    onClick={(e) => { e.stopPropagation(); handleSelectArtwork(art); }}
                                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', cursor: 'pointer', borderBottom: idx < aiResults.length - 1 ? `1px solid ${navDivider}` : 'none', transition: 'background 150ms ease' }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = navItemHover}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <div style={{ width: 44, height: 44, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: navThumbBg }}>
                                        <img src={getSearchThumbnail(getSafeImageUrl(art.image))} alt="" onError={handleImageError} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: navTitleColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{art.name}</div>
                                        <div style={{ fontSize: 11, color: navSubColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{art.artist}</div>
                                        <div style={{ fontSize: 10, color: navMuseumColor }}>{art.museumName}</div>
                                    </div>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(201,165,90,0.4)" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Recommendation Mode Header */}
                    {isExpanded && isRecommendMode && (
                        <div style={{ padding: '8px 16px', borderTop: '1px solid #ffe4ef', background: 'linear-gradient(135deg, rgba(255,107,157,0.06) 0%, rgba(255,182,193,0.04) 100%)' }}>
                            <div style={{ fontSize: 11, color: '#c2185b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span>♡</span>
                                <span>
                                    {isRecommendLoading
                                        ? 'Finding artworks tailored to your taste...'
                                        : `Personalized for you (${recommendResults.length} picks)`}
                                </span>
                                {!isRecommendLoading && recommendResults.length > 0 && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); if (currentUser) fetchRecommendations(currentUser.uid, Array.from(likedArtworks)); }}
                                        style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid #ffb3d0', borderRadius: 100, padding: '2px 8px', fontSize: 10, color: '#c2185b', cursor: 'pointer' }}
                                    >↻ Refresh</button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Recommendation Results Grid */}
                    {isExpanded && isRecommendMode && !isRecommendLoading && recommendResults.length > 0 && (
                        <div onWheel={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()} style={{ borderTop: '1px solid #ffe4ef' }}>
                            {recommendResults.map((art, idx) => (
                                <div
                                    key={`rec-${art.id}-${idx}`}
                                    className="search-result-item"
                                    onClick={(e) => { e.stopPropagation(); handleSelectArtwork(art); }}
                                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', cursor: 'pointer', borderBottom: idx < recommendResults.length - 1 ? '1px solid #fff0f5' : 'none', transition: 'background 150ms ease' }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#fff8fb'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <div style={{ width: 44, height: 44, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: '#fce4ec' }}>
                                        <img src={getSearchThumbnail(getSafeImageUrl(art.image))} alt="" onError={handleImageError} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#222', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{art.name}</div>
                                        <div style={{ fontSize: 11, color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{art.artist}{art.date ? ` • ${art.date}` : ''}</div>
                                        <div style={{ fontSize: 10, color: '#999' }}>{art.museumName}</div>
                                    </div>
                                    <HeartOverlay
                                        isLiked={likedArtworks.has(art.id)}
                                        onToggle={(e) => toggleLikeArtwork(e, art)}
                                        size={16}
                                    />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Recommendation loading skeleton */}
                    {isExpanded && isRecommendMode && isRecommendLoading && (
                        <div style={{ borderTop: '1px solid #ffe4ef' }}>
                            {[...Array(8)].map((_, idx) => (
                                <div key={`skel-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', borderBottom: idx < 7 ? '1px solid #fff0f5' : 'none' }}>
                                    <div style={{ width: 44, height: 44, borderRadius: 6, background: 'linear-gradient(90deg, #fce4ec 25%, #ffeef4 50%, #fce4ec 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', flexShrink: 0 }} />
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div style={{ height: 12, width: '60%', borderRadius: 4, background: 'linear-gradient(90deg, #fce4ec 25%, #ffeef4 50%, #fce4ec 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
                                        <div style={{ height: 10, width: '40%', borderRadius: 4, background: 'linear-gradient(90deg, #fce4ec 25%, #ffeef4 50%, #fce4ec 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Recommendation empty state */}
                    {isExpanded && isRecommendMode && !isRecommendLoading && recommendResults.length === 0 && (
                        <div style={{ padding: '24px 16px', textAlign: 'center', borderTop: '1px solid #ffe4ef' }}>
                            <div style={{ fontSize: 24, marginBottom: 8 }}>♡</div>
                            <div style={{ fontSize: 13, color: '#c2185b', fontWeight: 600, marginBottom: 4 }}>Building your taste profile...</div>
                            <div style={{ fontSize: 12, color: '#888' }}>Like more artworks to get personalized recommendations</div>
                        </div>
                    )}

                    {/* Regular Results */}
                    {isExpanded && !isAIMode && !isRecommendMode && filteredArtworks.length > 0 && (
                        <div
                            onWheel={(e) => e.stopPropagation()}
                            onTouchMove={(e) => e.stopPropagation()}
                            style={{
                                borderTop: `1px solid ${navDivider}`,
                            }}
                        >
                            {filteredArtworks.map((art, idx) => (
                                <div
                                    key={`${art.id}-${idx}`}
                                    className="search-result-item"
                                    onClick={(e) => { e.stopPropagation(); handleSelectArtwork(art); }}
                                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', cursor: 'pointer', borderBottom: idx < filteredArtworks.length - 1 ? `1px solid ${navDivider}` : 'none', transition: 'background 150ms ease' }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = navItemHover}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <div style={{ width: 44, height: 44, borderRadius: 4, overflow: 'hidden', flexShrink: 0, background: navThumbBg }}>
                                        <img src={getSearchThumbnail(getSafeImageUrl(art.image))} alt="" onError={handleImageError} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontSize: drawingSkin ? 15 : 13,
                                            fontWeight: drawingSkin ? 700 : 600,
                                            color: navTitleColor,
                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                            fontFamily: drawingSkin ? drawingHumanFont : 'inherit',
                                        }}>{art.name}</div>
                                        {(() => {
                                            const yearLabel = formatArtworkYear(art.date);
                                            return (
                                                <div style={{
                                                    fontSize: drawingSkin ? 13 : 11,
                                                    color: navSubColor,
                                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                    fontFamily: drawingSkin ? drawingHumanFont : 'inherit',
                                                }}>
                                                    {art.artist}{yearLabel ? ` • ${yearLabel}` : ''}
                                                </div>
                                            );
                                        })()}
                                        <div style={{
                                            fontSize: drawingSkin ? 12 : 11,
                                            color: navMuseumColor,
                                            fontFamily: drawingSkin ? drawingHumanFont : 'inherit',
                                        }}>
                                            {art.museumName}
                                            {(() => {
                                                const m = museums.find(m => m.name === art.museumName);
                                                return m?.country ? ` • ${m.country}` : '';
                                            })()}
                                        </div>
                                    </div>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(201,165,90,0.4)" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Loading State */}
                    {isExpanded && isLoading && (
                        <div style={{ padding: '16px', textAlign: 'center', color: navSubColor, fontSize: 13, borderTop: `1px solid ${navDivider}` }}>
                            Loading search data...
                        </div>
                    )}

                    {/* No results */}
                    {isExpanded && query.length >= 2 && !isAIMode && !isRecommendMode && filteredArtworks.length === 0 && suggestedArtists.length === 0 && !isLoading && (
                        <div style={{ padding: '16px', textAlign: 'center', color: navSubColor, fontSize: 13, borderTop: `1px solid ${navDivider}` }}>No results for "{query}"</div>
                    )}

                    {/* Hint */}
                    {isExpanded && query.length < 2 && !isLoading && !isRecommendMode && (
                        <div style={{ padding: '12px 16px', textAlign: 'center', color: navHintColor, fontSize: 12, borderTop: `1px solid ${navDivider}`, letterSpacing: '0.02em' }}>
                            {isAIMode
                                ? '✨ AI Search: Try "impressionist landscape" or "portrait of woman"'
                                : (totalCount > 0 ? `Search ${totalCount.toLocaleString()} artworks from world museums` : 'Type at least 2 characters')}
                        </div>
                    )}
                </div>
            </div>



            {/* Artist Gallery Modal */}
            {artistGallery && createPortal(
                (() => {
                    const isDark = isDrawingGalleryMode ? false : (galleryTheme === 'dark');
                    const bg = isDrawingGalleryMode ? '#ffffff' : (isDark ? '#080807' : '#f7f4ef');
                    const cardBg = isDrawingGalleryMode ? '#ffffff' : (isDark ? '#0f0e0d' : '#ffffff');
                    const btnBg = isDrawingGalleryMode ? '#ffffff' : (isDark ? '#1c1b1a' : '#f2ede6');
                    const textMain = isDrawingGalleryMode ? '#111111' : (isDark ? '#f0ede6' : '#1a1918');
                    const textSub = isDrawingGalleryMode ? '#4d4740' : (isDark ? '#8a8075' : '#6b6560');
                    const accent = isDrawingGalleryMode ? '#8a6420' : (isDark ? '#c9a55a' : '#8a6420');
                    const border = isDrawingGalleryMode ? '#111111' : (isDark ? '#1e1d1c' : '#ddd8cf');
                    const borderLight = isDrawingGalleryMode ? '#2f2f2f' : (isDark ? '#2a2927' : '#e5e0d8');
                    const borderWidth = isDrawingGalleryMode ? '2.5px' : '1px';
                    const asciiArt = galleryAsciiArt || buildFallbackAscii(artistGallery.artist);
                    const filteredCount = filteredGalleryArtworks.length;
                    const hasMoreGalleryArtworks = visibleGalleryArtworks.length < filteredGalleryArtworks.length;
                    return (
                        <div
                            style={{
                                position: 'fixed',
                                inset: 0,
                                zIndex: galleryZIndex,
                                background: isDrawingGalleryMode
                                    ? 'rgba(255,255,255,0.97)'
                                    : (isDark ? 'rgba(8,8,7,0.97)' : 'rgba(247,244,239,0.97)'),
                                backdropFilter: 'blur(16px)',
                                WebkitBackdropFilter: 'blur(16px)',
                                overflowY: 'auto',
                                display: 'flex',
                                alignItems: 'flex-start',
                                justifyContent: 'center',
                                padding: isMobile ? '16px 12px 40px' : '48px 40px 60px',
                                transition: 'background 0.3s',
                                boxSizing: 'border-box',
                            }}
                            onWheel={(e) => e.stopPropagation()}
                            onScroll={handleGalleryScroll}
                        >
                            <div style={{
                                width: '100%', maxWidth: 1200,
                                display: 'flex', flexDirection: 'column',
                                overflowX: 'clip',
                                overflowY: 'visible',
                                borderRadius: isMobile ? 10 : 14,
                                border: `${borderWidth} solid ${border}`,
                                background: bg,
                                marginBottom: 40,
                                boxShadow: isDrawingGalleryMode ? '10px 12px 0 rgba(17,17,17,1)' : 'none',
                                filter: isDrawingGalleryMode ? 'url(#dg-sketch-ui)' : 'none',
                                fontFamily: isDrawingGalleryMode ? "'Space Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, monospace" : 'inherit',
                            }}>

                                {/* ── HERO ─────────────────────────────────────── */}
                                <header style={{
                                    padding: isMobile ? '28px 20px 24px' : '52px 60px 40px',
                                    borderBottom: `${borderWidth} solid ${border}`,
                                    background: bg,
                                }}>
                                    {/* Eyebrow row */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMobile ? 18 : 28 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <span style={{
                                                fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase',
                                                color: accent, fontWeight: 700,
                                                padding: '4px 12px', border: `${isDrawingGalleryMode ? '2px' : '1px'} solid ${accent}66`,
                                                borderRadius: 2, flexShrink: 0,
                                            }}>Artist</span>
                                            {(galleryFoundArtist?.nationality || galleryFoundArtist?.birthYear) && (
                                                <span style={{ fontSize: 12, color: textSub, letterSpacing: '0.04em' }}>
                                                    {[
                                                        galleryFoundArtist?.nationality,
                                                        galleryFoundArtist?.birthYear ? `b. ${galleryFoundArtist.birthYear}` : null,
                                                    ].filter(Boolean).join(' · ')}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            {!isDrawingGalleryMode && (
                                                <button
                                                    onClick={() => setGalleryTheme(t => t === 'dark' ? 'light' : 'dark')}
                                                    title={isDark ? 'Switch to light' : 'Switch to dark'}
                                                    style={{
                                                        width: 36, height: 36, borderRadius: '50%', border: `1px solid ${border}`,
                                                        background: btnBg, color: textSub, fontSize: 15, cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        outline: 'none',
                                                    }}
                                                >{isDark ? '☀' : '☾'}</button>
                                            )}
                                            <button
                                                onClick={closeArtistGallery}
                                                onMouseDown={(e) => {
                                                    if (!isDrawingGalleryMode) return;
                                                    e.currentTarget.style.transform = 'translate(2px, 2px)';
                                                    e.currentTarget.style.boxShadow = '1px 1px 0 rgba(17,17,17,0.95)';
                                                }}
                                                onMouseUp={(e) => {
                                                    if (!isDrawingGalleryMode) return;
                                                    e.currentTarget.style.transform = 'translate(0, 0)';
                                                    e.currentTarget.style.boxShadow = '3px 3px 0 rgba(17,17,17,0.95)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (!isDrawingGalleryMode) return;
                                                    e.currentTarget.style.transform = 'translate(0, 0)';
                                                    e.currentTarget.style.boxShadow = '3px 3px 0 rgba(17,17,17,0.95)';
                                                }}
                                                style={{
                                                width: 36, height: 36, borderRadius: '50%', border: `${isDrawingGalleryMode ? '2.5px' : '1px'} solid ${border}`,
                                                background: btnBg, color: textSub, fontSize: 18,
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                outline: 'none',
                                                boxShadow: isDrawingGalleryMode ? '3px 3px 0 rgba(17,17,17,0.95)' : 'none',
                                                transition: isDrawingGalleryMode ? 'transform 90ms ease, box-shadow 90ms ease, background 140ms ease' : 'background 140ms ease',
                                            }}>✕</button>
                                        </div>
                                    </div>

                                    {/* Artist name + heart inline */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 14 : 22, marginBottom: 28 }}>
                                        <h1 style={{
                                            fontFamily: isDrawingGalleryMode
                                                ? "'Space Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, monospace"
                                                : "'Playfair Display', Georgia, serif",
                                            fontSize: isMobile ? 'clamp(40px, 10vw, 56px)' : 'clamp(60px, 6vw, 96px)',
                                            fontWeight: isDrawingGalleryMode ? 700 : 300,
                                            letterSpacing: isDrawingGalleryMode ? '-0.04em' : '-0.02em',
                                            color: textMain,
                                            margin: 0,
                                            lineHeight: 1.05,
                                        }}>{artistGallery.artist}</h1>
                                        <HeartOverlay
                                            isLiked={artistGalleryIsLiked}
                                            onToggle={toggleLikeArtist}
                                            size={isMobile ? 22 : 30}
                                            color="#e11d48"
                                            emptyColor={`${textSub}99`}
                                        />
                                    </div>

                                    {/* Footer row */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 12, color: textSub, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 500 }}>
                                            <strong style={{ color: accent, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                                                {artistGallery.artworks.length.toLocaleString()}
                                            </strong>{' '}Works in Collection
                                        </span>
                                        {galleryWikiUrl && (
                                            <a href={galleryWikiUrl} target="_blank" rel="noreferrer"
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                                    fontSize: 11, color: textSub, letterSpacing: '0.1em',
                                                    textDecoration: 'underline', textUnderlineOffset: '3px',
                                                    textTransform: 'uppercase', fontWeight: 500,
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.color = accent}
                                                onMouseLeave={(e) => e.currentTarget.style.color = textSub}
                                            >
                                                Wikipedia
                                                <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                    <path d="M1 11L11 1M11 1H5M11 1v6" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </a>
                                        )}
                                    </div>
                                </header>

                                {/* ── BIO + MAP ────────────────────────────────── */}
                                <section style={{
                                    display: 'flex',
                                    flexDirection: isMobile ? 'column' : 'row',
                                    borderBottom: `${borderWidth} solid ${border}`,
                                    background: bg,
                                }}>
                                    {/* Bio column */}
                                    <div style={{
                                        flex: isMobile ? '1 1 auto' : '0 0 50%',
                                        minWidth: 0,
                                        padding: isMobile ? '20px 16px' : '28px 36px',
                                        borderRight: isMobile ? 'none' : `${borderWidth} solid ${border}`,
                                        borderBottom: isMobile ? `${borderWidth} solid ${border}` : 'none',
                                        // Set color so .artist-bio__text inherits it (ArtistPage.css not loaded here)
                                        color: isDark ? '#b8b3aa' : '#3d3a35',
                                        boxSizing: 'border-box',
                                        fontSize: 14,
                                        lineHeight: 1.65,
                                    }}>
                                        <p style={{
                                            fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase',
                                            color: accent, fontWeight: 500, margin: '0 0 14px',
                                        }}>Infinite Wiki</p>
                                        <ArtistWikiPanel
                                            artistName={artistGallery.artist}
                                            imageUrl={undefined}
                                            fallbackDescription={artistFallbackDescription}
                                        />
                                        <pre style={{
                                            fontFamily: "'DM Mono', 'Courier New', monospace",
                                            fontSize: isMobile ? 7 : 9,
                                            color: isDrawingGalleryMode ? '#a4a097' : (isDark ? '#3a3733' : '#c8c3bb'),
                                            margin: '28px 0 0',
                                            lineHeight: 1.4,
                                            overflowX: 'auto',
                                            userSelect: 'none',
                                        }}>{asciiArt}</pre>
                                    </div>

                                    {/* Map column + Distribution slides — shown on all screen sizes */}
                                    {artistGallery.artworks.length > 0 && (() => {
                                        const allArtworks = artistGallery.artworks;
                                        const total = allArtworks.length;

                                        // Museum distribution
                                        const musMap_: Map<string, number> = new Map();
                                        for (const art of allArtworks) {
                                            if (art.museumName) musMap_.set(art.museumName, (musMap_.get(art.museumName) || 0) + 1);
                                        }
                                        const musArr_ = Array.from(musMap_.entries())
                                            .sort((a, b) => b[1] - a[1])
                                            .map(([name, count]) => ({ name, count, pct: Math.round(count / total * 100) }));

                                        // Country distribution
                                        const cntryMap_: Map<string, number> = new Map();
                                        for (const { name, count } of musArr_) {
                                            const mus = (museums || []).find(m => m.name === name);
                                            const country = mus?.country || '';
                                            if (country) cntryMap_.set(country, (cntryMap_.get(country) || 0) + count);
                                        }
                                        const cntryArr_ = Array.from(cntryMap_.entries())
                                            .sort((a, b) => b[1] - a[1])
                                            .map(([name, count]) => ({ name, count, pct: Math.round(count / total * 100) }));

                                        const DONUT_COLORS = ['#c9a55a', '#d4b96e', '#a88840', '#e2cb8c', '#8a6420', '#f0daa0', '#6b4e18', '#b89248'];

                                        const renderDonut = (data: { name: string; count: number }[], _centerLabel: string) => {
                                            const cx = 56, cy = 56, outerR = 44, innerR = 26;
                                            const bgStroke = isDark ? '#111009' : 'rgba(245,242,237,0.9)';
                                            const remainFill = isDark ? '#2a2927' : '#e0dbd3';
                                            const toXY = (angleDeg: number, r: number) => ({
                                                x: cx + r * Math.sin((angleDeg * Math.PI) / 180),
                                                y: cy - r * Math.cos((angleDeg * Math.PI) / 180),
                                            });
                                            const makeArc = (a1: number, a2: number): string => {
                                                const p1o = toXY(a1, outerR), p2o = toXY(a2, outerR);
                                                const p1i = toXY(a1, innerR), p2i = toXY(a2, innerR);
                                                const large = (a2 - a1) > 180 ? 1 : 0;
                                                const f = (n: number) => n.toFixed(2);
                                                return [
                                                    `M${f(p1o.x)},${f(p1o.y)}`,
                                                    `A${outerR},${outerR} 0 ${large} 1 ${f(p2o.x)},${f(p2o.y)}`,
                                                    `L${f(p2i.x)},${f(p2i.y)}`,
                                                    `A${innerR},${innerR} 0 ${large} 0 ${f(p1i.x)},${f(p1i.y)}`,
                                                    'Z'
                                                ].join(' ');
                                            };
                                            let cumAngle = 0;
                                            const segs = data.slice(0, 8).map((d, i) => {
                                                const span = (d.count / total) * 360;
                                                const a1 = cumAngle;
                                                const a2 = cumAngle + span;
                                                cumAngle += span;
                                                return { a1, a2, color: DONUT_COLORS[i % DONUT_COLORS.length] };
                                            });
                                            const remaining = 360 - cumAngle;
                                            return (
                                                <svg width="112" height="112" style={{ flexShrink: 0 }}>
                                                    {segs.map((seg, i) => (
                                                        <path key={i} d={makeArc(seg.a1, seg.a2)} fill={seg.color} stroke={bgStroke} strokeWidth="1.5" />
                                                    ))}
                                                    {remaining > 0.5 && (
                                                        <path d={makeArc(cumAngle, 360)} fill={remainFill} stroke={bgStroke} strokeWidth="1.5" />
                                                    )}
                                                    <text x={cx} y={cy + 5} textAnchor="middle" fontSize="16" fontWeight="700" fill={isDark ? '#e8e3da' : '#2a2520'} fontFamily="system-ui,sans-serif">
                                                        {total >= 1000 ? `${(total / 1000).toFixed(1)}k` : total}
                                                    </text>
                                                </svg>
                                            );
                                        };

                                        return (
                                            <div style={{ flex: isMobile ? '1 1 auto' : '0 0 50%', minWidth: 0, boxSizing: 'border-box', padding: isMobile ? '16px' : '24px 32px' }}>
                                                <p style={{ fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: accent, fontWeight: 500, margin: '0 0 14px' }}>Global Distribution</p>

                                                {/* Combined map + slides card */}
                                                <div style={{
                                                    width: '100%', borderRadius: 10, overflow: 'hidden',
                                                    border: `${borderWidth} solid ${border}`,
                                                    display: 'flex', flexDirection: 'column',
                                                    minHeight: isMobile ? 160 : 200,
                                                    boxShadow: isDrawingGalleryMode ? '5px 6px 0 rgba(17,17,17,0.9)' : 'none',
                                                }}>
                                                                    {/* amCharts map — lazy loaded on all platforms */}
                                                    <div style={{ flex: '1 1 0%', minHeight: 0, width: '100%', overflow: 'hidden' }}>
                                                        <Suspense fallback={<div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: textSub, fontSize: 12 }}>Loading map…</div>}>
                                                            <ArtistDistributionMap
                                                                artworks={artistGallery.artworks as any}
                                                                isDark={isDark}
                                                                hideLegend
                                                                mapHeight={isMobile ? "120px" : "160px"}
                                                                drawingStyle={isDrawingGalleryMode ? 'drawing-flat' : 'default'}
                                                            />
                                                        </Suspense>
                                                    </div>

                                                    {/* Distribution slides — bottom of combined card */}
                                                    <div style={{
                                                        flexShrink: 0,
                                                        borderTop: `${borderWidth} solid ${border}`,
                                                        background: isDrawingGalleryMode ? '#ffffff' : (isDark ? '#131211' : 'rgb(245,242,237)'),
                                                        userSelect: 'none',
                                                    }}>
                                                        <style>{`._armin-slide-scroll::-webkit-scrollbar{display:none}@keyframes arminCardReveal{0%{opacity:0;transform:translateY(18px)}100%{opacity:1;transform:translateY(0)}}[data-art-card]{opacity:0;transform:translateY(18px);animation:arminCardReveal .56s ease-in-out forwards}`}</style>

                                                        {/* Grab area — CSS transform slide strip */}
                                                        <div
                                                            style={{ overflow: 'hidden', cursor: 'grab', touchAction: 'pan-y' }}
                                                            onPointerDown={(e) => {
                                                                slideDragPointerId.current = e.pointerId;
                                                                slideDragStartX.current = e.clientX;
                                                                e.currentTarget.setPointerCapture(e.pointerId);
                                                            }}
                                                            onPointerUp={(e) => {
                                                                if (slideDragPointerId.current !== e.pointerId) return;
                                                                if (slideDragStartX.current === null) return;
                                                                const delta = e.clientX - slideDragStartX.current;
                                                                slideDragStartX.current = null;
                                                                slideDragPointerId.current = null;
                                                                e.currentTarget.releasePointerCapture(e.pointerId);
                                                                moveGallerySlideByDelta(delta);
                                                            }}
                                                            onPointerCancel={(e) => {
                                                                if (slideDragPointerId.current === e.pointerId) {
                                                                    slideDragStartX.current = null;
                                                                    slideDragPointerId.current = null;
                                                                }
                                                            }}
                                                        >
                                                            {/* 3-slide strip — width:300%, CSS transform */}
                                                            <div style={{
                                                                display: 'flex',
                                                                width: '300%',
                                                                willChange: 'transform',
                                                                transition: 'transform 0.38s ease-in-out',
                                                                transform: `translateX(calc(-${galleryMapSlide * 33.3333}% + 0px))`,
                                                            }}>
                                                                {/* Slide 0: TOP MUSEUMS */}
                                                                <div style={{ width: '33.3333%', flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                                                    <p style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: textSub, margin: '8px 16px 4px', fontWeight: 600, pointerEvents: 'none', flexShrink: 0 }}>Top Museums</p>
                                                                    <div className="_armin-slide-scroll" style={{ width: '100%', maxHeight: 118, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none', padding: '0 12px 8px', boxSizing: 'border-box' } as React.CSSProperties}>
                                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 16px' }}>
                                                                            {musArr_.slice(0, 12).map((m, i) => {
                                                                                const pct = Math.round((m.count / (musArr_[0]?.count ?? 1)) * 100);
                                                                                return (
                                                                                    <div key={m.name} style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
                                                                                            <span style={{ fontSize: 10, color: textMain, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0, opacity: Math.max(0.5, 1 - i * 0.04), lineHeight: 1.3 }}>{m.name}</span>
                                                                                            <span style={{ fontSize: 11, color: accent, fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{m.count >= 1000 ? `${(m.count / 1000).toFixed(1)}k` : m.count}</span>
                                                                                        </div>
                                                                                        <div style={{ height: 2, background: border, borderRadius: 1, overflow: 'hidden' }}>
                                                                                            <div style={{ height: '100%', width: `${pct}%`, background: accent, opacity: Math.max(0.3, 0.85 - i * 0.05), borderRadius: 1 }} />
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Slide 1: 미술관별 소장 분포 */}
                                                                <div style={{ width: '33.3333%', flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                                                    <p style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: textSub, margin: '8px 16px 4px', fontWeight: 600, pointerEvents: 'none', flexShrink: 0 }}>미술관별 소장 분포</p>
                                                                    <div className="_armin-slide-scroll" style={{ width: '100%', maxHeight: 118, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none', padding: '0 12px 8px', boxSizing: 'border-box' } as React.CSSProperties}>
                                                                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                                                            {renderDonut(musArr_, 'MUSEUM')}
                                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                                {musArr_.slice(0, 6).map((d, i) => (
                                                                                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                                                                                        <div style={{ width: 9, height: 9, borderRadius: 1, background: DONUT_COLORS[i % DONUT_COLORS.length], flexShrink: 0 }} />
                                                                                        <span style={{ flex: 1, minWidth: 0, fontSize: 10, color: textMain, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: Math.max(0.5, 1 - i * 0.08), lineHeight: 1.3 }}>{d.name}</span>
                                                                                        <span style={{ fontSize: 11, color: accent, fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{d.pct}%</span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Slide 2: 국가별 소장 분포 */}
                                                                <div style={{ width: '33.3333%', flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                                                    <p style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: textSub, margin: '8px 16px 4px', fontWeight: 600, pointerEvents: 'none', flexShrink: 0 }}>국가별 소장 분포</p>
                                                                    <div className="_armin-slide-scroll" style={{ width: '100%', maxHeight: 118, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none', padding: '0 12px 8px', boxSizing: 'border-box' } as React.CSSProperties}>
                                                                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                                                            {renderDonut(cntryArr_.length > 0 ? cntryArr_ : musArr_, 'COUNTRY')}
                                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                                {(cntryArr_.length > 0 ? cntryArr_ : musArr_).slice(0, 6).map((d, i) => (
                                                                                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                                                                                        <div style={{ width: 9, height: 9, borderRadius: 1, background: DONUT_COLORS[i % DONUT_COLORS.length], flexShrink: 0 }} />
                                                                                        <span style={{ flex: 1, minWidth: 0, fontSize: 10, color: textMain, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: Math.max(0.5, 1 - i * 0.08), lineHeight: 1.3 }}>{d.name}</span>
                                                                                        <span style={{ fontSize: 11, color: accent, fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{d.pct}%</span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Pagination dots */}
                                                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 5, padding: '5px 0 7px' }}>
                                                            {[0, 1, 2].map(i => (
                                                                <button key={i} onClick={(e) => { e.stopPropagation(); setGalleryMapSlide(i); }} style={{
                                                                    width: i === galleryMapSlide ? 20 : 6,
                                                                    height: 6, borderRadius: 3,
                                                                    background: i === galleryMapSlide ? accent : border,
                                                                    border: 'none', outline: 'none', cursor: 'pointer', padding: 0,
                                                                    transition: 'all 0.2s ease',
                                                                }} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </section>

                                {/* ── GALLERY ──────────────────────────────────── */}
                                <section style={{ flex: 1, background: bg, paddingBottom: isMobile ? 40 : 60 }}>
                                    {/* Gallery header */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 16,
                                        padding: isMobile ? '20px 20px 12px' : '32px 60px 20px',
                                    }}>
                                        <span style={{ fontSize: isMobile ? 20 : 28, fontWeight: 700, color: textMain, fontVariantNumeric: 'tabular-nums' }}>
                                            {filteredCount.toLocaleString()}
                                        </span>
                                        <span style={{ fontSize: 13, color: textSub }}>works</span>
                                        <div style={{ flex: 1, height: 1, background: borderLight }} />
                                    </div>

                                    {/* Category pills */}
                                    {galleryCategories.length >= 1 && (
                                        <div style={{
                                            padding: isMobile ? '0 20px 16px' : '0 60px 20px',
                                            display: 'flex', flexWrap: 'wrap', gap: 6,
                                        }}>
                                            <button
                                                onClick={() => setGalleryCategory(null)}
                                                onMouseDown={(e) => {
                                                    if (!isDrawingGalleryMode) return;
                                                    e.currentTarget.style.transform = 'translate(2px, 2px)';
                                                    e.currentTarget.style.boxShadow = '1px 1px 0 rgba(17,17,17,0.95)';
                                                }}
                                                onMouseUp={(e) => {
                                                    if (!isDrawingGalleryMode) return;
                                                    e.currentTarget.style.transform = 'translate(0, 0)';
                                                    e.currentTarget.style.boxShadow = '3px 3px 0 rgba(17,17,17,0.95)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (!isDrawingGalleryMode) return;
                                                    e.currentTarget.style.transform = 'translate(0, 0)';
                                                    e.currentTarget.style.boxShadow = '3px 3px 0 rgba(17,17,17,0.95)';
                                                }}
                                                style={{
                                                    padding: '4px 12px', borderRadius: 20,
                                                    border: `${isDrawingGalleryMode ? '2px' : '1px'} solid ${!galleryCategory ? accent : border}`,
                                                    background: !galleryCategory ? accent : 'transparent',
                                                    color: !galleryCategory ? (isDark ? '#080807' : '#fff') : textSub,
                                                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                                    letterSpacing: '0.04em',
                                                    boxShadow: isDrawingGalleryMode ? '3px 3px 0 rgba(17,17,17,0.95)' : 'none',
                                                    transform: 'translate(0, 0)',
                                                    transition: isDrawingGalleryMode ? 'transform 90ms ease, box-shadow 90ms ease, background 150ms ease, color 150ms ease, border-color 150ms ease' : 'all 0.15s',
                                                }}
                                            >All · {artistGallery.artworks.length.toLocaleString()}</button>
                                            {galleryCategories.map(({ cat, cnt }) => {
                                                const active = galleryCategory === cat;
                                                return (
                                                    <button
                                                        key={cat}
                                                        onClick={() => setGalleryCategory(active ? null : cat)}
                                                        onMouseDown={(e) => {
                                                            if (!isDrawingGalleryMode) return;
                                                            e.currentTarget.style.transform = 'translate(2px, 2px)';
                                                            e.currentTarget.style.boxShadow = '1px 1px 0 rgba(17,17,17,0.95)';
                                                        }}
                                                        onMouseUp={(e) => {
                                                            if (!isDrawingGalleryMode) return;
                                                            e.currentTarget.style.transform = 'translate(0, 0)';
                                                            e.currentTarget.style.boxShadow = '3px 3px 0 rgba(17,17,17,0.95)';
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            if (!isDrawingGalleryMode) return;
                                                            e.currentTarget.style.transform = 'translate(0, 0)';
                                                            e.currentTarget.style.boxShadow = '3px 3px 0 rgba(17,17,17,0.95)';
                                                        }}
                                                        style={{
                                                        padding: '4px 12px', borderRadius: 20,
                                                        border: `${isDrawingGalleryMode ? '2px' : '1px'} solid ${active ? accent : border}`,
                                                        background: active ? accent : 'transparent',
                                                        color: active ? (isDark ? '#080807' : '#fff') : textSub,
                                                        fontSize: 11, fontWeight: active ? 700 : 500,
                                                        cursor: 'pointer',
                                                        letterSpacing: '0.04em',
                                                        boxShadow: isDrawingGalleryMode ? '3px 3px 0 rgba(17,17,17,0.95)' : 'none',
                                                        transform: 'translate(0, 0)',
                                                        transition: isDrawingGalleryMode ? 'transform 90ms ease, box-shadow 90ms ease, background 150ms ease, color 150ms ease, border-color 150ms ease' : 'all 0.15s',
                                                    }}>{cat} · {cnt.toLocaleString()}</button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Masonry grid */}
                                    <div style={{ padding: isMobile ? '0 12px' : '0 60px' }} ref={galleryContainerRef}>
                                        <div style={{ display: 'flex', gap: isMobile ? 10 : 20, alignItems: 'flex-start' }}>
                                            {artistGalleryColumns.map((column, columnIdx) => (
                                                <div key={`artist-column-${columnIdx}`} style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: isMobile ? 10 : 20 }}>
                                                    {column.map((art, idx) => {
                                                        const yearLabel = formatArtworkYear(art.date);
                                                        const displayTitle = yearLabel ? `${art.name} (${yearLabel})` : art.name;
                                                        const museumCountry = museumCountryMap.get(art.museumName) || '';
                                                        const museumDisplay = museumCountry ? `${art.museumName} (${museumCountry})` : art.museumName;
                                                        return (
                                                            <div
                                                                key={art.id || `art-${columnIdx}-${idx}`}
                                                                data-art-card={art.id || `${columnIdx}-${idx}`}
                                                                onClick={() => handleSelectArtwork(art)}
                                                                style={{
                                                                    cursor: 'pointer',
                                                                    position: 'relative',
                                                                    width: '100%',
                                                                    animationDelay: `${Math.min(700, (idx * 55) + (columnIdx * 90))}ms`,
                                                                }}
                                                            >
                                                                <div style={{
                                                                    overflow: 'hidden',
                                                                    background: cardBg,
                                                                    border: isDrawingGalleryMode ? 'none' : `${borderWidth} solid ${border}`,
                                                                    borderRadius: isDrawingGalleryMode ? 10 : 6,
                                                                    transition: 'border-color 0.2s',
                                                                    position: 'relative',
                                                                    boxShadow: 'none',
                                                                }}>
                                                                    <img
                                                                        src={getOptimizedImageUrl(resolveGalleryImageUrl(art), 600)}
                                                                        style={{
                                                                            width: '100%', height: 'auto', display: 'block',
                                                                            transition: 'transform 750ms ease-in-out, opacity 0.45s ease, filter 0.45s ease',
                                                                            transform: 'scale(1.02)',
                                                                            opacity: 0,
                                                                            filter: 'blur(4px)',
                                                                        }}
                                                                        loading="lazy"
                                                                        alt={art.name}
                                                                        referrerPolicy="no-referrer"
                                                                        onLoad={(e) => {
                                                                            const target = e.currentTarget;
                                                                            target.style.opacity = '1';
                                                                            target.style.transform = 'scale(1)';
                                                                            target.style.filter = 'blur(0)';
                                                                        }}
                                                                        onError={handleImageError}
                                                                    />
                                                                </div>
                                                                <div style={{ marginTop: 8, paddingBottom: 4 }}>
                                                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                                                                        <div style={{ fontWeight: 600, fontSize: isMobile ? 11 : 13, color: textMain, lineHeight: 1.35 }}>
                                                                            {displayTitle}
                                                                        </div>
                                                                        <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginTop: 2 }}>
                                                                            <div
                                                                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setProductArtwork(art); }}
                                                                                title="상품으로 구매하기"
                                                                                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.15s ease' }}
                                                                                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.15)'}
                                                                                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                                                            >
                                                                                <svg width={isMobile ? 13 : 15} height={isMobile ? 13 : 15} viewBox="0 0 24 24" fill="none" stroke={textSub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                                                                    <rect x="7" y="7" width="10" height="10" />
                                                                                </svg>
                                                                            </div>
                                                                            <HeartOverlay
                                                                                isLiked={likedArtworks.has(art.id)}
                                                                                onToggle={(e) => toggleLikeArtwork(e, art)}
                                                                                style={{ padding: 0, background: 'none' }}
                                                                                size={isMobile ? 13 : 15}
                                                                                color="#e11d48"
                                                                                emptyColor={textSub}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div style={{ fontSize: isMobile ? 10 : 11, color: textSub, marginTop: 3 }}>
                                                                        {museumDisplay}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                        {hasMoreGalleryArtworks && (
                                            <div style={{ display: 'flex', justifyContent: 'center', padding: isMobile ? '16px 0 8px' : '24px 0 8px' }}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); loadMoreGalleryArtworks(); }}
                                                    onMouseDown={(e) => {
                                                        if (!isDrawingGalleryMode) return;
                                                        e.currentTarget.style.transform = 'translate(2px, 2px)';
                                                        e.currentTarget.style.boxShadow = '1px 1px 0 rgba(17,17,17,0.95)';
                                                    }}
                                                    onMouseUp={(e) => {
                                                        if (!isDrawingGalleryMode) return;
                                                        e.currentTarget.style.transform = 'translate(0, 0)';
                                                        e.currentTarget.style.boxShadow = '3px 3px 0 rgba(17,17,17,0.95)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (!isDrawingGalleryMode) return;
                                                        e.currentTarget.style.transform = 'translate(0, 0)';
                                                        e.currentTarget.style.boxShadow = '3px 3px 0 rgba(17,17,17,0.95)';
                                                    }}
                                                    style={{
                                                        border: `${isDrawingGalleryMode ? '2px' : '1px'} solid ${border}`,
                                                        background: 'transparent',
                                                        color: textSub,
                                                        borderRadius: 999,
                                                        padding: '8px 14px',
                                                        fontSize: 12,
                                                        fontWeight: isDrawingGalleryMode ? 700 : 500,
                                                        cursor: 'pointer',
                                                        boxShadow: isDrawingGalleryMode ? '3px 3px 0 rgba(17,17,17,0.95)' : 'none',
                                                        transform: 'translate(0, 0)',
                                                        transition: isDrawingGalleryMode ? 'transform 90ms ease, box-shadow 90ms ease, background 150ms ease, color 150ms ease, border-color 150ms ease' : 'all 0.15s',
                                                    }}
                                                >
                                                    Load More ({visibleGalleryArtworks.length.toLocaleString()} / {filteredCount.toLocaleString()})
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </section>
                            </div>
                        </div>
                    );
                })(),
                document.body
            )}
            {/* POD Product Purchase Modal */}
            {productArtwork && (
                <ProductModal
                    artwork={{
                        id: productArtwork.id,
                        name: productArtwork.name,
                        artist: productArtwork.artist,
                        image: productArtwork.image,
                        year: productArtwork.date || undefined
                    } as any}
                    onClose={() => setProductArtwork(null)}
                />
            )}
        </>
    );
}
