const fs = require('fs');
let code = fs.readFileSync('src/components/GlobalSearchBar.tsx', 'utf8');

// 1. Fix map layout and mobile visibility
code = code.replace(
    /\{\!isMobile && artistGallery\.artworks\.length > 0 && \(/,
    "{artistGallery.artworks.length > 0 && ("
);
code = code.replace(
    /height: 320, borderRadius: 12, overflow: 'hidden'/g,
    "height: 'auto', minHeight: 320, paddingBottom: 20, borderRadius: 12, overflow: 'hidden'"
);

// 2. Fix gallery load animation: add the class to the div wrapper
const targetImageBlock = `return (
                                                        <div
                                                            key={art.id || \`art-\${columnIdx}-\${idx}\`}`;

const replaceImageBlock = `return (
                                                        <div
                                                            className="gallery-anim-item"
                                                            key={art.id || \`art-\${columnIdx}-\${idx}\`}`;

if (code.includes(targetImageBlock) && !code.includes('className="gallery-anim-item"')) {
    code = code.replace(targetImageBlock, replaceImageBlock);
}

// 3. Add to the style block: .gallery-anim-item keyframes
const styleBlockTarget = `.artist-gallery-hero-grid {`;
const newStyleBlock = `@keyframes masonryItemEnter {
        0% { opacity: 0; transform: translateY(20px); }
        100% { opacity: 1; transform: translateY(0); }
    }
    .gallery-anim-item {
        animation: masonryItemEnter 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    /* Stagger masonry images */
    .gallery-anim-item:nth-child(1) { animation-delay: 0.05s; }
    .gallery-anim-item:nth-child(2) { animation-delay: 0.1s; }
    .gallery-anim-item:nth-child(3) { animation-delay: 0.15s; }
    .gallery-anim-item:nth-child(4) { animation-delay: 0.2s; }
    .gallery-anim-item:nth-child(5) { animation-delay: 0.25s; }
    .gallery-anim-item:nth-child(n+6) { animation-delay: 0.3s; }
    .artist-gallery-hero-grid {`;

if (code.includes(styleBlockTarget) && !code.includes('masonryItemEnter')) {
    code = code.replace(styleBlockTarget, newStyleBlock);
}

// Write back
fs.writeFileSync('src/components/GlobalSearchBar.tsx', code);
console.log('Fixed map height, map mobile visibility, and masonry animation!');