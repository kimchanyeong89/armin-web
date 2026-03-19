const fs = require('fs');
let content = fs.readFileSync('src/components/DrawingGlobe.tsx', 'utf8');
content = content.replace(
    'const activeL = layoutCities.find(c => c.id === activeCityId) || layoutCities[0];',
    'const activeL = layoutCities.find(c => c.id === activeCityId) || layoutCities[0] || { ox: 0, oy: 0 };'
);
fs.writeFileSync('src/components/DrawingGlobe.tsx', content);
