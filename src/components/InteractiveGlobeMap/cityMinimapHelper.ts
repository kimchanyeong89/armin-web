// City minimap data — simplified outlines + major river lines + geoBox.
//
// shape   : SVG path inside a 200×200 viewBox (centered around 100,100)
// river   : SVG path for major river/water feature (dashed at render time)
// geoBox  : real-world lat/lng range that the shape represents — used to
//           project a venue's coordinates into the shape so the dot lands
//           in the right neighbourhood of the city rather than at random.
//
// Coordinate convention: lat increases northward, lng eastward. The minimap's
// SVG y-axis grows downward, so the consumer must flip y when projecting.

export interface CityGeoBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface CityShape {
  shape: string;
  river: string;
  geoBox?: CityGeoBox;
}

export const CITY_SHAPES: Record<string, CityShape> = {
  // ── Western Europe ──────────────────────────────────────────────────────
  paris: {
    shape: "M 50 80 L 80 40 L 130 40 L 160 70 L 150 140 L 90 160 L 40 120 Z",
    river: "M 170 140 Q 130 100 100 110 T 30 130",
    geoBox: { minLat: 48.815, maxLat: 48.905, minLng: 2.235, maxLng: 2.470 },
  },
  london: {
    shape: "M 40 100 L 70 40 L 130 40 L 170 90 L 150 150 L 80 160 L 30 130 Z",
    river: "M 20 110 Q 70 130 100 100 T 180 110",
    geoBox: { minLat: 51.430, maxLat: 51.580, minLng: -0.230, maxLng: 0.050 },
  },
  amsterdam: {
    shape: "M 80 50 L 130 40 L 160 80 L 150 130 L 110 160 L 60 150 L 40 110 Z",
    river: "M 40 90 Q 90 70 130 90 T 170 80",
    geoBox: { minLat: 52.340, maxLat: 52.390, minLng: 4.840, maxLng: 4.945 },
  },
  // ── Italy ───────────────────────────────────────────────────────────────
  rome: {
    shape: "M 70 40 L 130 40 L 160 80 L 150 150 L 100 170 L 50 140 L 40 80 Z",
    river: "M 40 70 Q 80 130 100 120 T 160 150",
    geoBox: { minLat: 41.880, maxLat: 41.925, minLng: 12.440, maxLng: 12.520 },
  },
  florence: {
    shape: "M 60 50 L 140 50 L 150 110 L 120 160 L 80 160 L 50 110 Z",
    river: "M 40 100 Q 90 130 140 100 T 180 120",
    geoBox: { minLat: 43.760, maxLat: 43.790, minLng: 11.230, maxLng: 11.290 },
  },
  venice: {
    shape: "M 40 70 Q 100 30 160 70 Q 180 110 160 150 Q 100 180 40 150 Z",
    river: "M 40 90 Q 90 80 140 90 T 180 100 M 80 60 Q 100 110 80 140",
    geoBox: { minLat: 45.420, maxLat: 45.450, minLng: 12.310, maxLng: 12.360 },
  },
  milan: {
    shape: "M 70 50 L 140 50 L 160 95 L 140 155 L 70 155 L 50 95 Z",
    river: "M 80 20 Q 100 100 85 180",
    geoBox: { minLat: 45.450, maxLat: 45.490, minLng: 9.160, maxLng: 9.220 },
  },
  // ── Central / Northern Europe ───────────────────────────────────────────
  berlin: {
    shape: "M 50 50 L 150 50 L 160 100 L 140 150 L 60 150 L 40 100 Z",
    river: "M 60 30 L 70 180 M 130 30 Q 140 100 130 180",
    geoBox: { minLat: 52.470, maxLat: 52.560, minLng: 13.280, maxLng: 13.470 },
  },
  vienna: {
    shape: "M 60 50 L 130 40 L 160 90 L 140 150 L 80 160 L 40 120 Z",
    river: "M 30 80 Q 80 100 130 80 T 180 100",
    geoBox: { minLat: 48.160, maxLat: 48.245, minLng: 16.305, maxLng: 16.420 },
  },
  munich: {
    // Roughly oval, slightly pinched on the west side — Isar runs SW→NE
    shape: "M 50 60 L 100 30 L 150 50 L 170 100 L 150 160 L 90 170 L 40 130 Z",
    river: "M 60 180 Q 90 130 120 100 T 170 30",
    geoBox: { minLat: 48.090, maxLat: 48.205, minLng: 11.460, maxLng: 11.670 },
  },
  copenhagen: {
    // Mainland + Amager island east of the Øresund strait
    shape: "M 60 40 L 120 40 L 140 80 L 130 160 L 70 160 Z M 145 60 L 165 60 L 155 140 L 135 140 Z",
    river: "M 130 30 L 125 170",
    geoBox: { minLat: 55.640, maxLat: 55.730, minLng: 12.490, maxLng: 12.660 },
  },
  budapest: {
    shape: "M 60 40 L 120 30 L 160 80 L 150 150 L 90 170 L 40 120 Z",
    river: "M 100 20 Q 110 80 95 120 T 100 180",
    geoBox: { minLat: 47.450, maxLat: 47.560, minLng: 19.030, maxLng: 19.150 },
  },
  edinburgh: {
    // Volcanic ridgeline running east-west, Firth of Forth to the north
    shape: "M 40 90 L 70 60 L 130 50 L 165 70 L 170 110 L 145 150 L 70 155 L 35 125 Z",
    river: "M 20 50 Q 100 80 180 60",
    geoBox: { minLat: 55.920, maxLat: 55.985, minLng: -3.260, maxLng: -3.130 },
  },
  helsinki: {
    // Peninsula jutting into the Gulf of Finland (south) with an arc of bays
    shape: "M 40 50 L 130 45 L 165 70 L 170 110 Q 130 160 90 160 Q 50 155 35 120 Z",
    river: "M 20 145 Q 70 170 110 175 T 180 165",
    geoBox: { minLat: 60.150, maxLat: 60.210, minLng: 24.870, maxLng: 25.030 },
  },
  moscow: {
    // Concentric ring city; Moskva River loops through center
    shape: "M 50 60 L 100 35 L 155 55 L 170 100 L 155 150 L 100 170 L 45 145 L 35 95 Z",
    river: "M 25 90 Q 80 110 100 90 T 170 130",
    geoBox: { minLat: 55.690, maxLat: 55.820, minLng: 37.500, maxLng: 37.750 },
  },
  // ── Asia ────────────────────────────────────────────────────────────────
  seoul: {
    shape: "M 40 70 L 90 30 L 150 40 L 180 90 L 150 160 L 70 160 L 20 110 Z",
    river: "M 20 100 Q 80 120 120 110 T 180 130",
    geoBox: { minLat: 37.450, maxLat: 37.670, minLng: 126.800, maxLng: 127.180 },
  },
  jeju: {
    // Volcanic oval island; no major river (Hallasan dominates center)
    shape: "M 30 100 Q 45 50 100 35 Q 160 45 180 95 Q 170 150 110 165 Q 50 165 30 115 Z",
    river: "",
    geoBox: { minLat: 33.180, maxLat: 33.560, minLng: 126.160, maxLng: 126.960 },
  },
  tokyo: {
    // 23 wards arc; Tokyo Bay clips the SE
    shape: "M 40 40 L 130 40 L 140 90 L 110 120 L 90 160 L 40 160 Z",
    river: "M 110 30 Q 120 80 100 120 T 130 180",
    geoBox: { minLat: 35.600, maxLat: 35.780, minLng: 139.650, maxLng: 139.870 },
  },
  beijing: {
    // Classic grid plan — near-square outer ring road shape
    shape: "M 50 50 L 150 50 L 160 100 L 150 150 L 50 150 L 40 100 Z",
    river: "M 40 70 Q 90 110 140 130 T 180 155",
    geoBox: { minLat: 39.830, maxLat: 40.010, minLng: 116.300, maxLng: 116.550 },
  },
  shanghai: {
    // Huangpu River carves an S through the city, splitting Puxi from Pudong
    shape: "M 60 30 L 130 30 L 160 70 L 155 130 L 130 170 L 70 170 L 40 130 L 50 70 Z",
    river: "M 100 20 Q 70 70 110 100 T 90 180",
    geoBox: { minLat: 31.130, maxLat: 31.310, minLng: 121.400, maxLng: 121.560 },
  },
  // ── North America ───────────────────────────────────────────────────────
  "new york": {
    shape: "M 70 30 L 100 30 L 90 90 L 130 110 L 160 90 L 170 140 L 120 160 L 80 120 Z",
    river: "M 80 20 L 70 180 M 100 20 L 90 100 L 110 180",
    geoBox: { minLat: 40.700, maxLat: 40.810, minLng: -74.020, maxLng: -73.940 },
  },
  chicago: {
    shape: "M 80 40 L 130 40 L 150 80 L 140 160 L 70 160 L 60 80 Z",
    river: "M 100 20 L 100 180",
    geoBox: { minLat: 41.840, maxLat: 41.930, minLng: -87.700, maxLng: -87.580 },
  },
  "los angeles": {
    shape: "M 40 60 L 140 50 L 170 100 L 150 160 L 70 160 L 30 110 Z",
    river: "M 30 80 Q 100 90 160 80",
    geoBox: { minLat: 33.700, maxLat: 34.330, minLng: -118.670, maxLng: -118.150 },
  },
  washington: {
    // Diamond-shaped Federal District; Potomac runs the SW edge
    shape: "M 100 30 L 165 75 L 170 130 L 100 170 L 30 130 L 35 75 Z",
    river: "M 20 110 Q 60 140 100 155 T 170 160",
    geoBox: { minLat: 38.820, maxLat: 38.960, minLng: -77.110, maxLng: -76.920 },
  },
};

