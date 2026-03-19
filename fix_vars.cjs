const fs = require('fs');
let code = fs.readFileSync('/Users/kietzsche/armin-web-main/src/components/GlobalSearchBar.tsx', 'utf8');

code = code.replace('{artistGallery && createPortal(', '{artistGallery && createPortal(\n                (() => {\n                    const artistArtworks = artistGallery.artworks;\n                    const artistName = artistGallery.artist;\n                    return (');

code = code.replace(/\{artistGallery\}/g, '{artistName}');
code = code.replace(/encodeURIComponent\(artistGallery\)/g, 'encodeURIComponent(artistName)');

// Restore the object check
code = code.replace(/\{artistName && createPortal/g, '{artistGallery && createPortal');
code = code.replace(/if \(!artistName\)/g, 'if (!artistGallery)');
code = code.replace(/artistName\?\.artworks/g, 'artistGallery?.artworks');
code = code.replace(/artistName\?\.artist/g, 'artistGallery?.artist');
code = code.replace(/!!artistName/g, '!!artistGallery');
code = code.replace(/\{artistName : string;\n/g, '{artistGallery: string;\n');
code = code.replace(/setArtistGallery\(null\)/g, 'setArtistGallery(null)'); 

// Find the end for IIFE
const searchEndStr = 'document.body\n            )';
code = code.replace('document.body\n            )}', ');\n                })(),\n                document.body\n            )}');

code = code.replace(/sessionStorage\.setItem\('artistName'/g, "sessionStorage.setItem('artistGallery'");
code = code.replace(/sessionStorage\.removeItem\('artistName'\)/g, "sessionStorage.removeItem('artistGallery')");
code = code.replace(/sessionStorage\.getItem\('artistName'\)/g, "sessionStorage.getItem('artistGallery')");

fs.writeFileSync('/Users/kietzsche/armin-web-main/src/components/GlobalSearchBar.tsx', code);
console.log('Fixed variables');
