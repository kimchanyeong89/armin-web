const fs = require('fs');

const nav = 'src/components/GlobalNav.tsx';
let ntxt = fs.readFileSync(nav, 'utf8');

// The file shows syntax errors on multiple elements with the same attributes.
// Let's strip out the repeated string from right to left
while (ntxt.includes(" onOpenLightbox={searchProps?.onOpenLightbox || (() => {})} onNavigateToMuseum={searchProps?.onNavigateToMuseum || (() => {})} onOpenLightbox={searchProps?.onOpenLightbox || (() => {})} onNavigateToMuseum={searchProps?.onNavigateToMuseum || (() => {})}")) {
    ntxt = ntxt.replace(" onOpenLightbox={searchProps?.onOpenLightbox || (() => {})} onNavigateToMuseum={searchProps?.onNavigateToMuseum || (() => {})} onOpenLightbox={searchProps?.onOpenLightbox || (() => {})} onNavigateToMuseum={searchProps?.onNavigateToMuseum || (() => {})}", " onOpenLightbox={searchProps?.onOpenLightbox || (() => {})} onNavigateToMuseum={searchProps?.onNavigateToMuseum || (() => {})}")
}

// Ensure type imports
if (ntxt.includes("imif (nGlobalSearchBar, { GlobalSearchBarProps } from")) {
    ntxt = ntxt.replace("import GlobalSearchBar, { GlobalSearchBarProps } from", "import GlobalSearchBar from './GlobalSearchBar'; import type { GlobalSearchBarProps } from");
}

fs.writeFileSync(nav, ntxt);

const globe = 'src/components/DrawingGlobe.tsx';
let gtxt = fs.readFileSync(globe, 'utf8');

if (gtxt.includes("searchProps={{ museums: layoutCities, onNavigateToMuseum: (museum: { id: string, name: string }) => { // console.log(\"Navigate\", museum); } }}")) {
    gtxt = gtxt.replace("searchProps={{ museums: layoutCities, onNavigateToMuseum: (museum: { id: string, name: string }) => { // console.log(\"Navigate\", museum); } }}", "searchProps={{ museums: layoutCities, onOpenLightbox: () => {}, onNavigateToMuseum: (museum: { id: string, name: string }) => { } }}")
}

fs.writeFileSync(globe, gtxt);
