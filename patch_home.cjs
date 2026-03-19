const fs = require('fs');
let code = fs.readFileSync('src/pages/HomePage.tsx', 'utf8');

if (!code.includes("variant={showDrawingGlobe ? 'sketch' : 'default'}")) {
  code = code.replace(
    /<ExhibitionDetails\s+exhibition=\{selectedExhibition\}\s+onClose=\{\(\) => setSelectedExhibition\(null\)\}\s+onSelectExhibition=\{handleSelectExhibition\}\s*\/>/s,
    `<ExhibitionDetails
            exhibition={selectedExhibition}
            onClose={() => setSelectedExhibition(null)}
            onSelectExhibition={handleSelectExhibition}
            variant={showDrawingGlobe ? 'sketch' : 'default'}
          />`
  );
  fs.writeFileSync('src/pages/HomePage.tsx', code);
}
