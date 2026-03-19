const fs = require('fs');

let file = fs.readFileSync('src/pages/HomePage.tsx', 'utf8');

// replace setSelectedExhibition with navigate
// Also need to get navigate if not in use yet
file = file.replace(
  /onSelectExhibition=\{\(ex\) => \{\s*setSelectedExhibition\(ex\);\s*\}\}/g,
  `onSelectExhibition={(ex) => {
                navigate(\`/exhibition/\${ex.id}?mode=drawing\`);
              }}`
);

// We should also remove `<DrawingMapModal ... />` entirely from HomePage.tsx
// because it's replaced by the ExhibitionPage route now.
file = file.replace(
  /\{\s*\/\*\s*Selected museum details[^\n]+\n\s*\{selectedExhibition && showDrawingGlobe \? \([\s\S]*?\)\s*:\s*selectedExhibition && \(/g,
  `{/* Selected museum details */}\n        {selectedExhibition && !showDrawingGlobe && (`
);

fs.writeFileSync('src/pages/HomePage.tsx', file);
console.log('patched');
