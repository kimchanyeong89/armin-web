#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Defer topojson imports to runtime to allow graceful skip when not installed
let topology, mesh, presimplify, simplify, quantile;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readJSON(p) {
  const raw = await fs.readFile(p, 'utf8');
  return JSON.parse(raw);
}
async function writeJSON(p, obj) {
  await fs.writeFile(p, JSON.stringify(obj));
  console.log('Wrote', p);
}

// --- No-deps fallback: simplify GeoJSON polygons into MultiLineString linework ---
function dpSimplifyLine(coords, tol) {
  if (!Array.isArray(coords) || coords.length <= 2) return coords;
  const sqTol = tol * tol;
  const kept = new Uint8Array(coords.length);
  kept[0] = 1; kept[coords.length - 1] = 1;
  const stack = [[0, coords.length - 1]];
  const sqSegDist = (p, a, b) => {
    const x = p[0], y = p[1], x1 = a[0], y1 = a[1], x2 = b[0], y2 = b[1];
    let dx = x2 - x1, dy = y2 - y1;
    if (dx === 0 && dy === 0) { dx = x - x1; dy = y - y1; return dx * dx + dy * dy; }
    const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
    const xt = t < 0 ? x1 : t > 1 ? x2 : x1 + t * dx;
    const yt = t < 0 ? y1 : t > 1 ? y2 : y1 + t * dy;
    dx = x - xt; dy = y - yt; return dx * dx + dy * dy;
  };
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = -1, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = sqSegDist(coords[i], coords[s], coords[e]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > sqTol && idx >= 0) {
      kept[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out = [];
  for (let i = 0; i < coords.length; i++) if (kept[i]) out.push(coords[i]);
  return out.length >= 2 ? out : coords.slice(0, 2);
}

function extractRingsToLinework(fc) {
  const lines = [];
  const feats = (fc && fc.features) || [];
  for (const f of feats) {
    const g = f && f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') {
      for (const ring of g.coordinates || []) lines.push(ring);
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates || []) for (const ring of poly) lines.push(ring);
    }
  }
  return lines;
}

async function fallbackSimplifyGeojson(pub, tolAdmin0 = 0.22, tolAdmin1 = 0.18) {
  try {
    const admin0Src = path.join(pub, 'ne_110m_admin_0_countries.geojson');
    const admin1Src = path.join(pub, 'ne_50m_admin_1_states_provinces.geojson');

    const admin0 = await readJSON(admin0Src);
    const admin1 = await readJSON(admin1Src).catch(() => null);

    const a0Lines = extractRingsToLinework(admin0).map(r => dpSimplifyLine(r, tolAdmin0));
    const a1Lines = admin1 ? extractRingsToLinework(admin1).map(r => dpSimplifyLine(r, tolAdmin1)) : null;

    const a0Out = { type: 'FeatureCollection', features: [ { type: 'Feature', properties: { level: 'admin0', simplified: tolAdmin0 }, geometry: { type: 'MultiLineString', coordinates: a0Lines } } ] };
    await writeJSON(path.join(pub, 'simplified-admin0-lines.geojson'), a0Out);
    if (a1Lines) {
      const a1Out = { type: 'FeatureCollection', features: [ { type: 'Feature', properties: { level: 'admin1', simplified: tolAdmin1 }, geometry: { type: 'MultiLineString', coordinates: a1Lines } } ] };
      await writeJSON(path.join(pub, 'simplified-admin1-lines.geojson'), a1Out);
    }
    console.log('[build:admin-lines] fallback simplification complete');
  } catch (e) {
    console.warn('[build:admin-lines] fallback simplification failed:', e?.message || e);
  }
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const pub = path.join(root, 'public', 'atlas');

  // Try load topojson modules dynamically
  try {
    ({ topology } = await import('topojson-server'));
    ({ mesh } = await import('topojson-client'));
    ({ presimplify, simplify, quantile } = await import('topojson-simplify'));
  } catch (e) {
    console.warn('[build:admin-lines] topojson packages not available; using fallback simplifier');
    await fallbackSimplifyGeojson(pub);
    return;
  }

  // Load NE country and state sources
  const countriesTopo = await readJSON(path.join(pub, 'countries-50m.json')).catch(() => null)
    || await readJSON(path.join(pub, 'countries-110m.json')).catch(() => null)
    || await readJSON(path.join(pub, 'package', 'countries-50m.json')).catch(() => null);
  if (!countriesTopo || countriesTopo.type !== 'Topology') throw new Error('countries TopoJSON missing');
  const countriesObj = countriesTopo.objects.countries || Object.values(countriesTopo.objects)[0];

  // Build linework by boundary mesh (admin-0)
  const admin0Mesh = mesh(countriesTopo, countriesObj, (a, b) => a !== b);
  const admin0Topo = topology({ admin0: admin0Mesh });
  presimplify(admin0Topo);
  simplify(admin0Topo, quantile(admin0Topo, 0.65)); // strong simplification
  await writeJSON(path.join(pub, 'simplified-admin0-lines.geojson'), admin0Topo.objects.admin0);

  // States/provinces
  const statesTopoPath = path.join(pub, 'states-10m.json');
  const statesTopo = await readJSON(statesTopoPath).catch(() => null);
  if (statesTopo && statesTopo.type === 'Topology') {
    const statesObj = statesTopo.objects.states || Object.values(statesTopo.objects)[0];
    const admin1Mesh = mesh(statesTopo, statesObj, (a, b) => a !== b);
  const admin1Topo = topology({ admin1: admin1Mesh });
    presimplify(admin1Topo);
    simplify(admin1Topo, quantile(admin1Topo, 0.7)); // even stronger
    await writeJSON(path.join(pub, 'simplified-admin1-lines.geojson'), admin1Topo.objects.admin1);
  } else {
    console.warn('states-10m TopoJSON not found; skipping admin1 lines');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