const generateCityShape = (cityName: string, lat: number = 0, lng: number = 0): CityShape => {
  let seed = cityName.toLowerCase().split('').reduce((a, c) => a + c.charCodeAt(0), 0) + Math.round(Math.abs(lat) * 100) + Math.round(Math.abs(lng) * 100);
  const rng = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };

  const cx = 100, cy = 100, n = 7 + Math.floor(rng() * 4); // 7-10 vertices
  const baseR = 50 + rng() * 20;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const baseAngle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const angleJitter = (rng() - 0.5) * 0.5;
    const radiusJitter = 0.6 + rng() * 0.7;
    const r = baseR * radiusJitter;
    const x = Math.round(cx + Math.cos(baseAngle + angleJitter) * r);
    const y = Math.round(cy + Math.sin(baseAngle + angleJitter) * r);
    pts.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
  }
  const shape = pts.join(' ') + ' Z';

  const rStyle = Math.floor(rng() * 3);
  let river: string;
  if (rStyle === 0) {
    const rx = 60 + Math.round(rng() * 80);
    river = `M ${rx} 20 Q ${rx + Math.round(rng() * 30 - 15)} 90 ${cx} 110 T ${rx - Math.round(rng() * 20)} 180`;
  } else if (rStyle === 1) {
    const ry = 70 + Math.round(rng() * 60);
    river = `M 30 ${ry} Q ${cx} ${ry + Math.round(rng() * 30 - 15)} 170 ${ry + Math.round(rng() * 20 - 10)}`;
  } else {
    river = `M ${30 + Math.round(rng() * 30)} ${30 + Math.round(rng() * 30)} Q ${cx} ${cy} ${140 + Math.round(rng() * 30)} ${140 + Math.round(rng() * 30)}`;
  }

  return { shape, river };
};

