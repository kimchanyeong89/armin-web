const fs = require('fs');
const path = require('path');

const museumsFile = fs.readFileSync('src/data/museums.ts', 'utf-8');
const artworksFile = fs.readFileSync('src/data/artworks.ts', 'utf-8');

// Find all datasets imported in artworks.ts
const datasetRegex = /import\s+(\w+)\s+from\s+['"]\.\.\/\.\.\/public\/data\/([^'"]+\.json)['"]/g;
let match;
const datasets = {};

while ((match = datasetRegex.exec(artworksFile)) !== null) {
  datasets[match[2]] = match[1];
}

console.log("Found datasets in artworks.ts:", Object.keys(datasets).length);
