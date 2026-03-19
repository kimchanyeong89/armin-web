const fs = require('fs');

const f = 'src/components/DrawingGlobe.tsx';
let d = fs.readFileSync(f, 'utf8');

d = d.replace(/searchProps=\{\{\s*museums: layoutCities,\s*onNavigateToMuseum: \(museum: \{ id: string, name: string \}\) => \{\s*\/\/ console.log\("Navigate", museum\);\s*\}\s*\}\}/g, `searchProps={{ museums: [], onOpenLightbox: () => {}, onNavigateToMuseum: (m: { id: string, name: string }) => {} }}`);

fs.writeFileSync(f, d);
