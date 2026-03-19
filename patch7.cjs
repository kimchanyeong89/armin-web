const fs = require('fs');

let content = fs.readFileSync('src/components/DrawingGlobe.tsx', 'utf-8');

const oldPill = `                                        {(() => {
                                          const textStr = museum.shortName?.toUpperCase() || '';
                                          // Animated Pill hover just like city blob:
                                          const twBase = textStr.length * 6.5;
                                          const padX = 14;
                                          const hoverTw = twBase + padX * 2;
                                          
                                          // When not hovered, pill is small (like a dot) and transparent
                                          const tw = isHovered ? hoverTw : 10;
                                          const th = isHovered ? 28 : 10;
                                          
                                          let rectX = museum.lx;
                                          if (anchor === 'end') rectX = isHovered ? museum.lx - twBase - padX : museum.lx - 5;
                                          else if (anchor === 'middle') rectX = isHovered ? museum.lx - twBase / 2 - padX : museum.lx - 5;
                                          else rectX = isHovered ? museum.lx - padX : museum.lx - 5; // start
                                          
                                          return (
                                            <rect x={rectX} y={museum.ly - th / 2} width={tw} height={th}
                                              rx={isHovered ? 14 : 5}
                                              fill="#111111"
                                              style={{ 
                                                opacity: isHovered ? 1 : 0,
                                                transformOrigin: \`\${museum.lx}px \${museum.ly}px\`,
                                                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                                pointerEvents: 'none' 
                                              }} />
                                          );
                                        })()}`;

const newPill = `                                        {(() => {
                                          const textStr = museum.shortName?.toUpperCase() || '';
                                          // Animated Pill hover just like city blob:
                                          const twBase = textStr.length * 7.5;
                                          const padX = 16;
                                          const hoverTw = twBase + padX * 2;
                                          
                                          // When not hovered, pill is small (like a dot) and transparent
                                          const tw = isHovered ? hoverTw : 10;
                                          const th = isHovered ? 28 : 10;
                                          
                                          let rectX = museum.lx;
                                          if (anchor === 'end') rectX = isHovered ? museum.lx - twBase - padX : museum.lx - 5;
                                          else if (anchor === 'middle') rectX = isHovered ? museum.lx - hoverTw / 2 : museum.lx - 5;
                                          else rectX = isHovered ? museum.lx - padX : museum.lx - 5; // start
                                          
                                          return (
                                            <rect fill="#111111"
                                              style={{ 
                                                x: rectX,
                                                y: museum.ly - th / 2,
                                                width: tw,
                                                height: th,
                                                rx: isHovered ? 14 : 5,
                                                opacity: isHovered ? 1 : 0,
                                                transformOrigin: \`\${museum.lx}px \${museum.ly}px\`,
                                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                pointerEvents: 'none' 
                                              }} />
                                          );
                                        })()}`;

if(content.includes(oldPill)) {
    content = content.replace(oldPill, newPill);
    console.log("Replaced pill animation!");
} else {
    console.log("Could not find pill animation block, let's look closer");
}

fs.writeFileSync('src/components/DrawingGlobe.tsx', content);
