const fs = require('fs');
let code = fs.readFileSync('src/components/GlobalSearchBar.tsx', 'utf8');

const regex = /<style dangerouslySetInnerHTML=\{\{\s*__html:\s*`[\s\S]*?`\}\}\s*\/>[\s\S]*?<div className="hero-right">[\s\S]*?<\/div>\s*<\/div>\s*\)\}\s*<\/div>/;

const newBlock = `<style dangerouslySetInnerHTML={{ __html: \`
    @keyframes fadeInUpArtistLeft {
        0% { opacity: 0; transform: translateY(15px); }
        100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeInUpArtistRight {
        0% { opacity: 0; transform: translateY(15px); }
        100% { opacity: 1; transform: translateY(0); }
    }
    .artist-gallery-hero-grid {
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        gap: 32px;
        margin-top: 24px;
        margin-bottom: 32px;
        width: 100%;
        box-sizing: border-box;
    }
    .artist-gallery-hero-grid > .hero-left {
        flex: 1;
        min-width: 0;
        opacity: 0;
        animation: fadeInUpArtistLeft 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .artist-gallery-hero-grid > .hero-right {
        flex: 1.1;
        min-width: 0;
        opacity: 0;
        animation: fadeInUpArtistRight 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s forwards;
    }
    @media (max-width: 768px) {
        .artist-gallery-hero-grid {
            flex-direction: column;
        }
    }
\`}} />

<div className="artist-gallery-hero-grid">
    <div className="hero-left">
        <ArtistWikiPanel
            artistName={artistGallery.artist}
            imageUrl={undefined}
            fallbackDescription={artistFallbackDescription}
        />
    </div>

    {!isMobile && artistGallery.artworks.length > 0 && (
        <div className="hero-right">
            <p style={{ fontSize: 11, color: textSub, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10, fontWeight: 500 }}>
                MUSEUM DISTRIBUTION
            </p>
            <div style={{ height: 320, borderRadius: 12, overflow: 'hidden', border: \`1px solid \${border}\`, backgroundColor: bg }}>
                <Suspense fallback={
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: textSub, fontSize: 12 }}>
                        Loading map…
                    </div>
                }>
                    <ArtistDistributionMap artworks={artistGallery.artworks as any} isDark={isDark} />
                </Suspense>
            </div>
        </div>
    )}
</div>`;

code = code.replace(regex, newBlock);

fs.writeFileSync('src/components/GlobalSearchBar.tsx', code);
console.log('Fixed CSS & layout mapping!');