export const getCityShape = (cityName: string, lat?: number, lng?: number): CityShape => {
  const key = (cityName || '').toLowerCase().trim();
  if (CITY_SHAPES[key]) return CITY_SHAPES[key];
  for (const k of Object.keys(CITY_SHAPES)) {
    if (key.includes(k) || k.includes(key.split(',')[0].trim())) return CITY_SHAPES[k];
  }
  return generateCityShape(cityName || '', lat, lng);
};

export const computeMinimapDots = (venues: any[]) => {
  const innerLats = venues.map(m => m.originalExhibition?.latitude ?? 0);
  const innerLngs = venues.map(m => m.originalExhibition?.longitude ?? 0);
  const minLat = innerLats.length ? Math.min(...innerLats) : 0;
  const maxLat = innerLats.length ? Math.max(...innerLats) : 0;
  const minLng = innerLngs.length ? Math.min(...innerLngs) : 0;
  const maxLng = innerLngs.length ? Math.max(...innerLngs) : 0;
  const latRange = maxLat - minLat, lngRange = maxLng - minLng;
  const SVG_CENTER = 100;
  const DOT_SPREAD = Math.min(28, 20 + venues.length * 0.5);

  const cols = Math.ceil(Math.sqrt(Math.max(venues.length, 1)));
  const rows = Math.ceil(venues.length / cols);

  const pts = venues.map((venue, i) => {
    const lat = venue.originalExhibition?.latitude ?? 0;
    const lng = venue.originalExhibition?.longitude ?? 0;

    let cx = lngRange < 0.005
      ? SVG_CENTER + ((i % cols) / Math.max(cols - 1, 1) - 0.5) * DOT_SPREAD * 2
      : SVG_CENTER + ((lng - minLng) / lngRange - 0.5) * DOT_SPREAD * 2;
    let cy = latRange < 0.005
      ? SVG_CENTER + (Math.floor(i / cols) / Math.max(rows - 1, 1) - 0.5) * DOT_SPREAD * 2
      : SVG_CENTER - ((lat - minLat) / latRange - 0.5) * DOT_SPREAD * 2;

    // Add jitter if exact same coords
    if (lngRange === 0 && latRange === 0 && venues.length > 1) {
        const baseAngle = (i / venues.length) * 2 * Math.PI;
        cx += Math.cos(baseAngle) * 15;
        cy += Math.sin(baseAngle) * 15;
    }

    return { cx: Math.round(cx), cy: Math.round(cy), id: venue.id, venue };
  });

  const n = pts.length;
  const step = n > 1 ? (2 * Math.PI) / n : 0;
  const off = -Math.PI / 2;
  const LR = Math.max(180, 100 + n * 12); // Radius for labels adapts to venue count
  const LR_X = LR * 1.5; // Stretch horizontally because text is horizontal

  return pts.map((p, i) => {
    const a = off + i * step;
    return {
      ...p,
      lx: Math.round(SVG_CENTER + Math.cos(a) * LR_X),
      ly: Math.round(SVG_CENTER + Math.sin(a) * LR),
      labelAngle: a
    };
  });
};

