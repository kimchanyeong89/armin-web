const fs = require('fs');
let code = fs.readFileSync('src/pages/ArtistPage.tsx', 'utf8');

const returnStarts = code.indexOf('  return (');
const codeBeforeReturn = code.substring(0, returnStarts);

const newRenderCode = `  const [activeFilter, setActiveFilter] = useState('All');

  const filterOptions = useMemo(() => {
    const filters = [{ label: 'All', count: artistArtworks.length }];
    
    const museums = new Map();
    const categories = new Map();
    
    artistArtworks.forEach(aw => {
      if (aw.museum) {
        museums.set(aw.museum, (museums.get(aw.museum) || 0) + 1);
      }
      let cat = 'Painting'; // default
      const mediumStr = (aw.mediumInfo || aw.medium || '').toLowerCase();
      if (mediumStr.includes('draw') || mediumStr.includes('pencil') || mediumStr.includes('ink')) cat = 'Drawing';
      if (mediumStr.includes('sculpt') || mediumStr.includes('bronze')) cat = 'Sculpture';
      categories.set(cat, (categories.get(cat) || 0) + 1);
    });
    
    const sortedMuseums = Array.from(museums.entries()).sort((a,b) => b[1]-a[1]).map(e => ({ label: e[0], count: e[1] }));
    const sortedCategories = Array.from(categories.entries()).sort((a,b) => b[1]-a[1]).map(e => ({ label: e[0], count: e[1] }));
    
    const mixed = [];
    if (sortedMuseums[0]) mixed.push(sortedMuseums[0]);
    if (sortedCategories[0]) mixed.push(sortedCategories[0]);
    if (sortedMuseums[1]) mixed.push(sortedMuseums[1]);
    if (sortedMuseums[2]) mixed.push(sortedMuseums[2]);
    if (sortedMuseums[3]) mixed.push(sortedMuseums[3]);
    if (sortedMuseums[4]) mixed.push(sortedMuseums[4]);
    
    return [...filters, ...mixed].slice(0, 10);
  }, [artistArtworks]);

  const filteredArtworks = useMemo(() => {
    if (activeFilter === 'All') return artistArtworks;
    return artistArtworks.filter(aw => {
      if (aw.museum === activeFilter) return true;
      let cat = 'Painting';
      const mediumStr = (aw.mediumInfo || aw.medium || '').toLowerCase();
      if (mediumStr.includes('draw') || mediumStr.includes('pencil') || mediumStr.includes('ink')) cat = 'Drawing';
      if (mediumStr.includes('sculpt') || mediumStr.includes('bronze')) cat = 'Sculpture';
      if (cat === activeFilter) return true;
      return false;
    });
  }, [activeFilter, artistArtworks]);

  return (
    <div className="artist-page" data-theme={theme}>
      <div className="artist-page__frame">
        {/* ── HERO ──────────────────────────────────────────────────────── */}
        <header className="artist-hero">
          <div className="artist-hero__eyebrow">
            <div className="artist-hero__tag-group">
              <div className="artist-hero__tag artist-hero__tag--primary">ARTIST</div>
              <div className="artist-hero__tag artist-hero__tag--ghost">ARTIST</div>
            </div>
            
            <div className="artist-hero__controls">
              <button
                className="artist-hero__icon-btn"
                onClick={toggleTheme}
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                title={isDark ? 'Light mode' : 'Dark mode'}
              >
                {isDark ? '☀' : '☾'}
              </button>
              <button
                className="artist-hero__icon-btn"
                onClick={() => navigate(-1)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>

          <h1 className="artist-hero__name">
            {artist.name} <span className="artist-hero__heart">♡</span>
          </h1>

          <div className="artist-hero__footer">
            <div className="artist-hero__count">
              <strong>{artistArtworks.length}</strong> WORKS IN COLLECTION
            </div>
            {wikiSourceUrl && (
              <a
                href={wikiSourceUrl}
                className="artist-hero__wiki-link"
                target="_blank"
                rel="noreferrer"
              >
                WIKIPEDIA ↗
              </a>
            )}
          </div>
        </header>

        {/* ── BIO + MAP ─────────────────────────────────────────────────── */}
        <section className="artist-profile">
          <div className="artist-bio">
            <p className="artist-bio__label">INFINITE WIKI</p>
            {wikiLoading && !wikiSummary ? (
              <p className="artist-bio__loading">Loading biography…</p>
            ) : (
              <p className="artist-bio__text">
                {wikiSummary || artist.description}
              </p>
            )}
            {wikiError && <p className="artist-bio__error">{wikiError}</p>}

            {(asciiArt || fallbackAscii) && (
              <pre
                className="artist-bio__ascii"
                aria-label={\`\${artist.name} ascii art\`}
              >
                {asciiArt || fallbackAscii}
              </pre>
            )}
          </div>

          <div className="artist-map-col">
            <p className="artist-map-col__label">GLOBAL DISTRIBUTION</p>
            <div className="artist-map-col__map-wrapper">
               <ArtistDistributionMap artworks={artistArtworks} isDark={isDark} />
            </div>
          </div>
        </section>

        {/* ── GALLERY ───────────────────────────────────────────────────── */}
        <section className="artist-gallery">
          <div className="artist-filters">
            {filterOptions.map((opt, i) => (
              <button
                key={i}
                className={\`artist-filter-btn \${activeFilter === opt.label ? 'artist-filter-btn--active' : ''}\`}
                onClick={() => setActiveFilter(opt.label)}
              >
                {opt.label} · {opt.count}
              </button>
            ))}
          </div>

          <div className="artist-gallery__grid" ref={gridRef}>
            {filteredArtworks.length === 0 ? (
              <div className="artist-gallery__empty">
                <div className="artist-gallery__empty-icon">◻</div>
                <p>아직 등록된 작품이 없습니다.</p>
              </div>
            ) : (
              filteredArtworks.map((aw, i) => {
                const imgKey = aw.image_url ?? aw.images?.[0] ?? "";
                let thumbnailUrl = "";
                if (imgKey && imgKey.startsWith("http")) thumbnailUrl = imgKey;
                else if (imgKey) thumbnailUrl = \`https://lh3.googleusercontent.com/d/\${imgKey}=w600\`;

                return (
                  <div
                    key={aw.id || i}
                    className="artist-gallery__card"
                    onClick={() => {
                      if (!isNetworkConstrained) setSelectedArtwork(aw);
                    }}
                  >
                    <div className="artist-gallery__img-wrap">
                      {thumbnailUrl && (
                        <img src={thumbnailUrl} alt={aw.title} loading="lazy" />
                      )}
                      <div className="artist-gallery__card-actions">
                         <button className="artist-gallery__card-btn">◻</button>
                         <button className="artist-gallery__card-btn">♡</button>
                      </div>
                    </div>
                    <div className="artist-gallery__card-info">
                      <h3 className="artist-gallery__card-title">{aw.title} {aw.year}</h3>
                      <p className="artist-gallery__card-subtitle">{aw.museum}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {selectedArtwork && (
        <ArtworkLightbox
          artwork={selectedArtwork}
          initialImageIndex={0}
          onClose={() => setSelectedArtwork(null)}
          isDark={isDark}
          toggleTheme={toggleTheme}
        />
      )}
    </div>
  );
}
`;

fs.writeFileSync('src/pages/ArtistPage.tsx', codeBeforeReturn + newRenderCode);
console.log('Update Complete');
