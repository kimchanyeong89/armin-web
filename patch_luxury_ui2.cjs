const fs = require('fs');

let code = fs.readFileSync('src/components/GlobalSearchBar.tsx', 'utf8');

const sIdx = code.indexOf('{/* Artist Gallery Modal */}');
const eIdx = code.indexOf('{/* POD Product Purchase Modal */}');
if (sIdx === -1 || eIdx === -1) {
    console.log("Could not find delimiters.");
    process.exit(1);
}

const beforeCode = code.substring(0, sIdx);
const afterCode = code.substring(eIdx);

const newModalCode = `{/* Artist Gallery Modal */}
            {artistGallery && createPortal(
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 14000,
                    background: '#0a0a0a',
                    color: '#fff',
                    overflowY: 'auto',
                    fontFamily: "'Inter', sans-serif"
                }}>
                    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                        {/* Top Navbar */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: isMobile ? '20px' : '40px 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ border: '1px solid #b89c6a', color: '#b89c6a', padding: '4px 12px', fontSize: '11px', letterSpacing: '2px', fontWeight: 600 }}>ARTIST</div>
                                <div style={{ color: '#555', fontSize: '11px', letterSpacing: '2px', fontWeight: 600 }}>ARTIST</div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button onClick={() => setArtistGallery(null)} style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#111', border: '1px solid #222', color: '#555', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>
                        </div>

                        {/* Title Section */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', padding: isMobile ? '0 20px' : '0' }}>
                            <h1 style={{ 
                                margin: 0, 
                                fontSize: isMobile ? '48px' : '96px', 
                                fontFamily: "'Playfair Display', serif", 
                                fontWeight: 400, 
                                lineHeight: 1.1,
                                letterSpacing: '-2px'
                            }}>
                                {artistGallery.artist.split(' ').map((word, i, arr) => (
                                    <span key={i}>
                                        {word}{i !== arr.length - 1 && <br />}
                                    </span>
                                ))}
                            </h1>
                        </div>

                        <div style={{ display: 'flex', gap: '24px', alignItems: 'center', marginBottom: '60px', padding: isMobile ? '0 20px' : '0' }}>
                            <div style={{ fontSize: '11px', letterSpacing: '2px', fontWeight: 600, color: '#888' }}>
                                {artistArtworks.length} WORKS IN COLLECTION
                            </div>
                            <a href={\`https://en.wikipedia.org/wiki/\${encodeURIComponent(artistGallery.artist)}\`} target="_blank" rel="noreferrer" style={{ fontSize: '11px', letterSpacing: '2px', fontWeight: 600, color: '#b89c6a', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                WIKIPEDIA <span style={{fontSize: '12px'}}>↗</span>
                            </a>
                        </div>

                        {/* Middle Section: Wiki & Map */}
                        <div style={{ 
                            display: 'flex', 
                            flexDirection: isMobile ? 'column' : 'row', 
                            gap: isMobile ? '40px' : '80px',
                            borderBottom: '1px solid #1a1a1a', 
                            borderTop: '1px solid #1a1a1a', 
                            padding: isMobile ? '40px 20px' : '40px 0',
                            marginBottom: '40px' 
                        }}>
                            {/* INFINITE WIKI */}
                            <div style={{ flex: 1 }}>
                                <h3 style={{ fontSize: '11px', letterSpacing: '2px', color: '#b89c6a', marginBottom: '24px', fontWeight: 600, margin: '0 0 24px 0' }}>INFINITE WIKI</h3>
                                <div style={{ fontSize: isMobile ? '16px' : '16px', lineHeight: 1.8, color: '#aaa', maxWidth: '400px' }}>
                                    <span style={{ 
                                        background: 'rgba(184, 156, 106, 0.4)', 
                                        color: '#fff', 
                                        padding: '4px 0',
                                        lineHeight: 2.2,
                                        WebkitBoxDecorationBreak: 'clone',
                                        boxDecorationBreak: 'clone'
                                    }}>
                                        {artistGallery.artist} was a prominent artist featured in our collections. Known for major contributions to art history, exploring deep emotional themes with vivid execution.
                                    </span>
                                </div>
                                <div style={{ marginTop: '40px', border: '1px solid #222', padding: '12px 16px', display: 'flex', alignItems: 'center', color: '#555', fontSize: '12px' }}>
                                    <span style={{ fontFamily: 'monospace' }}>| {artistGallery.artist}</span>
                                </div>
                            </div>
                            
                            {/* GLOBAL DISTRIBUTION */}
                            <div style={{ flex: 1, borderLeft: isMobile ? 'none' : '1px solid #1a1a1a', paddingLeft: isMobile ? '0' : '80px' }}>
                                <h3 style={{ fontSize: '11px', letterSpacing: '2px', color: '#b89c6a', marginBottom: '24px', fontWeight: 600, margin: '0 0 24px 0' }}>GLOBAL DISTRIBUTION</h3>
                                <div style={{ position: 'relative', height: '220px', background: 'transparent', marginBottom: '24px', overflow: 'hidden' }}>
                                    {/* Mock Map Background Outline - highly stylized */}
                                    <div style={{ position: 'absolute', inset: 0, opacity: 0.15, backgroundImage: 'url(https://upload.wikimedia.org/wikipedia/commons/8/80/World_map_-_low_resolution.svg)', backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', filter: 'brightness(0) invert(1)' }}></div>
                                    <div style={{ position: 'absolute', top: '40%', left: '40%', background: '#b89c6a', color: '#000', fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>22</div>
                                    <div style={{ position: 'absolute', top: '45%', left: '45%', background: '#b89c6a', color: '#000', fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>7</div>
                                    <div style={{ position: 'absolute', top: '50%', left: '35%', background: '#b89c6a', color: '#000', fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>5</div>
                                </div>
                                
                                <div>
                                    <h4 style={{ fontSize: '10px', letterSpacing: '2px', color: '#555', borderBottom: '1px solid #1a1a1a', paddingBottom: '12px', margin: '0 0 12px 0' }}>TOP MUSEUMS</h4>
                                    {Array.from(new Set(artistArtworks.filter(a => a.museumName).map(a => a.museumName))).slice(0, 5).map((m, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #1a1a1a', fontSize: '12px', color: '#aaa' }}>
                                            <span>{m}</span>
                                            <span style={{ color: '#b89c6a' }}>{artistArtworks.filter(a => a.museumName === m).length}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Bottom Section: Categories & Masonry */}
                        <div style={{ padding: isMobile ? '0 20px 40px' : '0 0 60px 0' }}>
                            {/* Categories Row */}
                            <div style={{ 
                                display: 'flex', 
                                gap: '12px', 
                                overflowX: 'auto', 
                                marginBottom: '40px',
                                paddingBottom: '8px',
                                WebkitOverflowScrolling: 'touch',
                                msOverflowStyle: 'none',
                                scrollbarWidth: 'none'
                             }}>
                                <button style={{ 
                                    background: '#b89c6a', 
                                    color: '#0a0a0a', 
                                    border: 'none', 
                                    padding: '8px 20px', 
                                    borderRadius: '20px', 
                                    fontSize: '13px', 
                                    fontWeight: 600, 
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap'
                                }}>
                                    All · {artistArtworks.length}
                                </button>
                                {Array.from(new Set(artistArtworks.filter(a => a.museumName).map(a => a.museumName))).slice(0, 6).map((mName, i) => {
                                    const count = artistArtworks.filter(a => a.museumName === mName).length;
                                    return (
                                        <button key={i} style={{ 
                                            background: 'transparent', 
                                            color: '#888', 
                                            border: '1px solid #333', 
                                            padding: '8px 20px', 
                                            borderRadius: '20px', 
                                            fontSize: '13px', 
                                            cursor: 'pointer', 
                                            transition: 'all 0.2s',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {mName} · {count}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Masonry Grid */}
                            <div style={{ 
                                columnCount: isMobile ? 2 : 4, 
                                columnGap: '24px' 
                            }}>
                                {artistArtworks.map((art, idx) => (
                                    <div key={idx} 
                                        style={{ breakInside: 'avoid', marginBottom: '32px', cursor: 'pointer' }} 
                                        onClick={(e) => { e.stopPropagation(); setProductArtwork(art); }}
                                    >
                                        <img src={art.image} alt={art.name} style={{ width: '100%', borderRadius: '6px', display: 'block', marginBottom: '16px', objectFit: 'cover' }} />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ paddingRight: '12px' }}>
                                                <h4 style={{ color: '#fff', fontSize: '15px', margin: '0 0 6px 0', fontWeight: 600, lineHeight: 1.4 }}>{art.name}</h4>
                                                <p style={{ color: '#666', fontSize: '13px', margin: 0, lineHeight: 1.4 }}>{art.museumName}</p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', color: '#555', flexShrink: 0 }}>
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
`;

fs.writeFileSync('src/components/GlobalSearchBar.tsx', beforeCode + newModalCode + afterCode);
console.log("Patched correctly!");
