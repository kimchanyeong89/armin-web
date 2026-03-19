const fs = require('fs');

let content = fs.readFileSync('src/components/DrawingGlobe.tsx', 'utf-8');

// 1. Revert RADIUS to 110 (which is closer to original)
content = content.replace(/const RADIUS = 320;/g, "const RADIUS = 110;");

// 2. Adjust scaling logic to make it much larger
const scaleMatch = `                // Map requested view to an arbitrarily large SVG canvas
                let size = Math.max(viewW, viewH);
                // Hard-cap the size so it doesn't zoom out infinitely (especially for Paris)
                if (!isOverview) {
                  size = Math.min(size, 460); 
                } else {
                  size = Math.min(size, 740);
                }
                
                let curScale = 800 / size;
                
                if (isOverview) curScale *= 1.5;
                if (!isOverview) curScale *= 1.35;`;

const scaleReplacement = `                // Map requested view to an arbitrarily large SVG canvas
                let size = Math.max(viewW, viewH);
                // Reduce the bounding box artificial bloat slightly for detail to prevent shrinking
                if (!isOverview) {
                  size = Math.max(size * 0.8, 250); // Make it naturally zoom in more
                } else {
                  size = Math.max(size * 0.85, 300); 
                }
                
                let curScale = 800 / size;
                
                // Extra zoom if needed
                if (isOverview) curScale *= 1.2;
                if (!isOverview) curScale *= 1.1;`;

if(content.includes(scaleMatch)) {
    content = content.replace(scaleMatch, scaleReplacement);
    console.log("Reverted and zoomed up!");
} else {
    console.log("Could not find scale match.");
}

fs.writeFileSync('src/components/DrawingGlobe.tsx', content);