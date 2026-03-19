const fs = require('fs');

let content = fs.readFileSync('src/components/DrawingGlobe.tsx', 'utf-8');

const match = content.match(/const\s+twBase\s*=\s*textStr\.length\s*\*\s*6\.5[\s\S]*?<\/rect>/);
if (match) {
    const replacement = `const twBase = textStr.length * 6.5;
                                          const padX = 14;
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
                                                x: rectX + "px",
                                                y: (museum.ly - th / 2) + "px",
                                                width: tw + "px",
                                                height: th + "px",
                                                rx: (isHovered ? 14 : 5) + "px",
                                                opacity: isHovered ? 1 : 0,
                                                transformOrigin: \`\${museum.lx}px \${museum.ly}px\`,
                                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                pointerEvents: 'none' 
                                              }} />`;
    content = content.replace(match[0], replacement);
    console.log("Replaced pill animation style!");
} else {
    console.log("Still couldn't find the pill animation block.");
}

fs.writeFileSync('src/components/DrawingGlobe.tsx', content);
