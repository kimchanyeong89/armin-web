import React, { useState, useEffect, useMemo } from 'react';
import type { Artwork } from '../types/Artwork';
import { getWeservUrl } from '../utils/imageProxy';
import { exhibitions } from '../data/exhibitions';
import { HeartOverlay } from './HeartOverlay';

const WORKER_URL = 'https://armin-semantic-search.armin-art.workers.dev';

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
    onOpenProduct
}) => {
    const [aiRecommendations, setAiRecommendations] = useState<any[]>([]);
    const museumCountryMap = useMemo(() => getMuseumCountryMap(), []);

    useEffect(() => {
        setAiRecommendations([]);
        const fetchAiRecommendations = async () => {
            if (!artwork?.id) return;

            try {
                const art = artwork as any;
                const payload = {
                    id: artwork.id,
                    limit: 12,
                    metadata: {
                        name: artwork.name || art.title,
                        artist: artwork.artist,
                        museum: art.museum || art.museumName,
                        image: artwork.image || art.imageUrl || art.url,
                        url: art.url,
                    },
                };

                const res = await fetch(`${WORKER_URL}/recommend-by-id`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data.results && Array.isArray(data.results)) {
                        // Deduplicate results
                        const seenIds = new Set<string>();
                        const seenContent = new Set<string>();

                        // Helper to normalize strings
                        const normalize = (s: string) => (s || '').toLowerCase().trim();

                        // Exclude current artwork
                        if (artwork.id) seenIds.add(artwork.id);

                        // Normalize current artwork fields to exclude it
                        const curArt = artwork as any;
                        const cName = normalize(artwork.name || curArt.title || 'Untitled');
                        const cArtist = normalize(artwork.artist || 'Unknown Artist');

                        // Add current artwork content to seen set (Name + Artist)
                        seenContent.add(`${cName}|${cArtist}`);

                        const uniqueResults: any[] = [];

                        data.results.forEach((item: any) => {
                            if (!item) return;

                            // 1. Check ID
                            if (seenIds.has(item.id)) return;

                            // 2. Check Content (Name + Artist)
                            const iName = normalize(item.name || item.n || 'Untitled');
                            const iArtist = normalize(item.artist || item.a || 'Unknown Artist');

                            // Create a content signature
                            const contentKey = `${iName}|${iArtist}`;

                            if (seenContent.has(contentKey)) return;

                            seenIds.add(item.id);
                            seenContent.add(contentKey);
                            uniqueResults.push({
                                ...item,
                                image: item.image || item.imageUrl, // normalize
                                museumName: item.museumName || item.museum
                            });
                        });

                        setAiRecommendations(uniqueResults);
                    }
                }
            } catch (e) {
                console.warn('AI Recommendation failed:', e);
            }
        };

        fetchAiRecommendations();
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
        // Normalize data fields from various sources (Worker vs Local)
        const name = item.name || item.n || 'Untitled';
        const artist = item.artist || item.a || 'Unknown Artist';

        // Robust image extraction
        let image = item.image || item.i || item.url || item.imageUrl || item.objectImage || item.representativeImage || '';
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

        if (!image) return null;

        return (
            <div
                key={cardId}
                onClick={(e) => {
                    e.stopPropagation();
                    onSelectArtwork({
                        ...item,
                        name, artist, image, year, museumName: museum
                    });
                }}
                style={{
                    minWidth: compact ? 168 : 160,
                    maxWidth: mode === 'grid' ? '100%' : (compact ? 168 : 160),
                    cursor: 'pointer',
                    flexShrink: 0,
                    animation: 'fadeInUp 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
                    opacity: 0 // start invisible
                }}
            >
                <div style={{
                    width: '100%',
                    aspectRatio: compact ? '1 / 0.84' : '1',
                    borderRadius: compact ? 6 : 8,
                    overflow: 'hidden',
                    marginBottom: compact ? 6 : 8,
                    background: theme === 'dark' ? '#242424' : '#ececec',
                    position: 'relative'
                }}>
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
                                // If even original fails, maybe show a placeholder or hide
                                target.style.opacity = '0.5';
                            }
                        }}
                    />
                    <div style={{
                        position: 'absolute',
                        top: compact ? 5 : 6,
                        left: compact ? 5 : 6,
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

                    {/* Icons Bottom Right */}
                    <div style={{
                        position: 'absolute',
                        bottom: compact ? 5 : 6,
                        right: compact ? 5 : 6,
                        display: 'flex',
                        alignItems: 'center',
                        gap: compact ? 6 : 8,
                        zIndex: 10,
                        pointerEvents: 'auto'
                    }}>
                        {/* Frame Icon (Product) */}
                        {onOpenProduct && (
                            <div
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenProduct(item as Artwork);
                                }}
                                style={{
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'transform 0.15s ease',
                                    color: '#fff',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.15)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                title="상품으로 구매하기"
                            >
                                <svg width={compact ? 12 : 14} height={compact ? 12 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))' }}>
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                    <rect x="7" y="7" width="10" height="10" />
                                </svg>
                            </div>
                        )}

                        {/* Heart Icon (Like) */}
                        {onToggleLike && likedArtworks && (
                            <HeartOverlay
                                isLiked={likedArtworks.has(cardId)}
                                onToggle={(e) => onToggleLike(e, item as Artwork)}
                                style={{ padding: 0, background: 'none' }}
                                size={compact ? 12 : 14}
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

    if (uniqueRelatedArtworks.length === 0 && aiRecommendations.length === 0) return null;

    const sectionHeaderStyle: React.CSSProperties = {
        fontSize: 13,
        fontWeight: 700,
        color: theme === 'dark' ? '#fff' : '#333',
        marginBottom: 20,
        textTransform: 'uppercase',
        letterSpacing: 1,
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: 8
    };

    if (mode === 'compact-horizontal') {
        const compactItems: Array<{ item: any; source: 'AI' | 'Meta' }> = [
            ...aiRecommendations.map((item) => ({ item, source: 'AI' as const })),
            ...uniqueRelatedArtworks.map((item) => ({ item, source: 'Meta' as const })),
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
                        scrollbarColor: theme === 'dark' ? 'rgba(191,255,10,0.4) rgba(255,255,255,0.04)' : 'rgba(90,120,0,0.42) rgba(0,0,0,0.05)',
                    }}
                >
                    {compactItems.map(({ item, source }) => renderCard(item, source))}
                </div>
                <style>{`
                    @keyframes fadeInUp {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    .armin-rec-scroll::-webkit-scrollbar {
                        height: 6px;
                    }
                    .armin-rec-scroll::-webkit-scrollbar-track {
                        background: ${theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'};
                        border-radius: 999px;
                        border: 1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'};
                    }
                    .armin-rec-scroll::-webkit-scrollbar-thumb {
                        background: linear-gradient(90deg, ${theme === 'dark' ? 'rgba(191,255,10,0.30)' : 'rgba(90,120,0,0.26)'}, ${theme === 'dark' ? 'rgba(191,255,10,0.58)' : 'rgba(90,120,0,0.52)'});
                        border-radius: 999px;
                        border: 1px solid ${theme === 'dark' ? 'rgba(191,255,10,0.18)' : 'rgba(90,120,0,0.18)'};
                    }
                    .armin-rec-scroll::-webkit-scrollbar-thumb:hover {
                        background: linear-gradient(90deg, ${theme === 'dark' ? 'rgba(191,255,10,0.42)' : 'rgba(90,120,0,0.36)'}, ${theme === 'dark' ? 'rgba(191,255,10,0.74)' : 'rgba(90,120,0,0.64)'});
                    }
                `}</style>
            </div>
        );
    }

    return (
        <div style={{ ...style }} className="artwork-recommendations">
            {/* AI Recommendations */}
            {aiRecommendations.length > 0 && (
                <div style={{ marginBottom: 48 }}>
                    <h3 style={sectionHeaderStyle}>
                        ✨ Similar Vibe <span style={{ fontSize: 10, fontWeight: 400, color: theme === 'dark' ? '#aaa' : '#888', textTransform: 'none' }}>(AI Image Analysis)</span>
                    </h3>
                    <div style={mode === 'grid' ? {
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                        gap: 24,
                        columnGap: 32 // More spacing
                    } : {
                        display: 'flex',
                        gap: 16,
                        overflowX: 'auto',
                        paddingBottom: 8
                    }}>
                        {aiRecommendations.map(item => renderCard(item, 'AI'))}
                    </div>
                </div>
            )}

            {/* Metadata Recommendations */}
            {uniqueRelatedArtworks.length > 0 && (
                <div>
                    <h3 style={sectionHeaderStyle}>
                        More by {artwork.artist}
                    </h3>
                    <div style={mode === 'grid' ? {
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                        gap: 24,
                        columnGap: 32
                    } : {
                        display: 'flex',
                        gap: 16,
                        overflowX: 'auto',
                        paddingBottom: 8
                    }}>
                        {uniqueRelatedArtworks.map(item => renderCard(item, 'Meta'))}
                    </div>
                </div>
            )}
            <style>{`
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};
