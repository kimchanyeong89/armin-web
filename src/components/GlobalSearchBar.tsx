import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getTextEmbedding, isModelLoading } from '../utils/clipEmbedding';
import { getSearchThumbnail, getLightboxImage, getOptimizedImageUrl } from '../utils/imageProxy';
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

type GlobalSearchBarProps = {
    onOpenLightbox?: (artwork: SearchableArtwork, openLightbox?: boolean) => void;
    onNavigateToMuseum?: (museum: { id: string, name: string }, collectionId?: string, artwork?: SearchableArtwork) => void;
    museums?: Museum[];
    isModalOpen?: boolean;
    initialQuery?: string;
    isMobile?: boolean;
    inlineMode?: boolean;
    isDark?: boolean;
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

    // Legacy DDB IIIF thumbnails often used '/full/!w,h/0/default.jpg' and now 404.
    // Normalize to canonical '/full/full/0/default.jpg'.
    if (raw.includes('iiif.deutsche-digitale-bibliothek.de')) {
        return raw.replace(/\/full\/![0-9]+,[0-9]+\/0\/default\.jpg$/i, '/full/full/0/default.jpg');
    }

    return raw;
};

const getSafeImageUrl = (value?: string): string => normalizeKnownBrokenImageUrl(value) || FALLBACK_IMG;

const normalizeLookupText = (value?: string) =>
    String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

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

