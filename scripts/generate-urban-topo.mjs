#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { topology } from 'topojson-server';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const root = path.resolve(__dirname, '..');
  const geoPath = path.join(root, 'public', 'atlas', 'urban-areas.json');
  const topoPath = path.join(root, 'public', 'atlas', 'urban-areas-topo.json');

  try {
    const raw = await fs.readFile(geoPath, 'utf8');
    const geo = JSON.parse(raw);
    if (!geo || geo.type !== 'FeatureCollection' || !Array.isArray(geo.features)) {
      console.error('Invalid GeoJSON FeatureCollection:', geoPath);
      process.exit(1);
    }
    // Build a single TopoJSON object named 'urban'
    const topo = topology({ urban: geo });
    await fs.writeFile(topoPath, JSON.stringify(topo));
    console.log('Wrote', topoPath);
  } catch (err) {
    console.error('Failed to generate TopoJSON:', err);
    process.exit(1);
  }
}

main();
