import React, { useState, useEffect, useMemo } from 'react';
import type { Artwork } from '../types/Artwork';
import { getWeservUrl } from '../utils/imageProxy';
import { exhibitions } from '../data/exhibitions';
import { HeartOverlay } from './HeartOverlay';
import { BookmarkPlus, MessageCircle, ShoppingBag } from 'lucide-react';

const WORKER_URL = 'https://armin-semantic-search.armin-art.workers.dev';
const RECOMMENDATION_BACKOFF_MS = 30_000;
const recommendationCache = new Map<string, any[]>();
// Backoff only applies to text search (which calls HuggingFace). ID-based lookups never need to back off.
let textSearchBackoffUntil = 0;
const SHOW_ARTWORK_COMMENTS = false;

// Map museum names to countries for quick lookup
const getMuseumCountryMap = () => {
    const map: Record<string, string> = {};
    exhibitions.forEach((exh: any) => {
        if (exh.name && exh.country) {
            map[exh.name.toLowerCase()] = exh.country;
        }
    });
    return map;
};

interface Props {
    artwork: Artwork;
    relatedArtworks?: Artwork[];
    onSelectArtwork: (artwork: Artwork) => void;
    style?: React.CSSProperties;
    mode?: 'horizontal' | 'grid' | 'compact-horizontal';
    theme?: 'light' | 'dark';
    likedArtworks?: Set<string>;
    onToggleLike?: (e: React.MouseEvent, artwork: Artwork) => void;
    onOpenProduct?: (artwork: Artwork) => void;
    onSaveToPlaylist?: (artwork: Artwork) => void;
    onOpenComments?: (artwork: Artwork) => void;
}

