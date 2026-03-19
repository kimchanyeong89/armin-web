const fs = require('fs');

let content = fs.readFileSync('src/components/DrawingGlobe.tsx', 'utf-8');

const targetStr = `                                          return (
                                            <rect x={rectX} y={museum.ly - th / 2} width={tw} height={th}
                                              rx={isHovered ? 14 : 5}
                                              fill="#111111"
                                              style={{ 
                                                opacity: isHovered ? 1 : 0,
                                                transformOrigin: \`\${museum.lx}px \${museum.ly}px\`,
                                                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                                pointerEvents: 'none' 
                                              }} />
                                          );`;
                                          
const replaceStr = `                                          return (
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
                                          );`;

if(content.includes(targetStr)) {
    content = content.replace(targetStr, replaceStr);
    console.log("Replaced!");
    fs.writeFileSync('src/components/DrawingGlobe.tsx', content);
} else {
    console.log("Could not exact match.");
    // let's do regex
    const regex = /<rect x=\{rectX\}[\s\S]*?<\/rect>/;
    if (regex.test(content)) {
        content = content.replace(regex, `<rect fill="#111111"
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
                                              }} />`);
        console.log("Replaced via regex!");
        fs.writeFileSync('src/components/DrawingGlobe.tsx', content);
    }
}
