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
    mode?: 'horizontal' | 'grid';
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
                        url: art.url
                    }
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

        const textColor = theme === 'dark' ? '#fff' : '#111';
        const subTextColor = theme === 'dark' ? '#ccc' : '#666';
        const mutedColor = theme === 'dark' ? '#bbb' : '#888';

        if (!image) return null;

        return (
            <div
                key={item.id}
                onClick={(e) => {
                    e.stopPropagation();
                    onSelectArtwork({
                        ...item,
                        name, artist, image, year, museumName: museum
                    });
                }}
                style={{
                    minWidth: 160,
                    maxWidth: mode === 'grid' ? '100%' : 160,
                    cursor: 'pointer',
                    flexShrink: 0,
                    animation: 'fadeInUp 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
                    opacity: 0 // start invisible
                }}
            >
                <div style={{
                    width: '100%',
                    aspectRatio: '1',
                    borderRadius: 8,
                    overflow: 'hidden',
                    marginBottom: 8,
                    background: theme === 'dark' ? '#333' : '#f0f0f0',
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
                    {/* Debug Badge */}
                    <div style={{
                        position: 'absolute',
                        top: 6,
                        left: 6,
                        background: source === 'AI' ? 'rgba(124, 58, 237, 0.9)' : 'rgba(0, 0, 0, 0.6)',
                        color: '#fff',
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 3,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        backdropFilter: 'blur(2px)'
                    }}>
                        {source === 'AI' ? 'AI ViBE' : 'Meta'}
                    </div>

                    {/* Icons Bottom Right */}
                    <div style={{
                        position: 'absolute',
                        bottom: 6,
                        right: 6,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
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
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))' }}>
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                    <rect x="7" y="7" width="10" height="10" />
                                </svg>
                            </div>
                        )}

                        {/* Heart Icon (Like) */}
                        {onToggleLike && likedArtworks && (
                            <HeartOverlay
                                isLiked={likedArtworks.has(item.id)}
                                onToggle={(e) => onToggleLike(e, item as Artwork)}
                                style={{ padding: 0, background: 'none' }}
                                size={14}
                                color="#e11d48"
                                emptyColor="#fff"
                            />
                        )}
                    </div>
                </div>

                {/* Title & Year */}
                <div style={{ fontSize: 13, fontWeight: 700, color: textColor, marginBottom: 3, lineHeight: 1.3 }}>
                    {name}
                </div>
                {year && <div style={{ fontSize: 11, color: subTextColor, marginBottom: 4 }}>{year}</div>}

                {/* Artist */}
                <div style={{ fontSize: 12, color: theme === 'dark' ? '#ddd' : '#333', fontWeight: 500, marginBottom: 2 }}>{artist}</div>

                {/* Museum & Country */}
                {
                    museum && (
                        <div style={{ fontSize: 11, color: mutedColor, fontStyle: 'italic' }}>
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
