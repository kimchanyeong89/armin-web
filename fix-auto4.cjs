const fs = require('fs');
const path = require('path');

async function run() {
  const { exhibitions: museums } = await import('./src/data/exhibitions.js');

  const fileText = fs.readFileSync('./src/data/exhibitions.js', 'utf8');
  let newFileText = fileText;

  // Let's get ALL json files from public/data
  const allFiles = fs.readdirSync('public/data').filter(f => f.endsWith('.json') && f !== 'artists-data.json' && f !== 'artists-global.json' && f !== 'search-index.json');
  
  // Collect all mapped files
  const mappedFiles = new Set();
  const extractCollectionFiles = (exhibitions) => {
    exhibitions.forEach(exh => {
      if (exh.permanentExhibitions) {
        exh.permanentExhibitions.forEach(p => {
          if (p.collectionFile) mappedFiles.add(p.collectionFile);
        });
      }
      if (exh.temporaryExhibitions) {
        exh.temporaryExhibitions.forEach(t => {
          if (t.collectionFile) mappedFiles.add(t.collectionFile);
        });
      }
    });
  };
  extractCollectionFiles(museums);
  
  const missingFiles = allFiles.filter(f => !mappedFiles.has(f));
  
  // Inject completely missing ones
  let extraBlock = "\n  /* INJECTED MISSING FILES */\n";
  for (const file of missingFiles) {
      const id = file.replace('.json', '');
      extraBlock += `  {
    id: "hidden-${id}",
    slug: "hidden-${id}",
    name: "Hidden - ${id}",
    country: "Various",
    city: "Various",
    location: "Various",
    representativeImage: "",
    permanentExhibitions: [
      { id: "collection-${id}", name: "${id}", title: "${id}", startDate: "Permanent", endDate: "Permanent", collectionFile: "${file}" }
    ],
    temporaryExhibitions: []
  },
`;
  }
  
  newFileText = newFileText.replace('];', extraBlock + '];\n');

  fs.writeFileSync('./src/data/exhibitions.js', newFileText, 'utf8');
  console.log("Injected missing files: ", missingFiles.length);
}
run();