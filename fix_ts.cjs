const fs = require('fs');

const file = 'src/components/GlobalSearchBar.tsx';
let txt = fs.readFileSync(file, 'utf8');
txt = txt.replace(/setSearchValue\(/g, "setQuery(");
fs.writeFileSync(file, txt);

const nv = 'src/components/GlobalNav.tsx';
let nvx = fs.readFileSync(nv, 'utf8');
nvx = nvx.replace(/\{...searchProps\}/g, '{...searchProps} onOpenLightbox={searchProps?.onOpenLightbox || (() => {})} onNavigateToMuseum={searchProps?.onNavigateToMuseum || (() => {})}');
fs.writeFileSync(nv, nvx);

