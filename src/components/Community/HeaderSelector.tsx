import React, { useState, useEffect, useRef } from 'react';
import { exhibitions } from '../../data/exhibitions';
import { getOptimizedImageUrl } from '../../utils/imageProxy';
import { getWorkerNetworkMode } from '../../utils/network';

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
}

const HeaderSelector: React.FC<HeaderSelectorProps> = ({ onSelect, selectedItem }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<HeaderItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const workerRef = useRef<Worker | null>(null);
    const latestQueryRef = useRef('');

    const ensureWorker = () => {
        if (workerRef.current) return;
        workerRef.current = new Worker(new URL('../../workers/search.worker.ts', import.meta.url), { type: 'module' });

        workerRef.current.onmessage = (e) => {
            const { type, results: artResults, artists, query: responseQuery, pending } = e.data;
            if (type === 'RESULTS') {
                if (pending) {
                    if (responseQuery === latestQueryRef.current) {
                        setIsLoading(true);
                    }
                    return;
                }

                if (responseQuery !== latestQueryRef.current) {
                    return;
                }
                // Formatting Artworks - Slicing increased to 50 for longer lists
                const formattedArtworks: HeaderItem[] = (artResults || []).slice(0, 50).map((art: SearchableArtwork) => ({
                    id: art.id,
                    type: 'artwork',
                    name: art.name,
                    image: art.image,
                    subtext: art.artist
                }));

                // Formatting Artists
                const formattedArtists: HeaderItem[] = (artists || []).slice(0, 3).map((a: any) => ({
                    id: `artist-${a.artist}`, // unique id
                    type: 'artist',
                    name: a.artist,
                    subtext: `${a.count} artworks`
                }));

                setResults(prev => {
                    // Combine worker results with existing local results (museums/exhibitions)
                    // We prioritize Artists/Artworks from worker, appending them to Museum results
                    const combined = [...prev, ...formattedArtists, ...formattedArtworks];

                    // Remove duplicates
                    const unique = combined.filter((item, index, self) =>
                        index === self.findIndex((t) => (
                            t.id === item.id
                        ))
                    );
                    return unique;
                });
                setIsLoading(false);
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

        if (!query || query.length < 2) {
            setResults([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);

        // 1. Search Museums & Exhibitions (Local Data)
        const lowerQ = query.toLowerCase();
        const localResults: HeaderItem[] = [];
        const addedIds = new Set<string>();

        exhibitions.forEach(museum => {
            const mName = museum.name.toLowerCase();
            const matchesMuseum = mName.includes(lowerQ);

            // Match Museum Name
            if (matchesMuseum) {
                if (!addedIds.has(museum.id)) {
                    localResults.push({
                        id: museum.id,
                        type: 'museum',
                        name: museum.name,
                        image: museum.representativeImage,
                        subtext: museum.location
                    });
                    addedIds.add(museum.id);
                }

                // If museum matches, include ALL its exhibitions visually below it
                if (museum.permanentExhibitions) {
                    museum.permanentExhibitions.forEach(exh => {
                        if (!addedIds.has(exh.id)) {
                            localResults.push({
                                id: exh.id,
                                type: 'exhibition',
                                name: exh.name || (exh as any).title,
                                subtext: `${museum.name} (소속 전시)`,
                                image: exh.image
                            });
                            addedIds.add(exh.id);
                        }
                    });
                }
            }

            // Also check individual exhibitions (even if museum matched, we already added them above, but if museum didn't match, we add matching ones here)
            // Since we use addedIds, duplicates are formatted away, but above block adds ALL if museum matches.
            // If museum does NOT match, we only add matching exhibitions.
            if (!matchesMuseum && museum.permanentExhibitions) {
                museum.permanentExhibitions.forEach(exh => {
                    const eName = (exh.name || (exh as any).title || '').toLowerCase();
                    if (!addedIds.has(exh.id) && eName.includes(lowerQ)) {
                        localResults.push({
                            id: exh.id,
                            type: 'exhibition',
                            name: exh.name || (exh as any).title,
                            subtext: museum.name,
                            image: exh.image
                        });
                        addedIds.add(exh.id);
                    }
                });
            }
        });

        setResults(localResults);

        // 2. Search Artworks & Artists (Worker)
        ensureWorker();
        workerRef.current?.postMessage({ type: 'SEARCH', query });

    }, [query]);

    const renderLoadingRow = (alignment: 'center' | 'flex-start' = 'center') => (
        <div style={{
            padding: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: alignment,
            gap: '8px',
            fontSize: '13px',
            color: '#666'
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
            <span>작가/작품 결과를 불러오는 중...</span>
        </div>
    );

    return (
        <div style={{ position: 'relative', width: '100%', maxWidth: '600px' }}>
            {selectedItem ? (
                <div style={{
                    padding: '12px',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#f9f9f9'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {selectedItem.image && (
                            <img src={getOptimizedImageUrl(selectedItem.image, 100)} alt="" style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover' }} />
                        )}
                        <div>
                            <div style={{ fontWeight: 'bold' }}>{selectedItem.name}</div>
                            <div style={{ fontSize: '12px', color: '#666', textTransform: 'capitalize' }}>
                                {selectedItem.type} {selectedItem.subtext ? `• ${selectedItem.subtext}` : ''}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            onSelect(null as any);
                            setQuery('');
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}
                    >
                        ×
                    </button>
                </div>
            ) : (
                <>
                    <input
                        type="text"
                        placeholder="머릿글 설정 (박물관, 작가, 작품 검색)"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setTimeout(() => setIsFocused(false), 200)} // Delay to allow click
                        style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid #ccc',
                            fontSize: '16px'
                        }}
                    />
                    {isFocused && (query.length > 1) && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            background: 'white',
                            border: '1px solid #ddd',
                            borderRadius: '8px',
                            marginTop: '4px',
                            maxHeight: '400px', // Increased max height
                            overflowY: 'auto',
                            zIndex: 100,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                        }}>
                            {results.length === 0 && (
                                <>
                                    {isLoading && renderLoadingRow()}
                                    {!isLoading && <div style={{ padding: '12px', textAlign: 'center' }}>No results found</div>}
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
                                        borderBottom: '1px solid #eee'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                                >
                                    {/* Type Badge */}
                                    <div style={{
                                        fontSize: '10px',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        background: item.type === 'museum' ? '#e3f2fd' : item.type === 'artist' ? '#f3e5f5' : item.type === 'exhibition' ? '#e0f2f1' : '#fbe9e7',
                                        color: '#333',
                                        textTransform: 'uppercase',
                                        minWidth: '60px',
                                        textAlign: 'center',
                                        flexShrink: 0
                                    }}>
                                        {item.type}
                                    </div>

                                    {item.image ? (
                                        <img src={getOptimizedImageUrl(item.image, 100)} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                                    ) : (
                                        <div style={{ width: 32, height: 32, background: '#eee', borderRadius: 4, flexShrink: 0 }} />
                                    )}

                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                                        {item.subtext && <div style={{ fontSize: '11px', color: '#888' }}>{item.subtext}</div>}
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
