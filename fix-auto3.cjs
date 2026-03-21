const fs = require('fs');

async function run() {
  const { exhibitions: museums } = await import('./src/data/exhibitions.js');

  const fileText = fs.readFileSync('./src/data/exhibitions.js', 'utf8');
  let newFileText = fileText;

  const toMap = {
    'musee-carnavalet': 'carnavalet-collection.json',
    'met-ny': 'met-ny-on-view-paintings.json',
    // what is the ID for museum wales? "national-museum-wales"
    'national-museum-wales': 'museum-wales-art.json',
    'national-gallery-london': 'national-gallery-exhibitions.json',
    'nmec': 'nmec-collection.json',
    'palais-de-tokyo': 'palais-de-tokyo-collection.json',
    'serpentine-gallery': 'serpentine-gallery-collection.json',
    'smithsonian-nasm': 'si-nasm.json',
    'tate-liverpool': 'tate-liverpool.json',
    'zeitz-mocaa': 'zeitz-mocaa-collection.json'
  };

  const missingFromUI = {
    'guggenheim-ny': 'guggenheim-ny-collection.json',
    'met-ny-enriched': 'met-ny-on-view-paintings-enriched.json',
  };

  for (const [id, file] of Object.entries(toMap)) {
    const museum = museums.find(m => m.id === id);
    if (museum) {
       console.log("Found museum in UI:", id);
       // Just blindly string replace its first permanent exhibition
       const regexStr = `id:\\s*["']${id}["'][^]*?permanentExhibitions:\\s*\\[\\s*\\{[^]*?\\}`;
       const regex = new RegExp(regexStr, 'm');
       const match = newFileText.match(regex);
       if (match) {
           let block = match[0];
           if (block.includes('collectionFile:')) {
               block = block.replace(/collectionFile:\s*["'][^"']+["']/, `collectionFile: "${file}"`);
           } else {
               block = block.replace(/\}$/, `, collectionFile: "${file}" }`);
           }
           newFileText = newFileText.replace(match[0], block);
       } else {
           console.log("Could not match regex for", id);
       }
    } else {
       console.log("Not found in UI, cannot update dynamically:", id);
    }
  }

  // Inject completely missing ones
  let extraBlock = "  /* INJECTED MISSING */\n";
  for (const [id, file] of Object.entries(missingFromUI)) {
      extraBlock += `  {
    id: "${id}",
    slug: "${id}",
    name: "Hidden - ${id}",
    country: "Various",
    city: "Various",
    location: "Various",
    representativeImage: "",
    permanentExhibitions: [
      { id: "${id}-collection", name: "${id}", title: "${id}", startDate: "Permanent", endDate: "Permanent", collectionFile: "${file}" }
    ],
    temporaryExhibitions: []
  },
`;
  }
  
  newFileText = newFileText.replace('];', extraBlock + '];');

  fs.writeFileSync('./src/data/exhibitions.js', newFileText, 'utf8');
}
run();