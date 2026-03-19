const fs = require('fs');
let content = fs.readFileSync('src/components/DrawingGlobe.tsx', 'utf-8');

const target1 = `            {/* ── Main: selected city expanded map or Overview map ── */}`;
const startIdx = content.indexOf(target1);
if (startIdx === -1) { console.error('Start not found'); process.exit(1); }

const endText = `            {/* ── Footer ── */}`;
const endIdx = content.indexOf(endText, startIdx);
if (endIdx === -1) { console.error('End not found'); process.exit(1); }

const newBlock = `            {/* ── Main: selected city expanded map or Overview map ── */}
            <div style={{ ...S.panelMap, overflow: 'hidden', position: 'relative', touchAction: 'none' }}>
              {(() => {
                let viewW = 400, viewH = 400, viewCx = 100, viewCy = 100;
                
                if (isOverview) {
                  let minX = 0, maxX = 200, minY = 0, maxY = 200;
                  layoutCities.forEach((c) => {
                     minX = Math.min(minX, c.ox - 100);
                     maxX = Math.max(maxX, c.ox + 260);
                     minY = Math.min(minY, c.oy - 100);
                     maxY = Math.max(maxY, c.oy + 280);
                  });
                  viewW = maxX - minX;
                  viewH = maxY - minY;
                  viewCx = minX + viewW / 2;
                  viewCy = minY + viewH / 2;
                } else {
                  const activeL = layoutCities.find(c => c.id === activeCityId) || layoutCities[0];
                  let localMinX = 0, localMaxX = 200, localMinY = 0, localMaxY = 200;
                  panelMuseums.forEach((m) => {
                     // Add some margin for labels
                     const lw = (m.shortName?.length || 4) * 8 + 30;
                     localMinX = Math.min(localMinX, m.lx - lw);
                     localMaxX = Math.max(localMaxX, m.lx + lw);
                     localMinY = Math.min(localMinY, m.ly - 40);
                     localMaxY = Math.max(localMaxY, m.ly + 40);
                  });
                  const bw = localMaxX - localMinX;
                  const bh = localMaxY - localMinY;
                  viewW = bw + 80;
                  viewH = bh + 80;
                  viewCx = activeL.ox + localMinX + bw / 2;
                  viewCy = activeL.oy + localMinY + bh / 2;
                }

                // Map requested view to an arbitrarily large SVG canvas
                const size = Math.max(viewW, viewH);
                let curScale = 800 / size;
                
                // Allow a bit more zoom-out in overview so cities aren't clipped
                if (isOverview) curScale *= 0.85;

                let tx = 400 - viewCx * curScale;
                let ty = 400 - viewCy * curScale;
                
                return (
                  <svg viewBox="0 0 800 800" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                    <defs>
                      <style>{\`
                        @keyframes dg-dp{0%{stroke-dashoffset:1000}100%{stroke-dashoffset:0}}
                        @keyframes dg-fp{0%{opacity:0;transform:scale(0.9)}100%{opacity:1;transform:scale(1)}}
                        @keyframes dg-pulse{0%,100%{r:9;opacity:0.4}50%{r:16;opacity:0}}
                        .dg-draw{stroke-dasharray:1000;animation:dg-dp 1.4s ease-out forwards}
                        .reg-city{cursor:pointer;}
                        .reg-bg{transition:all 0.25s cubic-bezier(0.4, 0, 0.2, 1);}
                        .reg-city:hover .reg-bg{fill:#111111;}
                        .reg-city:hover .reg-text{fill:#ffffff;}
                        .reg-city:hover .reg-sub{fill:rgba(255,255,255,0.7);}
                        .dg-pts{opacity:0;animation:dg-fp 0.3s ease-out 0.8s forwards}
                      \`}</style>
                    </defs>
                    <g style={{ 
                        transform: \`translate(\${tx}px, \${ty}px) scale(\${curScale})\`, 
                        transition: 'transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}>
                      {layoutCities.map((city) => {
                        const isThisActive = city.id === activeCityId;
                        const isInactiveInDetail = !isOverview && !isThisActive;
                        const cityMus = getMuseumsForCity(city);
                        const dots = (isThisActive && !isOverview) ? panelMuseums : computeDots(cityMus, 30);

                        return (
                          <g key={city.id} style={{ opacity: isInactiveInDetail ? 0.25 : 1, transition: 'opacity 0.5s ease' }} transform={\`translate(\${city.ox}, \${city.oy})\`}>
                             {/* Hitbox for peripheral cities */}
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
                                 <g transform="translate(100, 240)">
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
                                 </g>
                               </g>
                             )}

                             {/* Detail: draw exact dots & text */}
                             {(!isOverview && isThisActive) && (
                                <g className="dg-pts">
                                  {dots.map((museum) => {
                                    const isSelected = selectedPointId === museum.id;
                                    const isHovered = hoveredMuseumId === museum.id;
                                    const dimmed = hoveredMuseumId !== null && !isHovered && !isSelected;
                                    const lAngle = museum.labelAngle ?? 0;
                                    const anchor = Math.cos(lAngle) < -0.15 ? 'end' : Math.cos(lAngle) > 0.15 ? 'start' : 'middle';
                                    
                                    return (
                                      <g key={museum.id}
                                        onClick={() => handleMuseumClick(museum)}
                                        onMouseEnter={() => setHoveredMuseumId(museum.id)}
                                        onMouseLeave={() => setHoveredMuseumId(null)}
                                        style={{ cursor: 'pointer' }}>
                                        <line x1={museum.cx} y1={museum.cy} x2={museum.lx} y2={museum.ly}
                                          stroke="#111111" strokeWidth="0.6"
                                          opacity={dimmed ? 0.05 : isHovered ? 0.5 : 0.2}
                                          style={{ transition: 'opacity 0.15s' }} />
                                        {isHovered && <circle cx={museum.cx} cy={museum.cy} r="9" fill="none" stroke="#111111" strokeWidth="1" style={{ animation: 'dg-pulse 0.9s ease-out infinite' }} />}
                                        <circle cx={museum.cx} cy={museum.cy}
                                          r={isSelected ? 7 : isHovered ? 6 : 4}
                                          fill="#111" opacity={dimmed ? 0.1 : 1}
                                          style={{ transition: 'r 0.15s ease, opacity 0.15s ease' }} />
                                        {isSelected && <circle cx={museum.cx} cy={museum.cy} r="11" fill="none" stroke="#111" strokeWidth="1.2" strokeDasharray="3.5 2.5" opacity="0.45" style={{ pointerEvents: 'none' }} />}
                                        
                                        {(() => {
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
                                        })()}
                                        <text x={museum.lx} y={museum.ly}
                                          fontSize={isHovered ? '10' : '8'}
                                          fontFamily="monospace"
                                          fontWeight={isHovered ? '800' : '600'}
                                          fill={isHovered ? "#ffffff" : "#111111"}
                                          textAnchor={anchor} alignmentBaseline="middle"
                                          opacity={dimmed ? 0.07 : isHovered ? 1 : 0.7}
                                          style={{
                                            letterSpacing: isHovered ? '0.08em' : '0.05em',
                                            stroke: isHovered ? 'none' : 'rgba(255,255,255,0.96)',
                                            strokeWidth: isHovered ? 0 : 3.5,
                                            paintOrder: 'stroke fill',
                                            strokeLinejoin: 'round',
                                            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                            pointerEvents: 'auto',
                                            userSelect: 'none',
                                          }}>
                                          {museum.shortName?.toUpperCase()}
                                        </text>
                                      </g>
                                    );
                                  })}
                                </g>
                             )}
                          </g>
                        );
                      })}
                    </g>
                  </svg>
                );
              })()}
            </div>
`;

const updated = content.substring(0, startIdx) + newBlock + content.substring(endIdx);
fs.writeFileSync('src/components/DrawingGlobe.tsx', updated);
console.log('done via file');
