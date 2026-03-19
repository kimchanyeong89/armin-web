const fs = require('fs');
let combined = JSON.parse(fs.readFileSync('public/data/mam-collection.json', 'utf8'));
let ptg = JSON.parse(fs.readFileSync('public/data/mam-painting-collection.json', 'utf8')).objects || [];
let mapped = new Set(combined.map(i => i.title));
let diff = ptg.filter(i => false === mapped.has(i.title));
console.log('Missed:', diff.length);
