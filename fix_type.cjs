const fs = require('fs');

try {
const globefile = 'src/components/DrawingGlobe.tsx';
let globe = fs.readFileSync(globefile, 'utf8');
globe = globe.replace(
    /searchProps=\{\{\s*museums: \[\], \/\/ Or pass real data if needed\s*onOpenLightbox: \(\) => \{\},\s*onNavigateToMuseum: \(museum: \{ id: string, name: string \}\) => void;\s*\}\}/g,
    `searchProps={{
            museums: [], // Or pass real data if needed
            onOpenLightbox: () => {},
            onNavigateToMuseum: () => {}
          }}`
);
fs.writeFileSync(globefile, globe);
console.log('fixed globe');
} catch(e) {}

try {
const navfile = 'src/components/GlobalNav.tsx';
let nav = fs.readFileSync(navfile, 'utf8');
// Deduplicate onOpenLightbox
nav = nav.replace(/onOpenLightbox=\{searchProps\?\.onOpenLightbox \|\| \(\(\) => \{\}\)\} onNavigateToMuseum=\{searchProps\?\.onNavigateToMuseum \|\| \(\(\) => \{\}\)\} onOpenLightbox=\{searchProps\?\.onOpenLightbox \|\| \(\(\) => \{\}\)\} onNavigateToMuseum=\{searnav =ps\?\.onNavigateToMuseum \|\| \(\(\) => \{\}\)\}/g, "onOpenLightbox={searchProps?.onOpenLightbox || (() => {})} onNavigateToMuseum={searchProps?.onNavigateToMuseum || (() => {})}")
fs.writeFileSync(navfile, nav);
console.log('fixed nav');
} catch(e) {}

