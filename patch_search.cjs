const fs = require('fs');

const filePath = 'src/components/GlobalSearchBar.tsx';
let source = fs.readFileSync(filePath, 'utf8');

if (!source.includes("import '../styles/ArtistGallery.css';")) {
    source = source.replace("import ArtistWikiPanel from './ArtistWikiPanel';", "import ArtistWikiPanel from './ArtistWikiPanel';\nimport '../styles/ArtistGallery.css';");
}

const startMarker = '{artistGallery && createPortal(';
const startIndex = source.indexOf(startMarker);
if (startIndex === -1) {
    console.error("Could not find start marker");
    process.exit(1);
}

let braceCount = 0;
let parenCount = 0;
let endIndex = startIndex;
let started = false;

for (let i = startIndex; i < source.length; i++) {
    const char = source[i];
    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
    if (char === '(') parenCount++;
    if (char === ')') parenCount--;

    if (braceCount > 0 || parenCount > 0) started = true;

    if (started && braceCount === 0 && parenCount === 0) {
        endIndex = i;
        break;
    }
}

const newJSX = `{artistGallery && createPortal(
    (() => {
        const isDark = galleryTheme === 'dark';
        const bg = isDark ? '#080807' : '#f7f4ef';
        return (
            <div 
                className="artist-page" 
                data-theme={galleryTheme}
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
                    className="artist-page__frame"
                    style={{
                        width: '100%',
                        maxWidth: 1400,
                        display: 'flex',
                        flexDirection: 'column',
                        ...(isMobile ? { height: '100%', borderRadius: 0, border: 'none' } : {}),
                    }}
                >
                    <div className="artist-hero">
                        <div className="artist-hero__eyebrow">
                            <div className="artist-hero__tag-group">
                                <span className="artist-hero__tag artist-hero__tag--primary">Artist Collection</span>
                                <span className="artist-hero__tag artist-hero__tag--ghost">Global Data</span>
                            </div>
                            <div className="artist-hero__controls">
                                <button
                                    className="artist-hero__icon-btn"
                                    style={{
                                        width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--ap-border)',
                                        background: 'var(--ap-surface-2)', color: 'var(--ap-text-3)', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}
                                    onClick={() => setGalleryTheme(t => t === 'dark' ? 'light' : 'dark')}
                                    title={isDark ? 'Switch to light' : 'Switch to dark'}
                                >
                                    {isDark ? '☀' : '☾'}
                                </button>
                                <button 
                                    className="artist-hero__icon-btn" 
                                    onClick={closeArtistGallery}
                                    style={{
                                        width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--ap-border)',
                                        background: 'var(--ap-surface-2)', color: 'var(--ap-text-3)', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}
                                >✕</button>
                            </div>
                        </div>

                        <h2 className="artist-hero__name" style={{ gap: 20, display: 'flex', alignItems: 'center', margin: '0 0 30px', fontSize: 'clamp(3.2rem, 8vw, 6.5rem)' }}>
                            {artistGallery.artist}
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <HeartOverlay
                                    isLiked={artistGalleryIsLiked}
                                    onToggle={toggleLikeArtist}
                                    size={isMobile ? 32 : 48}
                                    color="#e11d48"
                                    emptyColor="CurrentColor"
                                />
                            </div>
                        </h2>

                        <div className="artist-hero__footer">
                            <span className="artist-hero__count"><strong>{artistGallery.artworks.length.toLocaleString()}</strong> works in collection</span>
                        </div>
                    </div>

                    <div className="artist-profile">
                        <div className="artist-bio">
                            <h3 className="artist-bio__label">Biography</h3>
                            <ArtistWikiPanel
                                artistName={artistGallery.artist}
                                imageUrl={undefined}
                                fallbackDescription={artistFallbackDescription}
                            />
                        </div>
                        <div className="artist-map-col">
                            <h3 className="artist-map-col__label">Museum Distribution</h3>
                            <Suspense fallback={<div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading map…</div>}>
                                <div style={{ height: 400, width: '100%', position: 'relative' }}>
                                    <ArtistDistributionMap artworks={artistGallery.artworks as any} isDark={isDark} />
                                </div>
                            </Suspense>
                        </div>
                    </div>

                    <div className="artist-gallery">
                        {galleryCategories.length >= 1 && (
                            <div className="artist-filters">
                                <button
                                    className={\`artist-filter-btn \${!galleryCategory ? 'artist-filter-btn--active' : ''}\`}
                                    onClick={() => setGalleryCategory(null)}
                                >
                                    All · {artistGallery!.artworks.length.toLocaleString()}
                                </button>
                                {galleryCategories.map(({ cat, cnt }) => {
                                    const active = galleryCategory === cat;
                                    return (
                                        <button
                                            key={cat}
                                            className={\`artist-filter-btn \${active ? 'artist-filter-btn--active' : ''}\`}
                                            onClick={() => setGalleryCategory(active ? null : cat)}
                                        >
                                            {cat} · {cnt.toLocaleString()}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        <div className="artist-gallery__grid" style={{
                            padding: isMobile ? '12px' : '40px 5vw',
                            background: 'var(--ap-bg)',
                            display: 'flex', gap: isMobile ? 10 : 20, alignItems: 'flex-start'
                        }}>
                            {artistGalleryColumns.map((column, columnIdx) => (
                                <div key={\`artist-column-\${columnIdx}\`} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: isMobile ? 10 : 20 }}>
                                    {column.map((art, idx) => {
                                        const yearLabel = formatArtworkYear(art.date);
                                        const displayTitle = yearLabel ? \`\${art.name} (\${yearLabel})\` : art.name;
                                        const museumCountry = museumCountryMap.get(art.museumName) || '';
                                        const museumDisplay = museumCountry ? \`\${art.museumName} (\${museumCountry})\` : art.museumName;
                                        return (
                                            <div
                                                key={art.id || \`art-\${columnIdx}-\${idx}\`}
                                                className="artist-gallery__card"
                                                onClick={() => handleSelectArtwork(art)}
                                                onMouseEnter={() => setHoveredArtworkId(art.id)}
                                                onMouseLeave={() => setHoveredArtworkId((prev) => (prev === art.id ? null : prev))}
                                            >
                                                <div className="artist-gallery__img-wrap" style={{ position: 'relative', width: '100%', background: 'var(--ap-surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                                                    <img
                                                        src={getOptimizedImageUrl(art.image, 600)}
                                                        loading="lazy"
                                                        alt={art.name}
                                                        referrerPolicy="no-referrer"
                                                        onError={handleImageError}
                                                        style={{ width: '100%', display: 'block', padding: '4%', objectFit: 'contain' }}
                                                    />
                                                    <div className="artist-gallery__card-actions" style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6, opacity: hoveredArtworkId === art.id ? 1 : 0, transition: 'opacity 0.2s' }}>
                                                        <div
                                                            className="artist-gallery__card-btn"
                                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setProductArtwork(art); }}
                                                            title="Purchase"
                                                            style={{
                                                                background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, cursor: 'pointer', color: '#fff'
                                                            }}
                                                        >
                                                            <svg width={isMobile ? 13 : 15} height={isMobile ? 13 : 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                                                <rect x="7" y="7" width="10" height="10" />
                                                            </svg>
                                                        </div>
                                                        <div style={{
                                                            background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, backdropFilter: 'blur(4px)'
                                                        }}>
                                                            <HeartOverlay
                                                                isLiked={likedArtworks.has(art.id)}
                                                                onToggle={(e) => toggleLikeArtwork(e, art)}
                                                                style={{ padding: 0, margin: 0 }}
                                                                size={isMobile ? 13 : 15}
                                                                color="#e11d48"
                                                                emptyColor="#fff"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="artist-gallery__card-info" style={{ padding: '16px 0' }}>
                                                    <h4 className="artist-gallery__card-title" style={{ margin: '0 0 6px 0', fontSize: '0.95rem', fontWeight: 500, color: 'var(--ap-text)' }}>{displayTitle}</h4>
                                                    <p className="artist-gallery__card-subtitle" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--ap-text-3)' }}>{museumDisplay}</p>
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
)}`;

source = source.substring(0, startIndex) + newJSX + source.substring(endIndex + 1);
fs.writeFileSync(filePath, source, 'utf8');
console.log("Patched successfully!");