export default function GlobalSearchBar({ onOpenLightbox, onNavigateToMuseum, museums = [], isModalOpen, inlineMode = false }: GlobalSearchBarProps) {
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

    // AI Semantic Search
    const [isAIMode, setIsAIMode] = useState(false);
    const [aiResults, setAiResults] = useState<SearchableArtwork[]>([]);
    const [isAILoading, setIsAILoading] = useState(false);
    const [isClipLoading, setIsClipLoading] = useState(false);

    const [aiFilteredCount, setAiFilteredCount] = useState(0);
    const [aiFilteredVideoItems, setAiFilteredVideoItems] = useState<{ id: string; name: string; artist: string; museum?: string; reason?: string }[]>([]);
    const [showFilteredItems, setShowFilteredItems] = useState(false);
    const [videoEmbedIdsReady, setVideoEmbedIdsReady] = useState(false);
    const videoEmbedIdsRef = useRef<Set<string>>(new Set());



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

    const GALLERY_Z_BASE = 4500;
    const GALLERY_Z_BELOW_MODAL = 3400;
    // Dynamic Z-Index for ArtistGallery window management
    const [galleryZIndex, setGalleryZIndex] = useState(GALLERY_Z_BASE);
    const [galleryVisibleCount, setGalleryVisibleCount] = useState(160);
    const [galleryTheme, setGalleryTheme] = useState<'dark' | 'light'>('dark');
    const [galleryCategory, setGalleryCategory] = useState<string | null>(null);
    const [galleryWikiUrl, setGalleryWikiUrl] = useState('');
    const [galleryAsciiArt, setGalleryAsciiArt] = useState('');
    const [galleryMapSlide, setGalleryMapSlide] = useState(0);
    const [brueckeR2Lookup, setBrueckeR2Lookup] = useState<Record<string, string>>({});
    const slideDragStartX = useRef<number | null>(null);
    const galleryContainerRef = useRef<HTMLDivElement>(null);

    // Nav/dropdown theme — synced with the global homeTheme preference
    const [isNavDark, setIsNavDark] = useState(() => {
        try { return localStorage.getItem('homeTheme') !== 'light'; } catch { return true; }
    });
    useEffect(() => {
        const sync = () => {
            try { setIsNavDark(localStorage.getItem('homeTheme') !== 'light'); } catch { /* ignore */ }
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

    const filteredGalleryArtworks = useMemo(() => {
        if (!artistGallery?.artworks?.length) return [] as SearchableArtwork[];
        return galleryCategory
            ? artistGallery.artworks.filter(art => normalizeArtworkCategory(art) === galleryCategory)
            : artistGallery.artworks;
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
                    artworkId: art.id,
                    title: art.name,
                    artist: art.artist,
                    image: art.image || '',
                    museumName: art.museumName || '',
                    year: art.date || '',
                    likedAt: new Date()
                });
            }
        } catch (error) {
            console.error('Failed to toggle artwork like:', error);
            // Optional: Show toast or visual feedback
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

    useEffect(() => {
        const routeName = getRouteArtistName();
        if (!routeName) {
            pendingRouteArtistRef.current = null;
            if (artistGallery) {
                setArtistGallery(null);
                setLightboxArtwork(null);

            }
            return;
        }

        pendingRouteArtistRef.current = routeName;
        if (artistGallery?.artist === routeName) return;
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
    }, [artistGallery, artistGallery?.artist, getRouteArtistName, ensureWorker]);

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

            setAiFilteredVideoItems([]);
            setAiFilteredCount(0);
            return;
        }

        if (!videoEmbedIdsReady) {
            setAiResults([]);

            setAiFilteredVideoItems([]);
            setAiFilteredCount(0);
            return;
        }

        setIsAILoading(true);

        try {
            // 모델이 로딩 중이면 로딩 상태 표시
            if (isModelLoading()) {
                setIsClipLoading(true);
            }

            // 브라우저에서 CLIP 텍스트 임베딩 생성 (무료!)
            let embedding = await getTextEmbedding(searchQuery);
            setIsClipLoading(false);

            // DEBUG warning if still failing
            if (!embedding) {
                console.warn('Failed to generate text embedding');
                return;
            }

            // Worker의 /search-by-vector 엔드포인트로 검색
            const response = await fetch('https://armin-semantic-search.armin-art.workers.dev/search-by-vector', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vector: embedding, limit: 50 }),
            });

            const data = await response.json();

            if (data.results) {
                const excludedKeywords = [
                    'national museum of korea',
                    'gyeongju',
                    'buyeo',
                    'serpentine',
                    'serpentine gallery',
                    'british museum',
                    'the british museum'
                ];
                const isExcludedMuseum = (museum?: string) => {
                    const m = (museum || '').toLowerCase();
                    return m.includes('serpentine gallery') || m.includes('british museum');
                };
                const rawCount = Array.isArray(data.results) ? data.results.length : 0;

                const filteredItems: { id: string; name: string; artist: string; museum?: string; reason?: string }[] = [];

                data.results.forEach((r: any) => {
                    if (!r?.id) return;

                    if (videoEmbedIdsRef.current.size > 0 && videoEmbedIdsRef.current.has(r.id)) {
                        filteredItems.push({
                            id: r.id,
                            name: r.name || 'Untitled',
                            artist: r.artist || 'Unknown',
                            museum: r.museum || '',
                            reason: 'video-embed-id'
                        });
                        return;
                    }

                    const rawUrl = r.i || r.image || r.url;
                    if (!rawUrl) {
                        filteredItems.push({
                            id: r.id,
                            name: r.name || 'Untitled',
                            artist: r.artist || 'Unknown',
                            museum: r.museum || '',
                            reason: 'no-image-url'
                        });
                        return;
                    }

                    if (rawUrl.includes('youtube.com') || rawUrl.includes('youtu.be') || rawUrl.includes('vimeo')) {
                        filteredItems.push({
                            id: r.id,
                            name: r.name || 'Untitled',
                            artist: r.artist || 'Unknown',
                            museum: r.museum || '',
                            reason: 'video-url'
                        });
                        return;
                    }

                    if (r.youtubeId || r.vimeoId) {
                        filteredItems.push({
                            id: r.id,
                            name: r.name || 'Untitled',
                            artist: r.artist || 'Unknown',
                            museum: r.museum || '',
                            reason: 'video-id'
                        });
                        return;
                    }

                    const lower = String(rawUrl).toLowerCase().split('?')[0];
                    const hasImageExtension = /\.(jpg|jpeg|png|webp|avif|gif|bmp|tiff)$/i.test(lower);
                    const isKnownImageSource = /(googleusercontent|ggpht|wsrv\.nl|cloudinary|imgix|cloudfront|r2\.dev|upload\.wikimedia|tile\.loc\.gov|images\.metmuseum\.org|museum\.wales\/media-dams)/i.test(rawUrl);
                    const hasExplicitImagePath = /(\/images\/|\/img\/|\/photos\/|\/media\/)/i.test(rawUrl);
                    const isNotPage = !/\.(html|php|asp|jsp)$/i.test(lower) && !/\/whats-on\//i.test(lower) && !/\/exhibition\//i.test(lower);
                    const isValidImage = (hasImageExtension || isKnownImageSource || (hasExplicitImagePath && isNotPage));

                    if (!isValidImage) {
                        filteredItems.push({
                            id: r.id,
                            name: r.name || 'Untitled',
                            artist: r.artist || 'Unknown',
                            museum: r.museum || '',
                            reason: 'non-image-url'
                        });
                        return;
                    }

                    if (isExcludedMuseum(r.museum)) {
                        return;
                    }

                    const idLower = r.id.toLowerCase();
                    if (excludedKeywords.some(k => idLower.includes(k.replace(/ /g, '-')))) {
                        return;
                    }
                });

                setAiFilteredVideoItems(filteredItems);


                const filteredRaw = data.results.filter((r: any) => {
                    if (!r.id) return false;

                    if (videoEmbedIdsRef.current.size > 0 && videoEmbedIdsRef.current.has(r.id)) return false;

                    // Determine the best image URL candidate
                    // Priority: r.i (debug/explicit) -> r.image (metadata) -> r.url (metadata)
                    const rawUrl = r.i || r.image || r.url;

                    // Filter out items without any potential image URL
                    if (!rawUrl) return false;

                    // Explicitly exclude video URLs
                    if (rawUrl.includes('youtube.com') || rawUrl.includes('youtu.be') || rawUrl.includes('vimeo')) return false;

                    // Exclude ONLY items that are actively embedded video players (e.g. having a YouTube ID)
                    // User Request: Do NOT hide all 'video/documentary' types, only those that are "embedded via providers"
                    if (r.youtubeId || r.vimeoId) return false;

                    // STRICT CHECK: Exclude URLs that look like webpages rather than straight images
                    const lower = rawUrl.toLowerCase().split('?')[0]; // Ignore query params for extension check

                    // 1. Must have a standard image extension
                    const hasImageExtension = /\.(jpg|jpeg|png|webp|avif|gif|bmp|tiff)$/i.test(lower);

                    // 2. OR must be from a known dedicated image CDN/Source
                    // Added 'ggpht' (Google), 'wikimedia', 'twimg', etc.
                    const isKnownImageSource = /(googleusercontent|ggpht|wsrv\.nl|cloudinary|imgix|cloudfront|r2\.dev|upload\.wikimedia|tile\.loc\.gov|images\.metmuseum\.org)/i.test(rawUrl);

                    // 3. OR must have a very explicit image path segment (not just 'content' or 'upload' which can be pages)
                    // e.g. /images/, /img/, /photos/, /media/ combined with NOT ending in .html/.php
                    // Intentionally removed 'content', 'upload', 'assets', 'files' as they are too generic
                    const hasExplicitImagePath = /(\/images\/|\/img\/|\/photos\/|\/media\/)/i.test(rawUrl);
                    const isNotPage = !/\.(html|php|asp|jsp)$/i.test(lower) && !/\/whats-on\//i.test(lower) && !/\/exhibition\//i.test(lower);

                    // Decision
                    const isValidImage = (hasImageExtension || isKnownImageSource || (hasExplicitImagePath && isNotPage));

                    if (!isValidImage) {
                        // console.log('[Search Filter] Dropped non-image item:', r.id, rawUrl);
                        return false;
                    }

                    if (isExcludedMuseum(r.museum)) return false;
                    const idLower = r.id.toLowerCase();
                    return !excludedKeywords.some(k => idLower.includes(k.replace(/ /g, '-')));
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

                    return {
                        id: r.id,
                        name: r.name || 'Untitled',
                        artist: r.artist || 'Unknown',
                        image: r.i || r.image || r.url || '',
                        museumName: r.museum || museumMatch?.name || '',
                        exhibitionId: exhibitionId || '',
                        sourceUrl: r.sourceUrl || ''
                    } as SearchableArtwork;
                });

                setAiFilteredCount(filteredItems.length > 0 ? filteredItems.length : Math.max(rawCount - filteredRaw.length, 0));
                setAiResults(results);

            } else if (data.error) {
                console.error('Search error:', data.error);
                setAiResults([]);
                setAiFilteredVideoItems([]);
            } else {
                setAiResults([]);
                setAiFilteredVideoItems([]);
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
            setAiFilteredVideoItems([]);
        } finally {
            setIsAILoading(false);
            setIsClipLoading(false);
        }
    }, [videoEmbedIdsReady, museums, resolveCollectionIdForMuseum, findMuseumForArtwork]);

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
        }, isAIMode ? 500 : 150);

        return () => clearTimeout(timer);
    }, [query, museums, isAIMode, performSemanticSearch, ensureWorker]);

    useEffect(() => {
        if (!videoEmbedIdsReady || !isAIMode || query.length < 3) return;
        performSemanticSearch(query);
    }, [videoEmbedIdsReady, isAIMode, query, performSemanticSearch]);



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
        const target = `/artist-gallery/${encodeURIComponent(slug)}?name=${encodeURIComponent(artist)}`;
        const current = `${location.pathname}${location.search}`;
        if (current !== target) {
            navigate(target);
        }
    }, [location.pathname, navigate, toArtistSlug]);

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
    const navDropBg       = isNavDark ? 'rgba(18,17,16,0.94)'     : 'rgba(255,255,255,0.92)';
    const navDropShadow   = isNavDark ? '0 12px 40px rgba(0,0,0,0.45), inset 0 1px 1px rgba(255,255,255,0.04)'
                                      : '0 12px 40px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255,255,255,0.7)';
    const navDropBorder   = isNavDark ? 'rgba(255,255,255,0.06)'   : 'rgba(0,0,0,0.08)';
    const navSectionBg    = isNavDark ? 'rgba(10,10,8,0.5)'        : 'rgba(245,242,237,0.75)';
    const navSectionBorder= isNavDark ? 'rgba(201,165,90,0.15)'    : 'rgba(180,155,100,0.2)';
    const navLabelColor   = isNavDark ? '#8a867d'                   : '#7a7268';
    const navPillText     = isNavDark ? '#f0ede6'                   : '#1a1918';
    const navTitleColor   = isNavDark ? '#f0ede6'                   : '#1a1918';
    const navSubColor     = isNavDark ? '#8a867d'                   : '#6b6560';
    const navMuseumColor  = isNavDark ? '#5a5650'                   : '#8a8278';
    const navThumbBg      = isNavDark ? '#1a1918'                   : '#eae6df';
    const navDivider      = isNavDark ? 'rgba(201,165,90,0.12)'     : 'rgba(180,155,100,0.18)';
    const navHintColor    = isNavDark ? '#7a7570'                   : '#8a8278';
    const navItemHover    = isNavDark ? 'rgba(201,165,90,0.08)'     : 'rgba(180,155,100,0.1)';

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

            {/* Backdrop Overlay for Mobile Expanded Mode */}
            {isMobile && isExpanded && createPortal(
                <div
                    onClick={() => setIsExpanded(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 4999,
                        background: 'rgba(0,0,0,0.2)',
                        backdropFilter: 'blur(2px)',
                    }}
                />,
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
                    position: inlineMode ? 'relative' : 'fixed',
                    zIndex: (!!artistGallery) && !lightboxArtwork && !isModalOpen ? 14000 : 5000,
                    transition: inlineMode
                        ? 'width 450ms cubic-bezier(0.34, 1.1, 0.64, 1), background 300ms ease, border-radius 350ms ease'
                        : 'height 600ms cubic-bezier(0.65, 0, 0.35, 1), bottom 600ms cubic-bezier(0.65, 0, 0.35, 1), transform 600ms cubic-bezier(0.65, 0, 0.35, 1), width 600ms cubic-bezier(0.65, 0, 0.35, 1), border-radius 600ms cubic-bezier(0.65, 0, 0.35, 1)',

                    ...(inlineMode ? {
                        // When collapsed: golden circle | When expanded: full-width transparent pill inside GlobalNav
                        width: isExpanded ? 'min(420px, 85vw)' : '48px',
                        height: '48px', // always fixed height; dropdown is separate
                        background: isExpanded ? 'transparent' : '#e8fb36',
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
                {/* Input */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: isExpanded ? '0 12px' : (inlineMode ? '0' : '10px 16px'),
                    gap: 8,
                    width: '100%',
                    height: inlineMode ? '48px' : 'auto',
                    justifyContent: (inlineMode && !isExpanded) ? 'center' : 'flex-start',
                    boxSizing: 'border-box' as const,
                }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={inlineMode && !isExpanded ? "#000" : "#c9a55a"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>

                    {(isExpanded || !inlineMode) && (
                        <>
                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onFocus={() => {
                                    setIsExpanded(true);
                                }}
                                placeholder={isLoading ? 'Loading...' : (isExpanded ? 'Search artworks, artists...' : 'Search artworks...')}
                                style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 16, outline: 'none', color: inlineMode ? navTitleColor : '#f0ede6' }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                }}
                            />
                            {query && (
                                <button onClick={(e) => { e.stopPropagation(); setQuery(''); inputRef.current?.focus(); }} style={{ background: '#e5e7eb', border: 'none', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 12, color: '#666' }}>✕</button>
                            )}
                            {/* AI Mode Toggle */}
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsAIMode(!isAIMode); setAiResults([]); }}
                                style={{
                                    background: isAIMode ? '#e8fb36' : 'transparent',
                                    border: isAIMode ? 'none' : '1px solid #ddd',
                                    borderRadius: '100px',
                                    padding: '6px 14px',
                                    fontSize: 12,
                                    fontWeight: 800,
                                    color: isAIMode ? '#000' : '#888',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    transition: 'all 0.2s ease',
                                    fontFamily: "'Inter', Arial, sans-serif"
                                }}
                                onMouseEnter={(e) => {
                                    if (!isAIMode) e.currentTarget.style.color = '#000';
                                    if (!isAIMode) e.currentTarget.style.borderColor = '#aaa';
                                }}
                                onMouseLeave={(e) => {
                                    if (!isAIMode) e.currentTarget.style.color = '#888';
                                    if (!isAIMode) e.currentTarget.style.borderColor = '#ddd';
                                }}
                                title={isAIMode ? 'Switch to text search' : 'Switch to AI semantic search'}
                            >
                                <span style={{ fontSize: 12 }}>✨</span>
                                AI
                            </button>
                            {!isExpanded && !isMobile && !inlineMode && (
                                <span style={{ fontSize: 10, color: '#8a867d', marginLeft: 4, whiteSpace: 'nowrap', letterSpacing: '0.04em' }}>TAB</span>
                            )}
                            {isExpanded && !query && (
                                <button onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }} style={{ background: 'transparent', border: 'none', padding: 4, cursor: 'pointer', color: '#8a867d', fontSize: 12 }}>▼</button>
                            )}
                        </>
                    )}
                </div>

                {/* Content Wrapper for smooth height measurement */}
                <div
                    ref={contentRef}
                    style={{
                        maxHeight: 'calc(80vh - 60px)',
                        overflowY: 'auto',
                        overscrollBehavior: 'contain',
                        WebkitOverflowScrolling: 'touch',
                        ...(inlineMode ? (() => {
                            // Compute offset to keep the dropdown within the viewport
                            let left: string | number = 0;
                            let right: string | number = 'auto';
                            if (containerRef.current) {
                                const rect = containerRef.current.getBoundingClientRect();
                                const dropdownW = Math.min(400, window.innerWidth * 0.94);
                                const spaceRight = window.innerWidth - rect.left;
                                if (spaceRight < dropdownW) {
                                    // Would clip on right, anchor to right edge
                                    left = 'auto';
                                    right = 0;
                                } else {
                                    left = 0;
                                    right = 'auto';
                                }
                            }
                            return {
                                position: 'absolute' as const,
                                top: '100%',
                                left,
                                right,
                                marginTop: '10px',
                                background: navDropBg,
                                backdropFilter: 'blur(30px) saturate(200%)',
                                WebkitBackdropFilter: 'blur(30px) saturate(200%)',
                                boxShadow: navDropShadow,
                                borderRadius: '16px',
                                opacity: isExpanded ? 1 : 0,
                                pointerEvents: isExpanded ? 'auto' as const : 'none' as const,
                                transition: 'opacity 250ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                                transform: isExpanded ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.97)',
                                border: `1px solid ${navDropBorder}`,
                                minWidth: '320px',
                                width: 'max-content',
                                maxWidth: 'min(400px, 94vw)',
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
                        <div style={{ padding: '8px 16px', borderTop: '1px solid #e5e7eb', background: 'linear-gradient(135deg, rgba(102,126,234,0.05) 0%, rgba(118,75,162,0.05) 100%)' }}>
                            <div style={{ fontSize: 11, color: '#764ba2', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span>✨</span>
                                <span>
                                    {isClipLoading
                                        ? 'Loading AI model... (first time only, ~30MB)'
                                        : isAILoading
                                            ? 'Searching...'
                                            : `AI Semantic Search (${aiResults.length} results${aiFilteredCount > 0 ? `, filtered ${aiFilteredCount}` : ''})`}
                                </span>
                            </div>
                            <div style={{ marginTop: 6, padding: '8px 10px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: '#9a3412', marginBottom: 6 }}>Filtered items (preview) · {aiFilteredVideoItems.length}</div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowFilteredItems(!showFilteredItems); }}
                                    style={{ background: '#fff', border: '1px solid #fed7aa', borderRadius: 6, padding: '4px 8px', fontSize: 11, color: '#9a3412', cursor: 'pointer', marginBottom: 6 }}
                                >
                                    {showFilteredItems ? 'Hide filtered list' : 'Show filtered list'}
                                </button>
                                {showFilteredItems && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                                        {aiFilteredVideoItems.length === 0 && (
                                            <div style={{ fontSize: 12, color: '#7c2d12' }}>No filtered items for this query.</div>
                                        )}
                                        {aiFilteredVideoItems.slice(0, 20).map(item => (
                                            <div key={`filtered-${item.id}`} style={{ fontSize: 12, color: '#7c2d12' }}>
                                                <div style={{ fontWeight: 600 }}>{item.name}</div>
                                                <div style={{ fontSize: 11, opacity: 0.8 }}>{item.artist} · {item.museum || 'Unknown'} · {item.id} · {item.reason || 'filtered'}</div>
                                            </div>
                                        ))}
                                        {aiFilteredVideoItems.length > 20 && (
                                            <div style={{ fontSize: 11, color: '#9a3412' }}>+ {aiFilteredVideoItems.length - 20} more</div>
                                        )}
                                    </div>
                                )}
                            </div>
                            {query.length >= 3 && !isAILoading && !isClipLoading && aiResults.length === 0 && (
                                <div style={{ fontSize: 12, color: '#888', padding: '8px 0' }}>No AI results for "{query}". Try: "impressionist landscape", "portrait of woman", "religious painting"</div>
                            )}
                        </div>
                    )}

                    {/* AI Results Grid */}
                    {isExpanded && isAIMode && aiResults.length > 0 && (
                        <div
                            onWheel={(e) => e.stopPropagation()}
                            onTouchMove={(e) => e.stopPropagation()}
                            style={{
                                borderTop: '1px solid #e5e7eb',
                            }}
                        >
                            {aiResults.map((art, idx) => (
                                <div
                                    key={`ai-${art.id}-${idx}`}
                                    className="search-result-item"
                                    onClick={(e) => { e.stopPropagation(); handleSelectArtwork(art); }}
                                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', cursor: 'pointer', borderBottom: idx < aiResults.length - 1 ? '1px solid #f3f4f6' : 'none', transition: 'background 150ms ease' }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <div style={{ width: 44, height: 44, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: '#f3f4f6' }}>
                                        <img src={getSearchThumbnail(getSafeImageUrl(art.image))} alt="" onError={handleImageError} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#222', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{art.name}</div>
                                        <div style={{ fontSize: 11, color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{art.artist}</div>
                                        <div style={{ fontSize: 10, color: '#999' }}>{art.museumName}</div>
                                    </div>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Regular Results */}
                    {isExpanded && !isAIMode && filteredArtworks.length > 0 && (
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
                                        <div style={{ fontSize: 13, fontWeight: 600, color: navTitleColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{art.name}</div>
                                        {(() => {
                                            const yearLabel = formatArtworkYear(art.date);
                                            return (
                                                <div style={{ fontSize: 11, color: navSubColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {art.artist}{yearLabel ? ` • ${yearLabel}` : ''}
                                                </div>
                                            );
                                        })()}
                                        <div style={{ fontSize: 10, color: navMuseumColor }}>
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
                    {isExpanded && query.length >= 2 && !isAIMode && filteredArtworks.length === 0 && suggestedArtists.length === 0 && !isLoading && (
                        <div style={{ padding: '16px', textAlign: 'center', color: navSubColor, fontSize: 13, borderTop: `1px solid ${navDivider}` }}>No results for "{query}"</div>
                    )}

                    {/* Hint */}
                    {isExpanded && query.length < 2 && !isLoading && (
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
                    const isDark = galleryTheme === 'dark';
                    const bg = isDark ? '#080807' : '#f7f4ef';
                    const cardBg = isDark ? '#0f0e0d' : '#ffffff';
                    const btnBg = isDark ? '#1c1b1a' : '#f2ede6';
                    const textMain = isDark ? '#f0ede6' : '#1a1918';
                    const textSub = isDark ? '#8a8075' : '#6b6560';
                    const accent = isDark ? '#c9a55a' : '#8a6420';
                    const border = isDark ? '#1e1d1c' : '#ddd8cf';
                    const borderLight = isDark ? '#2a2927' : '#e5e0d8';
                    const asciiArt = galleryAsciiArt || buildFallbackAscii(artistGallery.artist);
                    const filteredCount = filteredGalleryArtworks.length;
                    const hasMoreGalleryArtworks = visibleGalleryArtworks.length < filteredGalleryArtworks.length;
                    return (
                        <div
                            style={{
                                position: 'fixed',
                                inset: 0,
                                zIndex: galleryZIndex,
                                background: isDark ? 'rgba(8,8,7,0.97)' : 'rgba(247,244,239,0.97)',
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
                                overflow: 'hidden',
                                borderRadius: isMobile ? 12 : 16,
                                border: `1px solid ${border}`,
                                background: bg,
                                marginBottom: 40,
                            }}>

                                {/* ── HERO ─────────────────────────────────────── */}
                                <header style={{
                                    padding: isMobile ? '28px 20px 24px' : '52px 60px 40px',
                                    borderBottom: `1px solid ${border}`,
                                    background: bg,
                                }}>
                                    {/* Eyebrow row */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMobile ? 18 : 28 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <span style={{
                                                fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase',
                                                color: accent, fontWeight: 500,
                                                padding: '4px 12px', border: `1px solid ${accent}66`,
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
                                            <button onClick={closeArtistGallery} style={{
                                                width: 36, height: 36, borderRadius: '50%', border: `1px solid ${border}`,
                                                background: btnBg, color: textSub, fontSize: 18,
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                outline: 'none',
                                            }}>✕</button>
                                        </div>
                                    </div>

                                    {/* Artist name + heart inline */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 14 : 22, marginBottom: 28 }}>
                                        <h1 style={{
                                            fontFamily: "'Playfair Display', Georgia, serif",
                                            fontSize: isMobile ? 'clamp(40px, 10vw, 56px)' : 'clamp(60px, 6vw, 96px)',
                                            fontWeight: 300,
                                            letterSpacing: '-0.02em',
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
                                    borderBottom: `1px solid ${border}`,
                                    background: bg,
                                }}>
                                    {/* Bio column */}
                                    <div style={{
                                        flex: isMobile ? '1 1 auto' : '0 0 50%',
                                        minWidth: 0,
                                        padding: isMobile ? '20px 16px' : '28px 36px',
                                        borderRight: isMobile ? 'none' : `1px solid ${border}`,
                                        borderBottom: isMobile ? `1px solid ${border}` : 'none',
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
                                            color: isDark ? '#3a3733' : '#c8c3bb',
                                            margin: '28px 0 0',
                                            lineHeight: 1.4,
                                            overflowX: 'auto',
                                            userSelect: 'none',
                                        }}>{asciiArt}</pre>
                                    </div>

                                    {/* Map column + Distribution slides */}
                                    {!isMobile && artistGallery.artworks.length > 0 && (() => {
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
                                            <div style={{ flex: '0 0 50%', minWidth: 0, boxSizing: 'border-box', padding: '24px 32px' }}>
                                                <p style={{ fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: accent, fontWeight: 500, margin: '0 0 14px' }}>Global Distribution</p>

                                                {/* Combined map + slides card */}
                                                <div style={{
                                                    width: '100%', borderRadius: 10, overflow: 'hidden',
                                                    border: `1px solid ${border}`,
                                                    display: 'flex', flexDirection: 'column',
                                                    minHeight: 200,
                                                }}>
                                                    {/* amCharts map — flex grow */}
                                                    <div style={{ flex: '1 1 0%', minHeight: 0, width: '100%', overflow: 'hidden' }}>
                                                        <Suspense fallback={<div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: textSub, fontSize: 12 }}>Loading map…</div>}>
                                                            <ArtistDistributionMap
                                                                artworks={artistGallery.artworks as any}
                                                                isDark={isDark}
                                                                hideLegend
                                                                mapHeight="160px"
                                                            />
                                                        </Suspense>
                                                    </div>

                                                    {/* Distribution slides — bottom of combined card */}
                                                    <div style={{
                                                        flexShrink: 0,
                                                        borderTop: `1px solid ${border}`,
                                                        background: isDark ? '#131211' : 'rgb(245,242,237)',
                                                        userSelect: 'none',
                                                    }}>
                                                        <style>{`._armin-slide-scroll::-webkit-scrollbar{display:none}@keyframes arminCardReveal{0%{opacity:0;transform:translateY(18px)}100%{opacity:1;transform:translateY(0)}}[data-art-card]{opacity:0;transform:translateY(18px);animation:arminCardReveal .56s cubic-bezier(.25,1,.35,1) forwards}`}</style>

                                                        {/* Grab area — CSS transform slide strip */}
                                                        <div
                                                            style={{ overflow: 'hidden', cursor: 'grab', touchAction: 'pan-y' }}
                                                            onMouseDown={(e) => { slideDragStartX.current = e.clientX; }}
                                                            onMouseUp={(e) => {
                                                                if (slideDragStartX.current === null) return;
                                                                const delta = e.clientX - slideDragStartX.current;
                                                                slideDragStartX.current = null;
                                                                if (Math.abs(delta) < 40) return;
                                                                setGalleryMapSlide(prev => delta < 0 ? Math.min(2, prev + 1) : Math.max(0, prev - 1));
                                                            }}
                                                            onMouseLeave={() => { slideDragStartX.current = null; }}
                                                            onTouchStart={(e) => { slideDragStartX.current = e.touches[0].clientX; }}
                                                            onTouchEnd={(e) => {
                                                                if (slideDragStartX.current === null) return;
                                                                const delta = e.changedTouches[0].clientX - slideDragStartX.current;
                                                                slideDragStartX.current = null;
                                                                if (Math.abs(delta) < 40) return;
                                                                setGalleryMapSlide(prev => delta < 0 ? Math.min(2, prev + 1) : Math.max(0, prev - 1));
                                                            }}
                                                        >
                                                            {/* 3-slide strip — width:300%, CSS transform */}
                                                            <div style={{
                                                                display: 'flex',
                                                                width: '300%',
                                                                willChange: 'transform',
                                                                transition: 'transform 0.38s cubic-bezier(0.15, 0, 0, 1)',
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
                                                style={{
                                                    padding: '4px 12px', borderRadius: 20,
                                                    border: `1px solid ${!galleryCategory ? accent : border}`,
                                                    background: !galleryCategory ? accent : 'transparent',
                                                    color: !galleryCategory ? (isDark ? '#080807' : '#fff') : textSub,
                                                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                                    letterSpacing: '0.04em', transition: 'all 0.15s',
                                                }}
                                            >All · {artistGallery.artworks.length.toLocaleString()}</button>
                                            {galleryCategories.map(({ cat, cnt }) => {
                                                const active = galleryCategory === cat;
                                                return (
                                                    <button key={cat} onClick={() => setGalleryCategory(active ? null : cat)} style={{
                                                        padding: '4px 12px', borderRadius: 20,
                                                        border: `1px solid ${active ? accent : border}`,
                                                        background: active ? accent : 'transparent',
                                                        color: active ? (isDark ? '#080807' : '#fff') : textSub,
                                                        fontSize: 11, fontWeight: active ? 600 : 400,
                                                        cursor: 'pointer', letterSpacing: '0.04em', transition: 'all 0.15s',
                                                    }}>{cat} · {cnt.toLocaleString()}</button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Masonry grid */}
                                    <div style={{ padding: isMobile ? '0 12px' : '0 60px' }} ref={galleryContainerRef}>
                                        <div style={{ display: 'flex', gap: isMobile ? 10 : 20, alignItems: 'flex-start' }}>
                                            {artistGalleryColumns.map((column, columnIdx) => (
                                                <div key={`artist-column-${columnIdx}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: isMobile ? 10 : 20 }}>
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
                                                                    border: `1px solid ${border}`,
                                                                    borderRadius: 6,
                                                                    transition: 'border-color 0.2s',
                                                                    position: 'relative',
                                                                }}>
                                                                    <img
                                                                        src={getOptimizedImageUrl(resolveGalleryImageUrl(art), 600)}
                                                                        style={{
                                                                            width: '100%', height: 'auto', display: 'block',
                                                                            transition: 'transform 750ms cubic-bezier(0.22,1,0.36,1), opacity 0.45s ease, filter 0.45s ease',
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
                                                    style={{
                                                        border: `1px solid ${border}`,
                                                        background: 'transparent',
                                                        color: textSub,
                                                        borderRadius: 999,
                                                        padding: '8px 14px',
                                                        fontSize: 12,
                                                        cursor: 'pointer',
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
