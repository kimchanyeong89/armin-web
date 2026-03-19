import React, { useState, useEffect } from 'react';
import { findMuseumForArtwork } from '../utils/museumUtils';
import { HeartOverlay } from './HeartOverlay';
import { ArtworkRecommendations } from './ArtworkRecommendations';
// import { buildSourceSet, useProxy } from '../utils/imageProxy'; // Unused
import { exhibitions } from '../data/exhibitions';


// Helper: Clean Artist Name (copied from ExhibitionModal to ensure consistency)
const cleanArtistName = (artist: string | undefined | null): string => {
    if (!artist) return '';
    const lower = artist.toLowerCase();
    if (
        artist.includes('©') ||
        lower.includes('all rights reserved') ||
        lower.includes('adagp') ||
        lower.includes('sabam') ||
        lower.includes('vegap') ||
        lower.includes('dacs') ||
        lower.includes('siae') ||
        lower.includes('vg bild-kunst') ||
        lower === 'droits réservés' ||
        lower === 'tous droits réservés' ||
        lower === 'copyright'
    ) {
        return '';
    }
    return artist.replace(/\s*\([^)]*\d{4}[^)]*\)\s*/g, '').trim();
};

const ensureHttps = (url: string | undefined | null): string => {
    if (!url) return '';
    if (url.startsWith('http://')) {
        return url.replace('http://', 'https://');
    }
    return url;
};

// Helper to pick largest variant
const getLargestVariantUrl = (a: any): { url: string; width: number } | null => {
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
};

const getBestFullUrl = (a: any): { url: string; width?: number } => {
    // Prefer an explicit lightbox-only override if present
    if (a.lightboxImage) {
        return { url: ensureHttps(a.lightboxImage), width: undefined };
    }
    // If the base image is already in our fast R2 bucket, prioritize it for speed
    if (a.image && typeof a.image === 'string' && (a.image.includes('.r2.dev') || a.image.includes('.r2.cloudflarestorage.com'))) {
        return { url: ensureHttps(a.image), width: undefined };
    }
    // Use originalImage if available
    if (a.originalImage) {
        return { url: ensureHttps(a.originalImage), width: undefined };
    }
    const v = getLargestVariantUrl(a);
    if (v) return { url: ensureHttps(v.url), width: v.width };

    // Fallback to base image
    return { url: ensureHttps(a.image), width: undefined };
};

interface ArtworkLightboxProps {
    artwork: any; // Using any for flexibility with various Artwork types in the app
    onClose: () => void;
    isLiked: boolean;
    onToggleLike: (e: React.MouseEvent, artwork: any) => void;
    // If provided, shows "View in Museum" button
    onViewInMuseum?: (artwork: any) => void;
    // On Purchase (POD)
    onPurchase?: (artwork: any) => void;
    // Liked list for recommendations logic
    likedArtworksList?: any[];
    // For navigation within lightbox
    onChangeArtwork?: (artwork: any) => void;
    // Add to playlist
    onSaveToPlaylist?: (artwork: any) => void;
}

// Module-level cache to prevent re-fetching across lightbox opens
const collectionCache: Record<string, any[]> = {};
const fetchingPromises: Record<string, Promise<any>> = {};

