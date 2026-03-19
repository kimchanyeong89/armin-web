const fs = require('fs');
const FILE_PATH = '/Users/kietzsche/armin-web-main/src/components/GlobalSearchBar.tsx';
let code = fs.readFileSync(FILE_PATH, 'utf8');

const startIndex = code.indexOf('{artistGallery && createPortal(');
const searchEndStr = 'document.body\n            )}';
let endIndex = code.indexOf(searchEndStr, startIndex);

if (startIndex !== -1 && endIndex !== -1) {
    endIndex += searchEndStr.length;
    
    // Check if ArtistWikiPanel exists, if not import it
    if (!code.includes('ArtistWikiPanel')) {
        const importIndex = code.indexOf('import ');
        code = code.slice(0, importIndex) + "import ArtistWikiPanel from './ArtistWikiPanel';\n" + code.slice(importIndex);
    }
    
    const replacement = `{artistGallery && createPortal(
                <div style={{
                    position: 'fixed', inset: 0, zIndex: galleryZIndex,
                    background: '#0a0a0a',
                    color: '#fff',
                    overflowY: 'auto',
                    padding: isMobile ? '20px' : '60px 40px',
                    fontFamily: "'Inter', sans-serif"
                }} onClick={(e) => { e.stopPropagation(); setArtistGallery(null); }}>
                    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                        {/* Tags and Controls */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '60px' }}>
                            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                <div style={{ border: '1px solid #b89c6a', color: '#b89c6a', padding: '4px 10px', fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', borderRadius: '4px', fontWeight: 600 }}>Artist</div>
                                <div style={{ color: '#555', fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 600 }}>Artist</div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#1c1c1c', border: '1px solid #333', color: '#999', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.2s' }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                                </button>
                                <button onClick={() => setArtistGallery(null)} style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#1c1c1c', border: '1px solid #333', color: '#999', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.2s' }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                </button>
                            </div>
                        </div>

                        {/* Title Section */}
                        <div style={{ marginBottom: '60px' }}>
                            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: isMobile ? '48px' : '96px', margin: '0 0 24px 0', fontWeight: 400, display: 'flex', alignItems: 'center', gap: '20px', letterSpacing: '-1px' }}>
                                {artistGallery} 
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                            </h1>
                            <div style={{ display: 'flex', gap: '32px', fontSize: '12px', fontWeight: 700, letterSpacing: '1px' }}>
                                <span style={{ color: '#888' }}>{artistArtworks.length} WORKS IN COLLECTION</span>
                                <a href={\`https://en.wikipedia.org/wiki/\${encodeURIComponent(artistGallery)}\`} target="_blank" rel="noreferrer" style={{ color: '#b89c6a', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    WIKIPEDIA <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17L17 7M7 7h10v10"/></svg>
                                </a>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '300px 1fr', gap: isMobile ? '40px' : '80px', marginBottom: '80px' }}>
                            {/* Left Col */}
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <h3 style={{ color: '#b89c6a', fontSize: '11px', letterSpacing: '2px', fontWeight: 600, margin: '0 0 24px 0', textTransform: 'uppercase' }}>INFINITE WIKI</h3>
                                <div style={{ color: '#ccc', lineHeight: 1.8, fontSize: '15px', margin: '0 0 40px 0', flex: 1, fontFamily: "'Inter', sans-serif" }}>
                                    {/* Using ArtistWikiPanel without standard wrappers to fit the UI seamlessly */}
                                    <div style={{ WebkitMaskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)', maxHeight: '250px', overflow: 'hidden' }}>
                                        <ArtistWikiPanel artistName={artistGallery} hideWrapper={true} />
                                    </div>
                                </div>
                                <div style={{ border: '1px solid #222', borderRadius: '4px', padding: '14px 16px', color: '#666', fontSize: '13px', display: 'flex', alignItems: 'center', background: '#0f0f0f', fontFamily: 'monospace' }}>
                                    <span style={{ borderRight: '1px solid #333', paddingRight: '12px', marginRight: '12px' }}>|</span> {artistGallery}
                                </div>
                            </div>

                            {/* Right Col */}
                            <div style={{ background: '#0a0a0a', padding: isMobile ? '0' : '0 0 0 40px', display: 'flex', flexDirection: 'column', borderLeft: isMobile ? 'none' : '1px solid #1a1a1a' }}>
                                <h3 style={{ color: '#b89c6a', fontSize: '11px', letterSpacing: '2px', fontWeight: 600, margin: '0 0 24px 0', textTransform: 'uppercase' }}>GLOBAL DISTRIBUTION</h3>
                                <div style={{ height: '320px', background: 'url(https://raw.githubusercontent.com/d3/d3-geo/master/img/world.png) center/cover no-repeat', opacity: 0.15, marginBottom: '30px', filter: 'invert(1)' }}></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid #222', paddingBottom: '12px', margin: '0 0 16px 0' }}>
                                    <h4 style={{ color: '#666', fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0 }}>TOP MUSEUMS</h4>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                     {Array.from(new Set(artistArtworks.filter(a => a.museum).map(a => a.museum))).slice(0, 6).map((mName, i) => {
                                        const count = artistArtworks.filter(a => a.museum === mName).length;
                                        return (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #1a1a1a', fontSize: '13px', fontFamily: "'Inter', sans-serif" }}>
                                                <span style={{ color: '#eee' }}>{mName}</span>
                                                <span style={{ color: '#b89c6a', fontWeight: 600 }}>{count}</span>
                                            </div>
                                        );
                                    })}
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '24px' }}>
                                        <div style={{ width: '24px', height: '4px', background: '#b89c6a', borderRadius: '2px' }}></div>
                                        <div style={{ width: '4px', height: '4px', background: '#333', borderRadius: '50%' }}></div>
                                        <div style={{ width: '4px', height: '4px', background: '#333', borderRadius: '50%' }}></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Gallery Section */}
                        <div style={{ borderTop: '1px solid #222', paddingTop: '40px' }}>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '40px' }}>
                                <button style={{ background: '#b89c6a', color: '#0a0a0a', border: '1px solid #b89c6a', padding: '8px 20px', borderRadius: '100px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>All · {artistArtworks.length}</button>
                                {Array.from(new Set(artistArtworks.filter(a => a.museum).map(a => a.museum))).slice(0, 4).map((mName, i) => {
                                    const count = artistArtworks.filter(a => a.museum === mName).length;
                                    return (
                                        <button key={i} style={{ background: 'transparent', color: '#888', border: '1px solid #333', padding: '8px 20px', borderRadius: '100px', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s' }}>{mName} · {count}</button>
                                    );
                                })}
                            </div>

                            <div style={{ columnCount: isMobile ? 2 : 4, columnGap: '24px' }}>
                                {artistArtworks.map((art, idx) => (
                                    <div key={idx} style={{ breakInside: 'avoid', marginBottom: '32px', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setProductArtwork(art); }}>
                                        <img src={art.image} alt={art.name} style={{ width: '100%', borderRadius: '4px', display: 'block', marginBottom: '16px', border: '1px solid #1a1a1a' }} />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ paddingRight: '16px' }}>
                                                <h4 style={{ color: '#fff', fontSize: '14px', margin: '0 0 6px 0', fontWeight: 600, lineHeight: 1.4 }}>{art.name}</h4>
                                                <p style={{ color: '#888', fontSize: '12px', margin: 0, lineHeight: 1.4 }}>{art.museum}</p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', color: '#555', flexShrink: 0 }}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}`;
    
    code = code.slice(0, startIndex) + replacement + code.slice(endIndex);
    fs.writeFileSync(FILE_PATH, code);
    console.log('Success Replace');
} else {
    console.log('Failed to find boundaries');
}
