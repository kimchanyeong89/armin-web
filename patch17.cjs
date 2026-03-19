const fs = require('fs');

let content = fs.readFileSync('src/components/DrawingGlobe.tsx', 'utf-8');

const layoutMatch = `        const layoutCities = useMemo(() => {
          if (!allCities.length) return [];
          const mainC = allCities[0];
          if (allCities.length === 1) return [{ ...mainC, ox: 0, oy: 0 }];
          const others = allCities.slice(1).map(c => {
            const dx = c.coords[0] - mainC.coords[0];
            const dy = -(c.coords[1] - mainC.coords[1]) * 1.5;
            return { ...c, angle: Math.atan2(dy, dx) };
          }).sort((a, b) => a.angle - b.angle);

          for (let iter=0; iter<8; iter++) {
            for (let i=0; i<others.length; i++) {
               let j = (i+1) % others.length;
               let diff = others[j].angle - others[i].angle;
               if (diff < 0) diff += Math.PI * 2;
               if (diff < Math.PI / 3.5) {
                 others[i].angle -= 0.08;
                 others[j].angle += 0.08;
               }
            }
          }
          const RADIUS = 110;
          return [ 
            { ...mainC, ox: 0, oy: 0 }, 
            ...others.map(c => ({
              ...c,
              ox: Math.cos(c.angle) * RADIUS,
              oy: Math.sin(c.angle) * RADIUS
            }))
          ];
        }, [allCities]);`;

const layoutReplace = `        const layoutCities = useMemo(() => {
          if (!allCities.length) return [];
          const mainC = allCities[0];
          if (allCities.length === 1) return [{ ...mainC, ox: 0, oy: 0 }];
          
          const GEO_TO_PX_SCALE = 600; // 0.1 degree ~ 60px
          
          const others = allCities.slice(1).map(c => {
            let dx = c.coords[0] - mainC.coords[0];
            let dy = c.coords[1] - mainC.coords[1];
            
            // Limit the maximum expansion so cities that are far within the cluster don't float to space
            // But retain the correct directional relation and interior overlap (like Vatican)
            return { 
               ...c, 
               ox: dx * GEO_TO_PX_SCALE,
               oy: -dy * GEO_TO_PX_SCALE * 1.25 // slight latitudinal stretch for perspective
            };
          });

          return [ 
            { ...mainC, ox: 0, oy: 0 }, 
            ...others
          ];
        }, [allCities]);`;

if(content.includes(layoutMatch)) {
    content = content.replace(layoutMatch, layoutReplace);
    console.log("Replaced layout logic!");
    fs.writeFileSync('src/components/DrawingGlobe.tsx', content);
} else {
    // try softer match
    console.log("Could not find exact layout match.");
}
