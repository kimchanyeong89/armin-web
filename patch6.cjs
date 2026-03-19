const fs = require('fs');

let content = fs.readFileSync('src/components/DrawingGlobe.tsx', 'utf-8');

// 1. Revert GEO_MERGE_DIST
content = content.replace(/const GEO_MERGE_DIST = 0\.4;[^\n]*\n/, "const GEO_MERGE_DIST = 1.3; // Reverted for bigger clusters\n");

// 2. Tweak RADIUS
content = content.replace(/const RADIUS = 110;/g, "const RADIUS = 130;");

// 3. Fix hitbox and overview group logic in the render block
const renderMatch = `                             {/* Hitbox for peripheral cities */}
                             {isInactiveInDetail && (
                               <rect x="-80" y="-80" width="360" height="360" fill="transparent" className="reg-city" onClick={() => setSelectedCityInPanel(city.id)} />
                             )}
                             
                             <path d={city.shape} fill="none" stroke="#111" strokeWidth={isOverview ? "3" : "2.5"} className={(isThisActive || isOverview) ? "dg-draw" : ""} />
                             {city.river && <path d={city.river} fill="none" stroke="#777" strokeWidth="1.2" strokeDasharray="4 3" className={(isThisActive || isOverview) ? "dg-draw" : ""} style={{ animationDelay: '0.3s' }} />}
                             
                             {/* Overview: draw large title & hover effects */}
                             {isOverview && (
                               <g className="reg-city" onClick={() => setSelectedCityInPanel(city.id)}>
                                 <rect x="0" y="0" width="200" height="200" fill="transparent" />
                                 {dots.map((d, idx) => (
                                   <circle key={idx} cx={d.cx} cy={d.cy} r="4" fill="#111" />
                                 ))}
                                 
                               </g>
                             )}`;

const renderReplacement = `                             {/* Hitbox based strictly on the city shape itself preventing overlaps */}
                             {isInactiveInDetail && (
                               <path d={city.shape} fill="rgba(0,0,0,0.01)" className="reg-city" onClick={() => setSelectedCityInPanel(city.id)} style={{ cursor: 'pointer', pointerEvents: 'all' }} />
                             )}
                             {isOverview && (
                               <path d={city.shape} fill="rgba(0,0,0,0.01)" className="reg-city" onClick={() => setSelectedCityInPanel(city.id)} style={{ cursor: 'pointer', pointerEvents: 'all' }} />
                             )}
                             
                             <path d={city.shape} fill="none" stroke="#111" strokeWidth={isOverview ? "3.5" : "2.5"} className={(isThisActive || isOverview) ? "dg-draw" : ""} style={{ pointerEvents: 'none' }} />
                             {city.river && <path d={city.river} fill="none" stroke="#777" strokeWidth="1.2" strokeDasharray="4 3" className={(isThisActive || isOverview) ? "dg-draw" : ""} style={{ animationDelay: '0.3s', pointerEvents: 'none' }} />}
                             
                             {/* Overview: draw dots */}
                             {isOverview && (
                               <g style={{ pointerEvents: 'none' }}>
                                 {dots.map((d: any, idx: number) => (
                                   <circle key={idx} cx={d.cx} cy={d.cy} r="5" fill="#111" />
                                 ))}
                               </g>
                             )}`;

if(content.includes(renderMatch)) {
    content = content.replace(renderMatch, renderReplacement);
    console.log("Replaced hitboxes!");
} else {
    console.log("Could not find hitbox block");
}

// 4. Adjust the bounding region scale for isOverview
const scaleMatch = `                if (isOverview) {
                  let minX = 0, maxX = 200, minY = 0, maxY = 200;
                  layoutCities.forEach((c) => {
                     minX = Math.min(minX, c.ox - 20);
                     maxX = Math.max(maxX, c.ox + 220);
                     minY = Math.min(minY, c.oy - 20);
                     maxY = Math.max(maxY, c.oy + 220);
                  });
                  viewW = maxX - minX;
                  viewH = maxY - minY;
                  viewCx = minX + viewW / 2;
                  viewCy = minY + viewH / 2;
                }`;

const scaleReplacement = `                if (isOverview) {
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

if(content.includes(scaleMatch)) {
    content = content.replace(scaleMatch, scaleReplacement);
    console.log("Replaced overview bounds!");
} else {
    console.log("Could not find overview scale logic");
}

fs.writeFileSync('src/components/DrawingGlobe.tsx', content);
