import { useState, useEffect, useRef, useCallback } from 'react';
import { getTextEmbedding, isModelLoading } from '../utils/clipEmbedding';
import { getSearchThumbnail, getLightboxImage, getOptimizedImageUrl } from '../utils/imageProxy';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { HeartOverlay } from './HeartOverlay';



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
    onOpenLightbox: (artwork: SearchableArtwork, openLightbox?: boolean) => void;
    onNavigateToMuseum: (museum: { id: string, name: string }, collectionId?: string, artwork?: SearchableArtwork) => void;
    museums?: Museum[];
    isModalOpen?: boolean;
    initialQuery?: string;
    isMobile?: boolean;
};

// Fallback image for broken images
const FALLBACK_IMG = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23f3f4f6" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%23999" font-size="12">No Image</text></svg>';

export default function GlobalSearchBar({ onOpenLightbox, onNavigateToMuseum, museums = [], isModalOpen }: GlobalSearchBarProps) {
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
    const [isLoading, setIsLoading] = useState(false);
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
                return { artist: data.artist, artworks: works };
            }
        } catch {
            // Ignore parse errors
        }
        return null;
    });
    const [lightboxArtwork, setLightboxArtwork] = useState<SearchableArtwork | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const queryRef = useRef(query);

    // AI Semantic Search
    const [isAIMode, setIsAIMode] = useState(false);
    const [aiResults, setAiResults] = useState<SearchableArtwork[]>([]);
    const [isAILoading, setIsAILoading] = useState(false);

    // Mobile Drag State
    const [dragY, setDragY] = useState(0);
    const dragStartY = useRef(0);

    const isDragging = useRef(false);

    // Dynamic Z-Index for ArtistGallery window management (Step 1342)
    // Default high (13500). When ExhibitionModal opens, drops to 12500. When ArtistGallery opens/updates, back to 13500.
    const [galleryZIndex, setGalleryZIndex] = useState(13500);

    useEffect(() => {
        // When Artist Gallery opens or content updates, bring to front
        if (artistGallery) {
            setGalleryZIndex(13500);
        }
    }, [artistGallery]);

    // If Exhibition Modal opens (from elsewhere), push Artist Gallery back
    // If Exhibition Modal closes, bring Artist Gallery front (if open)
    // Also, if modal closes and we have a search query, expand the search bar to show results again (User Request Step 1438)
    useEffect(() => {
        if (isModalOpen) {
            setGalleryZIndex(12500);
        } else {
            setGalleryZIndex(13500);

            // Re-expand search bar if we have results/query and just closed modal
            // Only do this if we actually have a query (don't pop up empty)
            // AND ensure we are NOT in artist gallery mode (User Request)
            if (!artistGallery && query && query.length >= 2) {
                setIsExpanded(true);
            }
        }
    }, [isModalOpen, artistGallery, query]);

    const handleDragStart = (e: React.TouchEvent) => {
        dragStartY.current = e.touches[0].clientY;
        isDragging.current = true;
    };
    const handleDragMove = (e: React.TouchEvent) => {
        if (!isDragging.current) return;
        const currentY = e.touches[0].clientY;
        const diff = currentY - dragStartY.current;
        if (diff > 0) setDragY(diff);
    };
    const handleDragEnd = () => {
        isDragging.current = false;
        if (dragY > 120) closeArtistGallery();
        setDragY(0);
    };

    // User & Likes Logic
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [likedArtworks, setLikedArtworks] = useState<Set<string>>(new Set());
    const [likedArtists, setLikedArtists] = useState<Set<string>>(new Set());

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            if (user) {
                // Subscribe to liked artworks
                const unsubArt = onSnapshot(collection(db, `users/${user.uid}/liked_artworks`), (snap) => {
                    const ids = new Set(snap.docs.map(doc => doc.id));
                    setLikedArtworks(ids);
                });
                // Subscribe to liked artists
                const unsubArtist = onSnapshot(collection(db, `users/${user.uid}/liked_artists`), (snap) => {
                    const ids = new Set(snap.docs.map(doc => doc.id));
                    setLikedArtists(ids);
                });
                return () => { unsubArt(); unsubArtist(); };
            } else {
                setLikedArtworks(new Set());
                setLikedArtists(new Set());
            }
        });
        return () => unsubscribe();
    }, []);

    const toggleLikeArtwork = async (e: React.MouseEvent, art: SearchableArtwork) => {
        e.stopPropagation();
        if (!currentUser) {
            // Optional: trigger login modal or alert
            alert("Please sign in to like artworks");
            return;
        }
        const ref = doc(db, `users/${currentUser.uid}/liked_artworks/${art.id}`);
        if (likedArtworks.has(art.id)) {
            await deleteDoc(ref);
        } else {
            await setDoc(ref, {
                artworkId: art.id,
                title: art.name,
                artist: art.artist,
                image: art.image,
                museumName: art.museumName,
                year: art.date,
                likedAt: new Date()
            });
        }
    };

    const toggleLikeArtist = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!currentUser || !artistGallery) {
            if (!currentUser) alert("Please sign in to like artists");
            return;
        }
        const artistName = artistGallery.artist;
        // Use a safe ID (replace special chars? For now use directly or hash? Firestore IDs can be strings)
        // Artist names might have slashes or dots? Let's encode or just use as is if safe.
        // Better to use `encodeURIComponent` if used in path, but here it's ID.
        // Let's use the name as ID (assuming it's unique enough) but sanitize slashes.
        const artistId = artistName.replace(/\//g, '_');

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
    }, []);

    // Load search index
    // Initialize worker
    useEffect(() => {
        workerRef.current = new Worker(new URL('../workers/search.worker.ts', import.meta.url), { type: 'module' });

        workerRef.current.onmessage = (e) => {
            const { type, results, artists, count, artist, works } = e.data;

            // --- PRECISE COLLECTION RESOLVER ---
            // Helper to fix exhibitionId based on artwork ID patterns (for MAMCS, etc)
            const resolvePreciseCollectionId = (art: SearchableArtwork) => {
                // MAMCS Strasbourg Logic
                if (art.id && (art.id.startsWith('mamcs-') || art.id.startsWith('mamcs_'))) {
                    if (art.id.startsWith('mamcs-paintings-')) return 'mamcs-strasbourg-paintings-collection';
                    if (art.id.startsWith('mamcs-drawings-')) return 'mamcs-strasbourg-drawings-collection';
                    if (art.id.startsWith('mamcs-photography-')) return 'mamcs-strasbourg-photography-collection';
                    if (art.id.startsWith('mamcs-graphic-design-')) return 'mamcs-strasbourg-graphic-design-collection';
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
            } else if (type === 'RESULTS') {
                const preciseResults = (results || []).map((art: SearchableArtwork) => ({
                    ...art,
                    exhibitionId: resolvePreciseCollectionId(art)
                }));
                setFilteredArtworks(preciseResults);
                setSuggestedArtists(artists);
            } else if (type === 'DETAILS_RESULTS') { // For Semantic Search Worker response format might differ, checking usage
                const preciseAiResults = (results || []).map((art: SearchableArtwork) => ({
                    ...art,
                    exhibitionId: resolvePreciseCollectionId(art)
                }));
                setAiResults(preciseAiResults);
            } else if (type === 'ARTIST_WORKS') {
                if (artist) {
                    const preciseWorks = (works || []).map((art: SearchableArtwork) => ({
                        ...art,
                        exhibitionId: resolvePreciseCollectionId(art)
                    }));
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

        setIsLoading(true);
        workerRef.current.postMessage({ type: 'LOAD' });

        return () => {
            workerRef.current?.terminate();
        };
    }, []);


    // AI 모델 로딩 상태
    const [isClipLoading, setIsClipLoading] = useState(false);

    // Semantic search function - 브라우저에서 CLIP 텍스트 임베딩 생성
    const performSemanticSearch = useCallback(async (searchQuery: string) => {
        if (searchQuery.length < 3) {
            setAiResults([]);
            return;
        }

        setIsAILoading(true);

        // 실제 로직 복구
        try {
            // 모델이 로딩 중이면 로딩 상태 표시
            if (isModelLoading()) {
                setIsClipLoading(true);
            }

            // 브라우저에서 CLIP 텍스트 임베딩 생성 (무료!)
            let embedding = await getTextEmbedding(searchQuery);
            setIsClipLoading(false);

            // DEBUG: 임베딩 실패 시 더미 임베딩 사용 (연결 테스트용)
            // 만약 모델 로딩에 실패해도 검색 요청은 보내보도록 함
            if (!embedding) {
                console.warn('Failed to generate text embedding, using dummy embedding for DEBUG');
                embedding = new Array(512).fill(0.1);
            }

            // Worker의 /search-by-vector 엔드포인트로 검색
            const response = await fetch('https://armin-semantic-search.armin-art.workers.dev/search-by-vector', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vector: embedding, limit: 100 }),
            });

            const data = await response.json();

            if (data.results && data.results.length > 0) {
                const excludedKeywords = ['national museum of korea', 'gyeongju', 'buyeo'];

                // 시맨틱 검색 Worker가 반환한 메타데이터를 직접 사용
                const results = data.results
                    .filter((r: any) => {
                        if (!r.id) return false;
                        const idLower = r.id.toLowerCase();
                        return !excludedKeywords.some(k => idLower.includes(k.replace(/ /g, '-')));
                    })
                    .map((r: any) => ({
                        id: r.id,
                        name: r.name || 'Untitled',
                        artist: r.artist || 'Unknown',
                        image: r.url || '', // Worker stores image URL in 'url' field
                        museumName: r.museum || '',
                        exhibitionId: r.id?.split('-')[0] || '',
                        sourceUrl: '',
                    }));

                setAiResults(results);

            } else if (data.error) {
                console.error('Search error:', data.error);
                setAiResults([]); // Fail silently or show error
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
    }, []);

    // Debounced search - artworks + museums
    useEffect(() => {
        const timer = setTimeout(() => {
            if (isAIMode) {
                performSemanticSearch(query);
            } else {
                if (workerRef.current) {
                    workerRef.current.postMessage({ type: 'SEARCH', query });
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
    }, [query, museums, isAIMode, performSemanticSearch]);



    // Click outside - collapse preview but keep query
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            // If lightbox is open, ignore outside clicks to prevent closing search results
            if (lightboxArtwork) return;

            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                // Always collapse preview, but keep query text
                setIsExpanded(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [lightboxArtwork]);

    useEffect(() => {
        if (isExpanded && inputRef.current) inputRef.current.focus();
    }, [isExpanded]);

    const handleSelectArtwork = useCallback((artwork: SearchableArtwork) => {
        // Show in-search lightbox first
        setLightboxArtwork(artwork);
        // Keep isExpanded true so results stay open behind lightbox
        // setIsExpanded(false); 
        // Don't clear query - keep it for back navigation
    }, []);

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
        setIsExpanded(false);
        // Don't close artist gallery - keep it for when user returns
        // setArtistGallery(null); // Removed: keep artist gallery for navigation continuity
        // Save artwork title to sessionStorage for ExhibitionModal to read
        try {
            sessionStorage.setItem('pendingMuseumSearchQuery', JSON.stringify({
                artworkTitle: artwork.name,
                artistName: artwork.artist,
                targetMuseumId: artwork.exhibitionId
            }));
        } catch (e) {
            console.error('Failed to save pendingMuseumSearchQuery', e);
        }

        // Find the museum
        // Check matching name OR matching ID (sometimes exhibitionId is the museum ID)
        // Also check if the exhibitionId exists as a sub-collection in any museum's permanentExhibitions
        let museum = museums.find(m => m.name === artwork.museumName || m.id === artwork.exhibitionId);
        console.log('[DEBUG] Initial museum find:', museum?.id);

        // Fallback: If museum not found, look deeper or Fuzzy match
        if (!museum) {
            // 1. Try finding by Name includes (e.g. "MAMCS Strasbourg" in "Musée d'Art Moderne et Contemporain de Strasbourg")
            // Or vice versa
            museum = museums.find(m =>
                (m.name && artwork.museumName && m.name.includes('Strasbourg') && artwork.museumName.includes('Strasbourg')) || // Specific fix for MAMCS
                (m.name && artwork.museumName && m.name.includes(artwork.museumName))
            );
            console.log('[DEBUG] Fuzzy museum find:', museum?.id);
        }

        // 2. Try finding by checking if the exhibitionId is a sub-collection
        if (!museum && artwork.exhibitionId) {
            museum = museums.find(m =>
                m.permanentExhibitions?.some((pe: any) => pe.id === artwork.exhibitionId)
            );
            console.log('[DEBUG] Deep museum find using ID:', artwork.exhibitionId, 'Result:', museum?.id);
        }

        if (museum && onNavigateToMuseum) {
            // Force push ArtistGallery to back because we are opening ExhibitionModal
            setGalleryZIndex(12500);

            // This ensures we open the exact collection (e.g. "mamcs-drawings") instead of the default one
            onNavigateToMuseum(museum, artwork.exhibitionId, artwork);
        } else {
            // Fallback: use onOpenLightbox if museum not found in the simplified list
            // HomePage's onOpenLightbox has deeper search logic (iterating through all permanentExhibitions)
            // Pass false to openLightbox so we just navigate, not open the image
            onOpenLightbox(artwork, false);
        }
    }, [onOpenLightbox, onNavigateToMuseum, museums]);

    const handleSelectArtist = useCallback((artist: string) => {
        if (workerRef.current) {
            workerRef.current.postMessage({ type: 'GET_ARTIST_WORKS', query: artist });
            setIsExpanded(false);
        }
    }, []);

    const handleSelectMuseum = useCallback((museum: Museum) => {
        setQuery('');
        setIsExpanded(false);
        setFilteredMuseums([]);
        onNavigateToMuseum?.(museum);
    }, [onNavigateToMuseum]);

    const closeArtistGallery = useCallback(() => {
        setArtistGallery(null);
        // Remove from sessionStorage when explicitly closed
        try {
            sessionStorage.removeItem('artistGallery');
        } catch (e) {
            console.error('Failed to remove artistGallery from sessionStorage', e);
        }
    }, []);
    const closeLightbox = useCallback(() => {
        setLightboxArtwork(null);
        // No need to setIsExpanded(true) because we never set it to false
    }, []);

    // Image error handler
    const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
        e.currentTarget.src = FALLBACK_IMG;
    };

    return (
        <>
            {/* Quick Lightbox for search result */}
            {lightboxArtwork && (
                <div
                    onClick={closeLightbox}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0, 0, 0, 0.95)',
                        zIndex: 15000,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                    onMouseDown={(e) => e.stopPropagation()}

                >
                    <style>{`@keyframes fadeInContent { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }`}</style>
                    {/* Close button */}
                    <button
                        onClick={closeLightbox}
                        style={{
                            position: 'absolute',
                            top: 20,
                            right: 20,
                            background: 'rgba(255,255,255,0.1)',
                            border: 'none',
                            borderRadius: '50%',
                            width: 44,
                            height: 44,
                            color: '#fff',
                            fontSize: 24,
                            cursor: 'pointer',
                        }}
                    >
                        ✕
                    </button>
                    {/* Image */}
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
                        }}
                    />
                    {/* Info */}
                    <div onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center', marginTop: 20, color: '#fff', maxWidth: '80vw' }}>
                        <div style={{ fontSize: 20, fontWeight: 600 }}>{lightboxArtwork.name}</div>
                        <div style={{ fontSize: 14, opacity: 0.8, marginTop: 8 }}>
                            {lightboxArtwork.artist}{lightboxArtwork.date ? ` • ${lightboxArtwork.date}` : ''}
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
            )}



            {/* Backdrop Overlay for Mobile Expanded Mode */}
            {isMobile && isExpanded && (
                <div
                    onClick={() => setIsExpanded(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 4999,
                        background: 'rgba(0,0,0,0.2)',
                        backdropFilter: 'blur(2px)',
                    }}
                />
            )}

            {/* Search Bar */}
            <div
                ref={containerRef}
                onClick={() => setIsExpanded(true)}
                onWheel={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'fixed',
                    // Ensure SearchBar is above ArtistGallery (12000/13500) and Modal (1000ish?), but below Lightbox (15000)
                    zIndex: (isModalOpen || !!artistGallery) && !lightboxArtwork ? 14000 : 5000,
                    transition: 'height 600ms cubic-bezier(0.65, 0, 0.35, 1), bottom 600ms cubic-bezier(0.65, 0, 0.35, 1), transform 600ms cubic-bezier(0.65, 0, 0.35, 1), width 600ms cubic-bezier(0.65, 0, 0.35, 1), border-radius 600ms cubic-bezier(0.65, 0, 0.35, 1)', // Smooth ease-in-out animation

                    // Mobile styles (Dynamic positioning: Top on Home, Bottom on Modal/Gallery)
                    ...(isMobile ? {
                        top: 60,
                        bottom: 'auto',
                        left: '50%',
                        // Transform calculation for smooth transition between Top and Bottom modes
                        transform: (() => {
                            const isBottomMode = isModalOpen || !!artistGallery;

                            // 1. Top Mode (Home)
                            if (!isBottomMode) {
                                return 'translateX(-50%) translateY(0)';
                            }

                            // 2. Bottom Mode (Modal/Gallery Open)
                            if (!isExpanded) {
                                // Collapsed at bottom
                                // Target Y from top: 100vh - 20px(margin) - 50px(height)
                                // Current Top: 60px
                                // Delta = 100vh - 70px - 60px = 100vh - 130px
                                return 'translateX(-50%) translateY(calc(100dvh - 130px))';
                            } else {
                                // Expanded at bottom (Grows Upwards)
                                // Target Y from top: 100vh - 20px(margin) - height
                                // Delta = 100vh - 80px - height
                                return `translateX(-50%) translateY(calc(100dvh - 80px - ${containerHeight}px))`;
                            }
                        })(),
                        width: isExpanded ? '94vw' : 'min(320px, 80vw)',
                        height: isExpanded ? `${containerHeight}px` : '50px',
                        borderRadius: isExpanded ? 20 : 30,
                        marginTop: 0,
                    } : {
                        // Desktop styles (Bottom anchored)
                        top: 'auto',
                        bottom: isExpanded ? 60 : 20,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: isExpanded ? 'min(600px, 94vw)' : 'min(320px, 80vw)',
                        borderRadius: isExpanded ? 16 : 30,
                        height: isExpanded ? `${containerHeight}px` : '50px',
                    }),
                    background: isExpanded ? 'rgba(255, 255, 255, 0.90)' : 'rgba(255, 255, 255, 0.75)',
                    backdropFilter: 'blur(12px)',
                    boxShadow: isExpanded ? '0 8px 32px rgba(0,0,0,0.2)' : '0 4px 16px rgba(0,0,0,0.1)',
                    cursor: isExpanded ? 'default' : 'pointer',
                    overflow: 'hidden',
                }}
            >
                {/* Input */}
                <div style={{ display: 'flex', alignItems: 'center', padding: isExpanded ? '12px 16px' : '10px 16px', gap: 10 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => {
                            setIsExpanded(true);
                        }}
                        placeholder={isLoading ? 'Loading...' : (isExpanded ? 'Search artworks, artists...' : 'Search artworks...')}
                        style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 16, outline: 'none', color: '#222' }}
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
                            background: isAIMode ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#f3f4f6',
                            border: 'none',
                            borderRadius: 12,
                            padding: '4px 10px',
                            fontSize: 11,
                            fontWeight: 600,
                            color: isAIMode ? '#fff' : '#666',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            transition: 'all 200ms ease',
                        }}
                        title={isAIMode ? 'Switch to text search' : 'Switch to AI semantic search'}
                    >
                        <span style={{ fontSize: 12 }}>✨</span>
                        AI
                    </button>
                    {!isExpanded && !isMobile && (
                        <span style={{ fontSize: 10, color: '#aaa', marginLeft: 4, whiteSpace: 'nowrap' }}>Press Tab</span>
                    )}
                    {isExpanded && !query && (
                        <button onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }} style={{ background: 'transparent', border: 'none', padding: 4, cursor: 'pointer', color: '#888', fontSize: 12 }}>▼</button>
                    )}
                </div>

                {/* Content Wrapper for smooth height measurement */}
                <div
                    ref={contentRef}
                    style={{
                        maxHeight: 'calc(80vh - 60px)',
                        overflowY: 'auto',
                        overscrollBehavior: 'contain',
                        WebkitOverflowScrolling: 'touch'
                    }}
                >
                    {/* Artist suggestions */}
                    {isExpanded && suggestedArtists.length > 0 && (
                        <div style={{ padding: '8px 16px', borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}>
                            <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Artists</div>
                            <div style={{ display: 'flex', overflowX: 'auto', gap: 6, paddingBottom: 4, scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
                                {suggestedArtists.map(({ artist, count }) => (
                                    <button
                                        key={artist}
                                        onClick={(e) => { e.stopPropagation(); handleSelectArtist(artist); }}
                                        style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '5px 12px', fontSize: 12, color: '#222', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, transition: 'all 150ms ease', whiteSpace: 'nowrap', flexShrink: 0 }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = '#111'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#111'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#222'; e.currentTarget.style.borderColor = '#e5e7eb'; }}
                                    >
                                        {artist} <span style={{ fontSize: 10, opacity: 0.6 }}>({count})</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Museum suggestions */}
                    {isExpanded && filteredMuseums.length > 0 && (
                        <div style={{ padding: '8px 16px', borderTop: '1px solid #e5e7eb', background: '#fefce8' }}>
                            <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Museums</div>
                            <div style={{ display: 'flex', overflowX: 'auto', gap: 6, paddingBottom: 4, scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
                                {filteredMuseums.map((museum) => (
                                    <button
                                        key={museum.id}
                                        onClick={(e) => { e.stopPropagation(); handleSelectMuseum(museum); }}
                                        style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: 16, padding: '5px 12px', fontSize: 12, color: '#92400e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 150ms ease', whiteSpace: 'nowrap', flexShrink: 0 }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = '#fbbf24'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#fbbf24'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#92400e'; e.currentTarget.style.borderColor = '#fde68a'; }}
                                    >
                                        🏛️ {museum.name} <span style={{ fontSize: 10, opacity: 0.7 }}>• {museum.country}</span>
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
                                            : `AI Semantic Search (${aiResults.length} results)`}
                                </span>
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
                                borderTop: '1px solid #e5e7eb',
                            }}
                        >
                            {filteredArtworks.map((art, idx) => (
                                <div
                                    key={`${art.id}-${idx}`}
                                    onClick={(e) => { e.stopPropagation(); handleSelectArtwork(art); }}
                                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', cursor: 'pointer', borderBottom: idx < filteredArtworks.length - 1 ? '1px solid #f3f4f6' : 'none', transition: 'background 150ms ease' }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <div style={{ width: 44, height: 44, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: '#f3f4f6' }}>
                                        <img src={getSearchThumbnail(art.image)} alt="" onError={handleImageError} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#222', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{art.name}</div>
                                        <div style={{ fontSize: 11, color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{art.artist}{art.date ? ` • ${art.date}` : ''}</div>
                                        <div style={{ fontSize: 10, color: '#999' }}>
                                            {art.museumName}
                                            {(() => {
                                                const m = museums.find(m => m.name === art.museumName);
                                                return m?.country ? ` • ${m.country}` : '';
                                            })()}
                                        </div>
                                    </div>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* No results */}
                    {isExpanded && query.length >= 2 && !isAIMode && filteredArtworks.length === 0 && suggestedArtists.length === 0 && !isLoading && (
                        <div style={{ padding: '16px', textAlign: 'center', color: '#888', fontSize: 13, borderTop: '1px solid #e5e7eb' }}>No results for "{query}"</div>
                    )}

                    {/* Hint */}
                    {isExpanded && query.length < 2 && !isLoading && (
                        <div style={{ padding: '12px 16px', textAlign: 'center', color: '#999', fontSize: 12, borderTop: '1px solid #e5e7eb' }}>
                            {isAIMode
                                ? '✨ AI Search: Try "impressionist landscape" or "portrait of woman"'
                                : (totalCount > 0 ? `🔍 Search ${totalCount.toLocaleString()} artworks from world museums` : 'Type at least 2 characters')}
                        </div>
                    )}
                </div>
            </div>



            {/* Artist Gallery Modal */}
            {artistGallery && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: galleryZIndex, // Dynamic Z-Index
                        background: isMobile ? `rgba(0,0,0,${Math.max(0, 0.6 - dragY / 500)})` : 'rgba(255,255,255,0.95)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        // PC: flex-start ensures content starts from top and is scrollable
                        alignItems: isMobile ? 'flex-end' : 'flex-start',
                        justifyContent: 'center',
                        padding: isMobile ? 0 : '80px 40px 40px 40px',
                        overflowY: isMobile ? 'hidden' : 'auto',
                        transition: 'background 0.3s',
                    }}
                    onClick={closeArtistGallery}
                    onWheel={(e) => e.stopPropagation()} // Stop propagation to Map
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={isMobile ? {
                            background: '#fff',
                            width: '100%',
                            height: '96dvh', // Expanded height
                            borderRadius: '20px 20px 0 0',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            boxShadow: '0 -10px 40px rgba(0,0,0,0.2)',
                            transform: `translateY(${dragY}px)`,
                            transition: isDragging.current ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
                        } : {
                            width: '100%',
                            maxWidth: 1200,
                            minHeight: '600px',
                            background: 'transparent',
                            display: 'flex',
                            flexDirection: 'column',
                            marginBottom: 40,
                            pointerEvents: 'auto',
                        }}
                    >
                        {/* Drag Handle & Header */}
                        <div
                            onTouchStart={isMobile ? handleDragStart : undefined}
                            onTouchMove={isMobile ? handleDragMove : undefined}
                            onTouchEnd={isMobile ? handleDragEnd : undefined}
                            style={{ flexShrink: 0, background: isMobile ? '#fff' : 'transparent', cursor: isMobile ? 'grab' : 'auto' }}
                        >
                            {isMobile && (
                                <div style={{ width: '100%', height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e5e7eb' }} />
                                </div>
                            )}

                            <div style={{
                                padding: isMobile ? '0 24px 16px 24px' : '0 0 30px 0',
                                borderBottom: isMobile ? '1px solid #f0f0f0' : 'none',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: isMobile ? 'center' : 'flex-end',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <h2 style={{ fontSize: isMobile ? 18 : 32, fontWeight: 700, margin: 0, color: '#111' }}>{artistGallery.artist}</h2>
                                            {/* Artist Like Button */}
                                            {currentUser && (
                                                <div
                                                    onClick={(e) => toggleLikeArtist(e)}
                                                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                                >
                                                    <svg width={isMobile ? 20 : 24} height={isMobile ? 20 : 24} viewBox="0 0 24 24"
                                                        fill={likedArtists.has(artistGallery.artist.replace(/\//g, '_')) ? "#e11d48" : "none"}
                                                        stroke={likedArtists.has(artistGallery.artist.replace(/\//g, '_')) ? "#e11d48" : "#ccc"}
                                                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                                    </svg>
                                                </div>
                                            )}
                                        </div>
                                        <p style={{ fontSize: isMobile ? 13 : 15, color: '#666', marginTop: isMobile ? 0 : 8, margin: 0 }}>{artistGallery.artworks.length.toLocaleString()} artworks</p>
                                    </div>
                                </div>
                                <button onClick={closeArtistGallery} style={{
                                    width: isMobile ? 32 : 44, height: isMobile ? 32 : 44,
                                    borderRadius: '50%', border: 'none',
                                    background: isMobile ? '#f5f5f5' : 'rgba(0,0,0,0.05)',
                                    fontSize: isMobile ? 16 : 24,
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'background 0.2s'
                                }}>✕</button>
                            </div>
                        </div>

                        {/* Grid - Masonry Layout */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '12px' : '10px 0 40px 0' }}>
                            <div style={{
                                columnCount: isMobile ? 2 : 4,
                                columnGap: isMobile ? 12 : 24,
                            }}>
                                {artistGallery.artworks.map((art, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => handleSelectArtwork(art)}
                                        style={{
                                            breakInside: 'avoid',
                                            marginBottom: isMobile ? 12 : 24,
                                            cursor: 'pointer',
                                            position: 'relative'
                                        }}
                                        className="group"
                                    >
                                        <div style={{
                                            borderRadius: 8,
                                            overflow: 'hidden',
                                            background: '#f0f0f0',
                                            position: 'relative'
                                        }}>
                                            <img
                                                src={getOptimizedImageUrl(art.image, 600)}
                                                style={{ width: '100%', height: 'auto', display: 'block', transition: 'transform 0.5s' }}
                                                loading="lazy"
                                                alt={art.name}
                                                referrerPolicy="no-referrer"
                                                onError={handleImageError}
                                            />
                                            {/* Heart Overlay for Artwork */}
                                            {currentUser && (
                                                <div style={{ position: 'absolute', bottom: 8, right: 8 }}>
                                                    <HeartOverlay
                                                        isLiked={likedArtworks.has(art.id)}
                                                        onToggle={(e) => toggleLikeArtwork(e, art)}
                                                        size={isMobile ? 18 : 20}
                                                        color="#e11d48"
                                                        emptyColor="#fff"
                                                        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ marginTop: 8 }}>
                                            <div style={{ fontWeight: 600, fontSize: isMobile ? 12 : 14, color: '#111', lineHeight: 1.3 }}>
                                                {art.name}
                                            </div>
                                            <div style={{ fontSize: isMobile ? 10 : 12, color: '#666', marginTop: 2 }}>
                                                {art.date}
                                            </div>
                                            <div style={{ fontSize: isMobile ? 10 : 12, color: '#888', marginTop: 1 }}>
                                                {art.museumName}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
