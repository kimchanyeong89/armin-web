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
const ArtistDistributionMap = lazy(() => import('./ArtistDistributionMap'));



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

export type GlobalSearchBarProps = {
    onOpenLightbox: (artwork: SearchableArtwork, openLightbox?: boolean) => void;
    onNavigateToMuseum: (museum: { id: string, name: string }, collectionId?: string, artwork?: SearchableArtwork) => void;
    museums?: Museum[];
    isModalOpen?: boolean;
    initialQuery?: string;
    isMobile?: boolean;
    inlineMode?: boolean;
    isDark?: boolean;
    skin?: "default" | "drawing";
    onExpandChange?: (isExpanded: boolean) => void;
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

export default function GlobalSearchBar({ onOpenLightbox, onNavigateToMuseum, museums = [], isModalOpen, inlineMode = false , /* isDark */ skin = "default", onExpandChange}: GlobalSearchBarProps) {
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
    useEffect(() => { onExpandChange?.(isExpanded); }, [isExpanded, onExpandChange]);
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
    const [hoveredArtworkId, setHoveredArtworkId] = useState<string | null>(null);
    const [galleryTheme, setGalleryTheme] = useState<'dark' | 'light'>('dark');
    const [galleryCategory, setGalleryCategory] = useState<string | null>(null);

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

    // Reset category filter when artist changes
    useEffect(() => {
        setGalleryCategory(null);
    }, [artistGallery?.artist]);

    const artistGalleryColumns = useMemo(() => {
        if (!artistGallery || !artistGallery.artworks?.length) return [];
        const filtered = galleryCategory
            ? artistGallery.artworks.filter(art => normalizeArtworkCategory(art) === galleryCategory)
            : artistGallery.artworks;
        if (!filtered.length) return [];
        const desiredCount = isMobile ? 2 : 4;
        const safeCount = Math.min(desiredCount, Math.max(1, filtered.length));
        const columns = Array.from({ length: safeCount }, () => [] as SearchableArtwork[]);
        filtered.forEach((art, index) => {
            columns[index % safeCount].push(art);
        });
        return columns;
    }, [artistGallery, isMobile, galleryCategory, normalizeArtworkCategory]);

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

            if (type === 'LOAD_COMPLETE') {
                setTotalCount(count);
                setIsLoading(false);
                // Retrigger search if new data loaded while typing
                if (queryRef.current && queryRef.current.length >= 2) {
                    workerRef.current?.postMessage({ type: 'SEARCH', query: queryRef.current });
                }
                // Retry specific artist load if we are on an artist page and data is still streaming in
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
                    setArtistGallery(gallery);
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

        onNavigateToMuseum(targetMuseum, targetCollectionId || undefined, artwork);
    }, [findMuseumForArtwork, onNavigateToMuseum, resolveCollectionIdForMuseum]);

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
        onNavigateToMuseum({ id: museum.id, name: museum.name }, museum.permanentExhibitions?.[0]?.id);
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
        if (target.src === FALLBACK_IMG) return;
        target.onerror = null;
        target.src = FALLBACK_IMG;
    }, []);

    const lightboxYearLabel = lightboxArtwork ? formatArtworkYear(lightboxArtwork.date) : '';

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
                                style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 16, outline: 'none', color: '#f0ede6' }}
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
                                    fontFamily: skin === 'drawing' ? 'sans-serif' : "'Inter', Arial, sans-serif",
                                    
                                    letterSpacing: skin === 'drawing' ? '0.1em' : 'normal'
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
                                background: 'rgba(255, 255, 255, 0.65)',
                                backdropFilter: 'blur(30px) saturate(200%)',
                                WebkitBackdropFilter: 'blur(30px) saturate(200%)',
                                boxShadow: '0 12px 40px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255, 255, 255, 0.6)',
                                borderRadius: '16px',
                                opacity: isExpanded ? 1 : 0,
                                pointerEvents: isExpanded ? 'auto' as const : 'none' as const,
                                transition: 'opacity 250ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                                transform: isExpanded ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.97)',
                                border: '1px solid rgba(255,255,255,0.6)',
                                minWidth: '320px',
                                width: 'max-content',
                                maxWidth: 'min(400px, 94vw)',
                            };
                        })() : {})
                    }}
                >
                    {/* Artist suggestions */}
                    {isExpanded && suggestedArtists.length > 0 && (
                        <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(201,165,90,0.15)', background: 'rgba(10,10,8,0.5)' }}>
                            <div style={{ fontSize: 10, color: '#8a867d', marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Artists</div>
                            <div style={{ display: 'flex', overflowX: 'auto', gap: 6, paddingBottom: 4, scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
                                {suggestedArtists.map(({ artist, count }) => (
                                    <button
                                        key={artist}
                                        onClick={(e) => { e.stopPropagation(); handleSelectArtist(artist); }}
                                        style={{ background: 'rgba(201,165,90,0.12)', border: '1px solid rgba(201,165,90,0.3)', borderRadius: 16, padding: '5px 12px', fontSize: 12, color: '#f0ede6', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, transition: 'all 150ms ease', whiteSpace: 'nowrap', flexShrink: 0 }}
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
                        <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(201,165,90,0.15)', background: 'rgba(10,10,8,0.5)' }}>
                            <div style={{ fontSize: 10, color: '#8a867d', marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Museums</div>
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
                                        <img src={getSearchThumbnail(art.image)} alt="" onError={handleImageError} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
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
                                borderTop: '1px solid rgba(201,165,90,0.12)',
                            }}
                        >
                            {filteredArtworks.map((art, idx) => (
                                <div
                                    key={`${art.id}-${idx}`}
                                    className="search-result-item"
                                    onClick={(e) => { e.stopPropagation(); handleSelectArtwork(art); }}
                                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', cursor: 'pointer', borderBottom: idx < filteredArtworks.length - 1 ? '1px solid rgba(201,165,90,0.08)' : 'none', transition: 'background 150ms ease' }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(201,165,90,0.08)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <div style={{ width: 44, height: 44, borderRadius: 4, overflow: 'hidden', flexShrink: 0, background: '#1a1918' }}>
                                        <img src={getSearchThumbnail(art.image)} alt="" onError={handleImageError} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#f0ede6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{art.name}</div>
                                        {(() => {
                                            const yearLabel = formatArtworkYear(art.date);
                                            return (
                                                <div style={{ fontSize: 11, color: '#8a867d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {art.artist}{yearLabel ? ` • ${yearLabel}` : ''}
                                                </div>
                                            );
                                        })()}
                                        <div style={{ fontSize: 10, color: '#5a5650' }}>
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
                        <div style={{ padding: '16px', textAlign: 'center', color: '#8a867d', fontSize: 13, borderTop: '1px solid rgba(201,165,90,0.12)' }}>
                            Loading search data...
                        </div>
                    )}

                    {/* No results */}
                    {isExpanded && query.length >= 2 && !isAIMode && filteredArtworks.length === 0 && suggestedArtists.length === 0 && !isLoading && (
                        <div style={{ padding: '16px', textAlign: 'center', color: '#8a867d', fontSize: 13, borderTop: '1px solid rgba(201,165,90,0.12)' }}>No results for "{query}"</div>
                    )}

                    {/* Hint */}
                    {isExpanded && query.length < 2 && !isLoading && (
                        <div style={{ padding: '12px 16px', textAlign: 'center', color: '#7a7570', fontSize: 12, borderTop: '1px solid rgba(201,165,90,0.12)', letterSpacing: '0.02em' }}>
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
                    const textMain = isDark ? '#f0ede6' : '#1a1918';
                    const textSub = isDark ? '#8a8075' : '#6b6560';
                    const accent = isDark ? '#c9a55a' : '#8a6420';
                    const border = isDark ? '#1e1d1c' : '#ddd8cf';
                    return (
                        <div
                            style={{
                                position: 'fixed',
                                inset: 0,
                                zIndex: galleryZIndex,
                                background: isDark ? 'rgba(8,8,7,0.97)' : 'rgba(247,244,239,0.97)',
                                backdropFilter: 'blur(16px)',
                                WebkitBackdropFilter: 'blur(16px)',
                                display: 'flex',
                                alignItems: 'flex-start',
                                justifyContent: 'center',
                                padding: isMobile ? 0 : '60px 40px 40px 40px',
                                overflowY: isMobile ? 'hidden' : 'auto',
                                transition: 'background 0.3s',
                            }}
                            onClick={closeArtistGallery}
                            onWheel={(e) => e.stopPropagation()}
                        >
                            <div
                                onClick={e => e.stopPropagation()}
                                style={{
                                    width: '100%',
                                    maxWidth: 1200,
                                    background: bg,
                                    display: 'flex',
                                    // CSS vars for ArtistDistributionMap legend & ArtistPage.css
                                    ['--ap-accent' as any]: accent,
                                    ['--ap-text-3' as any]: textSub,
                                    ['--ap-text-4' as any]: isDark ? '#5a5650' : '#9a9590',
                                    ['--ap-border' as any]: border,
                                    flexDirection: 'column',
                                    overflow: 'hidden',
                                    ...(isMobile ? { height: '100%', borderRadius: 0, border: 'none' } : { marginBottom: 40, borderRadius: 16, border: `1px solid ${border}` }),
                                }}
                            >
                                {/* ── Header ─────────────────────────────────── */}
                                <div style={{
                                    padding: isMobile ? '20px 20px 0' : '36px 40px 0',
                                    borderBottom: `1px solid ${border}`,
                                    background: bg,
                                    flexShrink: 0,
                                }}>
                                    {/* Top row: title + controls */}
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <h2 style={{
                                                    fontSize: isMobile ? 22 : 36,
                                                    fontWeight: 700,
                                                    fontFamily: "'Playfair Display', Georgia, serif",
                                                    margin: 0,
                                                    color: textMain,
                                                    letterSpacing: '-0.01em',
                                                    lineHeight: 1.15,
                                                }}>{artistGallery.artist}</h2>
                                                <HeartOverlay
                                                    isLiked={artistGalleryIsLiked}
                                                    onToggle={toggleLikeArtist}
                                                    size={isMobile ? 18 : 22}
                                                    color="#e11d48"
                                                    emptyColor={textSub}
                                                />
                                            </div>
                                            <p style={{ fontSize: isMobile ? 12 : 14, color: accent, margin: '6px 0 0', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>
                                                {artistGallery.artworks.length.toLocaleString()} works in collection
                                            </p>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                            {/* Theme toggle */}
                                            <button
                                                onClick={() => setGalleryTheme(t => t === 'dark' ? 'light' : 'dark')}
                                                title={isDark ? 'Switch to light' : 'Switch to dark'}
                                                style={{
                                                    width: 36, height: 36, borderRadius: '50%', border: `1px solid ${border}`,
                                                    background: cardBg, color: textSub, fontSize: 16, cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    transition: 'all 0.2s',
                                                }}
                                            >{isDark ? '☀' : '☾'}</button>
                                            {/* Close */}
                                            <button onClick={closeArtistGallery} style={{
                                                width: 36, height: 36, borderRadius: '50%', border: `1px solid ${border}`,
                                                background: cardBg, color: textSub, fontSize: 18,
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                transition: 'all 0.2s',
                                            }}>✕</button>
                                        </div>
                                    </div>

                                    {/* Wiki bio */}
                                    <div style={{ marginTop: 16, marginBottom: 20 }}>
                                        <ArtistWikiPanel
                                            artistName={artistGallery.artist}
                                            imageUrl={undefined}
                                            fallbackDescription={artistFallbackDescription}
                                        />
                                    </div>

                                    {/* Distribution Map — lazy loaded to avoid blocking overlay open */}
                                    {!isMobile && artistGallery.artworks.length > 0 && (
                                        <div style={{ marginBottom: 28 }}>
                                            <p style={{ fontSize: 11, color: textSub, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10, fontWeight: 500 }}>
                                                Museum Distribution
                                            </p>
                                            <div style={{ height: 240, borderRadius: 10, overflow: 'hidden', border: `1px solid ${border}` }}>
                                                <Suspense fallback={
                                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: textSub, fontSize: 12 }}>
                                                        Loading map…
                                                    </div>
                                                }>
                                                    <ArtistDistributionMap
                                                        artworks={artistGallery.artworks as any}
                                                        isDark={isDark}
                                                    />
                                                </Suspense>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* ── Category filter pills ───────────────────── */}
                                {galleryCategories.length >= 1 && (
                                    <div style={{
                                        padding: isMobile ? '10px 16px 0' : '16px 40px 0',
                                        background: bg,
                                        flexShrink: 0,
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: 6,
                                        borderTop: `1px solid ${border}`,
                                    }}>
                                        {/* All */}
                                        <button
                                            onClick={() => setGalleryCategory(null)}
                                            style={{
                                                padding: '4px 12px',
                                                borderRadius: 20,
                                                border: `1px solid ${!galleryCategory ? accent : border}`,
                                                background: !galleryCategory ? accent : 'transparent',
                                                color: !galleryCategory ? (isDark ? '#080807' : '#fff') : textSub,
                                                fontSize: 11,
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                letterSpacing: '0.04em',
                                                transition: 'all 0.15s',
                                            }}
                                        >All · {artistGallery!.artworks.length.toLocaleString()}</button>
                                        {galleryCategories.map(({ cat, cnt }) => {
                                            const active = galleryCategory === cat;
                                            return (
                                                <button
                                                    key={cat}
                                                    onClick={() => setGalleryCategory(active ? null : cat)}
                                                    style={{
                                                        padding: '4px 12px',
                                                        borderRadius: 20,
                                                        border: `1px solid ${active ? accent : border}`,
                                                        background: active ? accent : 'transparent',
                                                        color: active ? (isDark ? '#080807' : '#fff') : textSub,
                                                        fontSize: 11,
                                                        fontWeight: active ? 600 : 400,
                                                        cursor: 'pointer',
                                                        letterSpacing: '0.04em',
                                                        transition: 'all 0.15s',
                                                    }}
                                                >{cat} · {cnt.toLocaleString()}</button>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* ── Artwork Grid ────────────────────────────── */}
                                <div style={{
                                    flex: 1,
                                    overflowY: 'auto',
                                    padding: isMobile ? '12px' : '20px 40px 40px',
                                    background: bg,
                                }}>
                                    <div style={{ display: 'flex', gap: isMobile ? 10 : 20, alignItems: 'flex-start' }}>
                                        {artistGalleryColumns.map((column, columnIdx) => (
                                            <div key={`artist-column-${columnIdx}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: isMobile ? 10 : 20 }}>
                                                {column.map((art, idx) => {
                                                    const yearLabel = formatArtworkYear(art.date);
                                                    const displayTitle = yearLabel ? `${art.name} (${yearLabel})` : art.name;
                                                    const museumCountry = museumCountryMap.get(art.museumName) || '';
                                                    const museumDisplay = museumCountry ? `${art.museumName} (${museumCountry})` : art.museumName;
                                                    const hovered = hoveredArtworkId === art.id;
                                                    return (
                                                        <div
                                                            key={art.id || `art-${columnIdx}-${idx}`}
                                                            onClick={() => handleSelectArtwork(art)}
                                                            onMouseEnter={() => setHoveredArtworkId(art.id)}
                                                            onMouseLeave={() => setHoveredArtworkId((prev) => (prev === art.id ? null : prev))}
                                                            style={{ cursor: 'pointer', position: 'relative' }}
                                                        >
                                                            <div style={{
                                                                borderRadius: 6,
                                                                overflow: 'hidden',
                                                                background: cardBg,
                                                                border: `1px solid ${border}`,
                                                                position: 'relative',
                                                            }}>
                                                                <img
                                                                    src={getOptimizedImageUrl(art.image, 600)}
                                                                    style={{
                                                                        width: '100%', height: 'auto', display: 'block',
                                                                        transition: 'transform 750ms cubic-bezier(0.22,1,0.36,1)',
                                                                        transform: hovered ? 'scale(1.05)' : 'scale(1)',
                                                                    }}
                                                                    loading="lazy"
                                                                    alt={art.name}
                                                                    referrerPolicy="no-referrer"
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
                                </div>
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
