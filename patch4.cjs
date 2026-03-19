const fs = require('fs');

function patchFile() {
    let content = fs.readFileSync('src/components/DrawingGlobe.tsx', 'utf-8');

    // 1. Fix layoutCities radius
    let radMatch = `          const RADIUS = 280;`;
    let newRad = `          const RADIUS = 140;`;
    if (content.includes(radMatch)) {
        content = content.replace(radMatch, newRad);
        console.log("Updated RADIUS");
    } else {
        console.log("Could not find RADIUS");
    }

    // 2. Overview map view padding adjustment
    const ovOld = `                  layoutCities.forEach((c: any) => {
                     minX = Math.min(minX, c.ox - 100);
                     maxX = Math.max(maxX, c.ox + 260);
                     minY = Math.min(minY, c.oy - 100);
                     maxY = Math.max(maxY, c.oy + 280);
                  });`;

    const ovNew = `                  layoutCities.forEach((c: any) => {
                     minX = Math.min(minX, c.ox - 20);
                     maxX = Math.max(maxX, c.ox + 220);
                     minY = Math.min(minY, c.oy - 20);
                     maxY = Math.max(maxY, c.oy + 220);
                  });`;
    
    if (content.includes(ovOld)) {
        content = content.replace(ovOld, ovNew);
        console.log("Updated Overview Bounding Box");
    } else {
        console.log("Could not find Overview bounds block");
    }

    // 3. Remove text from isOverview
    const textGroup = `<g transform="translate(100, 240)">
                                    {(() => {
                                      const textStr = city.cityName.toUpperCase();
                                      const bw = textStr.length * 8 + 24;
                                      return (
                                        <rect x={-(bw / 2)} y="-16" width={bw} height="32" rx="16" fill="transparent" className="reg-bg" />
                                      );
                                    })()}
                                    <text x="0" y="2" textAnchor="middle" alignmentBaseline="middle" fill="#111" className="reg-text" fontFamily="monospace" fontSize="14" fontWeight="800" letterSpacing="0.05em" style={{ transition: 'fill 0.25s', pointerEvents: 'none' }}>
                                      {city.cityName.toUpperCase()}
                                    </text>
                                    <text x="0" y="24" textAnchor="middle" fill="#666" className="reg-sub" fontFamily="monospace" fontSize="11" style={{ transition: 'fill 0.25s', pointerEvents: 'none' }}>
                                      {cityMus.length} MUSEUMS
                                    </text>
                                 </g>`;

    if (content.includes(textGroup)) {
        content = content.replace(textGroup, '');
        console.log("Removed Review Text Group");
    } else {
        console.log("Could not find Review Text Group exactly as formatted");
    }

    // 4. Update the mouse label hover. Instead of `fill="transparent"`, scale `opacity` using RGBA
    // We'll replace the label Background Rect block
    const labelHovOld = `{(() => {
                                          const textStr = museum.shortName?.toUpperCase() || '';
                                          // Animated Pill hover just like city blob:
                                          const charW = 7;
                                          const twBase = textStr.length * charW;
                                          const padX = isHovered ? 14 : 4;
                                          const tw = twBase + padX * 2;
                                          const th = isHovered ? 28 : 16;
                                          let rectX = museum.lx;
                                          if (anchor === 'end') rectX = museum.lx - twBase - padX;
                                          else if (anchor === 'middle') rectX = museum.lx - twBase / 2 - padX;
                                          else rectX = museum.lx - padX;
                                          
                                          return (
                                            <rect x={rectX} y={museum.ly - th / 2} width={tw} height={th} 
                                              rx={isHovered ? 14 : 4}
                                              fill={isHovered ? "#111111" : "transparent"}
                                              style={{ transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)', pointerEvents: 'none' }} />
                                          );
                                        })()}`;

    const labelHovNew = `{(() => {
                                          const textStr = museum.shortName?.toUpperCase() || '';
                                          // Animated Pill hover just like city blob:
                                          const charW = isHovered ? 7 : 5;
                                          const twBase = textStr.length * charW;
                                          const padX = isHovered ? 14 : 4;
                                          const tw = twBase + padX * 2;
                                          const th = isHovered ? 28 : 16;
                                          let rectX = museum.lx;
                                          if (anchor === 'end') rectX = museum.lx - twBase - padX;
                                          else if (anchor === 'middle') rectX = museum.lx - twBase / 2 - padX;
                                          else rectX = museum.lx - padX;
                                          
                                          return (
                                            <rect x={rectX} y={museum.ly - th / 2} width={tw} height={th} 
                                              rx={isHovered ? 14 : 8}
                                              fill="#111111"
                                              style={{ 
                                                opacity: isHovered ? 1 : 0,
                                                transform: \`scale(\${isHovered ? 1 : 0.8})\`,
                                                transformOrigin: \`\${museum.lx}px \${museum.ly}px\`,
                                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
                                                pointerEvents: 'none' 
                                              }} />
                                          );
                                        })()}`;

    if (content.includes(labelHovOld)) {
        content = content.replace(labelHovOld, labelHovNew);
        console.log("Updated Label Hover animation");
    } else {
        console.log("Could not find old label hover block");
    }


    fs.writeFileSync('src/components/DrawingGlobe.tsx', content);
    console.log('Done!');
}

patchFile();
