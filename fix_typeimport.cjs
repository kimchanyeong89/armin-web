const fs = require('fs');
const nav = 'src/components/GlobalNav.tsx';
let d = fs.readFileSync(nav, 'utf8');

d = d.replace("import GlobalSearchBar, { GlobalSearchBarProps } from './GlobalSearchBar';", "import GlobalSearchBar from './GlobalSearchBar';\nimport type { GlobalSearchBarProps } from './GlobalSearchBar';");
d = d.replace("import type { SearchableArtwork, Museum } from './GlobalSearchBar';\n", "");

fs.writeFileSync(nav, d);
