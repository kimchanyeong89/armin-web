const fs = require('fs');

let content = fs.readFileSync('src/components/DrawingGlobe.tsx', 'utf8');

// replace panel def
content = content.replace(/panel:\s*\(\s*show:\s*boolean\s*\)\s*=>\s*\(\{[\s\S]*?\}\),/, `panel: (show: boolean, isMobile: boolean = false) => ({
      position: isMobile ? 'fixed' : 'absolute' as const, top: isMobile ? 0 : '50%', left: isMobile ? 0 : 32, transform: show ? (isMobile ? 'none' : 'translateY(-50%) translateX(0)') : (isMobile ? 'translateY(120%)' : 'translateY(-50%) translateX(-120%)'),
      background: '#FFFFFF', border: isMobile ? 'none' : '3px solid #111111',
      boxShadow: isMobile ? 'none' : '8px 8px 0px 0px rgba(17,17,17,1)', display: 'flex', flexDirection: 'column' as const,
      transition: 'transform 0.7s ease, opacity 0.7s ease, width 0.4s ease, height 0.4s ease', opacity: show ? 1 : 0,
      zIndex: 100, filter: isMobile ? 'none' : 'url(#dg-sketch-ui)',
    }),`);

content = content.replace('...S.panel(show),', '...S.panel(show, winW <= 768),');
content = content.replace('const panelW = Math.max(400, Math.min(winW - 40, 560));', 'const panelW = winW <= 768 ? "100%" : Math.max(400, Math.min(winW - 40, 560));');
content = content.replace('const panelH = Math.max(400, Math.min(winH - 40, 680));', 'const panelH = winW <= 768 ? "100%" : Math.max(400, Math.min(winH - 40, 680));');

fs.writeFileSync('src/components/DrawingGlobe.tsx', content);
console.log("Done");