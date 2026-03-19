import fs from 'fs';
import path from 'path';

const dataDir = './public/data';
const artworksTs = fs.readFileSync('./src/data/artworks.ts', 'utf8');

const regex = /import\s+\w+\s+from\s+["']\.\.\/\.\.\/public\/data\/([^"']+\.json)["']/g;
const mappedFiles = new Set();
let match;
while ((match = regex.exec(artworksTs)) !== null) {
    mappedFiles.add(match[1]);
}

const allJson = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));

console.log("Mapped in artworks.ts for modals (samples):");
const targets = ["agnsw", "lacma", "belvedere", "ateneum"];
for (const file of allJson) {
     if (targets.some(t => file.toLowerCase().includes(t))) {
         console.log(file, "->", mappedFiles.has(file) ? "MAPPED TO MODAL" : "NOT MAPPED");
     }
}
