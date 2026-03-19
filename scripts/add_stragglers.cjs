const extras = [
  {
    id: "stragglers",
    slug: "stragglers",
    name: "Additional Collections & Branches",
    location: "Global",
    description: "Various minor collections and branch locations.",
    latitude: 0,
    longitude: 0,
    country: "Various",
    region: "Global",
    representativeImage: "",
    permanentExhibitions: [
      { id: "tate-st-ives-art", name: "Tate St Ives Artworks", title: "Tate", startDate: "Permanent", endDate: "Permanent", collectionFile: "tate-st-ives-artworks.json" },
      { id: "kim-tschang-yeul", name: "Jeju Kim Tschang-Yeul Museum", title: "Kim Tschang-Yeul", startDate: "Permanent", endDate: "Permanent", collectionFile: "kim-tschang-yeul-collection.json" },
      { id: "musee-granet", name: "Musée Granet", title: "Granet", startDate: "Permanent", endDate: "Permanent", collectionFile: "musee-granet-collection.json" },
      { id: "tate-modern-extra", name: "Tate Modern", title: "Tate Modern", startDate: "Permanent", endDate: "Permanent", collectionFile: "tate-modern.json" },
      { id: "banrep", name: "Banco de la República", title: "BanRep", startDate: "Permanent", endDate: "Permanent", collectionFile: "banrep-collection.json" },
      { id: "tate-britain-extra", name: "Tate Britain", title: "Tate Britain", startDate: "Permanent", endDate: "Permanent", collectionFile: "tate-britain.json" },
      { id: "nmec", name: "NMEC Collection", title: "NMEC", startDate: "Permanent", endDate: "Permanent", collectionFile: "nmec-collection.json" },
      { id: "vam-base", name: "V&A Base", title: "VAM", startDate: "Permanent", endDate: "Permanent", collectionFile: "vam.json" },
      { id: "tate-st-ives-base", name: "Tate St Ives Base", title: "Tate", startDate: "Permanent", endDate: "Permanent", collectionFile: "tate-st-ives.json" },
      { id: "ngv-trove", name: "NGV Trove Fixed", title: "NGV", startDate: "Permanent", endDate: "Permanent", collectionFile: "ngv-trove-collection-fixed.json" },
      { id: "tate-liverpool", name: "Tate Liverpool", title: "Tate Liverpool", startDate: "Permanent", endDate: "Permanent", collectionFile: "tate-liverpool.json" },
      { id: "zeitz", name: "Zeitz MOCAA", title: "Zeitz", startDate: "Permanent", endDate: "Permanent", collectionFile: "zeitz-mocaa-collection.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  }
];

const fs = require('fs');
let fileContent = fs.readFileSync('src/data/exhibitions.js', 'utf8');
const searchPos = fileContent.lastIndexOf('];');

if (searchPos !== -1) {
  let museumsBlock = extras.map(mus => JSON.stringify(mus, null, 2).replace(/"([^"]+)":/g, '$1:')).join(',\n  ');
  let newContent = fileContent.slice(0, searchPos) + ',\n  ' + museumsBlock + '\n];\n';
  fs.writeFileSync('src/data/exhibitions.js', newContent);
  console.log('Successfully injected the final straggler museums!');
}
