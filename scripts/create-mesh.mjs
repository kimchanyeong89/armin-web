import fs from 'fs';
import * as topojson from 'topojson-server';
import * as topojsonClient from 'topojson-client';

const geojson = JSON.parse(fs.readFileSync('public/atlas/temp-10m-1pct.geojson', 'utf8'));
const topology = topojson.topology({ states: geojson });
const mesh = topojsonClient.mesh(topology, topology.objects.states, (a, b) => a !== b);
const output = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: mesh }] };
fs.writeFileSync('public/atlas/simplified-admin1-10m-1pct-mesh.topo.json', JSON.stringify(topojson.topology({ mesh: mesh })));
fs.writeFileSync('public/atlas/simplified-admin1-10m-1pct-mesh.geojson', JSON.stringify(output));