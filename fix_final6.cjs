const fs = require('fs');

const globe = 'src/components/DrawingGlobe.tsx';
let gtxt = fs.readFileSync(globe, 'utf8');

// There are multiple `<GlobalSearchBar ... />` instances in DrawingGlobe.tsx probably that are passing searchProps.
// Let's strip `searchProps={{...}}` and make it empty if needed, or better, make it full:
while(gtxt.includes("searchProps={{ museums: layoutCities, onNavigateToMuseum: (museum: { id: string, name: string }) => { // console.log(\"Navigate\", museum); } }}")) {
    gtxt = gtxt.replace("searchProps={{ museums: layoutCities, onNavigateToMuseum: (museum: { id: string, name: string }) => { // console.log(\"Navigate\", museum); } }}", "searchProps={{ museums: layoutCities, onOpenLightbox: () => {}, onNavigateToMuseum: (museum: any) => {} }}");
}

fs.writeFileSync(globe, gtxt);
