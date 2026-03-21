const fs = require('fs');
const path = require('path');

async function run() {
  const { exhibitions: museums } = await import('./src/data/exhibitions.js');

  const fileText = fs.readFileSync('./src/data/exhibitions.js', 'utf8');
  let newFileText = fileText;

  // Let's get ALL json files from public/data, excluding backups and bad stuff
  const allFiles = fs.readdirSync('public/data').filter(f => 
    f.endsWith('.json') && 
    f !== 'artists-data.json' && 
    f !== 'artists-global.json' && 
    f !== 'search-index.json' && 
    !f.includes('gallery-collection.json') &&
    !f.includes('.backup') &&
    !f.includes('-status') &&
    !f.includes('-failures') &&
    !f.includes('-codes') &&
    !f.includes('-counts') &&
    !f.includes('image-connectivity') &&
    !f.includes('search-index-part-') &&
    f !== 'search-manifest.json' &&
    f !== 'search-warm-prefix.json' &&
    f !== 'valid-artists.json' &&
    f !== 'video-embed-ids.json' &&
    f !== 'webp-size-estimate.json'
  );
  
  // Create a mapping dynamically from what's loaded
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
  
  // Exclude uffizi because it's manually correctly linked
  mappedFiles.add('uffizi-collection.json');

  const missingFiles = allFiles.filter(f => !mappedFiles.has(f));
  
  // Let's just remove the previous block if we injected it.
  const idx = newFileText.indexOf('/* INJECTED MISSING FILES */');
  if (idx !== -1) {
     // go back to the previous "}," array element end
     let temp = newFileText.substring(0, idx);
     // find last "},"
     let lastBrace = temp.lastIndexOf('},');
     if (lastBrace !== -1) {
         newFileText = temp.substring(0, lastBrace + 1) + "\n];\n";
     }
  }

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
  console.log("Successfully cleaned and injected missing files.");
}
run();