const fs = require('fs');

let content = fs.readFileSync('src/components/DrawingGlobe.tsx', 'utf-8');

const detailMatch = `      {/* Museum Detail Page */}
      {selectedMuseum && (
        <div style={S.detail}>
          <div style={S.detailHeader}>
            <div style={S.detailLeft}>
              <h1 style={S.detailTitle}>{selectedMuseum.name}</h1>
              <p style={S.detailDesc}>{((selectedMuseum as any).description || '').slice(0, 160)}</p>
              <div style={S.filterRow}>
                {CENTURY_FILTERS.map(f => (
                  <button key={f} onClick={() => setArtworkFilter(f)} style={S.filterBtn(artworkFilter === f)}>
                    {f === 'ALL' ? \`ALL (\${museumArtworks.length})\` : f}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={S.detailRight}>
              <button onClick={() => { setSelectedMuseum(null); setSelectedPointId(null); setMuseumArtworks([]); }} style={S.closeBtn}>
                <span>Close</span>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>`;

const detailReplace = `      {/* Museum Detail Page */}
      {selectedMuseum && (
        <div style={S.detail}>
          {/* Header Row */}
          <div style={{ ...S.detailHeader, paddingBottom: 24, borderBottom: 'none' }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ ...S.detailTitle, marginBottom: 8 }}>{selectedMuseum.name}</h1>
              <p style={{ ...S.detailDesc, maxWidth: 640 }}>{((selectedMuseum as any).description || '')}</p>
            </div>
            <div style={S.detailRight}>
              <button onClick={() => { setSelectedMuseum(null); setSelectedPointId(null); setMuseumArtworks([]); }} style={S.closeBtn}>
                <span>CLOSE</span>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Exhibitions Dossier Section (Drawing Style) */}
          <div style={{ padding: '0 48px 32px 48px', display: 'flex', gap: 40, flexWrap: 'wrap', borderBottom: '3px dashed rgba(17,17,17,0.3)' }}>
             {/* Permanent Exhibitions */}
             {selectedMuseum.permanentExhibitions && selectedMuseum.permanentExhibitions.length > 0 && (
                <div style={{ flex: '1 1 300px' }}>
                   <h3 style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16, borderBottom: '2px solid #111', paddingBottom: 8, display: 'inline-block' }}>PERMANENT EXHIBITIONS</h3>
                   <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                     {selectedMuseum.permanentExhibitions.map((ex: any) => (
                       <article key={ex.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                         <h4 style={{ fontFamily: 'sans-serif', fontSize: 15, fontWeight: 800, textTransform: 'uppercase', lineHeight: 1.2 }}>{ex.title}</h4>
                         <p style={{ fontFamily: 'monospace', fontSize: 11, opacity: 0.8, lineHeight: 1.4 }}>{ex.description}</p>
                       </article>
                     ))}
                   </div>
                </div>
             )}

             {/* Temporary Exhibitions */}
             {selectedMuseum.temporaryExhibitions && selectedMuseum.temporaryExhibitions.length > 0 && (
                <div style={{ flex: '1 1 300px' }}>
                   <h3 style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16, borderBottom: '2px dotted #111', paddingBottom: 8, display: 'inline-block' }}>TEMPORARY EXHIBITIONS</h3>
                   <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                     {selectedMuseum.temporaryExhibitions.map((ex: any) => (
                       <article key={ex.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, background: 'rgba(17,17,17,0.03)', padding: '12px 16px', borderLeft: '3px solid #111' }}>
                         <div style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, backgroundColor: '#111', color: '#fff', padding: '2px 6px', width: 'fit-content', marginBottom: 4 }}>
                           {ex.startDate} — {ex.endDate}
                         </div>
                         <h4 style={{ fontFamily: 'sans-serif', fontSize: 14, fontWeight: 800, textTransform: 'uppercase', lineHeight: 1.2 }}>{ex.title}</h4>
                         <p style={{ fontFamily: 'monospace', fontSize: 11, opacity: 0.8, lineHeight: 1.4 }}>{ex.description}</p>
                       </article>
                     ))}
                   </div>
                </div>
             )}
          </div>

          <div style={S.gallery}>
          
            {/* Gallery Filters */}
            <div style={{ ...S.filterRow, marginBottom: 32 }}>
                {CENTURY_FILTERS.map(f => (
                  <button key={f} onClick={() => setArtworkFilter(f)} style={S.filterBtn(artworkFilter === f)}>
                    {f === 'ALL' ? \`ALL (\${museumArtworks.length})\` : f}
                  </button>
                ))}
            </div>`;

if(content.includes(detailMatch)) {
    content = content.replace(detailMatch, detailReplace);
    console.log("Replaced museum detail markup successfully!");
    fs.writeFileSync('src/components/DrawingGlobe.tsx', content);
} else {
    console.log("Failed to match museum detail markup. I will try fallback.");
    // Maybe try a relaxed regex
}
