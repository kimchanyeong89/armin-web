const fs = require('fs');

let content = fs.readFileSync('src/components/DrawingGlobe.tsx', 'utf-8');

const oldScaleBlock = `                // Map requested view to an arbitrarily large SVG canvas
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

const newScaleBlock = `                // Map requested view to an arbitrarily large SVG canvas
                let size = Math.max(viewW, viewH);
                
                let curScale = 800 / size;
                
                // Extra zoom if needed
                if (isOverview) curScale *= 1.4;
                if (!isOverview) curScale *= 1.35;`;

if(content.includes(oldScaleBlock)) {
    content = content.replace(oldScaleBlock, newScaleBlock);
    console.log("Made scale more direct!");
    fs.writeFileSync('src/components/DrawingGlobe.tsx', content);
} else {
    console.log("Could not find scale block to simplify.");
}
