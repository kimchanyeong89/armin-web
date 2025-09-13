#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { topology } from 'topojson-server';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import { feature as topojsonFeature } from 'topojson-client';

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

function toFeatureArray(raw, preferKeys = []) {
  if (!raw) return [];
  if (raw.type === 'FeatureCollection') return raw.features || [];
  if (raw.type === 'Topology' && raw.objects) {
    const keys = Object.keys(raw.objects);
    let picked = null;
    for (const pref of preferKeys) {
      const hit = keys.find(k => k.toLowerCase().includes(pref));
      if (hit) { picked = hit; break; }
    }
    if (!picked) picked = keys[0];
    const fc = topojsonFeature(raw, raw.objects[picked]);
    return fc.features || [];
  }
  return [];
}

async function build() {
  const root = path.resolve(__dirname, '..');
  const pub = path.join(root, 'public');

  // Countries: start from 110m (already light), simplify a bit more.
  const countriesPath = path.join(pub, 'geodata', 'countries-110m.json');
  const countriesRaw = await readJSON(countriesPath);
  const countriesFeat = toFeatureArray(countriesRaw, ['countries', 'admin0', 'ne_110m_admin_0']);
  const countriesTopo = topology({ countries: { type: 'FeatureCollection', features: countriesFeat } });
  presimplify(countriesTopo);
  const cThreshold = quantile(countriesTopo, 0.35); // moderate simplification
  simplify(countriesTopo, cThreshold);
  await writeJSON(path.join(pub, 'atlas', 'simplified-countries-topo.json'), countriesTopo);
  const countriesFC = topojsonFeature(countriesTopo, countriesTopo.objects.countries);
  await writeJSON(path.join(pub, 'atlas', 'simplified-countries.geojson'), countriesFC);

  // Urban: start from 50m urban areas, simplify more aggressively.
  const urbanPath = path.join(pub, 'atlas', 'ne_50m_urban_areas.geojson');
  const urbanGeo = await readJSON(urbanPath);
  const urbanFeat = toFeatureArray(urbanGeo, ['urban']); // likely already FC
  const urbanTopo = topology({ urban: { type: 'FeatureCollection', features: urbanFeat } });
  presimplify(urbanTopo);
  const uThreshold = quantile(urbanTopo, 0.55); // stronger simplification to lighten lines
  simplify(urbanTopo, uThreshold);
  await writeJSON(path.join(pub, 'atlas', 'simplified-urban-topo.json'), urbanTopo);
  const urbanFC = topojsonFeature(urbanTopo, urbanTopo.objects.urban);
  await writeJSON(path.join(pub, 'atlas', 'simplified-urban.geojson'), urbanFC);
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
