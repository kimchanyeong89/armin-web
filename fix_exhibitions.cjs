const fs = require('fs');

let content = fs.readFileSync('src/data/exhibitions.js', 'utf8');

const replacements = [
    { from: /id: "lyon-collection", name: "Musée des Beaux-Arts de Lyon Collection"/g, to: 'id: "lyon-collection", name: "Musée des Beaux-Arts de Lyon Collection", collectionFile: "mba-lyon-collection.json"' },
    { from: /id: "granet-collection", name: "Musée Granet Collection"/g, to: 'id: "granet-collection", name: "Musée Granet Collection", collectionFile: "musee-granet-collection.json"' },
    { from: /id: "jacquemart-collection", name: "Musée Jacquemart-André Must-See Works"/g, to: 'id: "jacquemart-collection", name: "Musée Jacquemart-André Must-See Works", collectionFile: "jacquemart-andre-collection.json"' },
    { from: /id: "dpg-1", name: "The Collection", title: "The Collection"/g, to: 'id: "dpg-1", name: "The Collection", title: "The Collection", collectionFile: "dulwich-collection.json"' },
    { from: /id: "ng-1", name: "European Paintings", title: "European Paintings"/g, to: 'id: "ng-1", name: "European Paintings", title: "European Paintings", collectionFile: "national-gallery-permanent.json"' },
    { from: /id: "tsi-perm-1", name: "Tate St Ives Collection"/g, to: 'id: "tsi-perm-1", name: "Tate St Ives Collection", collectionFile: "tate-st-ives.json"' },
    { from: /id: "tm-perm-3", name: "Tate Collection", title: "Tate Collection"/g, to: 'id: "tm-perm-3", name: "Tate Collection", title: "Tate Collection", collectionFile: "tate-modern.json"' },
    { from: /id: "orsay-1", name: "Musée d'Orsay Collection"/g, to: 'id: "orsay-1", name: "Musée d\'Orsay Collection", collectionFile: "orsay-collection.json"'}
];

replacements.forEach(r => {
    content = content.replace(r.from, r.to);
});

fs.writeFileSync('src/data/exhibitions.js', content);
