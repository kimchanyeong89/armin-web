import { useEffect, useRef } from "react";
import { geoOrthographic, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";

interface Props {
  size?: number;
  variant: "interactive" | "drawing";
  speed?: number;
}

const PINS: [number, number][] = [
  [2.3, 48.9],   // Paris
  [13.4, 52.5],  // Berlin
  [-0.1, 51.5],  // London
  [-73.9, 40.7], // New York
  [139.7, 35.7], // Tokyo
  [151.2,-33.9], // Sydney
  [-43.2,-22.9], // Rio
];
const PIN_COUNTS = [35, 6, 16, 21, 5, 1, 2];

function isVis(lon: number, lat: number, rotLon: number): boolean {
  const rl = (-rotLon * Math.PI) / 180;
  const rlt = (-20 * Math.PI) / 180;
  const pl = (lon * Math.PI) / 180;
  const plt = (lat * Math.PI) / 180;
  return Math.cos(rlt) * Math.cos(plt) * Math.cos(pl - rl) + Math.sin(rlt) * Math.sin(plt) > 0.05;
}

export default function MiniSpinningGlobe({ size = 200, variant, speed = 8 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const topoRef = useRef<{ land: any; borders: any } | null>(null);
  const lonRef = useRef(10);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number | null>(null);
  const isDraw = variant === "drawing";

  useEffect(() => {
    const tryLoad = (urls: string[], i = 0) => {
      if (i >= urls.length) return;
      fetch(urls[i])
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(data => {
          const land = feature(data, data.objects.land as any);
          const borders = mesh(data, data.objects.countries as any, (a: any, b: any) => a !== b);
          topoRef.current = { land, borders };
        })
        .catch(() => tryLoad(urls, i + 1));
    };
    // 110m — less detail = cleaner sketch look matching actual Drawing Map
    tryLoad(["/geodata/countries-110m.json",
      "https://unpkg.com/world-atlas@2.0.2/countries-110m.json"]);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const cx = size / 2, cy = size / 2, r = size * 0.44;
    const proj = geoOrthographic().scale(r).translate([cx, cy]).clipAngle(90);
    const pathFn = geoPath(proj, ctx);
    const sphere: any = { type: "Sphere" };

    // Panel background color — sphere fill must match to avoid "white circle" artifact
    const BG = "#F2EEE4";

    function drawDrawing(lon: number) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Sphere fill (invisible — matches panel bg)
      ctx.beginPath(); pathFn(sphere);
      ctx.fillStyle = BG; ctx.fill();

      // Outer circle — same weight as all other lines
      ctx.beginPath(); pathFn(sphere);
      ctx.strokeStyle = "rgba(20,20,20,0.7)"; ctx.lineWidth = 0.8; ctx.stroke();

      if (topoRef.current) {
        const { land, borders } = topoRef.current;

        // Land fill = bg color
        ctx.beginPath(); pathFn(land);
        ctx.fillStyle = BG; ctx.fill();

        // All lines — same uniform thin weight, no hierarchy
        ctx.strokeStyle = "rgba(20,20,20,0.65)";
        ctx.lineWidth = 0.7;

        ctx.beginPath(); pathFn(borders); ctx.stroke();
        ctx.beginPath(); pathFn(land); ctx.stroke();
      }

      // Yellow square pins
      PINS.forEach(([plon, plat]) => {
        if (!isVis(plon, plat, lon)) return;
        const pt = proj([plon, plat]); if (!pt) return;
        const s = 5.5;
        ctx.fillStyle = "#CCFF00"; ctx.fillRect(pt[0]-s/2, pt[1]-s/2, s, s);
        ctx.strokeStyle = "rgba(20,20,20,0.8)"; ctx.lineWidth = 1;
        ctx.strokeRect(pt[0]-s/2, pt[1]-s/2, s, s);
      });
    }

    function drawInteractive(lon: number) {
      // Dark ocean
      ctx.beginPath(); pathFn(sphere);
      const og = ctx.createRadialGradient(cx-r*.12, cy-r*.15, 0, cx, cy, r);
      og.addColorStop(0, "#0e0e18"); og.addColorStop(1, "#040408");
      ctx.fillStyle = og; ctx.fill();

      // Faint graticule
      [-45, 0, 45].forEach(lat => {
        ctx.beginPath();
        pathFn({ type: "LineString", coordinates: Array.from({ length: 361 }, (_, i) => [i - 180, lat]) } as any);
        ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 0.5; ctx.stroke();
      });

      if (topoRef.current) {
        const { land, borders } = topoRef.current;

        // Land — clearly darker charcoal vs near-black ocean
        ctx.beginPath(); pathFn(land);
        ctx.fillStyle = "#2e2e42"; ctx.fill();

        // Country borders
        ctx.beginPath(); pathFn(borders);
        ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 0.5; ctx.stroke();

        // Land edge highlight
        ctx.beginPath(); pathFn(land);
        ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 0.8; ctx.stroke();
      }

      // Vignette
      ctx.beginPath(); pathFn(sphere);
      const vg = ctx.createRadialGradient(cx, cy, r*.5, cx, cy, r);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.6)");
      ctx.fillStyle = vg; ctx.fill();

      // Thin outer ring
      ctx.beginPath(); pathFn(sphere);
      ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1; ctx.stroke();

      // White numbered cluster pins
      PINS.forEach(([plon, plat], i) => {
        if (!isVis(plon, plat, lon)) return;
        const pt = proj([plon, plat]); if (!pt) return;
        const count = PIN_COUNTS[i] ?? 1;
        const pr = count > 20 ? 10 : count > 5 ? 7.5 : 6;
        ctx.beginPath(); ctx.arc(pt[0], pt[1], pr, 0, Math.PI*2);
        ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 0.9; ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.font = `bold ${count > 20 ? 6.5 : 5.5}px sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(String(count), pt[0], pt[1]);
      });
    }

    function draw(lon: number) {
      proj.rotate([lon, -20, 0]);
      ctx.clearRect(0, 0, size, size);
      if (isDraw) drawDrawing(lon);
      else drawInteractive(lon);
    }

    function animate(time: number) {
      if (lastTimeRef.current === null) lastTimeRef.current = time;
      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;
      lonRef.current += speed * dt;
      draw(lonRef.current);
      rafRef.current = requestAnimationFrame(animate);
    }

    draw(lonRef.current);
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [size, isDraw, speed]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        borderRadius: "50%",
        boxShadow: isDraw ? "none" : "0 6px 32px rgba(0,0,0,0.6)",
      }}
    />
  );
}
