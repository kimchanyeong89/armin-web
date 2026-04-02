const fs = require('fs');

let content = fs.readFileSync('src/components/DrawingGlobe.tsx', 'utf8');

const oldZoom = `  const zoomToCoords = useCallback((coords: [number, number], targetScale: number) => {
    const targetRot = [-coords[0], -coords[1], 0] as [number, number, number];
    const startRot = rotation, startSc = scaleRef.current;
    const t0 = performance.now();
    const animate = (t: number) => {
      const p = Math.min((t - t0) / 800, 1), ease = 1 - Math.pow(1 - p, 3);
      setRotation([startRot[0] + (targetRot[0] - startRot[0]) * ease, startRot[1] + (targetRot[1] - startRot[1]) * ease, 0]);
      setScale(startSc + (targetScale - startSc) * ease);
      if (p < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [rotation]);`;

const newZoom = `  const zoomToCoords = useCallback((coords: [number, number], targetScale: number) => {
    let tLon = -coords[0];
    const sLon = rotation[0];
    
    // Calculate the shortest path for longitude rotation
    let diff = tLon - sLon;
    diff = ((diff + 180) % 360 + 360) % 360 - 180;
    tLon = sLon + diff;
    
    const targetRot = [tLon, -coords[1], 0] as [number, number, number];
    const startRot = rotation, startSc = scaleRef.current;
    const t0 = performance.now();
    const animate = (t: number) => {
      const p = Math.min((t - t0) / 1200, 1);
      // Smoother easing curve (cubic in/out)
      const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      setRotation([startRot[0] + (targetRot[0] - startRot[0]) * ease, startRot[1] + (targetRot[1] - startRot[1]) * ease, 0]);
      setScale(startSc + (targetScale - startSc) * ease);
      if (p < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [rotation]);`;

content = content.replace(oldZoom, newZoom);

fs.writeFileSync('src/components/DrawingGlobe.tsx', content);
console.log("zoomToCoords Done");