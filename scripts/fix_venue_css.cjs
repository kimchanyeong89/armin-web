const fs = require('fs');
let css = fs.readFileSync('src/components/InteractiveGlobeMap/InteractiveGlobe.css', 'utf8');

// The original CSS was:
// .ig-venue-panel {
//    position: absolute;
//    z-index: 30;
//    top: 50%;
//    left: 50%;
// ...

if (css.includes('left: 50%;')) {
    css = css.replace(/top: 50%;[\r\n\s]*left: 50%;/, 'top: 50%;\n    right: 24px;\n    left: auto;');
}

fs.writeFileSync('src/components/InteractiveGlobeMap/InteractiveGlobe.css', css);
console.log('CSS fixed.');
