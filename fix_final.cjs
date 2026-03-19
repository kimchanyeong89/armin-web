const fs = require('fs');

const globe = 'src/components/DrawingGlobe.tsx';
let gtxt = fs.readFileSync(globe, 'utf8');
gtxt = gtxt.replace(
    /searchProps=\{\{\s*museums: \[[\s\S]*?onNavigateToMuseum: \(\) => \{\}\s*\}\}/g,
    `searchProps={{
            museums: [], // Mock data
            onOpenLightbox: () => {},
            onNavigateToMuseum: (museum: { id: string, name: string }) => {}
          }}`
);
fs.writeFileSync(globe, gtxt);

const nav = 'src/components/GlobalNav.tsx';
let ntxt = fs.readFileSync(nav, 'utf8');
ntxt = ntxt.replace(
    /import GlobalSearchBar, \{ GlobalSearchBarProps \} from '\.\/GlobalSearchBar';/g,
    "import GlobalSearchBar from './GlobalSearchBar';\nimport type { GlobalSearchBarProps } from './GlobalSearchBar';"
);
ntxt = ntxt.replace(
    /<GlobalSearchBar inlineMode \{\.\.\.searchProps\} onOpenLightbox=\{searchProps\?\.onOpenLightbox \|\| \(\(\) => \{\}\)\} onNavigateToMuseum=\{searchProps\?\.onNavigateToMuseum \|\| \(\(\) => \{\}\)\}    /enLightbox=\{searchProps\?\.onOpenLightbox \|\| \(\(\) => \{\}\)\} onNavigateToMuseum=\{searchProps\?\.onNavigateToMuseum \|\| \(\(\) => \{\}\)\} isDark=\{false\} skin="drawing" onExpandChange=\{setIsSearchExpanded\} \/>/g,
    `<GlobalSearchBar inlineMode {...searchProps} onOpenLightbox={searchProps?.onOpenLightbox || (() => {})} onNavigateToMuseum={searchProps?.onNavigateToMuseum || (() => {})} skin="drawing" onExpandChange={setIsSearchExpanded} />`
);
ntxt = ntxt.replace(
    /<GlobalSearchBar inlineMode \{\.\.\.searchProps\} onOpenLightbox=\{searchProps\?\.onOpenLightbox \|\| \(\(\) => \{\}\)\} onNavigateToMuseum=\{searchProps\?\.onNavigateToMuseum \|\| \(\(\) => \{\}\)\} onOpenLightbox=\{searchProps\?\.onOpenLightbox \|\| \(\(\) => \{\}\)\} onNavigateToMuseum=\{searchProps\?\.onNavigateToMuseum \|\| \(\(\) => \{\}\)\} isDark=\{isDark\} onExpandChange=\{setIsSearchExpanded\} \/>/g,
    `<GlobalSearchBar inlineMode {...searchProps} onOpenLightbox={searchProps?.onOpenLightbox || (() => {})} onNavigateToMuseum={searchProps?.onNavigateToMuseum || (() => {})} isDark={isDark} onExpandChange={setIsSearchExpanded} />`
);
ntxt = ntxt.replace(/import type \{ SearchableArtwork, Museum \} from '\.\/GlobalSearchBar';/g, "");
ntxt = ntxt.replace(/const \[searchQuery, setSearchQuery\] = useState\(""\);/g, "");
fs.writeFileSync(nav, ntxt);

const search = 'src/components/GlobalSearchBar.tsx';
let stxt = fs.readFileSync(search, 'utf8');
stxt = stxt.replace(/isDark, skin = "default"/g, "/* isDark, */ skin = \"default\"");
fs.writeFileSync(search, stxt);

