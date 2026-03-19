const fs = require('fs');

let content = fs.readFileSync('src/components/DrawingGlobe.tsx', 'utf-8');

const regex = /\{\(\(\) => \{[\s\S]*?const textStr = museum\.shortName[\s\S]*?<\/rect>\s*\);\s*\}\)\(\)\}/;

const replaceStr = `{(() => {
                                          const textStr = museum.shortName?.toUpperCase() || '';
                                          const twBase = textStr.length * 6.5;
                                          const padX = 14;
                                          const hoverTw = twBase + padX * 2;
                                          const tw = isHovered ? hoverTw : 10;
                                          const th = isHovered ? 28 : 10;
                                          let rectX = museum.lx;
                                          if (anchor === 'end') rectX = isHovered ? museum.lx - twBase - padX : museum.lx - 5;
                                          else if (anchor === 'middle') rectX = isHovered ? museum.lx - hoverTw / 2 : museum.lx - 5;
                                          else rectX = isHovered ? museum.lx - padX : museum.lx - 5;
                                          return (
                                            <rect fill="#111111"
                                              style={{ 
                                                x: rectX + "px",
                                                y: (museum.ly - th / 2) + "px",
                                                width: tw + "px",
                                                height: th + "px",
                                                rx: (isHovered ? 14 : 5) + "px",
                                                opacity: isHovered ? 1 : 0,
                                                transformOrigin: \`\${museum.lx}px \${museum.ly}px\`,
                                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                pointerEvents: 'none' 
                                              }} />
                                          );
                                        })()}`;

if (regex.test(content)) {
    content = content.replace(regex, replaceStr);
    console.log("Replaced block!");
    fs.writeFileSync('src/components/DrawingGlobe.tsx', content);
} else {
    console.log("Failed block replace");
}
