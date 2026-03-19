const fs = require('fs');

let content = fs.readFileSync('src/components/DrawingGlobe.tsx', 'utf-8');

// 1. Update RADIUS to 320 to fix overlapping
content = content.replace(/const RADIUS = 100;/g, "const RADIUS = 320;");

// 2. Fix the scaling calculation
const scaleMatch = `                // Map requested view to an arbitrarily large SVG canvas
                const size = Math.max(viewW, viewH);
                let curScale = 800 / size;
                
                // For overview, we keep it tighter instead of shrinking
                if (isOverview) curScale *= 1.1; // slighly enlarge to fill space`;

const scaleReplace = `                // Map requested view to an arbitrarily large SVG canvas
                let size = Math.max(viewW, viewH);
                // Hard-cap the size so it doesn't zoom out infinitely (especially for Paris)
                if (!isOverview) {
                  size = Math.min(size, 460); 
                } else {
                  size = Math.min(size, RADIUS * 2 + 100);
                }
                
                let curScale = 800 / size;
                
                if (isOverview) curScale *= 1.25;
                if (!isOverview) curScale *= 1.15;`;

if(content.includes(scaleMatch)) {
    content = content.replace(scaleMatch, scaleReplace);
    console.log("Replaced zoom/size logic!");
} else {
    console.log("Could not find scale match!");
}

fs.writeFileSync('src/components/DrawingGlobe.tsx', content);
