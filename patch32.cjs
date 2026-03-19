const fs = require('fs');
let code = fs.readFileSync('src/pages/HomePage.tsx', 'utf8');

if(!code.includes("import DrawingMapModal")) {
  code = code.replace(
    `import DrawingGlobe from "../components/DrawingGlobe";`,
    `import DrawingGlobe from "../components/DrawingGlobe";\nimport DrawingMapModal from "../components/DrawingMapModal";`
  );
}

code = code.replace(
`        {/* Selected museum details - ExhibitionDetails renders via createPortal to body */}
        {selectedExhibition && (
          <ExhibitionDetails`,
`        {/* Selected museum details - ExhibitionDetails renders via createPortal to body */}
        {selectedExhibition && showDrawingGlobe ? (
          <DrawingMapModal
            museum={selectedExhibition}
            onClose={() => setSelectedExhibition(null)}
          />
        ) : selectedExhibition && (
          <ExhibitionDetails`
);

fs.writeFileSync('src/pages/HomePage.tsx', code);
console.log('patched hp');
