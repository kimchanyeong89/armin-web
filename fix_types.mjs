import fs from 'fs';

let t = fs.readFileSync('src/components/ExhibitionModal.tsx', 'utf8');
t = t.replace(/(\s*"sculptures": "Sculpture",\n)+/g, '\n    "sculptures": "Sculpture",\n');
t = t.replace(/(\s*"photography": "Photography",\n)+/g, '\n    "photography": "Photography",\n');
t = t.replace(/(\s*"posters": "Posters",\n)+/g, '\n    "posters": "Posters",\n');
fs.writeFileSync('src/components/ExhibitionModal.tsx', t);

let t2 = fs.readFileSync('src/components/InteractiveGlobeMap/InteractiveGlobeRealModal.tsx', 'utf8');
t2 = t2.replace(/(\s*'egyptian-museum-cairo-collection': '\/data\/egyptian-museum-cairo-collection\.json',\n)+/g, "\n          'egyptian-museum-cairo-collection': '/data/egyptian-museum-cairo-collection.json',\n");
t2 = t2.replace(/(\s*'conde-paintings': '\/data\/musee-conde-collection\.json',\n)+/g, "\n          'conde-paintings': '/data/musee-conde-collection.json',\n");
fs.writeFileSync('src/components/InteractiveGlobeMap/InteractiveGlobeRealModal.tsx', t2);

console.log("Fixed duplicates!");