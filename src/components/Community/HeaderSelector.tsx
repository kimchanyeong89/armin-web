import React, { useState, useEffect, useRef } from 'react';
import { exhibitions } from '../../data/exhibitions';
import { getOptimizedImageUrl } from '../../utils/imageProxy';
import { getWorkerNetworkMode } from '../../utils/network';
import { useLanguage } from '../../contexts/LanguageContext';

// Types matched with search.worker.ts
export type SearchableArtwork = {
    id: string;
    name: string;
    artist: string;
    image: string;
    museumName: string;
    exhibitionId: string;
};

export type HeaderItem = {
    id: string;
    type: 'museum' | 'artist' | 'artwork' | 'exhibition';
    name: string;
    image?: string;
    subtext?: string;
};

interface HeaderSelectorProps {
    onSelect: (item: HeaderItem) => void;
    selectedItem?: HeaderItem | null;
    variant?: 'light' | 'dark';
    allowedTypes?: Array<HeaderItem['type']>;
}

const HeaderSelector: React.FC<HeaderSelectorProps> = ({ onSelect, selectedItem, variant = 'light', allowedTypes }) => {
    const { language, t } = useLanguage();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<HeaderItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const workerRef = useRef<Worker | null>(null);
    const latestQueryRef = useRef('');
    const allowedTypesRef = useRef<Array<HeaderItem['type']> | undefined>(allowedTypes);
    const dark = variant === 'dark';

    useEffect(() => {
        allowedTypesRef.current = allowedTypes;
    }, [allowedTypes]);

    const resolvedTypes: Array<HeaderItem['type']> = allowedTypes?.length
        ? allowedTypes
        : ['museum', 'artist', 'artwork', 'exhibition'];

    const typeLabelByType: Record<HeaderItem['type'], { ko: string; en: string }> = {
        museum: { ko: '미술관', en: 'Museum' },
        artist: { ko: '작가', en: 'Artist' },
        artwork: { ko: '작품', en: 'Artwork' },
        exhibition: { ko: '전시', en: 'Exhibition' },
    };
    const placeholderText =
        language === 'ko'
            ? `머릿글 설정 (${resolvedTypes.map((type) => typeLabelByType[type].ko).join('/')} 검색)`
            : `Set Header (Search ${resolvedTypes.map((type) => typeLabelByType[type].en).join('/')})`;

    const getTypeLabel = (type: HeaderItem['type']) => t(typeLabelByType[type]);

    const colors = dark
        ? {
            inputBg: 'rgba(255,255,255,0.04)',
            inputText: 'rgba(255,255,255,0.90)',
            inputBorder: 'rgba(255,255,255,0.10)',
            inputPlaceholder: 'rgba(255,255,255,0.34)',
            panelBg: '#0f0f0f',
            panelBorder: 'rgba(255,255,255,0.12)',
            itemHover: 'rgba(255,255,255,0.06)',
            itemText: 'rgba(255,255,255,0.88)',
            itemSubText: 'rgba(255,255,255,0.56)',
            selectedBg: 'rgba(255,255,255,0.05)',
            selectedBorder: 'rgba(255,255,255,0.14)',
        }
        : {
            inputBg: '#fff',
            inputText: '#111',
            inputBorder: '#ccc',
            inputPlaceholder: '#777',
            panelBg: '#fff',
            panelBorder: '#ddd',
            itemHover: '#f5f5f5',
            itemText: '#111',
            itemSubText: '#888',
            selectedBg: '#f9f9f9',
            selectedBorder: '#ddd',
        };

    const ensureWorker = () => {
        if (workerRef.current) return;
        workerRef.current = new Worker(new URL('../../workers/search.worker.ts', import.meta.url), { type: 'module' });

        workerRef.current.onmessage = (e) => {
            const { type, results: artResults, artists, query: responseQuery, pending } = e.data;
            if (type === 'RESULTS') {
                if (responseQuery !== latestQueryRef.current) {
                    return;
                }
                if (pending) {
                    setIsLoading(true);
                }

                const formattedArtworks: HeaderItem[] = (artResults || []).slice(0, 80).map((art: SearchableArtwork) => ({
                    id: art.id,
                    type: 'artwork',
                    name: art.name,
                    image: art.image,
                    subtext: art.artist
                }));

                const formattedArtists: HeaderItem[] = (artists || []).slice(0, 12).map((a: any) => ({
                    id: `artist-${String(a.artist || '').toLowerCase()}`,
                    type: 'artist',
                    name: a.artist,
                    subtext: language === 'ko' ? `작품 ${a.count || 0}개` : `${a.count || 0} artworks`,
                }));

                setResults(prev => {
                    const activeAllowed = allowedTypesRef.current;
                    const workerPool = [...formattedArtists, ...formattedArtworks];
                    const typedWorker = activeAllowed?.length
                        ? workerPool.filter(item => activeAllowed.includes(item.type))
                        : workerPool;
                    const combined = [...typedWorker, ...prev];

                    const unique = combined.filter((item, index, self) =>
                        index === self.findIndex((t) => (
                            t.id === item.id && t.type === item.type
                        ))
                    );
                    return unique.slice(0, 30);
                });
                if (!pending) setIsLoading(false);
            }
        };

        workerRef.current.postMessage({ type: 'SET_MODE', mode: getWorkerNetworkMode() });
        workerRef.current.postMessage({ type: 'LOAD' });
    };

    useEffect(() => {
        ensureWorker();
        return () => {
            workerRef.current?.terminate();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Search Logic
    useEffect(() => {
        latestQueryRef.current = query;

        if (!query || query.length < 1) {
            setResults([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);

        // 1. Search Museums & Exhibitions (Local Data)
        const lowerQ = query.toLowerCase();
        const localResults: HeaderItem[] = [];
        const addedIds = new Set<string>();
        const allowMuseum = !allowedTypes?.length || allowedTypes.includes('museum');
        const allowArtist = !allowedTypes?.length || allowedTypes.includes('artist');
        const allowExhibition = !allowedTypes?.length || allowedTypes.includes('exhibition');

        if (allowMuseum) {
            exhibitions.forEach(museum => {
                const museumName = String(museum.name || '').toLowerCase();
                if (museumName.includes(lowerQ)) {
                    const uniqueId = `museum-${museum.id}`;
                    if (!addedIds.has(uniqueId)) {
                        localResults.push({
                            id: museum.id,
                            type: 'museum',
                            name: museum.name,
                            image: museum.representativeImage,
                            subtext: museum.location,
                        });
                        addedIds.add(uniqueId);
                    }
                }
            });
        }

        if (allowExhibition) {
            exhibitions.forEach(museum => {
                (museum.permanentExhibitions || []).forEach(exh => {
                    const eName = (exh.name || (exh as any).title || '').toLowerCase();
                    const uniqueId = `exhibition-${exh.id}`;
                    if (!addedIds.has(uniqueId) && eName.includes(lowerQ)) {
                        const startDate = String((exh as any).startDate || '').trim();
                        const endDate = String((exh as any).endDate || '').trim();
                        const period = startDate || endDate ? `${startDate || '?'} - ${endDate || '?'}` : '';
                        localResults.push({
                            id: exh.id,
                            type: 'exhibition',
                            name: exh.name || (exh as any).title,
                            subtext: period ? `${museum.name} · ${period}` : museum.name,
                            image: exh.image
                        });
                        addedIds.add(uniqueId);
                    }
                });
            });
        }

        const scoredLocal = localResults
            .map(item => {
                const name = (item.name || '').toLowerCase();
                const q = lowerQ;
                const startsWith = name.startsWith(q) ? 0 : 1;
                return { item, score: startsWith };
            })
            .sort((a, b) => a.score - b.score)
            .map(entry => entry.item);

        const typedLocal = allowedTypes?.length
            ? scoredLocal.filter(item => allowedTypes.includes(item.type))
            : scoredLocal;

        setResults(typedLocal.slice(0, 16));

        // 2. Search Artists & Artworks (Worker)
        const allowArtwork = !allowedTypes?.length || allowedTypes.includes('artwork');
        const allowWorker = allowArtwork || allowArtist;
        if (allowWorker) {
            ensureWorker();
            workerRef.current?.postMessage({ type: 'SEARCH', query });
        } else {
            setIsLoading(false);
        }

    }, [query, allowedTypes]);

    const renderLoadingRow = (alignment: 'center' | 'flex-start' = 'center') => (
        <div style={{
            padding: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: alignment,
            gap: '8px',
            fontSize: '13px',
            color: dark ? 'rgba(255,255,255,0.56)' : '#666'
        }}>
            <svg width="16" height="16" viewBox="0 0 38 38" stroke="#888" aria-hidden="true">
                <g fill="none" fillRule="evenodd">
                    <g transform="translate(1 1)" strokeWidth="2">
                        <circle strokeOpacity=".3" cx="18" cy="18" r="18" />
                        <path d="M36 18c0-9.94-8.06-18-18-18">
                            <animateTransform
                                attributeName="transform"
                                type="rotate"
                                from="0 18 18"
                                to="360 18 18"
                                dur="1s"
                                repeatCount="indefinite"
                            />
                        </path>
                    </g>
                </g>
            </svg>
            <span>{t({ ko: '작가/작품 결과를 불러오는 중...', en: 'Loading artist/artwork results...' })}</span>
        </div>
    );

    return (
        <div style={{ position: 'relative', width: '100%', maxWidth: '600px' }}>
            {selectedItem ? (
                <div style={{
                    padding: '12px',
                    border: `1px solid ${colors.selectedBorder}`,
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: colors.selectedBg
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {selectedItem.image && (
                            <img src={getOptimizedImageUrl(selectedItem.image, 100)} alt="" style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover' }} />
                        )}
                        <div>
                            <div style={{ fontWeight: 'bold', color: colors.itemText }}>{selectedItem.name}</div>
                            <div style={{ fontSize: '12px', color: colors.itemSubText, textTransform: 'capitalize' }}>
                                {getTypeLabel(selectedItem.type)} {selectedItem.subtext ? `• ${selectedItem.subtext}` : ''}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            onSelect(null as any);
                            setQuery('');
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: colors.itemSubText }}
                    >
                        ×
                    </button>
                </div>
            ) : (
                <>
                    <input
                        type="text"
                        placeholder={placeholderText}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setTimeout(() => setIsFocused(false), 200)} // Delay to allow click
                        style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '8px',
                            border: `1px solid ${colors.inputBorder}`,
                            fontSize: '16px',
                            background: colors.inputBg,
                            color: colors.inputText,
                        }}
                    />
                    {isFocused && (query.length > 0) && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            background: colors.panelBg,
                            border: `1px solid ${colors.panelBorder}`,
                            borderRadius: '8px',
                            marginTop: '4px',
                            maxHeight: '400px', // Increased max height
                            overflowY: 'auto',
                            zIndex: 100,
                            boxShadow: dark ? '0 8px 20px rgba(0,0,0,0.45)' : '0 4px 12px rgba(0,0,0,0.1)'
                        }}>
                            {results.length === 0 && (
                                <>
                                    {isLoading && renderLoadingRow()}
                                    {!isLoading && (
                                        <div style={{ padding: '12px', textAlign: 'center', color: colors.itemSubText }}>
                                            {t({ ko: '검색 결과가 없습니다', en: 'No results found' })}
                                        </div>
                                    )}
                                </>
                            )}

                            {results.length > 0 && results.map((item) => (
                                <div
                                    key={`${item.type}-${item.id}`}
                                    onClick={() => onSelect(item)}
                                    style={{
                                        padding: '10px 12px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : '#eee'}`
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = colors.itemHover}
                                    onMouseLeave={(e) => e.currentTarget.style.background = colors.panelBg}
                                >
                                    {/* Type Badge */}
                                    <div style={{
                                        fontSize: '10px',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        background: item.type === 'museum' ? '#e3f2fd' : item.type === 'artist' ? '#f3e5f5' : item.type === 'exhibition' ? '#e0f2f1' : '#fbe9e7',
                                        color: '#111',
                                        textTransform: language === 'ko' ? 'none' : 'uppercase',
                                        minWidth: '60px',
                                        textAlign: 'center',
                                        flexShrink: 0
                                    }}>
                                        {getTypeLabel(item.type)}
                                    </div>

                                    {item.image ? (
                                        <img src={getOptimizedImageUrl(item.image, 100)} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                                    ) : (
                                        <div style={{ width: 32, height: 32, background: dark ? 'rgba(255,255,255,0.08)' : '#eee', borderRadius: 4, flexShrink: 0 }} />
                                    )}

                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: colors.itemText }}>{item.name}</div>
                                        {item.subtext && <div style={{ fontSize: '11px', color: colors.itemSubText }}>{item.subtext}</div>}
                                    </div>
                                </div>
                            ))}

                            {isLoading && results.length > 0 && renderLoadingRow('flex-start')}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default HeaderSelector;
