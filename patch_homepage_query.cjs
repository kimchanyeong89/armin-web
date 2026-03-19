const fs = require('fs');

let file = fs.readFileSync('src/pages/HomePage.tsx', 'utf8');

file = file.replace(/const \[showDrawingGlobe, setShowDrawingGlobe\] = useState\(false\);/, 
`const [showDrawingGlobe, setShowDrawingGlobe] = useState(() => {
    return new URLSearchParams(window.location.search).get('drawingMap') === 'true';
  });`);

fs.writeFileSync('src/pages/HomePage.tsx', file);
console.log('patched');
