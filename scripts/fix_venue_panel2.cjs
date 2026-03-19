const fs = require('fs');

let code = fs.readFileSync('src/components/InteractiveGlobeMap/VenuePanel.tsx', 'utf8');

if (!code.includes("getCityShape")) {
  code = code.replace(`import type { CityMarker, Venue, Theme } from "./types";`, `import type { CityMarker, Venue, Theme } from "./types";\nimport { getCityShape, computeMinimapDots } from "./cityMinimapHelper";`);
}

code = code.replace(/x:\s*"-50%",/g, 'x: 0,');

const regex = /<div className=\"ig-vp-header\">[\s\S]*?<button[\s\S]*?<\/button>\s*<\/div>\s*<\/div>/;

const newHeader = `{/* Header */}
            <div className="ig-vp-header" style={{ paddingBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                  <div className={\`\${fg90} tracking-[0.18em] uppercase\`} style={{ fontSize: "14px", fontWeight: "bold" }}>
                    {city.city}
                  </div>
                  <div className={\`\${fg35} mt-1\`} style={{ fontSize: "11px" }}>
                    {city.country}
                  </div>
                </div>
                <button onClick={onClose} className="ig-vp-btn-close">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Minimap View */}
              <div 
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '160px',
                  background: t ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)",
                  border: \`1px solid \${borderColor}\`,
                  borderRadius: '12px',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {(() => {
                  const cityShapeInfo = getCityShape(city.city, city.coordinates[1], city.coordinates[0]);
                  const minimapDots = computeMinimapDots(city.venues);
                  
                  return (
                    <svg width="100%" height="100%" viewBox="0 0 200 200" style={{ transform: 'scale(0.95)' }}>
                      <path 
                        d={cityShapeInfo.river} 
                        fill="none" 
                        stroke={t ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.15)"} 
                        strokeWidth="10" 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                      />
                      <path 
                        d={cityShapeInfo.shape} 
                        fill={t ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)"} 
                        stroke={t ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.2)"} 
                        strokeWidth="1" 
                        strokeLinejoin="round" 
                      />
                      
                      {minimapDots.map((dot, idx) => {
                        const venueId = city.venues[idx].id;
                        return (
                          <circle 
                            key={venueId}
                            cx={dot.cx} 
                            cy={dot.cy} 
                            r={4} 
                            fill={t ? "#111" : "#e8fb36"} 
                            stroke={t ? "#fff" : "#111"}
                            strokeWidth="1.5"
                          />
                        );
                      })}
                    </svg>
                  );
                })()}
              </div>
            </div>`;

code = code.replace(regex, newHeader);

fs.writeFileSync('src/components/InteractiveGlobeMap/VenuePanel.tsx', code);
console.log('VenuePanel matched and replaced.');
