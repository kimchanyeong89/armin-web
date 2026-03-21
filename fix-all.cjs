const fs = require('fs');
const path = require('path');

async function run() {
  const { exhibitions: museums } = await import('./src/data/exhibitions.js');

  const fileText = fs.readFileSync('./src/data/exhibitions.js', 'utf8');
  let newFileText = fileText;

  // 1. Fix known mismappings first directly in text
  newFileText = newFileText.replace(/collectionFile:\s*["']uffizi-gallery-collection.json["']/, 'collectionFile: "uffizi-collection.json"');

  // Let's get ALL json files from public/data
  const allFiles = fs.readdirSync('public/data').filter(f => f.endsWith('.json') && f !== 'artists-data.json' && f !== 'artists-global.json' && f !== 'search-index.json' && !f.includes('gallery-collection.json'));
  
  // Create a mapping dynamically from what's loaded
  // To avoid reloading we just parse text
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
  
  // We added uffizi manually so fake it here
  mappedFiles.add('uffizi-collection.json');

  const missingFiles = allFiles.filter(f => !mappedFiles.has(f));
  console.log("Missing files:", missingFiles);

  // Inject completely missing ones
  let extraBlock = "  /* INJECTED MISSING FILES */\n";
  for (let i = 0; i < missingFiles.length; i++) {
      const file = missingFiles[i];
      const id = file.replace('.json', '');
      const isLast = (i === missingFiles.length - 1);
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
  }${isLast ? '' : ','}\n`;
  }
  
  // Append safely
  newFileText = newFileText.replace(/}[ \t\n\r]*\];/, '},\n' + extraBlock + '];\n');

  fs.writeFileSync('./src/data/exhibitions.js', newFileText, 'utf8');
  console.log("Successfully injected missing files.");
}
run();