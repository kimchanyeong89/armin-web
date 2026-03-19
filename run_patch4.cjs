const fs = require('fs');

let content = fs.readFileSync('src/components/GlobalSearchBar.tsx', 'utf8');

const modalStart = content.indexOf('{/* Artist Gallery Modal */}');
const modalEndText = '                );\n            })()}\n        </>\n    );\n}';
const modalEnd = content.indexOf(modalEndText);

if (modalStart === -1 || modalEnd === -1) {
    console.log("Could not find boundaries");
    console.log("modalStart: ", modalStart);
    console.log("modalEnd: ", modalEnd);
    process.exit(1);
}

const replacement = `{/* Artist Gallery Modal */}
            {artistGallery && createPortal(
                (() => {
                    const isDark = galleryTheme === 'dark';
                    return (
                        <div
                            className="artist-gallery-overlay"
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
                                className="artist-page"
                                data-theme={galleryTheme}
                                onClick={e => e.stopPropagation()}
                                ref={galleryContainerRef as any}
                                style={{
                                    width: '100%',
                                    maxWidth: 1200,
                                    margin: '0 auto',
                                    ...(isMobile ? { height: '100%', borderRadius: 0 } : { marginBottom: 40, borderRadius: 16 }),
                                    overflow: 'auto',
                                    position: 'relative'
                                }}
                            >
                                {/* ── HERO ──────────────────────────────────────────────────────── */}
                                <header className="artist-hero">
                                    <div className="artist-hero__eyebrow">
                                    <span className="artist-hero__tag">Artist</span>
                                    <span className="artist-hero__meta">
                                        {artistGallery.artist}
                                    </span>
                                    <div className="artist-hero__controls">
                                        <button
                                            className="artist-hero__theme-btn"
                                            onClick={() => setGalleryTheme(t => t === 'dark' ? 'light' : 'dark')}
                                            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                                            title={isDark ? 'Light mode' : 'Dark mode'}
                                        >
                                        {isDark ? '☀' : '☾'}
                                        </button>
                                        <button
                                            className="artist-hero__theme-btn"
                                            onClick={closeArtistGallery}
                                            aria-label="Close gallery"
                                            title="Close"
                                            style={{ marginLeft: 8 }}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                        <h1 className="artist-hero__name">{artistGallery.artist}</h1>
                                        <HeartOverlay
                                            isLiked={artistGalleryIsLiked}
                                            onToggle={toggleLikeArtist}
                                            size={isMobile ? 24 : 32}
                                            color="#e11d48"
                                            emptyColor={isDark ? '#8a8075' : '#6b6560'}
                                        />
                                    </div>

                                    <div className="artist-hero__footer">
                                    <span className="artist-hero__count">
                                        <strong>{artistGallery.artworks.length.toLocaleString()}</strong> works in collection
                                    </span>
                                    <a
                                        href={"https://en.wikipedia.org/wiki/" + encodeURIComponent(artistGallery.artist.replace(/ /g, '_'))}
                                        className="artist-hero__wiki-link"
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        Wikipedia
                                        <ExternalLinkIcon />
                                    </a>
                                    </div>
                                </header>

                                {/* ── BIO + MAP ─────────────────────────────────────────────────── */}
                                <section className="artist-profile">
                                    {/* Bio */}
                                    <div className="artist-bio">
                                        <p className="artist-bio__label">Infinite Wiki</p>
                                        <ArtistWikiPanel
                                            artistName={artistGallery.artist}
                                            imageUrl={undefined}
                                            fallbackDescription={artistFallbackDescription}
                                        />
                                    </div>

                                    {/* Map */}
                                    <div className="artist-map-col">
                                        <p className="artist-map-col__label">Global Distribution</p>
                                        {!isMobile && artistGallery.artworks.length > 0 && (
                                            <ArtistDistributionMap artworks={artistGallery.artworks} isDark={isDark} />
                                        )}
                                        {isMobile && artistGallery.artworks.length > 0 && (
                                            <div style={{ minHeight: 400 }}>
                                                <ArtistDistributionMap artworks={artistGallery.artworks} isDark={isDark} />
                                            </div>
                                        )}
                                    </div>
                                </section>

                                {/* ── GALLERY ───────────────────────────────────────────────────── */}
                                <section className="artist-gallery">
                                    <div className="artist-gallery__header" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                                        <span className="artist-gallery__header-count">
                                            {filteredGalleryArtworks.length.toLocaleString()}
                                        </span>
                                        <span className="artist-gallery__header-label">
                                            {filteredGalleryArtworks.length === 1 ? 'work' : 'works'}
                                        </span>
                                        <div className="artist-gallery__divider" />
                                    </div>

                                    <div style={{ padding: '0 20px', marginBottom: 20 }}>
                                        <div className="artist-gallery__filters">
                                            <div className="artist-gallery__category-scroll">
                                                {['All', ...galleryCategories].map(cat => (
                                                    <button
                                                        key={cat}
                                                        onClick={() => setGallerySelectedCategory(cat)}
                                                        className={"artist-gallery__category-btn" + (gallerySelectedCategory === cat ? ' active' : '')}
                                                    >
                                                        {cat}
                                                    </button>
                                                ))}
                                            </div>
                                            
                                            <select
                                                value={gallerySortBy}
                                                onChange={(e) => setGallerySortBy(e.target.value as any)}
                                                className="artist-gallery__sort-select"
                                            >
                                                <option value="year-asc">Oldest to Newest</option>
                                                <option value="year-desc">Newest to Oldest</option>
                                                <option value="name-asc">A to Z</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="artist-gallery__grid">
                                        {paginatedGalleryArtworks.length === 0 ? (
                                            <div className="artist-gallery__empty">
                                                <div className="artist-gallery__empty-icon">◻</div>
                                                <p>아직 등록된 작품이 없습니다.</p>
                                            </div>
                                        ) : (
                                            paginatedGalleryArtworks.map((artwork: any) => (
                                                <article
                                                    key={artwork.id}
                                                    className="artist-gallery__card"
                                                    onClick={() => !disableInteractions && openDossier(artwork)}
                                                >
                                                    <div className="artist-gallery__img-wrap">
                                                        <img
                                                            src={artwork.image}
                                                            alt={artwork.name}
                                                            loading="lazy"
                                                            draggable={false}
                                                        />
                                                    </div>

                                                    <button
                                                        className={"artist-gallery__like-btn" + (likedArtworksMap.has(artwork.artworkId || artwork.id) ? " liked" : "")}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleLike(artwork);
                                                        }}
                                                        aria-label="Like"
                                                    >
                                                        {likedArtworksMap.has(artwork.artworkId || artwork.id) ? '♥' : '♡'}
                                                    </button>

                                                    <div className="artist-gallery__info">
                                                        <h3 className="artist-gallery__art-title">{artwork.name}</h3>
                                                        <p className="artist-gallery__art-year">{artwork.year || 'Unknown year'}</p>
                                                        <p className="artist-gallery__art-museum">
                                                            {artwork.museum || artwork.museumName || artwork.exhibitionTitle || ''}
                                                        </p>
                                                    </div>
                                                </article>
                                            ))
                                        )}
                                    </div>

                                    {paginatedGalleryArtworks.length > 0 && Math.ceil(filteredGalleryArtworks.length / GALLERY_ITEMS_PER_PAGE) > 1 && (
                                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 40, marginBottom: 40 }}>
                                            <button
                                                onClick={() => {
                                                    galleryContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                                                    setGalleryCurrentPage(Math.max(1, galleryCurrentPage - 1));
                                                }}
                                                disabled={galleryCurrentPage === 1}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: isDark ? 'white' : 'black',
                                                    opacity: galleryCurrentPage === 1 ? 0.3 : 1,
                                                    cursor: galleryCurrentPage === 1 ? 'default' : 'pointer',
                                                    padding: '8px 16px',
                                                    fontFamily: 'inherit',
                                                    fontSize: 16
                                                }}
                                            >
                                                &larr; Prev
                                            </button>
                                            <span style={{
                                                padding: '8px 16px',
                                                color: isDark ? 'white' : 'black',
                                                fontFamily: 'inherit',
                                                fontSize: 16
                                            }}>
                                                Page {galleryCurrentPage} of {Math.ceil(filteredGalleryArtworks.length / GALLERY_ITEMS_PER_PAGE)}
                                            </span>
                                            <button
                                                onClick={() => {
                                                    galleryContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                                                    setGalleryCurrentPage(Math.min(Math.ceil(filteredGalleryArtworks.length / GALLERY_ITEMS_PER_PAGE), galleryCurrentPage + 1));
                                                }}
                                                disabled={galleryCurrentPage === Math.ceil(filteredGalleryArtworks.length / GALLERY_ITEMS_PER_PAGE)}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: isDark ? 'white' : 'black',
                                                    opacity: galleryCurrentPage === Math.ceil(filteredGalleryArtworks.length / GALLERY_ITEMS_PER_PAGE) ? 0.3 : 1,
                                                    cursor: galleryCurrentPage === Math.ceil(filteredGalleryArtworks.length / GALLERY_ITEMS_PER_PAGE) ? 'default' : 'pointer',
                                                    padding: '8px 16px',
                                                    fontFamily: 'inherit',
                                                    fontSize: 16
                                                }}
                                            >
                                                Next &rarr;
                                            </button>
                                        </div>
                                    )}
                                </section>
                            </div>
                        </div>`;

const newContent = content.substring(0, modalStart) + replacement + content.substring(modalEnd);
fs.writeFileSync('src/components/GlobalSearchBar.tsx', newContent);
console.log("Patched correctly");
