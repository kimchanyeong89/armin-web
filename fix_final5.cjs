const fs = require('fs');

const globe = 'src/components/DrawingGlobe.tsx';
let gtxt = fs.readFileSync(globe, 'utf8');
gtxt = gtxt.replace(/searchProps=\{\{\s*museums: layoutCities,\s*onNavigateToMuseum[\s\S]*?\}\}/, `searchProps={{ museums: layoutCities, onOpenLightbox: () => {}, onNavigateToMuseum: (museum: any) => {} }}`);
fs.writeFileSync(globe, gtxt);

const nav = 'src/components/GlobalNav.tsx';
let ntxt = fs.readFileSync(nav, 'utf8');
ntxt = ntxt.replace(/const \[searchQuery, setSearchQuery\] = useState\(""\);\n\s*/g, "");
fs.writeFileSync(nav, ntxt);

const search = 'src/components/GlobalSearchBar.tsx';
let stxt = fs.readFileSync(search, 'utf8');
stxt = stxt.replace(/isDark, skin = "default"/g, "/* isDark, */ skin = \"default\"");
fs.writeFileSync(search, stxt);
