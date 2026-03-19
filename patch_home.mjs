import fs from 'fs';

let content = fs.readFileSync('src/pages/HomePage.tsx', 'utf8');

content = content.replace(
  /<ExhibitionDetails([\s\S]*?)onSelectExhibition=\{handleSelectExhibition\}\n\s*\/>/,
  "<ExhibitionDetails$1onSelectExhibition={handleSelectExhibition}\n            variant={showDrawingGlobe ? 'sketch' : 'default'}\n          />"
);

fs.writeFileSync('src/pages/HomePage.tsx', content);
