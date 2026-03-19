const fs = require('fs');

const globe = 'src/components/DrawingGlobe.tsx';
let gtxt = fs.readFileSync(globe, 'utf8');
gtxt = gtxt.replace(/searchProps=\{\{\s*museums: layoutCities,\s*onNavigateToMuseum: \(museum: \{ id: string, name: string \}\) => \{\s*\/\/ console\.log\("Navigate", museum\);\s*\}\s*\}\}/g, `searchProps={{ museums: layoutCities, onOpenLightbox: () => {}, onNavigateToMuseum: (museum: { id: string, name: string }) => {} }}`);
fs.writeFileSync(globe, gtxt);

const nav = 'src/components/GlobalNav.tsx';
let ntxt = fs.readFileSync(nav, 'utf8');
ntxt = ntxt.replace(/const \[searchQuery, setSearchQuery\] = useState\(""\);\n\s*/g, "");
fs.writeFileSync(nav, ntxt);


const search = 'src/components/GlobalSearchBar.tsx';
let stxt = fs.readFileSync(search, 'utf8');
stxt = stxt.replace(/isDark, skin = "default"/g, "/* isDark */ skin = \"default\"");
fs.writeFileSync(search, stxt);

