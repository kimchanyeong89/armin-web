const fs = require('fs');

let content = fs.readFileSync('src/components/DrawingGlobe.tsx', 'utf-8');

// I'm going to set it so the zoom bounds completely ignore the long text labels for calculating scale.
// Because the museum names being too long artificially puffs up the bounding box!
const textStrMatch = `                     // Add some margin for labels
                     const lw = (m.shortName?.length || 4) * 8 + 30;
                     localMinX = Math.min(localMinX, m.lx - lw);
                     localMaxX = Math.max(localMaxX, m.lx + lw);`;

const textStrReplace = `                     // Ignore massive label names for the bounding scale, they can bleed off edge
                     const lw = 20; 
                     localMinX = Math.min(localMinX, m.lx - lw);
                     localMaxX = Math.max(localMaxX, m.lx + lw);`;

if(content.includes(textStrMatch)) {
    content = content.replace(textStrMatch, textStrReplace);
    console.log("Ignored massive labels for zoom box!");
    fs.writeFileSync('src/components/DrawingGlobe.tsx', content);
}
