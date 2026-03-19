const fs = require('fs');

let content = fs.readFileSync('src/components/DrawingGlobe.tsx', 'utf-8');

const regex = /<rect x=\{rectX\}[\s\S]*?<\/rect>/;

if (regex.test(content)) {
    content = content.replace(regex, `<rect fill="#111111"
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
                                              }} />`);
    console.log("Replaced via regex!");
    fs.writeFileSync('src/components/DrawingGlobe.tsx', content);
} else {
    console.log("Still failed.");
}