export interface LayoutCity {
  city: string;
  lat: number;
  lng: number;
  count: number;
  ox: number;
  oy: number;
  shape: string;
  river: string;
  geoBox?: CityGeoBox;
}

export const computeClusterLayout = (clusterCity: string, clusterLat: number, clusterLng: number, venues: any[]) => {
   const MAP = new Map<string, { lat: number, lng: number, count: number }>();
   venues.forEach(v => {
      const cName = v.originalExhibition?.city || clusterCity;
      if (!MAP.has(cName)) MAP.set(cName, { lat: 0, lng: 0, count: 0 });
      const d = MAP.get(cName)!;
      d.lat += (v.originalExhibition?.latitude || clusterLat);
      d.lng += (v.originalExhibition?.longitude || clusterLng);
      d.count += 1;
   });

   let cities = Array.from(MAP.entries()).map(([cityName, data]) => ({
      city: cityName,
      lat: data.lat / data.count,
      lng: data.lng / data.count,
      count: data.count
   })).sort((a, b) => b.count - a.count);

   // ensure the cluster's main city is first
   let mainIdx = cities.findIndex(c => c.city.toLowerCase() === clusterCity.toLowerCase() || clusterCity.toLowerCase().includes(c.city.toLowerCase()));
   if (mainIdx < 0) mainIdx = 0;

   if (mainIdx > 0) {
      const top = cities.splice(mainIdx, 1)[0];
      cities.unshift(top);
   }

   const mainC = cities[0] || { city: clusterCity, lat: clusterLat, lng: clusterLng, count: venues.length };

   const others = cities.slice(1).map(c => {
      const dx = c.lng - mainC.lng;
      const dy = -(c.lat - mainC.lat) * 1.5;
      return { ...c, angle: dx === 0 && dy === 0 ? Math.random() * Math.PI * 2 : Math.atan2(dy, dx) };
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

   const SVG_CENTER = 100;
   const RADIUS = 110;
   const layoutCities: LayoutCity[] = [
       { ...mainC, ox: 0, oy: 0, ...getCityShape(mainC.city, mainC.lat, mainC.lng) },
       ...others.map(c => {
           let ox = Math.cos(c.angle) * RADIUS;
           let oy = Math.sin(c.angle) * RADIUS;
           if (c.city.toLowerCase().includes('vatican')) { ox = 0; oy = 0; }
           return { ...c, ox: Math.round(ox), oy: Math.round(oy), ...getCityShape(c.city, c.lat, c.lng) };
       })
   ];

   // distribute venues around their respected layout cities
   let allDots: any[] = [];
   const venuesByCity = new Map<string, any[]>();
   venues.forEach(v => {
      const cName = v.originalExhibition?.city || clusterCity;
      if (!venuesByCity.has(cName)) venuesByCity.set(cName, []);
      venuesByCity.get(cName)!.push(v);
   });

   layoutCities.forEach(lc => {
       const vList = venuesByCity.get(lc.city) || [];
       if (!vList.length) return;

       const DOT_SPREAD = Math.min(18, 12 + vList.length * 0.5);
       const cols = Math.ceil(Math.sqrt(Math.max(vList.length, 1)));
       const rows = Math.ceil(vList.length / cols);

       const minLat = Math.min(...vList.map(v => v.originalExhibition?.latitude || lc.lat));
       const maxLat = Math.max(...vList.map(v => v.originalExhibition?.latitude || lc.lat));
       const minLng = Math.min(...vList.map(v => v.originalExhibition?.longitude || lc.lng));
       const maxLng = Math.max(...vList.map(v => v.originalExhibition?.longitude || lc.lng));
       const latRange = maxLat - minLat, lngRange = maxLng - minLng;

       let pts = vList.map((venue, i) => {
           const lat = venue.originalExhibition?.latitude || lc.lat;
           const lng = venue.originalExhibition?.longitude || lc.lng;
           let cx = lngRange < 0.005 ? SVG_CENTER + ((i % cols) / Math.max(cols - 1, 1) - 0.5) * DOT_SPREAD * 2 : SVG_CENTER + ((lng - minLng) / lngRange - 0.5) * DOT_SPREAD * 2;
           let cy = latRange < 0.005 ? SVG_CENTER + (Math.floor(i / cols) / Math.max(rows - 1, 1) - 0.5) * DOT_SPREAD * 2 : SVG_CENTER - ((lat - minLat) / latRange - 0.5) * DOT_SPREAD * 2;
           if (lngRange === 0 && latRange === 0 && vList.length > 1) {
               const ba = (i / vList.length) * 2 * Math.PI;
               cx += Math.cos(ba) * 15;
               cy += Math.sin(ba) * 15;
           }
           return { cx, cy, id: venue.id, venue };
       });

       const n = pts.length;
       const step = n > 1 ? (2 * Math.PI) / n : 0;
       const off = -Math.PI / 2;

       // Tighter zoom label boundaries
       const LR = Math.max(90, 60 + n * 6);
       const LR_X = LR * 1.15;

       pts.forEach((pt, i) => {
           const a = off + i * step;
           allDots.push({
               ...pt,
               cx: Math.round(pt.cx + lc.ox),
               cy: Math.round(pt.cy + lc.oy),
               lx: Math.round(SVG_CENTER + lc.ox + Math.cos(a) * LR_X),
               ly: Math.round(SVG_CENTER + lc.oy + Math.sin(a) * LR),
               labelAngle: a,
               lc
           });
       });
   });

   return { layoutCities, minimapDots: allDots };
};
