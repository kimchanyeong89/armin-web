import { useState, useEffect, useRef, useCallback } from 'react';
import { getTextEmbedding, isModelLoading } from '../utils/clipEmbedding';
import { getCachedImageUrl } from '../utils/imageProxy';



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
};

export type Museum = {
    id: string;
    name: string;
    country: string;
    region?: string;
    latitude: number;
    longitude: number;
    representativeImage?: string;
};

type GlobalSearchBarProps = {
    onOpenLightbox: (artwork: SearchableArtwork) => void;
    onNavigateToMuseum?: (museum: Museum) => void;
    museums?: Museum[];
    isModalOpen?: boolean;
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
                return { artist: data.artist, artworks: data.artworks || [] };
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
            if (type === 'LOAD_COMPLETE') {
                setTotalCount(count);
                setIsLoading(false);
                // Retrigger search if new data loaded while typing
                if (queryRef.current && queryRef.current.length >= 2) {
                    workerRef.current?.postMessage({ type: 'SEARCH', query: queryRef.current });
                }
            } else if (type === 'RESULTS') {
                setFilteredArtworks(results);
                setSuggestedArtists(artists);
            } else if (type === 'ARTIST_WORKS') {
                if (artist) {
                    const gallery = { artist, artworks: works };
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

        try {
            // 모델이 로딩 중이면 로딩 상태 표시
            if (isModelLoading()) {
                setIsClipLoading(true);
            }

            // 브라우저에서 CLIP 텍스트 임베딩 생성 (무료!)
            const embedding = await getTextEmbedding(searchQuery);
            setIsClipLoading(false);

            if (!embedding) {
                console.error('Failed to generate text embedding');
                setAiResults([]);
                return;
            }

            // Worker의 /search-by-vector 엔드포인트로 검색
            const response = await fetch('https://armin-semantic-search.armin-art.workers.dev/search-by-vector', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vector: embedding, limit: 30 }),
            });

            const data = await response.json();

            if (data.results) {
                const artworks: SearchableArtwork[] = data.results.map((r: any) => ({
                    id: r.id,
                    name: r.name || 'Untitled',
                    artist: r.artist || 'Unknown',
                    image: r.url,
                    museumName: r.museum || '',
                    exhibitionId: '',
                }));
                setAiResults(artworks);
            } else if (data.error) {
                console.error('Search error:', data.error);
                setAiResults([]);
            }
        } catch (error) {
            console.error('Semantic search error:', error);
            setAiResults([]);
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
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                // Always collapse preview, but keep query text
                setIsExpanded(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isExpanded && inputRef.current) inputRef.current.focus();
    }, [isExpanded]);

    const handleSelectArtwork = useCallback((artwork: SearchableArtwork) => {
        // Show in-search lightbox first
        setLightboxArtwork(artwork);
        setIsExpanded(false);
        // Don't clear query - keep it for back navigation
    }, []);

    const handleOpenInMuseum = useCallback((artwork: SearchableArtwork) => {
        setLightboxArtwork(null);
        // Don't close artist gallery - keep it for when user returns
        // setArtistGallery(null); // Removed: keep artist gallery for navigation continuity
        // Don't clear query - keep it for navigation continuity
        // setQuery(''); // Removed: keep search text for navigation continuity
        
        // Save artwork title to sessionStorage for ExhibitionModal to read
        try {
            sessionStorage.setItem('pendingMuseumSearchQuery', JSON.stringify({
                artworkTitle: artwork.name,
                artistName: artwork.artist,
            }));
        } catch (e) {
            console.error('Failed to save search query to sessionStorage', e);
        }
        
        // Find the museum and navigate to it instead of opening lightbox
        const museum = museums.find(m => m.id === artwork.exhibitionId || m.name === artwork.museumName);
        if (museum && onNavigateToMuseum) {
            onNavigateToMuseum(museum);
        } else {
            // Fallback: use onOpenLightbox if museum not found
            onOpenLightbox(artwork);
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
    const closeLightbox = useCallback(() => setLightboxArtwork(null), []);

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
                        src={getCachedImageUrl(lightboxArtwork.image)}
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
                        <button
                            onClick={() => handleOpenInMuseum(lightboxArtwork)}
                            style={{
                                marginTop: 16,
                                padding: '10px 20px',
                                background: 'transparent',
                                border: '1px solid rgba(255,255,255,0.5)',
                                borderRadius: 20,
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: 13,
                                transition: 'all 150ms ease',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#000'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#fff'; }}
                        >
                            View in Museum →
                        </button>
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
                    zIndex: isModalOpen && !lightboxArtwork ? 14000 : 5000,
                    transition: 'all 300ms ease',

                    // Mobile Expanded: Full Screen
                    ...(isMobile && isExpanded ? {
                        top: 60, // 헤더 아래에 위치
                        bottom: 'auto',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: '94vw',
                        height: 'auto',
                        borderRadius: 20,
                        maxHeight: 'calc(100vh - 80px)', // 헤더 높이를 고려한 max-height
                    } : {
                        // Floating Pill
                        top: 'auto',
                        bottom: isExpanded ? 60 : 20,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: isExpanded ? 'min(600px, 94vw)' : 'min(320px, 80vw)',
                        borderRadius: isExpanded ? 16 : 30,
                        maxHeight: isExpanded ? '80vh' : 'auto',
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
                            if (window.innerWidth < 768) {
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                setTimeout(() => window.scrollTo(0, 0), 300);
                            }
                        }}
                        placeholder={isLoading ? 'Loading...' : (isExpanded ? 'Search artworks, artists...' : 'Search artworks...')}
                        style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 16, outline: 'none', color: '#222' }}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (window.innerWidth < 768) {
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            }
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
                            flex: 1,
                            overflowY: 'auto',
                            minHeight: 0,
                            borderTop: '1px solid #e5e7eb',
                            overscrollBehavior: 'contain',
                            WebkitOverflowScrolling: 'touch',
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
                                    <img src={getCachedImageUrl(art.image)} alt="" onError={handleImageError} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
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
                            flex: 1,
                            overflowY: 'auto',
                            minHeight: 0,
                            borderTop: '1px solid #e5e7eb',
                            overscrollBehavior: 'contain',
                            WebkitOverflowScrolling: 'touch',
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
                                    <img src={getCachedImageUrl(art.image)} alt="" onError={handleImageError} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
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

            {/* Lightbox QuickView */}
            {lightboxArtwork && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 12000, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }} onClick={closeLightbox}>
                    <img src={getCachedImageUrl(lightboxArtwork.image)} style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 30, background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                        <div style={{ color: '#fff', fontWeight: 600 }}>{lightboxArtwork.name}</div>
                        <button onClick={(e) => { e.stopPropagation(); handleOpenInMuseum(lightboxArtwork); }} style={{ padding: '10px 24px', borderRadius: 30, background: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>View Details</button>
                    </div>
                    <button onClick={closeLightbox} style={{ position: 'absolute', top: 20, right: 20, width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>✕</button>
                </div>
            )}

            {/* Artist Gallery Modal */}
            {artistGallery && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: isModalOpen ? 13500 : 12000,
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
                                <div>
                                    <h2 style={{ fontSize: isMobile ? 18 : 32, fontWeight: 700, margin: 0, color: '#111' }}>{artistGallery.artist}</h2>
                                    <p style={{ fontSize: isMobile ? 13 : 15, color: '#666', marginTop: isMobile ? 0 : 8, margin: 0 }}>{artistGallery.artworks.length.toLocaleString()} artworks</p>
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

                        {/* Grid */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '2px' : '10px 2px 40px 2px' }}>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(auto-fill, minmax(200px, 1fr))',
                                gap: isMobile ? 2 : 24,
                            }}>
                                {artistGallery.artworks.map((art, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => handleSelectArtwork(art)}
                                        style={isMobile ? {
                                            aspectRatio: '1', position: 'relative', cursor: 'pointer', background: '#f5f5f5'
                                        } : {
                                            cursor: 'pointer', background: 'transparent', borderRadius: 8, overflow: 'hidden'
                                        }}
                                        className={!isMobile ? "desktop-card" : ""}
                                    >
                                        <div style={{
                                            aspectRatio: '1',
                                            borderRadius: isMobile ? 0 : 8,
                                            overflow: 'hidden',
                                            background: '#f0f0f0',
                                            boxShadow: isMobile ? 'none' : '0 2px 8px rgba(0,0,0,0.1)'
                                        }}>
                                            <img src={art.image} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.5s' }} loading="lazy" />
                                        </div>
                                        {!isMobile && (
                                            <div style={{ marginTop: 10 }}>
                                                <div style={{ fontWeight: 600, fontSize: 14, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{art.name}</div>
                                                <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{art.museumName}</div>
                                            </div>
                                        )}
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
