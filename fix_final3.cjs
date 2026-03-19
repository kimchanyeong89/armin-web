const fs = require('fs');

const globe = 'src/components/DrawingGlobe.tsx';
let gtxt = fs.readFileSync(globe, 'utf8');

// Just replace the whole object
gtxt = gtxt.replace(
    /searchProps=\{\{\s*museums: \[[\s\S]*?onNavigateToMuseum: \(\) => \{\}\s*\}\}/,
    `searchProps={{
            museums: [],
            onOpenLightbox: () => {},
            onNavigateToMuseum: (museum: { id: string, name: string }) => {}
          }}`
);
gtxt = gtxt.replace(
    /searchProps=\{\{\s*museums: layoutCities,\s*onNavigateToMuseum[\s\S]*?\}\}/,
    `searchProps={{
            museums: [],
            onOpenLightbox: () => {},
            onNavigateToMuseum: (museum: { id: string, name: string }) => {}
          }}`
);

fs.writeFileSync(globe, gtxt);

const nav = 'src/components/GlobalNav.tsx';
let ntxt = fs.readFileSync(nav, 'utf8');
ntxt = ntxt.replace(
    /import GlobalSearchBar, \{ GlobalSearchBarProps \} from '\.\/GlobalSearchBar';/g,
    "import GlobalSearchBar from './GlobalSea    "r';\nimport type { GlobalSearchBarProps } from './GlobalSearchBar';"
);
ntxt = ntxt.replace(/import type \{ SearchableArtwork, Museum \} from '\.\/GlobalSearchBar';/g, "");
ntxt = ntxt.replace(/const \[searchQuery, setSearchQuery\] = useState\(""\);/g, "");
fs.writeFileSync(nav, ntxt);

const search = 'src/components/GlobalSearchBar.tsx';
let stxt = fs.readFileSync(search, 'utf8');
stxt = stxt.replace(/isDark, skin = "default"/g, "/* isDark, */ skin = \"default\"");
fs.writeFileSync(search, stxt);

