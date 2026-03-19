const fs = require('fs');

let content = fs.readFileSync('src/components/DrawingGlobe.tsx', 'utf-8');

// 1. Change RADIUS to 100
content = content.replace(/const RADIUS = 130;/g, "const RADIUS = 100;");

// 2. Tweak bounding box so it's tighter
const scaleMatch = `                if (isOverview) {
                  let minX = 100, maxX = 100, minY = 100, maxY = 100;
                  layoutCities.forEach((c: any) => {
                     // The city shapes live naturally inside ~ [0..200]
                     minX = Math.min(minX, c.ox + 10);
                     maxX = Math.max(maxX, c.ox + 190);
                     minY = Math.min(minY, c.oy + 10);
                     maxY = Math.max(maxY, c.oy + 190);
                  });
                  viewW = maxX - minX;
                  viewH = Math.max(maxY - minY, 100);
                  viewCx = minX + viewW / 2;
                  viewCy = minY + viewH / 2;
                }`;

const scaleReplacement = `                if (isOverview) {
                  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                  layoutCities.forEach((c: any) => {
                     // The city shapes live naturally inside ~ [0..200]
                     minX = Math.min(minX, c.ox + 30);
                     maxX = Math.max(maxX, c.ox + 170);
                     minY = Math.min(minY, c.oy + 30);
                     maxY = Math.max(maxY, c.oy + 170);
                  });
                  viewW = Math.max(maxX - minX, 100);
                  viewH = Math.max(maxY - minY, 100);
                  viewCx = minX + viewW / 2;
                  viewCy = minY + viewH / 2;
                }`;

if(content.includes(scaleMatch)) {
    content = content.replace(scaleMatch, scaleReplacement);
    console.log("Replaced overview bounds!");
} else {
    console.log("Could not find overview scale logic");
}

// 3. Remove the 0.85 shrink
const curScaleMatch = `                // Allow a bit more zoom-out in overview so cities aren't clipped
                if (isOverview) curScale *= 0.85;`;
const curScaleReplacement = `                // For overview, we keep it tighter instead of shrinking
                if (isOverview) curScale *= 1.1; // slighly enlarge to fill space`;

if(content.includes(curScaleMatch)) {
    content = content.replace(curScaleMatch, curScaleReplacement);
    console.log("Replaced zoom shrink!");
} else {
    console.log("Could not find scale shrink logic");
}

fs.writeFileSync('src/components/DrawingGlobe.tsx', content);