export const ArtworkLightbox: React.FC<ArtworkLightboxProps> = ({
    artwork,
    onClose,
    isLiked,
    onToggleLike,
    onViewInMuseum,
    onPurchase,
    likedArtworksList = [],
    onChangeArtwork,
    onSaveToPlaylist,
    // ...
}) => {
    const [animate, setAnimate] = useState(false);
    const [imgLoaded, setImgLoaded] = useState(false);

    // Reset animation + image-loaded state when artwork changes
    useEffect(() => {
        setAnimate(false);
        setImgLoaded(false);
        const tm = setTimeout(() => setAnimate(true), 50);
        return () => clearTimeout(tm);
    }, [artwork]);

    // Resolve Museum Info for display
    const museumInfo = React.useMemo(() => {
        const found = findMuseumForArtwork(artwork, exhibitions);
        if (found) {
            // Check if it belongs to a specific permanent exhibition (collection)
            const artExhId = artwork.exhibitionId;
            let collectionName = '';
            if (artExhId && found.permanentExhibitions) {
                const pExh = found.permanentExhibitions.find((pe: any) => pe.id === artExhId);
                if (pExh) collectionName = pExh.name || pExh.title;
            }
            // fallback: check if we can infer collection from ID prefix if not explicit
            if (!collectionName && found.permanentExhibitions && found.permanentExhibitions.length === 1) {
                // specific logic for single-collection museums
                // collectionName = found.permanentExhibitions[0].title; 
            }

            return {
                name: found.name,
                country: found.country,
                collection: collectionName
            };
        }
        // Fallback to what's in the artwork object
        const mName = artwork.museumName || artwork.museum || artwork.source; // Use source as fallback name
        // Try to guess country from museum name if possible (using strict map or just leave blank)
        return {
            name: mName,
            country: artwork.country, // might be undefined
            collection: ''
        };
    }, [artwork]);

    // Image Source Handler
    const bestFull = getBestFullUrl(artwork);
    const [imageSrc, setImageSrc] = useState(bestFull.url);

    useEffect(() => {
        setImageSrc(bestFull.url);
    }, [bestFull.url]);

    // Determine standard source URL
    const sourceUrl = artwork.sourceUrl || artwork.url || artwork.link || artwork.href || artwork.webUrl || artwork.originalLink || artwork.objectUrl || artwork.source;



    // State for asynchronous global recommendations
    const [globalRelated, setGlobalRelated] = useState<any[]>([]);

    // Reset global items when artwork changes
    useEffect(() => {
        setGlobalRelated([]);
    }, [artwork]);

    // Progressive Global Search Effect
    useEffect(() => {
        let isMounted = true;
        const normalize = (s: string) => {
            if (!s) return '';
            return s.toLowerCase()
                .replace(/[.,]/g, ' ')
                .split(/\s+/)
                .filter(t => t.length > 0)
                .sort()
                .join(' ');
        };

        const targetArtist = normalize(artwork.artist || artwork.a);
        const targetId = artwork.id || artwork.artworkId;

        if (!targetArtist) return;

        // 1. Identify all potential collection files
        const collectionSources: { url: string; museumName: string; country?: string }[] = [];

        // Helper to extract collection files from exhibition objects
        const extractCollections = (exhList: any[], parentMuseum: any) => {
            exhList?.forEach(ex => {
                if (ex.collectionFile) {
                    collectionSources.push({
                        url: `/data/${ex.collectionFile}`,
                        museumName: ex.museumName || parentMuseum.name || '',
                        country: parentMuseum.country || '' // Capture country from parent
                    });
                }
            });
        };

        exhibitions.forEach((mus: any) => {
            extractCollections(mus.permanentExhibitions, mus);
            extractCollections(mus.temporaryExhibitions, mus);
            extractCollections(mus.pastExhibitions, mus);
            // Also check if the museum object itself has a collectionFile logic (though usually in sub-items)
        });

        const fetchAndSearch = async () => {
            // Process sequentially or in small batches to avoid network congestion
            for (const source of collectionSources) {
                if (!isMounted) break;

                try {
                    let items = collectionCache[source.url];

                    if (!items) {
                        // Check if already fetching
                        if (!fetchingPromises[source.url]) {
                            fetchingPromises[source.url] = fetch(source.url)
                                .then(res => {
                                    if (!res.ok) throw new Error('Failed to fetch');
                                    return res.json();
                                })
                                .then(data => {
                                    // Handle list or object with 'artworks'
                                    let list = Array.isArray(data) ? data : (data.artworks || []);
                                    // Clean/Normalize basic fields for search
                                    return list;
                                })
                                .catch(err => {
                                    // Suppress specific expected errors for now to clean up console
                                    if (!err.message?.includes('Unexpected token') && !err.message?.includes('JSON')) {
                                        console.warn(`Failed to load collection ${source.url}`, err);
                                    }
                                    return [];
                                });
                        }
                        items = await fetchingPromises[source.url];
                        collectionCache[source.url] = items;
                    }

                    if (!isMounted) break;

                    // Search this collection
                    const matches: any[] = [];
                    for (const item of items) {
                        const itemArtist = normalize(item.artist || item.a);
                        const itemId = item.id || item.artworkId;

                        if (itemArtist === targetArtist && itemId !== targetId) {
                            // Assign museum name/country if missing
                            const enriched = { ...item };
                            if (!enriched.museumName && !enriched.museum && source.museumName) {
                                enriched.museumName = source.museumName;
                            }
                            // Inject country if missing (source.country is generic 'any' on source object, we need to type it or just access)
                            if (!enriched.country && (source as any).country) {
                                enriched.country = (source as any).country;
                            }
                            matches.push(enriched);
                        }
                    }

                    if (matches.length > 0) {
                        setGlobalRelated(prev => {
                            // Dedup against existing
                            const combined = [...prev, ...matches];
                            const seen = new Set();
                            const unique = combined.filter(i => {
                                const id = i.id || i.artworkId;
                                if (seen.has(id)) return false;
                                seen.add(id);
                                return true;
                            });
                            return unique;
                        });
                    }

                } catch (e) {
                    // Ignore individual failures
                }
            }
        };

        // Delay slightly to prioritize UI render
        const timer = setTimeout(() => {
            fetchAndSearch();
        }, 100);

        return () => {
            isMounted = false;
            clearTimeout(timer);
        };

    }, [artwork]); // Re-run when artwork changes

    // Combined Recommendation Logic (Global + Liked + Async Fetched)
    const relatedArtworks = React.useMemo(() => {
        // ... (Old normalization logic here, can reuse or keeping standard)
        // Let's refactor to use the same normalize logic to be safe or just standard

        // Token-based normalization (same as Effect)
        const normalize = (s: string) => {
            if (!s) return '';
            return s.toLowerCase()
                .replace(/[.,]/g, ' ')
                .split(/\s+/)
                .filter(t => t.length > 0)
                .sort()
                .join(' ');
        };

        const targetArtist = normalize(artwork.artist || artwork.a);
        const targetId = artwork.id || artwork.artworkId;

        if (!targetArtist) return [];

        const results: any[] = [];
        const seenIds = new Set<string>();

        // Helper
        const isMatch = (item: any) => {
            const itemArtist = normalize(item.artist || item.a);
            const itemId = item.id || item.artworkId;
            return itemArtist === targetArtist && itemId !== targetId;
        };

        // 1. Search in Liked Artworks
        for (const item of likedArtworksList) {
            if (isMatch(item) && !seenIds.has(item.id || item.artworkId)) {
                results.push(item);
                seenIds.add(item.id || item.artworkId);
            }
        }

        // 2. Search in Async Global Results (New!)
        for (const item of globalRelated) {
            const id = item.id || item.artworkId;
            if (!seenIds.has(id)) { // Already matched artist in effect, but check ID dedup
                results.push(item);
                seenIds.add(id);
            }
        }

        // 3. Search inline exhibitions (Static backup)
        // (This might be redundant if we fetch everything, but good for immediate display before fetch)
        for (const museum of exhibitions) {
            if (results.length >= 50) break; // Cap higher during gathering

            // ... (Same gathering logic)
            const candidates: any[] = [];
            if ((museum as any).rooms) {
                Object.values((museum as any).rooms).forEach((roomArtworks: any) => {
                    if (Array.isArray(roomArtworks)) candidates.push(...roomArtworks);
                });
            }
            const collections = [
                ...((museum as any).permanentExhibitions || []),
                ...((museum as any).temporaryExhibitions || []),
                ...((museum as any).pastExhibitions || [])
            ];
            collections.forEach((exh: any) => {
                if (exh.artworks && Array.isArray(exh.artworks)) {
                    candidates.push(...exh.artworks);
                }
            });
            if ((museum as any).artworks && Array.isArray((museum as any).artworks)) {
                candidates.push(...(museum as any).artworks);
            }

            for (const item of candidates) {
                if (isMatch(item)) {
                    const itemId = item.id || item.artworkId;
                    if (!seenIds.has(itemId)) {
                        results.push({ ...item, museumName: museum.name });
                        seenIds.add(itemId);
                    }
                }
            }
        }

        return results.slice(0, 20); // Return top 20 matches
    }, [artwork, likedArtworksList, globalRelated]);

    // Create Set for liked artworks checking
    const likedSet = React.useMemo(() => new Set(likedArtworksList.map((a: any) => a.id || a.artworkId)), [likedArtworksList]);

    // Image helpers
    const isMobile = window.innerWidth < 768;
    // widths/avif/webp/sizes removed as we are using direct img src now

    const dateDisplay = (() => {
        const yr = String(artwork.year || artwork.dateStr || artwork.date || '');
        return yr.replace(/^\((-?\d+)\)$/, '$1'); // clean cleanup
    })();

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 14000,
                    cursor: 'zoom-out',
                    background: animate ? 'rgba(0, 0, 0, 0.92)' : 'rgba(0, 0, 0, 0)',
                    backdropFilter: 'blur(10px)',
                    transition: 'background 300ms ease',
                }}
            />

            {/* Scroll Container */}
            <div
                className="zoom-scroll-container"
                onClick={onClose} // Simply close on click, relying on stopPropagation below
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 14001,
                    pointerEvents: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    // justifyContent: 'center', // Removed to prevent top clipping on overflow
                    overflowY: 'auto',
                    WebkitOverflowScrolling: 'touch',
                    paddingTop: '5vh',
                    paddingBottom: '5vh'
                }}
            >
                {/* Content Wrapper for proper centering + scrolling */}
                <div style={{ margin: 'auto', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {/* Main Image Area */}
                    <div
                        style={{
                            position: 'relative',
                            maxWidth: '100vw',
                            width: '100%',
                            pointerEvents: 'auto',
                            cursor: 'default',
                            opacity: animate ? 1 : 0,
                            transform: animate ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(-10px)',
                            transition: 'opacity 300ms ease, transform 300ms ease',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flex: '1 0 auto',
                            marginBottom: 32,
                        }}
                    >
                        <div
                            onClick={(e) => e.stopPropagation()} // Stop propagation to prevent closing
                            style={{ position: 'relative', display: 'inline-block', cursor: 'default' }}
                        >
                            {/* Drawing-concept skeleton while image loads */}
                            {imageSrc && !imgLoaded && (
                                <div style={{
                                    width: isMobile ? '80vw' : '60vw',
                                    height: isMobile ? '50vw' : '40vw',
                                    maxWidth: 640, maxHeight: 480,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: '#111',
                                }}>
                                    <svg width={80} height={80} viewBox="0 0 140 140" style={{ opacity: 0.45 }}>
                                        <style>{`
                                          @keyframes _lb_globe{0%{stroke-dashoffset:377;opacity:.2}60%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:.2}}
                                          @keyframes _lb_dot{0%,100%{r:2.5;opacity:.3}50%{r:5;opacity:1}}
                                        `}</style>
                                        <circle cx={70} cy={70} r={60} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1"
                                            strokeDasharray="377 377"
                                            style={{ animation: '_lb_globe 2s ease-in-out infinite', transformOrigin: '70px 70px' }} />
                                        <ellipse cx={70} cy={70} rx={60} ry={17} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" strokeDasharray="4 5" />
                                        <line x1={70} y1={10} x2={70} y2={130} stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" strokeDasharray="4 5" />
                                        <circle cx={70} cy={70} r={4} fill="#CCFF00"
                                            style={{ animation: '_lb_dot 1.8s ease-in-out infinite' }} />
                                    </svg>
                                </div>
                            )}
                            {imageSrc && (
                                <img
                                    key={imageSrc}
                                    src={imageSrc}
                                    alt={artwork.name}
                                    style={{
                                        maxWidth: isMobile ? '95vw' : '85vw',
                                        maxHeight: 'min(75vh, 1000px)',
                                        width: 'auto',
                                        height: 'auto',
                                        objectFit: 'contain',
                                        display: 'block',
                                        borderRadius: 4,
                                        boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
                                        opacity: imgLoaded ? 1 : 0,
                                        transition: 'opacity 0.4s ease',
                                        position: imgLoaded ? 'relative' : 'absolute',
                                        top: imgLoaded ? 'auto' : 0, left: imgLoaded ? 'auto' : 0,
                                    }}
                                    draggable={false}
                                    referrerPolicy="no-referrer"
                                    onLoad={() => setImgLoaded(true)}
                                    onError={() => {
                                        const fallback = artwork.originalImage || artwork.image;
                                        if (fallback && imageSrc !== fallback) {
                                            setImageSrc(fallback);
                                        }
                                        setImgLoaded(true);
                                    }}
                                />
                            )}

                            <div style={{
                                position: 'absolute',
                                bottom: isMobile ? 12 : 16,
                                right: isMobile ? 12 : 16,
                                display: 'flex',
                                gap: 12,
                                zIndex: 100
                            }}>


                                {/* Playlist Button */}
                                {onSaveToPlaylist && (
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onSaveToPlaylist(artwork);
                                        }}
                                        style={{
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            transition: 'transform 0.1s',
                                            zIndex: 20
                                        }}
                                        title="Save to Playlist"
                                        onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.9)'}
                                        onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                    >
                                        <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.3))' }}>
                                            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" /><line x1="12" x2="12" y1="7" y2="13" /><line x1="15" x2="9" y1="10" y2="10" />
                                        </svg>
                                    </div>
                                )}

                                {/* Product Button */}
                                {onPurchase && (
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onPurchase(artwork);
                                        }}
                                        style={{
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            transition: 'transform 0.1s',
                                            zIndex: 20
                                        }}
                                        title="Purchase Product"
                                        onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.9)'}
                                        onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                    >
                                        <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.3))' }}>
                                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                            <rect x="7" y="7" width="10" height="10" />
                                        </svg>
                                    </div>
                                )}


                                {/* Like Button */}

                                <HeartOverlay
                                    isLiked={isLiked}
                                    onToggle={(e) => onToggleLike(e, artwork)}
                                    style={{ padding: 0, background: 'none' }}
                                    size={24}
                                    color="#e11d48"
                                    emptyColor="#fff"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Metadata & Actions */}
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            marginTop: 24,
                            padding: '0 20px',
                            color: '#fff',
                            textAlign: 'center',
                            maxWidth: '90vw',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 8
                        }}
                    >
                        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                            {artwork.name || artwork.title}
                        </div>
                        {dateDisplay && (
                            <div style={{ fontSize: 15, opacity: 0.7 }}>
                                {dateDisplay}
                            </div>
                        )}
                        <div style={{ fontSize: 16, color: '#e5e5e5', marginTop: 4 }}>
                            {cleanArtistName(artwork.artist)}
                        </div>
                        <div style={{ fontSize: 13, color: '#aaa', marginTop: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            {museumInfo.name && (
                                <span>
                                    {museumInfo.name}
                                    {museumInfo.country ? ` · ${museumInfo.country}` : ''}
                                </span>
                            )}
                            {museumInfo.collection && (
                                <span style={{ opacity: 0.8, fontStyle: 'italic' }}>
                                    {museumInfo.collection}
                                </span>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
                            {onViewInMuseum && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onViewInMuseum(artwork);
                                    }}
                                    style={{
                                        padding: '10px 24px',
                                        background: '#fff',
                                        border: 'none',
                                        borderRadius: 30,
                                        color: '#000',
                                        cursor: 'pointer',
                                        fontSize: 14,
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                                    }}
                                >
                                    <span>🏛</span> View in Museum
                                </button>
                            )}

                            {onPurchase && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onPurchase(artwork);
                                    }}
                                    style={{
                                        padding: '10px 24px',
                                        background: '#fff',
                                        border: 'none',
                                        borderRadius: 30,
                                        color: '#000',
                                        cursor: 'pointer',
                                        fontSize: 14,
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                                    }}
                                >
                                    <svg
                                        width={18}
                                        height={18}
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                        <rect x="7" y="7" width="10" height="10" />
                                    </svg>
                                    구매하기
                                </button>
                            )}

                            {sourceUrl && (
                                <a
                                    href={sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    style={{
                                        padding: '10px 24px',
                                        background: 'transparent',
                                        border: '1px solid rgba(255,255,255,0.4)',
                                        borderRadius: 30,
                                        color: '#fff',
                                        textDecoration: 'none',
                                        fontSize: 14,
                                        fontWeight: 500,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        transition: 'background 0.2s, border-color 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                                        e.currentTarget.style.borderColor = '#fff';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)';
                                    }}
                                >
                                    <span>🔗</span> Original Source
                                </a>
                            )}
                        </div>
                    </div>

                    {/* Recommendations */}
                    <div
                        style={{
                            width: '100%',
                            marginTop: 64,
                            padding: '0 24px',
                            maxWidth: 1400,
                            opacity: animate ? 1 : 0,
                            transition: 'opacity 500ms ease 100ms'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                            You might also like
                        </div>

                        <ArtworkRecommendations
                            artwork={artwork}
                            relatedArtworks={relatedArtworks}
                            onSelectArtwork={(art) => {
                                if (onChangeArtwork) {
                                    onChangeArtwork(art);
                                    const container = document.querySelector('.zoom-scroll-container');
                                    if (container) container.scrollTop = 0;
                                }
                            }}
                            mode="grid"
                            theme="dark"
                            likedArtworks={likedSet}
                            onToggleLike={onToggleLike}
                            onOpenProduct={onPurchase}
                        />
                    </div>
                </div>

                {/* Mobile Close Button (Fixed Top Right) */}
                {
                    isMobile && (
                        <button
                            onClick={onClose}
                            style={{
                                position: 'fixed',
                                top: 16,
                                right: 16,
                                width: 40,
                                height: 40,
                                borderRadius: '50%',
                                background: 'rgba(0,0,0,0.5)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                color: '#fff',
                                fontSize: 24,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 15000,
                                backdropFilter: 'blur(4px)'
                            }}
                        >
                            ×
                        </button>
                    )
                }
            </div >
        </>
    );
};
