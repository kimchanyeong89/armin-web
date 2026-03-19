const fs = require('fs');
let code = fs.readFileSync('src/components/GlobalSearchBar.tsx', 'utf8');
const regex = /\{\/\*\s*Wiki bio\s*\*\/\}[\s\S]*?(?=\{\/\*\s*── Category filter pills)/;
const replacement = `{/* Wiki bio and Map Layout Grid */}
<style dangerouslySetInnerHTML={{ __html: \`
@keyframes fadeInUpArtistData { 0% { opacity: 0; transform: translateY(15px); } 100% { opacity: 1; transform: translateY(0); } }
.artist-gallery-hero-grid { display: flex; flex-direction: column; gap: 32px; margin-top: 24px; margin-bottom: 32px; }
.artist-gallery-hero-grid > .hero-left { flex: 1; min-width: 0; animation: fadeInUpArtistData 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
<ArtistDistributionMap artworks={artistGallery.artworks} isDark={isDark} /></Suspense></div></div>)}</div>`;
if (regex.test(code)) {
fs.writeFileSync('src/components/GlobalSearchBar.tsx', code.replace(regex, replacement));
console.log('PATCH_OK'); } else { console.log('PATCH_FAIL'); }