export const ArtworkRecommendations: React.FC<Props> = ({
    artwork,
    relatedArtworks = [],
    onSelectArtwork,
    style,
    mode = 'horizontal',
    theme = 'light',
    likedArtworks,
    onToggleLike,
    onOpenProduct,
    onSaveToPlaylist,
    onOpenComments
}) => {
    const [aiRecommendations, setAiRecommendations] = useState<any[]>([]);
    const museumCountryMap = useMemo(() => getMuseumCountryMap(), []);
    const isMobileViewport = typeof window !== 'undefined' && window.innerWidth <= 768;

    useEffect(() => {
        let cancelled = false;
        const art = artwork as any;
        const cacheKey = String(art.semanticId || artwork?.id || `${artwork?.name || ''}|${artwork?.artist || ''}`).trim();

        if (cacheKey && recommendationCache.has(cacheKey)) {
            setAiRecommendations(recommendationCache.get(cacheKey) || []);
            return () => {
                cancelled = true;
            };
        }

        setAiRecommendations([]);

        const extractRecommendationImage = (item: any): string => {
            if (!item || typeof item !== 'object') return '';
            const candidates: any[] = [
                item.image,
                item.imageUrl,
                item.image_url,
                item.i,
                item.objectImage,
                item.representativeImage,
                item.thumbnail,
                item.thumbnailUrl,
                item.thumb,
                item.coverImage,
                item.url,
            ];

            if (Array.isArray(item.images)) candidates.push(...item.images);
            if (Array.isArray(item.photos)) candidates.push(...item.photos);

            for (const candidate of candidates) {
                if (!candidate) continue;

                if (typeof candidate === 'string') {
                    const value = candidate.trim();
                    if (value) return value;
                    continue;
                }

                if (typeof candidate === 'object') {
                    const nested = [candidate.image, candidate.url, candidate.src, candidate.file, candidate.thumbnail]
                        .find((v: any) => typeof v === 'string' && v.trim());
                    if (nested) return String(nested).trim();
                }
            }

            return '';
        };

        const normalizeRecommendationItems = (items: any[]) => {
            const seenIds = new Set<string>();
            const seenContent = new Set<string>();
            const normalize = (s: string) => (s || '').toLowerCase().trim();

            const art = artwork as any;
            const currentIds = [
                String(art.semanticId || '').trim(),
                String(artwork?.id || '').trim(),
                String(art.inventoryNo || '').trim(),
            ].filter(Boolean);
            currentIds.forEach((id) => seenIds.add(id));

            const cName = normalize(artwork.name || art.title || 'Untitled');
            const cArtist = normalize(artwork.artist || 'Unknown Artist');
            seenContent.add(`${cName}|${cArtist}`);

            const uniqueResults: any[] = [];

            items.forEach((item: any) => {
                if (!item) return;

                const itemId = String(item.id || item.semanticId || item.semantic_id || '').trim();
                if (itemId && seenIds.has(itemId)) return;

                const iName = normalize(item.name || item.n || item.title || 'Untitled');
                const iArtist = normalize(item.artist || item.a || item.creator || 'Unknown Artist');
                const contentKey = `${iName}|${iArtist}`;
                if (seenContent.has(contentKey)) return;

                if (itemId) seenIds.add(itemId);
                seenContent.add(contentKey);

                uniqueResults.push({
                    ...item,
                    image: extractRecommendationImage(item),
                    museumName: item.museumName || item.museum || item.m,
                });
            });

            return uniqueResults;
        };

        const requestWorker = async (endpoint: string, payload: Record<string, unknown>) => {
            // Only block text search during backoff — ID-based lookup never calls HuggingFace so should not be throttled.
            const isTextSearch = endpoint === '/search-by-text';
            if (isTextSearch && Date.now() < textSearchBackoffUntil) return null;

            const response = await fetch(`${WORKER_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.status === 503) {
                // Only back off for text search (HuggingFace cold-start), not for vectorize ID lookups.
                if (isTextSearch) {
                    textSearchBackoffUntil = Date.now() + RECOMMENDATION_BACKOFF_MS;
                }
                return null;
            }

            if (!response.ok) return null;
            return response.json();
        };

        const fetchAiRecommendations = async () => {
            const semanticOrArtworkId = String(art.semanticId || artwork?.id || '').trim();

            const expandIdVariants = (id: string): string[] => {
                if (!id) return [];
                const variants = new Set<string>([id]);
                if (id.includes('__')) variants.add(id.replace(/__/g, '/'));
                if (id.includes('/')) variants.add(id.replace(/\//g, '__'));
                return Array.from(variants).map((value) => value.trim()).filter(Boolean);
            };

            const rawIdCandidates = [
                semanticOrArtworkId,
                String(art.semantic_id || '').trim(),
                String(artwork?.id || '').trim(),
                String(art.inventoryNo || '').trim(),
            ].filter(Boolean);

            const idCandidates = rawIdCandidates
                .flatMap(expandIdVariants)
                .filter((value, idx, arr) => arr.indexOf(value) === idx);

            const commonMetadata = {
                name: artwork.name || art.title,
                artist: artwork.artist,
                museum: art.museum || art.museumName,
                image: artwork.image || art.imageUrl || art.url,
                url: art.url,
            };

            for (const candidateId of idCandidates) {
                try {
                    const data = await requestWorker('/recommend-by-id', {
                        id: candidateId,
                        limit: 12,
                        metadata: commonMetadata,
                    });
                    if (!data) continue;

                    const normalized = Array.isArray(data?.results)
                        ? normalizeRecommendationItems(data.results)
                        : [];

                    if (normalized.length > 0) {
                        if (cacheKey) recommendationCache.set(cacheKey, normalized);
                        if (!cancelled) setAiRecommendations(normalized);
                        return;
                    }
                } catch {
                    // Continue to next candidate id.
                }
            }

            const fallbackQuery = [String(artwork.name || art.title || '').trim(), String(artwork.artist || '').trim()]
                .filter(Boolean)
                .join(' ')
                .trim();
            if (!fallbackQuery || fallbackQuery.length < 2) return;
            if (Date.now() < textSearchBackoffUntil) return;

            try {
                const data = await requestWorker('/search-by-text', { text: fallbackQuery, limit: 12 });
                if (!data) return;

                const normalized = Array.isArray(data?.results)
                    ? normalizeRecommendationItems(data.results)
                    : [];
                if (cacheKey) recommendationCache.set(cacheKey, normalized);
                if (!cancelled) setAiRecommendations(normalized);
            } catch (e) {
                console.warn('AI Recommendation fallback failed:', e);
            }
        };

        void fetchAiRecommendations();

        return () => {
            cancelled = true;
        };
    }, [artwork]);

    const uniqueRelatedArtworks = useMemo(() => {
        if (!relatedArtworks) return [];
        const seen = new Set<string>();
        return relatedArtworks.filter(item => {
            if (!item || !item.id) return false;
            // Also check if current artwork is in the list
            if (String(item.id) === String(artwork.id)) return false;
            
            if (seen.has(String(item.id))) return false;
            seen.add(String(item.id));
            return true;
        });
    }, [relatedArtworks, artwork.id]);

    const getCountry = (museumName?: string) => {
        if (!museumName) return '';
        // Try exact match or partial match
        const lower = museumName.toLowerCase();
        if (museumCountryMap[lower]) return museumCountryMap[lower];

        // If not found, perhaps verify against known major museums hardcoded if needed
        return '';
    };

    const renderCard = (item: any, source: 'AI' | 'Meta') => {
        const compact = mode === 'compact-horizontal';
        const isMobileViewport = typeof window !== 'undefined' && window.innerWidth <= 768;
        const compactCardWidth = isMobileViewport ? 126 : 148;
        // Normalize data fields from various sources (Worker vs Local)
        const name = item.name || item.n || 'Untitled';
        const artist = item.artist || item.a || 'Unknown Artist';

        // Robust image extraction
        let image = item.image || item.i || item.url || item.imageUrl || item.objectImage || item.representativeImage || item.thumbnailUrl || item.thumbnail || '';
        // Handle array of images case
        if (Array.isArray(item.images) && item.images.length > 0) {
            image = item.images[0];
        } else if (item.images && typeof item.images === 'string') {
            image = item.images;
        }

        const year = item.year || item.y || '';
        // For Meta items, museumName might be missing, handled below
        const museum = item.museum || item.m || item.museumName || '';

        const country = getCountry(museum);
        const cardId = String(item.id || `${name}-${artist}-${year}`);
        const likedKey = String(item.id || item.artworkId || item.semanticId || item.semantic_id || cardId);
        const actionableArtwork = {
            ...item,
            id: likedKey,
            artworkId: likedKey,
            name,
            title: name,
            artist,
            image,
            museumName: museum,
            year,
        } as Artwork;
        const isCardLiked = Boolean(likedArtworks) && [
            likedKey,
            String(item.id || ''),
            String(item.artworkId || ''),
            String(item.semanticId || ''),
            String(item.semantic_id || ''),
            cardId,
        ].filter(Boolean).some((key) => likedArtworks.has(key));

        const textColor = theme === 'dark' ? '#fff' : '#111';
        const subTextColor = theme === 'dark' ? '#ccc' : '#666';
        const mutedColor = theme === 'dark' ? '#bbb' : '#888';
        const badgeText = source === 'AI' ? 'AI' : 'Related';
        const badgeBg = source === 'AI'
            ? (theme === 'dark' ? 'rgba(191,255,10,0.18)' : 'rgba(90,120,0,0.13)')
            : (theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)');
        const badgeBorder = source === 'AI'
            ? (theme === 'dark' ? 'rgba(191,255,10,0.32)' : 'rgba(90,120,0,0.26)')
            : (theme === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.10)');
        const badgeColor = source === 'AI'
            ? (theme === 'dark' ? '#D9FF6E' : '#4A6200')
            : (theme === 'dark' ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.62)');

        const hasImage = typeof image === 'string' && image.trim().length > 0;
        const actionButtonSize = compact ? 20 : 22;
        const actionIconSize = compact ? 10 : 12;
        const actionButtonStyle: React.CSSProperties = {
            cursor: 'pointer',
            width: actionButtonSize,
            height: actionButtonSize,
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(0,0,0,0.56)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
        };

        return (
            <div
                key={cardId}
                onClick={(e) => {
                    e.stopPropagation();
                    onSelectArtwork(actionableArtwork);
                }}
                style={{
                    minWidth: compact ? compactCardWidth : 160,
                    maxWidth: mode === 'grid' ? '100%' : (compact ? compactCardWidth : 160),
                    cursor: 'pointer',
                    flexShrink: 0,
                    opacity: 1
                }}
            >
                <div style={{
                    width: '100%',
                    aspectRatio: compact ? '1 / 1' : '1',
                    borderRadius: compact ? 8 : 8,
                    overflow: 'hidden',
                    marginBottom: compact ? 6 : 8,
                    background: theme === 'dark' ? '#242424' : '#ececec',
                    position: 'relative'
                }}>
                    {hasImage ? (
                        <img
                            src={getWeservUrl(image, 300)}
                            alt={name}
                            loading="lazy"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s' }}
                            referrerPolicy="no-referrer"
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                            onError={(e) => {
                                // Fallback to original if proxy fails
                                const target = e.currentTarget;
                                if (image && target.src !== image) {
                                    target.src = image;
                                } else {
                                    target.style.opacity = '0.5';
                                }
                            }}
                        />
                    ) : (
                        <div
                            style={{
                                width: '100%',
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: theme === 'dark' ? '#171717' : '#e7e7e7',
                                color: theme === 'dark' ? 'rgba(255,255,255,0.46)' : 'rgba(0,0,0,0.42)',
                                fontSize: compact ? 9 : 10,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                            }}
                        >
                            No Image
                        </div>
                    )}
                    <div style={{
                        position: 'absolute',
                        top: compact ? 6 : 6,
                        left: compact ? 6 : 6,
                        background: badgeBg,
                        color: badgeColor,
                        fontSize: compact ? 8 : 9,
                        fontWeight: 600,
                        padding: compact ? '2px 6px' : '2px 7px',
                        borderRadius: 999,
                        border: `1px solid ${badgeBorder}`,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        backdropFilter: 'blur(6px)'
                    }}>
                        {badgeText}
                    </div>

                    {/* Action Icons */}
                    <div style={{
                        position: 'absolute',
                        bottom: compact ? 6 : 8,
                        right: compact ? 6 : 6,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: compact ? 4 : 5,
                        zIndex: 10,
                        pointerEvents: 'auto'
                    }}>
                        {onSaveToPlaylist && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSaveToPlaylist(actionableArtwork);
                                }}
                                style={actionButtonStyle}
                                title="Save to Playlist"
                            >
                                <BookmarkPlus size={actionIconSize} strokeWidth={2.2} />
                            </button>
                        )}

                        {onOpenProduct && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenProduct(actionableArtwork);
                                }}
                                style={actionButtonStyle}
                                title="Purchase Product"
                            >
                                <ShoppingBag size={actionIconSize} strokeWidth={2.2} />
                            </button>
                        )}

                        {SHOW_ARTWORK_COMMENTS && onOpenComments && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenComments(actionableArtwork);
                                }}
                                style={actionButtonStyle}
                                title="Comments"
                            >
                                <MessageCircle size={actionIconSize} strokeWidth={2.2} />
                            </button>
                        )}

                        {onToggleLike && likedArtworks && (
                            <HeartOverlay
                                isLiked={isCardLiked}
                                onToggle={(e) => onToggleLike(e, actionableArtwork)}
                                style={{
                                    width: actionButtonSize,
                                    height: actionButtonSize,
                                    borderRadius: '50%',
                                    background: 'rgba(0,0,0,0.56)',
                                    padding: 0,
                                }}
                                size={actionIconSize}
                                color="#BFFF0A"
                                emptyColor="#fff"
                            />
                        )}
                    </div>
                </div>

                {/* Title & Year */}
                <div style={{ fontSize: compact ? 11 : 13, fontWeight: 700, color: textColor, marginBottom: compact ? 2 : 3, lineHeight: 1.28, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {name}
                </div>
                {year && <div style={{ fontSize: compact ? 9 : 11, color: subTextColor, marginBottom: compact ? 3 : 4 }}>{year}</div>}

                {/* Artist */}
                <div style={{ fontSize: compact ? 10 : 12, color: theme === 'dark' ? '#ddd' : '#333', fontWeight: 500, marginBottom: compact ? 1 : 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{artist}</div>

                {/* Museum & Country */}
                {
                    museum && (
                        <div style={{ fontSize: compact ? 9 : 11, color: mutedColor, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {museum}{country ? ` (${country})` : ''}
                        </div>
                    )
                }
            </div >
        );
    };

    const hasRealAiRecommendations = aiRecommendations.length > 0;
    const effectiveAiRecommendations = hasRealAiRecommendations
        ? aiRecommendations
        : uniqueRelatedArtworks.slice(0, 8);
    const effectiveMetaRecommendations = hasRealAiRecommendations
        ? uniqueRelatedArtworks
        : [];

    if (effectiveAiRecommendations.length === 0 && effectiveMetaRecommendations.length === 0) return null;

    const sectionHeaderStyle: React.CSSProperties = {
        fontSize: 14,
        fontWeight: 700,
        color: theme === 'dark' ? '#fff' : '#333',
        marginBottom: 12,
        letterSpacing: '0.02em',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: 8
    };

    if (mode === 'compact-horizontal') {
        const compactItems: Array<{ item: any; source: 'AI' | 'Meta' }> = [
            // When there are no real AI results, effectiveAiRecommendations is the metadata fallback — label it 'Meta'.
            ...effectiveAiRecommendations.map((item) => ({ item, source: (hasRealAiRecommendations ? 'AI' : 'Meta') as 'AI' | 'Meta' })),
            ...effectiveMetaRecommendations.map((item) => ({ item, source: 'Meta' as const })),
        ];

        if (compactItems.length === 0) return null;

        return (
            <div style={{ ...style }} className="artwork-recommendations">
                <h3 style={{ ...sectionHeaderStyle, fontSize: 10, marginBottom: 10, letterSpacing: '0.18em', color: theme === 'dark' ? 'rgba(255,255,255,0.76)' : 'rgba(0,0,0,0.62)' }}>
                    Similar Works <span style={{ fontSize: 8, fontWeight: 500, color: theme === 'dark' ? 'rgba(255,255,255,0.44)' : 'rgba(0,0,0,0.36)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>Swipe</span>
                </h3>
                <div
                    className="armin-rec-scroll"
                    style={{
                        display: 'flex',
                        gap: 10,
                        overflowX: 'auto',
                        paddingBottom: 8,
                        WebkitOverflowScrolling: 'touch',
                        scrollbarWidth: 'thin',
                        scrollbarColor: theme === 'dark' ? 'rgba(255,255,255,0.22) rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.22) rgba(0,0,0,0.05)',
                    }}
                >
                    {compactItems.map(({ item, source }) => renderCard(item, source))}
                </div>
                <style>{`
                    .armin-rec-scroll::-webkit-scrollbar {
                        height: 6px;
                    }
                    .armin-rec-scroll::-webkit-scrollbar-track {
                        background: ${theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'};
                        border-radius: 999px;
                        border: 1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'};
                    }
                    .armin-rec-scroll::-webkit-scrollbar-thumb {
                        background: ${theme === 'dark' ? 'rgba(255,255,255,0.34)' : 'rgba(0,0,0,0.28)'};
                        border-radius: 999px;
                        border: 1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)'};
                    }
                    .armin-rec-scroll::-webkit-scrollbar-thumb:hover {
                        background: ${theme === 'dark' ? 'rgba(255,255,255,0.46)' : 'rgba(0,0,0,0.36)'};
                    }
                `}</style>
            </div>
        );
    }

    return (
        <div style={{ ...style }} className="artwork-recommendations">
            {/* AI Recommendations (or metadata fallback labeled as Related) */}
            {effectiveAiRecommendations.length > 0 && (
                <div style={{ marginBottom: 48 }}>
                    <h3 style={sectionHeaderStyle}>
                        {hasRealAiRecommendations
                            ? <>Similar Vibe <span style={{ fontSize: 11, fontWeight: 500, color: theme === 'dark' ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.56)', textTransform: 'none' }}>Visually related works</span></>
                            : <>Related Works <span style={{ fontSize: 11, fontWeight: 500, color: theme === 'dark' ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.56)', textTransform: 'none' }}>Same artist or period</span></>
                        }
                    </h3>
                    <div style={mode === 'grid' ? {
                        display: 'grid',
                        gridTemplateColumns: `repeat(auto-fill, minmax(${isMobileViewport ? 128 : 160}px, 1fr))`,
                        gap: 14,
                        columnGap: 14
                    } : {
                        display: 'flex',
                        gap: 12,
                        overflowX: 'auto',
                        paddingBottom: 8
                    }}>
                        {effectiveAiRecommendations.map(item => renderCard(item, hasRealAiRecommendations ? 'AI' : 'Meta'))}
                    </div>
                </div>
            )}

            {/* Metadata Recommendations */}
            {effectiveMetaRecommendations.length > 0 && (
                <div>
                    <h3 style={sectionHeaderStyle}>
                        More by {artwork.artist}
                    </h3>
                    <div style={mode === 'grid' ? {
                        display: 'grid',
                        gridTemplateColumns: `repeat(auto-fill, minmax(${isMobileViewport ? 128 : 160}px, 1fr))`,
                        gap: 14,
                        columnGap: 14
                    } : {
                        display: 'flex',
                        gap: 12,
                        overflowX: 'auto',
                        paddingBottom: 8
                    }}>
                        {effectiveMetaRecommendations.map(item => renderCard(item, 'Meta'))}
                    </div>
                </div>
            )}
        </div>
    );
};
