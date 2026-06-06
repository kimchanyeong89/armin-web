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
    // Box widened SW to absorb the Brücke-Museum (Dahlem) outlier
    geoBox: { minLat: 52.445, maxLat: 52.560, minLng: 13.250, maxLng: 13.470 },
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
  "hong kong": {
    // Kowloon/NT mass (north) + Hong Kong Island (south) with a sliver-thin
    // Victoria Harbour between them — keeping the two-landmass silhouette
    // recognisable while preventing dots from drifting into a wide harbour gap.
    shape: "M 30 30 L 165 35 L 175 70 L 175 105 L 165 120 L 100 125 L 35 120 L 30 95 Z M 30 140 L 100 130 L 175 140 L 175 160 L 100 175 L 30 160 Z",
    river: "M 25 130 Q 100 125 175 132",
    geoBox: { minLat: 22.250, maxLat: 22.350, minLng: 114.130, maxLng: 114.220 },
  },
  taipei: {
    // Taipei basin ringed by mountains, Tamsui River cuts NW→SE
    shape: "M 50 50 L 140 40 L 170 70 L 165 130 L 130 165 L 70 170 L 40 130 Z",
    river: "M 30 30 Q 90 90 130 120 T 175 175",
    geoBox: { minLat: 25.000, maxLat: 25.200, minLng: 121.450, maxLng: 121.650 },
  },
  busan: {
    // Hilly port city along the SE coast; harbour to the east
    shape: "M 55 35 L 135 40 L 160 80 L 165 140 L 130 175 L 75 170 L 45 130 L 40 70 Z",
    river: "M 25 50 Q 35 100 30 170",
    geoBox: { minLat: 35.080, maxLat: 35.260, minLng: 128.960, maxLng: 129.220 },
  },
  hangzhou: {
    // West Lake on the west side, Qiantang River on the SE
    shape: "M 50 60 L 100 35 L 160 50 L 170 100 L 155 155 L 90 165 L 40 130 Z",
    river: "M 110 30 Q 130 100 150 130 T 180 175",
    geoBox: { minLat: 30.180, maxLat: 30.320, minLng: 120.080, maxLng: 120.260 },
  },
  guangzhou: {
    // Pearl River bisects the city W→E
    shape: "M 50 50 L 140 40 L 170 80 L 160 140 L 100 165 L 50 145 L 35 90 Z",
    river: "M 20 110 Q 80 100 120 115 T 180 130",
    geoBox: { minLat: 23.050, maxLat: 23.220, minLng: 113.180, maxLng: 113.450 },
  },
  nanjing: {
    // Yangtze sweeps along the NW; Purple Mountain to the east
    shape: "M 55 70 L 110 55 L 165 70 L 175 115 L 145 165 L 80 170 L 35 130 Z",
    river: "M 20 30 Q 70 50 100 75 T 180 115",
    geoBox: { minLat: 32.000, maxLat: 32.140, minLng: 118.700, maxLng: 118.900 },
  },
  shenzhen: {
    // E-W elongated city; deep bay (Pearl River Estuary) to the south
    shape: "M 30 60 L 170 50 L 175 100 L 160 140 L 100 145 L 40 125 Z",
    river: "M 20 165 Q 100 155 180 165",
    geoBox: { minLat: 22.450, maxLat: 22.650, minLng: 113.850, maxLng: 114.300 },
  },
  yasugi: {
    // Small town in Shimane; Nakaumi lagoon to the north
    shape: "M 60 70 L 130 60 L 160 100 L 140 150 L 80 160 L 50 110 Z",
    river: "M 25 35 Q 100 25 175 35",
    geoBox: { minLat: 35.350, maxLat: 35.450, minLng: 133.150, maxLng: 133.260 },
  },
  kanazawa: {
    // Old castle town sandwiched between Sai-gawa and Asano-gawa
    shape: "M 50 60 L 140 50 L 165 90 L 160 150 L 90 165 L 40 120 Z",
    river: "M 25 70 Q 80 88 100 96 T 175 116 M 25 135 Q 80 148 100 152 T 175 168",
    geoBox: { minLat: 36.510, maxLat: 36.610, minLng: 136.600, maxLng: 136.730 },
  },
  taichung: {
    // Central Taiwan basin; Da-an / Dajia rivers along the north
    shape: "M 55 70 L 145 55 L 170 100 L 150 160 L 80 170 L 40 125 Z",
    river: "M 20 35 Q 90 60 140 50 T 180 85",
    geoBox: { minLat: 24.080, maxLat: 24.220, minLng: 120.580, maxLng: 120.780 },
  },
  jeonju: {
    // Hanok-village city; Jeonjucheon stream runs through center
    shape: "M 60 70 L 130 60 L 160 100 L 140 155 L 75 165 L 45 115 Z",
    river: "M 30 50 Q 80 100 120 130 T 175 175",
    geoBox: { minLat: 35.780, maxLat: 35.860, minLng: 127.100, maxLng: 127.200 },
  },
  gwangju: {
    // Gwangjucheon to the south of center; Mudeungsan east
    shape: "M 50 60 L 135 50 L 165 95 L 145 155 L 80 170 L 40 110 Z",
    river: "M 25 80 Q 80 110 120 105 T 175 130",
    geoBox: { minLat: 35.120, maxLat: 35.220, minLng: 126.830, maxLng: 126.970 },
  },
  gwacheon: {
    // Small satellite city south of Seoul, ringed by mountains
    shape: "M 70 80 L 135 70 L 155 110 L 140 150 L 85 160 L 55 120 Z",
    river: "",
    geoBox: { minLat: 37.380, maxLat: 37.480, minLng: 126.940, maxLng: 127.060 },
  },
  yongin: {
    // Hilly Gyeonggi city — Hoam Museum sits in a wooded valley
    shape: "M 60 60 L 140 50 L 165 95 L 155 155 L 80 165 L 45 120 Z",
    river: "",
    geoBox: { minLat: 37.220, maxLat: 37.340, minLng: 127.140, maxLng: 127.280 },
  },
  istanbul: {
    // Bosphorus splits European (west) and Asian (east) sides; Golden Horn cuts west.
    // geoBox focuses on the museum-heavy old city peninsula (European side) plus a
    // sliver of the Asian shore so dots stay on a landmass.
    shape: "M 30 50 L 90 40 L 95 100 L 100 165 L 45 170 L 25 120 Z M 110 45 L 175 50 L 180 110 L 160 170 L 110 165 L 105 100 Z",
    river: "M 100 20 Q 105 95 100 180 M 90 75 Q 60 72 25 68",
    geoBox: { minLat: 40.985, maxLat: 41.060, minLng: 28.940, maxLng: 29.050 },
  },
  singapore: {
    // Diamond-shaped island state
    shape: "M 100 30 L 165 90 L 170 130 L 100 175 L 30 130 L 35 90 Z",
    river: "M 75 110 Q 100 115 125 110",
    geoBox: { minLat: 1.220, maxLat: 1.470, minLng: 103.600, maxLng: 104.020 },
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

  // ── France (regional cities) ────────────────────────────────────────────
  nice: {
    // Riviera city; Mediterranean coast to the south, Paillon river through center
    shape: "M 40 50 L 160 45 L 175 90 L 160 130 L 90 140 L 40 110 Z",
    river: "M 100 30 Q 95 80 100 140",
    geoBox: { minLat: 43.670, maxLat: 43.760, minLng: 7.210, maxLng: 7.330 },
  },
  lille: {
    shape: "M 55 55 L 140 50 L 165 95 L 150 150 L 75 155 L 45 105 Z",
    river: "M 30 70 Q 90 100 130 95 T 180 120",
    geoBox: { minLat: 50.590, maxLat: 50.670, minLng: 3.000, maxLng: 3.130 },
  },
  rouen: {
    // The Seine sweeps in a broad bend through Rouen
    shape: "M 50 60 L 140 50 L 165 95 L 145 150 L 70 160 L 40 110 Z",
    river: "M 25 80 Q 80 115 110 95 T 180 135",
    geoBox: { minLat: 49.400, maxLat: 49.490, minLng: 1.030, maxLng: 1.170 },
  },
  lyon: {
    // Presqu'île peninsula between the Rhône and Saône, which merge in the south
    shape: "M 60 40 L 130 45 L 155 90 L 145 160 L 90 170 L 55 120 Z",
    river: "M 75 20 Q 88 90 100 115 T 95 185 M 132 25 Q 112 90 100 115",
    geoBox: { minLat: 45.720, maxLat: 45.810, minLng: 4.780, maxLng: 4.900 },
  },
  chantilly: {
    // Small town wrapped in forest; the Nonette threads through
    shape: "M 60 65 L 135 55 L 160 100 L 140 150 L 75 160 L 50 110 Z",
    river: "M 30 90 Q 90 110 130 105 T 180 120",
    geoBox: { minLat: 49.150, maxLat: 49.240, minLng: 2.430, maxLng: 2.550 },
  },
  albi: {
    // The Tarn river curves past the brick old town
    shape: "M 55 60 L 135 55 L 160 100 L 145 150 L 75 160 L 45 110 Z",
    river: "M 25 75 Q 80 110 120 100 T 180 125",
    geoBox: { minLat: 43.890, maxLat: 43.970, minLng: 2.090, maxLng: 2.200 },
  },
  grenoble: {
    // Alpine basin ringed by mountains; the Isère arcs along the north
    shape: "M 50 70 L 130 55 L 165 90 L 155 150 L 85 165 L 40 120 Z",
    river: "M 25 60 Q 90 95 130 110 T 180 150",
    geoBox: { minLat: 45.150, maxLat: 45.240, minLng: 5.670, maxLng: 5.800 },
  },
  "aix-en-provence": {
    shape: "M 60 60 L 135 55 L 160 100 L 145 155 L 80 165 L 48 115 Z",
    river: "",
    geoBox: { minLat: 43.490, maxLat: 43.570, minLng: 5.390, maxLng: 5.510 },
  },
  strasbourg: {
    // Grande Île ringed by the Ill; the Rhine forms the eastern border
    shape: "M 55 55 L 140 50 L 165 95 L 150 150 L 75 160 L 45 105 Z",
    river: "M 30 80 Q 90 110 130 100 T 180 120 M 60 135 Q 95 122 125 138",
    geoBox: { minLat: 48.540, maxLat: 48.630, minLng: 7.690, maxLng: 7.820 },
  },
  bordeaux: {
    // The Garonne carves the famous crescent — the "Port de la Lune"
    shape: "M 50 50 L 130 45 L 160 85 L 155 145 L 90 165 L 45 120 Z",
    river: "M 85 20 Q 140 70 128 120 T 88 185",
    geoBox: { minLat: 44.790, maxLat: 44.880, minLng: -0.640, maxLng: -0.520 },
  },
  versailles: {
    // Palace town SW of Paris; formal gardens, no major river
    shape: "M 60 60 L 140 55 L 160 100 L 145 150 L 75 160 L 50 110 Z",
    river: "",
    geoBox: { minLat: 48.770, maxLat: 48.840, minLng: 2.070, maxLng: 2.180 },
  },
  "charenton-le-pont": {
    // SE Paris suburb where the Marne joins the Seine
    shape: "M 65 65 L 135 60 L 158 105 L 140 150 L 78 158 L 52 112 Z",
    river: "M 30 70 Q 90 100 108 120 T 100 182 M 175 75 Q 130 105 108 120",
    geoBox: { minLat: 48.790, maxLat: 48.850, minLng: 2.370, maxLng: 2.460 },
  },
  marseille: {
    // Mediterranean port; the Vieux-Port notches the southern coast
    shape: "M 45 50 L 160 45 L 175 90 L 160 140 L 112 132 L 108 152 L 40 112 Z",
    river: "",
    geoBox: { minLat: 43.250, maxLat: 43.340, minLng: 5.300, maxLng: 5.420 },
  },
  montpellier: {
    // Southern France; the Lez river runs N→S to the east
    shape: "M 55 60 L 140 55 L 165 100 L 150 155 L 80 165 L 48 115 Z",
    river: "M 125 25 Q 120 90 130 140 T 125 185",
    geoBox: { minLat: 43.570, maxLat: 43.660, minLng: 3.820, maxLng: 3.940 },
  },
  roubaix: {
    // Industrial town near Lille; a canal cuts W→E
    shape: "M 60 65 L 135 58 L 160 100 L 145 150 L 78 158 L 52 110 Z",
    river: "M 30 75 Q 100 100 175 125",
    geoBox: { minLat: 50.660, maxLat: 50.730, minLng: 3.120, maxLng: 3.230 },
  },

  // ── United Kingdom (regional cities) ─────────────────────────────────────
  liverpool: {
    // City along the Mersey estuary mouth
    shape: "M 60 40 L 140 45 L 160 90 L 150 150 L 80 160 L 50 100 Z",
    river: "M 20 130 Q 80 152 120 130 T 185 142",
    geoBox: { minLat: 53.360, maxLat: 53.450, minLng: -3.050, maxLng: -2.920 },
  },
  manchester: {
    // Canal city; the Irwell winds through
    shape: "M 50 55 L 140 50 L 165 95 L 150 150 L 75 160 L 42 110 Z",
    river: "M 70 25 Q 85 90 100 112 T 80 185",
    geoBox: { minLat: 53.440, maxLat: 53.520, minLng: -2.310, maxLng: -2.180 },
  },
  "st ives": {
    // Cornish coastal town on a craggy peninsula
    shape: "M 50 70 L 150 60 L 170 100 L 138 128 L 130 160 L 70 152 L 40 108 Z",
    river: "",
    geoBox: { minLat: 50.180, maxLat: 50.250, minLng: -5.530, maxLng: -5.430 },
  },
  cardiff: {
    // Welsh capital; the Taff flows S into Cardiff Bay
    shape: "M 55 50 L 140 50 L 160 95 L 150 150 L 80 165 L 45 105 Z",
    river: "M 95 25 Q 100 90 105 145 T 100 185",
    geoBox: { minLat: 51.440, maxLat: 51.530, minLng: -3.240, maxLng: -3.120 },
  },

  // ── Italy (regional cities) ──────────────────────────────────────────────
  turin: {
    // Grid-plan city against the Alps; the Po runs along the east
    shape: "M 55 50 L 145 50 L 160 95 L 150 155 L 70 155 L 50 95 Z",
    river: "M 132 25 Q 116 90 106 112 T 122 185",
    geoBox: { minLat: 45.030, maxLat: 45.120, minLng: 7.480, maxLng: 7.720 },
  },
  naples: {
    // Bay of Naples scoops the southern edge; Vesuvius looms east
    shape: "M 40 50 L 150 45 L 165 85 L 150 120 L 100 135 L 40 105 Z",
    river: "",
    geoBox: { minLat: 40.810, maxLat: 40.900, minLng: 14.190, maxLng: 14.310 },
  },

  // ── Spain ────────────────────────────────────────────────────────────────
  madrid: {
    // Inland capital; the slim Manzanares skirts the SW
    shape: "M 55 55 L 145 50 L 165 95 L 150 155 L 75 160 L 45 105 Z",
    river: "M 48 35 Q 70 100 92 132 T 132 185",
    geoBox: { minLat: 40.395, maxLat: 40.430, minLng: -3.715, maxLng: -3.680 },
  },
  barcelona: {
    // Mediterranean coast (SE); rigid Eixample grid between two rivers
    shape: "M 45 60 L 150 45 L 175 80 L 160 130 L 90 145 L 40 110 Z",
    river: "",
    geoBox: { minLat: 41.360, maxLat: 41.410, minLng: 2.140, maxLng: 2.220 },
  },
  bilbao: {
    // The Nervión estuary snakes through the city
    shape: "M 55 55 L 140 50 L 165 95 L 150 150 L 75 160 L 45 105 Z",
    river: "M 25 90 Q 80 120 110 95 T 180 110",
    geoBox: { minLat: 43.230, maxLat: 43.310, minLng: -3.000, maxLng: -2.870 },
  },
  figueres: {
    // Small Catalan town, home of the Dalí Theatre-Museum
    shape: "M 60 65 L 135 58 L 160 100 L 145 150 L 78 160 L 52 112 Z",
    river: "",
    geoBox: { minLat: 42.230, maxLat: 42.310, minLng: 2.900, maxLng: 3.020 },
  },

  // ── Germany (regional cities) ────────────────────────────────────────────
  frankfurt: {
    // The Main river bisects the city W→E
    shape: "M 50 55 L 145 50 L 168 95 L 150 150 L 75 160 L 42 108 Z",
    river: "M 25 105 Q 80 130 120 110 T 180 125",
    geoBox: { minLat: 50.060, maxLat: 50.150, minLng: 8.610, maxLng: 8.740 },
  },
  hamburg: {
    // Port city on the Elbe; the Alster lake sits in the core
    shape: "M 50 55 L 145 50 L 165 95 L 152 150 L 75 160 L 42 105 Z",
    river: "M 25 120 Q 90 142 130 126 T 185 136",
    geoBox: { minLat: 53.510, maxLat: 53.600, minLng: 9.940, maxLng: 10.070 },
  },

  // ── Switzerland ──────────────────────────────────────────────────────────
  basel: {
    // The Rhine makes a sharp knee-bend through Basel
    shape: "M 55 60 L 140 50 L 165 90 L 155 150 L 80 160 L 45 110 Z",
    river: "M 30 130 Q 80 128 100 95 T 112 20",
    geoBox: { minLat: 47.540, maxLat: 47.610, minLng: 7.580, maxLng: 7.680 },
  },
  zurich: {
    // City at the head of Lake Zurich; the Limmat drains north
    shape: "M 55 50 L 145 50 L 165 95 L 150 145 L 100 160 L 90 130 L 45 100 Z",
    river: "M 98 158 Q 100 110 98 78 T 95 22",
    geoBox: { minLat: 47.330, maxLat: 47.410, minLng: 8.490, maxLng: 8.610 },
  },
  geneva: {
    // City at the tip of Lake Geneva, where the Rhône exits
    shape: "M 55 55 L 145 50 L 165 95 L 150 145 L 100 158 L 88 125 L 45 100 Z",
    river: "M 95 155 Q 95 110 88 86 T 58 24",
    geoBox: { minLat: 46.160, maxLat: 46.240, minLng: 6.100, maxLng: 6.220 },
  },

  // ── Netherlands (regional cities) ────────────────────────────────────────
  "the hague": {
    // Seat of government near the North Sea coast (west)
    shape: "M 55 50 L 150 55 L 165 100 L 150 155 L 75 160 L 48 100 Z",
    river: "",
    geoBox: { minLat: 52.040, maxLat: 52.120, minLng: 4.250, maxLng: 4.380 },
  },
  otterlo: {
    // Village inside the Hoge Veluwe national park
    shape: "M 60 65 L 138 58 L 162 100 L 145 150 L 78 160 L 52 112 Z",
    river: "",
    geoBox: { minLat: 52.060, maxLat: 52.130, minLng: 5.760, maxLng: 5.880 },
  },

  // ── Denmark (regional cities) ────────────────────────────────────────────
  aarhus: {
    // Jutland's east-coast city on a bay; the Aarhus Å runs through
    shape: "M 50 55 L 130 50 L 150 90 L 145 150 L 80 160 L 45 100 Z",
    river: "M 175 110 Q 120 122 90 106 T 35 116",
    geoBox: { minLat: 56.110, maxLat: 56.200, minLng: 10.140, maxLng: 10.260 },
  },
  skagen: {
    // The sandy spit at Denmark's northern tip, where two seas meet
    shape: "M 60 135 L 88 55 L 118 32 L 142 58 L 132 118 L 110 165 L 74 162 Z",
    river: "",
    geoBox: { minLat: 57.690, maxLat: 57.760, minLng: 10.540, maxLng: 10.660 },
  },

  // ── Rest of Europe ───────────────────────────────────────────────────────
  krakow: {
    // The Vistula loops past Wawel Hill
    shape: "M 55 55 L 145 50 L 165 95 L 150 150 L 75 160 L 45 105 Z",
    river: "M 25 95 Q 80 132 110 100 T 180 132",
    geoBox: { minLat: 50.030, maxLat: 50.080, minLng: 19.890, maxLng: 19.970 },
  },
  athens: {
    // Inland basin; the Acropolis rises near the center
    shape: "M 50 60 L 145 50 L 170 95 L 155 155 L 75 160 L 42 110 Z",
    river: "",
    geoBox: { minLat: 37.960, maxLat: 38.000, minLng: 23.710, maxLng: 23.750 },
  },
  oslo: {
    // City wrapped around the head of the Oslofjord
    shape: "M 50 50 L 150 50 L 165 95 L 150 130 L 100 145 L 95 120 L 45 95 Z",
    river: "M 96 145 Q 99 116 100 90",
    geoBox: { minLat: 59.880, maxLat: 59.930, minLng: 10.690, maxLng: 10.790 },
  },
  "saint petersburg": {
    // Neva delta laced with canals
    shape: "M 45 60 L 150 50 L 170 90 L 160 145 L 80 160 L 40 115 Z",
    river: "M 25 85 Q 80 110 120 95 T 180 120 M 92 102 Q 96 132 76 160",
    geoBox: { minLat: 59.920, maxLat: 59.960, minLng: 30.290, maxLng: 30.360 },
  },
  lisbon: {
    // Hilly city on the broad Tagus estuary (south)
    shape: "M 50 50 L 145 50 L 165 95 L 150 135 L 100 145 L 45 120 Z",
    river: "M 25 140 Q 90 158 130 142 T 185 152",
    geoBox: { minLat: 38.700, maxLat: 38.780, minLng: -9.220, maxLng: -9.090 },
  },
  brussels: {
    // Inland capital; the Senne (largely covered) runs N→S
    shape: "M 55 55 L 145 50 L 168 95 L 152 150 L 75 160 L 44 108 Z",
    river: "M 80 25 Q 95 90 100 116 T 90 185",
    geoBox: { minLat: 50.800, maxLat: 50.880, minLng: 4.300, maxLng: 4.420 },
  },
  prague: {
    // The Vltava snakes an S-curve through the city
    shape: "M 50 55 L 145 50 L 165 95 L 152 150 L 75 160 L 42 105 Z",
    river: "M 88 20 Q 132 70 96 112 T 112 185",
    geoBox: { minLat: 50.050, maxLat: 50.130, minLng: 14.360, maxLng: 14.480 },
  },
  stockholm: {
    // Archipelago capital spread over islands and channels
    shape: "M 55 50 L 110 45 L 120 80 L 162 75 L 172 120 L 130 130 L 100 165 L 60 150 L 45 100 Z",
    river: "M 108 92 Q 132 110 112 132",
    geoBox: { minLat: 59.290, maxLat: 59.370, minLng: 18.010, maxLng: 18.140 },
  },

  // ── North America (regional cities) ──────────────────────────────────────
  "san francisco": {
    // Tip of a peninsula; San Francisco Bay wraps the east
    shape: "M 70 40 L 112 40 L 116 92 L 130 130 L 120 165 L 70 160 L 74 100 Z",
    river: "M 132 30 Q 148 100 132 175",
    geoBox: { minLat: 37.750, maxLat: 37.810, minLng: -122.490, maxLng: -122.390 },
  },
  boston: {
    // Harbour city on a peninsula; the Charles river curls along the NW
    shape: "M 55 60 L 130 50 L 145 85 L 165 110 L 140 155 L 80 160 L 50 110 Z",
    river: "M 25 75 Q 80 98 110 86 T 175 120",
    geoBox: { minLat: 42.300, maxLat: 42.380, minLng: -71.160, maxLng: -71.030 },
  },
  houston: {
    // Flat, sprawling city; Buffalo Bayou meanders W→E
    shape: "M 50 60 L 150 55 L 170 100 L 155 150 L 75 160 L 42 110 Z",
    river: "M 25 95 Q 90 115 130 100 T 180 120",
    geoBox: { minLat: 29.680, maxLat: 29.770, minLng: -95.450, maxLng: -95.330 },
  },
  bentonville: {
    // Small Arkansas town, home of Crystal Bridges
    shape: "M 60 65 L 138 58 L 162 100 L 145 150 L 78 160 L 52 112 Z",
    river: "",
    geoBox: { minLat: 36.340, maxLat: 36.430, minLng: -94.260, maxLng: -94.150 },
  },
  cleveland: {
    // On the south shore of Lake Erie; the Cuyahoga river bends through
    shape: "M 50 72 L 150 66 L 165 105 L 150 155 L 75 160 L 45 112 Z",
    river: "M 95 32 Q 90 82 100 108 T 95 175",
    geoBox: { minLat: 41.470, maxLat: 41.550, minLng: -81.670, maxLng: -81.550 },
  },
  philadelphia: {
    // Between the Delaware (east) and Schuylkill (west) rivers
    shape: "M 55 55 L 140 50 L 165 95 L 150 150 L 75 160 L 45 105 Z",
    river: "M 132 25 Q 122 90 112 112 T 132 185 M 60 30 Q 76 90 92 116 T 76 185",
    geoBox: { minLat: 39.920, maxLat: 40.010, minLng: -75.240, maxLng: -75.120 },
  },
  atlanta: {
    // Inland city on a low plateau
    shape: "M 55 60 L 145 52 L 168 98 L 152 152 L 76 162 L 44 110 Z",
    river: "",
    geoBox: { minLat: 33.750, maxLat: 33.830, minLng: -84.450, maxLng: -84.320 },
  },
  detroit: {
    // The Detroit river runs along the southern edge
    shape: "M 50 55 L 145 50 L 165 95 L 152 145 L 100 160 L 75 150 L 42 100 Z",
    river: "M 30 130 Q 90 152 130 136 T 185 150",
    geoBox: { minLat: 42.320, maxLat: 42.400, minLng: -83.130, maxLng: -83.000 },
  },
  "san marino": {
    // Small city in LA County, home of the Huntington
    shape: "M 62 65 L 138 58 L 160 100 L 145 150 L 78 160 L 52 112 Z",
    river: "",
    geoBox: { minLat: 34.090, maxLat: 34.170, minLng: -118.170, maxLng: -118.050 },
  },
  montreal: {
    // City on an island in the St. Lawrence river
    shape: "M 50 70 Q 100 50 160 75 Q 178 110 150 142 Q 90 162 45 130 Z",
    river: "M 25 92 Q 95 76 165 96 M 30 146 Q 100 168 172 146",
    geoBox: { minLat: 45.460, maxLat: 45.540, minLng: -73.640, maxLng: -73.520 },
  },
  "mexico city": {
    // Vast inland city on a high plateau (former lakebed)
    shape: "M 50 55 L 150 50 L 170 100 L 155 155 L 75 165 L 42 110 Z",
    river: "",
    geoBox: { minLat: 19.310, maxLat: 19.400, minLng: -99.220, maxLng: -99.100 },
  },

  // ── South America ────────────────────────────────────────────────────────
  "são paulo": {
    // Inland megacity on a plateau; the Tietê river winds along the north
    shape: "M 50 60 L 150 52 L 170 100 L 152 155 L 75 162 L 44 110 Z",
    river: "M 25 90 Q 90 115 130 95 T 185 110",
    geoBox: { minLat: -23.600, maxLat: -23.520, minLng: -46.720, maxLng: -46.590 },
  },

  // ── Oceania ──────────────────────────────────────────────────────────────
  sydney: {
    // Harbour city; Sydney Harbour cuts a jagged inlet from the east
    shape: "M 45 55 L 110 50 L 122 76 L 165 70 L 175 115 L 120 122 L 100 165 L 50 150 Z",
    river: "M 185 92 Q 130 104 110 84 T 40 70",
    geoBox: { minLat: -33.890, maxLat: -33.840, minLng: 151.190, maxLng: 151.240 },
  },
  melbourne: {
    // The Yarra winds through; Port Phillip Bay opens to the south
    shape: "M 50 50 L 150 50 L 165 95 L 150 130 L 100 135 L 95 165 L 45 100 Z",
    river: "M 25 80 Q 85 102 120 90 T 180 110",
    geoBox: { minLat: -37.860, maxLat: -37.780, minLng: 144.910, maxLng: 145.030 },
  },
  brisbane: {
    // The Brisbane river loops in tight bends through the city
    shape: "M 50 55 L 145 50 L 168 95 L 152 150 L 75 162 L 42 108 Z",
    river: "M 80 20 Q 132 70 92 112 T 122 185",
    geoBox: { minLat: -27.510, maxLat: -27.430, minLng: 152.960, maxLng: 153.080 },
  },
  wellington: {
    // New Zealand capital wrapped around a near-circular harbour
    shape: "M 55 50 L 145 50 L 160 90 L 150 130 L 100 140 L 90 165 L 50 120 Z",
    river: "M 95 140 Q 100 112 100 86",
    geoBox: { minLat: -41.330, maxLat: -41.250, minLng: 174.720, maxLng: 174.840 },
  },

  // ── Africa & Middle East ─────────────────────────────────────────────────
  cairo: {
    // The Nile runs N→S straight through the city
    shape: "M 50 50 L 150 50 L 170 95 L 155 155 L 75 165 L 42 105 Z",
    river: "M 95 20 Q 90 90 100 116 T 95 185",
    geoBox: { minLat: 29.990, maxLat: 30.060, minLng: 31.200, maxLng: 31.290 },
  },
  giza: {
    // West bank of the Nile, in the Cairo metro area; pyramids to the SW
    shape: "M 55 55 L 145 50 L 165 100 L 150 155 L 78 162 L 48 108 Z",
    river: "M 150 25 Q 140 90 150 122 T 145 185",
    geoBox: { minLat: 29.950, maxLat: 30.030, minLng: 31.070, maxLng: 31.200 },
  },
  "cape town": {
    // Table Mountain inland; an Atlantic bay opens to the south
    shape: "M 55 50 L 145 50 L 165 95 L 150 130 L 100 140 L 95 165 L 48 110 Z",
    river: "",
    geoBox: { minLat: -33.950, maxLat: -33.870, minLng: 18.360, maxLng: 18.480 },
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
